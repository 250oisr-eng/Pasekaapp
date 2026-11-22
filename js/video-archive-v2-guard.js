(function(root) {
'use strict';
// Pre-integration pure guard for proposed archive v2 recognition metadata.
// Does NOT validate an actual archive, claim archive safety, or delete originals.
const statuses = new Set(['blocked_archive_safety','delete_required','deleted']);
const sources = new Set(['entrance_media','record_media']);
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const obj = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/\s/.test(value);
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function assertStructuredResult(value, depth = 0, seen = new Set()) {
  if (depth > 12) fail('V2_RESULT_DEPTH_LIMIT');
  if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value === 'string') {
    if (/^data:(?:video|application\/octet-stream)/i.test(value)) fail('V2_RESULT_BINARY');
    return;
  }
  if (typeof value !== 'object' || seen.has(value) || !(Array.isArray(value) || obj(value))) fail('V2_RESULT_INVALID');
  if (!Array.isArray(value) && Object.getPrototypeOf(value)!==Object.prototype && Object.getPrototypeOf(value)!==null) fail('V2_RESULT_INVALID');
  seen.add(value);
  if (Array.isArray(value)) value.forEach(item => assertStructuredResult(item, depth + 1, seen));
  else for (const [key, item] of Object.entries(value)) {
    if (['blob','binary','base64','file','media','original','data'].includes(key.toLowerCase())) fail('V2_RESULT_BINARY');
    assertStructuredResult(item, depth + 1, seen);
  }
  seen.delete(value);
}
function validateRecognitionLedgerForV2(ledger) {
  if (!obj(ledger) || Object.getPrototypeOf(ledger)!==Object.prototype && Object.getPrototypeOf(ledger)!==null ||
      Object.keys(ledger).some(key=>!['version','entries'].includes(key)) ||
      ledger.version !== 1 || !Array.isArray(ledger.entries) || ledger.entries.length > 100000) fail('V2_LEDGER_INVALID');
  const identities = new Set();
  const resultIds = new Set();
  const deleted = new Set();
  let encodedBytes = 0;
  for (const entry of ledger.entries) {
    if (!obj(entry) || Object.getPrototypeOf(entry)!==Object.prototype && Object.getPrototypeOf(entry)!==null ||
        Object.keys(entry).some(key=>!['source','videoId','resultId','recognizedAt','stateRevisionId','result','sourceSha256','sourceBytes','sourceEvidenceVersion','sourceHashVerifiedAt','cleanupState'].includes(key)) ||
        !sources.has(entry.source) || !id(entry.videoId) || !id(entry.resultId) ||
        !statuses.has(entry.cleanupState) || !sha(entry.sourceSha256) ||
        !Number.isSafeInteger(entry.sourceBytes) || entry.sourceBytes <= 0 ||
        entry.sourceEvidenceVersion !== 1 ||
        !id(entry.stateRevisionId) ||
        typeof entry.recognizedAt !== 'string' || !Number.isFinite(Date.parse(entry.recognizedAt)) ||
        typeof entry.sourceHashVerifiedAt !== 'string' ||
        !Number.isFinite(Date.parse(entry.sourceHashVerifiedAt)) ||
        !obj(entry.result)) fail('V2_LEDGER_ENTRY_INVALID');
    const identity = entry.source + ':' + entry.videoId;
    if (identities.has(identity) || resultIds.has(entry.resultId)) fail('V2_LEDGER_DUPLICATE');
    identities.add(identity); resultIds.add(entry.resultId);
    assertStructuredResult(entry.result);
    let length;
    try { length = JSON.stringify(entry.result).length; } catch (_) { fail('V2_RESULT_INVALID'); }
    if (length > 16384) fail('V2_RESULT_TOO_LARGE');
    encodedBytes += length;
    if (encodedBytes > 4 * 1024 * 1024) fail('V2_LEDGER_SIZE_LIMIT');
    if (entry.cleanupState === 'deleted') deleted.add(identity);
  }
  return { entryCount: identities.size, tombstoneCount: deleted.size, identities, deleted };
}
function checkCandidateVideoPayloads(ledger, payloads) {
  const checked = validateRecognitionLedgerForV2(ledger);
  if (!Array.isArray(payloads)) fail('V2_PAYLOAD_SET_MISSING');
  const seen = new Set();
  for (const item of payloads) {
    if (!obj(item) || !sources.has(item.source) || !id(item.videoId) ||
        !sha(item.sourceSha256) || !Number.isSafeInteger(item.sourceBytes) || item.sourceBytes <= 0)
      fail('V2_PAYLOAD_INVALID');
    const key = item.source + ':' + item.videoId;
    if (seen.has(key)) fail('V2_PAYLOAD_DUPLICATE');
    seen.add(key);
    if (checked.identities.has(key)) fail('V2_RECOGNIZED_ORIGINAL_INCLUDED');
  }
  // Only metadata validation. A caller must still scan state Data URLs, actual
  // Blob bytes, staged and rollback copies, and concurrent updates. Never use
  // this return value as an archiveSafe or delete authorization.
  return { ok: true, inspectedPayloads: seen.size, recognitionEntries: checked.entryCount, tombstones: checked.tombstoneCount, archiveSafe: false };
}
root.PasekaVideoArchiveV2Guard = Object.freeze({ validateRecognitionLedgerForV2, checkCandidateVideoPayloads });
})(typeof window !== 'undefined' ? window : globalThis);
