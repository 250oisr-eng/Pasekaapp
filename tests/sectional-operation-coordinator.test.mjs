import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appWindow={};
for(const path of [
 '../js/equipment-labels.js',
 '../js/equipment-inventory.js',
 '../js/equipment-items.js',
 '../js/sectional-physical-layout.js',
 '../js/family-lineage.js',
 '../js/sectional-operation-coordinator.js'
]){
 const source=await readFile(new URL(path,import.meta.url),'utf8');
 new Function('window',source)(appWindow);
}
const Labels=appWindow.PasekaLabels;
const Inventory=appWindow.PasekaInventory;
const Items=appWindow.PasekaEquipmentItems;
const Layout=appWindow.PasekaSectionalPhysicalLayout;
const Lineage=appWindow.PasekaFamilyLineage;
const Coordinator=appWindow.PasekaSectionalOperationCoordinator;
const PROFILE='sectional-multiqueen-v1';
const NOW='2026-11-17T10:00:00.000Z';
const codes=['ААА','ААБ','ААГ','ААД','ААЕ','ААЖ'];

function item(id,kind,location){
 return {id,kind,label:id,condition:'good',location,notes:'',registeredAt:NOW,updatedAt:NOW,events:[]};
}
function body(id,index,storageLocation=''){
 return {id,kind:'brood',condition:'good',spec:{profileId:PROFILE,framesPerBox:6},...(storageLocation?{storageLocation}:{}),labelCode:codes[index]};
}
function makeFixture(){
 const bodies=Object.fromEntries(['b1','b2','b3','b4','b5','b6'].map((id,index)=>[id,body(id,index,index>=3?'Склад':'' )]));
 const items={
  bottom1:item('bottom1','bottom',{type:'hive',hiveId:'h1',stackId:'combined'}),
  p1:item('p1','plasticPlug',{type:'hive',hiveId:'h1',bodyId:'b2',openingId:'o2'}),
  p2:item('p2','plasticPlug',{type:'hive',hiveId:'h1',bodyId:'b2',openingId:'o3'}),
  p3:item('p3','plasticPlug',{type:'hive',hiveId:'h1',bodyId:'b3',openingId:'o4'}),
  p4:item('p4','plasticPlug',{type:'hive',hiveId:'h1',bodyId:'b1',openingId:'o1'}),
  bottom2:item('bottom2','bottom',{type:'storage',label:'Склад'}),
  bottom3:item('bottom3','bottom',{type:'storage',label:'Склад'}),
  cover1:item('cover1','cover',{type:'storage',label:'Склад'}),
  cover2:item('cover2','cover',{type:'storage',label:'Склад'}),
  cover3:item('cover3','cover',{type:'storage',label:'Склад'}),
  riser1:item('riser1','topRiser',{type:'storage',label:'Склад'}),
  riser2:item('riser2','topRiser',{type:'storage',label:'Склад'}),
  riser3:item('riser3','topRiser',{type:'storage',label:'Склад'}),
  grid1:item('grid1','technicalQueenExcluder',{type:'storage',label:'Склад'}),
  grid2:item('grid2','technicalQueenExcluder',{type:'storage',label:'Склад'}),
  grid3:item('grid3','technicalQueenExcluder',{type:'storage',label:'Склад'}),
  grid4:item('grid4','technicalQueenExcluder',{type:'storage',label:'Склад'}),
  grid5:item('grid5','technicalQueenExcluder',{type:'storage',label:'Склад'}),
  grid6:item('grid6','technicalQueenExcluder',{type:'storage',label:'Склад'}),
  grid7:item('grid7','technicalQueenExcluder',{type:'storage',label:'Склад'}),
  grid8:item('grid8','technicalQueenExcluder',{type:'storage',label:'Склад'}),
  mesh1:item('mesh1','metalMeshPlug',{type:'storage',label:'Склад'}),
  mesh2:item('mesh2','metalMeshPlug',{type:'storage',label:'Склад'}),
  mesh3:item('mesh3','metalMeshPlug',{type:'storage',label:'Склад'}),
  mesh4:item('mesh4','metalMeshPlug',{type:'storage',label:'Склад'}),
  mesh5:item('mesh5','metalMeshPlug',{type:'storage',label:'Склад'}),
  mesh6:item('mesh6','metalMeshPlug',{type:'storage',label:'Склад'}),
  mesh7:item('mesh7','metalMeshPlug',{type:'storage',label:'Склад'}),
  mesh8:item('mesh8','metalMeshPlug',{type:'storage',label:'Склад'})
 };
 const sourceLayout={
  schemaVersion:1,id:'layout-h1',hiveId:'h1',profileId:PROFILE,mode:Layout.MODES.SINGLE_FAMILY,purpose:'primary_wintering',closuresConfirmed:true,
  sections:[{id:'s-combined',position:'combined',familyId:'f0',broodBodyIds:['b1','b2','b3'],upperBroodBodyId:'b3',openings:[
   {id:'o1',bodyId:'b1',diameterMm:50},{id:'o2',bodyId:'b2',diameterMm:50},{id:'o3',bodyId:'b2',diameterMm:50},{id:'o4',bodyId:'b3',diameterMm:50}
  ]}],
  stacks:[{id:'combined',position:'combined',sectionIds:['s-combined'],bottomItemId:'bottom1'}],
  technicalConnections:[],meshDiaphragms:[],temporaryQueenIsolation:[],
  closedOpenings:[{itemId:'p4',bodyId:'b1',openingId:'o1'},{itemId:'p1',bodyId:'b2',openingId:'o2'},{itemId:'p2',bodyId:'b2',openingId:'o3'},{itemId:'p3',bodyId:'b3',openingId:'o4'}]
 };
 const state={
  meta:{schemaVersion:15},hives:[{id:'h1',profileId:PROFILE}],
  families:[{id:'f0',hive:'h1',recordStatus:'active',colonyGroupId:'g1',queenIdentityStatus:'identified',currentQueenId:'q0'}],
  queens:[{id:'q0',familyId:'f0',status:'current'}],queenEvents:[],familyEvents:[],
  sectionalTechProcesses:[],sectionalLayouts:[sourceLayout],layouts:{},auditLog:[],
  equipmentLabels:{bodies:Object.fromEntries(['b1','b2','b3','b4','b5','b6'].map((id,index)=>[id,codes[index]]))},
  equipmentInventory:{bodies,items,events:[],itemEvents:[]}
 };
 const layout={
  schemaVersion:1,id:'layout-h1',hiveId:'h1',profileId:PROFILE,mode:Layout.MODES.SIDE_BY_SIDE,broodRows:2,
  sections:[
   {id:'s-left',position:'left',familyId:'f1',broodBodyIds:['b1','b2'],upperBroodBodyId:'b2',openings:[{id:'o1',bodyId:'b1',diameterMm:50},{id:'o5',bodyId:'b2',diameterMm:50}]},
   {id:'s-middle',position:'middle',familyId:'f2',broodBodyIds:['b3','b4'],upperBroodBodyId:'b4',openings:[{id:'o2',bodyId:'b3',diameterMm:50},{id:'o3',bodyId:'b3',diameterMm:50},{id:'o6',bodyId:'b4',diameterMm:50},{id:'o7',bodyId:'b4',diameterMm:50}]},
   {id:'s-right',position:'right',familyId:'f3',broodBodyIds:['b5','b6'],upperBroodBodyId:'b6',openings:[{id:'o4',bodyId:'b5',diameterMm:50},{id:'o8',bodyId:'b6',diameterMm:50}]}
  ],
  stacks:[
   {id:'sl',position:'left',sectionIds:['s-left'],bottomItemId:'bottom1',coverItemId:'cover1',topRiserItemId:'riser1'},
   {id:'sm',position:'middle',sectionIds:['s-middle'],bottomItemId:'bottom2',coverItemId:'cover2',topRiserItemId:'riser2'},
   {id:'sr',position:'right',sectionIds:['s-right'],bottomItemId:'bottom3',coverItemId:'cover3',topRiserItemId:'riser3'}
  ],
  technicalConnections:[
   {id:'c-lm',fromSectionId:'s-left',toSectionId:'s-middle',bufferCorridorPresent:true,openings:[
    {sectionId:'s-left',bodyId:'b1',openingId:'o1',itemId:'grid1'},
    {sectionId:'s-middle',bodyId:'b3',openingId:'o2',itemId:'grid2'},
    {sectionId:'s-left',bodyId:'b2',openingId:'o5',itemId:'grid5'},
    {sectionId:'s-middle',bodyId:'b4',openingId:'o6',itemId:'grid6'}
   ]},
   {id:'c-mr',fromSectionId:'s-middle',toSectionId:'s-right',bufferCorridorPresent:true,openings:[
    {sectionId:'s-middle',bodyId:'b3',openingId:'o3',itemId:'grid3'},
    {sectionId:'s-right',bodyId:'b5',openingId:'o4',itemId:'grid4'},
    {sectionId:'s-middle',bodyId:'b4',openingId:'o7',itemId:'grid7'},
    {sectionId:'s-right',bodyId:'b6',openingId:'o8',itemId:'grid8'}
   ]}
  ],
  meshDiaphragms:[],temporaryQueenIsolation:[],closedOpenings:[]
 };
 const itemMoves=[
  ['bottom1',{type:'hive',hiveId:'h1',stackId:'sl'}],
  ['bottom2',{type:'hive',hiveId:'h1',stackId:'sm'}],
  ['bottom3',{type:'hive',hiveId:'h1',stackId:'sr'}],
  ['cover1',{type:'hive',hiveId:'h1',stackId:'sl'}],
  ['cover2',{type:'hive',hiveId:'h1',stackId:'sm'}],
  ['cover3',{type:'hive',hiveId:'h1',stackId:'sr'}],
  ['riser1',{type:'hive',hiveId:'h1',stackId:'sl'}],
  ['riser2',{type:'hive',hiveId:'h1',stackId:'sm'}],
  ['riser3',{type:'hive',hiveId:'h1',stackId:'sr'}],
  ['grid1',{type:'hive',hiveId:'h1',bodyId:'b1',openingId:'o1'}],
  ['grid2',{type:'hive',hiveId:'h1',bodyId:'b3',openingId:'o2'}],
  ['grid3',{type:'hive',hiveId:'h1',bodyId:'b3',openingId:'o3'}],
  ['grid4',{type:'hive',hiveId:'h1',bodyId:'b5',openingId:'o4'}],
  ['grid5',{type:'hive',hiveId:'h1',bodyId:'b2',openingId:'o5'}],
  ['grid6',{type:'hive',hiveId:'h1',bodyId:'b4',openingId:'o6'}],
  ['grid7',{type:'hive',hiveId:'h1',bodyId:'b4',openingId:'o7'}],
  ['grid8',{type:'hive',hiveId:'h1',bodyId:'b6',openingId:'o8'}],
  ['p1',{type:'storage',label:'Склад'}],
  ['p2',{type:'storage',label:'Склад'}],
  ['p3',{type:'storage',label:'Склад'}],
  ['p4',{type:'storage',label:'Склад'}]
 ].map(([itemId,location])=>({itemId,location}));
 return {state,layout,itemMoves};
}
function dependencies(overrides={}){
 let sequence=0;
 return {
  PasekaLabels:Labels,PasekaInventory:Inventory,PasekaEquipmentItems:Items,
  PasekaSectionalPhysicalLayout:Layout,PasekaFamilyLineage:Lineage,
  makeId:()=> 'evt-'+(++sequence),
  ...overrides
 };
}
function firstRowFixture(){
 const fixture=makeFixture();
 fixture.layout.broodRows=1;
 const bodiesByPosition={left:'b1',middle:'b3',right:'b5'};
 const openingsByPosition={
  left:[{id:'o1',bodyId:'b1',diameterMm:50}],
  middle:[{id:'o2',bodyId:'b3',diameterMm:50},{id:'o3',bodyId:'b3',diameterMm:50}],
  right:[{id:'o4',bodyId:'b5',diameterMm:50}]
 };
 for(const section of fixture.layout.sections){
  section.broodBodyIds=[bodiesByPosition[section.position]];
  section.upperBroodBodyId=bodiesByPosition[section.position];
  section.openings=openingsByPosition[section.position];
 }
 const bodyByOpening={o1:'b1',o2:'b3',o3:'b3',o4:'b5'};
 for(const connection of fixture.layout.technicalConnections)connection.openings=connection.openings.filter(opening=>Object.hasOwn(bodyByOpening,opening.openingId));
 for(const connection of fixture.layout.technicalConnections)for(const opening of connection.openings){
  opening.bodyId=bodyByOpening[opening.openingId];
 }
 fixture.itemMoves=fixture.itemMoves.filter(move=>!['grid5','grid6','grid7','grid8'].includes(move.itemId)).map(move=>{
  const bodyId=bodyByOpening[move.location?.openingId];
  return bodyId?{...move,location:{...move.location,bodyId}}:move;
 });
 return fixture;
}
function request(fixture){
 return {
  userConfirmed:true,hiveId:'h1',sourceFamilyId:'f0',techProcessId:'tp-h1',occurredAt:NOW,
  resultFamilies:[{id:'f1',hive:'h1',name:'Левая секция'},{id:'f2',hive:'h1',name:'Средняя секция'},{id:'f3',hive:'h1',name:'Правая секция'}],
  layout:fixture.layout,itemMoves:fixture.itemMoves,bodyStorageMoves:[]
 };
}
function prepareOP05Fixture(){
 const fixture=makeFixture(),deps=dependencies();
 const started=Coordinator.completeOP04(fixture.state,request(fixture),deps);
 if(!started.ok)throw new Error('OP-04 fixture setup failed: '+JSON.stringify(started));
 const layout=structuredClone(fixture.state.sectionalLayouts[0]);
 const openings=layout.technicalConnections.flatMap(connection=>connection.openings);
 layout.temporaryQueenIsolation=openings.map((opening,index)=>({bodyId:opening.bodyId,openingId:opening.openingId,itemId:'mesh'+(index+1)}));
 const itemMoves=layout.temporaryQueenIsolation.map(plug=>({itemId:plug.itemId,location:{type:'hive',hiveId:'h1',bodyId:plug.bodyId,openingId:plug.openingId}}));
 return {fixture,deps,layout,itemMoves};
}
function op05Request(prepared,overrides={}){
 return {userConfirmed:true,standLevelConfirmed:true,hiveId:'h1',techProcessId:'tp-h1',occurredAt:'2026-11-25T10:00:00.000Z',layout:prepared.layout,itemMoves:prepared.itemMoves,...overrides};
}

test('OP-04 starts in the confirmed one-row state without marking the operation complete',()=>{
 const fixture=firstRowFixture(),deps=dependencies(),req=request(fixture);
 req.bodyStorageMoves=[{bodyId:'b2',storageLocation:'Склад'}];
 const result=Coordinator.completeOP04(fixture.state,req,deps);
 assert.equal(result.ok,true,JSON.stringify(result.details||result));
 assert.equal(fixture.state.sectionalLayouts[0].broodRows,1);
 assert.deepEqual(fixture.state.sectionalLayouts[0].sections.map(row=>row.broodBodyIds.length),[1,1,1]);
 assert.equal(fixture.state.sectionalLayouts[0].stacks.length,3);
 assert.equal(fixture.state.sectionalTechProcesses[0].state.operations[0].status,'IN_PROGRESS');
 assert.equal(fixture.state.sectionalTechProcesses[0].state.operations[0].completedAt,null);
 assert.equal(fixture.state.auditLog[0].type,'sectional_operation_started');
 assert.equal(fixture.state.equipmentInventory.bodies.b2.storageLocation,'Склад');
 assert.deepEqual(Coordinator.inspect(fixture.state,deps),[]);
});

test('OP-04 second-row transition atomically installs three bodies and completes the operation',()=>{
 const fixture=firstRowFixture(),deps=dependencies(),start=request(fixture);
 start.bodyStorageMoves=[{bodyId:'b2',storageLocation:'Склад'}];
 const started=Coordinator.completeOP04(fixture.state,start,deps);
 assert.equal(started.ok,true,JSON.stringify(started.details||started));
 const final=makeFixture();
 const itemMoves=final.layout.technicalConnections.flatMap(connection=>connection.openings.map(opening=>({
  itemId:opening.itemId,location:{type:'hive',hiveId:'h1',bodyId:opening.bodyId,openingId:opening.openingId}
 })));
 const result=Coordinator.completeOP04SecondRow(fixture.state,{
  userConfirmed:true,hiveId:'h1',techProcessId:'tp-h1',occurredAt:'2026-11-17T11:00:00.000Z',
  layout:final.layout,addedBodyIds:['b2','b4','b6'],itemMoves
 },deps);
 assert.equal(result.ok,true,JSON.stringify(result.details||result));
 assert.equal(fixture.state.sectionalLayouts[0].broodRows,2);
 assert.deepEqual(fixture.state.sectionalLayouts[0].sections.map(row=>row.broodBodyIds.length),[2,2,2]);
 assert.equal(fixture.state.sectionalTechProcesses[0].state.operations[0].status,'DONE');
 assert.equal(fixture.state.sectionalTechProcesses[0].state.operations[0].completedAt,'2026-11-17T11:00:00.000Z');
 assert.equal(fixture.state.auditLog.at(-1).type,'sectional_operation_completed');
 assert.equal(fixture.state.equipmentInventory.events.filter(row=>row.type==='sectional_body_placed').length,6,'three bodies placed in each of the two row stages');
 assert.ok(['b2','b4','b6'].every(id=>fixture.state.equipmentInventory.bodies[id].storageLocation===undefined));
 assert.deepEqual(Coordinator.inspect(fixture.state,deps),[]);
});

test('OP-04 second-row transition rolls back when a technical accessory move fails',()=>{
 const fixture=firstRowFixture(),deps=dependencies(),start=request(fixture);
 start.bodyStorageMoves=[{bodyId:'b2',storageLocation:'Склад'}];
 assert.equal(Coordinator.completeOP04(fixture.state,start,deps).ok,true);
 const final=makeFixture();
 const itemMoves=final.layout.technicalConnections.flatMap(connection=>connection.openings.map(opening=>({
  itemId:opening.itemId,location:{type:'hive',hiveId:'h1',bodyId:opening.bodyId,openingId:opening.openingId}
 })));
 const before=structuredClone(fixture.state);
 let moves=0;
 const equipment={...Items,place:(state,req,makeId,now)=>{moves++;if(moves===2)return {ok:false,error:'forced_failure'};return Items.place(state,req,makeId,now)}};
 const result=Coordinator.completeOP04SecondRow(fixture.state,{
  userConfirmed:true,hiveId:'h1',techProcessId:'tp-h1',occurredAt:'2026-11-17T11:00:00.000Z',
  layout:final.layout,addedBodyIds:['b2','b4','b6'],itemMoves
 },dependencies({PasekaEquipmentItems:equipment}));
 assert.equal(result.ok,false);
 assert.equal(result.error,'equipment_move_rejected');
 assert.deepEqual(fixture.state,before);
});

test('OP-04 commits family split, physical layout, equipment moves and operation evidence atomically',()=>{
 const fixture=makeFixture(),deps=dependencies();
 const before=structuredClone(fixture.state);
 const result=Coordinator.completeOP04(fixture.state,request(fixture),deps);
 assert.equal(result.ok,true,JSON.stringify(result.details||result));
 assert.equal(fixture.state.sectionalLayouts.length,1);
 assert.equal(fixture.state.sectionalLayouts[0].mode,Layout.MODES.SIDE_BY_SIDE);
 assert.equal(fixture.state.families.find(row=>row.id==='f0').recordStatus,'historical');
 assert.deepEqual(fixture.state.families.filter(row=>row.recordStatus==='active').map(row=>row.id).sort(),['f1','f2','f3']);
 assert.equal(fixture.state.queens.find(row=>row.id==='q0').status,'unknown');
 assert.equal(fixture.state.queens.length,1,'OP-04 must not invent queens');
 assert.equal(fixture.state.familyEvents.length,1);
 assert.equal(fixture.state.familyEvents[0].operationId,'OP-04');
 assert.equal(fixture.state.familyEvents[0].techProcessId,'tp-h1');
 assert.equal(fixture.state.sectionalTechProcesses.length,1);
 assert.equal(fixture.state.sectionalTechProcesses[0].state.operations[0].status,'DONE');
 assert.equal(fixture.state.sectionalTechProcesses[0].state.operations[0].startedAt,NOW,'direct two-row completion must retain the division start date for OP-05 timing');
 assert.equal(fixture.state.equipmentInventory.events.length,6,'every physical brood-body placement must be recorded');
 assert.equal(Object.values(fixture.state.equipmentInventory.bodies).filter(row=>row.events?.some(event=>event.type==='placed'&&event.operationId==='OP-04')).length,6);
 assert.equal(fixture.state.auditLog.length,1);
 assert.equal(fixture.state.auditLog[0].type,'sectional_operation_completed');
 assert.equal(fixture.state.auditLog[0].familyEventId,fixture.state.familyEvents[0].id);
 assert.equal(fixture.state.equipmentInventory.items.p1.location.type,'storage');
 assert.equal(fixture.state.equipmentInventory.items.p2.location.type,'storage');
 assert.equal(fixture.state.equipmentInventory.items.p3.location.type,'storage');
 assert.equal(fixture.state.equipmentInventory.items.p4.location.type,'storage');
 assert.equal(fixture.state.equipmentInventory.items.grid1.location.openingId,'o1');
 for(const id of ['b4','b5','b6'])assert.equal(fixture.state.equipmentInventory.bodies[id].storageLocation,undefined);
 assert.deepEqual(Coordinator.inspect(fixture.state,deps),[]);
 assert.ok(before.families[0].recordStatus==='active');
});

test('OP-04 refuses to proceed without explicit user confirmation and leaves state unchanged',()=>{
 const fixture=makeFixture(),before=structuredClone(fixture.state);
 const req=request(fixture);req.userConfirmed=false;
 const result=Coordinator.completeOP04(fixture.state,req,dependencies());
 assert.equal(result.ok,false);assert.equal(result.error,'user_confirmation_required');
 assert.deepEqual(fixture.state,before);
});

test('OP-04 rolls back all draft changes if an equipment move fails midway',()=>{
 const fixture=makeFixture(),before=structuredClone(fixture.state);
 let moves=0;
 const equipment={...Items,place:(state,req,makeId,now)=>{moves++;if(moves===3)return {ok:false,error:'forced_failure'};return Items.place(state,req,makeId,now)}};
 const result=Coordinator.completeOP04(fixture.state,request(fixture),dependencies({PasekaEquipmentItems:equipment}));
 assert.equal(result.ok,false);assert.equal(result.error,'equipment_move_rejected');
 assert.deepEqual(fixture.state,before);
});

test('OP-04 refuses to proceed when the physical-body movement journal is malformed',()=>{
 const fixture=makeFixture();fixture.state.equipmentInventory.events=null;
 const before=structuredClone(fixture.state);
 const result=Coordinator.completeOP04(fixture.state,request(fixture),dependencies());
 assert.equal(result.ok,false);assert.equal(result.error,'equipment_body_event_journal_invalid');
 assert.deepEqual(fixture.state,before);
});

test('OP-04 refuses a malformed physical source layout before mutating family lineage',()=>{
 const fixture=makeFixture(),before=structuredClone(fixture.state);
 fixture.state.sectionalLayouts[0].closedOpenings=[];
 const invalidBefore=structuredClone(fixture.state);
 const result=Coordinator.completeOP04(fixture.state,request(fixture),dependencies());
 assert.equal(result.ok,false);assert.equal(result.error,'op04_initial_state_invalid');
 assert.deepEqual(fixture.state,invalidBefore);
 assert.notDeepEqual(before,invalidBefore);
});

test('OP-04 can split an unresolved source family without creating a synthetic queen',()=>{
 const fixture=makeFixture();
 fixture.state.families[0].currentQueenId=null;
 fixture.state.families[0].queenIdentityStatus='unresolved';
 fixture.state.queens=[];
 const result=Coordinator.completeOP04(fixture.state,request(fixture),dependencies());
 assert.equal(result.ok,true,JSON.stringify(result.details||result));
 assert.equal(fixture.state.queens.length,0);
 assert.deepEqual(fixture.state.familyEvents[0].candidateQueenIds,[]);
 assert.ok(fixture.state.families.filter(row=>row.recordStatus==='active').every(row=>row.queenIdentityStatus==='unresolved'));
});


test('OP-05 atomically installs one real metal mesh plug in every technical opening',()=>{
 const prepared=prepareOP05Fixture(),{fixture,deps}=prepared;
 const result=Coordinator.completeOP05(fixture.state,op05Request(prepared),deps);
 assert.equal(result.ok,true,JSON.stringify(result.details||result));
 const record=fixture.state.sectionalTechProcesses[0],op05=record.state.operations.find(row=>row.operationId==='OP-05');
 assert.equal(op05.status,'DONE');
 assert.equal(op05.completedAt,'2026-11-25T10:00:00.000Z');
 assert.equal(op05.evidence.daysAfterDivision,8);
 assert.equal(op05.evidence.standLevelConfirmed,true);
 assert.deepEqual(op05.evidence.openingIds,['o1','o2','o3','o4']);
 assert.equal(fixture.state.sectionalLayouts[0].temporaryQueenIsolation.length,4);
 for(const plug of fixture.state.sectionalLayouts[0].temporaryQueenIsolation){
  const item=fixture.state.equipmentInventory.items[plug.itemId];
  assert.deepEqual(item.location,{type:'hive',hiveId:'h1',bodyId:plug.bodyId,openingId:plug.openingId});
  assert.equal(item.events.at(-1).type,'moved');
 }
 assert.equal(fixture.state.auditLog.at(-1).operationId,'OP-05');
 assert.equal(fixture.state.auditLog.at(-1).installedItemIds.length,4);
 assert.deepEqual(Coordinator.inspect(fixture.state,deps),[]);
});

test('OP-05 requires explicit confirmation and leaves all state unchanged otherwise',()=>{
 const prepared=prepareOP05Fixture(),before=structuredClone(prepared.fixture.state);
 const result=Coordinator.completeOP05(prepared.fixture.state,op05Request(prepared,{userConfirmed:false}),prepared.deps);
 assert.equal(result.ok,false);assert.equal(result.error,'user_confirmation_required');
 assert.deepEqual(prepared.fixture.state,before);
});

test('OP-05 rejects incomplete, duplicate and extra mesh plug coverage without mutation',()=>{
 for(const mutate of [
  layout=>layout.temporaryQueenIsolation.pop(),
  layout=>layout.temporaryQueenIsolation.push({...layout.temporaryQueenIsolation[0],itemId:'mesh-extra'}),
  layout=>layout.temporaryQueenIsolation.push({bodyId:'b2',openingId:'unknown',itemId:'mesh-extra'})
 ]){
  const prepared=prepareOP05Fixture(),before=structuredClone(prepared.fixture.state);
  mutate(prepared.layout);
  const result=Coordinator.completeOP05(prepared.fixture.state,op05Request(prepared),prepared.deps);
  assert.equal(result.ok,false);
  assert.equal(result.error,'op05_mesh_plug_coverage_invalid');
  assert.deepEqual(prepared.fixture.state,before);
 }
});

test('OP-05 rolls back every mesh plug move if a later placement fails',()=>{
 const prepared=prepareOP05Fixture(),before=structuredClone(prepared.fixture.state);
 let moves=0;
 const equipment={...Items,place:(state,request,makeId,now)=>{moves++;if(moves===3)return {ok:false,error:'forced_failure'};return Items.place(state,request,makeId,now)}};
 const result=Coordinator.completeOP05(prepared.fixture.state,op05Request(prepared),dependencies({PasekaEquipmentItems:equipment}));
 assert.equal(result.ok,false);assert.equal(result.error,'op05_equipment_move_rejected');
 assert.deepEqual(prepared.fixture.state,before);
});

test('OP-05 only accepts the source window from day 8 through day 11 after division',()=>{
 const prepared=prepareOP05Fixture(),before=structuredClone(prepared.fixture.state);
 const result=Coordinator.completeOP05(prepared.fixture.state,op05Request(prepared,{occurredAt:'2026-11-29T10:00:00.000Z'}),prepared.deps);
 assert.equal(result.ok,false);assert.equal(result.error,'op05_outside_source_window');
 assert.deepEqual(prepared.fixture.state,before);
});

test('OP-05 cannot change the physical layout while installing temporary plugs',()=>{
 const prepared=prepareOP05Fixture(),before=structuredClone(prepared.fixture.state);
 prepared.layout.sections[0].broodBodyIds=['b3','b2'];
 const result=Coordinator.completeOP05(prepared.fixture.state,op05Request(prepared),prepared.deps);
 assert.equal(result.ok,false);assert.equal(result.error,'op05_must_not_change_existing_physical_layout');
 assert.deepEqual(prepared.fixture.state,before);
});

test('OP-05 inspection rejects a recorded operation whose mesh plug coverage is later damaged',()=>{
 const prepared=prepareOP05Fixture();
 assert.equal(Coordinator.completeOP05(prepared.fixture.state,op05Request(prepared),prepared.deps).ok,true);
 prepared.fixture.state.sectionalLayouts[0].temporaryQueenIsolation.pop();
 assert.ok(Coordinator.inspect(prepared.fixture.state,prepared.deps).some(error=>error.code==='sectional_tech_process_temporary_queen_plug_coverage_missing'));
});


test('OP-05 cannot precede the actual completion timestamp of OP-04',()=>{
 const prepared=prepareOP05Fixture(),before=structuredClone(prepared.fixture.state);
 prepared.fixture.state.sectionalTechProcesses[0].state.operations.find(row=>row.operationId==='OP-04').completedAt='2026-11-26T10:00:00.000Z';
 const invalidBefore=structuredClone(prepared.fixture.state);
 const result=Coordinator.completeOP05(prepared.fixture.state,op05Request(prepared),prepared.deps);
 assert.equal(result.ok,false);assert.equal(result.error,'op05_precedes_op04_completion');
 assert.deepEqual(prepared.fixture.state,invalidBefore);
 assert.notDeepEqual(before,invalidBefore);
});

test('OP-05 requires each real mesh plug to exist in usable storage',()=>{
 const prepared=prepareOP05Fixture(),before=structuredClone(prepared.fixture.state);
 delete prepared.fixture.state.equipmentInventory.items.mesh2;
 const invalidBefore=structuredClone(prepared.fixture.state);
 const result=Coordinator.completeOP05(prepared.fixture.state,op05Request(prepared),prepared.deps);
 assert.equal(result.ok,false);assert.equal(result.error,'op05_mesh_plug_not_available_in_storage');
 assert.deepEqual(prepared.fixture.state,invalidBefore);
 assert.notDeepEqual(before,invalidBefore);
});

test('OP-05 accepts the final day of the documented 8–11 day window',()=>{
 const prepared=prepareOP05Fixture();
 const result=Coordinator.completeOP05(prepared.fixture.state,op05Request(prepared,{occurredAt:'2026-11-28T10:00:00.000Z'}),prepared.deps);
 assert.equal(result.ok,true,JSON.stringify(result.details||result));
 assert.equal(prepared.fixture.state.sectionalTechProcesses[0].state.operations.find(row=>row.operationId==='OP-05').evidence.daysAfterDivision,11);
});


test('OP-05 requires explicit confirmation that the stand is level',()=>{
 const prepared=prepareOP05Fixture(),before=structuredClone(prepared.fixture.state);
 const result=Coordinator.completeOP05(prepared.fixture.state,op05Request(prepared,{standLevelConfirmed:false}),prepared.deps);
 assert.equal(result.ok,false);assert.equal(result.error,'op05_level_stand_confirmation_required');
 assert.deepEqual(prepared.fixture.state,before);
});


test('OP-05 inspection requires durable movement evidence for every installed mesh plug',()=>{
 const prepared=prepareOP05Fixture();
 assert.equal(Coordinator.completeOP05(prepared.fixture.state,op05Request(prepared),prepared.deps).ok,true);
 const plug=prepared.fixture.state.sectionalLayouts[0].temporaryQueenIsolation[0];
 const item=prepared.fixture.state.equipmentInventory.items[plug.itemId];
 const eventId=item.events.at(-1).id;
 item.events=item.events.filter(event=>event.id!==eventId);
 prepared.fixture.state.equipmentInventory.itemEvents=prepared.fixture.state.equipmentInventory.itemEvents.filter(event=>event.id!==eventId);
 assert.ok(Coordinator.inspect(prepared.fixture.state,prepared.deps).some(error=>error.code==='sectional_tech_process_op05_movement_evidence_invalid'));
});
