import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf("return '<div class=\"hive-row\"");
const end = html.indexOf('function renderHiveHeaderSummary(', start);
const directory = start >= 0 && end > start ? html.slice(start, end) : '';

test('hive directory open/delete controls announce the target hive safely', () => {
  assert.ok(directory, 'the current directory renderer must be found');
  const label = "aria-label=\"Открыть '+safe(hname(h.id))+'\"";
  const deleteLabel = "aria-label=\"Удалить '+safe(hname(h.id))+'\"";
  assert.ok(directory.includes(label), 'open controls must identify and escape the hive name');
  assert.ok(directory.includes(deleteLabel), 'delete controls must identify and escape the hive name');
  assert.equal(directory.split(label).length - 1, 2, 'card and open button must both have the target name');
  assert.equal(directory.split(deleteLabel).length - 1, 1, 'delete button must have the target name');
});

test('accessible button names do not change the existing per-hive actions', () => {
  assert.ok(directory.includes('onclick="openHive(this.parentElement.dataset.hiveId)"'));
  assert.ok(directory.includes('onclick="deleteHive(this.parentElement.dataset.hiveId)"'));
  assert.ok(directory.includes('role="button" tabindex="0"'));
  assert.ok(html.includes('class="home-hive" role="button" tabindex="0"'));
});

function currentKeyboardHandler() {
  const match = html.match(/document\.addEventListener\('keydown',event=>\{[\s\S]*?\n\}\);/);
  assert.ok(match, 'current delegated keyboard activation must be present');
  let handler = null;
  new Function('document', match[0])({
    addEventListener(type, cb) {
      assert.equal(type, 'keydown');
      handler = cb;
    }
  });
  assert.equal(typeof handler, 'function');
  return handler;
}

test('existing delegated keyboard handling activates hive and frame chips once per event', () => {
  const handler = currentKeyboardHandler();
  for (const key of ['Enter', ' ']) {
    const calls = [];
    const target = { matches: selector => {
      assert.ok(selector.includes('.hive-row-main[role="button"]'));
      assert.ok(selector.includes('.home-hive[role="button"]'));
      assert.ok(selector.includes('.frame-chip[role="button"]'));
      return true;
    }, click: () => calls.push('click') };
    handler({ key, target, preventDefault: () => calls.push('preventDefault') });
    assert.deepEqual(calls, ['preventDefault', 'click'], key);
  }
});

test('unrelated keys and elements cannot trigger a hive operation', () => {
  const handler = currentKeyboardHandler();
  for (const [key, matches] of [['Escape', true], ['Tab', true], ['Enter', false], [' ', false]]) {
    let count = 0;
    handler({ key, target: { matches: () => matches, click: () => { count++; } },
      preventDefault: () => { count++; } });
    assert.equal(count, 0, 'unrelated events must remain inert');
  }
  assert.doesNotThrow(() => handler({ key: 'Enter', target: null,
    preventDefault: () => { throw new Error('must not change unrelated input'); } }));
});
