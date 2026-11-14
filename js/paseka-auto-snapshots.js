(function (root) {
'use strict';
const MAIN_STORE = 'main';
const SNAPSHOT_STORE = 'auto_snapshots';
const DEFAULT_LIMIT = 3;
const DEFAULT_MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 16 * 1024 * 1024;
function fail(code, message) { const error = new Error(message || code); error.code = code; throw error; }
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
function revisionOf(state) { return typeof state?.meta?.revisionId === 'string' && state.meta.revisionId ? state.meta.revisionId : null; }
function bytesToHex(bytes) { return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join(''); }
function serializeState(state) {
  let serialized;
  try { serialized = JSON.stringify(state); } catch (error) { fail('SNAPSHOT_STATE_INVALID', 'The local state cannot be serialized.'); }
  if (typeof serialized !== 'string') fail('SNAPSHOT_STATE_INVALID', 'The local state cannot be serialized.');
  if (typeof TextEncoder === 'undefined') fail('SNAPSHOT_CRYPTO_UNAVAILABLE', 'TextEncoder is unavailable in this browser.');
  return new TextEncoder().encode(serialized);
}
async function checksumBytes(bytes, cryptoProvider) {
  if (!cryptoProvider?.subtle?.digest) fail('SNAPSHOT_CRYPTO_UNAVAILABLE', 'SHA-256 is unavailable in this browser.');
  return bytesToHex(new Uint8Array(await cryptoProvider.subtle.digest('SHA-256', bytes)));
}
async function checksumState(state, cryptoProvider) { return checksumBytes(serializeState(state), cryptoProvider); }
function assertDatabase(db) {
  if (!db?.objectStoreNames?.contains(MAIN_STORE) || !db.objectStoreNames.contains(SNAPSHOT_STORE)) {
    fail('SNAPSHOT_STORE_UNAVAILABLE', 'The local database does not support rotating snapshots. Update and reopen the app.');
  }
}
function sortNewestFirst(items) {
  return items.slice().sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')) || String(b.id).localeCompare(String(a.id)));
}
function storedSize(item) {
  if (Number.isSafeInteger(item?.sizeBytes) && item.sizeBytes >= 0) return item.sizeBytes;
  try { return serializeState(item?.state).byteLength; } catch (error) { return 0; }
}
async function writeSnapshot(db, state, expectedRevision, cryptoProvider, options = {}) {
  assertDatabase(db);
  if (!state || typeof state !== 'object' || Array.isArray(state)) fail('SNAPSHOT_STATE_INVALID', 'A valid state object is required.');
  const revisionId = revisionOf(state);
  if (!revisionId) fail('SNAPSHOT_REVISION_MISSING', 'A revision ID is required for a safe snapshot.');
  const maxSnapshots = Number.isSafeInteger(options.maxSnapshots) && options.maxSnapshots >= 1 ? Math.min(options.maxSnapshots, 20) : DEFAULT_LIMIT;
  const maxSnapshotBytes = Number.isSafeInteger(options.maxSnapshotBytes) && options.maxSnapshotBytes > 0 ? options.maxSnapshotBytes : DEFAULT_MAX_SNAPSHOT_BYTES;
  const maxTotalBytes = Number.isSafeInteger(options.maxTotalBytes) && options.maxTotalBytes > 0 ? options.maxTotalBytes : DEFAULT_MAX_TOTAL_BYTES;
  const payload = serializeState(state);
  const sizeBytes = payload.byteLength;
  if (sizeBytes > maxSnapshotBytes) return { written: false, skipped: true, reason: 'SNAPSHOT_TOO_LARGE', sizeBytes, maxSnapshotBytes };
  const checksum = await checksumBytes(payload, cryptoProvider);
  const snapshot = { id: revisionId, at: new Date().toISOString(), revisionId,
    schemaVersion: Number.isSafeInteger(state.meta?.schemaVersion) ? state.meta.schemaVersion : null,
    checksum, sizeBytes, state };
  return new Promise((resolve, reject) => {
    let tx, conflict = null, failure = null, added = false, snapshotCount = 0, totalBytes = 0;
    try {
      tx = db.transaction([MAIN_STORE, SNAPSHOT_STORE], 'readwrite');
      const mainRequest = tx.objectStore(MAIN_STORE).get('state');
      mainRequest.onsuccess = () => {
        if (revisionOf(mainRequest.result || null) !== (expectedRevision || null)) {
          conflict = new Error('The main database changed before the snapshot was written.');
          conflict.code = 'SNAPSHOT_REVISION_CONFLICT';
          try { tx.abort(); } catch (error) { reject(conflict); }
          return;
        }
        const snapshots = tx.objectStore(SNAPSHOT_STORE);
        const allRequest = snapshots.getAll();
        allRequest.onsuccess = () => {
          try {
            const existing = allRequest.result || [];
            const alreadyStored = existing.some(item => item?.id === snapshot.id);
            if (!alreadyStored) { snapshots.put(snapshot); added = true; }
            const ordered = sortNewestFirst(added ? existing.concat(snapshot) : existing);
            let kept = 0;
            for (const item of ordered) {
              const bytes = storedSize(item);
              if (kept < maxSnapshots && totalBytes + bytes <= maxTotalBytes) {
                kept += 1; totalBytes += bytes;
              } else snapshots.delete(item.id);
            }
            snapshotCount = kept;
          } catch (error) { failure = error; try { tx.abort(); } catch (abortError) { reject(failure); } }
        };
        allRequest.onerror = () => { failure = allRequest.error || new Error('Could not read existing snapshots.'); try { tx.abort(); } catch (error) { reject(failure); } };
      };
      mainRequest.onerror = () => { failure = mainRequest.error || new Error('Could not verify the current database revision.'); try { tx.abort(); } catch (error) { reject(failure); } };
      tx.oncomplete = () => resolve({ written: added, count: snapshotCount, totalBytes, snapshot });
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
  return sortNewestFirst(values || []).map(item => ({ id: item.id, at: item.at, revisionId: item.revisionId,
    schemaVersion: item.schemaVersion, checksum: item.checksum, sizeBytes: storedSize(item) }));
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
          item.checksum === await checksumState(item.state, cryptoProvider)) return { snapshot: item, invalidCount };
    } catch (error) { /* try the next older verified snapshot */ }
    invalidCount += 1;
  }
  return { snapshot: null, invalidCount };
}
const api = Object.freeze({ writeSnapshot, listSnapshots, getLatestValidSnapshot, checksumState });
root.PasekaAutoSnapshots = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
