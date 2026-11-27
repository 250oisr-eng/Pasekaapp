import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const nav = html.match(/<nav aria-label="Основные разделы">([\s\S]*?)<\/nav>/)?.[1] || '';
const cssStart = html.indexOf('/* Unified workspace navigation');
const cssEnd = html.lastIndexOf('</style>');
const css = cssStart >= 0 && cssEnd > cssStart ? html.slice(cssStart, cssEnd) : '';

test('five sections and a single canonical AI preserve all routes', () => {
 const tabs=[...nav.matchAll(/data-tab="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(tabs,['home','hives','journal','planning','settings','ai']);
 assert.equal(new Set(tabs).size,6);
 for(const [parent,children] of Object.entries({hives:['entrance'],planning:['forage'],settings:['incidents','deadout','varroa']})){
  const section=html.slice(html.indexOf('<section id="'+parent+'" class="panel">'));
  const group=section.match(/<div class="section-shortcuts" role="group"[\s\S]*?<\/div>/)?.[0]||'';
  assert.deepEqual([...group.matchAll(/data-subtab="([^"]+)"/g)].map(m=>m[1]),children);
  for(const child of children){
   assert.ok(html.includes('id="'+child+'" class="panel"'));
   assert.ok(group.includes("showTab('"+child+"')"));
  }
 }
 assert.equal((nav.match(/data-tab="ai"/g)||[]).length,1);
 assert.match(nav,/<button data-tab="home" class="active"[^>]*aria-current="page"/);
 assert.match(nav,/aria-label="Открыть ИИ-помощника"[^>]*>ИИ<\/button>/);
 assert.doesNotMatch(nav,/onkeydown=/);
});
test('persistent bottom bar is accessible and adapts field mode without obsolete shape constraints',()=>{
 assert.ok(css);
 for(const token of ['grid-template-columns:repeat(6,minmax(0,1fr))!important','min-height:48px','min-height:56px','clip-path:none','env(safe-area-inset-bottom,0px)','focus-visible','prefers-reduced-motion:reduce'])assert.ok(css.includes(token),token);
 assert.doesNotMatch(css,/display:none!important/);
 assert.doesNotMatch(nav,/nav-ai-bee/);
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
  slots.homeTaskHive={value:'',replaceChildren(...options){this.options=options;this.value=options[0].value}};
  const S = {hives:Array.from({length:count}, (_,i)=>({id:'hive-'+i})),families:[],tasks};
  const get = id => slots[id] || null;
  const render = new Function('$','S','renderApiaryStatus','layoutFor','getHiveProfile','profileBroodKeys',
    'profileHoneyKeys','today','safe','frameStatusName','hname','ruPlural','taskMarkup','Option','renderWorkspace',
    homeSource+'\nreturn renderHome;'
  )(get,S,()=>{},()=>({mode:'summer',installedBoxes:[],honeyBoxInstalled:[],honeyFrames:[],boxes:{}}),
    ()=>({family:'farrar',name:'Тестовый профиль',layout:{rows:[]}}),
    ()=>[],()=>[] ,()=> '2026-11-27',
    value=>String(value??''),()=> 'Пусто',id=>id,(n,one,two,many)=>n===1?one:many,
    task=>'<mark>'+task.id+'</mark>',class Option {constructor(text,value){this.text=text;this.value=value}},()=>{});
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


test('AI is a single explicit action, not an old decorative constraint',()=>{assert.match(nav,/data-tab="ai"[^>]*aria-label="Открыть ИИ-помощника"/);assert.match(css,/transform:none!important/);});
