import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const nav = html.match(/<nav aria-label="Основные разделы">([\\s\\S]*?)<\\/nav>/)?.[1] || '';
const navCss = html.slice(html.lastIndexOf('/* Honeycomb navigation:'), html.lastIndexOf('</style>'));

test('all existing navigation destinations remain present exactly once', () => {
  const tabs = [...nav.matchAll(/data-tab="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(tabs, ['home', 'hives', 'entrance', 'journal', 'settings', 'ai', 'forage', 'varroa', 'incidents', 'planning', 'deadout']);
  assert.equal(new Set(tabs).size, 11);
});

test('AI occupies the center of the mobile honeycomb and desktop row', () => {
  assert.match(navCss, /button\\[data-tab="ai"\\]\\{\\s*grid-row:2;grid-column:3/);
  assert.match(navCss, /button\\[data-tab="ai"\\]\\{\\s*grid-column:6!important/);
  for (const [tab, row, col] of [
    ['home', 1, 2], ['hives', 1, 3], ['entrance', 1, 4],
    ['journal', 2, 1], ['settings', 2, 2], ['ai', 2, 3],
    ['forage', 2, 4], ['varroa', 2, 5],
    ['incidents', 3, 2], ['planning', 3, 3], ['deadout', 3, 4]
  ]) {
    assert.match(navCss, new RegExp('button\\\\[data-tab="' + tab + '"\\\\]\\\\{grid-row:' + row + ';grid-column:' + col + '\\\\}'));
  }
});

test('navigation uses hexagonal touch targets, safe-area spacing and responsive layouts', () => {
  assert.match(navCss, /clip-path:polygon\\(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%\\)/);
  assert.match(navCss, /grid-template-rows:repeat\\(3,56px\\)/);
  assert.match(navCss, /height:56px;min-height:56px/);
  assert.match(navCss, /env\\(safe-area-inset-bottom,0px\\)/);
  assert.match(navCss, /@media\\(min-width:700px\\)/);
  assert.match(navCss, /grid-template-columns:repeat\\(11,minmax\\(0,1fr\\)\\)!important/);
  assert.match(navCss, /prefers-reduced-motion:reduce/);
});
