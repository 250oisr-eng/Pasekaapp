(function (root) {
'use strict';

const ENTITY_COLLECTIONS = Object.freeze([
  { collection: 'records', type: 'journal_record' },
  { collection: 'plantObservations', type: 'plant_observation' },
  { collection: 'pesticideIncidents', type: 'pesticide_incident' },
  { collection: 'deadoutReviews', type: 'deadout_review' }
]);
const DEFAULT_MAX_IMAGE_BYTES = 25 * 1024 * 1024;

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  throw error;
}
function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function inspectDataUrl(value, maxBytes) {
  if (typeof value !== 'string') return { ok: false, reason: 'missing_data_url' };
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/]*={0,2})$/i.exec(value);
  if (!match) return { ok: false, reason: 'invalid_or_unsupported_data_url' };
  const payload = match[2];
  if (!payload.length || payload.length % 4 !== 0 || /=/.test(payload.slice(0, -2))) {
    return { ok: false, reason: 'invalid_base64' };
  }
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  const sizeBytes = payload.length / 4 * 3 - padding;
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1) return { ok: false, reason: 'empty_image' };
  if (sizeBytes > maxBytes) return { ok: false, reason: 'image_size_limit', sizeBytes };
  return { ok: true, mimeType: match[1].toLowerCase(), sizeBytes };
}
function entityId(item, index) {
  return typeof item?.id === 'string' && item.id.trim() ? item.id : 'legacy-index-' + index;
}
function planMigration(state, options = {}) {
  if (!isObject(state)) fail('INVALID_STATE', 'A state object is required.');
  const maxImageBytes = options.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES;
  if (!Number.isSafeInteger(maxImageBytes) || maxImageBytes < 1) {
    fail('INVALID_LIMIT', 'The maximum image size must be a positive safe integer.');
  }
  const candidates = [];
  const rejected = [];
  const skipped = [];
  let totalBytes = 0;
  for (const descriptor of ENTITY_COLLECTIONS) {
    const collection = state[descriptor.collection];
    if (collection == null) continue;
    if (!Array.isArray(collection)) {
      rejected.push({ collection: descriptor.collection, reason: 'collection_not_array' });
      continue;
    }
    collection.forEach((entity, entityIndex) => {
      if (!isObject(entity) || entity.media == null) return;
      if (!Array.isArray(entity.media)) {
        rejected.push({ collection: descriptor.collection, entityId: entityId(entity, entityIndex), reason: 'media_not_array' });
        return;
      }
      entity.media.forEach((media, mediaIndex) => {
        const location = {
          collection: descriptor.collection,
          entityType: descriptor.type,
          entityId: entityId(entity, entityIndex),
          mediaIndex
        };
        if (!isObject(media)) {
          rejected.push({ ...location, reason: 'media_not_object' });
          return;
        }
        if (media.kind === 'video' || (typeof media.type === 'string' && media.type.startsWith('video/'))) {
          skipped.push({ ...location, reason: 'video_kept_in_legacy_media' });
          return;
        }
        if (media.kind != null && media.kind !== 'image') {
          rejected.push({ ...location, reason: 'unsupported_media_kind' });
          return;
        }
        const inspected = inspectDataUrl(media.data, maxImageBytes);
        if (!inspected.ok) {
          rejected.push({ ...location, reason: inspected.reason, sizeBytes: inspected.sizeBytes || null });
          return;
        }
        const id = ['legacy-image', descriptor.collection, location.entityId, mediaIndex].join(':');
        candidates.push({
          id,
          ...location,
          name: typeof media.name === 'string' ? media.name.slice(0, 160) : '',
          mimeType: inspected.mimeType,
          sizeBytes: inspected.sizeBytes
        });
        totalBytes += inspected.sizeBytes;
        if (!Number.isSafeInteger(totalBytes)) fail('TOTAL_SIZE_OVERFLOW', 'The total image size exceeds the supported range.');
      });
    });
  }
  return Object.freeze({
    mode: 'dry-run',
    readOnly: true,
    sourceCollections: ENTITY_COLLECTIONS.map(item => item.collection),
    imageCount: candidates.length,
    totalBytes,
    rejectedCount: rejected.length,
    skippedCount: skipped.length,
    candidates,
    rejected,
    skipped
  });
}
const api = Object.freeze({ DEFAULT_MAX_IMAGE_BYTES, planMigration });
root.PasekaMediaMigration = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
