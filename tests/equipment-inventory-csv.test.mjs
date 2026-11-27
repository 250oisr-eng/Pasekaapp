import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const between=(start,end)=>{
 const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Required inventory CSV function present: '+start);
 return html.slice(a,b);
};
const labels=between('function inventoryConditionLabel(value){','function inventoryFrameSearchTokens(');
const csvFns=between('function inventoryCsvCell(value){','function exportFilteredInventoryCsv(){');
const {cell,build}=new Function(labels+'\n'+csvFns+
 '\nreturn {cell:inventoryCsvCell,build:buildInventoryCsv};')();
const sample=(id='body-1')=>({
 id,labelCode:'К-78',kind:'brood',condition:'good',location:'Сарай · полка 2',
 frameCount:6,pairId:null,notes:'Покрашен',
});

test('export builds Excel-compatible UTF-8 BOM, semicolon CSV and preserves physical IDs',()=>{
 const rows=[sample(),{...sample('body-2'),labelCode:'К-79',kind:'honey',
  condition:'needs_repair',location:'Улей 1 · H1',frameCount:null,pairId:'pair-42',
  notes:'Царапины; "скол"\nпроверить'}];
 const before=JSON.stringify(rows),csv=build(rows);
 assert.equal(JSON.stringify(rows),before,'Export must never mutate the inventory');
 assert.ok(csv.startsWith('\uFEFF"Код корпуса";"Тип";"Состояние";"Местонахождение";"Рамок";"Комплект";"ID корпуса";"Примечание"\r\n'));
 assert.match(csv,/"К-78";"Гнездовой";"Исправен";"Сарай · полка 2";"6";"";"body-1";"Покрашен"/);
 assert.match(csv,/"К-79";"Медовый";"Требует осмотра\/ремонта";"Улей 1 · H1";"не учитываются";"pair-42";"body-2";"Царапины; ""скол""\nпроверить"/);
 assert.ok(csv.endsWith('\r\n'));
});

test('CSV cell neutralizes formulas even when hidden controls precede the operator',()=>{
 for(const prefix of ['', ' ', '\t', '\n','\uFEFF','\u200B','\u202E','\u2067']){
  for(const sign of ['=','+','-','@']){
   const value=prefix+sign+'HYPERLINK("https://invalid.example","go")';
   const encoded=cell(value);
   assert.ok(encoded.startsWith('"\'')&&encoded.includes("''")===false,'Must prefix one apostrophe: '+JSON.stringify(value));
   assert.ok(encoded.includes("'"+prefix+sign),'Neutralized before any invisible prefix');
   assert.ok(encoded.includes('""https://invalid.example""'),'Embedded quotes escaped');
  }
 }
 assert.equal(cell('Обычный корпус'),'"Обычный корпус"');
 assert.equal(cell('a;"b"'),'"a;""b"""');
});

test('empty, duplicate and malformed rows fail closed without modifying inputs',()=>{
 assert.throws(()=>build([]),/Нет корпусов/);
 assert.throws(()=>build(null),/Нет корпусов/);
 const cases=[
  [sample(),sample()],
  [{...sample(),id:''}],
  [{...sample(),kind:'unrecognized'}],
  [{...sample(),condition:'wrong'}],
  [{...sample(),frameCount:-1}],
  [{...sample(),frameCount:NaN}],
  [{...sample(),frameCount:'6'}],
  [{...sample(),location:''}],
  [{...sample(),labelCode:''}],
  [{...sample(),notes:{unsafe:true}}],
  [{...sample(),pairId:{id:42}}],
 ];
 for(const rows of cases){
  const before=JSON.stringify(rows);
  assert.throws(()=>build(rows),/поврежд|повторн/i);
  assert.equal(JSON.stringify(rows),before);
 }
});

test('inventory export button is wired only to currently visible rows and no save/restore',()=>{
 assert.match(html,/data-inventory-body="1" data-inventory-id="'\+safe\(body\.id\)\+'"/);
 assert.match(html,/Скачать CSV по фильтрам/);
 const fn=between('function exportFilteredInventoryCsv(){','function clearEquipmentInventoryFilters(){');
 assert.match(fn,/filterEquipmentInventory\(\)/);
 assert.match(fn,/querySelectorAll\('\[data-inventory-body\]'\)/);
 assert.match(fn,/filter\(card=>!card\.hidden\)/);
 assert.doesNotMatch(fn,/\bsave\(|deleteDatabase|restore|logAudit|localStorage|fetch\(/);
 const state={equipmentInventory:{bodies:{'body-1':sample(),'body-2':sample('body-2')}}};
 const cards=[
  {hidden:false,dataset:{inventoryId:'body-1'}},
  {hidden:true,dataset:{inventoryId:'body-2'}}
 ];
 const host={querySelectorAll:()=>cards};
 let csv='',filename='',downloads=0,filters=0,alerts=[];
 const document={
  createElement:()=>({remove(){},click(){downloads++},set download(v){filename=v},set href(v){} }),
  body:{appendChild(){}}
 };
 class FakeBlob{constructor(parts,opts){this.parts=parts;this.opts=opts;}}
 const run=new Function('S','PasekaInventory','profileForHive','inventoryLocationLabel',
  'inventoryBodyFrameCount','PasekaLabels','$','filterEquipmentInventory','buildInventoryCsv',
  'URL','Blob','document','today','Date','setTimeout','alert',
  fn+'\nreturn exportFilteredInventoryCsv;')(
  state,{locateBody:()=>({type:'storage'})},()=>null,()=> 'Сарай · полка 2',
  ()=>6,{formatLabelCode:(kind,x)=>x},id=>id==='equipmentInventoryContent'?host:null,
  ()=>{filters++},build,{createObjectURL:blob=>{csv=blob.parts[0];return 'blob:internal'},
   revokeObjectURL(){}},FakeBlob,document,()=> '2026-11-27',Date,fn=>fn(),
  message=>alerts.push(message)
 );
 const snapshot=JSON.stringify(state);
 run();
 assert.equal(filters,1);
 assert.equal(downloads,1);
 assert.match(filename,/^paseka-inventory-2026-11-27-\d+\.csv$/);
 assert.match(csv,/"body-1"/);
 assert.doesNotMatch(csv,/body-2/);
 assert.deepEqual(alerts,[]);
 assert.equal(JSON.stringify(state),snapshot);
 cards[0].hidden=true;
 run();
 assert.equal(downloads,1,'Empty result must not produce an archive');
 assert.match(alerts.at(-1),/нет корпусов/);
});

test('ambiguous and missing inventory links block CSV instead of exporting false storage',()=>{
 const fn=between('function exportFilteredInventoryCsv(){','function clearEquipmentInventoryFilters(){');
 const sampleState={equipmentInventory:{bodies:{'body-1':sample()}}};
 const host={querySelectorAll:()=>[{hidden:false,dataset:{inventoryId:'body-1'}}]};
 let downloads=0,alerts=[];
 const run=new Function('S','PasekaInventory','profileForHive','inventoryLocationLabel',
  'inventoryBodyFrameCount','PasekaLabels','$','filterEquipmentInventory','buildInventoryCsv',
  'URL','Blob','document','today','Date','setTimeout','alert',
  fn+'\nreturn exportFilteredInventoryCsv;')(
  sampleState,{locateBody:()=>({type:'error'})},()=>null,()=> 'Склад',()=>6,
  {formatLabelCode:(kind,x)=>x},()=>host,()=>{},build,
  {createObjectURL:()=>{downloads++;return 'blob:bad'},revokeObjectURL(){}},
  class{}, {createElement:()=>({}),body:{appendChild(){}}},()=> '2026-11-27',Date,()=>{},
  msg=>alerts.push(msg)
 );
 run();
 assert.equal(downloads,0);
 assert.match(alerts[0],/неоднозначно/);
});