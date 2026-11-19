import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const homeStart=html.indexOf('<section id="home"');
const homeEnd=html.indexOf('</section>',homeStart);
const home=html.slice(homeStart,homeEnd);
const renderStart=html.indexOf('function renderHome(){');
const renderEnd=html.indexOf('\nfunction ',renderStart+10);
const render=html.slice(renderStart,renderEnd);

test('overview caveat remains legible and expandable without forcing long initial scroll',()=>{
  assert.match(home,/<details class="card home-intro-card"[^>]*><summary>Виртуальная модель пасеки/);
  assert.match(home,/Все ульи, семьи, рамки, осмотры и перестановки здесь являются проектными данными/);
  assert.ok(!/<details class="card home-intro-card"[^>]*\sopen\b/.test(home));
});

test('home previews at most three hives and keeps full list available in hives section',()=>{
  assert.match(render,/const homeHivePreviewLimit=3/);
  assert.match(render,/S\.hives\.slice\(0,homeHivePreviewLimit\)\.map/);
  assert.match(render,/S\.hives\.length>homeHivePreviewLimit/);
  assert.match(home,/id="homeHivePreviewCount"/);
  assert.match(home,/onclick="showTab\('hives'\)"[^>]*>Все ульи/);
  assert.match(html,/<section id="hives" class="panel">/);
});
