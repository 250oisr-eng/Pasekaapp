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


test('staging cleanup refuses an unknown session-header kind without deleting its records', async () => {
  const db = await openTestDb('paseka-stage-unknown-header-kind');
  const archive = await makeArchive('backup-unknown-header-kind');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  const rowsBefore = (await getAll(db, 'archive_staging')).filter(row => row.sessionId === staged.session.sessionId);
  const header = await get(db, 'archive_staging', staged.session.sessionId);
  header.kind = 'unexpected_header';
  await put(db, 'archive_staging', header);
  await assert.rejects(
    Restore.discardArchiveRestoreSession(db, staged.session.sessionId),
    { code: 'STAGING_SESSION_INVALID' }
  );
  const rowsAfter = (await getAll(db, 'archive_staging')).filter(row => row.sessionId === staged.session.sessionId);
  assert.equal(rowsAfter.length, rowsBefore.length);
  assert.equal((await get(db, 'archive_staging', staged.session.sessionId)).kind, 'unexpected_header');
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


test('archive rollback restores a legacy video changed after commit preflight hashing', async () => {
  const db = await openTestDb('paseka-legacy-media-commit-window');
  const liveState = { meta: { schemaVersion: 12, revisionId: 'live-before-commit-window' }, hives: [], families: [], records: [] };
  await put(db, 'main', liveState, 'state');
  const oldBlob = new Blob(['legacy bytes'], { type: 'video/mp4' });
  const oldVideo = {
    id: 'legacy-live-video-window', hiveId: 'hive-old', capturedAt: '2026-11-14T09:00:00.000Z',
    bytes: oldBlob.size, mimeType: oldBlob.type, blob: oldBlob
  };
  await put(db, 'entrance_media', oldVideo);
  const archive = await makeArchive('backup-legacy-media-commit-window');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);

  const originalSha = globalThis.PasekaSha256;
  let releaseHash, notifyHash;
  const hashStarted = new Promise(resolve => { notifyHash = resolve; });
  const hashGate = new Promise(resolve => { releaseHash = resolve; });
  let firstHash = true;
  globalThis.PasekaSha256 = {
    ...originalSha,
    hashBlobHex(blob) {
      if (firstHash) {
        firstHash = false;
        notifyHash();
        return hashGate.then(() => originalSha.hashBlobHex(blob));
      }
      return originalSha.hashBlobHex(blob);
    }
  };
  let committed;
  try {
    const operation = Restore.commitStagedArchive(
      db, staged.session.sessionId, 'live-before-commit-window', webcrypto, Archive, () => true
    );
    await hashStarted;
    const latestBlob = new Blob(['LATEST bytes'], { type: 'video/mp4' });
    assert.equal(latestBlob.size, oldBlob.size);
    await put(db, 'entrance_media', { ...oldVideo, blob: latestBlob });
    releaseHash();
    committed = await operation;
  } finally {
    globalThis.PasekaSha256 = originalSha;
    releaseHash?.();
  }

  assert.equal((await getAll(db, 'entrance_media')).some(video => video.id === oldVideo.id), false);
  const rolledBack = await Restore.rollbackCommittedArchive(
    db, 'backup-legacy-media-commit-window', committed.state.meta.revisionId, webcrypto, () => true
  );
  assert.equal(rolledBack.rollbackSnapshotRemoved, true);
  const restoredVideo = await get(db, 'entrance_media', oldVideo.id);
  assert.ok(restoredVideo);
  assert.equal(await restoredVideo.blob.text(), 'LATEST bytes', 'rollback must restore the exact Blob captured by the commit transaction');
  assert.equal(restoredVideo.blobSha256, await globalThis.PasekaSha256.hashBlobHex(restoredVideo.blob), 'rollback must persist a verified checksum for the restored legacy Blob');
  db.close();
});

test('quota failure during atomic archive commit preserves live state, media, history and staged data', async () => {
  const db = await openTestDb('paseka-atomic-commit-quota');
  const liveState = {
    meta: { schemaVersion: 12, revisionId: 'live-before-commit-quota' },
    hives: [{ id: 'live-hive', number: 4 }], families: [],
    records: [{ id: 'live-record', note: 'must survive failed restore commit' }]
  };
  const liveBlob = new Blob(['original live entrance video'], { type: 'video/mp4' });
  await put(db, 'main', liveState, 'state');
  await put(db, 'entrance_media', {
    id: 'live-video-before-commit-quota', hiveId: 'live-hive', blob: liveBlob,
    bytes: liveBlob.size, mimeType: 'video/mp4', capturedAt: '2026-11-14T10:00:00.000Z'
  });

  const archive = await makeArchive('backup-atomic-commit-quota');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  let injected = false;
  const quotaDb = {
    objectStoreNames: db.objectStoreNames,
    transaction(...args) {
      const tx = db.transaction(...args);
      const stores = Array.isArray(args[0]) ? args[0] : [args[0]];
      if (args[1] !== 'readwrite' || !stores.includes('main') ||
          !stores.includes('entrance_media') || !stores.includes('archive_history')) return tx;
      return new Proxy(tx, {
        get(target, property) {
          if (property === 'objectStore') {
            return name => {
              const store = target.objectStore(name);
              if (name !== 'entrance_media') return store;
              return new Proxy(store, {
                get(storeTarget, method) {
                  if (method === 'put') {
                    return value => {
                      if (!injected) {
                        injected = true;
                        throw new DOMException('Injected quota exhaustion during atomic restore.', 'QuotaExceededError');
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
    Restore.commitStagedArchive(quotaDb, staged.session.sessionId, 'live-before-commit-quota', webcrypto, Archive, () => true),
    error => error && error.name === 'QuotaExceededError'
  );
  assert.equal(injected, true);
  assert.equal((await get(db, 'main', 'state')).meta.revisionId, 'live-before-commit-quota');
  assert.equal((await get(db, 'main', 'state')).records[0].note, 'must survive failed restore commit');
  const videos = await getAll(db, 'entrance_media');
  assert.equal(videos.length, 1);
  assert.equal(videos[0].id, 'live-video-before-commit-quota');
  assert.equal(await videos[0].blob.text(), 'original live entrance video');
  assert.equal(await get(db, 'full_backup', 'previous'), undefined);
  assert.equal(await get(db, 'archive_history', 'backup-atomic-commit-quota'), undefined);
  const retainedSession = await get(db, 'archive_staging', staged.session.sessionId);
  assert.equal(retainedSession.status, 'ready');
  assert.equal(retainedSession.stagedCount, retainedSession.totalEntries);
  const retainedRows = (await getAll(db, 'archive_staging')).filter(row => row.sessionId === staged.session.sessionId);
  assert.equal(retainedRows.length, retainedSession.totalEntries + 1);
  assert.equal(retainedRows.some(row => row.kind === 'rollback_session'), false);
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

test('atomic rollback refuses journal changes made after import and preserves newer entries', async () => {
  const db = await openTestDb('paseka-stage-rollback-journal-changed');
  const oldState = { meta: { schemaVersion: 12, revisionId: 'before-import' }, hives: [], families: [], records: [{ id: 'old-record' }] };
  await put(db, 'main', oldState, 'state');
  const archive = await makeArchive('backup-rollback-journal-changed');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  const committed = await Restore.commitStagedArchive(db, staged.session.sessionId, 'before-import', webcrypto, Archive, () => true);

  const newerState = {
    ...committed.state,
    meta: { ...committed.state.meta, revisionId: 'after-import' },
    records: [...committed.state.records, { id: 'new-record', note: 'created after import' }]
  };
  await put(db, 'main', newerState, 'state');

  await assert.rejects(
    Restore.rollbackCommittedArchive(db, 'backup-rollback-journal-changed', 'after-import', webcrypto, () => true),
    { code: 'ROLLBACK_STATE_CHANGED' }
  );
  const currentState = await get(db, 'main', 'state');
  assert.equal(currentState.meta.revisionId, 'after-import');
  assert.equal(currentState.records.some(record => record.id === 'new-record'), true);
  assert.equal((await get(db, 'archive_history', 'backup-rollback-journal-changed')).status, 'committed');
  assert.equal((await get(db, 'archive_staging', committed.rollbackSessionId)).status, 'ready');
  db.close();
});


test('atomic rollback rechecks journal revision in the final write transaction', async () => {
  const db = await openTestDb('paseka-stage-rollback-journal-race');
  const oldState = { meta: { schemaVersion: 12, revisionId: 'before-import' }, hives: [], families: [], records: [] };
  await put(db, 'main', oldState, 'state');
  const archive = await makeArchive('backup-rollback-journal-race');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  const committed = await Restore.commitStagedArchive(db, staged.session.sessionId, 'before-import', webcrypto, Archive, () => true);

  let validationStarted;
  let releaseValidation;
  const started = new Promise(resolve => { validationStarted = resolve; });
  const release = new Promise(resolve => { releaseValidation = resolve; });
  const pendingRollback = Restore.rollbackCommittedArchive(
    db,
    'backup-rollback-journal-race',
    committed.state.meta.revisionId,
    webcrypto,
    async () => {
      validationStarted();
      await release;
      return true;
    }
  );
  await started;

  const newerState = {
    ...committed.state,
    meta: { ...committed.state.meta, revisionId: 'after-import-race' },
    records: [...committed.state.records, { id: 'raced-record', note: 'created during rollback validation' }]
  };
  await put(db, 'main', newerState, 'state');
  releaseValidation();

  await assert.rejects(pendingRollback, { code: 'ROLLBACK_STATE_CHANGED' });
  const currentState = await get(db, 'main', 'state');
  assert.equal(currentState.meta.revisionId, 'after-import-race');
  assert.equal(currentState.records.some(record => record.id === 'raced-record'), true);
  assert.equal((await get(db, 'archive_history', 'backup-rollback-journal-race')).status, 'committed');
  assert.equal((await get(db, 'archive_staging', committed.rollbackSessionId)).status, 'ready');
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


test('archive staging hashes legacy video without rewriting the live Blob record', async () => {
  const db = await openTestDb('paseka-stage-legacy-video-hash');
  const legacyBlob = new Blob(['legacy video bytes'], { type: 'video/mp4' });
  await put(db, 'entrance_media', {
    id: 'legacy-video', hiveId: 'hive-old', bytes: legacyBlob.size, blob: legacyBlob
  });
  const archive = await makeArchive('backup-legacy-video-hash');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  const saved = await get(db, 'entrance_media', 'legacy-video');
  assert.equal(saved.blobSha256, undefined, 'staging must not rewrite a live legacy media row');
  assert.equal(await saved.blob.text(), await legacyBlob.text());
  assert.equal(staged.session.baselineMediaFingerprint.length > 0, true);
  assert.equal(staged.session.status, 'ready');
  db.close();
});

test('archive staging never overwrites a legacy video changed by another tab during hashing', async () => {
  const db = await openTestDb('paseka-stage-legacy-media-race');
  const liveState = { meta: { schemaVersion: 12, revisionId: 'live-before-legacy-media-race' }, hives: [], families: [], records: [] };
  await put(db, 'main', liveState, 'state');
  const oldBlob = new Blob(['legacy bytes'], { type: 'video/mp4' });
  const oldVideo = {
    id: 'legacy-live-video', hiveId: 'hive-old', capturedAt: '2026-11-14T09:00:00.000Z',
    bytes: oldBlob.size, mimeType: oldBlob.type, blob: oldBlob
  };
  await put(db, 'entrance_media', oldVideo);
  const archive = await makeArchive('backup-stage-legacy-media-race');
  const originalSha = globalThis.PasekaSha256;
  let releaseHash, notifyHash;
  const hashStarted = new Promise(resolve => { notifyHash = resolve; });
  const hashGate = new Promise(resolve => { releaseHash = resolve; });
  let firstHash = true;
  globalThis.PasekaSha256 = {
    ...originalSha,
    hashBlobHex(blob) {
      if (firstHash) {
        firstHash = false;
        notifyHash();
        return hashGate.then(() => originalSha.hashBlobHex(blob));
      }
      return originalSha.hashBlobHex(blob);
    }
  };
  let staged;
  try {
    const operation = Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
    await hashStarted;
    const latestBlob = new Blob(['LATEST bytes'], { type: 'video/mp4' });
    assert.equal(latestBlob.size, oldBlob.size, 'the concurrent replacement has identical size and MIME metadata');
    await put(db, 'entrance_media', { ...oldVideo, blob: latestBlob });
    releaseHash();
    staged = await operation;
  } finally {
    globalThis.PasekaSha256 = originalSha;
    releaseHash?.();
  }

  const liveVideo = await get(db, 'entrance_media', oldVideo.id);
  assert.equal(await liveVideo.blob.text(), 'LATEST bytes', 'staging must not replace the newer live Blob with its earlier read');
  assert.equal(liveVideo.blobSha256, undefined);
  await assert.rejects(
    Restore.commitStagedArchive(db, staged.session.sessionId, 'live-before-legacy-media-race', webcrypto, Archive, () => true),
    { code: 'RESTORE_MEDIA_CHANGED' }
  );
  assert.equal((await get(db, 'main', 'state')).meta.revisionId, 'live-before-legacy-media-race');
  assert.equal(await (await get(db, 'entrance_media', oldVideo.id)).blob.text(), 'LATEST bytes');
  assert.equal(await get(db, 'archive_history', 'backup-stage-legacy-media-race'), undefined);
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


test('discard racing with restore preflight aborts commit without changing live state or media', async () => {
  const db = await openTestDb('paseka-stage-discard-restore-preflight-race');
  const liveState = { meta: { schemaVersion: 12, revisionId: 'live-before-discard-race' }, hives: [], families: [], records: [] };
  const liveVideoBlob = new Blob(['user video survives discard race'], { type: 'video/mp4' });
  await put(db, 'main', liveState, 'state');
  await put(db, 'entrance_media', {
    id: 'live-video-race', hiveId: 'hive-live', blob: liveVideoBlob,
    blobSha256: await globalThis.PasekaSha256.hashBlobHex(liveVideoBlob)
  });

  const archive = await makeArchive('backup-discard-restore-preflight-race');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  let releaseHash;
  let notifyHashStarted;
  const hashStarted = new Promise(resolve => { notifyHashStarted = resolve; });
  const hashGate = new Promise(resolve => { releaseHash = resolve; });
  let firstHash = true;
  const gatedArchiveApi = {
    ...Archive,
    async hashBlobChunks(...args) {
      const result = await Archive.hashBlobChunks(...args);
      if (firstHash) {
        firstHash = false;
        notifyHashStarted();
        await hashGate;
      }
      return result;
    }
  };

  const commit = Restore.commitStagedArchive(
    db, staged.session.sessionId, 'live-before-discard-race', webcrypto, gatedArchiveApi, () => true
  );
  await hashStarted;
  assert.equal(await Restore.discardArchiveRestoreSession(db, staged.session.sessionId), true);
  releaseHash();
  await assert.rejects(commit, { code: 'STAGING_SESSION_INCOMPLETE' });

  assert.equal((await get(db, 'main', 'state')).meta.revisionId, 'live-before-discard-race');
  const remainingVideo = await get(db, 'entrance_media', 'live-video-race');
  assert.equal(await remainingVideo.blob.text(), 'user video survives discard race');
  assert.equal(remainingVideo.blobSha256, await globalThis.PasekaSha256.hashBlobHex(liveVideoBlob));
  assert.equal((await getAll(db, 'archive_staging')).some(row => row.sessionId === staged.session.sessionId), false);
  assert.equal((await getAll(db, 'archive_history')).length, 0);
  db.close();
});

test('discard queued behind atomic restore cannot remove committed import or rollback snapshot', async () => {
  const db = await openTestDb('paseka-stage-discard-restore-commit-race');
  const liveState = { meta: { schemaVersion: 12, revisionId: 'live-before-commit-race' }, hives: [], families: [], records: [] };
  const liveVideoBlob = new Blob(['original video for rollback'], { type: 'video/mp4' });
  await put(db, 'main', liveState, 'state');
  await put(db, 'entrance_media', {
    id: 'live-video-commit-race', hiveId: 'hive-live', blob: liveVideoBlob,
    blobSha256: await globalThis.PasekaSha256.hashBlobHex(liveVideoBlob)
  });

  const archive = await makeArchive('backup-discard-restore-commit-race');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  let notifyCommitTransaction;
  const commitTransactionStarted = new Promise(resolve => { notifyCommitTransaction = resolve; });
  const instrumentedDb = new Proxy(db, {
    get(target, property) {
      if (property === 'transaction') {
        return (...args) => {
          const tx = target.transaction(...args);
          const stores = Array.isArray(args[0]) ? args[0] : [args[0]];
          if (args[1] === 'readwrite' && stores.includes('main') &&
              stores.includes('archive_staging') && stores.includes('archive_history')) {
            notifyCommitTransaction();
          }
          return tx;
        };
      }
      return Reflect.get(target, property, target);
    }
  });

  const commit = Restore.commitStagedArchive(
    instrumentedDb, staged.session.sessionId, 'live-before-commit-race', webcrypto, Archive, () => true
  );
  await commitTransactionStarted;
  const discard = Restore.discardArchiveRestoreSession(db, staged.session.sessionId);
  const committed = await commit;
  assert.equal(committed.importedVideoCount, 1);
  await assert.rejects(discard, { code: 'COMMITTED_IMPORT_PROTECTED' });

  const importedState = await get(db, 'main', 'state');
  assert.equal(importedState.records[0].note, 'archive state');
  const history = await get(db, 'archive_history', 'backup-discard-restore-commit-race');
  assert.equal(history.status, 'committed');
  assert.equal(history.rollbackAvailable, true);
  assert.equal((await get(db, 'archive_staging', committed.rollbackSessionId)).kind, 'rollback_session');
  assert.equal((await get(db, 'archive_staging', committed.rollbackSessionId + ':video:live-video-commit-race')).record.id, 'live-video-commit-race');
  db.close();
});

test('concurrent discard during final staging progress cannot resurrect a deleted session header', async () => {
  const db = await openTestDb('paseka-stage-discard-finalization-race');
  const archive = await makeArchive('backup-discard-finalization-race');
  const fixedCrypto = {
    subtle: webcrypto.subtle,
    getRandomValues(bytes) {
      bytes.fill(0x5a);
      return bytes;
    }
  };
  const expectedSessionId = '5a'.repeat(16);
  let discardPromise = null;

  const stagePromise = Restore.stageArchiveForRestore(
    db, archive, fixedCrypto, Archive, () => true,
    {
      onProgress() {
        discardPromise = Restore.discardArchiveRestoreSession(db, expectedSessionId);
      }
    }
  );

  await assert.rejects(stagePromise, { code: 'STAGING_SESSION_NOT_WRITABLE' });
  assert.ok(discardPromise, 'progress callback must start cleanup before final session update');
  assert.equal(await discardPromise, true);
  const remaining = (await getAll(db, 'archive_staging')).filter(row => row.sessionId === expectedSessionId);
  assert.equal(remaining.length, 0, 'a completed discard must not be undone by a late session update');
  db.close();
});


test('a fully persisted staging session can be explicitly verified and finalized after interruption', async () => {
  const db = await openTestDb('paseka-stage-explicit-finalize');
  const liveState = { meta: { schemaVersion: 12, revisionId: 'live-before-finalize' }, hives: [], families: [], records: [] };
  await put(db, 'main', liveState, 'state');
  const archive = await makeArchive('backup-explicit-finalize');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);

  const interrupted = await get(db, 'archive_staging', staged.session.sessionId);
  interrupted.status = 'staging';
  delete interrupted.completedAt;
  await put(db, 'archive_staging', interrupted);

  await assert.rejects(
    Restore.getStagedArchive(db, staged.session.sessionId, webcrypto, Archive, () => true),
    { code: 'STAGING_SESSION_INCOMPLETE' }
  );
  // The public read API must not expose the internal interrupted-session mode.
  await assert.rejects(
    Restore.getStagedArchive(db, staged.session.sessionId, webcrypto, Archive, () => true, true),
    { code: 'STAGING_SESSION_INCOMPLETE' }
  );
  await assert.rejects(
    Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true),
    { code: 'INCOMPLETE_STAGING_EXISTS' }
  );

  const finalized = await Restore.finalizeStagedArchive(db, staged.session.sessionId, webcrypto, Archive, () => true);
  assert.equal(finalized.status, 'ready');
  assert.equal(finalized.stagedCount, finalized.totalEntries);
  const repeatedFinalize = await Restore.finalizeStagedArchive(db, staged.session.sessionId, webcrypto, Archive, () => true);
  assert.equal(repeatedFinalize.status, 'ready');
  assert.equal(repeatedFinalize.completedAt, finalized.completedAt, 'repeated finalization must not rewrite the ready session');
  const verified = await Restore.getStagedArchive(db, staged.session.sessionId, webcrypto, Archive, () => true);
  assert.equal(verified.state.records[0].note, 'archive state');
  assert.equal(verified.videos.length, 1);
  const repeated = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  assert.equal(repeated.alreadyStaged, true);
  assert.equal((await get(db, 'main', 'state')).meta.revisionId, 'live-before-finalize');
  db.close();
});

test('explicit staging finalization rejects duplicate or out-of-epoch entry revisions', async () => {
  for (const mode of ['duplicate', 'beyond-epoch']) {
    const db = await openTestDb('paseka-stage-finalize-invalid-revision-' + mode);
    const archive = await makeArchive('backup-finalize-invalid-revision-' + mode);
    const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
    const header = await get(db, 'archive_staging', staged.session.sessionId);
    const stateEntry = await get(db, 'archive_staging', staged.session.sessionId + ':state');
    const videoEntry = await get(db, 'archive_staging', staged.session.sessionId + ':video:video-1');
    header.status = 'staging';
    delete header.completedAt;
    if (mode === 'duplicate') {
      videoEntry.stagingRevision = stateEntry.stagingRevision;
    } else {
      header.stagingEpoch = stateEntry.stagingRevision;
    }
    await Promise.all([
      put(db, 'archive_staging', header),
      put(db, 'archive_staging', videoEntry)
    ]);
    await assert.rejects(
      Restore.finalizeStagedArchive(db, staged.session.sessionId, webcrypto, Archive, () => true),
      { code: 'STAGING_FINGERPRINT_REVISION_INVALID' }
    );
    assert.equal((await get(db, 'archive_staging', staged.session.sessionId)).status, 'staging');
    db.close();
  }
});

test('explicit staging finalization rejects a legacy session without a valid staging epoch', async () => {
  const db = await openTestDb('paseka-stage-finalize-legacy');
  const archive = await makeArchive('backup-finalize-legacy');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  const header = await get(db, 'archive_staging', staged.session.sessionId);
  header.status = 'staging';
  delete header.stagingEpoch;
  await put(db, 'archive_staging', header);

  await assert.rejects(
    Restore.finalizeStagedArchive(db, staged.session.sessionId, webcrypto, Archive, () => true),
    { code: 'STAGING_LEGACY_SESSION' }
  );
  const preserved = await get(db, 'archive_staging', staged.session.sessionId);
  assert.equal(preserved.status, 'staging');
  assert.equal(preserved.stagingEpoch, undefined);
  db.close();
});

test('explicit staging finalization refuses a missing content record and preserves the session', async () => {
  const db = await openTestDb('paseka-stage-finalize-incomplete');
  const archive = await makeArchive('backup-finalize-incomplete');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  const header = await get(db, 'archive_staging', staged.session.sessionId);
  header.status = 'staging';
  await put(db, 'archive_staging', header);
  await new Promise((resolve, reject) => {
    const tx = db.transaction('archive_staging', 'readwrite');
    tx.objectStore('archive_staging').delete(staged.session.sessionId + ':video:video-1');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  await assert.rejects(
    Restore.finalizeStagedArchive(db, staged.session.sessionId, webcrypto, Archive, () => true),
    { code: 'STAGING_ENTRY_SET_INVALID' }
  );
  const preservedHeader = await get(db, 'archive_staging', staged.session.sessionId);
  assert.equal(preservedHeader.status, 'staging');
  assert.equal(preservedHeader.stagedCount, 2);
  assert.ok(await get(db, 'archive_staging', staged.session.sessionId + ':state'));
  assert.equal(await get(db, 'archive_staging', staged.session.sessionId + ':video:video-1'), undefined);
  db.close();
});

test('explicit staging finalization aborts if a concurrent writer changes the verified revision', async () => {
  const factory = new IDBFactory();
  const db = await openTestDb('paseka-stage-finalize-write-race', factory);
  const secondTabDb = await openTestDb('paseka-stage-finalize-write-race', factory);
  const archive = await makeArchive('backup-finalize-write-race');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  const header = await get(db, 'archive_staging', staged.session.sessionId);
  header.status = 'staging';
  await put(db, 'archive_staging', header);

  let releaseHash, notifyHash;
  const hashStarted = new Promise(resolve => { notifyHash = resolve; });
  const hashGate = new Promise(resolve => { releaseHash = resolve; });
  let firstHash = true;
  const gatedArchive = {
    ...Archive,
    async hashBlobChunks(...args) {
      const result = await Archive.hashBlobChunks(...args);
      if (firstHash) {
        firstHash = false;
        notifyHash();
        await hashGate;
      }
      return result;
    }
  };
  const finalize = Restore.finalizeStagedArchive(db, staged.session.sessionId, webcrypto, gatedArchive, () => true);
  await hashStarted;

  const stateEntryId = staged.session.sessionId + ':state';
  const stateEntry = await get(secondTabDb, 'archive_staging', stateEntryId);
  const currentHeader = await get(secondTabDb, 'archive_staging', staged.session.sessionId);
  const nextEpoch = currentHeader.stagingEpoch + 1;
  stateEntry.stagingRevision = nextEpoch;
  currentHeader.stagingEpoch = nextEpoch;
  await new Promise((resolve, reject) => {
    const tx = secondTabDb.transaction('archive_staging', 'readwrite');
    tx.objectStore('archive_staging').put(stateEntry);
    tx.objectStore('archive_staging').put(currentHeader);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  releaseHash();

  await assert.rejects(finalize, { code: 'STAGING_FINALIZE_CHANGED' });
  assert.equal((await get(db, 'archive_staging', staged.session.sessionId)).status, 'staging');
  db.close();
  secondTabDb.close();
});


test('concurrent finalizers converge on the same ready staging session', async () => {
  const db = await openTestDb('paseka-stage-concurrent-finalize');
  const archive = await makeArchive('backup-concurrent-finalize');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  const header = await get(db, 'archive_staging', staged.session.sessionId);
  header.status = 'staging';
  delete header.completedAt;
  await put(db, 'archive_staging', header);

  let waiting = 0, releaseHash;
  const hashGate = new Promise(resolve => { releaseHash = resolve; });
  let notifyBoth;
  const bothHashing = new Promise(resolve => { notifyBoth = resolve; });
  const gatedArchive = {
    ...Archive,
    async hashBlobChunks(...args) {
      const result = await Archive.hashBlobChunks(...args);
      if (waiting < 2) {
        waiting++;
        if (waiting === 2) notifyBoth();
        await hashGate;
      }
      return result;
    }
  };

  const first = Restore.finalizeStagedArchive(db, staged.session.sessionId, webcrypto, gatedArchive, () => true);
  const second = Restore.finalizeStagedArchive(db, staged.session.sessionId, webcrypto, gatedArchive, () => true);
  await bothHashing;
  releaseHash();
  const [a, b] = await Promise.all([first, second]);

  assert.equal(a.status, 'ready');
  assert.equal(b.status, 'ready');
  assert.equal(a.completedAt, b.completedAt, 'both callers must observe the same committed finalization');
  const stored = await get(db, 'archive_staging', staged.session.sessionId);
  assert.equal(stored.status, 'ready');
  assert.equal(stored.completedAt, a.completedAt);
  db.close();
});

test('rollback rejects snapshot metadata changed during asynchronous state validation', async () => {
  const db = await openTestDb('paseka-rollback-snapshot-metadata-race');
  const liveState = {
    meta: { schemaVersion: 12, revisionId: 'live-before-snapshot-metadata-race' },
    hives: [], families: [], records: []
  };
  const oldBlob = new Blob(['original rollback video'], { type: 'video/mp4' });
  const oldVideo = {
    id: 'live-video-metadata-race', hiveId: 'original-hive',
    capturedAt: '2026-11-15T08:00:00.000Z',
    bytes: oldBlob.size, mimeType: oldBlob.type, blob: oldBlob
  };
  await put(db, 'main', liveState, 'state');
  await put(db, 'entrance_media', oldVideo);
  const archive = await makeArchive('backup-rollback-snapshot-metadata-race');
  const staged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  const committed = await Restore.commitStagedArchive(
    db, staged.session.sessionId, liveState.meta.revisionId, webcrypto, Archive, () => true
  );
  const snapshotId = committed.rollbackSessionId + ':video:' + oldVideo.id;
  let injected = false;

  await assert.rejects(
    Restore.rollbackCommittedArchive(
      db, 'backup-rollback-snapshot-metadata-race', committed.state.meta.revisionId,
      webcrypto,
      async () => {
        const snapshot = await get(db, 'archive_staging', snapshotId);
        assert.ok(snapshot, 'rollback snapshot must exist before validation');
        snapshot.record = { ...snapshot.record, hiveId: 'tampered-hive' };
        await put(db, 'archive_staging', snapshot);
        injected = true;
        return true;
      }
    ),
    { code: 'ROLLBACK_SNAPSHOT_CHANGED' }
  );

  assert.equal(injected, true);
  assert.equal((await get(db, 'main', 'state')).meta.revisionId, committed.state.meta.revisionId);
  assert.equal((await getAll(db, 'entrance_media')).length, committed.importedVideoCount);
  const history = await get(db, 'archive_history', 'backup-rollback-snapshot-metadata-race');
  assert.equal(history.status, 'committed');
  assert.equal(history.rollbackAvailable, true);
  const preservedSnapshot = await get(db, 'archive_staging', snapshotId);
  assert.equal(preservedSnapshot.record.hiveId, 'tampered-hive', 'the suspect snapshot must remain available for diagnosis');
  db.close();
});

test('interrupted staged session cannot be finalized after recognition became durable',async()=>{
 const db=await openTestDb('paseka-stage-finalize-recognition-ledger');
 const archive=await makeArchive('backup-finalize-recognition-ledger');
 const staged=await Restore.stageArchiveForRestore(db,archive,webcrypto,Archive,()=>true);
 const header=await get(db,'archive_staging',staged.session.sessionId);
 header.status='staging';delete header.completedAt;
 await put(db,'archive_staging',header);
 const ledger={version:1,entries:[{videoId:'v1',source:'entrance_media',resultId:'result1',cleanupState:'blocked_archive_safety'}]};
 await put(db,'main',ledger,'video_recognition_ledger_v1');
 await assert.rejects(
  Restore.finalizeStagedArchive(db,staged.session.sessionId,webcrypto,Archive,()=>true),
  {code:'VIDEO_LEDGER_NOT_PRESERVED'});
 assert.equal((await get(db,'archive_staging',staged.session.sessionId)).status,'staging');
 assert.ok(await get(db,'archive_staging',staged.session.sessionId+':video:video-1'));
 assert.deepEqual(await get(db,'main','video_recognition_ledger_v1'),ledger);
 db.close();
});
test('a previously ready staged archive cannot be newly verified as safe after recognition',async()=>{
 const db=await openTestDb('paseka-stage-ready-recognition-ledger');
 const archive=await makeArchive('backup-ready-recognition-ledger');
 const staged=await Restore.stageArchiveForRestore(db,archive,webcrypto,Archive,()=>true);
 await put(db,'main',{version:1,entries:[{videoId:'v1',source:'entrance_media',resultId:'result1',cleanupState:'deleted'}]},'video_recognition_ledger_v1');
 await assert.rejects(Restore.finalizeStagedArchive(db,staged.session.sessionId,webcrypto,Archive,()=>true),{code:'VIDEO_LEDGER_NOT_PRESERVED'});
 assert.equal((await get(db,'archive_staging',staged.session.sessionId)).status,'ready');
 db.close();
});
test('recognition after the last staged file blocks the final ready status update',async()=>{
 const db=await openTestDb('paseka-stage-ready-race');
 const archive=await makeArchive('backup-last-staged-ready-race');
 let ledgerSave=null;
 await assert.rejects(
  Restore.stageArchiveForRestore(db,archive,webcrypto,Archive,()=>true,{
   onProgress(){
    ledgerSave=put(db,'main',{version:1,entries:[{videoId:'v1',source:'entrance_media',resultId:'result',cleanupState:'blocked_archive_safety'}]},'video_recognition_ledger_v1');
   }
  }),{code:'VIDEO_LEDGER_NOT_PRESERVED'});
 await ledgerSave;
 const sessions=await getAll(db,'archive_staging');
 assert.equal(sessions.filter(item=>item.kind==='session').length,1);
 assert.equal(sessions.find(item=>item.kind==='session').status,'failed');
 assert.equal(sessions.filter(item=>item.kind==='video').length,1,'staged bytes remain for explicit safe cleanup');
 db.close();
});

test('read-only staging audit locates recognized originals without deleting blobs',async()=>{
 const db=await openTestDb('paseka-staged-recognition-audit');
 const archive=await makeArchive('backup-staged-recognition-audit');
 const staged=await Restore.stageArchiveForRestore(db,archive,webcrypto,Archive,()=>true);
 const row=await get(db,'archive_staging',staged.session.sessionId);
 row.status='failed';
 await put(db,'archive_staging',row);
 const ledger={version:1,entries:[{videoId:'video-1',source:'entrance_media',resultId:'recognized-result',cleanupState:'deleted'}]};
 await put(db,'main',ledger,'video_recognition_ledger_v1');
 const before=await get(db,'archive_staging',staged.session.sessionId+':video:video-1');
 const audited=await Restore.inspectStagingRecognitionCopies(db);
 assert.equal(audited.ok,true);
 assert.equal(audited.matchedCopies,1);
 assert.equal(audited.sessions.length,1);
 assert.equal(audited.sessions[0].status,'failed');
 assert.equal(audited.sessions[0].recognizedCopies,1);
 assert.equal(audited.sessions[0].tombstonedCopies,1);
 assert.equal(audited.sessions[0].protectedByArchiveHistory,false);
 assert.equal(audited.sessions[0].action,'manual_review_required');
 const after=await get(db,'archive_staging',staged.session.sessionId+':video:video-1');
 assert.deepEqual(after,before,'audit must never delete or change the archived Blob');
 assert.deepEqual(await get(db,'main','video_recognition_ledger_v1'),ledger);
 db.close();
});
test('staging audit fails closed for malformed recognition history',async()=>{
 const db=await openTestDb('paseka-staged-recognition-corrupt');
 await put(db,'main',{version:2,entries:[]},'video_recognition_ledger_v1');
 const audit=await Restore.inspectStagingRecognitionCopies(db);
 assert.equal(audit.ok,false);assert.equal(audit.reason,'VIDEO_LEDGER_UNVERIFIED');
 db.close();
});
test('staging audit of an untouched legacy database is safe and empty',async()=>{
 const db=await openTestDb('paseka-staged-recognition-legacy');
 const audit=await Restore.inspectStagingRecognitionCopies(db);
 assert.equal(audit.ok,true);assert.equal(audit.matchedCopies,0);
 db.close();
});

test('staging recognition audit includes orphaned original copies after their session header vanished',async()=>{
 const db=await openTestDb('paseka-audit-orphaned-recognized-video');
 const archive=await makeArchive('backup-audit-orphaned-recognized-video');
 const staged=await Restore.stageArchiveForRestore(db,archive,webcrypto,Archive,()=>true);
 const key=staged.session.sessionId+':video:video-1';
 const before=await get(db,'archive_staging',key);
 await new Promise((resolve,reject)=>{
  const tx=db.transaction('archive_staging','readwrite');
  tx.objectStore('archive_staging').delete(staged.session.sessionId);
  tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
 });
 const ledger={version:1,entries:[{videoId:'video-1',source:'entrance_media',
  resultId:'success-result',cleanupState:'deleted'}]};
 await put(db,'main',ledger,'video_recognition_ledger_v1');
 const audit=await Restore.inspectStagingRecognitionCopies(db);
 assert.equal(audit.ok,true);
 assert.equal(audit.matchedCopies,1);
 assert.equal(audit.orphanedMatchedCopies,1);
 assert.equal(audit.sessions[0].missingSessionHeader,true);
 assert.equal(audit.sessions[0].status,'orphaned_header');
 assert.equal(audit.sessions[0].identityVerifiedByBytes,false);
 assert.equal(audit.sessions[0].action,'manual_review_required');
 assert.equal(audit.requiresManualReview,true);
 assert.deepEqual(await get(db,'archive_staging',key),before);
 assert.deepEqual(await get(db,'main','video_recognition_ledger_v1'),ledger);
 db.close();
});
test('staging recognition audit marks orphaned copies referenced by archive history',async()=>{
 const db=await openTestDb('paseka-audit-history-linked-orphan');
 const archive=await makeArchive('backup-audit-history-linked-orphan');
 const staged=await Restore.stageArchiveForRestore(db,archive,webcrypto,Archive,()=>true);
 await new Promise((resolve,reject)=>{
  const tx=db.transaction('archive_staging','readwrite');
  tx.objectStore('archive_staging').delete(staged.session.sessionId);
  tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
 });
 await put(db,'archive_history',{backupId:'history-audit',
  status:'committed',importSessionId:staged.session.sessionId});
 await put(db,'main',{version:1,entries:[{videoId:'video-1',source:'entrance_media',
  resultId:'verified',cleanupState:'blocked_archive_safety'}]},'video_recognition_ledger_v1');
 const audit=await Restore.inspectStagingRecognitionCopies(db);
 assert.equal(audit.sessions[0].protectedByArchiveHistory,true);
 assert.equal(audit.sessions[0].missingSessionHeader,true);
 assert.equal(audit.sessions[0].tombstonedCopies,0);
 db.close();
});
test('staging recognition audit refuses duplicate ledger identities',async()=>{
 const db=await openTestDb('paseka-audit-duplicate-ledger-id');
 const row={videoId:'same',source:'entrance_media',resultId:'r1',cleanupState:'deleted'};
 await put(db,'main',{version:1,entries:[row,{...row,resultId:'r2'}]},'video_recognition_ledger_v1');
 const audit=await Restore.inspectStagingRecognitionCopies(db);
 assert.equal(audit.ok,false);
 assert.equal(audit.reason,'VIDEO_LEDGER_DUPLICATE_IDENTITY');
 db.close();
});
test('staging recognition audit flags malformed video keys rather than declaring all copies safe',async()=>{
 const db=await openTestDb('paseka-audit-invalid-video-key');
 await put(db,'archive_staging',{id:'unexpected-video-key',sessionId:'odd',kind:'video',
  blob:new Blob(['private copied video'])});
 await put(db,'main',{version:1,entries:[]},'video_recognition_ledger_v1');
 const audit=await Restore.inspectStagingRecognitionCopies(db);
 assert.equal(audit.ok,true);
 assert.equal(audit.unclassifiedVideoKeyCount,1);
 assert.equal(audit.requiresManualReview,true);
 assert.ok(await get(db,'archive_staging','unexpected-video-key'));
 db.close();
});

test('a verified pre-recognition export cannot revive media after reopening a database with a tombstone', async t => {
  const modules = {};
  for (const file of ['paseka-sha256', 'video-recognition-ledger', 'video-archive-v2-guard', 'video-archive-v2-copy-inventory']) {
    const script = await readFile(new URL('../js/' + file + '.js', import.meta.url), 'utf8');
    new Function('window', script)(modules);
  }
  const factory = new IDBFactory();
  const name = 'archive-retention-integration';
  let db = await openTestDb(name, factory);
  t.after(() => db.close());
  const video = videoFixture();
  const hash = async blob => Buffer.from(await webcrypto.subtle.digest('SHA-256', await blob.arrayBuffer())).toString('hex');
  video.blobSha256 = await hash(video.blob);
  const state = stateFixture();
  state.records[0].media = [{kind: 'video', videoId: video.id, sourceBytes: video.bytes,
    sourceSha256: video.blobSha256, data: 'data:video/mp4;base64,ChQeKA=='}];
  await put(db, 'main', state, 'state');
  await put(db, 'entrance_media', video);
  const saved = await Archive.exportArchiveFromDatabase(db, webcrypto, {backupId: 'pending-original'});
  const parsed = await Archive.parseArchiveBlob(saved.blob);
  assert.equal(await Archive.verifyArchive(saved.blob, parsed, webcrypto), true);
  const entry = parsed.entries.find(row => row.metadata?.id === video.id);
  assert.equal(await hash(Archive.readArchiveEntry(saved.blob, entry)), video.blobSha256);

  const ledger = modules.PasekaVideoRecognitionLedger;
  const receipt = await ledger.recordRecognitionResult(db, {
    source: 'entrance_media', videoId: video.id, resultId: 'synthetic-result',
    processedSourceBytes: video.bytes, processedSourceSha256: video.blobSha256,
    expectedStateRevisionId: state.meta.revisionId, recognizedAt: '2026-11-21T00:00:00Z',
    recognitionSucceeded: true, recognitionStatus: 'completed', result: {note: 'test fixture'}
  });
  assert.equal(receipt.cleanupState, 'blocked_archive_safety');
  const stored = await get(db, 'main', 'video_recognition_ledger_v1');
  assert.equal(stored.entries[0].sourceSha256, video.blobSha256);
  assert.equal(stored.entries[0].sourceBytes, video.bytes);
  // Model a previous cleanup marker alongside surviving protected copies.
  stored.entries[0].cleanupState = 'deleted';
  await put(db, 'main', stored, 'video_recognition_ledger_v1');
  const rollback = {id: 'rollback:original', kind: 'rollback_video', originalId: video.id, record: video};
  const history = {backupId: 'prior', kind: 'v2_entrance_only', status: 'reverted_quarantined_unverified'};
  await put(db, 'archive_staging', rollback);
  await put(db, 'archive_history', history);
  await put(db, 'full_backup', {state}, 'previous');
  db.close();
  db = await openTestDb(name, factory);
  const report = await modules.PasekaVideoArchiveV2CopyInventory.auditManagedVideoCopies(db, modules.PasekaVideoArchiveV2Guard);
  assert.equal(report.recognitionEntries, 1);
  assert.equal(report.distinctIdentities, 2);
  assert.equal(report.copyCount, 4);
  assert.ok(report.issues.includes('deleted_tombstone_has_copy'));
  assert.equal(report.cleanupAuthorized, false);
  assert.equal(report.externalCopiesVerified, false);
  await assert.rejects(Restore.stageArchiveForRestore(db, saved.blob, webcrypto, Archive, () => true),
    {code: 'VIDEO_LEDGER_NOT_PRESERVED'});
  assert.deepEqual(await getAll(db, 'archive_history'), [history]);
  const staged = await getAll(db, 'archive_staging');
  assert.deepEqual(staged.map(row => row.id), [rollback.id]);
  assert.equal(await hash(staged[0].record.blob), video.blobSha256);
  assert.deepEqual(await get(db, 'main', 'state'), state);
  assert.deepEqual(await get(db, 'main', 'video_recognition_ledger_v1'), stored);
  assert.deepEqual(await get(db, 'full_backup', 'previous'), {state});
  assert.equal(await hash((await get(db, 'entrance_media', video.id)).blob), video.blobSha256);

  // Simulate a later device state with history but no live entrance original.
  const clean = await openTestDb('archive-retention-after-cleanup', factory);
  t.after(() => clean.close());
  await put(clean, 'main', stored, 'video_recognition_ledger_v1');
  await put(clean, 'main', stateFixture('current diary'), 'state');
  await assert.rejects(Restore.stageArchiveForRestore(clean, saved.blob, webcrypto, Archive, () => true),
    {code: 'VIDEO_LEDGER_NOT_PRESERVED'});
  assert.deepEqual(await getAll(clean, 'entrance_media'), []);
  assert.deepEqual(await getAll(clean, 'archive_staging'), []);
  assert.deepEqual(await get(clean, 'main', 'state'), stateFixture('current diary'));
  assert.deepEqual(await get(clean, 'main', 'video_recognition_ledger_v1'), stored);
});


for(const [storeName,value,key] of [
 ['archive_staging',{id:'v2pending:protected',sessionId:'v2pending:protected',
   kind:'v2_pending_session'},undefined],
 ['archive_history',{backupId:'protected',kind:'v2_pending_stage_only'},undefined],
 ['full_backup',{kind:'v2_entrance_only_rollback_unverified'},'v2entrance:protected']
]){
 test('PASEKA01 cannot stage over protected PASEKA02 '+storeName+' without a ledger',async()=>{
  const db=await openTestDb('legacy-cross-v2-'+storeName);
  await put(db,'main',stateFixture('live diary'),'state');
  await put(db,storeName,value,key);
  const input=await makeArchive('import-legacy-'+storeName);
  await assert.rejects(
   Restore.stageArchiveForRestore(db,input,webcrypto,Archive,()=>true),
   {code:'VIDEO_LEGACY_RESTORE_V2_PROTECTED'});
  assert.equal((await get(db,storeName,key??(storeName==='archive_staging'?'v2pending:protected':'protected')))!=null,true);
  assert.equal((await get(db,'main','video_recognition_ledger_v1')),undefined);
  assert.deepEqual(await get(db,'main','state'),stateFixture('live diary'));
  assert.equal((await getAll(db,'archive_staging')).filter(row=>row.kind==='session').length,0);
  assert.equal((await getAll(db,'entrance_media')).length,0);
  db.close();
 });
}
