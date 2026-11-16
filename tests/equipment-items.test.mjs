import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../js/equipment-items.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const win={};new Function('window',source)(win);const E=win.PasekaEquipmentItems;
let next=0;const makeId=()=>`item-${++next}`;const now='2026-11-16T12:00:00.000Z';
function fixture(){return {hives:[{id:'h1'}],layouts:{h1:{corpusIds:{A:'body-1'}}},equipmentInventory:{bodies:{'body-1':{id:'body-1',kind:'brood'}}}}}
test('legacy inventory without accessory registry remains valid and unchanged on inspection',()=>{const s={equipmentInventory:{bodies:{old:{id:'old',kind:'brood'}}}},before=JSON.stringify(s);assert.deepEqual(E.inspect(s),[]);assert.equal(JSON.stringify(s),before)});
test('registers only explicitly supplied physical accessory in storage',()=>{const s=fixture(),r=E.register(s,{kind:'bottom',storageLocation:'Сарай · полка 2',notes:'Проверено'},makeId,now);assert.equal(r.ok,true);assert.equal(r.item.kind,'bottom');assert.deepEqual(r.item.location,{type:'storage',label:'Сарай · полка 2'});assert.equal(r.item.events[0].type,'registered');assert.deepEqual(E.inspect(s),[])});
test('does not create items from a quantity or default template',()=>{const s=fixture();E.ensure(s);assert.deepEqual(s.equipmentInventory.items,{});assert.deepEqual(E.inspect(s),[])});
test('invalid registration is atomic and does not alter existing data',()=>{const s=fixture(),before=JSON.stringify(s);const r=E.register(s,{kind:'bottom',storageLocation:''},makeId,now);assert.equal(r.ok,false);assert.equal(JSON.stringify(s),before)});
test('places a metal mesh plug only against an existing hive opening reference',()=>{const s=fixture(),r=E.register(s,{kind:'metalMeshPlug',storageLocation:'Склад'},makeId,now);assert.equal(r.ok,true);assert.equal(E.place(s,{itemId:r.item.id,location:{type:'hive',hiveId:'h1',bodyId:'body-1'}},makeId,now).error,'body_and_opening_reference_required');const placed=E.place(s,{itemId:r.item.id,location:{type:'hive',hiveId:'h1',bodyId:'body-1',openingId:'body-1:left'}},makeId,now);assert.equal(placed.ok,true);assert.equal(placed.item.location.openingId,'body-1:left');assert.deepEqual(E.validateReferences(s),[])});
test('rejects a missing hive or body reference without changing the item location',()=>{const s=fixture(),r=E.register(s,{kind:'cover',storageLocation:'Склад'},makeId,now),before=JSON.stringify(s);assert.equal(E.place(s,{itemId:r.item.id,location:{type:'hive',hiveId:'missing',sectionId:'S1'}},makeId,now).error,'hive_missing');assert.equal(JSON.stringify(s),before);assert.equal(E.place(s,{itemId:r.item.id,location:{type:'hive',hiveId:'h1',bodyId:'missing'}},makeId,now).error,'body_reference_missing');assert.equal(JSON.stringify(s),before)});
test('prevents two plugs of the same kind occupying one technical opening',()=>{const s=fixture(),a=E.register(s,{kind:'metalMeshPlug',storageLocation:'Склад'},makeId,now).item,b=E.register(s,{kind:'metalMeshPlug',storageLocation:'Склад'},makeId,now).item,location={type:'hive',hiveId:'h1',bodyId:'body-1',openingId:'body-1:left'};assert.equal(E.place(s,{itemId:a.id,location},makeId,now).ok,true);assert.equal(E.place(s,{itemId:b.id,location},makeId,now).error,'opening_occupied')});
test('requires technical connection identity for permanent sectional excluders',()=>{const s=fixture(),item=E.register(s,{kind:'technicalQueenExcluder',storageLocation:'Склад'},makeId,now).item;assert.equal(E.place(s,{itemId:item.id,location:{type:'hive',hiveId:'h1',sectionId:'S1'}},makeId,now).error,'connection_reference_required');assert.equal(E.place(s,{itemId:item.id,location:{type:'hive',hiveId:'h1',connectionId:'C1'}},makeId,now).ok,true)});
test('installed items cannot be marked for repair or retired',()=>{const s=fixture(),item=E.register(s,{kind:'cover',storageLocation:'Склад'},makeId,now).item;assert.equal(E.place(s,{itemId:item.id,location:{type:'hive',hiveId:'h1',sectionId:'S1'}},makeId,now).ok,true);assert.equal(E.updateCondition(s,{itemId:item.id,condition:'repair'},makeId,now).error,'cannot_repair_installed');assert.equal(E.updateCondition(s,{itemId:item.id,condition:'retired'},makeId,now).error,'cannot_retire_installed')});
test('condition changes and movement retain an auditable history',()=>{const s=fixture(),item=E.register(s,{kind:'meshDiaphragm',storageLocation:'Склад'},makeId,now).item;assert.equal(E.updateCondition(s,{itemId:item.id,condition:'needs_repair'},makeId,now).ok,true);assert.equal(E.place(s,{itemId:item.id,location:{type:'hive',hiveId:'h1',sectionId:'S2'}},makeId,now).ok,true);assert.equal(E.place(s,{itemId:item.id,location:{type:'storage',label:'Ремонтная полка'}},makeId,now).ok,true);assert.ok(s.equipmentInventory.items[item.id].events.length>=1);assert.deepEqual(s.equipmentInventory.items[item.id].events.map(x=>x.type),['registered','condition_changed','moved','moved']);assert.deepEqual(E.inspect(s),[])});
test('integrity inspection detects malformed records and missing references',()=>{const s=fixture();s.equipmentInventory.items={bad:{id:'wrong',kind:'unknown',condition:'broken',location:{type:'unknown'}}};assert.ok(E.inspect(s).some(x=>x.code==='invalid_item_identity'));const good={id:'good',kind:'bottom',condition:'good',location:{type:'hive',hiveId:'ghost',sectionId:'S1'}};s.equipmentInventory.items.good=good;assert.ok(E.validateReferences(s).some(x=>x.code==='item_hive_reference_missing'))});

test('accessory integrity participates in live apiary and backup validation',()=>{
 assert.match(html,/PasekaEquipmentItems\.inspect\(S\)/);
 assert.match(html,/PasekaEquipmentItems\.validateReferences\(S\)/);
 assert.match(html,/PasekaEquipmentItems\.inspect\(state\)/);
 assert.match(html,/PasekaEquipmentItems\.validateReferences\(state\)/);
 assert.match(html,/if\(state\.equipmentInventory\?\.items!=null\|\|state\.equipmentInventory\?\.itemEvents!=null\)/);
});

test('import integrity rejects plugs without opening IDs and duplicate occupancy',()=>{
 const s=fixture();
 s.equipmentInventory.items={
  plugA:{id:'plugA',kind:'metalMeshPlug',condition:'good',location:{type:'hive',hiveId:'h1'}},
  plugB:{id:'plugB',kind:'metalMeshPlug',condition:'good',location:{type:'hive',hiveId:'h1',bodyId:'body-1',openingId:'body-1:left'}},
  plugC:{id:'plugC',kind:'metalMeshPlug',condition:'good',location:{type:'hive',hiveId:'h1',bodyId:'body-1',openingId:'body-1:left'}}
 };
 const errors=E.inspect(s);
 assert.ok(errors.some(x=>x.code==='item_body_reference_required'&&x.details.itemId==='plugA'));
 assert.ok(errors.some(x=>x.code==='item_opening_reference_required'&&x.details.itemId==='plugA'));
 assert.ok(errors.some(x=>x.code==='item_opening_occupied'));
});
test('import integrity rejects permanent technical excluders without a connection ID',()=>{
 const s=fixture();
 s.equipmentInventory.items={grid:{id:'grid',kind:'technicalQueenExcluder',condition:'good',location:{type:'hive',hiveId:'h1',sectionId:'S1'}}};
 assert.ok(E.inspect(s).some(x=>x.code==='item_connection_reference_required'));
});

test('plastic and metal plugs cannot occupy the same physical opening',()=>{
 const s=fixture(),metal=E.register(s,{kind:'metalMeshPlug',storageLocation:'Склад'},makeId,now).item,plastic=E.register(s,{kind:'plasticPlug',storageLocation:'Склад'},makeId,now).item;
 const location={type:'hive',hiveId:'h1',bodyId:'body-1',openingId:'body-1:left'};
 assert.equal(E.place(s,{itemId:metal.id,location},makeId,now).ok,true);
 assert.equal(E.place(s,{itemId:plastic.id,location},makeId,now).error,'opening_occupied');
});

test('accessory IDs cannot collide with an existing physical corpus ID',()=>{
 const s=fixture(),result=E.register(s,{kind:'bottom',storageLocation:'Склад'},()=> 'body-1',now);
 assert.equal(result.ok,false);assert.equal(result.error,'duplicate_item_id');
 assert.equal(s.equipmentInventory,undefined);
});
test('JSON backup round-trip preserves accessory identity, location and history',()=>{
 const s=fixture(),item=E.register(s,{kind:'metalMeshPlug',storageLocation:'Склад'},makeId,now).item;
 assert.equal(E.place(s,{itemId:item.id,location:{type:'hive',hiveId:'h1',bodyId:'body-1',openingId:'body-1:left'}},makeId,now).ok,true);
 const restored=JSON.parse(JSON.stringify({app:'Paseka',state:s})).state;
 assert.deepEqual(restored.equipmentInventory.items[item.id],s.equipmentInventory.items[item.id]);
 assert.deepEqual(E.inspect(restored),[]);assert.deepEqual(E.validateReferences(restored),[]);
});
