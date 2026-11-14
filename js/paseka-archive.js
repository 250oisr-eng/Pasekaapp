(function (root) {
'use strict';

const MAGIC_TEXT = 'PASEKA01';
const MAGIC = Uint8Array.from(MAGIC_TEXT, ch => ch.charCodeAt(0));
const HEADER_BYTES = 12;
const FORMAT = 'paseka-archive';
const VERSION = 1;
const CHUNK_BYTES = 1024 * 1024;
const LIMITS = Object.freeze({
  maxManifestBytes: 4 * 1024 * 1024,
  maxEntries: 512,
  maxStateBytes: 128 * 1024 * 1024,
  maxVideoBytes: 250 * 1024 * 1024,
  maxArchiveBytes: 512 * 1024 * 1024,
  chunkBytes: CHUNK_BYTES
});

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  throw error;
}
function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function isInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
function bytesToHex(bytes) {
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}
function getPayloadSize(payload) {
  if (payload && Number.isSafeInteger(payload.size) && payload.size >= 0) return payload.size;
  if (payload instanceof Uint8Array) return payload.byteLength;
  if (payload instanceof ArrayBuffer) return payload.byteLength;
  fail('INVALID_PAYLOAD', 'Payload must be a Blob, Uint8Array, or ArrayBuffer.');
}
function payloadPart(payload) {
  if (payload instanceof Uint8Array) return payload;
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
  if (payload && typeof payload.slice === 'function' && Number.isSafeInteger(payload.size)) return payload;
  fail('INVALID_PAYLOAD', 'Unsupported archive payload.');
}
function assertAllowedKeys(value, allowed, code) {
  if (!isObject(value)) fail(code, 'Expected an object.');
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(code, 'Unexpected field: ' + key);
  }
}
function validateVideoMetadata(metadata, size) {
  if (!isObject(metadata)) fail('INVALID_VIDEO_METADATA', 'Video metadata is missing.');
  const allowed = ['id', 'hiveId', 'capturedAt', 'durationSec', 'width', 'height', 'bytes', 'mimeType', 'name', 'status', 'queueCreatedAt', 'retryCount', 'lastAttemptAt', 'nextAttemptAt', 'lastError', 'metadataCheck', 'frameQualityCheck'];
  assertAllowedKeys(metadata, allowed, 'INVALID_VIDEO_METADATA');
  if (typeof metadata.id !== 'string' || !metadata.id.trim() || metadata.id.length > 128) fail('INVALID_VIDEO_METADATA', 'Invalid video ID.');
  if (typeof metadata.hiveId !== 'string' || !metadata.hiveId.trim() || metadata.hiveId.length > 128) fail('INVALID_VIDEO_METADATA', 'Invalid hive ID.');
  if (typeof metadata.capturedAt !== 'string' || metadata.capturedAt.length > 40 || !Number.isFinite(Date.parse(metadata.capturedAt))) fail('INVALID_VIDEO_METADATA', 'Invalid capture date.');
  if (typeof metadata.durationSec !== 'number' || !Number.isFinite(metadata.durationSec) || metadata.durationSec <= 0 || metadata.durationSec > 600) fail('INVALID_VIDEO_METADATA', 'Invalid video duration.');
  if (!Number.isSafeInteger(metadata.width) || metadata.width < 1 || metadata.width > 16384) fail('INVALID_VIDEO_METADATA', 'Invalid video width.');
  if (!Number.isSafeInteger(metadata.height) || metadata.height < 1 || metadata.height > 16384) fail('INVALID_VIDEO_METADATA', 'Invalid video height.');
  if (metadata.bytes !== size) fail('INVALID_VIDEO_METADATA', 'Video metadata size does not match payload size.');
  if (typeof metadata.mimeType !== 'string' || metadata.mimeType.length > 128 || !/^video\//i.test(metadata.mimeType)) fail('INVALID_VIDEO_METADATA', 'Invalid video MIME type.');
  if (typeof metadata.name !== 'string' || metadata.name.length > 120) fail('INVALID_VIDEO_METADATA', 'Invalid video file name.');
  const statuses = ['waiting_for_server', 'uploading', 'uploaded', 'analyzing', 'completed', 'failed_retryable', 'failed_permanent'];
  if (metadata.status != null && !statuses.includes(metadata.status)) fail('INVALID_VIDEO_METADATA', 'Invalid video queue status.');
  if (metadata.retryCount != null && (!Number.isSafeInteger(metadata.retryCount) || metadata.retryCount < 0 || metadata.retryCount > 10000)) fail('INVALID_VIDEO_METADATA', 'Invalid retry count.');
  for (const key of ['queueCreatedAt', 'lastAttemptAt', 'nextAttemptAt']) if (metadata[key] != null && (typeof metadata[key] !== 'string' || metadata[key].length > 40 || !Number.isFinite(Date.parse(metadata[key])))) fail('INVALID_VIDEO_METADATA', 'Invalid video queue timestamp.');
  if (metadata.lastError != null && (typeof metadata.lastError !== 'string' || metadata.lastError.length > 500)) fail('INVALID_VIDEO_METADATA', 'Invalid video queue error.');
  for (const key of ['metadataCheck', 'frameQualityCheck']) if (metadata[key] != null && !isObject(metadata[key])) fail('INVALID_VIDEO_METADATA', 'Invalid video quality metadata.');
}
function validateManifest(manifest, manifestLength, expectedFileSize, limits = LIMITS) {
  assertAllowedKeys(manifest, ['format', 'version', 'backupId', 'createdAt', 'schemaVersion', 'entries'], 'INVALID_MANIFEST');
  if (manifest.format !== FORMAT || manifest.version !== VERSION) fail('UNSUPPORTED_FORMAT', 'Unsupported Paseka archive format.');
  if (typeof manifest.backupId !== 'string' || !manifest.backupId.trim() || manifest.backupId.length > 128) fail('INVALID_MANIFEST', 'Invalid backup ID.');
  if (typeof manifest.createdAt !== 'string' || manifest.createdAt.length > 40 || !Number.isFinite(Date.parse(manifest.createdAt))) fail('INVALID_MANIFEST', 'Invalid archive creation date.');
  if (!Number.isSafeInteger(manifest.schemaVersion) || manifest.schemaVersion < 1 || manifest.schemaVersion > 1000) fail('INVALID_MANIFEST', 'Invalid data schema version.');
  if (!Array.isArray(manifest.entries) || manifest.entries.length < 1 || manifest.entries.length > limits.maxEntries) fail('ENTRY_COUNT_LIMIT', 'Archive entry count is outside the allowed range.');
  if (!isInteger(manifestLength) || manifestLength < 2 || manifestLength > limits.maxManifestBytes) fail('MANIFEST_SIZE_LIMIT', 'Manifest size is outside the allowed range.');

  let stateCount = 0;
  let videoCount = 0;
  let totalPayloadBytes = 0;
  const paths = new Set();
  const videoIds = new Set();
  const entries = [];
  for (let i = 0; i < manifest.entries.length; i++) {
    const item = manifest.entries[i];
    assertAllowedKeys(item, ['path', 'kind', 'size', 'mimeType', 'chunkSize', 'chunkSha256', 'metadata'], 'INVALID_ENTRY');
    if (typeof item.path !== 'string' || paths.has(item.path)) fail('DUPLICATE_OR_INVALID_PATH', 'Archive entry path is invalid or duplicated.');
    paths.add(item.path);
    if (!isInteger(item.size) || item.size < 1) fail('INVALID_ENTRY_SIZE', 'Archive entry size must be a positive safe integer.');
    if (item.chunkSize !== limits.chunkBytes) fail('INVALID_CHUNK_SIZE', 'Unsupported archive chunk size.');
    const expectedHashes = Math.ceil(item.size / item.chunkSize);
    if (!Array.isArray(item.chunkSha256) || item.chunkSha256.length !== expectedHashes || item.chunkSha256.some(hash => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))) fail('INVALID_CHUNK_HASHES', 'Entry chunk hashes are missing or malformed.');
    if (typeof item.mimeType !== 'string' || item.mimeType.length > 128) fail('INVALID_ENTRY_MIME', 'Invalid entry MIME type.');

    if (item.kind === 'state') {
      stateCount++;
      if (item.path !== 'state.json' || i !== 0 || item.mimeType !== 'application/json' || item.size > limits.maxStateBytes || item.metadata != null) fail('INVALID_STATE_ENTRY', 'State entry is invalid.');
    } else if (item.kind === 'entrance_video') {
      videoCount++;
      const expectedPath = 'entrance-media/' + String(videoCount).padStart(6, '0') + '.blob';
      if (item.path !== expectedPath || item.size > limits.maxVideoBytes) fail('INVALID_VIDEO_ENTRY', 'Video entry path or size is invalid.');
      validateVideoMetadata(item.metadata, item.size);
      if (videoIds.has(item.metadata.id)) fail('DUPLICATE_VIDEO_ID', 'Archive contains duplicate video IDs.');
      videoIds.add(item.metadata.id);
      if (item.mimeType !== item.metadata.mimeType) fail('INVALID_ENTRY_MIME', 'Video MIME type does not match its metadata.');
    } else {
      fail('INVALID_ENTRY_KIND', 'Unknown archive entry kind.');
    }

    totalPayloadBytes += item.size;
    if (!Number.isSafeInteger(totalPayloadBytes)) fail('ARCHIVE_SIZE_LIMIT', 'Archive payload size overflow.');
    const offset = HEADER_BYTES + manifestLength + totalPayloadBytes - item.size;
    entries.push({ ...item, offset, end: offset + item.size });
  }
  if (stateCount !== 1) fail('INVALID_STATE_ENTRY', 'Archive must contain exactly one state.json entry.');
  const totalFileSize = HEADER_BYTES + manifestLength + totalPayloadBytes;
  if (totalFileSize > limits.maxArchiveBytes) fail('ARCHIVE_SIZE_LIMIT', 'Archive exceeds the maximum supported size.');
  if (expectedFileSize != null && totalFileSize !== expectedFileSize) fail('ARCHIVE_LENGTH_MISMATCH', 'Archive length does not match its manifest.');
  return { entries, totalFileSize, totalPayloadBytes, stateEntry: entries[0], videoCount };
}
async function hashBlobChunks(blob, cryptoProvider, chunkSize = CHUNK_BYTES) {
  if (!blob || typeof blob.slice !== 'function' || !Number.isSafeInteger(blob.size) || blob.size < 1) fail('INVALID_PAYLOAD', 'Cannot hash an empty or invalid Blob.');
  if (!cryptoProvider || !cryptoProvider.subtle || typeof cryptoProvider.subtle.digest !== 'function') fail('CRYPTO_UNAVAILABLE', 'SHA-256 is unavailable.');
  if (chunkSize !== CHUNK_BYTES) fail('INVALID_CHUNK_SIZE', 'Unsupported archive chunk size.');
  const hashes = [];
  for (let offset = 0; offset < blob.size; offset += chunkSize) {
    const bytes = await blob.slice(offset, Math.min(blob.size, offset + chunkSize)).arrayBuffer();
    const digest = await cryptoProvider.subtle.digest('SHA-256', bytes);
    hashes.push(bytesToHex(new Uint8Array(digest)));
  }
  return hashes;
}
function buildArchiveBlob(manifest, payloads, limits = LIMITS) {
  if (!Array.isArray(payloads) || !Array.isArray(manifest?.entries) || payloads.length !== manifest.entries.length) fail('PAYLOAD_COUNT_MISMATCH', 'Payload count does not match manifest.');
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  if (manifestBytes.byteLength > limits.maxManifestBytes) fail('MANIFEST_SIZE_LIMIT', 'Manifest size is outside the allowed range.');
  const validated = validateManifest(manifest, manifestBytes.byteLength, null, limits);
  const parts = [];
  for (let i = 0; i < payloads.length; i++) {
    const part = payloadPart(payloads[i]);
    if (getPayloadSize(part) !== validated.entries[i].size) fail('PAYLOAD_SIZE_MISMATCH', 'Payload size does not match manifest entry.');
    parts.push(part);
  }
  const header = new Uint8Array(HEADER_BYTES);
  header.set(MAGIC, 0);
  new DataView(header.buffer).setUint32(8, manifestBytes.byteLength, true);
  const blob = new Blob([header, manifestBytes, ...parts], { type: 'application/vnd.paseka.archive' });
  if (blob.size !== validated.totalFileSize) fail('ARCHIVE_LENGTH_MISMATCH', 'Generated archive length is inconsistent.');
  return blob;
}
async function parseArchiveBlob(blob, limits = LIMITS) {
  if (!blob || typeof blob.slice !== 'function' || !Number.isSafeInteger(blob.size)) fail('INVALID_ARCHIVE', 'Archive must be a Blob or File.');
  if (blob.size < HEADER_BYTES || blob.size > limits.maxArchiveBytes) fail('ARCHIVE_SIZE_LIMIT', 'Archive size is outside the allowed range.');
  const header = new Uint8Array(await blob.slice(0, HEADER_BYTES).arrayBuffer());
  for (let i = 0; i < MAGIC.length; i++) if (header[i] !== MAGIC[i]) fail('INVALID_MAGIC', 'File is not a Paseka archive.');
  const manifestLength = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(8, true);
  if (manifestLength < 2 || manifestLength > limits.maxManifestBytes || HEADER_BYTES + manifestLength > blob.size) fail('MANIFEST_SIZE_LIMIT', 'Manifest length is invalid.');
  let manifest;
  try {
    const manifestBytes = await blob.slice(HEADER_BYTES, HEADER_BYTES + manifestLength).arrayBuffer();
    const text = new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes);
    manifest = JSON.parse(text);
  } catch (error) {
    if (error && error.code) throw error;
    fail('INVALID_MANIFEST_JSON', 'Manifest is not valid UTF-8 JSON.');
  }
  const validated = validateManifest(manifest, manifestLength, blob.size, limits);
  return { format: FORMAT, version: VERSION, manifest, entries: validated.entries, stateEntry: validated.stateEntry, videoCount: validated.videoCount, totalPayloadBytes: validated.totalPayloadBytes };
}
async function verifyArchiveEntry(blob, entry, cryptoProvider) {
  if (!blob || typeof blob.slice !== 'function' || !entry || !isInteger(entry.offset) || !isInteger(entry.size) || entry.size < 1 || entry.end !== entry.offset + entry.size || entry.end > blob.size || !Array.isArray(entry.chunkSha256)) fail('INVALID_ENTRY', 'Invalid archive entry reference.');
  if (!cryptoProvider || !cryptoProvider.subtle || typeof cryptoProvider.subtle.digest !== 'function') fail('CRYPTO_UNAVAILABLE', 'SHA-256 is unavailable.');
  const chunkSize = entry.chunkSize;
  if (chunkSize !== CHUNK_BYTES || entry.chunkSha256.length !== Math.ceil(entry.size / chunkSize)) fail('INVALID_CHUNK_HASHES', 'Entry chunk hash list is invalid.');
  for (let i = 0, offset = 0; offset < entry.size; i++, offset += chunkSize) {
    const end = Math.min(entry.size, offset + chunkSize);
    const bytes = await blob.slice(entry.offset + offset, entry.offset + end).arrayBuffer();
    const digest = await cryptoProvider.subtle.digest('SHA-256', bytes);
    if (bytesToHex(new Uint8Array(digest)) !== entry.chunkSha256[i]) fail('CHECKSUM_MISMATCH', 'Archive entry checksum mismatch: ' + entry.path);
  }
  return true;
}
async function verifyArchive(blob, parsed, cryptoProvider) {
  if (!parsed || !Array.isArray(parsed.entries)) fail('INVALID_ARCHIVE', 'Parsed archive metadata is required.');
  for (const entry of parsed.entries) await verifyArchiveEntry(blob, entry, cryptoProvider);
  return true;
}
function readArchiveEntry(blob, entry) {
  if (!blob || typeof blob.slice !== 'function' || !entry || !Number.isSafeInteger(entry.offset) || !Number.isSafeInteger(entry.size) || entry.offset < 0 || entry.size < 1 || entry.end !== entry.offset + entry.size || entry.end > blob.size) fail('INVALID_ENTRY', 'Invalid archive entry bounds.');
  return blob.slice(entry.offset, entry.end, entry.mimeType || '');
}

root.PasekaArchive = Object.freeze({
  MAGIC_TEXT, FORMAT, VERSION, HEADER_BYTES, CHUNK_BYTES, LIMITS,
  hashBlobChunks, buildArchiveBlob, parseArchiveBlob, verifyArchiveEntry, verifyArchive, readArchiveEntry
});
})(typeof window !== 'undefined' ? window : globalThis);
