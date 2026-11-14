import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const codecSource = await readFile(new URL('../js/paseka-archive.js', import.meta.url), 'utf8');
const restoreSource = await readFile(new URL('../js/paseka-archive-restore.js', import.meta.url), 'utf8');
new Function(codecSource)();
new Function(restoreSource)();
const Archive = globalThis.PasekaArchive;
const Restore = globalThis.PasekaArchiveRestore;

function openTestDb(name) {
  const factory = new IDBFactory();
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
async function makeArchive(backupId, note = 'archive state') {
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
          id: video.id, hiveId: video.hiveId, capturedAt: video.capturedAt,
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
  assert.equal(history.revertedRevisionId, rolledBack.state.meta.revisionId);
  assert.equal(importSession.status, 'reverted');
  assert.equal(importSession.backupId, undefined);
  assert.equal(rollbackSession.status, 'used');

  const restaged = await Restore.stageArchiveForRestore(db, archive, webcrypto, Archive, () => true);
  assert.equal(restaged.session.backupId, 'backup-atomic-rollback');
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


test('full archive restore UI requires staging, explicit confirmation, and offers rollback', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="fullArchiveFile"'));
  assert.ok(html.includes('onclick="prepareFullArchiveRestore()"'));
  assert.ok(html.includes('onclick="commitFullArchiveRestore()"'));
  assert.ok(html.includes('onclick="cancelFullArchiveRestore()"'));
  assert.ok(html.includes('function validateFullArchiveImportState(state)'));
  assert.ok(html.includes('PasekaArchiveRestore.stageArchiveForRestore('));
  assert.ok(html.includes('PasekaArchiveRestore.commitStagedArchive('));
  assert.ok(html.includes('PasekaArchiveRestore.rollbackCommittedArchive('));
  assert.ok(html.includes('PasekaArchiveRestore.discardArchiveRollbackSnapshot('));
  assert.ok(html.includes('function prepareMigratedArchiveState(state)'));
  assert.ok(html.includes('function archiveRestoreErrorText(error)'));
  assert.ok(html.includes('Недостаточно свободного места для временной копии и точки отката'));
  assert.ok(html.includes('Точка отката хранит прежние видео и может занимать много места'));
});
