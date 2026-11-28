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
test('family card compares only date-separated inspections of the same identified family in the current hive',()=>{
 const source=html.slice(html.indexOf('function hiveObservationDate('),html.indexOf('function hiveTechnicalProjection('));
 const snapshot=new Function(source+';return familyObservationSnapshot')();
 const families=[{id:'a',hive:'h'},{id:'b',hive:'h'}];
 const records=[
  {id:'a1',hive:'h',family:'a',type:'Осмотр',date:'2026-05-03',occupancy:3},
  {id:'b1',hive:'h',family:'b',type:'Осмотр',date:'2026-05-02',occupancy:6},
  {id:'a0',hive:'h',family:'a',type:'Осмотр',date:'2026-05-01',occupancy:1},
  {id:'old-hive',hive:'other',family:'a',type:'Осмотр',date:'2026-05-04',occupancy:99},
  {id:'archived',hive:'h',family:'a',type:'Осмотр',date:'2026-05-05',occupancy:99,archivedAt:'2026-05-06'},
  {id:'conflict',hive:'h',family:'a',familySnapshotAtTime:{id:'b'},type:'Осмотр',date:'2026-05-06',occupancy:99}
 ];
 const before=structuredClone(records);
 assert.equal(snapshot(records,families,'h','a').metrics[0].delta,2);
 assert.equal(snapshot(records,families,'h','b').metrics[0].delta,null);
 assert.equal(snapshot(records,families,'h','a').date,'2026-05-03');
 assert.equal(snapshot(records,families,'h','a').metrics[1].value,null);
 assert.equal(snapshot(records,[...families,{id:'a',hive:'h'}],'h','a'),null);
 records[0].family='';
 assert.equal(snapshot(records,families,'h','a').metrics[0].delta,null);
 records[0].family='a';assert.deepEqual(records,before);
});

test('family card opens only a unique, live, correctly linked record, never arbitrary duplicate IDs',()=>{
 const start=html.indexOf('function openFamilyHistoryRecord(');
 const source=html.slice(start,html.indexOf('function renderFamilyHistory()',start));
 const records=[{id:'valid',family:'a',hive:'h'}, {id:'archived',family:'a',hive:'h',archivedAt:'2026-04-11'},
  {id:'other',family:'b',hive:'h'}, {id:'old-hive',family:'a',hive:'missing'},
  {id:'mismatch',family:'a',familySnapshotAtTime:{id:'b'},hive:'h'}];
 const opened=[],warnings=[];
 let rerenders=0;
 const host={dataset:{familyId:'a'}};
 const run=new Function('$','S','renderFamilyHistory','alert','editRecord','familyJournalHistory',
  source+';return openFamilyHistoryRecord')(
    () => host, {records,hives:[{id:'h'}],families:[{id:'a'}]},
    () => {rerenders++;}, text=>warnings.push(text),id=>opened.push(id),history);
 run('valid');
 for(const id of ['archived','other','old-hive','mismatch','unknown',''])run(id);
 assert.deepEqual(opened,['valid']);
 assert.equal(warnings.length,6);
 records.push({id:'valid',family:'a',hive:'h',text:'conflicting legacy duplicate'});
 run('valid');
 assert.deepEqual(opened,['valid'],'duplicate ID must not open arbitrary first match');
 assert.equal(warnings.length,7);
 assert.equal(rerenders,7);
});
test('family card preserves #599 direct search and inventory navigation',()=>{
 assert.ok(html.includes('const matches=S.records.filter(r=>r.id===id);'),
   'global search must reject duplicate journal IDs');
 assert.ok(html.includes("if(kind==='corpus'){openEquipmentInventory(button.dataset.id);return}"),
   'inventory result must open the selected physical body');
});


test('stale or ambiguous family search results never switch hives or open another family',()=>{
 const start=html.indexOf('function openFamilyHistory('),end=html.indexOf('function openFamilyHistoryRecord(',start);
 const source=html.slice(start,end);
 const state={families:[{id:'moved',hive:'h2'},{id:'dup',hive:'h1'},{id:'dup',hive:'h2'},{id:'orphan',hive:'gone'}],
  hives:[{id:'h1'},{id:'h2'}]};
 let warnings=0,refreshes=0;
 const run=new Function('S','renderGlobalSearch','alert',source+';return openFamilyHistory')(
  state,()=>refreshes++,()=>warnings++);
 for(const [id,hive] of [['moved','h1'],['dup','h1'],['orphan','gone'],['deleted','h1']])run(id,hive);
 assert.equal(warnings,4);
 assert.equal(refreshes,4);
});

test('direct family search preserves record and physical inventory routes',()=>{
 const at=html.indexOf('function openGlobalSearchResult(');
 const fn=html.slice(at,html.indexOf('function inventoryConditionLabel(',at));
 assert.match(fn,/if\(kind==='family'\)\{openFamilyHistory\(button.dataset.id,hiveId\);return\}/);
 assert.match(fn,/if\(kind==='hive'\)\{openHive\(hiveId\);return\}/);
 assert.match(fn,/if\(kind==='corpus'\)\{openEquipmentInventory\(button.dataset.id\);return\}/);
 assert.match(fn,/const matches=S.records.filter\(r=>r.id===id\)/);
});
