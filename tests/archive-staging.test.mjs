import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const codecSource = await readFile(new URL('../js/paseka-archive.js', import.meta.url), 'utf8');
const shaSource = await readFile(new URL('../js/paseka-sha256.js', import.meta.url), 'utf8');
const restoreSource = await readFile(new URL('../js/paseka-archive-restore.js', import.meta.url), 'utf8');
new Function(shaSource)();
new Function(codecSource)();
new Function(restoreSource)();
const Archive = globalThis.PasekaArchive;
const Restore = globalThis.PasekaArchiveRestore;

function openTestDb(name, factory = new IDBFactory()) {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => {
      const main = request.result.createObjectStore('main');
      request.result.createObjectStore('full_backup');
      request.result.createObjectStore('entrance_media', { keyPath: 'id' });
      const staging = request.result.createObjectStore('archive_staging', { keyPath: 'id' });
      staging.createIndex('sessionId', 'sessionId', { unique: false });
      staging.createIndex('kind', 'kind', { unique: false });
      staging.createIndex('backupId', 'backupId', { unique: true });
      request.result.createObjectStore('archive_history', { keyPath: 'backupId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function put(db, storeName, value, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const request = key === undefined
      ? tx.objectStore(storeName).put(value)
      : tx.objectStore(storeName).put(value, key);
    request.onerror = () => reject(request.error || new Error('IndexedDB put failed.'));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed.'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted.'));
  });
}
function get(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function getAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}
function stateFixture(note = 'archive state') {
  return {
    meta: { schemaVersion: 12, revisionId: 'archive-revision' },
    hives: [{ id: 'hive-1', number: 1 }],
    families: [],
    records: [{ id: 'record-1', note }],
    snapshots: []
  };
}
function videoFixture() {
  const blob = new Blob([new Uint8Array([10, 20, 30, 40])], { type: 'video/mp4' });
  return {
    id: 'video-1', hiveId: 'hive-1', capturedAt: '2026-11-14T09:00:00.000Z',
    durationSec: 45, width: 1280, height: 720, bytes: blob.size,
    mimeType: 'video/mp4', name: 'entrance.mp4', status: 'waiting_for_server',
    queueCreatedAt: '2026-11-14T09:00:00.000Z', retryCount: 0, blob
  };
}
async function makeArchive(backupId, note = 'archive state', videoHiveId = 'hive-1') {
  const stateBlob = new Blob([JSON.stringify({ app: 'Paseka', state: stateFixture(note) })], { type: 'application/json' });
  const video = videoFixture();
  const manifest = {
    format: Archive.FORMAT,
    version: Archive.VERSION,
    backupId,
    createdAt: '2026-11-14T09:05:00.000Z',
    schemaVersion: 12,
    entries: [
      {
        path: 'state.json', kind: 'state', size: stateBlob.size,
        mimeType: 'application/json', chunkSize: Archive.CHUNK_BYTES,
        chunkSha256: await Archive.hashBlobChunks(stateBlob, webcrypto)
      },
      {
        path: 'entrance-media/000001.blob', kind: 'entrance_video', size: video.blob.size,
        mimeType: 'video/mp4', chunkSize: Archive.CHUNK_BYTES,
        chunkSha256: await Archive.hashBlobChunks(video.blob, webcrypto),
        metadata: {
          id: video.id, hiveId: videoHiveId, capturedAt: video.capturedAt,
          durationSec: video.durationSec, width: video.width, height: video.height,
          bytes: video.bytes, mimeType: video.mimeType, name: video.name,
          status: video.status, queueCreatedAt: video.queueCreatedAt, retryCount: 0
        }
      }
    ]
  };
  return Archive.buildArchiveBlob(manifest, [stateBlob, video.blob]);
}

test('archive import stages verified state and video without touching live data', async () => {
  const db = await openTestDb('paseka-stage-safe');
  const oldState = { meta: { schemaVersion: 12, revisionId: 'live-revision' }, hives: [], families: [], records: [] };
  const oldVideo = { id: 'live-video', hiveId: 'old-hive', blob: new Blob(['old'], { type: 'video/mp4' }) };
  await put(db, 'main', oldState, 'state');
  await put(db, 'entrance_media', oldVideo);

  const archive = await makeArchive('backup-stage-1');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, state => {
    assert.equal(state.hives[0].id, 'hive-1');
    return true;
  });
  assert.equal(staged.alreadyStaged, false);
  assert.equal(staged.session.status, 'ready');
  assert.equal(staged.session.stagedCount, 2);

  const contents = await Restore.getStagedArchive(db, staged.session.sessionId, webcrypto, Archive, () => true);
  assert.equal(contents.state.records[0].note, 'archive state');
  assert.equal(contents.videos.length, 1);
  assert.equal(contents.videos[0].metadata.id, 'video-1');
  assert.equal(contents.videos[0].blob.size, 4);
  assert.equal(contents.videos[0].orphanedHiveReference, false);

  const sessions = await Restore.listArchiveRestoreSessions(db);
  assert.equal(sessions.length, 1);
  assert.equal((await get(db, 'main', 'state')).meta.revisionId, 'live-revision');
  assert.equal((await get(db, 'entrance_media', 'live-video')).id, 'live-video');

  assert.equal(await Restore.discardArchiveRestoreSession(db, staged.session.sessionId), true);
  assert.equal((await Restore.listArchiveRestoreSessions(db)).length, 0);
  assert.equal((await get(db, 'main', 'state')).meta.revisionId, 'live-revision');
  db.close();
});

test('orphaned staging rows are preserved when archive history still references the missing session header', async () => {
  const db = await openTestDb('paseka-stage-orphan-referenced');
  await put(db, 'main', { meta: { revisionId: 'live-orphan-guard' } }, 'state');
  const archive = await makeArchive('backup-orphan-referenced');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  const rowsBefore = (await getAll(db, 'archive_staging')).filter(row => row.sessionId === staged.session.sessionId);
  assert.ok(rowsBefore.length > 1);
  await put(db, 'archive_history', {
    backupId: 'history-orphan-reference',
    importSessionId: staged.session.sessionId
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction('archive_staging', 'readwrite');
    tx.objectStore('archive_staging').delete(staged.session.sessionId);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  await assert.rejects(
    Restore.discardArchiveRestoreSession(db, staged.session.sessionId),
    { code: 'ORPHANED_STAGING_REFERENCED' }
  );
  const rowsAfter = (await getAll(db, 'archive_staging')).filter(row => row.sessionId === staged.session.sessionId);
  assert.equal(rowsAfter.length, rowsBefore.length - 1);
  assert.equal((await get(db, 'main', 'state')).meta.revisionId, 'live-orphan-guard');
  db.close();
});

test('unreferenced orphan staging rows can be discarded repeatedly without touching live data', async () => {
  const db = await openTestDb('paseka-stage-orphan-unreferenced');
  await put(db, 'main', { meta: { revisionId: 'live-orphan-cleanup' } }, 'state');
  const archive = await makeArchive('backup-orphan-unreferenced');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  const rowsBefore = (await getAll(db, 'archive_staging')).filter(row => row.sessionId === staged.session.sessionId);
  assert.ok(rowsBefore.length > 1);
  await new Promise((resolve, reject) => {
    const tx = db.transaction('archive_staging', 'readwrite');
    tx.objectStore('archive_staging').delete(staged.session.sessionId);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  assert.equal(await Restore.discardArchiveRestoreSession(db, staged.session.sessionId), true);
  assert.equal(await Restore.discardArchiveRestoreSession(db, staged.session.sessionId), false);
  assert.equal((await getAll(db, 'archive_staging')).filter(row => row.sessionId === staged.session.sessionId).length, 0);
  assert.equal((await get(db, 'main', 'state')).meta.revisionId, 'live-orphan-cleanup');
  db.close();
});


test('archive staging is idempotent for the same verified backup and manifest', async () => {
  const db = await openTestDb('paseka-stage-repeat');
  const archive = await makeArchive('backup-repeat-1');
  const first = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  const second = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  assert.equal(second.alreadyStaged, true);
  assert.equal(second.session.sessionId, first.session.sessionId);
  assert.equal((await Restore.listArchiveRestoreSessions(db)).length, 1);
  db.close();
});

test('archive staging records interruption and blocks unsafe reuse until discarded', async () => {
  const db = await openTestDb('paseka-stage-interrupted');
  const archive = await makeArchive('backup-interrupted-1');
  await assert.rejects(
    Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true, {
      onProgress: () => { throw new Error('simulated interruption'); }
    }),
    /simulated interruption/
  );
  const [session] = await Restore.listArchiveRestoreSessions(db);
  assert.equal(session.status, 'failed');
  assert.equal(session.stagedCount, 2);
  await assert.rejects(
    Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true),
    { code: 'INCOMPLETE_STAGING_EXISTS' }
  );
  assert.equal(await Restore.discardArchiveRestoreSession(db, session.sessionId), true);
  db.close();
});

test('archive staging detects a reused backup ID with different payload checksums', async () => {
  const db = await openTestDb('paseka-stage-collision');
  const first = await makeArchive('backup-collision-1', 'first');
  const second = await makeArchive('backup-collision-1', 'different');
  await Restore.stageArchiveForRestore(db, first, webcrypto, Archive, () => true);
  await assert.rejects(
    Restore.stageArchiveForRestore(db, second, webcrypto, Archive, () => true),
    { code: 'BACKUP_ID_COLLISION' }
  );
  db.close();
});

test('archive staging refuses a database without the dedicated staging stores', async () => {
  const db = await openTestDb('paseka-stage-missing-stores');
  const archive = await makeArchive('backup-no-store');
  const oldDb = await openTestDb('paseka-stage-dummy');
  oldDb.close();
  await assert.rejects(
    Restore.stageArchiveForRestore({ objectStoreNames: { contains: () => false } }, archive, webcrypto, Archive, () => true),
    { code: 'ARCHIVE_STAGING_UNAVAILABLE' }
  );
  db.close();
});


test('concurrent attempts cannot create duplicate staging sessions for one backup ID', async () => {
  const db = await openTestDb('paseka-stage-concurrent');
  const archive = await makeArchive('backup-concurrent-1');
  const results = await Promise.allSettled([
    Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true),
    Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true)
  ]);
  const fulfilled = results.filter(result => result.status === 'fulfilled');
  assert.ok(fulfilled.length === 1 || fulfilled.length === 2);
  assert.equal(fulfilled.filter(result => !result.value.alreadyStaged).length, 1);
  assert.equal(fulfilled.filter(result => result.value.alreadyStaged).length + results.filter(result => result.status === 'rejected').length, 1);
  const rejected = results.find(result => result.status === 'rejected');
  if (rejected) assert.ok(rejected.reason instanceof Error);
  assert.equal((await Restore.listArchiveRestoreSessions(db)).length, 1);
  db.close();
});

test('unique backup ID index prevents duplicate staging session records', async () => {
  const db = await openTestDb('paseka-stage-unique-index');
  await put(db, 'archive_staging', { id: 'session-one', sessionId: 'session-one', kind: 'session', backupId: 'same-backup' });
  await assert.rejects(
    put(db, 'archive_staging', { id: 'session-two', sessionId: 'session-two', kind: 'session', backupId: 'same-backup' }),
    error => error && error.name === 'ConstraintError'
  );
  db.close();
});


test('staged state corruption is rejected before restore and preserves the live journal', async () => {
  const db = await openTestDb('paseka-stage-state-tamper');
  const liveState = { meta: { schemaVersion: 12, revisionId: 'live-before-state-tamper' }, hives: [], families: [], records: [] };
  await put(db, 'main', liveState, 'state');
  const archive = await makeArchive('backup-stage-state-tamper');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  const record = await get(db, 'archive_staging', staged.session.sessionId + ':state');
  const bytes = new Uint8Array(await record.blob.arrayBuffer());
  bytes[bytes.length - 2] ^= 0x01;
  record.blob = new Blob([bytes], { type: 'application/json' });
  await put(db, 'archive_staging', record);
  await assert.rejects(
    Restore.getStagedArchive(db, staged.session.sessionId, webcrypto, Archive, () => true),
    { code: 'STAGING_CHECKSUM_MISMATCH' }
  );
  assert.equal((await get(db, 'main', 'state')).meta.revisionId, 'live-before-state-tamper');
  db.close();
});


test('missing staged video is rejected before restore and preserves the live journal', async () => {
  const db = await openTestDb('paseka-stage-missing-video');
  const liveState = { meta: { schemaVersion: 12, revisionId: 'live-before-missing-video' }, hives: [], families: [], records: [] };
  await put(db, 'main', liveState, 'state');
  const archive = await makeArchive('backup-stage-missing-video');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  await new Promise((resolve, reject) => {
    const tx = db.transaction('archive_staging', 'readwrite');
    const request = tx.objectStore('archive_staging').delete(staged.session.sessionId + ':video:video-1');
    request.onerror = () => reject(request.error);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  await assert.rejects(
    Restore.getStagedArchive(db, staged.session.sessionId, webcrypto, Archive, () => true),
    { code: 'STAGING_ENTRY_SET_INVALID' }
  );
  assert.equal((await get(db, 'main', 'state')).meta.revisionId, 'live-before-missing-video');
  db.close();
});


test('staged archive rejects unknown extra entry kinds', async () => {
  const db = await openTestDb('paseka-stage-unknown-entry');
  const archive = await makeArchive('backup-stage-unknown-entry');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  await put(db, 'archive_staging', {
    id: staged.session.sessionId + ':unexpected',
    sessionId: staged.session.sessionId,
    kind: 'unexpected',
    size: 1,
    chunkSha256: ['0'.repeat(64)],
    stagingRevision: staged.session.stagingEpoch,
    blob: new Blob(['x'])
  });
  await assert.rejects(
    Restore.getStagedArchive(db, staged.session.sessionId, webcrypto, Archive, () => true),
    { code: 'STAGING_ENTRY_SET_INVALID' }
  );
  db.close();
});


test('staged archive rejects duplicate video rows that omit a manifest video', async () => {
  const db = await openTestDb('paseka-stage-duplicate-video');
  const initialArchive = await makeArchive('backup-stage-duplicate-video');
  const checked = await Archive.validateArchiveForRestore(initialArchive, webcrypto, () => true);
  const firstVideo = checked.videoEntries[0];
  const secondBlob = new Blob([new Uint8Array([51, 52, 53, 54, 55])], { type: 'video/mp4' });
  const secondMetadata = { ...firstVideo.metadata, id: 'video-2', name: 'entrance-2.mp4', bytes: secondBlob.size };
  const secondEntry = {
    path: 'entrance-media/000002.blob',
    kind: 'entrance_video',
    size: secondBlob.size,
    mimeType: secondBlob.type,
    chunkSize: firstVideo.chunkSize,
    metadata: secondMetadata,
    chunkSha256: await Archive.hashBlobChunks(secondBlob, webcrypto)
  };
  const manifest = {
    ...checked.manifest,
    entries: [...checked.manifest.entries, secondEntry]
  };
  const archive = Archive.buildArchiveBlob(manifest, [checked.stateBlob, firstVideo.blob, secondBlob]);
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  const firstRecord = await get(db, 'archive_staging', staged.session.sessionId + ':video:video-1');
  await new Promise((resolve, reject) => {
    const tx = db.transaction('archive_staging', 'readwrite');
    const store = tx.objectStore('archive_staging');
    store.delete(staged.session.sessionId + ':video:video-2');
    store.put({ ...firstRecord, id: staged.session.sessionId + ':video:video-duplicate' });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  await assert.rejects(
    Restore.getStagedArchive(db, staged.session.sessionId, webcrypto, Archive, () => true),
    { code: 'STAGING_VIDEO_MANIFEST_MISMATCH' }
  );
  db.close();
});




test('staged archive checksums are reverified before staged content is returned', async () => {
  const db = await openTestDb('paseka-stage-tamper');
  const archive = await makeArchive('backup-stage-tamper');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  const tx = db.transaction('archive_staging', 'readwrite');
  const store = tx.objectStore('archive_staging');
  const record = await new Promise((resolve, reject) => {
    const request = store.get(staged.session.sessionId + ':video:video-1');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  record.blob = new Blob([new Uint8Array([99, 20, 30, 40])], { type: 'video/mp4' });
  store.put(record);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  await assert.rejects(
    Restore.getStagedArchive(db, staged.session.sessionId, webcrypto, Archive, () => true),
    { code: 'STAGING_CHECKSUM_MISMATCH' }
  );
  db.close();
});


test('invalid archive is rejected before any staging session is created', async () => {
  const db = await openTestDb('paseka-stage-invalid-input');
  const archive = await makeArchive('backup-invalid-input');
  const bytes = new Uint8Array(await archive.arrayBuffer());
  bytes[bytes.length - 1] ^= 0xff;
  await assert.rejects(
    Restore.stageArchiveForRestore(db, new Blob([bytes]), webcrypto, Archive, () => true),
    { code: 'CHECKSUM_MISMATCH' }
  );
  assert.equal((await Restore.listArchiveRestoreSessions(db)).length, 0);
  db.close();
});


test('staged manifest metadata is rechecked against its stored fingerprint', async () => {
  const db = await openTestDb('paseka-stage-manifest-tamper');
  const archive = await makeArchive('backup-stage-manifest-tamper');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  const session = await get(db, 'archive_staging', staged.session.sessionId);
  session.manifest.schemaVersion = 11;
  await put(db, 'archive_staging', session);
  await assert.rejects(
    Restore.getStagedArchive(db, staged.session.sessionId, webcrypto, Archive, () => true),
    { code: 'STAGING_MANIFEST_MISMATCH' }
  );
  db.close();
});


test('atomic archive commit replaces state and entrance videos while preserving rollback data', async () => {
  const db = await openTestDb('paseka-stage-atomic-commit');
  const oldState = { meta: { schemaVersion: 12, revisionId: 'live-revision' }, hives: [], families: [], records: [], auditLog: [] };
  const oldVideoBlob = new Blob(['old entrance video'], { type: 'video/mp4' });
  await put(db, 'main', oldState, 'state');
  await put(db, 'entrance_media', {
    id: 'live-video', hiveId: 'old-hive', capturedAt: '2026-11-13T09:00:00.000Z',
    durationSec: 10, width: 640, height: 480, bytes: oldVideoBlob.size,
    mimeType: 'video/mp4', name: 'old.mp4', status: 'waiting_for_server', blob: oldVideoBlob
  });

  const archive = await makeArchive('backup-atomic-commit');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  const committed = await Restore.commitStagedArchive(
    db, staged.session.sessionId, 'live-revision', webcrypto, Archive, () => true,
    async state => ({ ...state, migratedForTest: true })
  );
  assert.equal(committed.importedVideoCount, 1);
  assert.equal(committed.orphanedVideoCount, 0);

  const currentState = await get(db, 'main', 'state');
  const currentVideos = await getAll(db, 'entrance_media');
  const previousState = await get(db, 'full_backup', 'previous');
  const history = await get(db, 'archive_history', 'backup-atomic-commit');
  const committedSession = await get(db, 'archive_staging', staged.session.sessionId);
  const rollbackSession = await get(db, 'archive_staging', committed.rollbackSessionId);
  const rollbackState = await get(db, 'archive_staging', committed.rollbackSessionId + ':state');
  const rollbackVideo = await get(db, 'archive_staging', committed.rollbackSessionId + ':video:live-video');

  assert.equal(currentState.records[0].note, 'archive state');
  assert.equal(currentState.migratedForTest, true);
  assert.notEqual(currentState.meta.revisionId, 'archive-revision');
  assert.equal(currentState.auditLog.at(-1).source, 'full_archive');
  assert.equal(currentVideos.length, 1);
  assert.equal(currentVideos[0].id, 'video-1');
  assert.equal(currentVideos[0].blob.size, 4);
  assert.equal(previousState.state.meta.revisionId, 'live-revision');
  assert.equal(history.status, 'committed');
  assert.equal(history.videoCount, 1);
  assert.equal(history.orphanedVideoCount, 0);
  assert.equal(history.rollbackSessionId, committed.rollbackSessionId);
  const historyList = await Restore.listArchiveImportHistory(db);
  assert.equal(historyList[0].backupId, 'backup-atomic-commit');
  assert.equal(historyList[0].status, 'committed');
  assert.equal(committedSession.status, 'committed');
  const retainedStageRows = (await getAll(db, 'archive_staging')).filter(record => record.sessionId === staged.session.sessionId);
  assert.equal(retainedStageRows.length, 1);
  assert.equal(retainedStageRows[0].kind, 'session');
  assert.equal(rollbackSession.kind, 'rollback_session');
  assert.equal(rollbackState.state.meta.revisionId, 'live-revision');
  assert.equal(rollbackVideo.record.id, 'live-video');
  assert.equal(rollbackVideo.record.blob.size, oldVideoBlob.size);

  await assert.rejects(
    Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true),
    { code: 'ALREADY_IMPORTED' }
  );
  await assert.rejects(
    Restore.discardArchiveRestoreSession(db, staged.session.sessionId),
    { code: 'COMMITTED_IMPORT_PROTECTED' }
  );
  await assert.rejects(
    Restore.discardArchiveRestoreSession(db, committed.rollbackSessionId),
    { code: 'ROLLBACK_SNAPSHOT_PROTECTED' }
  );
  const cleanup = await Restore.discardArchiveRollbackSnapshot(db, 'backup-atomic-commit');
  assert.equal(cleanup.deletedRecords, 3);
  const cleanedHistory = await get(db, 'archive_history', 'backup-atomic-commit');
  assert.equal(cleanedHistory.rollbackSessionId, null);
  assert.equal(cleanedHistory.rollbackAvailable, false);
  await assert.rejects(
    Restore.rollbackCommittedArchive(db, 'backup-atomic-commit', currentState.meta.revisionId, webcrypto, () => true),
    { code: 'ROLLBACK_NOT_AVAILABLE' }
  );
  db.close();
});

test('atomic archive commit refuses a stale live revision without changing state or media', async () => {
  const db = await openTestDb('paseka-stage-stale-commit');
  const oldState = { meta: { schemaVersion: 12, revisionId: 'live-revision' }, hives: [], families: [], records: [] };
  const oldVideo = { id: 'live-video', hiveId: 'old-hive', blob: new Blob(['old'], { type: 'video/mp4' }) };
  await put(db, 'main', oldState, 'state');
  await put(db, 'entrance_media', oldVideo);
  const archive = await makeArchive('backup-stale-commit');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);

  await assert.rejects(
    Restore.commitStagedArchive(db, staged.session.sessionId, 'stale-revision', webcrypto, Archive, () => true),
    { code: 'RESTORE_CONFLICT' }
  );
  assert.equal((await get(db, 'main', 'state')).meta.revisionId, 'live-revision');
  assert.equal((await getAll(db, 'entrance_media')).length, 1);
  assert.equal((await get(db, 'entrance_media', 'live-video')).id, 'live-video');
  assert.equal(await get(db, 'archive_history', 'backup-stale-commit'), undefined);
  assert.equal((await get(db, 'archive_staging', staged.session.sessionId)).status, 'ready');
  db.close();
});


test('atomic rollback restores previous state and videos and permits a later reimport', async () => {
  const db = await openTestDb('paseka-stage-atomic-rollback');
  const oldState = { meta: { schemaVersion: 12, revisionId: 'before-import' }, hives: [], families: [], records: [], auditLog: [] };
  const oldVideoBlob = new Blob(['previous media'], { type: 'video/mp4' });
  await put(db, 'main', oldState, 'state');
  await put(db, 'entrance_media', {
    id: 'previous-video', hiveId: 'old-hive', capturedAt: '2026-11-12T09:00:00.000Z',
    durationSec: 8, width: 640, height: 480, bytes: oldVideoBlob.size,
    mimeType: 'video/mp4', name: 'previous.mp4', status: 'waiting_for_server', blob: oldVideoBlob
  });
  const archive = await makeArchive('backup-atomic-rollback');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  const committed = await Restore.commitStagedArchive(db, staged.session.sessionId, 'before-import', webcrypto, Archive, () => true);

  const rolledBack = await Restore.rollbackCommittedArchive(
    db, 'backup-atomic-rollback', committed.state.meta.revisionId, webcrypto, () => true
  );
  assert.equal(rolledBack.rollbackSnapshotRemoved, true);
  const restoredState = await get(db, 'main', 'state');
  const restoredVideos = await getAll(db, 'entrance_media');
  const history = await get(db, 'archive_history', 'backup-atomic-rollback');
  const importSession = await get(db, 'archive_staging', staged.session.sessionId);
  const rollbackSession = await get(db, 'archive_staging', committed.rollbackSessionId);

  assert.equal(restoredState.records.length, 0);
  assert.notEqual(restoredState.meta.revisionId, 'before-import');
  assert.equal(restoredState.auditLog.at(-1).type, 'backup_rollback');
  assert.equal(restoredVideos.length, 1);
  assert.equal(restoredVideos[0].id, 'previous-video');
  assert.equal(restoredVideos[0].blob.size, oldVideoBlob.size);
  assert.equal(history.status, 'reverted');
  assert.equal(history.rollbackSessionId, null);
  assert.equal(history.rollbackAvailable, false);
  assert.equal(history.revertedRevisionId, rolledBack.state.meta.revisionId);
  assert.equal(importSession.status, 'reverted');
  assert.equal(importSession.backupId, undefined);
  assert.equal(rollbackSession, undefined);

  const restaged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  assert.equal(restaged.session.backupId, 'backup-atomic-rollback');
  const reimported = await Restore.commitStagedArchive(
    db, restaged.session.sessionId, rolledBack.state.meta.revisionId, webcrypto, Archive, () => true
  );
  const newHistory = await get(db, 'archive_history', 'backup-atomic-rollback');
  assert.equal(newHistory.status, 'committed');
  assert.equal(newHistory.rollbackSessionId, reimported.rollbackSessionId);
  assert.notEqual(newHistory.rollbackSessionId, committed.rollbackSessionId);
  assert.ok(await get(db, 'archive_staging', reimported.rollbackSessionId));
  db.close();
});

test('atomic rollback refuses a stale revision and preserves the imported state', async () => {
  const db = await openTestDb('paseka-stage-stale-rollback');
  const oldState = { meta: { schemaVersion: 12, revisionId: 'before-import' }, hives: [], families: [], records: [] };
  await put(db, 'main', oldState, 'state');
  const archive = await makeArchive('backup-stale-rollback');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  const committed = await Restore.commitStagedArchive(db, staged.session.sessionId, 'before-import', webcrypto, Archive, () => true);

  await assert.rejects(
    Restore.rollbackCommittedArchive(db, 'backup-stale-rollback', 'changed-after-import', webcrypto, () => true),
    { code: 'RESTORE_CONFLICT' }
  );
  assert.equal((await get(db, 'main', 'state')).meta.revisionId, committed.state.meta.revisionId);
  assert.equal((await get(db, 'archive_history', 'backup-stale-rollback')).status, 'committed');
  assert.equal((await get(db, 'archive_staging', committed.rollbackSessionId)).status, 'ready');
  db.close();
});


test('rollback snapshot cleanup refuses an incomplete snapshot without deleting it', async () => {
  const db = await openTestDb('paseka-stage-rollback-cleanup-tamper');
  const oldState = { meta: { schemaVersion: 12, revisionId: 'before-import' }, hives: [], families: [], records: [] };
  await put(db, 'main', oldState, 'state');
  const archive = await makeArchive('backup-rollback-cleanup-tamper');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  const committed = await Restore.commitStagedArchive(db, staged.session.sessionId, 'before-import', webcrypto, Archive, () => true);
  const rollbackSession = await get(db, 'archive_staging', committed.rollbackSessionId);
  rollbackSession.stagedCount = 0;
  await put(db, 'archive_staging', rollbackSession);

  await assert.rejects(
    Restore.discardArchiveRollbackSnapshot(db, 'backup-rollback-cleanup-tamper'),
    { code: 'ROLLBACK_SNAPSHOT_INVALID' }
  );
  assert.ok(await get(db, 'archive_staging', committed.rollbackSessionId));
  assert.equal((await get(db, 'archive_history', 'backup-rollback-cleanup-tamper')).rollbackSessionId, committed.rollbackSessionId);
  db.close();
});


test('atomic archive commit marks videos whose hive reference is missing from the imported state', async () => {
  const db = await openTestDb('paseka-stage-orphan-video');
  const oldState = { meta: { schemaVersion: 12, revisionId: 'live-revision' }, hives: [], families: [], records: [] };
  await put(db, 'main', oldState, 'state');
  const archive = await makeArchive('backup-orphan-video', 'state without the referenced hive', 'hive-no-longer-present');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  assert.deepEqual(staged.session.orphanVideoIds, ['video-1']);
  const committed = await Restore.commitStagedArchive(db, staged.session.sessionId, 'live-revision', webcrypto, Archive, () => true);
  assert.equal(committed.importedVideoCount, 1);
  assert.equal(committed.orphanedVideoCount, 1);
  const history = await get(db, 'archive_history', 'backup-orphan-video');
  assert.equal(history.videoCount, 1);
  assert.equal(history.orphanedVideoCount, 1);
  const importedVideo = await get(db, 'entrance_media', 'video-1');
  assert.equal(importedVideo.hiveId, 'hive-no-longer-present');
  assert.equal(importedVideo.orphanedHiveReference, true);
  db.close();
});


test('full archive export, staged import, atomic rollback round-trip preserves source and destination data', async () => {
  const sourceDb = await openTestDb('paseka-full-roundtrip-source');
  const targetDb = await openTestDb('paseka-full-roundtrip-target');
  const sourceState = stateFixture('source journal with photo metadata');
  const sourceVideo = videoFixture();
  const targetState = {
    meta: { schemaVersion: 12, revisionId: 'target-before-import' },
    hives: [{ id: 'target-hive', number: 9 }],
    families: [], records: [{ id: 'target-record', note: 'keep until commit' }], auditLog: []
  };
  const targetVideoBlob = new Blob(['target previous video'], { type: 'video/mp4' });
  const targetVideo = {
    id: 'target-video', hiveId: 'target-hive', capturedAt: '2026-11-13T09:00:00.000Z',
    durationSec: 12, width: 640, height: 480, bytes: targetVideoBlob.size,
    mimeType: 'video/mp4', name: 'target.mp4', status: 'waiting_for_server', blob: targetVideoBlob
  };
  await put(sourceDb, 'main', sourceState, 'state');
  await put(sourceDb, 'entrance_media', sourceVideo);
  await put(targetDb, 'main', targetState, 'state');
  await put(targetDb, 'entrance_media', targetVideo);

  const exported = await Archive.exportArchiveFromDatabase(sourceDb, webcrypto);
  assert.equal(exported.summary.videoCount, 1);
  const staged = await Restore.stageArchiveForRestore(targetDb, exported.blob, webcrypto, Archive, () => true);
  const committed = await Restore.commitStagedArchive(
    targetDb, staged.session.sessionId, 'target-before-import', webcrypto, Archive, () => true
  );
  assert.equal((await get(targetDb, 'main', 'state')).records[0].note, 'source journal with photo metadata');
  assert.equal((await getAll(targetDb, 'entrance_media')).length, 1);
  assert.equal((await get(targetDb, 'entrance_media', 'video-1')).blob.size, sourceVideo.blob.size);

  await Restore.rollbackCommittedArchive(
    targetDb, exported.manifest.backupId, committed.state.meta.revisionId, webcrypto, () => true
  );
  assert.equal((await get(targetDb, 'main', 'state')).meta.revisionId !== 'target-before-import', true);
  assert.equal((await get(targetDb, 'main', 'state')).records[0].note, 'keep until commit');
  assert.equal((await get(targetDb, 'entrance_media', 'target-video')).blob.size, targetVideoBlob.size);
  assert.equal((await get(sourceDb, 'main', 'state')).records[0].note, 'source journal with photo metadata');
  assert.equal((await get(sourceDb, 'entrance_media', 'video-1')).blob.size, sourceVideo.blob.size);
  sourceDb.close();
  targetDb.close();
});


test('archive staging hashes legacy video Blob bytes outside IndexedDB write transactions', async () => {
  const db = await openTestDb('paseka-stage-legacy-video-hash');
  const legacyBlob = new Blob(['legacy video bytes'], { type: 'video/mp4' });
  await put(db, 'entrance_media', {
    id: 'legacy-video', hiveId: 'hive-old', bytes: legacyBlob.size, blob: legacyBlob
  });
  const archive = await makeArchive('backup-legacy-video-hash');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  const saved = await get(db, 'entrance_media', 'legacy-video');
  const expected = Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256', await legacyBlob.arrayBuffer())),
    byte => byte.toString(16).padStart(2, '0')).join('');
  assert.equal(saved.blobSha256, expected);
  assert.equal(saved.blob.size, legacyBlob.size);
  assert.equal(staged.session.status, 'ready');
  db.close();
});

test('archive staging rejects a legacy video whose persisted checksum disagrees with its Blob', async () => {
  const db = await openTestDb('paseka-stage-legacy-video-hash-mismatch');
  const blob = new Blob(['actual bytes'], { type: 'video/mp4' });
  await put(db, 'entrance_media', {
    id: 'tampered-video', hiveId: 'hive-old', bytes: blob.size, blob,
    blobSha256: '0'.repeat(64)
  });
  const archive = await makeArchive('backup-legacy-video-hash-mismatch');
  await assert.rejects(
    Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true),
    { code: 'MEDIA_BASELINE_HASH_MISMATCH' }
  );
  assert.equal((await get(db, 'entrance_media', 'tampered-video')).blobSha256, '0'.repeat(64));
  assert.equal((await Restore.listArchiveRestoreSessions(db)).length, 0);
  db.close();
});


test('archive staging does not open a write transaction while hashing legacy media', async () => {
  const db = await openTestDb('paseka-stage-hash-outside-write');
  const legacyBlob = new Blob(['legacy bytes'], { type: 'video/mp4' });
  await put(db, 'entrance_media', { id: 'legacy-video', hiveId: 'hive-old', blob: legacyBlob });
  const archive = await makeArchive('backup-hash-outside-write');
  const modes = [];
  const observedDb = {
    objectStoreNames: db.objectStoreNames,
    transaction(...args) {
      modes.push(args[1] || 'readonly');
      return db.transaction(...args);
    }
  };
  const originalShaApi = globalThis.PasekaSha256;
  const originalHash = originalShaApi.hashBlobHex;
  let announceStarted;
  let releaseHash;
  const started = new Promise(resolve => { announceStarted = resolve; });
  globalThis.PasekaSha256 = { ...originalShaApi, hashBlobHex: blob => {
    announceStarted();
    return new Promise((resolve, reject) => {
      releaseHash = () => originalHash(blob).then(resolve, reject);
    });
  } };
  try {
    const operation = Restore.stageArchiveForRestore(observedDb, archive, webcrypto, Archive, () => true);
    await started;
    assert.ok(modes.length > 0);
    assert.ok(modes.every(mode => mode === 'readonly'), 'no readwrite transaction may remain open during Blob hashing');
    releaseHash();
    const result = await operation;
    assert.equal(result.session.status, 'ready');
    assert.ok(modes.includes('readwrite'), 'a short write transaction is opened after hashing');
  } finally {
    globalThis.PasekaSha256 = originalShaApi;
    db.close();
  }
});


test('quota failure during media staging survives database reopen and preserves live data', async () => {
  const factory = new IDBFactory();
  let db = await openTestDb('paseka-stage-quota-failure', factory);
  const liveState = {
    meta: { schemaVersion: 12, revisionId: 'live-before-quota' },
    hives: [{ id: 'live-hive', number: 7 }],
    families: [], records: [{ id: 'live-record', note: 'must survive quota failure' }]
  };
  const liveBlob = new Blob(['user video must survive'], { type: 'video/mp4' });
  const liveHash = Array.from(new Uint8Array(await webcrypto.subtle.digest('SHA-256', await liveBlob.arrayBuffer())),
    byte => byte.toString(16).padStart(2, '0')).join('');
  await put(db, 'main', liveState, 'state');
  await put(db, 'entrance_media', {
    id: 'user-video-before-quota', hiveId: 'live-hive', blob: liveBlob,
    blobSha256: liveHash, bytes: liveBlob.size, mimeType: 'video/mp4'
  });

  const archive = await makeArchive('backup-stage-quota-failure');
  let injected = false;
  const quotaDb = {
    objectStoreNames: db.objectStoreNames,
    transaction(...args) {
      const tx = db.transaction(...args);
      let injectedQuotaError = null;
      return new Proxy(tx, {
        get(target, property) {
          if (property === 'error') return injectedQuotaError || target.error;
          if (property === 'objectStore') {
            return name => {
              const store = target.objectStore(name);
              if (name !== 'archive_staging') return store;
              return new Proxy(store, {
                get(storeTarget, method) {
                  if (method === 'put') {
                    return value => {
                      if (!injected && value?.kind === 'video') {
                        injected = true;
                        injectedQuotaError = new DOMException('Injected storage quota exhaustion.', 'QuotaExceededError');
                        target.abort();
                        return null;
                      }
                      return storeTarget.put(value);
                    };
                  }
                  const result = Reflect.get(storeTarget, method, storeTarget);
                  return typeof result === 'function' ? result.bind(storeTarget) : result;
                }
              });
            };
          }
          const result = Reflect.get(target, property, target);
          return typeof result === 'function' ? result.bind(target) : result;
        }
      });
    }
  };

  await assert.rejects(
    Restore.stageArchiveForRestore(quotaDb, archive, webcrypto, Archive, () => true),
    error => error && error.name === 'QuotaExceededError'
  );
  assert.equal(injected, true);

  const [failedSession] = await Restore.listArchiveRestoreSessions(db);
  assert.equal(failedSession.backupId, 'backup-stage-quota-failure');
  assert.equal(failedSession.status, 'failed');
  assert.equal(failedSession.errorCode, 'QuotaExceededError');
  assert.equal(failedSession.stagedCount, 1);
  assert.equal((await get(db, 'archive_staging', failedSession.sessionId + ':state')).kind, 'state');
  assert.equal(await get(db, 'archive_staging', failedSession.sessionId + ':video:video-1'), undefined);

  const afterFailureState = await get(db, 'main', 'state');
  const afterFailureVideos = await getAll(db, 'entrance_media');
  assert.equal(afterFailureState.meta.revisionId, 'live-before-quota');
  assert.equal(afterFailureState.records[0].note, 'must survive quota failure');
  assert.equal(afterFailureVideos.length, 1);
  assert.equal(afterFailureVideos[0].id, 'user-video-before-quota');
  assert.equal(afterFailureVideos[0].blobSha256, liveHash);
  assert.equal(await afterFailureVideos[0].blob.text(), 'user video must survive');

  // Simulate the WebView database connection being closed and the app reopening.
  // The same IndexedDB database must retain the failed session and partial rows.
  db.close();
  db = await openTestDb('paseka-stage-quota-failure', factory);
  const [reopenedSession] = await Restore.listArchiveRestoreSessions(db);
  assert.equal(reopenedSession.sessionId, failedSession.sessionId);
  assert.equal(reopenedSession.status, 'failed');
  assert.equal(reopenedSession.stagedCount, 1);
  assert.equal((await get(db, 'archive_staging', reopenedSession.sessionId + ':state')).kind, 'state');
  assert.equal(await get(db, 'archive_staging', reopenedSession.sessionId + ':video:video-1'), undefined);
  assert.equal((await get(db, 'main', 'state')).meta.revisionId, 'live-before-quota');
  assert.equal(await (await get(db, 'entrance_media', 'user-video-before-quota')).blob.text(), 'user video must survive');

  await assert.rejects(
    Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true),
    { code: 'INCOMPLETE_STAGING_EXISTS' }
  );
  assert.equal(await Restore.discardArchiveRestoreSession(db, failedSession.sessionId), true);

  const retried = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  assert.equal(retried.session.status, 'ready');
  assert.equal(retried.session.stagedCount, 2);
  assert.equal((await get(db, 'main', 'state')).meta.revisionId, 'live-before-quota');
  assert.equal((await get(db, 'entrance_media', 'user-video-before-quota')).blobSha256, liveHash);
  db.close();
});


test('separate tab connections cannot create duplicate staging sessions for the same backup', async () => {
  const factory = new IDBFactory();
  const db = await openTestDb('paseka-stage-concurrent-tabs', factory);
  const secondTabDb = await openTestDb('paseka-stage-concurrent-tabs', factory);
  assert.notEqual(db, secondTabDb, 'each simulated tab must own a separate database connection');
  const liveState = { meta: { schemaVersion: 12, revisionId: 'live-before-concurrent-stage' }, hives: [], families: [], records: [] };
  await put(db, 'main', liveState, 'state');

  const archive = await makeArchive('backup-stage-concurrent-tabs');
  let validationArrivals = 0;
  let releaseValidation;
  const validationGate = new Promise(resolve => { releaseValidation = resolve; });
  const synchronizedArchiveApi = {
    ...Archive,
    async validateArchiveForRestore(...args) {
      const checked = await Archive.validateArchiveForRestore(...args);
      validationArrivals++;
      if (validationArrivals === 2) releaseValidation();
      await validationGate;
      return checked;
    }
  };
  const validateState = () => true;

  const results = await Promise.allSettled([
    Restore.stageArchiveForRestore(db, archive, webcrypto, synchronizedArchiveApi, validateState),
    Restore.stageArchiveForRestore(secondTabDb, archive, webcrypto, synchronizedArchiveApi, validateState)
  ]);
  const fulfilled = results.filter(result => result.status === 'fulfilled');
  const rejected = results.filter(result => result.status === 'rejected');

  assert.equal(validationArrivals, 2);
  assert.equal(fulfilled.length + rejected.length, 2);
  assert.ok(fulfilled.length >= 1, 'at least one tab must stage the archive');
  assert.equal(fulfilled.filter(result => result.value.alreadyStaged === false).length, 1,
    'exactly one tab may create the staging session');
  if (rejected.length) {
    assert.ok(
      rejected[0].reason.code === 'BACKUP_STAGING_CONFLICT' ||
      rejected[0].reason.code === 'INCOMPLETE_STAGING_EXISTS' ||
      rejected[0].reason.name === 'ConstraintError',
      'a rejected tab must receive a recognized safe conflict, got: ' + String(rejected[0].reason.code || rejected[0].reason.name || rejected[0].reason.message)
    );
  }
  const sessionIds = new Set(fulfilled.map(result => result.value.session.sessionId));
  assert.equal(sessionIds.size, 1, 'concurrent tabs must converge on the same staging session');

  const sessions = await Restore.listArchiveRestoreSessions(db);
  assert.equal(sessions.length, 1, 'only one session header may exist for the backup ID');
  assert.equal(sessions[0].status, 'ready');
  assert.equal(sessions[0].stagedCount, 2);
  assert.equal(sessions[0].totalEntries, 2);
  const staged = await Restore.getStagedArchive(db, sessions[0].sessionId, webcrypto, Archive, validateState);
  assert.equal(staged.state.meta.revisionId, 'archive-revision');
  assert.equal(staged.videos.length, 1);
  assert.equal((await get(db, 'main', 'state')).meta.revisionId, 'live-before-concurrent-stage');
  const stagingRows = await getAll(db, 'archive_staging');
  assert.equal(stagingRows.filter(row => row.kind === 'session').length, 1);
  assert.equal(stagingRows.filter(row => row.kind !== 'session').length, 2);
  db.close();
  secondTabDb.close();
});
