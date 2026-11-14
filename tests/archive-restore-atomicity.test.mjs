import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const shaSource = await readFile(new URL('../js/paseka-sha256.js', import.meta.url), 'utf8');
const source = await readFile(new URL('../js/paseka-archive-restore.js', import.meta.url), 'utf8');
const appWindow = {};
new Function('window', shaSource)(appWindow);
new Function('window', source)(appWindow);
const api = appWindow.PasekaArchiveRestore;

async function makeDatabase(factory = new IDBFactory()) {
  const request = factory.open('archive-cleanup-test', 1);
  request.onupgradeneeded = () => {
    const staging = request.result.createObjectStore('archive_staging', { keyPath: 'id' });
    staging.createIndex('sessionId', 'sessionId');
    staging.createIndex('kind', 'kind');
    staging.createIndex('backupId', 'backupId');
    request.result.createObjectStore('archive_history', { keyPath: 'backupId' });
    request.result.createObjectStore('main');
    request.result.createObjectStore('full_backup');
    request.result.createObjectStore('entrance_media', { keyPath: 'id' });
  };
  const db = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return db;
}

async function seed(db, session) {
  const tx = db.transaction('archive_staging', 'readwrite');
  const store = tx.objectStore('archive_staging');
  store.put(session);
  store.put({ id: session.id + ':state', sessionId: session.id, kind: 'state', blob: new Blob(['state']) });
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('seed failed'));
  });
}

function trackedDb(db) {
  const modes = [];
  return {
    modes,
    objectStoreNames: db.objectStoreNames,
    transaction(...args) {
      modes.push(args[1] || 'readonly');
      return db.transaction(...args);
    }
  };
}

test('staged cleanup validates and deletes within one readwrite transaction', async () => {
  const db = await makeDatabase();
  await seed(db, { id: 'ready-1', sessionId: 'ready-1', kind: 'session', status: 'ready' });
  const tracked = trackedDb(db);

  assert.equal(await api.discardArchiveRestoreSession(tracked, 'ready-1'), true);
  assert.deepEqual(tracked.modes, ['readwrite']);

  const verify = db.transaction('archive_staging', 'readonly');
  const remaining = await new Promise((resolve, reject) => {
    const request = verify.objectStore('archive_staging').index('sessionId').getAll('ready-1');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal(remaining.length, 0);
  db.close();
});

test('orphaned staging rows are cleaned when their session header is missing', async () => {
  const db = await makeDatabase();
  const tx = db.transaction('archive_staging', 'readwrite');
  tx.objectStore('archive_staging').put({
    id: 'orphan-1:video:lost-header',
    sessionId: 'orphan-1',
    kind: 'video',
    blob: new Blob(['orphan'])
  });
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('orphan setup failed'));
  });

  assert.equal(await api.discardArchiveRestoreSession(db, 'orphan-1'), true);
  const verify = db.transaction('archive_staging', 'readonly');
  const remaining = await new Promise((resolve, reject) => {
    const request = verify.objectStore('archive_staging').index('sessionId').getAll('orphan-1');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal(remaining.length, 0);
  db.close();
});

test('orphaned staging rows referenced by archive history are preserved', async () => {
  const db = await makeDatabase();
  const tx = db.transaction(['archive_staging', 'archive_history'], 'readwrite');
  tx.objectStore('archive_staging').put({
    id: 'orphan-referenced:state',
    sessionId: 'orphan-referenced',
    kind: 'state',
    blob: new Blob(['state'])
  });
  tx.objectStore('archive_history').put({
    backupId: 'backup-referenced',
    status: 'committed',
    importSessionId: 'orphan-referenced'
  });
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('referenced orphan setup failed'));
  });

  await assert.rejects(
    api.discardArchiveRestoreSession(db, 'orphan-referenced'),
    error => error.code === 'ORPHANED_STAGING_REFERENCED'
  );
  const verify = db.transaction('archive_staging', 'readonly');
  const remaining = await new Promise((resolve, reject) => {
    const request = verify.objectStore('archive_staging').index('sessionId').getAll('orphan-referenced');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal(remaining.length, 1);
  db.close();
});

test('committed imports remain protected by the same atomic cleanup transaction', async () => {
  const db = await makeDatabase();
  await seed(db, { id: 'committed-1', sessionId: 'committed-1', kind: 'session', status: 'committed' });
  const tracked = trackedDb(db);

  await assert.rejects(
    api.discardArchiveRestoreSession(tracked, 'committed-1'),
    error => error.code === 'COMMITTED_IMPORT_PROTECTED'
  );
  assert.deepEqual(tracked.modes, ['readwrite']);

  const verify = db.transaction('archive_staging', 'readonly');
  const remaining = await new Promise((resolve, reject) => {
    const request = verify.objectStore('archive_staging').index('sessionId').getAll('committed-1');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal(remaining.length, 2);
  db.close();
});

test('rollback snapshots cannot be removed by staged-session cleanup', async () => {
  const db = await makeDatabase();
  await seed(db, { id: 'rollback-1', sessionId: 'rollback-1', kind: 'rollback_session', status: 'ready' });
  const tracked = trackedDb(db);

  await assert.rejects(
    api.discardArchiveRestoreSession(tracked, 'rollback-1'),
    error => error.code === 'ROLLBACK_SNAPSHOT_PROTECTED'
  );
  assert.deepEqual(tracked.modes, ['readwrite']);
  db.close();
});


test('each staged blob and its stagedCount are committed in the same readwrite transaction', async () => {
  const db = await makeDatabase();
  const tracked = trackedDb(db);
  const cryptoProvider = {
    getRandomValues(bytes) { bytes.fill(7); return bytes; },
    subtle: { async digest() { return new Uint8Array(32).buffer; } }
  };
  const stateBlob = new Blob(['state']);
  const videoA = new Blob(['video-a']);
  const videoB = new Blob(['video-b']);
  const manifest = {
    entries: [
      { kind: 'state', size: stateBlob.size, chunkSha256: [] },
      { kind: 'entrance_video', path: 'videos/a.mp4', size: videoA.size, chunkSize: 1024, chunkSha256: [], metadata: { id: 'video-a', hiveId: 'hive-a' } },
      { kind: 'entrance_video', path: 'videos/b.mp4', size: videoB.size, chunkSize: 1024, chunkSha256: [], metadata: { id: 'video-b', hiveId: 'hive-b' } }
    ]
  };
  const archiveApi = {
    async validateArchiveForRestore() {
      return {
        backupId: 'atomic-stage-backup',
        createdAt: '2026-11-14T00:00:00.000Z',
        schemaVersion: 1,
        archiveBytes: 100,
        manifest,
        stateBlob,
        videoEntries: [
          { ...manifest.entries[1], blob: videoA, orphanVideoReference: false },
          { ...manifest.entries[2], blob: videoB, orphanVideoReference: false }
        ],
        orphanVideoIds: []
      };
    }
  };

  const progress = [];
  const result = await api.stageArchiveForRestore(
    tracked,
    new Blob(['archive']),
    cryptoProvider,
    archiveApi,
    async () => true,
    { onProgress: value => progress.push(value.staged) }
  );

  assert.equal(result.session.status, 'ready');
  assert.equal(result.session.stagedCount, 3);
  assert.equal(result.session.stagingEpoch, 3);
  assert.deepEqual(progress, [2, 3]);
  // Session creation, three atomic entry+counter writes, and final ready status.
  assert.deepEqual(tracked.modes, ['readonly', 'readonly', 'readonly', 'readwrite', 'readwrite', 'readwrite', 'readwrite', 'readwrite']);

  const verify = db.transaction('archive_staging', 'readonly');
  const stored = await new Promise((resolve, reject) => {
    const request = verify.objectStore('archive_staging').get(result.session.id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal(stored.stagedCount, 3);
  assert.equal(stored.stagingEpoch, 3);
  assert.equal(stored.status, 'ready');

  const entries = await new Promise((resolve, reject) => {
    const request = verify.objectStore('archive_staging').index('sessionId').getAll(result.session.id);
    request.onsuccess = () => resolve(request.result.filter(record => record.kind !== 'session'));
    request.onerror = () => reject(request.error);
  });
  assert.deepEqual(entries.map(record => record.stagingRevision).sort((a, b) => a - b), [1, 2, 3]);
  db.close();
});


test('staging metadata fingerprint is stable and changes when an entry revision changes', async () => {
  const db = await makeDatabase();
  const cryptoProvider = {
    getRandomValues(bytes) { bytes.fill(9); return bytes; }, subtle: { async digest(_, data) { const hash = createHash('sha256').update(Buffer.from(data)).digest(); return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength); } },
    subtle: { async digest() { return new Uint8Array(32).buffer; } }
  };
  const stateBlob = new Blob([JSON.stringify({
    app: 'Paseka',
    state: { meta: { schemaVersion: 1 }, hives: [] }
  })]);
  const manifest = {
    backupId: 'fingerprint-backup',
    schemaVersion: 1,
    entries: [{ kind: 'state', size: stateBlob.size, chunkSha256: [] }]
  };
  const archiveApi = {
    async validateArchiveForRestore() {
      return {
        backupId: manifest.backupId,
        createdAt: '2026-11-14T00:00:00.000Z',
        schemaVersion: 1,
        archiveBytes: stateBlob.size,
        manifest,
        stateBlob,
        videoEntries: [],
        orphanVideoIds: []
      };
    },
    async hashBlobChunks() { return []; }
  };
  const staged = await api.stageArchiveForRestore(db, new Blob(['archive']), cryptoProvider, archiveApi, async () => true);
  const first = await api.getStagedArchive(db, staged.session.id, cryptoProvider, archiveApi, async () => true);
  const second = await api.getStagedArchive(db, staged.session.id, cryptoProvider, archiveApi, async () => true);
  assert.match(first.stagingMetadataFingerprint, /^[a-f0-9]{16}$/);
  assert.equal(first.stagingMetadataFingerprint, second.stagingMetadataFingerprint);

  const tx = db.transaction('archive_staging', 'readwrite');
  const store = tx.objectStore('archive_staging');
  const request = store.get(staged.session.id + ':state');
  request.onsuccess = () => store.put({ ...request.result, stagingRevision: request.result.stagingRevision + 1 });
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('mutation failed'));
  });
  const changed = await api.getStagedArchive(db, staged.session.id, cryptoProvider, archiveApi, async () => true);
  assert.notEqual(changed.stagingMetadataFingerprint, first.stagingMetadataFingerprint);
  db.close();
});


function mediaFingerprint(records) {
  const canonical = (records || []).map(record => {
    const blob = record.blob;
    return [record.id, typeof record.blobSha256 === 'string' ? record.blobSha256 : null,
      typeof record.hiveId === 'string' ? record.hiveId : null,
      record.orphanedHiveReference === true,
      typeof record.capturedAt === 'string' ? record.capturedAt : null,
      Number.isFinite(record.durationSec) ? record.durationSec : null,
      Number.isFinite(record.width) ? record.width : null,
      Number.isFinite(record.height) ? record.height : null,
      Number.isFinite(record.bytes) ? record.bytes : (blob && Number.isFinite(blob.size) ? blob.size : null),
      blob && Number.isFinite(blob.size) ? blob.size : null,
      blob && typeof blob.type === 'string' ? blob.type : null];
  }).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
  return JSON.stringify(['PASEKA-MEDIA-FINGERPRINT',3,canonical]);
}

async function seedRollback(db, { currentVideos = [] } = {}) {
  const importedBlob = new Blob(['imported'], { type: 'video/mp4' });
  const importedVideo = { id: 'imported-video', blob: importedBlob, blobSha256: createHash('sha256').update(Buffer.from('imported')).digest('hex'), capturedAt: '2026-11-14T10:00:00.000Z' };
  const tx = db.transaction(['main', 'entrance_media', 'archive_staging', 'archive_history'], 'readwrite');
  tx.objectStore('main').put({ meta: { revisionId: 'imported-revision' }, hives: [], auditLog: [] }, 'state');
  for (const video of currentVideos.length ? currentVideos : [importedVideo]) tx.objectStore('entrance_media').put(video);
  const staging = tx.objectStore('archive_staging');
  staging.put({ id: 'rollback-1', sessionId: 'rollback-1', kind: 'rollback_session', sourceBackupId: 'backup-1', status: 'ready', totalEntries: 1, stagedCount: 1 });
  staging.put({ id: 'rollback-1:state', sessionId: 'rollback-1', kind: 'rollback_state', state: { meta: { revisionId: 'old-revision' }, hives: [], auditLog: [] } });
  staging.put({ id: 'import-1', sessionId: 'import-1', kind: 'session', backupId: 'backup-1', status: 'committed' });
  tx.objectStore('archive_history').put({
    backupId: 'backup-1',
    fingerprint: 'archive-fingerprint',
    status: 'committed',
    rollbackSessionId: 'rollback-1',
    importSessionId: 'import-1',
    importedMediaFingerprint: mediaFingerprint([importedVideo])
  });
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('rollback seed failed'));
  });
  return importedVideo;
}

test('rollback refuses to erase videos added after archive import', async () => {
  const db = await makeDatabase();
  const importedVideo = await seedRollback(db);
  const addedBlob = new Blob(['new'], { type: 'video/mp4' });
  const addedVideo = { id: 'new-video', blob: addedBlob, blobSha256: createHash('sha256').update(Buffer.from('new')).digest('hex'), capturedAt: '2026-11-14T11:00:00.000Z' };
  const add = db.transaction('entrance_media', 'readwrite');
  add.objectStore('entrance_media').put(addedVideo);
  await new Promise((resolve, reject) => {
    add.oncomplete = resolve;
    add.onabort = add.onerror = () => reject(add.error || new Error('video insert failed'));
  });

  await assert.rejects(
    api.rollbackCommittedArchive(db, 'backup-1', 'imported-revision', {
      getRandomValues(bytes) { bytes.fill(3); return bytes; }, subtle: { async digest(_, data) { const hash = createHash('sha256').update(Buffer.from(data)).digest(); return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength); } }
    }, async () => true),
    error => error.code === 'ROLLBACK_MEDIA_CHANGED'
  );

  const verify = db.transaction(['main', 'entrance_media', 'archive_history'], 'readonly');
  const [state, videos, history] = await Promise.all([
    new Promise((resolve, reject) => { const q = verify.objectStore('main').get('state'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); }),
    new Promise((resolve, reject) => { const q = verify.objectStore('entrance_media').getAll(); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); }),
    new Promise((resolve, reject) => { const q = verify.objectStore('archive_history').get('backup-1'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); })
  ]);
  assert.equal(state.meta.revisionId, 'imported-revision');
  assert.deepEqual(videos.map(video => video.id).sort(), [importedVideo.id, addedVideo.id].sort());
  assert.equal(history.status, 'committed');
  db.close();
});

test('rollback proceeds when entrance videos still match the imported baseline', async () => {
  const db = await makeDatabase();
  await seedRollback(db);
  const result = await api.rollbackCommittedArchive(db, 'backup-1', 'imported-revision', {
    getRandomValues(bytes) { bytes.fill(4); return bytes; }, subtle: { async digest(_, data) { const hash = createHash('sha256').update(Buffer.from(data)).digest(); return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength); } }
  }, async () => true);
  assert.equal(result.restoredVideoCount, 0);
  assert.equal(result.state.meta.revisionId.length > 0, true);
  const verify = db.transaction(['main', 'entrance_media', 'archive_history'], 'readonly');
  const videos = await new Promise((resolve, reject) => {
    const q = verify.objectStore('entrance_media').getAll();
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
  assert.equal(videos.length, 0);
  db.close();
});


test('archive staging captures a canonical video-library baseline atomically with its session', async () => {
  const db = await makeDatabase();
  const initialVideo = { id: 'existing-video', hiveId: 'hive-1', capturedAt: '2026-11-14T08:00:00.000Z', blob: new Blob(['existing'], { type: 'video/mp4' }), bytes: 8 };
  const seedTx = db.transaction('entrance_media', 'readwrite');
  seedTx.objectStore('entrance_media').put(initialVideo);
  await new Promise((resolve, reject) => {
    seedTx.oncomplete = resolve;
    seedTx.onabort = seedTx.onerror = () => reject(seedTx.error || new Error('media seed failed'));
  });
  const cryptoProvider = {
    getRandomValues(bytes) { bytes.fill(11); return bytes; },
    subtle: { async digest() { return new Uint8Array(32).buffer; } }
  };
  const stateBlob = new Blob([JSON.stringify({ app: 'Paseka', state: { meta: { schemaVersion: 1 }, hives: [] } })]);
  const manifest = { entries: [{ kind: 'state', size: stateBlob.size, chunkSha256: [] }] };
  const archiveApi = {
    async validateArchiveForRestore() {
      return { backupId: 'media-baseline-backup', createdAt: '2026-11-14T00:00:00.000Z', schemaVersion: 1, archiveBytes: stateBlob.size, manifest, stateBlob, videoEntries: [], orphanVideoIds: [] };
    },
    async hashBlobChunks() { return []; }
  };
  const staged = await api.stageArchiveForRestore(db, new Blob(['archive']), cryptoProvider, archiveApi, async () => true);
  assert.equal(typeof staged.session.baselineMediaFingerprint, 'string');
  assert.equal(staged.session.baselineMediaFingerprint.startsWith('["PASEKA-MEDIA-FINGERPRINT",3,'), true);
  const read = db.transaction('archive_staging', 'readonly');
  const stored = await new Promise((resolve, reject) => {
    const q = read.objectStore('archive_staging').get(staged.session.id);
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
  assert.equal(stored.baselineMediaFingerprint, staged.session.baselineMediaFingerprint);
  db.close();
});


test('rollback rejects same-size same-type video byte replacement', async () => {
  const db = await makeDatabase();
  const importedVideo = await seedRollback(db);
  const replacement = { ...importedVideo, blob: new Blob(['IMPORTED'], { type: 'video/mp4' }) };
  const tx = db.transaction('entrance_media', 'readwrite');
  tx.objectStore('entrance_media').put(replacement);
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error || new Error('replacement failed')); });
  await assert.rejects(api.rollbackCommittedArchive(db, 'backup-1', 'imported-revision', {
    getRandomValues(bytes) { bytes.fill(8); return bytes; }, subtle: { async digest(_, data) { const hash = createHash('sha256').update(Buffer.from(data)).digest(); return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength); } }
  }, async () => true), error => error.code === 'ROLLBACK_MEDIA_CONTENT_CHANGED');
  db.close();
});

test('rollback fingerprint ignores harmless video metadata additions', async () => {
  const db = await makeDatabase();
  const importedVideo = await seedRollback(db);
  const tx = db.transaction('entrance_media', 'readwrite');
  tx.objectStore('entrance_media').put({ ...importedVideo, syncStatus: 'not-synced' });
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error || new Error('metadata update failed')); });
  const result = await api.rollbackCommittedArchive(db, 'backup-1', 'imported-revision', {
    getRandomValues(bytes) { bytes.fill(9); return bytes; }, subtle: { async digest(_, data) { const hash = createHash('sha256').update(Buffer.from(data)).digest(); return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength); } }
  }, async () => true);
  assert.equal(result.rollbackSnapshotRemoved, true);
  db.close();
});

test('rollback detects changes to orphaned hive reference metadata', async () => {
  const db = await makeDatabase();
  const importedVideo = await seedRollback(db);
  const tx = db.transaction('entrance_media', 'readwrite');
  tx.objectStore('entrance_media').put({ ...importedVideo, orphanedHiveReference: true });
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error || new Error('metadata update failed')); });
  await assert.rejects(api.rollbackCommittedArchive(db, 'backup-1', 'imported-revision', {
    getRandomValues(bytes) { bytes.fill(10); return bytes; },
    subtle: { async digest(_, data) { const hash = createHash('sha256').update(Buffer.from(data)).digest(); return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength); } }
  }, async () => true), error => error.code === 'ROLLBACK_MEDIA_CHANGED');
  db.close();
});


function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function gatedHasher(expectedCalls) {
  const started = deferred();
  const release = deferred();
  const original = appWindow.PasekaSha256;
  let calls = 0;
  appWindow.PasekaSha256 = {
    async hashBlobHex(blob, options) {
      calls++;
      if (calls >= expectedCalls) started.resolve();
      await release.promise;
      return original.hashBlobHex(blob, options);
    }
  };
  return {
    started: started.promise,
    release() {
      release.resolve();
      appWindow.PasekaSha256 = original;
    }
  };
}
function gatedSnapshotHasher(expectedCalls) {
  const started = deferred();
  const release = deferred();
  const original = appWindow.PasekaSha256;
  let snapshotCalls = 0;
  appWindow.PasekaSha256 = {
    async hashBlobHex(blob, options) {
      if (await blob.text() === 'previous') {
        snapshotCalls++;
        if (snapshotCalls >= expectedCalls) {
          started.resolve();
          await release.promise;
        }
      }
      return original.hashBlobHex(blob, options);
    }
  };
  return {
    started: started.promise,
    release() {
      release.resolve();
      appWindow.PasekaSha256 = original;
    }
  };
}
function testCryptoProvider() {
  return { getRandomValues(bytes) { bytes.fill(13); return bytes; } };
}

test('rollback rechecks fresh history after Phase A validation', async () => {
  const db = await makeDatabase();
  await seedRollback(db);
  const cryptoProvider = testCryptoProvider();
  const hasherGate = gatedHasher(1);
  const pending = api.rollbackCommittedArchive(db, 'backup-1', 'imported-revision', cryptoProvider, async () => true);
  await hasherGate.started;

  const mutation = db.transaction('archive_history', 'readwrite');
  const historyStore = mutation.objectStore('archive_history');
  const historyRequest = historyStore.get('backup-1');
  historyRequest.onsuccess = () => historyStore.put({ ...historyRequest.result, rollbackSessionId: 'replaced-session' });
  await new Promise((resolve, reject) => {
    mutation.oncomplete = resolve;
    mutation.onabort = mutation.onerror = () => reject(mutation.error || new Error('history mutation failed'));
  });
  hasherGate.release();

  await assert.rejects(pending, error => error.code === 'ROLLBACK_NOT_AVAILABLE');
  const verify = db.transaction('main', 'readonly');
  const state = await new Promise((resolve, reject) => {
    const request = verify.objectStore('main').get('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal(state.meta.revisionId, 'imported-revision');
  db.close();
});

test('only one of two concurrent rollbacks can consume the same snapshot', async () => {
  const db = await makeDatabase();
  await seedRollback(db);
  const cryptoProvider = testCryptoProvider();
  const hasherGate = gatedHasher(2);
  const first = api.rollbackCommittedArchive(db, 'backup-1', 'imported-revision', cryptoProvider, async () => true);
  const second = api.rollbackCommittedArchive(db, 'backup-1', 'imported-revision', cryptoProvider, async () => true);
  await hasherGate.started;
  hasherGate.release();

  const results = await Promise.allSettled([first, second]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  const rejected = results.find(result => result.status === 'rejected');
  assert.ok(['ROLLBACK_NOT_AVAILABLE', 'ROLLBACK_SNAPSHOT_MISSING', 'ROLLBACK_SNAPSHOT_CHANGED'].includes(rejected.reason.code));
  const verify = db.transaction(['main', 'archive_history', 'archive_staging'], 'readonly');
  const [state, history, snapshot] = await Promise.all([
    new Promise((resolve, reject) => { const q = verify.objectStore('main').get('state'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); }),
    new Promise((resolve, reject) => { const q = verify.objectStore('archive_history').get('backup-1'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); }),
    new Promise((resolve, reject) => { const q = verify.objectStore('archive_staging').get('rollback-1'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); })
  ]);
  assert.equal(state.meta.revisionId.length > 0, true);
  assert.equal(history.status, 'reverted');
  assert.equal(snapshot, undefined);
  db.close();
});

test('rollback refuses legacy videos without a saved content hash', async () => {
  const db = await makeDatabase();
  const importedVideo = await seedRollback(db);
  const tx = db.transaction('entrance_media', 'readwrite');
  tx.objectStore('entrance_media').put({ ...importedVideo, blobSha256: undefined });
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('legacy media mutation failed'));
  });

  await assert.rejects(api.rollbackCommittedArchive(db, 'backup-1', 'imported-revision', {
    getRandomValues(bytes) { bytes.fill(13); return bytes; },
    async digest(_, data) {
      const hash = createHash('sha256').update(Buffer.from(data)).digest();
      return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength);
    }
  }, async () => true), error => error.code === 'ROLLBACK_MEDIA_HASH_MISSING');
  db.close();
});


function archiveTestCrypto() {
  let sequence = 0;
  return {
    getRandomValues(bytes) {
      bytes.fill(++sequence);
      return bytes;
    },
    subtle: {
      async digest(_, data) {
        const hash = createHash('sha256').update(Buffer.from(data)).digest();
        return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength);
      }
    }
  };
}

async function stageMinimalArchive(db, { archiveApiOverrides = {} } = {}) {
  const stateBlob = new Blob([JSON.stringify({
    app: 'Paseka',
    state: { meta: { schemaVersion: 1 }, hives: [], auditLog: [] }
  })]);
  const manifest = {
    backupId: 'commit-integration-backup',
    schemaVersion: 1,
    entries: [{ kind: 'state', size: stateBlob.size, chunkSha256: [] }]
  };
  const archiveApi = {
    async validateArchiveForRestore() {
      return {
        backupId: manifest.backupId,
        createdAt: '2026-11-14T00:00:00.000Z',
        schemaVersion: 1,
        archiveBytes: stateBlob.size,
        manifest,
        stateBlob,
        videoEntries: [],
        orphanVideoIds: []
      };
    },
    async hashBlobChunks() { return []; },
    ...archiveApiOverrides
  };
  const cryptoProvider = archiveTestCrypto();
  const staged = await api.stageArchiveForRestore(
    db, new Blob(['archive']), cryptoProvider, archiveApi, async () => true
  );
  return { staged, archiveApi, cryptoProvider };
}

test('archive commit writes imported state, history and rollback snapshot atomically', async () => {
  const db = await makeDatabase();
  const { staged, archiveApi, cryptoProvider } = await stageMinimalArchive(db);
  const result = await api.commitStagedArchive(
    db, staged.session.id, null, cryptoProvider, archiveApi, async () => true
  );

  assert.equal(result.history.status, 'committed');
  assert.equal(result.previousVideoCount, 0);
  assert.equal(result.importedVideoCount, 0);

  const tx = db.transaction(['main', 'entrance_media', 'archive_history', 'archive_staging'], 'readonly');
  const [state, videos, history, rollbackSession] = await Promise.all([
    new Promise((resolve, reject) => { const q = tx.objectStore('main').get('state'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); }),
    new Promise((resolve, reject) => { const q = tx.objectStore('entrance_media').getAll(); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); }),
    new Promise((resolve, reject) => { const q = tx.objectStore('archive_history').get('commit-integration-backup'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); }),
    new Promise((resolve, reject) => { const q = tx.objectStore('archive_staging').get(result.rollbackSessionId); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); })
  ]);
  assert.equal(state.meta.revisionId, result.state.meta.revisionId);
  assert.deepEqual(videos, []);
  assert.equal(history.status, 'committed');
  assert.equal(history.rollbackSessionId, result.rollbackSessionId);
  assert.equal(rollbackSession.kind, 'rollback_session');
  assert.equal(rollbackSession.status, 'ready');
  db.close();
});

test('committed archive and rollback snapshot survive closing and reopening IndexedDB', async () => {
  const factory = new IDBFactory();
  const db = await makeDatabase(factory);
  const seedTx = db.transaction('main', 'readwrite');
  seedTx.objectStore('main').put({
    meta: { schemaVersion: 1, revisionId: 'before-restart-revision' },
    hives: [{ id: 'hive-before-import', name: 'Старая пасека' }],
    auditLog: []
  }, 'state');
  await new Promise((resolve, reject) => {
    seedTx.oncomplete = resolve;
    seedTx.onabort = seedTx.onerror = () => reject(seedTx.error || new Error('initial state seed failed'));
  });

  const { staged, archiveApi, cryptoProvider } = await stageMinimalArchive(db);
  const committed = await api.commitStagedArchive(
    db, staged.session.id, 'before-restart-revision', cryptoProvider, archiveApi, async () => true
  );
  assert.equal(committed.history.status, 'committed');
  db.close();

  // A fresh connection simulates an application process restart while the
  // browser's durable IndexedDB database remains intact.
  const reopened = await makeDatabase(factory);
  const verify = reopened.transaction(['main', 'archive_history', 'archive_staging'], 'readonly');
  const [importedState, history, rollbackSession, importSession] = await Promise.all([
    new Promise((resolve, reject) => {
      const q = verify.objectStore('main').get('state');
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    }),
    new Promise((resolve, reject) => {
      const q = verify.objectStore('archive_history').get('commit-integration-backup');
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    }),
    new Promise((resolve, reject) => {
      const q = verify.objectStore('archive_staging').get(committed.rollbackSessionId);
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    }),
    new Promise((resolve, reject) => {
      const q = verify.objectStore('archive_staging').get(staged.session.id);
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    })
  ]);
  assert.equal(importedState.meta.revisionId, committed.state.meta.revisionId);
  assert.equal(history.status, 'committed');
  assert.equal(history.rollbackSessionId, committed.rollbackSessionId);
  assert.equal(rollbackSession.status, 'ready');
  assert.equal(importSession.status, 'committed');

  const rolledBack = await api.rollbackCommittedArchive(
    reopened, 'commit-integration-backup', importedState.meta.revisionId, cryptoProvider, async () => true
  );
  assert.equal(rolledBack.rollbackSnapshotRemoved, true);
  assert.deepEqual(rolledBack.state.hives, [{ id: 'hive-before-import', name: 'Старая пасека' }]);

  const finalTx = reopened.transaction(['main', 'archive_history'], 'readonly');
  const [restoredState, finalHistory] = await Promise.all([
    new Promise((resolve, reject) => {
      const q = finalTx.objectStore('main').get('state');
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    }),
    new Promise((resolve, reject) => {
      const q = finalTx.objectStore('archive_history').get('commit-integration-backup');
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    })
  ]);
  assert.deepEqual(restoredState.hives, [{ id: 'hive-before-import', name: 'Старая пасека' }]);
  assert.equal(finalHistory.status, 'reverted');
  reopened.close();
});

test('archive commit preserves videos added after staging and rejects the stale baseline', async () => {
  const db = await makeDatabase();
  const { staged, archiveApi, cryptoProvider } = await stageMinimalArchive(db);
  const blob = new Blob(['new-video'], { type: 'video/mp4' });
  const video = {
    id: 'added-during-staging',
    blob,
    blobSha256: createHash('sha256').update(Buffer.from('new-video')).digest('hex'),
    capturedAt: '2026-11-14T12:00:00.000Z'
  };
  const add = db.transaction('entrance_media', 'readwrite');
  add.objectStore('entrance_media').put(video);
  await new Promise((resolve, reject) => {
    add.oncomplete = resolve;
    add.onabort = add.onerror = () => reject(add.error || new Error('video insert failed'));
  });

  await assert.rejects(
    api.commitStagedArchive(db, staged.session.id, null, cryptoProvider, archiveApi, async () => true),
    error => error.code === 'RESTORE_MEDIA_CHANGED'
  );

  const verify = db.transaction(['main', 'entrance_media'], 'readonly');
  const [state, videos] = await Promise.all([
    new Promise((resolve, reject) => { const q = verify.objectStore('main').get('state'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); }),
    new Promise((resolve, reject) => { const q = verify.objectStore('entrance_media').getAll(); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); })
  ]);
  assert.equal(state, undefined);
  assert.equal(videos.length, 1);
  assert.equal(videos[0].id, video.id);
  db.close();
});


test('archive commit rejects staging metadata changed during Phase A validation', async () => {
  const db = await makeDatabase();
  const started = deferred();
  const release = deferred();
  let hashCalls = 0;
  const { staged, cryptoProvider, archiveApi } = await stageMinimalArchive(db);
  archiveApi.hashBlobChunks = async () => {
    hashCalls++;
    if (hashCalls === 1) {
      started.resolve();
      await release.promise;
    }
    return [];
  };

  const pending = api.commitStagedArchive(
    db, staged.session.id, null, cryptoProvider, archiveApi, async () => true
  );
  await started.promise;

  const mutation = db.transaction('archive_staging', 'readwrite');
  const store = mutation.objectStore('archive_staging');
  const request = store.get(staged.session.id + ':state');
  request.onsuccess = () => store.put({
    ...request.result,
    chunkSha256: ['a'.repeat(64)]
  });
  await new Promise((resolve, reject) => {
    mutation.oncomplete = resolve;
    mutation.onabort = mutation.onerror = () => reject(mutation.error || new Error('staging mutation failed'));
  });
  release.resolve();

  await assert.rejects(
    pending,
    error => error.code === 'STAGING_CONTENT_CHANGED'
  );
  const verify = db.transaction('main', 'readonly');
  const state = await new Promise((resolve, reject) => {
    const q = verify.objectStore('main').get('state');
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
  assert.equal(state, undefined);
  db.close();
});

test('archive commit abort after media.clear preserves prior state and video library', async () => {
  const db = await makeDatabase();
  const previousBlob = new Blob(['pre-import-video'], { type: 'video/mp4' });
  const previousVideo = {
    id: 'video-before-failed-commit',
    blob: previousBlob,
    blobSha256: createHash('sha256').update(Buffer.from('pre-import-video')).digest('hex'),
    capturedAt: '2026-11-14T09:00:00.000Z'
  };
  const seedTx = db.transaction(['main', 'entrance_media'], 'readwrite');
  seedTx.objectStore('main').put({
    meta: { revisionId: 'before-revision' },
    hives: [{ id: 'before-hive' }],
    auditLog: []
  }, 'state');
  seedTx.objectStore('entrance_media').put(previousVideo);
  await new Promise((resolve, reject) => {
    seedTx.oncomplete = resolve;
    seedTx.onabort = seedTx.onerror = () => reject(seedTx.error || new Error('initial state seed failed'));
  });

  const { staged, archiveApi, cryptoProvider } = await stageMinimalArchive(db);
  const injectedDb = {
    objectStoreNames: db.objectStoreNames,
    transaction(...args) {
      const tx = db.transaction(...args);
      return new Proxy(tx, {
        get(target, property) {
          if (property === 'objectStore') {
            return name => {
              const store = target.objectStore(name);
              if (name !== 'archive_history') return store;
              return new Proxy(store, {
                get(storeTarget, storeProperty) {
                  if (storeProperty === 'put') {
                    return () => {
                      throw new DOMException('Injected archive-history write failure', 'QuotaExceededError');
                    };
                  }
                  const value = Reflect.get(storeTarget, storeProperty, storeTarget);
                  return typeof value === 'function' ? value.bind(storeTarget) : value;
                }
              });
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        }
      });
    }
  };

  await assert.rejects(
    api.commitStagedArchive(injectedDb, staged.session.id, 'before-revision', cryptoProvider, archiveApi, async () => true),
    error => error && error.name === 'QuotaExceededError'
  );

  const verify = db.transaction(['main', 'entrance_media', 'archive_history', 'archive_staging'], 'readonly');
  const [state, videos, history, session] = await Promise.all([
    new Promise((resolve, reject) => { const q = verify.objectStore('main').get('state'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); }),
    new Promise((resolve, reject) => { const q = verify.objectStore('entrance_media').getAll(); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); }),
    new Promise((resolve, reject) => { const q = verify.objectStore('archive_history').get('commit-integration-backup'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); }),
    new Promise((resolve, reject) => { const q = verify.objectStore('archive_staging').get(staged.session.id); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); })
  ]);

  assert.equal(state.meta.revisionId, 'before-revision');
  assert.deepEqual(state.hives, [{ id: 'before-hive' }]);
  assert.equal(videos.length, 1);
  assert.equal(videos[0].id, previousVideo.id);
  assert.equal(await videos[0].blob.text(), 'pre-import-video');
  assert.equal(history, undefined);
  assert.equal(session.status, 'ready');
  db.close();
});



test('rollback re-hashes snapshot video bytes under the final transaction lock', async () => {
  const db = await makeDatabase();
  const importedVideo = await seedRollback(db);
  const snapshotBlob = new Blob(['previous'], { type: 'video/mp4' });
  const snapshotHash = createHash('sha256').update(Buffer.from('previous')).digest('hex');
  const prepare = db.transaction('archive_staging', 'readwrite');
  const staging = prepare.objectStore('archive_staging');
  const sessionRequest = staging.get('rollback-1');
  sessionRequest.onsuccess = () => {
    staging.put({ ...sessionRequest.result, totalEntries: 2, stagedCount: 2 });
    staging.put({
      id: 'rollback-1:video:previous',
      sessionId: 'rollback-1',
      kind: 'rollback_video',
      originalId: 'previous',
      record: {
        id: 'previous',
        blob: snapshotBlob,
        blobSha256: snapshotHash,
        capturedAt: '2026-11-14T08:00:00.000Z'
      }
    });
  };
  await new Promise((resolve, reject) => {
    prepare.oncomplete = resolve;
    prepare.onabort = prepare.onerror = () => reject(prepare.error || new Error('snapshot setup failed'));
  });

  const validationStarted = deferred();
  const releaseValidation = deferred();
  const cryptoProvider = {
    getRandomValues(bytes) { bytes.fill(17); return bytes; },
    subtle: {
      async digest(_, data) {
        const hash = createHash('sha256').update(Buffer.from(data)).digest();
        return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength);
      }
    }
  };
  const pendingRollback = api.rollbackCommittedArchive(
    db,
    'backup-1',
    'imported-revision',
    cryptoProvider,
    async () => {
      validationStarted.resolve();
      await releaseValidation.promise;
      return true;
    }
  );
  await validationStarted.promise;

  // Replace the stored Blob after Phase A has verified its checksum. Keep the
  // same byte length, MIME type and stale checksum to defeat metadata checks.
  const tamper = db.transaction('archive_staging', 'readwrite');
  const tamperStore = tamper.objectStore('archive_staging');
  const key = 'rollback-1:video:previous';
  const get = tamperStore.get(key);
  get.onsuccess = () => {
    tamperStore.put({
      ...get.result,
      record: { ...get.result.record, blob: new Blob(['TAMPERED'], { type: 'video/mp4' }) }
    });
  };
  await new Promise((resolve, reject) => {
    tamper.oncomplete = resolve;
    tamper.onabort = tamper.onerror = () => reject(tamper.error || new Error('snapshot tamper setup failed'));
  });
  releaseValidation.resolve();

  await assert.rejects(
    pendingRollback,
    error => error.code === 'ROLLBACK_SNAPSHOT_CONTENT_CHANGED'
  );
  const verify = db.transaction(['main', 'entrance_media', 'archive_staging'], 'readonly');
  const [state, videos, snapshot] = await Promise.all([
    new Promise((resolve, reject) => { const q = verify.objectStore('main').get('state'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); }),
    new Promise((resolve, reject) => { const q = verify.objectStore('entrance_media').getAll(); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); }),
    new Promise((resolve, reject) => { const q = verify.objectStore('archive_staging').get(key); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); })
  ]);
  assert.equal(state.meta.revisionId, 'imported-revision');
  assert.equal(videos.length, 1);
  assert.equal(videos[0].id, importedVideo.id);
  assert.equal(await snapshot.record.blob.text(), 'TAMPERED');
  db.close();
});


test('rollback detects concurrent snapshot mutation without holding a write transaction during hashing', async () => {
  const db = await makeDatabase();
  await seedRollback(db);
  const snapshotBlob = new Blob(['previous'], { type: 'video/mp4' });
  const snapshotHash = createHash('sha256').update(Buffer.from('previous')).digest('hex');
  const setup = db.transaction('archive_staging', 'readwrite');
  const setupStore = setup.objectStore('archive_staging');
  const sessionRequest = setupStore.get('rollback-1');
  sessionRequest.onsuccess = () => {
    setupStore.put({ ...sessionRequest.result, totalEntries: 2, stagedCount: 2 });
    setupStore.put({
      id: 'rollback-1:video:previous',
      sessionId: 'rollback-1',
      kind: 'rollback_video',
      originalId: 'previous',
      record: { id: 'previous', blob: snapshotBlob, blobSha256: snapshotHash }
    });
  };
  await new Promise((resolve, reject) => {
    setup.oncomplete = resolve;
    setup.onabort = setup.onerror = () => reject(setup.error || new Error('snapshot setup failed'));
  });

  const hasherGate = gatedSnapshotHasher(1);
  const cryptoProvider = testCryptoProvider();
  const rollback = api.rollbackCommittedArchive(
    db, 'backup-1', 'imported-revision', cryptoProvider, async () => true
  );
  await hasherGate.started;

  let competingWriteExecuted = false;
  const competingWrite = db.transaction('archive_staging', 'readwrite');
  const competingWriteDone = new Promise((resolve, reject) => {
    competingWrite.oncomplete = resolve;
    competingWrite.onabort = competingWrite.onerror = () => reject(competingWrite.error || new Error('competing write failed'));
  });
  const competingStore = competingWrite.objectStore('archive_staging');
  const competingRead = competingStore.get('rollback-1:video:previous');
  competingRead.onsuccess = () => {
    competingWriteExecuted = true;
    // If this transaction were allowed to run before the re-hash completed,
    // it would replace the snapshot with same-size bytes and stale metadata.
    if (competingRead.result) {
      competingStore.put({
        ...competingRead.result,
        record: { ...competingRead.result.record, blob: new Blob(['TAMPERED'], { type: 'video/mp4' }) }
      });
    }
  };
  await competingWriteDone;
  assert.equal(competingWriteExecuted, true, 'the short readonly/hash phase must not block unrelated writes');

  hasherGate.release();
  await assert.rejects(rollback, error => error.code === 'ROLLBACK_SNAPSHOT_CONTENT_CHANGED');
  const verify = db.transaction('archive_staging', 'readonly');
  const remaining = await new Promise((resolve, reject) => {
    const request = verify.objectStore('archive_staging').get('rollback-1:video:previous');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal(await remaining.record.blob.text(), 'TAMPERED', 'rollback must refuse to consume a snapshot changed during verification');
  db.close();
});

test('snapshot hash failure before commit preserves the complete rollback snapshot', async () => {
  const db = await makeDatabase();
  await seedRollback(db);
  const snapshotBlob = new Blob(['previous'], { type: 'video/mp4' });
  const snapshotHash = createHash('sha256').update(Buffer.from('previous')).digest('hex');
  const setup = db.transaction('archive_staging', 'readwrite');
  const setupStore = setup.objectStore('archive_staging');
  const sessionRequest = setupStore.get('rollback-1');
  sessionRequest.onsuccess = () => {
    setupStore.put({ ...sessionRequest.result, totalEntries: 2, stagedCount: 2 });
    setupStore.put({
      id: 'rollback-1:video:previous',
      sessionId: 'rollback-1',
      kind: 'rollback_video',
      originalId: 'previous',
      record: { id: 'previous', blob: snapshotBlob, blobSha256: snapshotHash }
    });
  };
  await new Promise((resolve, reject) => {
    setup.oncomplete = resolve;
    setup.onabort = setup.onerror = () => reject(setup.error || new Error('snapshot setup failed'));
  });

  let hashCalls = 0;
  const originalHasher = appWindow.PasekaSha256;
  appWindow.PasekaSha256 = {
    async hashBlobHex(blob, options) {
      hashCalls++;
      if (hashCalls === 3) throw new Error('Injected Phase B hash failure');
      return originalHasher.hashBlobHex(blob, options);
    }
  };
  const cryptoProvider = { getRandomValues(bytes) { bytes.fill(23); return bytes; } };

  try {
    await assert.rejects(
      api.rollbackCommittedArchive(db, 'backup-1', 'imported-revision', cryptoProvider, async () => true),
      /Injected Phase B hash failure/
    );
  } finally {
    appWindow.PasekaSha256 = originalHasher;
  }

  const verify = db.transaction(['main', 'archive_history', 'archive_staging', 'entrance_media'], 'readonly');
  const [state, history, rollbackSession, snapshot, videos] = await Promise.all([
    new Promise((resolve, reject) => { const q = verify.objectStore('main').get('state'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); }),
    new Promise((resolve, reject) => { const q = verify.objectStore('archive_history').get('backup-1'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); }),
    new Promise((resolve, reject) => { const q = verify.objectStore('archive_staging').get('rollback-1'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); }),
    new Promise((resolve, reject) => { const q = verify.objectStore('archive_staging').get('rollback-1:video:previous'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); }),
    new Promise((resolve, reject) => { const q = verify.objectStore('entrance_media').getAll(); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); })
  ]);
  assert.equal(state.meta.revisionId, 'imported-revision');
  assert.equal(history.status, 'committed');
  assert.equal(rollbackSession.status, 'ready');
  assert.equal(await snapshot.record.blob.text(), 'previous');
  assert.equal(snapshot.record.blobSha256, snapshotHash);
  assert.equal(videos.length, 1);
  db.close();
});
