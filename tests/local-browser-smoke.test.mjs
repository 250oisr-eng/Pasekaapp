import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { NAV_TABS, isAllowedAppPath, isAllowedLocalUrl, normalizeDevToolsUrl, resolveSafePath } from '../scripts/local-browser-smoke.mjs';

test('local browser runner serves only files inside the project root', () => {
  const root = resolve('C:/paseka/project');
  assert.equal(resolveSafePath(root, '/index.html'), resolve(root, 'index.html'));
  assert.equal(resolveSafePath(root, '/js/app.js'), resolve(root, 'js/app.js'));
  assert.equal(resolveSafePath(root, '/%2e%2e/private.txt'), null);
  assert.equal(resolveSafePath(root, '/..%2fprivate.txt'), null);
  if (process.platform === 'win32') assert.equal(resolveSafePath(root, '/%5c..%5cprivate.txt'), null);
  else assert.ok(resolveSafePath(root, '/%5c..%5cprivate.txt'));
  assert.equal(resolveSafePath(root, '/bad%ZZ'), null);
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

test('local server exposes only the application runtime files', () => {
  assert.equal(isAllowedAppPath('index.html'), true);
  assert.equal(isAllowedAppPath('manifest.webmanifest'), true);
  assert.equal(isAllowedAppPath('sw.js'), true);
  assert.equal(isAllowedAppPath('js/voice-session.js'), true);
  assert.equal(isAllowedAppPath('icons/paseka.svg'), true);
  assert.equal(isAllowedAppPath('package.json'), false);
  assert.equal(isAllowedAppPath('PROJECT_STATUS.md'), false);
  assert.equal(isAllowedAppPath('docs/ПАСПОРТ-ПРОЕКТА.md'), false);
});

test('DevTools websocket is pinned to the loopback IPv4 endpoint', () => {
  assert.equal(
    normalizeDevToolsUrl('ws://localhost:9222/devtools/page/abc'),
    'ws://127.0.0.1:9222/devtools/page/abc'
  );
});
