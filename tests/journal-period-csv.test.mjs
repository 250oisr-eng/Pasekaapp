import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
function load(name,deps={}){
 const at=html.indexOf('function '+name+'(');
 assert.ok(at>=0,'missing '+name);
 const end=html.indexOf('\nfunction ',at+10);
 const source=html.slice(at,end>=0?end:html.indexOf('</script>',at));
 return new Function(...Object.keys(deps),source+';return '+name)(...Object.values(deps));
}
const matchPeriod=load('journalRecordMatchesPeriod');
const period=load('journalPeriodSummary',{journalRecordMatchesPeriod:matchPeriod});
const cell=load('journalCsvCell');
const build=load('buildJournalPeriodSummaryCsv',{journalPeriodSummary:period,journalCsvCell:cell,hname:id=>'Улей '+id});
test('journal period CSV exports every hive and counts per category without media or archived records',()=>{
 const state={hives:[{id:'a'},{id:'b'}],records:[
  {id:'r1',hive:'a',date:'2026-08-01',type:'Осмотр',text:'личное',media:[{data:'PRIVATE'}]},
  {id:'r2',hive:'a',date:'2026-08-02',type:'Осмотр'},
  {id:'r3',hive:'a',date:'2026-08-01',type:'Подкормка'},
  {id:'r4',hive:'b',date:'2026-08-01',type:'Осмотр',archivedAt:'2026-09-01'},
  {id:'r5',hive:'b',date:'2026-09-01',type:'Осмотр'}]};
 const before=JSON.stringify(state);
 const csv=build(state,'2026-08-01','2026-08-02');
 assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"Улей a";"a";"Осмотр";"2";"3"'));
 assert.ok(csv.includes('"Улей b";"b";"";"0";"0"'));
 assert.ok(!csv.includes('PRIVATE')&&!csv.includes('личное')&&!csv.includes('r4'));
 assert.equal(JSON.stringify(state),before);
});
test('CSV formula injection is escaped and historical unknown hive remains identified',()=>{
 const state={hives:[],records:[{id:'x',hive:'=1+1',date:'2026-07-01',type:'@SUM(A1)'}]};
 const csv=build(state,'2026-07-01','');
 assert.ok(csv.includes('"\'=1+1"'));
 assert.ok(csv.includes('"\'@SUM(A1)"'));
 assert.ok(csv.includes('Исторический улей'));
});
test('CSV refuses invalid dates or corrupt state and requires no backups',()=>{
 const state={hives:[{id:'h'}],records:[]};
 for(const [from,to] of [['2026-11-29','2026-11-28'],['2026-02-30',''],['abc','2026-05-01']]){
  assert.throws(()=>build(state,from,to),/диапазон дат/);
 }
 assert.throws(()=>build({hives:[],records:null},'',''),/повреждён/);
 assert.match(html,/onclick="downloadJournalPeriodSummaryCsv\(\)"/);
});
