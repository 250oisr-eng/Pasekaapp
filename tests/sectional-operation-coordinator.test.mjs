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
  grid4:item('grid4','technicalQueenExcluder',{type:'storage',label:'Склад'})
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
   {id:'s-left',position:'left',familyId:'f1',broodBodyIds:['b1','b2'],upperBroodBodyId:'b2',openings:[{id:'o1',bodyId:'b2',diameterMm:50}]},
   {id:'s-middle',position:'middle',familyId:'f2',broodBodyIds:['b3','b4'],upperBroodBodyId:'b4',openings:[{id:'o2',bodyId:'b4',diameterMm:50},{id:'o3',bodyId:'b4',diameterMm:50}]},
   {id:'s-right',position:'right',familyId:'f3',broodBodyIds:['b5','b6'],upperBroodBodyId:'b6',openings:[{id:'o4',bodyId:'b6',diameterMm:50}]}
  ],
  stacks:[
   {id:'sl',position:'left',sectionIds:['s-left'],bottomItemId:'bottom1',coverItemId:'cover1',topRiserItemId:'riser1'},
   {id:'sm',position:'middle',sectionIds:['s-middle'],bottomItemId:'bottom2',coverItemId:'cover2',topRiserItemId:'riser2'},
   {id:'sr',position:'right',sectionIds:['s-right'],bottomItemId:'bottom3',coverItemId:'cover3',topRiserItemId:'riser3'}
  ],
  technicalConnections:[
   {id:'c-lm',fromSectionId:'s-left',toSectionId:'s-middle',bufferCorridorPresent:true,openings:[
    {sectionId:'s-left',bodyId:'b2',openingId:'o1',itemId:'grid1'},
    {sectionId:'s-middle',bodyId:'b4',openingId:'o2',itemId:'grid2'}
   ]},
   {id:'c-mr',fromSectionId:'s-middle',toSectionId:'s-right',bufferCorridorPresent:true,openings:[
    {sectionId:'s-middle',bodyId:'b4',openingId:'o3',itemId:'grid3'},
    {sectionId:'s-right',bodyId:'b6',openingId:'o4',itemId:'grid4'}
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
  ['grid1',{type:'hive',hiveId:'h1',bodyId:'b2',openingId:'o1'}],
  ['grid2',{type:'hive',hiveId:'h1',bodyId:'b4',openingId:'o2'}],
  ['grid3',{type:'hive',hiveId:'h1',bodyId:'b4',openingId:'o3'}],
  ['grid4',{type:'hive',hiveId:'h1',bodyId:'b6',openingId:'o4'}],
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
 for(const connection of fixture.layout.technicalConnections)for(const opening of connection.openings){
  opening.bodyId=bodyByOpening[opening.openingId];
 }
 fixture.itemMoves=fixture.itemMoves.map(move=>{
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
