import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function load(deps) {
  const start = html.indexOf('function renderJournalRecords(){');
  assert.ok(start >= 0);
  const next = /\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
  next.lastIndex = start + 20;
  const match = next.exec(html);
  const source = html.slice(start, match ? match.index : html.indexOf('</script>', start));
  return new Function('deps', 'with(deps){ return (' + source + '); }')(deps);
}
const host = () => ({ innerHTML:'', textContent:'', classList:{toggle(){}} });
const safe = value => String(value ?? '');
function env() {
  const records = [
    { id:'a', hive:'h1', family:'f1', date:'2026-11-20', type:'Осмотр', text:'ключ старый' },
    { id:'z', hive:'h2', family:'f2', date:'2026-11-23', type:'Осмотр', text:'ключ чужой' },
    { id:'b', hive:'h1', family:'f1', date:'2026-11-22', type:'Осмотр', text:'ключ новый' },
    { id:'c', hive:'h1', family:'f2', date:'2026-11-21', type:'Подкормка', text:'другая запись' },
    { id:'archived', hive:'h1', family:'f1', date:'2026-11-24', type:'Осмотр', text:'ключ архивный', archivedAt:'2026-11-24' }
  ];
  const els = {
    records:host(), journalResultCount:host(),
    journalSearch:{value:'ключ'}, journalDateFilter:{value:''},
    journalTypeFilter:{value:'all',innerHTML:''},
    journalFamilyFilter:{value:'all',innerHTML:''}
  };
  const deps = { S:{records,families:[{id:'f1',name:'Family 1'},{id:'f2',name:'Family 2'}]},
    activeJournalHive:'h1', $:id=>els[id]||null, renderFeedingLedger(){},
    safe, recordFamilyHtml:()=>'', recordExtraHtml:()=>'', mediaHtml:()=>'' };
  return { records,els,render:load(deps) };
}
test('selected hive filtering and ordering preserve persistent original records',()=>{
 const {records,els,render}=env();
 render();
 assert.match(els.records.innerHTML,/data-record-id="b"/);
 assert.ok(els.records.innerHTML.indexOf('data-record-id="b"')<els.records.innerHTML.indexOf('data-record-id="a"'));
 assert.doesNotMatch(els.records.innerHTML,/data-record-id="z"|data-record-id="c"|data-record-id="archived"/);
 assert.equal(els.journalResultCount.textContent,'2 из 3 записей');
 els.journalSearch.value='';
 render();
 const full=els.records.innerHTML;
 assert.ok(full.indexOf('data-record-id="b"')<full.indexOf('data-record-id="c"'));
 assert.ok(full.indexOf('data-record-id="c"')<full.indexOf('data-record-id="a"'));
 assert.equal(els.journalResultCount.textContent,'3 из 3 записей');
 assert.deepEqual(records.map(r=>r.id),['a','z','b','c','archived']);
});
test('type, family, date and search are applied before chronological sort',()=>{
 const {els,render}=env();
 els.journalSearch.value='';
 render();
 els.journalTypeFilter.value='Подкормка';
 els.journalFamilyFilter.value='f2';
 els.journalDateFilter.value='2026-11-21';
 render();
 assert.match(els.records.innerHTML,/data-record-id="c"/);
 assert.doesNotMatch(els.records.innerHTML,/data-record-id="a"|data-record-id="b"/);
 els.journalDateFilter.value='2026-11-22';
 render();
 assert.doesNotMatch(els.records.innerHTML,/data-record-id="c"/);
 assert.equal(els.journalResultCount.textContent,'0 из 3 записей');
});
test('no text search does not enumerate obsolete media names',()=>{
 const {records,els,render}=env();
 els.journalSearch.value='';
 records[0].media=[{ get name(){ throw Error('full-text media accessed unnecessarily'); } }];
 assert.doesNotThrow(render);
 els.journalSearch.value='ключ';
 assert.throws(render,/full-text media accessed unnecessarily/);
});
test('journal reads only selected rows for sorting without sorting unfiltered hive history',()=>{
 const start=html.indexOf('function renderJournalRecords(){');
 const end=html.indexOf('\nfunction ',start+20);
 const source=html.slice(start,end);
 assert.match(source,/const rows=activeJournalHive\?available:\[\];/);
 assert.match(source,/\}\)\.sort\(\(a,b\)=>String\(b\.date\|\|''\)/);
 assert.doesNotMatch(source,/available\.filter\([^\n]+\)\.sort\(/);
});
