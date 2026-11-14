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
    if (key === undefined) tx.objectStore(storeName).put(value);
    else tx.objectStore(storeName).put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
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
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const fulfilled = results.filter(result => result.status === 'fulfilled');
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
