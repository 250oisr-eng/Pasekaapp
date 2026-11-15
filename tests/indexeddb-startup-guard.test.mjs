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

  const canInitialize = load('canInitializeFreshDatabase', existingEmpty);
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
