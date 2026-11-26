import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Selective regression for old root #187, adapted to the CURRENT main. The old
// browser test's inline onkeydown and honeycomb requirements are obsolete.
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = html.match(/\.frame-strip\{([^}]+)\}/)?.[1] || '';

test('brood-frame strip follows the recorded frame count in a single scrollable row', () => {
  assert.ok(css, 'frame-strip CSS must exist');
  assert.match(css, /display:grid/);
  assert.match(css, /grid-template-columns:repeat\(var\(--frame-count,6\),minmax\(25px,1fr\)\)/);
  assert.match(css, /width:100%;max-width:100%/);
  assert.match(css, /overflow-x:auto;overflow-y:hidden/);
  assert.doesNotMatch(css, /repeat\(6,minmax\(0,1fr\)\)/);
});

test('each of the three active brood-box renderers binds real frame-array length', () => {
  const pattern = /<div class="frame-strip" style="--frame-count:'\+([^'"]+)\+'">'\+([a-z]+)\.frames\.map/g;
  const matches = [...html.matchAll(pattern)];
  assert.deepEqual(matches.map(m => m[2]).sort(), ['b', 'box', 'x']);
  assert.equal((html.match(/class="frame-strip" style="--frame-count:/g) || []).length, 3);

  for (const [, expression, variable] of matches) {
    // Whitelist the exact parsed expression before executing it with synthetic
    // arrays, not records from a live hive or a persisted IndexedDB.
    assert.equal(expression, `Math.max(1,${variable}.frames.length)`);
    const count = new Function(variable, `return ${expression};`);
    for (const n of [0, 1, 6, 10]) {
      assert.equal(count({frames:Array.from({length:n})}), Math.max(1, n),
        `${variable}: ${n} frames must yield the correct CSS column count`);
    }
  }
});

test('honey frames, chip events and persistence paths are outside this selective change', () => {
  assert.ok(html.includes('.honey-strip{grid-template-columns:repeat(5,minmax(0,1fr))'),
    'honey display has independent CSS and is not changed by brood frame count');
  assert.ok(html.includes("document.addEventListener('keydown',event=>{"),
    'existing delegated keyboard activation must be retained');
  for (const variable of ['box','x','b']) {
    assert.ok(!html.includes(`<div class="frame-strip">'+${variable}.frames.map`),
      'renderer cannot fall back to a fixed-width, unbound frame strip');
  }
});
