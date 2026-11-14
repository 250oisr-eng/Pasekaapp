(function (root) {
'use strict';

const STORE = 'media_blobs';
const SCHEMA_VERSION = 1;
const DEFAULT_MAX_IMAGE_BYTES = 25 * 1024 * 1024;

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  throw error;
}
function assertDatabase(db) {
  if (!db?.objectStoreNames?.contains(STORE)) {
    fail('MEDIA_STORE_UNAVAILABLE', 'The local database does not support image storage.');
  }
}
function assertId(id) {
  if (typeof id !== 'string' || !id.trim() || id.length > 128) {
    fail('INVALID_MEDIA_ID', 'A non-empty media ID of at most 128 characters is required.');
  }
}
function assertImage(blob, maxBytes = DEFAULT_MAX_IMAGE_BYTES) {
  if (!blob || typeof blob.arrayBuffer !== 'function' ||
      !Number.isSafeInteger(blob.size) || blob.size < 1 ||
      typeof blob.type !== 'string' || !/^image\/[a-z0-9.+-]+$/i.test(blob.type)) {
    fail('INVALID_IMAGE_BLOB', 'A non-empty image Blob with a valid image MIME type is required.');
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || blob.size > maxBytes) {
    fail('IMAGE_SIZE_LIMIT', 'The image exceeds the allowed storage size.');
  }
}
function bytesToHex(bytes) {
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}
async function checksum(blob, cryptoProvider) {
  if (!cryptoProvider?.subtle?.digest) fail('MEDIA_CRYPTO_UNAVAILABLE', 'SHA-256 is unavailable.');
  const digest = await cryptoProvider.subtle.digest('SHA-256', await blob.arrayBuffer());
  return bytesToHex(new Uint8Array(digest));
}
function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}
function transactionResult(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed.'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted.'));
  });
}
function metadataOf(record) {
  return {
    id: record.id,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    name: record.name,
    capturedAt: record.capturedAt,
    createdAt: record.createdAt,
    sha256: record.sha256,
    schemaVersion: record.schemaVersion
  };
}
async function putImage(db, input, cryptoProvider, options = {}) {
  assertDatabase(db);
  if (!input || typeof input !== 'object') fail('INVALID_IMAGE_RECORD', 'Image metadata is required.');
  assertId(input.id);
  assertImage(input.blob, options.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES);
  if (input.name != null && (typeof input.name !== 'string' || input.name.length > 160)) {
    fail('INVALID_IMAGE_METADATA', 'Image name must be a string of at most 160 characters.');
  }
  if (input.capturedAt != null &&
      (typeof input.capturedAt !== 'string' || input.capturedAt.length > 40 || !Number.isFinite(Date.parse(input.capturedAt)))) {
    fail('INVALID_IMAGE_METADATA', 'Image capture date is invalid.');
  }
  // Snapshot the immutable Blob reference before awaiting Web Crypto. The
  // caller may replace input.blob while digest() is pending; storing that new
  // Blob with the old digest would create a false integrity record.
  const blob = input.blob;
  const sha256 = await checksum(blob, cryptoProvider);
  const record = {
    id: input.id,
    blob,
    mimeType: blob.type,
    sizeBytes: blob.size,
    name: input.name || '',
    capturedAt: input.capturedAt || null,
    createdAt: new Date().toISOString(),
    sha256,
    schemaVersion: SCHEMA_VERSION
  };
  const tx = db.transaction(STORE, 'readwrite');
  const done = transactionResult(tx);
  const store = tx.objectStore(STORE);
  try {
    await Promise.all([requestResult(store.add(record)), done]);
    return metadataOf(record);
  } catch (error) {
    try { tx.abort(); } catch (abortError) { /* transaction may already be complete */ }
    if (error?.name === 'ConstraintError') fail('IMAGE_ID_EXISTS', 'An image with this ID already exists.');
    throw error;
  }
}
async function getImage(db, id, cryptoProvider, options = {}) {
  assertDatabase(db);
  assertId(id);
  const tx = db.transaction(STORE, 'readonly');
  const done = transactionResult(tx);
  const [record] = await Promise.all([requestResult(tx.objectStore(STORE).get(id)), done]);
  if (!record) return null;
  if (!record.blob || record.sizeBytes !== record.blob.size || record.mimeType !== record.blob.type) {
    fail('IMAGE_METADATA_MISMATCH', 'Stored image metadata does not match its Blob.');
  }
  if (options.verify !== false) {
    const actual = await checksum(record.blob, cryptoProvider);
    if (actual !== record.sha256) fail('IMAGE_CHECKSUM_MISMATCH', 'Stored image checksum does not match.');
  }
  return { ...metadataOf(record), blob: record.blob };
}
async function listImages(db) {
  assertDatabase(db);
  const tx = db.transaction(STORE, 'readonly');
  const done = transactionResult(tx);
  const [records] = await Promise.all([requestResult(tx.objectStore(STORE).getAll()), done]);
  return (records || []).map(metadataOf).sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt)) || a.id.localeCompare(b.id));
}
async function measureStorage(db) {
  assertDatabase(db);
  const tx = db.transaction(STORE, 'readonly');
  const done = transactionResult(tx);
  const records = await requestResult(tx.objectStore(STORE).getAll());
  await done;
  return (records || []).reduce((total, record) => ({
    count: total.count + 1,
    sizeBytes: total.sizeBytes + (Number.isSafeInteger(record.sizeBytes) && record.sizeBytes >= 0 ? record.sizeBytes : 0)
  }), { count: 0, sizeBytes: 0 });
}

function collectBlobReferences(value, storeName, references, seen) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectBlobReferences(item, storeName, references, seen);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'blobId' && typeof child === 'string' && child.trim()) {
      const entry = references.get(child) || { id: child, count: 0, stores: new Set() };
      entry.count++;
      entry.stores.add(storeName);
      references.set(child, entry);
    } else if (child && typeof child === 'object') {
      collectBlobReferences(child, storeName, references, seen);
    }
  }
}
async function auditOrphanedImages(db) {
  assertDatabase(db);
  const storeNames = Array.from(db.objectStoreNames).filter(name => name !== STORE);
  if (!storeNames.length) fail('MEDIA_REFERENCE_STORES_UNAVAILABLE', 'No application data stores are available for a safe reference audit.');
  const tx = db.transaction([...storeNames, STORE], 'readonly');
  const done = transactionResult(tx);
  const requests = storeNames.map(name => [name, requestResult(tx.objectStore(name).getAll())]);
  const blobRequest = requestResult(tx.objectStore(STORE).getAll());
  const values = await Promise.all([...requests.map(item => item[1]), blobRequest, done]);
  const references = new Map();
  for (let i = 0; i < storeNames.length; i++) {
    const name = storeNames[i];
    for (const record of values[i] || []) collectBlobReferences(record, name, references, new WeakSet());
  }
  const blobs = values[storeNames.length] || [];
  const byId = new Map(blobs.filter(record => record && typeof record.id === 'string').map(record => [record.id, record]));
  const orphaned = [];
  const referenced = [];
  for (const record of blobs) {
    if (!record || typeof record.id !== 'string') continue;
    const reference = references.get(record.id);
    const item = { ...metadataOf(record), referenceCount: reference?.count || 0, referencedBy: reference ? [...reference.stores].sort() : [] };
    if (reference) referenced.push(item);
    else orphaned.push(item);
  }
  const missingReferences = [...references.values()]
    .filter(reference => !byId.has(reference.id))
    .map(reference => ({ blobId: reference.id, referenceCount: reference.count, referencedBy: [...reference.stores].sort() }))
    .sort((a, b) => a.blobId.localeCompare(b.blobId));
  orphaned.sort((a, b) => a.id.localeCompare(b.id));
  referenced.sort((a, b) => a.id.localeCompare(b.id));
  return Object.freeze({
    mode: 'read-only-audit',
    readOnly: true,
    deletionPerformed: false,
    blobCount: blobs.length,
    referencedCount: referenced.length,
    orphanedCount: orphaned.length,
    missingReferenceCount: missingReferences.length,
    referenced,
    orphaned,
    missingReferences
  });
}

const api = Object.freeze({ STORE, SCHEMA_VERSION, DEFAULT_MAX_IMAGE_BYTES, putImage, getImage, listImages, measureStorage, auditOrphanedImages });
root.PasekaMediaStore = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
