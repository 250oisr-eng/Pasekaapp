import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function familyJournalHistory('),html.indexOf('function openFamilyHistory('));
const history=new Function(source+';return familyJournalHistory')();
test('family history follows its ID across hives and preserves archived observations for explicit viewing',()=>{
 const rows=[
  {id:'moved',family:'a',hive:'old',date:'2026-06-01'},
  {id:'same-name',family:'b',familyNameAtTime:'А',hive:'new',date:'2026-07-01'},
  {id:'snapshot',familySnapshotAtTime:{id:'a'},archivedAt:'2026-04-11',date:'2026-04-10'},
  {id:'unlinked',hive:'new',familyNameAtTime:'А'},
  {id:'conflicting',family:'a',familySnapshotAtTime:{id:'b'}},
  {id:'current',family:'a',hive:'new',date:'2026-07-10'}
 ];
 const before=structuredClone(rows);
 assert.deepEqual(history(rows,'a').map(r=>r.id),['current','moved','snapshot']);
 assert.deepEqual(history(rows,''),[]);
 assert.deepEqual(rows,before);
});
test('hive summary compares only inspections of the same identified family',()=>{
 const start=html.indexOf('function renderFamilyHealthSummary()');
 const fn=html.slice(start,html.indexOf('function recordFamilyHtml(',start));
 const host={};
 const records=[
  {hive:'h',family:'a',type:'Осмотр',date:'2026-05-03',occupancy:3},
  {hive:'h',family:'b',type:'Осмотр',date:'2026-05-02',occupancy:6},
  {hive:'h',family:'a',type:'Осмотр',date:'2026-05-01',occupancy:1}
 ];
 const render=new Function('$','selectedHiveId','S','journalBroodCapacity','safe',fn+';renderFamilyHealthSummary()');
 render(()=>host,'h',{records},()=>null,String);
 assert.match(host.innerHTML,/рамок \(\+2\)/);
 records[0].family='';
 render(()=>host,'h',{records},()=>null,String);
 assert.doesNotMatch(host.innerHTML,/рамок \([+-]/);
});
