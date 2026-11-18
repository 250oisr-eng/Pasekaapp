import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const navStart = html.indexOf('<nav aria-label="Основные разделы">');
const navEnd = html.indexOf('</nav>', navStart);
const nav = navStart >= 0 && navEnd > navStart ? html.slice(navStart, navEnd) : '';
const navCss = html.slice(html.lastIndexOf('/* Honeycomb navigation:'), html.lastIndexOf('</style>'));

test('all existing navigation destinations remain present exactly once', () => {
  const tabs = [...nav.matchAll(/data-tab="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(tabs, ['home', 'hives', 'entrance', 'journal', 'settings', 'ai', 'forage', 'varroa', 'incidents', 'planning', 'deadout']);
  assert.equal(new Set(tabs).size, 11);
});

test('AI occupies the center of the mobile honeycomb and desktop row', () => {
  assert.ok(navCss.includes('button[data-tab="ai"]{\n  grid-row:2;grid-column:3'));
  assert.ok(navCss.includes('button[data-tab="ai"]{\n    grid-column:6!important'));
  for (const [tab, row, col] of [
    ['home', 1, 2], ['hives', 1, 3], ['entrance', 1, 4],
    ['journal', 2, 1], ['settings', 2, 2], ['ai', 2, 3],
    ['forage', 2, 4], ['varroa', 2, 5],
    ['incidents', 3, 2], ['planning', 3, 3], ['deadout', 3, 4]
  ]) {
    assert.ok(navCss.includes('button[data-tab="' + tab + '"]{grid-row:' + row + ';grid-column:' + col + '}'), tab);
  }
});

test('navigation uses hexagonal touch targets, safe-area spacing and responsive layouts', () => {
  for (const rule of [
    'clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)',
    'grid-template-rows:repeat(3,56px)',
    'height:56px;min-height:56px',
    'env(safe-area-inset-bottom,0px)',
    '@media(min-width:700px)',
    'grid-template-columns:repeat(11,minmax(0,1fr))!important',
    'prefers-reduced-motion:reduce'
  ]) assert.ok(navCss.includes(rule), rule);
});
