import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function load(deps) {
 const filterStart=html.indexOf('function journalRecordMatchesPeriod(');
 const filterEnd=html.indexOf('function journalCsvCell(',filterStart);
 assert.ok(filterStart>=0&&filterEnd>filterStart);
 deps.renderJournalPeriodSummary=()=>{};
 deps.filteredJournalRows=new Function('deps','with(deps){'+html.slice(filterStart,filterEnd)+';return filteredJournalRows;}')(deps);
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
  return { records,els,deps,render:load(deps) };
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
test('shared selected-hive filter sorts only matching records and render reuses the family index',()=>{
 const filterStart=html.indexOf('function journalRecordMatchesPeriod(');
 const filterEnd=html.indexOf('function journalCsvCell(',filterStart);
 const filterSource=html.slice(filterStart,filterEnd);
 const renderSource=html.slice(html.indexOf('function renderJournalRecords(){'),html.indexOf('function clearJournalFilters(){'));
 assert.match(filterSource,/\.sort\(\(a,b\)=>String\(b\.date\|\|''\)/);
 assert.match(filterSource,/familyById\.get\(r\.family\)/);
 assert.match(renderSource,/filteredJournalRows\(familyById\)/);
 assert.doesNotMatch(filterSource,/S\.families\.find\(/);
});
test('family-name search and family dropdown use indexed lookup without repeated array.find',()=>{
 const {els,deps,render}=env();
 deps.S.families.find=()=>{throw Error('linear family scan forbidden')};
 els.journalSearch.value='family 1';
 assert.doesNotThrow(render);
 assert.match(els.records.innerHTML,/data-record-id="a"/);
 assert.match(els.records.innerHTML,/data-record-id="b"/);
 assert.doesNotMatch(els.records.innerHTML,/data-record-id="c"/);
 assert.match(els.journalFamilyFilter.innerHTML,/Family 1/);
});
test('archived family snapshot remains searchable when current family lookup has no match',()=>{
 const {els,deps,records,render}=env();
 deps.S.families=deps.S.families.filter(f=>f.id!=='f2');
 records[3].familySnapshotAtTime={name:'Историческая семья'};
 els.journalSearch.value='историческая семья';
 assert.doesNotThrow(render);
 assert.match(els.records.innerHTML,/data-record-id="c"/);
 assert.equal(els.journalResultCount.textContent,'1 из 3 записей');
});

test('legacy duplicate family ID retains first-match behavior of former Array.find',()=>{
 const {deps,els,render}=env();
 deps.S.families.push({id:'f1',name:'Different duplicate'});
 els.journalSearch.value='family 1';
 render();
 assert.match(els.journalFamilyFilter.innerHTML,/Family 1/);
 assert.doesNotMatch(els.journalFamilyFilter.innerHTML,/Different duplicate/);
 assert.match(els.records.innerHTML,/data-record-id="a"/);
 assert.match(els.records.innerHTML,/data-record-id="b"/);
});

test('family dropdown avoids repeated visible-record scans while retaining first historical label',()=>{
 const {deps,records,els,render}=env();
 deps.S.families=deps.S.families.filter(f=>f.id!=='f2');
 records[3].familyNameAtTime='Первое историческое имя';
 records.push({id:'later',hive:'h1',family:'f2',date:'2026-11-19',type:'Осмотр',familyNameAtTime:'Другое имя'});
 // Observe only the current available record array's find, not shared infrastructure.
 let recordFindCalls=0;
 const oldFilter=deps.S.records.filter.bind(deps.S.records);
 deps.S.records.filter=(...args)=>{
   const rows=oldFilter(...args);
   rows.find=()=>{recordFindCalls++;throw Error('repeated record scan forbidden');};
   return rows;
 };
 els.journalSearch.value='';
 assert.doesNotThrow(render);
 assert.equal(recordFindCalls,0);
 assert.match(els.journalFamilyFilter.innerHTML,/Первое историческое имя/);
 assert.doesNotMatch(els.journalFamilyFilter.innerHTML,/Другое имя/);
 assert.deepEqual(records.map(r=>r.id).slice(0,5),['a','z','b','c','archived']);
});
