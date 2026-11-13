import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/hive-model.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const windowRef = {};
new Function('window', source)(windowRef);
const { assemblyBoxChanges } = windowRef.PasekaHiveModel;

test('hive domain module is loaded before the app and cached offline', () => {
  const moduleScript = html.indexOf('<script src="./js/hive-model.js"></script>');
  const appScript = html.indexOf('<script>', moduleScript);
  assert.ok(moduleScript >= 0 && appScript > moduleScript);
  assert.match(html, /PasekaHiveModel\.assemblyBoxChanges/);
  assert.match(serviceWorker, /paseka-shell-v268/);
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

