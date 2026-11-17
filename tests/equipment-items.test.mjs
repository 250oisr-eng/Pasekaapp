import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../js/equipment-items.js',import.meta.url),'utf8');
const win={};new Function('window',source)(win);
const E=win.PasekaEquipmentItems;
let sequence=0;
const makeId=()=> 'item-test-'+(++sequence);
const now='2026-11-17T10:00:00.000Z';

function fixture(mode='SIDE_BY_SIDE'){
 const bodies={};
 for(let i=1;i<=6;i++)bodies['b'+i]={id:'b'+i,kind:'brood',condition:'good',spec:{framesPerBox:6,profileId:'sectional-multiqueen-v1'}};
 bodies.hb1={id:'hb1',kind:'honey',condition:'good',spec:{framesPerBox:10,profileId:'sectional-multiqueen-v1'}};
 bodies.hb2={id:'hb2',kind:'honey',condition:'good',spec:{framesPerBox:10,profileId:'sectional-multiqueen-v1'}};
 const sections=mode==='ALTERNATIVE_WINTERING_COLUMN'?[
  {id:'lower',position:'lower',familyId:'f1',broodBodyIds:['b1','b2'],upperBroodBodyId:'b2',openings:[{id:'o1',bodyId:'b2',diameterMm:50}]},
  {id:'middle',position:'middle',familyId:'f2',broodBodyIds:['b3'],upperBroodBodyId:'b3',openings:[{id:'o2',bodyId:'b3',diameterMm:50},{id:'o3',bodyId:'b3',diameterMm:50}]},
  {id:'upper',position:'upper',familyId:'f3',broodBodyIds:['b4'],upperBroodBodyId:'b4',openings:[{id:'o4',bodyId:'b4',diameterMm:50}]}
 ]:[
  {id:'left',position:'left',familyId:'f1',broodBodyIds:['b1','b2'],upperBroodBodyId:'b2',openings:[{id:'o1',bodyId:'b2',diameterMm:50}]},
  {id:'middle',position:'middle',familyId:'f2',broodBodyIds:['b3','b4'],upperBroodBodyId:'b4',openings:[{id:'o2',bodyId:'b4',diameterMm:50},{id:'o3',bodyId:'b3',diameterMm:50}]},
  {id:'right',position:'right',familyId:'f3',broodBodyIds:['b5','b6'],upperBroodBodyId:'b6',openings:[{id:'o4',bodyId:'b6',diameterMm:50}]}
 ];
 const stacks=mode==='ALTERNATIVE_WINTERING_COLUMN'?
  [{id:'stack-column',sectionIds:['lower','middle','upper'],boundaries:['lower-middle','middle-upper']}]:
  [{id:'stack-left',sectionIds:['left'],boundaries:[]},{id:'stack-middle',sectionIds:['middle'],boundaries:[]},{id:'stack-right',sectionIds:['right'],boundaries:[]}];
 return {
  hives:[{id:'h1'}],
  families:[],queens:[],
  equipmentInventory:{bodies,items:{},itemEvents:[]},
  sectionalLayouts:[{id:'layout-1',hiveId:'h1',profileId:'sectional-multiqueen-v1',mode,sections,stacks,honeyStack:{bodyIds:['hb1','hb2']}}],
 };
}
function register(state,kind,label='Предмет'){return E.register(state,{kind,label,storageLocation:'Склад · полка 1',notes:''},makeId,now)}
function place(state,itemId,location){return E.place(state,{itemId,location},makeId,now)}

test('legacy state without accessory registry remains valid and is not mutated',()=>{
 const state={hives:[],families:[],layouts:{},equipmentInventory:{bodies:{}}},before=JSON.stringify(state);
 assert.deepEqual(E.inspect(state),[]);
 assert.deepEqual(E.validateReferences(state),[]);
 assert.equal(JSON.stringify(state),before);
});

test('registers only explicitly supplied stock items and appends both event journals',()=>{
 const state=fixture(),before=Object.keys(state.equipmentInventory.items);
 const result=register(state,'bottom','Дно 1');
 assert.equal(result.ok,true);
 assert.equal(Object.keys(state.equipmentInventory.items).length,before.length+1);
 assert.equal(result.item.label,'Дно 1');
 assert.deepEqual(result.item.location,{type:'storage',label:'Склад · полка 1'});
 assert.equal(result.item.events.length,1);
 assert.equal(state.equipmentInventory.itemEvents.length,1);
 assert.deepEqual(E.inspect(state),[]);
});

test('rejects unsupported kinds, invalid storage details and duplicate IDs atomically',()=>{
 const state=fixture(),before=JSON.stringify(state);
 assert.equal(E.register(state,{kind:'bufferCorridor',storageLocation:'Склад'},makeId,now).error,'invalid_item_kind');
 assert.equal(JSON.stringify(state),before);
 assert.equal(E.register(state,{kind:'bottom',storageLocation:''},makeId,now).error,'invalid_details');
 assert.equal(JSON.stringify(state),before);
 const collision=()=> 'b1';
 assert.equal(E.register(state,{kind:'bottom',storageLocation:'Склад'},collision,now).error,'duplicate_or_invalid_item_id');
 assert.equal(JSON.stringify(state),before);
});

test('keeps equipment item history append-only beyond 300 events',()=>{
 const state=fixture(),created=register(state,'cover');
 assert.equal(created.ok,true);
 const id=created.item.id;
 for(let i=0;i<305;i++){
  const condition=i%2===0?'needs_repair':'good';
  assert.equal(E.updateCondition(state,{itemId:id,condition},makeId,now).ok,true);
 }
 assert.equal(state.equipmentInventory.items[id].events.length,306);
 assert.equal(state.equipmentInventory.itemEvents.length,306);
 assert.deepEqual(E.inspect(state),[]);
});

test('does not overwrite malformed item journals when an update fails',()=>{
 const state=fixture(),created=register(state,'bottom'),item=state.equipmentInventory.items[created.item.id];
 item.events={corrupt:true};
 const before=JSON.stringify(state);
 const result=E.updateCondition(state,{itemId:item.id,condition:'needs_repair'},makeId,now);
 assert.equal(result.ok,false);
 assert.equal(result.error,'invalid_item_event_journal');
 assert.equal(JSON.stringify(state),before);
});

test('places a technical queen-excluder grid against one real opening without assuming a fixed grid count',()=>{
 const state=fixture(),created=register(state,'technicalQueenExcluder','Решётка Т-1');
 const result=place(state,created.item.id,{type:'hive',hiveId:'h1',bodyId:'b2',openingId:'o1'});
 assert.equal(result.ok,true);
 assert.deepEqual(E.validateReferences(state),[]);
 assert.deepEqual(E.inspect(state),[]);
 assert.equal(result.item.location.openingId,'o1');
});

test('allows a technical grid and one temporary plug in the same opening, but prevents duplicate grids or plugs',()=>{
 const state=fixture();
 const grid=register(state,'technicalQueenExcluder','Техническая решётка');
 const mesh=register(state,'metalMeshPlug','Сетчатая заглушка');
 const plastic=register(state,'plasticPlug','Пластиковая заглушка');
 assert.equal(place(state,grid.item.id,{type:'hive',hiveId:'h1',bodyId:'b2',openingId:'o1'}).ok,true);
 assert.equal(place(state,mesh.item.id,{type:'hive',hiveId:'h1',bodyId:'b2',openingId:'o1'}).ok,true);
 const secondGrid=register(state,'technicalQueenExcluder','Дублирующая решётка');
 assert.equal(place(state,secondGrid.item.id,{type:'hive',hiveId:'h1',bodyId:'b2',openingId:'o1'}).error,'technical_opening_grid_occupied');
 assert.equal(place(state,plastic.item.id,{type:'hive',hiveId:'h1',bodyId:'b2',openingId:'o1'}).error,'technical_opening_plug_occupied');
 assert.deepEqual(E.inspect(state),[]);
});

test('requires a real 50 mm opening and an existing brood body for technical accessories',()=>{
 const state=fixture(),created=register(state,'metalMeshPlug');
 assert.equal(place(state,created.item.id,{type:'hive',hiveId:'h1',bodyId:'missing',openingId:'o1'}).error,'physical_reference_invalid');
 const state2=fixture();state2.sectionalLayouts[0].sections[0].openings[0].diameterMm=45;
 const item=register(state2,'technicalQueenExcluder');
 const result=place(state2,item.item.id,{type:'hive',hiveId:'h1',bodyId:'b2',openingId:'o1'});
 assert.equal(result.error,'physical_reference_invalid');
 assert.ok(result.details.some(error=>error.code==='item_opening_diameter_mismatch'));
});

test('records the two large honey excluders by FULL/HALF footprint without duplicating the shared middle half',()=>{
 const state=fixture();
 const left=register(state,'honeyQueenExcluder','Большая решётка левая');
 const right=register(state,'honeyQueenExcluder','Большая решётка правая');
 assert.equal(place(state,left.item.id,{type:'hive',hiveId:'h1',footprint:[{bodyId:'b2',coverage:'FULL'},{bodyId:'b4',coverage:'HALF'}]}).ok,true);
 assert.equal(place(state,right.item.id,{type:'hive',hiveId:'h1',footprint:[{bodyId:'b4',coverage:'HALF'},{bodyId:'b6',coverage:'FULL'}]}).ok,true);
 assert.deepEqual(E.validateReferences(state),[]);
 assert.deepEqual(E.inspect(state),[]);
});

test('rejects malformed or non-upper-body FULL/HALF footprints',()=>{
 const state=fixture(),item=register(state,'honeyQueenExcluder');
 assert.equal(E.place(state,{itemId:item.item.id,location:{type:'hive',hiveId:'h1',footprint:[{bodyId:'b2',coverage:'FULL'},{bodyId:'b2',coverage:'HALF'}]}},makeId,now).error,'invalid_footprint');
 const result=place(state,item.item.id,{type:'hive',hiveId:'h1',footprint:[{bodyId:'b1',coverage:'FULL'},{bodyId:'b4',coverage:'HALF'}]});
 assert.equal(result.error,'physical_reference_invalid');
 assert.ok(result.details.some(error=>error.code==='item_footprint_upper_body_reference_missing'));
});

test('requires a known sectional layout before an accessory can be placed in a hive',()=>{
 const state=fixture();state.sectionalLayouts=[];
 const item=register(state,'bottom');
 const result=place(state,item.item.id,{type:'hive',hiveId:'h1',stackId:'stack-left'});
 assert.equal(result.error,'physical_reference_invalid');
 assert.ok(result.details.some(error=>error.code==='item_sectional_layout_missing'));
});

test('places the two mesh diaphragms at the two actual boundaries in alternative wintering',()=>{
 const state=fixture('ALTERNATIVE_WINTERING_COLUMN');
 const lower=register(state,'meshDiaphragm','Нижняя диафрагма');
 const upper=register(state,'meshDiaphragm','Верхняя диафрагма');
 assert.equal(place(state,lower.item.id,{type:'hive',hiveId:'h1',stackId:'stack-column',positionLabel:'lower-middle'}).ok,true);
 assert.equal(place(state,upper.item.id,{type:'hive',hiveId:'h1',stackId:'stack-column',positionLabel:'middle-upper'}).ok,true);
 const duplicate=register(state,'meshDiaphragm','Дубликат');
 assert.equal(place(state,duplicate.item.id,{type:'hive',hiveId:'h1',stackId:'stack-column',positionLabel:'middle-upper'}).error,'diaphragm_boundary_occupied');
 assert.deepEqual(E.inspect(state),[]);
});

test('allows one bottom, cover, feeder and top riser per actual stack',()=>{
 const state=fixture();
 for(const kind of ['bottom','cover','feeder','topRiser']){
  const item=register(state,kind);
  assert.equal(place(state,item.item.id,{type:'hive',hiveId:'h1',stackId:'stack-left'}).ok,true,kind);
 }
 const duplicate=register(state,'bottom');
 assert.equal(place(state,duplicate.item.id,{type:'hive',hiveId:'h1',stackId:'stack-left'}).error,'stack_accessory_occupied');
 assert.deepEqual(E.inspect(state),[]);
});

test('does not install equipment that needs repair and does not retire installed equipment',()=>{
 const state=fixture(),item=register(state,'bottom');
 assert.equal(E.updateCondition(state,{itemId:item.item.id,condition:'needs_repair'},makeId,now).ok,true);
 assert.equal(place(state,item.item.id,{type:'hive',hiveId:'h1',stackId:'stack-left'}).error,'item_not_installable');
 assert.equal(E.updateCondition(state,{itemId:item.item.id,condition:'good'},makeId,now).ok,true);
 assert.equal(place(state,item.item.id,{type:'hive',hiveId:'h1',stackId:'stack-left'}).ok,true);
 const before=JSON.stringify(state);
 assert.equal(E.updateCondition(state,{itemId:item.item.id,condition:'retired'},makeId,now).error,'cannot_retire_installed');
 assert.equal(JSON.stringify(state),before);
});

test('moves an installed item back to storage with a permanent history event',()=>{
 const state=fixture(),item=register(state,'bottom');
 assert.equal(place(state,item.item.id,{type:'hive',hiveId:'h1',stackId:'stack-left'}).ok,true);
 const result=place(state,item.item.id,{type:'storage',label:'Склад · стеллаж 2'});
 assert.equal(result.ok,true);
 assert.equal(result.item.location.type,'storage');
 assert.equal(result.item.location.label,'Склад · стеллаж 2');
 assert.equal(result.item.events.at(-1).type,'moved_to_storage');
 assert.deepEqual(E.inspect(state),[]);
});

test('round-trips item IDs, footprints and event history through JSON backup',()=>{
 const state=fixture(),item=register(state,'honeyQueenExcluder','Решётка R4-1');
 assert.equal(place(state,item.item.id,{type:'hive',hiveId:'h1',footprint:[{bodyId:'b2',coverage:'FULL'},{bodyId:'b4',coverage:'HALF'}]}).ok,true);
 const restored=JSON.parse(JSON.stringify(state));
 assert.deepEqual(E.inspect(restored),[]);
 assert.deepEqual(E.validateReferences(restored),[]);
 assert.equal(restored.equipmentInventory.items[item.item.id].events.length,2);
});

test('rejects duplicate and orphaned global item events',()=>{
 const state=fixture(),item=register(state,'cover');
 state.equipmentInventory.itemEvents.push({...state.equipmentInventory.itemEvents[0]});
 assert.ok(E.inspect(state).some(error=>error.code==='duplicate_equipment_item_event_id'));
 const state2=fixture(),item2=register(state2,'cover');
 state2.equipmentInventory.itemEvents[0].itemId='missing';
 assert.ok(E.inspect(state2).some(error=>error.code==='invalid_equipment_item_event'));
});

test('technical grid references an opening directly and rejects a guessed connection-layer count',()=>{
 assert.equal(E.normalizeLocation({type:'hive',hiveId:'h1',connectionId:'left-middle'},'technicalQueenExcluder'),null);
 assert.deepEqual(E.normalizeLocation({type:'hive',hiveId:'h1',bodyId:'b2',openingId:'o1'},'technicalQueenExcluder'),{type:'hive',hiveId:'h1',bodyId:'b2',openingId:'o1'});
});

test('requires a global event journal whenever accessory items exist',()=>{
 const state=fixture(),item=register(state,'cover');
 delete state.equipmentInventory.itemEvents;
 assert.ok(E.inspect(state).some(error=>error.code==='equipment_item_global_journal_missing'));
});

test('malformed honey footprint is reported without throwing during inspection',()=>{
 const state=fixture(),item=register(state,'honeyQueenExcluder');
 state.equipmentInventory.items[item.item.id].location={type:'hive',hiveId:'h1',footprint:[null,{bodyId:'b4',coverage:'HALF'}]};
 assert.ok(E.inspect(state).some(error=>error.code==='invalid_item_location'));
 assert.ok(E.validateReferences(state).some(error=>error.code==='item_footprint_part_invalid'));
});

test('rejects accessory references to a body with the wrong profile or frame capacity',()=>{
 const state=fixture();state.equipmentInventory.bodies.b2.spec.profileId='farrar-6x6-v1';
 const item=register(state,'technicalQueenExcluder');
 const result=place(state,item.item.id,{type:'hive',hiveId:'h1',bodyId:'b2',openingId:'o1'});
 assert.equal(result.error,'physical_reference_invalid');
 assert.ok(result.details.some(error=>error.code==='item_body_profile_mismatch'));
 const state2=fixture();state2.equipmentInventory.bodies.b2.spec.framesPerBox=10;
 const item2=register(state2,'technicalQueenExcluder');
 const result2=place(state2,item2.item.id,{type:'hive',hiveId:'h1',bodyId:'b2',openingId:'o1'});
 assert.ok(result2.details.some(error=>error.code==='item_body_frame_capacity_mismatch'));
});
