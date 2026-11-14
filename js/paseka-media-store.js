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
  const sha256 = await checksum(input.blob, cryptoProvider);
  const record = {
    id: input.id,
    blob: input.blob,
    mimeType: input.blob.type,
    sizeBytes: input.blob.size,
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
    await requestResult(store.add(record));
    await done;
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
  const record = await requestResult(tx.objectStore(STORE).get(id));
  await done;
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
  const records = await requestResult(tx.objectStore(STORE).getAll());
  await done;
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
const api = Object.freeze({ STORE, SCHEMA_VERSION, DEFAULT_MAX_IMAGE_BYTES, putImage, getImage, listImages, measureStorage });
root.PasekaMediaStore = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
