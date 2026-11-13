import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/hive-model.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const windowRef = {};
new Function('window', source)(windowRef);
const { assemblyBoxChanges, inspectFrameInventoryIntegrity } = windowRef.PasekaHiveModel;

test('hive domain module is loaded before the app and cached offline', () => {
  const moduleScript = html.indexOf('<script src="./js/hive-model.js"></script>');
  const appScript = html.indexOf('<script>', moduleScript);
  assert.ok(moduleScript >= 0 && appScript > moduleScript);
  assert.match(html, /PasekaHiveModel\.assemblyBoxChanges/);
  assert.match(html, /PasekaHiveModel\.inspectFrameInventoryIntegrity/);
  assert.match(serviceWorker, /paseka-shell-v260/);
  assert.match(serviceWorker, /\.\/js\/hive-model\.js/);
});

test('assembly changes report added and removed boxes', () => {
  assert.deepEqual(
    assemblyBoxChanges(
      { mode: 'summer', boxes: [1, 2, 3, 4] },
      { mode: 'summer', boxes: [1, 3, 4, 5] }
    ),
    { added: [5], removed: [2], moved: [] }
  );
});

test('winter assembly changes report box positions without inventing additions', () => {
  assert.deepEqual(
    assemblyBoxChanges(
      { mode: 'winter', boxes: [1, 3, 4], winterOrder: [1, 3, 4] },
      { mode: 'winter', boxes: [1, 3, 4], winterOrder: [4, 1, 3] }
    ),
    {
      added: [],
      removed: [],
      moved: [
        { box: 4, from: 3, to: 1 },
        { box: 1, from: 1, to: 2 },
        { box: 3, from: 2, to: 3 }
      ]
    }
  );
});

test('legacy frame records may omit inventory numbers before schema 4', () => {
  assert.deepEqual(
    inspectFrameInventoryIntegrity({
      meta: { schemaVersion: 3 },
      layouts: { hiveA: { boxes: { 1: { frames: [{ frameId: 'f1' }] } } } }
    }),
    []
  );
});

test('schema 4 inventory integrity detects missing, malformed and duplicate numbers', () => {
  const errors = inspectFrameInventoryIntegrity({
    meta: { schemaVersion: 4 },
    layouts: {
      hiveA: {
        boxes: {
          1: { frames: [
            { frameId: 'f1', inventoryNumber: '000001' },
            { frameId: 'f2', inventoryNumber: '12A' },
            { frameId: 'f3' }
          ] }
        },
        honeyFrames: [[{ frameId: 'f4', inventoryNumber: '000001' }]]
      }
    }
  });
  assert.deepEqual(errors.map(error => error.code), [
    'invalid_frame_inventory_number',
    'frame_inventory_number_missing',
    'duplicate_frame_inventory_number'
  ]);
  assert.deepEqual(errors[2].details, {
    inventoryNumber: '000001',
    first: { hiveId: 'hiveA', box: '1', position: 1 },
    duplicate: { hiveId: 'hiveA', box: 'H1', position: 1 }
  });
});

test('frame inventory integrity ignores malformed layout containers safely', () => {
  assert.deepEqual(inspectFrameInventoryIntegrity({
    meta: { schemaVersion: 4 },
    layouts: { invalid: null, other: 'not-a-layout' }
  }), []);
});
