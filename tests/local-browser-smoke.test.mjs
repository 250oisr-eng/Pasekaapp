import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { NAV_TABS, isAllowedLocalUrl, resolveSafePath } from '../scripts/local-browser-smoke.mjs';

test('local browser runner serves only files inside the project root', () => {
  const root = resolve('C:/paseka/project');
  assert.equal(resolveSafePath(root, '/index.html'), resolve(root, 'index.html'));
  assert.equal(resolveSafePath(root, '/js/app.js'), resolve(root, 'js/app.js'));
  assert.equal(resolveSafePath(root, '/%2e%2e/private.txt'), null);
  assert.equal(resolveSafePath(root, '/..%2fprivate.txt'), null);
  if (process.platform === 'win32') assert.equal(resolveSafePath(root, '/%5c..%5cprivate.txt'), null);
  else assert.ok(resolveSafePath(root, '/%5c..%5cprivate.txt'));
  assert.equal(resolveSafePath(root, '/%E0%A4%A'), null);
});

test('browser runner permits network requests only to its exact loopback origin', () => {
  const origin = 'http://127.0.0.1:43127';
  assert.equal(isAllowedLocalUrl(origin + '/index.html', origin), true);
  assert.equal(isAllowedLocalUrl('http://127.0.0.1:43128/index.html', origin), false);
  assert.equal(isAllowedLocalUrl('http://127.0.0.1.evil.test/index.html', origin), false);
  assert.equal(isAllowedLocalUrl('https://127.0.0.1:43127/index.html', origin), false);
  assert.equal(isAllowedLocalUrl('https://example.com/', origin), false);
  assert.equal(isAllowedLocalUrl('not a URL', origin), false);
});

test('navigation smoke suite covers every primary application section once', () => {
  const ids = NAV_TABS.map(tab => tab.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, [
    'home', 'hives', 'entrance', 'journal', 'ai', 'forage',
    'varroa', 'incidents', 'planning', 'deadout', 'settings'
  ]);
});
