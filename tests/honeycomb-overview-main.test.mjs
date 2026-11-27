import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const nav = html.match(/<nav aria-label="Основные разделы">([\s\S]*?)<\/nav>/)?.[1] || '';
const cssStart = html.indexOf('/* Scoped, accessible honeycomb navigation ported selectively from historical #187.');
const cssEnd = html.lastIndexOf('</style>');
const css = cssStart >= 0 && cssEnd > cssStart ? html.slice(cssStart, cssEnd) : '';

test('all eleven navigation routes retain consistent visible and keyboard order', () => {
  const tabs = [...nav.matchAll(/data-tab="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(tabs, ['home','hives','entrance','journal','settings','ai','forage','varroa','incidents','planning','deadout']);
  assert.equal(new Set(tabs).size, 11);
  assert.equal((nav.match(/data-tab="ai"/g) || []).length, 1, 'one AI entry');
  assert.match(nav, /<button class="active" data-tab="home"[^>]*aria-current="page"/);
  assert.ok(!/onkeydown=/.test(nav), 'do not reinstate legacy inline key events');
});

test('responsive honeycomb places AI in true center with unique grid cells', () => {
  assert.ok(css, 'honeycomb styles must be declared after current main rules');
  const grid = [['home',1,2],['hives',1,3],['entrance',1,4],
    ['journal',2,1],['settings',2,2],['ai',2,3],['forage',2,4],['varroa',2,5],
    ['incidents',3,2],['planning',3,3],['deadout',3,4]];
  const cells = new Set(grid.map(([,row,col]) => row + ':' + col));
  assert.equal(cells.size, 11, 'mobile cells must not overlap');
  for (const [tab,row,col] of grid) {
    const re = new RegExp('button\\[data-tab="' + tab + '"\\]\\s*\\{[^}]*grid-row:' + row + ';grid-column:' + col);
    assert.match(css, re, 'mobile slot: ' + tab);
  }
  for(const token of [
    'grid-template-rows:repeat(3,56px)', 'clip-path:polygon(25% 0',
    'calc(9px + env(safe-area-inset-bottom,0px))',
    '@media(min-width:700px)', 'grid-template-columns:repeat(11,minmax(0,1fr))',
    'grid-column:6!important', 'orientation:landscape',
    'min-height:48px', 'focus-visible', 'prefers-reduced-motion:reduce'
  ]) assert.ok(css.includes(token), 'missing nav safety constraint: ' + token);
  assert.match(css, /button\[data-tab="ai"\]\{\s*grid-row:2;grid-column:3/);
  assert.match(html, /document\.addEventListener\('keydown',event=>\{/);
});

const homeStart = html.indexOf('function renderHome(){');
const homeEnd = html.indexOf('\nfunction taskMarkup(', homeStart);
const homeSource = homeStart >= 0 && homeEnd > homeStart ? html.slice(homeStart,homeEnd) : '';
test('overview renders at most three hive previews without removing full-list route', () => {
  assert.ok(homeSource, 'current renderHome body must be located');
  assert.match(homeSource, /const homeHivePreviewLimit=3;/);
  assert.match(homeSource, /S\.hives\.slice\(0,homeHivePreviewLimit\)\.map/);
  assert.match(homeSource, /homeHivePreviewCount\.textContent/);
  assert.match(html, /id="homeHivePreviewCount" class="muted" aria-live="polite"/);
  assert.match(html, /<button onclick="showTab\('hives'\)">Все ульи/);
  assert.match(html, /<section id="hives" class="panel">/);
  assert.ok(html.includes('Все ульи, семьи, рамки, осмотры и перестановки здесь являются проектными данными'),
    'safety caveat must remain visible and not be collapsed');
});

function exerciseHome(count, tasks = []) {
  assert.ok(homeSource, 'renderHome source available');
  const slots = Object.fromEntries(['homeHives','homeHivePreviewCount','homeAlerts','homeTasks']
    .map(id => [id, {innerHTML:'',textContent:''}]));
  const S = {hives:Array.from({length:count}, (_,i)=>({id:'hive-'+i})),families:[],tasks};
  const get = id => slots[id] || null;
  const render = new Function('$','S','renderApiaryStatus','layoutFor','getHiveProfile','profileBroodKeys',
    'profileHoneyKeys','today','safe','frameStatusName','hname','ruPlural','taskMarkup',
    homeSource+'\nreturn renderHome;'
  )(get,S,()=>{},()=>({mode:'summer',installedBoxes:[],honeyBoxInstalled:[],honeyFrames:[],boxes:{}}),
    ()=>({family:'farrar',name:'Тестовый профиль',layout:{rows:[]}}),
    ()=>[],()=>[] ,()=> '2026-11-27',
    value=>String(value??''),()=> 'Пусто',id=>id,(n,one,two,many)=>n===1?one:many,
    task=>'<mark>'+task.id+'</mark>');
  render();
  return slots;
}

test('real renderHome with synthetic 0/1/3/4/10 hives never hides data without a full-list path', () => {
  for (const count of [0,1,3,4,10]) {
    const slots = exerciseHome(count);
    const cards = slots.homeHives.innerHTML.match(/class="home-hive" role="button"/g) || [];
    assert.equal(cards.length, Math.min(3,count), 'hive preview count ' + count);
    assert.equal(slots.homeHivePreviewCount.textContent,
      count > 3 ? 'Показаны 3 из '+count+' ульев. Полный список — в разделе «Ульи».' : '');
    if (count === 0) assert.match(slots.homeHives.innerHTML, /Добавь первый улей/);
  }
});

test('urgent and today tasks remain visible even for hives beyond preview limit', () => {
  const slots=exerciseHome(10,[
    {id:'overdue-hive-9',hive:'hive-9',status:'pending',date:'2026-11-26'},
    {id:'today-hive-9',hive:'hive-9',status:'pending',date:'2026-11-27'}
  ]);
  assert.match(slots.homeAlerts.innerHTML, /overdue-hive-9/);
  assert.match(slots.homeTasks.innerHTML, /today-hive-9/);
});


test('central AI respects its grid cell and never inherits legacy upward translateY', () => {
  assert.match(css,/grid-row:2;grid-column:3;width:min\(64px,100%\);height:56px;min-height:56px/);
  assert.match(css,/transform:none!important; \/\* override legacy translateY/);
  assert.match(css,/grid-column:6!important;width:min\(68px,100%\)/);
  assert.match(css,/@media\(max-width:340px\)[\s\S]*?width:min\(58px,100%\)/);
});
