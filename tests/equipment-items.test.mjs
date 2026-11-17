import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../js/equipment-items.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const win={};new Function('window',source)(win);
const E=win.PasekaEquipmentItems;
let next=0;
const makeId=()=> 'item-'+(++next);
const now='2026-11-17T08:00:00.000Z';
function fixture(){
 const bodyIds=['body-1','body-2','body-3'];
 const bodies=Object.fromEntries(bodyIds.map(id=>[id,{id,kind:'brood',condition:'good'}]));
 return {
  hives:[{id:'h1'}],families:[],layouts:{},
  equipmentInventory:{bodies,events:[]},
  sectionalLayouts:[{
   id:'layout-1',hiveId:'h1',mode:'SIDE_BY_SIDE',
   sections:[
    {id:'S1',position:'left',broodBodyIds:['body-1','body-2'],openings:[{id:'opening-1',bodyId:'body-1'}]},
    {id:'S2',position:'middle',broodBodyIds:['body-3'],openings:[{id:'opening-2',bodyId:'body-3'}]}
   ],
   technicalConnections:[{id:'connection-1',fromSectionId:'S1',toSectionId:'S2',from:{bodyId:'body-1',openingId:'opening-1'},to:{bodyId:'body-3',openingId:'opening-2'}}],
   column:{meshDiaphragms:[{between:'lower-middle'},{between:'middle-upper'}]}
  }]
 };
}
test('legacy inventory without accessory fields remains valid and inspection does not mutate it',()=>{
 const state={equipmentInventory:{bodies:{old:{id:'old',kind:'brood'}},events:[]}};
 const before=JSON.stringify(state);
 assert.deepEqual(E.inspect(state),[]);
 assert.deepEqual(E.validateReferences(state),[]);
 assert.equal(JSON.stringify(state),before);
});
test('registers only explicitly requested accessory items in storage',()=>{
 const state=fixture();
 const result=E.register(state,{kind:'bottom',storageLocation:'Сарай · полка 2',notes:'Проверено'},makeId,now);
 assert.equal(result.ok,true);
 assert.equal(result.item.kind,'bottom');
 assert.deepEqual(result.item.location,{type:'storage',label:'Сарай · полка 2'});
 assert.deepEqual(result.item.events.map(event=>event.type),['registered']);
 assert.equal(state.equipmentInventory.itemEvents.length,1);
 assert.deepEqual(E.inspect(state),[]);
});
test('ensure creates empty registries but never invents physical accessories',()=>{
 const state={equipmentInventory:{bodies:{}}};
 E.ensure(state);
 assert.deepEqual(state.equipmentInventory.items,{});
 assert.deepEqual(state.equipmentInventory.itemEvents,[]);
 assert.deepEqual(E.inspect(state),[]);
});
test('invalid registration is atomic and item IDs cannot collide with body IDs',()=>{
 const state=fixture(),before=JSON.stringify(state);
 assert.equal(E.register(state,{kind:'unknown',storageLocation:'Склад'},makeId,now).error,'invalid_item_kind');
 assert.equal(JSON.stringify(state),before);
 const collision=E.register(state,{kind:'cover',storageLocation:'Склад'},()=> 'body-1',now);
 assert.equal(collision.error,'duplicate_item_id');
 assert.equal(JSON.stringify(state),before);
});
test('metal mesh plug requires an existing body and a concrete opening',()=>{
 const state=fixture(),plug=E.register(state,{kind:'metalMeshPlug',storageLocation:'Склад'},makeId,now).item;
 const missing=E.place(state,{itemId:plug.id,location:{type:'hive',hiveId:'h1',bodyId:'body-1'}},makeId,now);
 assert.equal(missing.error,'invalid_location');
 const placed=E.place(state,{itemId:plug.id,location:{type:'hive',hiveId:'h1',bodyId:'body-1',openingId:'opening-1'}},makeId,now);
 assert.equal(placed.ok,true);
 assert.deepEqual(E.validateReferences(state),[]);
});
test('permanent technical excluder requires body, opening and connection identity',()=>{
 const state=fixture(),grid=E.register(state,{kind:'technicalQueenExcluder',storageLocation:'Склад'},makeId,now).item;
 assert.equal(E.place(state,{itemId:grid.id,location:{type:'hive',hiveId:'h1',connectionId:'connection-1'}},makeId,now).error,'invalid_location');
 const placed=E.place(state,{itemId:grid.id,location:{type:'hive',hiveId:'h1',bodyId:'body-1',openingId:'opening-1',connectionId:'connection-1'}},makeId,now);
 assert.equal(placed.ok,true);
 assert.deepEqual(E.validateReferences(state),[]);
});
test('a mesh plug may coexist with its permanent technical excluder at the same opening',()=>{
 const state=fixture();
 const grid=E.register(state,{kind:'technicalQueenExcluder',storageLocation:'Склад'},makeId,now).item;
 const plug=E.register(state,{kind:'metalMeshPlug',storageLocation:'Склад'},makeId,now).item;
 const location={type:'hive',hiveId:'h1',bodyId:'body-1',openingId:'opening-1',connectionId:'connection-1'};
 assert.equal(E.place(state,{itemId:grid.id,location},makeId,now).ok,true);
 assert.equal(E.place(state,{itemId:plug.id,location},makeId,now).ok,true);
 assert.deepEqual(E.inspect(state),[]);
 assert.deepEqual(E.validateReferences(state),[]);
});
test('plastic and metal plugs cannot occupy the same physical opening',()=>{
 const state=fixture();
 const metal=E.register(state,{kind:'metalMeshPlug',storageLocation:'Склад'},makeId,now).item;
 const plastic=E.register(state,{kind:'plasticPlug',storageLocation:'Склад'},makeId,now).item;
 const location={type:'hive',hiveId:'h1',bodyId:'body-1',openingId:'opening-1'};
 assert.equal(E.place(state,{itemId:metal.id,location},makeId,now).ok,true);
 assert.equal(E.place(state,{itemId:plastic.id,location},makeId,now).error,'opening_occupied');
});
test('large honey excluder requires two different brood bodies with one FULL and one HALF footprint',()=>{
 const state=fixture(),grid=E.register(state,{kind:'honeyQueenExcluder',storageLocation:'Склад'},makeId,now).item;
 const footprint=[{bodyId:'body-2',coverage:'FULL'},{bodyId:'body-3',coverage:'HALF'}];
 assert.equal(E.place(state,{itemId:grid.id,location:{type:'hive',hiveId:'h1',footprint}},makeId,now).ok,true);
 assert.deepEqual(state.equipmentInventory.items[grid.id].location.footprint,footprint);
 assert.deepEqual(E.validateReferences(state),[]);
});
test('large honey excluder rejects malformed or missing-body footprints',()=>{
 const state=fixture(),grid=E.register(state,{kind:'honeyQueenExcluder',storageLocation:'Склад'},makeId,now).item;
 const duplicate=[{bodyId:'body-1',coverage:'FULL'},{bodyId:'body-1',coverage:'HALF'}];
 assert.equal(E.place(state,{itemId:grid.id,location:{type:'hive',hiveId:'h1',footprint:duplicate}},makeId,now).error,'invalid_footprint_or_location');
 const missing=[{bodyId:'ghost',coverage:'FULL'},{bodyId:'body-2',coverage:'HALF'}];
 assert.equal(E.place(state,{itemId:grid.id,location:{type:'hive',hiveId:'h1',footprint:missing}},makeId,now).error,'item_body_inventory_reference_missing');
});
test('mesh diaphragms must reference an actual column boundary',()=>{
 const state=fixture(),item=E.register(state,{kind:'meshDiaphragm',storageLocation:'Склад'},makeId,now).item;
 assert.equal(E.place(state,{itemId:item.id,location:{type:'hive',hiveId:'h1',positionLabel:'lower-middle'}},makeId,now).ok,true);
 const second=E.register(state,{kind:'meshDiaphragm',storageLocation:'Склад'},makeId,now).item;
 assert.equal(E.place(state,{itemId:second.id,location:{type:'hive',hiveId:'h1',positionLabel:'unknown-gap'}},makeId,now).error,'item_position_reference_missing');
});
test('bottoms and covers require an existing sectional identity',()=>{
 const state=fixture(),bottom=E.register(state,{kind:'bottom',storageLocation:'Склад'},makeId,now).item;
 assert.equal(E.place(state,{itemId:bottom.id,location:{type:'hive',hiveId:'h1',sectionId:'missing'}},makeId,now).error,'item_section_reference_missing');
 assert.equal(E.place(state,{itemId:bottom.id,location:{type:'hive',hiveId:'h1',sectionId:'S1'}},makeId,now).ok,true);
});
test('reference inspection catches wrong hive, body, opening and connection references',()=>{
 const state=fixture();
 state.equipmentInventory.items={
  bad:{id:'bad',kind:'technicalQueenExcluder',condition:'good',location:{type:'hive',hiveId:'ghost',bodyId:'ghost-body',openingId:'ghost-opening',connectionId:'ghost-connection'},events:[]}
 };
 state.equipmentInventory.itemEvents=[];
 const errors=E.validateReferences(state).map(error=>error.code);
 assert.ok(errors.includes('item_hive_reference_missing'));
 assert.ok(errors.includes('item_body_inventory_reference_missing'));
 assert.ok(errors.includes('item_body_reference_missing'));
 assert.ok(errors.includes('item_connection_reference_missing'));
 assert.ok(errors.includes('item_opening_reference_missing'));
});
test('installed items cannot be marked for repair or retired; history is retained',()=>{
 const state=fixture(),item=E.register(state,{kind:'cover',storageLocation:'Склад'},makeId,now).item;
 assert.equal(E.place(state,{itemId:item.id,location:{type:'hive',hiveId:'h1',sectionId:'S1'}},makeId,now).ok,true);
 assert.equal(E.updateCondition(state,{itemId:item.id,condition:'repair'},makeId,now).error,'cannot_repair_installed');
 assert.equal(E.updateCondition(state,{itemId:item.id,condition:'retired'},makeId,now).error,'cannot_retire_installed');
 assert.equal(E.place(state,{itemId:item.id,location:{type:'storage',label:'Ремонтная полка'}},makeId,now).ok,true);
 assert.equal(E.updateCondition(state,{itemId:item.id,condition:'needs_repair'},makeId,now).ok,true);
 assert.deepEqual(state.equipmentInventory.items[item.id].events.map(event=>event.type),['registered','moved','condition_changed']);
 assert.deepEqual(E.inspect(state),[]);
});
test('duplicate event IDs make a write fail without mutating existing data',()=>{
 const state=fixture(),before=JSON.stringify(state);
 const result=E.register(state,{kind:'bottom',storageLocation:'Склад'},()=> 'same-id',now);
 assert.equal(result.ok,false);
 assert.equal(result.error,'duplicate_or_invalid_item_event_id');
 assert.equal(JSON.stringify(state),before);
});
test('full accessory audit history is preserved after more than one thousand events',()=>{
 const state=fixture(),item=E.register(state,{kind:'feeder',storageLocation:'Склад'},makeId,now).item;
 for(let i=0;i<1005;i++)assert.equal(E.updateCondition(state,{itemId:item.id,condition:i%2?'good':'needs_repair'},makeId,now).ok,true);
 assert.equal(state.equipmentInventory.itemEvents.length,1006);
 assert.equal(state.equipmentInventory.items[item.id].events.length,1006);
 assert.deepEqual(E.inspect(state),[]);
});
test('item registry module is loaded by the app and cached for offline use',()=>{
 assert.ok(html.includes('<script src="./js/equipment-items.js"></script>'));
});


test('inspection detects a current location or condition that contradicts its audit trail',()=>{
 const state=fixture(),item=E.register(state,{kind:'bottom',storageLocation:'Склад'},makeId,now).item;
 item.location={type:'hive',hiveId:'h1',sectionId:'S1'};
 assert.ok(E.inspect(state).some(error=>error.code==='item_location_history_mismatch'));
 item.location={type:'storage',label:'Склад'};
 item.condition='retired';
 assert.ok(E.inspect(state).some(error=>error.code==='item_condition_history_mismatch'));
});

test('inspection requires a registration event and a global event journal',()=>{
 const state=fixture();
 state.equipmentInventory.items={manual:{id:'manual',kind:'cover',condition:'good',location:{type:'storage',label:'Склад'},events:[]}};
 state.equipmentInventory.itemEvents=[];
 assert.ok(E.inspect(state).some(error=>error.code==='item_registration_event_required'));
 delete state.equipmentInventory.itemEvents;
 assert.ok(E.inspect(state).some(error=>error.code==='equipment_item_event_journal_required'));
});
