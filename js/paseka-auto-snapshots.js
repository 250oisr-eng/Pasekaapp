(function (root) {
'use strict';

const MAIN_STORE = 'main';
const SNAPSHOT_STORE = 'auto_snapshots';
const DEFAULT_LIMIT = 5;

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  throw error;
}
function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}
function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed.'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted.'));
  });
}
function revisionOf(state) {
  return typeof state?.meta?.revisionId === 'string' && state.meta.revisionId
    ? state.meta.revisionId : null;
}
function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
async function checksumState(state, cryptoProvider) {
  if (!cryptoProvider?.subtle?.digest || typeof TextEncoder === 'undefined') {
    fail('SNAPSHOT_CRYPTO_UNAVAILABLE', 'SHA-256 is unavailable in this browser.');
  }
  let serialized;
  try { serialized = JSON.stringify(state); }
  catch (error) { fail('SNAPSHOT_STATE_INVALID', 'The local state cannot be serialized.'); }
  if (typeof serialized !== 'string') fail('SNAPSHOT_STATE_INVALID', 'The local state cannot be serialized.');
  const digest = await cryptoProvider.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
  return bytesToHex(new Uint8Array(digest));
}
function assertDatabase(db) {
  if (!db?.objectStoreNames?.contains(MAIN_STORE) || !db.objectStoreNames.contains(SNAPSHOT_STORE)) {
    fail('SNAPSHOT_STORE_UNAVAILABLE', 'The local database does not support rotating snapshots. Update and reopen the app.');
  }
}
function sortNewestFirst(items) {
  return items.slice().sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')) || String(b.id).localeCompare(String(a.id)));
}
async function writeSnapshot(db, state, expectedRevision, cryptoProvider, options = {}) {
  assertDatabase(db);
  if (!state || typeof state !== 'object' || Array.isArray(state)) fail('SNAPSHOT_STATE_INVALID', 'A valid state object is required.');
  const revisionId = revisionOf(state);
  if (!revisionId) fail('SNAPSHOT_REVISION_MISSING', 'A revision ID is required for a safe snapshot.');
  const maxSnapshots = Number.isSafeInteger(options.maxSnapshots) && options.maxSnapshots >= 1
    ? Math.min(options.maxSnapshots, 20) : DEFAULT_LIMIT;
  const checksum = await checksumState(state, cryptoProvider);
  const snapshot = {
    id: revisionId,
    at: new Date().toISOString(),
    revisionId,
    schemaVersion: Number.isSafeInteger(state.meta?.schemaVersion) ? state.meta.schemaVersion : null,
    checksum,
    state
  };
  return new Promise((resolve, reject) => {
    let tx, conflict = null, failure = null, added = false;
    try {
      tx = db.transaction([MAIN_STORE, SNAPSHOT_STORE], 'readwrite');
      const main = tx.objectStore(MAIN_STORE);
      const snapshots = tx.objectStore(SNAPSHOT_STORE);
      const mainRequest = main.get('state');
      mainRequest.onsuccess = () => {
        const currentRevision = revisionOf(mainRequest.result || null);
        if (currentRevision !== (expectedRevision || null)) {
          conflict = new Error('The main database changed before the snapshot was written.');
          conflict.code = 'SNAPSHOT_REVISION_CONFLICT';
          try { tx.abort(); } catch (error) { reject(conflict); }
          return;
        }
        const allRequest = snapshots.getAll();
        allRequest.onsuccess = () => {
          try {
            const existing = allRequest.result || [];
            if (!existing.some(item => item?.id === snapshot.id)) {
              snapshots.put(snapshot);
              added = true;
            }
            const retained = added ? existing.concat(snapshot) : existing;
            const ordered = sortNewestFirst(retained);
            for (const old of ordered.slice(maxSnapshots)) snapshots.delete(old.id);
          } catch (error) {
            failure = error;
            try { tx.abort(); } catch (abortError) { reject(failure); }
          }
        };
        allRequest.onerror = () => {
          failure = allRequest.error || new Error('Could not read existing snapshots.');
          try { tx.abort(); } catch (error) { reject(failure); }
        };
      };
      mainRequest.onerror = () => {
        failure = mainRequest.error || new Error('Could not verify the current database revision.');
        try { tx.abort(); } catch (error) { reject(failure); }
      };
      tx.oncomplete = () => resolve({ written: added, count: Math.min(maxSnapshots, (added ? 1 : 0)), snapshot });
      tx.onabort = () => reject(conflict || failure || tx.error || new Error('Snapshot transaction aborted.'));
      tx.onerror = () => reject(conflict || failure || tx.error || new Error('Snapshot transaction failed.'));
    } catch (error) { reject(error); }
  });
}
async function listSnapshots(db) {
  assertDatabase(db);
  const tx = db.transaction(SNAPSHOT_STORE, 'readonly');
  const values = await requestValue(tx.objectStore(SNAPSHOT_STORE).getAll());
  await transactionDone(tx);
  return sortNewestFirst(values || []).map(item => ({
    id: item.id,
    at: item.at,
    revisionId: item.revisionId,
    schemaVersion: item.schemaVersion,
    checksum: item.checksum
  }));
}
async function getLatestValidSnapshot(db, cryptoProvider) {
  assertDatabase(db);
  const tx = db.transaction(SNAPSHOT_STORE, 'readonly');
  const values = await requestValue(tx.objectStore(SNAPSHOT_STORE).getAll());
  await transactionDone(tx);
  const ordered = sortNewestFirst(values || []);
  let invalidCount = 0;
  for (const item of ordered) {
    try {
      if (item && item.state && item.revisionId === revisionOf(item.state) &&
          item.checksum === await checksumState(item.state, cryptoProvider)) {
        return { snapshot: item, invalidCount };
      }
    } catch (error) { /* try the next older verified snapshot */ }
    invalidCount += 1;
  }
  return { snapshot: null, invalidCount };
}
const api = Object.freeze({ writeSnapshot, listSnapshots, getLatestValidSnapshot, checksumState });
root.PasekaAutoSnapshots = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
