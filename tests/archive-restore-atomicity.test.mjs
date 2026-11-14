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
