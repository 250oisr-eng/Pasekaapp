import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/paseka-media-migration.js', import.meta.url), 'utf8');
new Function(source)();
const Migration = globalThis.PasekaMediaMigration;
const data = bytes => 'data:image/jpeg;base64,' + Buffer.from(bytes).toString('base64');

test('dry-run finds legacy images in all four supported collections and does not mutate state', () => {
  const state = {
    records: [{ id: 'record-1', media: [{ kind: 'image', name: 'journal.jpg', data: data([1, 2, 3]) }, { kind: 'video', data: 'data:video/mp4;base64,AAAA' }] }],
    plantObservations: [{ id: 'plant-1', media: [{ kind: 'image', name: 'plant.jpg', data: data([4, 5]) }] }],
    pesticideIncidents: [{ id: 'incident-1', media: [{ kind: 'image', name: 'incident.jpg', data: data([6, 7, 8, 9]) }] }],
    deadoutReviews: [{ id: 'deadout-1', media: [{ kind: 'image', name: 'deadout.jpg', data: data([10]) }] }]
  };
  const before = structuredClone(state);
  const plan = Migration.planMigration(state);
  assert.equal(plan.mode, 'dry-run');
  assert.equal(plan.readOnly, true);
  assert.equal(plan.imageCount, 4);
  assert.equal(plan.totalBytes, 10);
  assert.equal(plan.skippedCount, 1);
  assert.equal(plan.rejectedCount, 0);
  assert.deepEqual(plan.candidates.map(item => item.collection), [
    'records', 'plantObservations', 'pesticideIncidents', 'deadoutReviews'
  ]);
  assert.deepEqual(state, before);
  assert.equal(Object.hasOwn(plan.candidates[0], 'data'), false);
});

test('dry-run reports malformed payloads, unsupported media and oversized images', () => {
  const state = {
    records: [{ id: 'r1', media: [
      { kind: 'image', data: 'not-a-data-url' },
      { kind: 'image', data: 'data:image/jpeg;base64,AQ=' },
      { kind: 'image', data: data([1, 2, 3, 4, 5]) },
      { kind: 'audio', data: 'data:audio/wav;base64,AQID' }
    ] }]
  };
  const plan = Migration.planMigration(state, { maxImageBytes: 4 });
  assert.equal(plan.imageCount, 0);
  assert.equal(plan.rejectedCount, 4);
  assert.deepEqual(plan.rejected.map(item => item.reason), [
    'invalid_or_unsupported_data_url',
    'invalid_base64',
    'image_size_limit',
    'unsupported_media_kind'
  ]);
});

test('dry-run reports malformed collection and media containers without throwing', () => {
  const plan = Migration.planMigration({
    records: {},
    plantObservations: [{ id: 'p1', media: {} }],
    pesticideIncidents: null,
    deadoutReviews: [{ id: 'd1', media: [null] }]
  });
  assert.equal(plan.rejectedCount, 3);
  assert.deepEqual(plan.rejected.map(item => item.reason), [
    'collection_not_array', 'media_not_array', 'media_not_object'
  ]);
});

test('dry-run uses deterministic IDs and counts binary bytes accurately', () => {
  const state = { records: [{ id: 'r/1', media: [{ kind: 'image', data: data([1, 2, 3, 4, 5, 6, 7]) }] }] };
  const first = Migration.planMigration(state);
  const second = Migration.planMigration(state);
  assert.equal(first.totalBytes, 7);
  assert.equal(first.candidates[0].id, second.candidates[0].id);
  assert.equal(first.candidates[0].id, 'legacy-image:records:r/1:0');
});

test('dry-run validates configured size limit', () => {
  assert.throws(() => Migration.planMigration({}, { maxImageBytes: 0 }), { code: 'INVALID_LIMIT' });
  assert.throws(() => Migration.planMigration(null), { code: 'INVALID_STATE' });
});
