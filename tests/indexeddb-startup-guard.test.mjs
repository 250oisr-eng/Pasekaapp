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
  return {
    indexedDB,
    DB: 'paseka-startup-guard-integration',
    STORE: 'main',
    BACKUP_STORE: 'full_backup',
    db: null,
    databaseCreatedDuringOpen: false
  };
}

test('openDB marks only a genuinely new IndexedDB database as fresh', async () => {
  const indexedDB = new IDBFactory();

  const fresh = openDbDependencies(indexedDB);
  await load('openDB', fresh)();
  assert.equal(fresh.databaseCreatedDuringOpen, true);
  assert.equal(fresh.db.version, 3);
  fresh.db.close();

  const existingEmpty = openDbDependencies(indexedDB);
  await load('openDB', existingEmpty)();
  assert.equal(existingEmpty.databaseCreatedDuringOpen, false);
  assert.equal(existingEmpty.db.version, 3);

  const stateRequest = existingEmpty.db.transaction('main', 'readonly')
    .objectStore('main').get('state');
  const state = await new Promise((resolve, reject) => {
    stateRequest.onsuccess = () => resolve(stateRequest.result);
    stateRequest.onerror = () => reject(stateRequest.error);
  });
  assert.equal(state, undefined);

  const canInitialize = load('canInitializeFreshDatabase', existingEmpty);
  assert.equal(canInitialize(existingEmpty.databaseCreatedDuringOpen, state), false);
  existingEmpty.db.close();
});

test('fresh empty database is eligible for first-run initialization', async () => {
  const deps = openDbDependencies(new IDBFactory());
  await load('openDB', deps)();
  const canInitialize = load('canInitializeFreshDatabase', deps);
  assert.equal(canInitialize(deps.databaseCreatedDuringOpen, undefined), true);
  deps.db.close();
});
