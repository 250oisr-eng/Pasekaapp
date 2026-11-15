import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(html);
  assert.ok(match, 'Function not found: ' + name);
  const next = /\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
  next.lastIndex = match.index + match[0].length;
  const endMatch = next.exec(html);
  return html.slice(match.index, endMatch ? endMatch.index : html.indexOf('</script>', match.index));
}

function load(name, deps) {
  return new Function('deps', 'with (deps) { return (' + extractFunction(name) + '); }')(deps);
}

function openDbDependencies(indexedDB) {
  const deps = {
    indexedDB,
    DB: 'paseka-startup-guard-integration',
    STORE: 'main',
    BACKUP_STORE: 'full_backup',
    db: null,
  };
  deps.isFreshDatabaseUpgrade = load('isFreshDatabaseUpgrade', deps);
  return deps;
}

test('openDB marks only a genuinely new IndexedDB database as fresh', async () => {
  const indexedDB = new IDBFactory();

  const fresh = openDbDependencies(indexedDB);
  const open = load('openDB', fresh);
  const firstOpenCreatedDatabase = await open();
  assert.equal(firstOpenCreatedDatabase, true);
  assert.equal(fresh.db.version, 3);
  fresh.db.close();

  // A retry in the same page must not inherit the first open's "fresh" result.
  const secondOpenCreatedDatabase = await open();
  assert.equal(secondOpenCreatedDatabase, false);
  assert.equal(fresh.db.version, 3);

  const stateRequest = fresh.db.transaction('main', 'readonly')
    .objectStore('main').get('state');
  const state = await new Promise((resolve, reject) => {
    stateRequest.onsuccess = () => resolve(stateRequest.result);
    stateRequest.onerror = () => reject(stateRequest.error);
  });
  assert.equal(state, undefined);

  const canInitialize = load('canInitializeFreshDatabase', fresh);
  assert.equal(canInitialize(secondOpenCreatedDatabase, state), false);
  fresh.db.close();
});

test('fresh empty database is eligible for first-run initialization', async () => {
  const deps = openDbDependencies(new IDBFactory());
  const createdDatabase = await load('openDB', deps)();
  const canInitialize = load('canInitializeFreshDatabase', deps);
  assert.equal(canInitialize(createdDatabase, undefined), true);
  deps.db.close();
});


test('existing empty database without automatic backup stays empty and is not first-run eligible', async () => {
  const deps = openDbDependencies(new IDBFactory());
  await load('openDB', deps)();
  deps.autoBackupRecovered = false;
  deps.autoBackupInfo = null;
  deps.readMain = load('readMain', deps);
  deps.readAutoBackup = load('readAutoBackup', deps);

  const loaded = await load('read', deps)();
  assert.equal(loaded, undefined);
  assert.equal(load('canInitializeFreshDatabase', deps)(false, loaded), false);
  deps.db.close();
});

test('existing empty primary database still recovers a valid automatic backup', async () => {
  const deps = openDbDependencies(new IDBFactory());
  await load('openDB', deps)();
  const backupState = { meta: { schemaVersion: 12 }, hives: [{ id: 'hive-1' }] };
  const transaction = deps.db.transaction('full_backup', 'readwrite');
  transaction.objectStore('full_backup').put({ state: backupState }, 'previous');
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

  deps.autoBackupRecovered = false;
  deps.autoBackupInfo = null;
  deps.readMain = load('readMain', deps);
  deps.readAutoBackup = load('readAutoBackup', deps);

  const loaded = await load('read', deps)();
  assert.deepEqual(loaded, backupState);
  assert.equal(deps.autoBackupRecovered, true);
  deps.db.close();
});


test('existing empty database fails closed when automatic backup cannot be read', async () => {
  const deps = openDbDependencies(new IDBFactory());
  await load('openDB', deps)();
  deps.readMain = async () => undefined;
  deps.readAutoBackup = async () => { throw new Error('backup read failed'); };

  await assert.rejects(load('read', deps)(), /backup read failed/);
  assert.equal(load('canInitializeFreshDatabase', deps)(false, undefined), false);
  deps.db.close();
});

test('a valid primary state is preferred without consulting automatic backup', async () => {
  const deps = openDbDependencies(new IDBFactory());
  await load('openDB', deps)();
  const primaryState = { meta: { schemaVersion: 12 }, hives: [{ id: 'primary-hive' }] };
  deps.readMain = async () => primaryState;
  deps.readAutoBackup = async () => { throw new Error('must not read backup'); };

  const loaded = await load('read', deps)();
  assert.deepEqual(loaded, primaryState);
  deps.db.close();
});
