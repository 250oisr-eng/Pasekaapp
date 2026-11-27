import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const nav = html.match(/<nav aria-label="Основные разделы">([\s\S]*?)<\/nav>/)?.[1] || '';
const hive = html.match(/<dialog id="hiveDlg"[^>]*>[\s\S]*?<\/dialog>/)?.[0] || '';

test('new-hive dialog and both controls have explicit accessible names', () => {
  assert.match(hive, /<dialog id="hiveDlg" aria-labelledby="hiveDialogTitle"><h2 id="hiveDialogTitle">Новый улей<\/h2>/);
  assert.match(hive, /<label for="newHiveMode">Первоначальная комплектация<\/label><select id="newHiveMode">/);
  assert.match(hive, /<label for="hiveDesc">Примечание об улье \(необязательно\)<\/label><textarea id="hiveDesc"/);
  assert.match(hive, /<button class="primary">Создать и настроить корпуса<\/button>/);
  assert.match(hive, /<button type="button" onclick="hiveDlg\.close\(\)">Отмена<\/button>/);
  assert.match(html, /#hiveDlg button\{min-height:44px\}/);
});

test('home stat captions are legible, including narrow phones', () => {
  const stat = html.match(/\.apiary-stat span\{([^}]+)\}/)?.[1] || '';
  assert.match(stat, /font-size:12px/);
  assert.match(stat, /color:#4f5f52/);
  assert.match(stat, /line-height:1\.3/);
  assert.match(html, /@media\(max-width:360px\)[^\n]*\.apiary-stat span\{font-size:12px\}/);
  const luminance = hex => {
    const channels = hex.slice(1).match(/.{2}/g).map(v => {
      const n = parseInt(v, 16) / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const background = luminance('#f1f4ed');
  const foreground = luminance('#4f5f52');
  assert.ok((background + 0.05) / (foreground + 0.05) >= 4.5, 'WCAG AA normal-text contrast');
});

test('navigation retains five primary destinations and marks the initial active page', () => {
  const tabs = [...nav.matchAll(/data-tab="([^"]+)"/g)].map(x => x[1]);
  assert.deepEqual(tabs, ['home','hives','journal','planning','settings','ai']);
  assert.match(nav, /<button data-tab="home" class="active" aria-label="Обзор пасеки" aria-current="page">/);
  assert.equal((nav.match(/aria-current="page"/g) || []).length, 1);
});

function navigationHarness() {
  const tabs = [...nav.matchAll(/data-tab="([^"]+)"/g)].map(x => x[1]);
  const nodes = tabs.map(tab => {
    const attributes = new Map();
    const classes = new Set(tab === 'home' ? ['active'] : []);
    return {
      dataset: { tab }, attributes, classes,
      classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } },
      setAttribute(name, value) { attributes.set(name, value); },
      removeAttribute(name) { attributes.delete(name); },
      getAttribute(name) { return attributes.get(name) || null; }
    };
  });
  const panels = [...tabs, 'hiveDetail','entrance','varroa','planning','forage','incidents','deadout'].map(id => ({
    id, classList: { toggle() {} }
  }));
  const slots = { backBar:{style:{}}, selectedHivePanel:{style:{}}, hiveHeaderSummary:{style:{}}, currentSectionTitle:{textContent:'Обзор'} };
  const doc = {
    body:{dataset:{}},
    getElementById(id) { return panels.find(x => x.id === id) || null; },
    querySelector(selector) {
      if(selector === 'header .stats') return { style:{} };
      if(selector === 'meta[name="theme-color"]') return { setAttribute() {} };
      return null;
    },
    querySelectorAll(selector) {
      if(selector === 'nav button') return nodes;
      if(selector === '.panel') return panels;
      throw new Error('Unexpected selector: ' + selector);
    }
  };
  const start = html.indexOf('function paintTab(tab){');
  const end = html.indexOf('\nfunction showTab(', start);
  assert.ok(start >= 0 && end > start, 'current navigation function exists');
  const source = html.slice(start, end);
  const paintTab = new Function(
    'document','$','selectedHiveId','S','renderStructure','renderEntranceModule',
    'renderSeasonPlanning','renderDeadoutModule', source + ';return paintTab;'
  )(doc, id => slots[id] || null, 'synthetic-only-id', {hives:[{id:'synthetic-only-id',name:'Тестовый улей'}]}, () => {}, () => {}, () => {}, () => {});
  return {paintTab,doc,nodes,slots};
}

test('live paintTab switches aria-current exactly once, including hiveDetail and unknown pages', () => {
  const {paintTab,doc,nodes,slots} = navigationHarness();
  const cases = [
    ['home','home'], ['hives','hives'], ['journal','journal'], ['ai','ai'],
    ['hiveDetail','hives'], ['invalid-synthetic-tab','home'], ['entrance','hives'], ['varroa','settings'], ['planning','planning'], ['forage','planning'], ['incidents','settings'], ['deadout','settings']
  ];
  for (const [page, expected] of cases) {
    paintTab(page);
    const current = nodes.filter(x => x.getAttribute('aria-current') === 'page');
    const active = nodes.filter(x => x.classes.has('active'));
    assert.equal(current.length, 1, 'one current page for ' + page);
    assert.equal(active.length, 1, 'one visual active page for ' + page);
    assert.equal(current[0].dataset.tab, expected);
    assert.equal(active[0], current[0]);
    assert.equal(doc.body.dataset.page, page.startsWith('invalid') ? 'home' : page);
    const title = page==='hiveDetail'?'Тестовый улей':({'home':'Обзор','hives':'Ульи','journal':'Журнал','ai':'ИИ-помощник','entrance':'Лёток','varroa':'Клещ','planning':'План','forage':'Медоносы','incidents':'Инциденты','deadout':'Потери','settings':'Ещё'})[page]||'Обзор';
    assert.equal(slots.currentSectionTitle.textContent,title,'title synchronizes with route');
  }
  assert.ok(!html.includes('onkeydown="if(event.key==='), 'do not import old inline navigation handlers');
  assert.match(html, /document\.addEventListener\('keydown',event=>\{/);
});

test('primary menu persists and Back remains available on interior pages',()=>{
 assert.doesNotMatch(html,/body\[data-page\]:not\(\[data-page="home"\]\) main>nav\[aria-label="Основные разделы"\]\{display:none!important\}/);
 assert.doesNotMatch(html,/id="homeButton"/);
 assert.match(html,/id="backBar" style="margin:8px 0;display:none"/);
 const {paintTab,slots}=navigationHarness();
 for(const tab of ['home','hives','hiveDetail','journal','settings','ai','entrance','varroa','planning','forage','incidents','deadout']){
  paintTab(tab);
  assert.equal(slots.backBar.style.display,tab==='home'?'none':'flex');
 }
});
