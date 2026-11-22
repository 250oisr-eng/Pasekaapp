import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';

// Test the existing private transaction helper, without adding a public API.
const source = readFileSync('js/paseka-archive-restore.js', 'utf8');
const anchor = 'root.PasekaArchiveRestore = Object.freeze({';
assert.equal(source.split(anchor).length, 2, 'private-helper test hook must match once');
new Function(source.replace(anchor, 'root.__archiveReadySessionTest = updateSession;\n' + anchor))();
const updateSession = globalThis.__archiveReadySessionTest;
delete globalThis.__archiveReadySessionTest;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = new IDBFactory().open('archive-ready-idempotency', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('main');
      db.createObjectStore('archive_staging', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function put(db, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('archive_staging', 'readwrite');
    tx.objectStore('archive_staging').put(value);
    tx.oncomplete = resolve;
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
function get(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('archive_staging', 'readonly');
    const req = tx.objectStore('archive_staging').get('session-synthetic');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const ready = () => ({
  id: 'session-synthetic', sessionId: 'session-synthetic',
  kind: 'session', status: 'ready',
  backupId: 'backup-synthetic', fingerprint: 'manifest-synthetic',
  stagingEpoch: 2, stagedCount: 2, totalEntries: 2,
  baselineMediaFingerprint: 'legacy-content-baseline',
  baselineMediaMetadataFingerprint: 'full-metadata-baseline'
});
test('matching ready staging finalization is idempotent without writes', async () => {
  const db = await openDb();
  try {
    const original = ready();
    await put(db, original);
    await updateSession(db, structuredClone(original));
    assert.deepEqual(await get(db), original);
  } finally { db.close(); }
});
for (const [caseName, mutate] of [
  ['metadata baseline changed', s => { s.baselineMediaMetadataFingerprint = 'different'; }],
  ['content baseline changed', s => { s.baselineMediaFingerprint = 'different'; }],
  ['backup identity changed', s => { s.backupId = 'other-backup'; }],
  ['session identity changed', s => { s.sessionId = 'other-session'; }],
  ['metadata baseline absent in persisted legacy row', s => { delete s.baselineMediaMetadataFingerprint; }]
]) {
  test('ready finalization rejects ' + caseName + ' without modifying staging', async () => {
    const db = await openDb();
    try {
      const original = ready();
      await put(db, original);
      const candidate = structuredClone(original);
      if (caseName === 'metadata baseline absent in persisted legacy row') {
        const legacy = structuredClone(original);
        mutate(legacy);
        await put(db, legacy);
        await assert.rejects(updateSession(db, candidate), { code: 'STAGING_SESSION_NOT_WRITABLE' });
        assert.deepEqual(await get(db), legacy);
      } else {
        mutate(candidate);
        await assert.rejects(updateSession(db, candidate), { code: 'STAGING_SESSION_NOT_WRITABLE' });
        assert.deepEqual(await get(db), original);
      }
    } finally { db.close(); }
  });
}
