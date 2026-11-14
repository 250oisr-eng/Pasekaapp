import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/paseka-archive-restore.js', import.meta.url), 'utf8');
const appWindow = {};
new Function('window', source)(appWindow);
const api = appWindow.PasekaArchiveRestore;

async function makeDatabase() {
  const factory = new IDBFactory();
  const request = factory.open('archive-cleanup-test', 1);
  request.onupgradeneeded = () => {
    const staging = request.result.createObjectStore('archive_staging', { keyPath: 'id' });
    staging.createIndex('sessionId', 'sessionId');
    staging.createIndex('kind', 'kind');
    staging.createIndex('backupId', 'backupId');
    request.result.createObjectStore('archive_history', { keyPath: 'backupId' });
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
  assert.deepEqual(tracked.modes, ['readonly', 'readonly', 'readwrite', 'readwrite', 'readwrite', 'readwrite', 'readwrite']);

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
    getRandomValues(bytes) { bytes.fill(9); return bytes; },
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
