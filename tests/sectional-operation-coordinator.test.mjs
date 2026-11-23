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
 '../js/sectional-operation-coordinator.js',
 '../js/sectional-op03-body-swap.js'
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
const OP03Swap=appWindow.PasekaSectionalOP03BodySwap;
const PROFILE='sectional-multiqueen-v1';
const NOW='2026-11-17T10:00:00.000Z';
const codes=['ААА','ААБ','ААГ','ААД','ААЕ','ААЖ'];

function item(id,kind,location){
 return {id,kind,label:id,condition:'good',location,notes:'',registeredAt:NOW,updatedAt:NOW,events:[]};
}
function body(id,index,storageLocation=''){
 return {id,kind:'brood',condition:'good',spec:{profileId:PROFILE,framesPerBox:6},frames:Array.from({length:6},(_,frameIndex)=>({frameId:id+'-frame-'+(frameIndex+1),history:[]})),...(storageLocation?{storageLocation}:{}),labelCode:codes[index]};
}
function honeyFrames(bodyId){
 return Array.from({length:10},(_,index)=>({
  frameId:bodyId+'-frame-'+(index+1),
  ...(bodyId==='honey1'&&index===0?{labelCode:'ААА'}:{}),
  combType:[3,6].includes(index)?'wax_foundation':'drawn_comb',
  history:[]
 }));
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
  now:()=>Date.parse('2026-12-31T23:59:59.999Z'),
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
function prepareOP06Queens(state,deps){
 const split=state.familyEvents.find(event=>event?.type==='split'&&event.operationId==='OP-04'&&event.techProcessId==='tp-h1');
 for(const [index,familyId] of ['f1','f2','f3'].entries()){
  const identity=Lineage.confirmQueenIdentity(state,{familyId,newQueen:{originType:'emergency_reared',code:'young-'+(index+1)},operationId:'OP-04',techProcessId:'tp-h1',occurredAt:'2026-12-06T08:00:00.000Z'},deps.makeId,'2026-12-06T08:00:00.000Z');
  assert.equal(identity.ok,true,JSON.stringify(identity));
  const observation=Lineage.recordQueenLayingObserved(state,{familyId,techProcessId:'tp-h1',splitEventId:split.id,userConfirmed:true,occurredAt:'2026-12-07T09:00:00.000Z'},deps.makeId,'2026-12-07T09:30:00.000Z');
  assert.equal(observation.ok,true,JSON.stringify(observation));
 }
}
function op06Request(prepared,overrides={}){
 const oldLayout=prepared.fixture.state.sectionalLayouts[0],layout=structuredClone(oldLayout);
 layout.temporaryQueenIsolation=[];
 const itemMoves=oldLayout.temporaryQueenIsolation.map(plug=>({itemId:plug.itemId,location:{type:'storage',label:'Склад'}}));
 return {userConfirmed:true,hiveId:'h1',techProcessId:'tp-h1',occurredAt:'2026-12-07T10:00:00.000Z',layout,itemMoves,...overrides};
}
function prepareOP07Fixture(){
 const fixture=makeFixture(),deps=dependencies();
 const started=Coordinator.completeOP04(fixture.state,request(fixture),deps);
 if(!started.ok)throw new Error('OP-04 fixture setup failed: '+JSON.stringify(started));
 const bodyIds=['honey1','honey2'];
 for(const [index,id] of bodyIds.entries()){
  fixture.state.equipmentInventory.bodies[id]={id,kind:'honey',condition:'good',spec:{profileId:PROFILE,framesPerBox:10},pairId:'honey-pair-1',storageLocation:'Склад',events:[],frames:honeyFrames(id)};
  fixture.state.equipmentLabels.bodies[id]=index===0?'ААХ':'ААЦ';
 }
 fixture.state.equipmentInventory.items['ex-left']=item('ex-left','honeyQueenExcluder',{type:'storage',label:'Склад'});
 fixture.state.equipmentInventory.items['ex-right']=item('ex-right','honeyQueenExcluder',{type:'storage',label:'Склад'});
 const oldLayout=fixture.state.sectionalLayouts[0],layout=structuredClone(oldLayout);
 for(const stack of layout.stacks){delete stack.coverItemId;delete stack.topRiserItemId}
 layout.honeyStack={purpose:'early',bodyIds,excluders:[{side:'left',itemId:'ex-left'},{side:'right',itemId:'ex-right'}]};
 const itemMoves=[];
 for(const stack of oldLayout.stacks){
  itemMoves.push({itemId:stack.coverItemId,location:{type:'storage',label:'Склад'}});
  itemMoves.push({itemId:stack.topRiserItemId,location:{type:'storage',label:'Склад'}});
 }
 itemMoves.push({itemId:'ex-left',location:{type:'hive',hiveId:'h1',footprint:[{bodyId:'b2',coverage:'FULL'},{bodyId:'b4',coverage:'HALF'}]}});
 itemMoves.push({itemId:'ex-right',location:{type:'hive',hiveId:'h1',footprint:[{bodyId:'b4',coverage:'HALF'},{bodyId:'b6',coverage:'FULL'}]}});
 return {fixture,deps,layout,itemMoves};
}
function op07Request(prepared,overrides={}){
 return {userConfirmed:true,hiveId:'h1',techProcessId:'tp-h1',occurredAt:NOW,timingMode:'WITH_SECOND_ROW',layout:prepared.layout,itemMoves:prepared.itemMoves,bodyStorageMoves:[],...overrides};
}

test('all sectional operation completion APIs reject future-dated events',()=>{
 const deps={now:()=>Date.parse('2026-11-17T10:00:00.000Z')};
 const future='2026-11-17T10:00:01.000Z';
 const cases=[
  ()=>Coordinator.completeOP04({}, {userConfirmed:true,hiveId:'h1',sourceFamilyId:'f0',techProcessId:'tp',occurredAt:future},deps),
  ()=>Coordinator.completeOP04SecondRow({}, {userConfirmed:true,hiveId:'h1',techProcessId:'tp',occurredAt:future},deps),
  ()=>Coordinator.completeOP05({}, {userConfirmed:true,standLevelConfirmed:true,hiveId:'h1',techProcessId:'tp',occurredAt:future},deps),
  ()=>Coordinator.completeOP06({}, {userConfirmed:true,hiveId:'h1',techProcessId:'tp',occurredAt:future},deps),
  ()=>Coordinator.completeOP07({}, {userConfirmed:true,hiveId:'h1',techProcessId:'tp',occurredAt:future,timingMode:'AFTER_OP06'},deps)
 ];
 for(const run of cases)assert.equal(run().error,'operation_timestamp_in_future');
});

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
 const itemMoves=final.layout.technicalConnections.flatMap(connection=>connection.openings.filter(opening=>['grid5','grid6','grid7','grid8'].includes(opening.itemId)).map(opening=>({
  itemId:opening.itemId,location:{type:'hive',hiveId:'h1',bodyId:opening.bodyId,openingId:opening.openingId}
 })));
 const result=Coordinator.completeOP04SecondRow(fixture.state,{
  userConfirmed:true,hiveId:'h1',techProcessId:'tp-h1',occurredAt:'2026-11-17T11:00:00.000Z',
  layout:final.layout,addedBodyIds:['b2','b4','b6'],itemMoves
 },deps);
 assert.equal(result.ok,true,JSON.stringify(result.details||result));
 assert.equal(fixture.state.sectionalLayouts[0].broodRows,2);
 assert.deepEqual(fixture.state.sectionalLayouts[0].sections.map(row=>row.broodBodyIds.length),[2,2,2]);
 for(const [itemId,bodyId,openingId] of [['grid1','b1','o1'],['grid2','b3','o2'],['grid3','b3','o3'],['grid4','b5','o4'],['grid5','b2','o5'],['grid6','b4','o6'],['grid7','b4','o7'],['grid8','b6','o8']])assert.deepEqual(fixture.state.equipmentInventory.items[itemId].location,{type:'hive',hiveId:'h1',bodyId,openingId});
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
 const itemMoves=final.layout.technicalConnections.flatMap(connection=>connection.openings.filter(opening=>['grid5','grid6','grid7','grid8'].includes(opening.itemId)).map(opening=>({
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

test('OP-04 reserves IDs already used by corpus-level event journals',()=>{
 const fixture=makeFixture(),deps=dependencies();
 fixture.state.equipmentInventory.bodies.b1.events=[{id:'evt-2',type:'legacy_event',at:NOW}];
 const result=Coordinator.completeOP04(fixture.state,request(fixture),deps);
 assert.equal(result.ok,true,JSON.stringify(result.details||result));
 assert.equal(fixture.state.equipmentInventory.bodies.b1.events[0].id,'evt-2');
 const ids=[
  ...fixture.state.familyEvents.map(event=>event.id),
  ...fixture.state.auditLog.map(event=>event.id),
  ...fixture.state.equipmentInventory.events.map(event=>event.id),
  ...Object.values(fixture.state.equipmentInventory.bodies).flatMap(body=>[
   ...(body.events||[]).map(event=>event.id),
   ...(body.frames||[]).flatMap(frame=>(frame.history||[]).map(event=>event.id))
  ])
 ];
 assert.equal(new Set(ids).size,ids.length,'all event IDs across family, body, inventory and frame journals must be unique');
});

test('OP-04 commits family split, physical layout, equipment moves, frame history and operation evidence atomically',()=>{
 const fixture=makeFixture(),deps=dependencies();
 for(const [bodyId,bodyRecord] of Object.entries(fixture.state.equipmentInventory.bodies)){
  bodyRecord.frames=Array.from({length:6},(_,index)=>({frameId:bodyId+'-frame-'+(index+1),history:[]}));
  for(const frame of bodyRecord.frames)Labels.assignFrameCode(fixture.state,frame);
 }
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
 assert.equal(fixture.state.equipmentInventory.events.length,6,'every physical brood-body placement must be recorded');assert.ok(fixture.state.equipmentInventory.events.every(event=>event.id&&event.at===NOW));assert.ok(Object.values(fixture.state.equipmentInventory.bodies).filter(row=>row.events?.some(event=>event.operationId==='OP-04')).every(row=>row.events.some(event=>event.id&&event.at===NOW)));
 assert.equal(Object.values(fixture.state.equipmentInventory.bodies).filter(row=>row.events?.some(event=>event.type==='placed'&&event.operationId==='OP-04')).length,6);
 for(const [bodyId,bodyRecord] of Object.entries(fixture.state.equipmentInventory.bodies)){
  const expectedPosition={b1:'left',b2:'left',b3:'middle',b4:'middle',b5:'right',b6:'right'}[bodyId];
  assert.equal(bodyRecord.frames.length,6);
  for(const frame of bodyRecord.frames){
   assert.equal(frame.history.length,1,'each frame movement must be recorded exactly once');
   const event=frame.history[0];
   assert.equal(event.operationId,'OP-04');
   assert.equal(event.action,bodyId==='b4'||bodyId==='b5'||bodyId==='b6'?'corpus_from_storage':'corpus_transfer');
   assert.deepEqual(event.to,{hiveId:'h1',box:'brood:'+expectedPosition+':'+bodyId});
  }
 }
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
 assert.deepEqual(op05.evidence.openingIds,['o1','o2','o3','o4','o5','o6','o7','o8']);
 assert.equal(fixture.state.sectionalLayouts[0].temporaryQueenIsolation.length,8);
 for(const plug of fixture.state.sectionalLayouts[0].temporaryQueenIsolation){
  const item=fixture.state.equipmentInventory.items[plug.itemId];
  assert.deepEqual(item.location,{type:'hive',hiveId:'h1',bodyId:plug.bodyId,openingId:plug.openingId});
  assert.equal(item.events.at(-1).type,'moved');
 }
 assert.equal(fixture.state.auditLog.at(-1).operationId,'OP-05');
 assert.equal(fixture.state.auditLog.at(-1).installedItemIds.length,8);
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


test('append-only queen laying observation requires a current identified queen and the OP-04 split event',()=>{
 const prepared=prepareOP05Fixture(),{fixture}=prepared;
 const split=fixture.state.familyEvents.find(event=>event?.type==='split'&&event.operationId==='OP-04');
 const family=fixture.state.families.find(row=>row.id==='f1');
 const identity=Lineage.confirmQueenIdentity(fixture.state,{familyId:'f1',newQueen:{originType:'emergency_reared'},operationId:'OP-04',techProcessId:'tp-h1',occurredAt:'2026-12-06T08:00:00.000Z'},prepared.deps.makeId,'2026-12-06T08:00:00.000Z');
 assert.equal(identity.ok,true);
 const before=structuredClone(fixture.state);
 const rejected=Lineage.recordQueenLayingObserved(fixture.state,{familyId:'f1',techProcessId:'tp-h1',splitEventId:split.id,userConfirmed:false,occurredAt:'2026-12-07T09:00:00.000Z'},prepared.deps.makeId,'2026-12-07T09:30:00.000Z');
 assert.equal(rejected.ok,false);
 assert.equal(rejected.error,'queen_laying_user_confirmation_required');
 assert.deepEqual(fixture.state,before);
 const result=Lineage.recordQueenLayingObserved(fixture.state,{familyId:'f1',techProcessId:'tp-h1',splitEventId:split.id,userConfirmed:true,occurredAt:'2026-12-07T09:00:00.000Z'},prepared.deps.makeId,'2026-12-07T09:30:00.000Z');
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(fixture.state.queenEvents.at(-1).type,'laying_observed');
 assert.equal(fixture.state.queenEvents.at(-1).queenId,identity.queen.id);
 assert.equal(fixture.state.families.find(row=>row.id==='f1').currentQueenId,identity.queen.id);
 assert.deepEqual(Lineage.inspect(fixture.state),[]);
});

test('OP-06 removes all eight real mesh plugs atomically after 20 days and three dated laying observations',()=>{
 const prepared=prepareOP05Fixture(),{fixture,deps}=prepared;
 assert.equal(Coordinator.completeOP05(fixture.state,op05Request(prepared),deps).ok,true);
 prepareOP06Queens(fixture.state,deps);
 const request=op06Request(prepared);
 const result=Coordinator.completeOP06(fixture.state,request,deps);
 assert.equal(result.ok,true,JSON.stringify(result.details||result));
 const record=fixture.state.sectionalTechProcesses[0],op06=record.state.operations.find(row=>row.operationId==='OP-06');
 assert.equal(op06.status,'DONE');
 assert.equal(op06.evidence.daysAfterDivision,20);
 assert.equal(op06.evidence.removedPlugs.length,8);
 assert.equal(fixture.state.sectionalLayouts[0].temporaryQueenIsolation.length,0);
 for(const plug of op06.evidence.removedPlugs){
  const item=fixture.state.equipmentInventory.items[plug.itemId];
  assert.deepEqual(item.location,{type:'storage',label:'Склад'});
  assert.equal(item.events.at(-1).type,'moved_to_storage');
 }
 assert.equal(fixture.state.auditLog.at(-1).operationId,'OP-06');
 assert.deepEqual(Coordinator.inspect(fixture.state,deps),[]);
});

test('OP-05 installation movement evidence remains validated after OP-06 removes the mesh plugs',()=>{
 const prepared=prepareOP05Fixture(),{fixture,deps}=prepared;
 assert.equal(Coordinator.completeOP05(fixture.state,op05Request(prepared),deps).ok,true);
 prepareOP06Queens(fixture.state,deps);
 const removed=Coordinator.completeOP06(fixture.state,op06Request(prepared),deps);
 assert.equal(removed.ok,true,JSON.stringify(removed.details||removed));
 const op05=fixture.state.sectionalTechProcesses[0].state.operations.find(row=>row.operationId==='OP-05');
 const evidence=op05.evidence.itemMovementEventIds[0],item=fixture.state.equipmentInventory.items[evidence.itemId];
 item.events=item.events.filter(event=>event.id!==evidence.eventId);
 fixture.state.equipmentInventory.itemEvents=fixture.state.equipmentInventory.itemEvents.filter(event=>event.id!==evidence.eventId);
 assert.ok(Coordinator.inspect(fixture.state,deps).some(error=>error.code==='sectional_tech_process_op05_movement_evidence_invalid'&&error.details.itemId===evidence.itemId));
});

test('OP-06 can record that optional OP-05 was skipped only with explicit absence confirmation',()=>{
 const fixture=makeFixture(),deps=dependencies();
 const started=Coordinator.completeOP04(fixture.state,request(fixture),deps);
 assert.equal(started.ok,true,JSON.stringify(started));
 prepareOP06Queens(fixture.state,deps);
 const prepared={fixture};
 const result=Coordinator.completeOP06(fixture.state,{userConfirmed:true,noPlugsInstalledConfirmed:true,hiveId:'h1',techProcessId:'tp-h1',occurredAt:'2026-12-07T10:00:00.000Z',layout:structuredClone(fixture.state.sectionalLayouts[0]),itemMoves:[]},deps);
 assert.equal(result.ok,true,JSON.stringify(result.details||result));
 assert.equal(fixture.state.sectionalTechProcesses[0].state.operations.some(row=>row.operationId==='OP-05'),false);
 assert.equal(fixture.state.sectionalTechProcesses[0].state.operations.find(row=>row.operationId==='OP-06').evidence.noPlugsInstalledConfirmed,true);
 assert.deepEqual(Coordinator.inspect(fixture.state,deps),[]);
});

test('OP-06 rejects missing queen laying evidence, wrong day and partial plug removal without mutation',()=>{
 const missing=prepareOP05Fixture(),{fixture:missingFixture,deps:missingDeps}=missing;
 assert.equal(Coordinator.completeOP05(missingFixture.state,op05Request(missing),missingDeps).ok,true);
 prepareOP06Queens(missingFixture.state,missingDeps);
 missingFixture.state.queenEvents=missingFixture.state.queenEvents.filter(event=>!(event.type==='laying_observed'&&event.familyId==='f3'));
 let before=structuredClone(missingFixture.state);
 let result=Coordinator.completeOP06(missingFixture.state,op06Request(missing),missingDeps);
 assert.equal(result.ok,false);assert.equal(result.error,'op06_queen_laying_observation_required');
 assert.deepEqual(missingFixture.state,before);

 const wrong=prepareOP05Fixture(),{fixture:wrongFixture,deps:wrongDeps}=wrong;
 assert.equal(Coordinator.completeOP05(wrongFixture.state,op05Request(wrong),wrongDeps).ok,true);
 prepareOP06Queens(wrongFixture.state,wrongDeps);
 before=structuredClone(wrongFixture.state);
 result=Coordinator.completeOP06(wrongFixture.state,op06Request(wrong,{occurredAt:'2026-12-06T10:00:00.000Z'}),wrongDeps);
 assert.equal(result.ok,false);assert.equal(result.error,'op06_before_safe_observation_window');
 assert.deepEqual(wrongFixture.state,before);

 const partial=prepareOP05Fixture(),{fixture:partialFixture,deps:partialDeps}=partial;
 assert.equal(Coordinator.completeOP05(partialFixture.state,op05Request(partial),partialDeps).ok,true);
 prepareOP06Queens(partialFixture.state,partialDeps);
 partialFixture.state.sectionalLayouts[0].temporaryQueenIsolation.pop();
 before=structuredClone(partialFixture.state);
 result=Coordinator.completeOP06(partialFixture.state,op06Request(partial),partialDeps);
 assert.equal(result.ok,false);assert.equal(result.error,'op06_partial_mesh_plug_installation_invalid');
 assert.deepEqual(partialFixture.state,before);
});

test('OP-06 rolls back every removal when a later equipment move fails',()=>{
 const prepared=prepareOP05Fixture(),{fixture,deps}=prepared;
 assert.equal(Coordinator.completeOP05(fixture.state,op05Request(prepared),deps).ok,true);
 prepareOP06Queens(fixture.state,deps);
 const before=structuredClone(fixture.state);
 let moves=0;
 const equipment={...Items,place:(state,request,makeId,now)=>{moves++;if(moves===4)return {ok:false,error:'forced_failure'};return Items.place(state,request,makeId,now)}};
 const result=Coordinator.completeOP06(fixture.state,op06Request(prepared),dependencies({PasekaEquipmentItems:equipment}));
 assert.equal(result.ok,false);assert.equal(result.error,'op06_equipment_move_rejected');
 assert.deepEqual(fixture.state,before);
});


function installOP05AfterHoneyStage(prepared){
 const {fixture,deps}=prepared,state=fixture.state,layout=structuredClone(state.sectionalLayouts[0]);
 const openings=layout.technicalConnections.flatMap(connection=>connection.openings),itemMoves=[];
 layout.temporaryQueenIsolation=openings.map((opening,index)=>{
  const itemId='temporary-plug-'+(index+1);
  state.equipmentInventory.items[itemId]=item(itemId,'metalMeshPlug',{type:'storage',label:'Склад'});
  itemMoves.push({itemId,location:{type:'hive',hiveId:'h1',bodyId:opening.bodyId,openingId:opening.openingId}});
  return {itemId,bodyId:opening.bodyId,openingId:opening.openingId};
 });
 const result=Coordinator.completeOP05(state,{userConfirmed:true,standLevelConfirmed:true,hiveId:'h1',techProcessId:'tp-h1',occurredAt:'2026-11-25T10:00:00.000Z',layout,itemMoves},deps);
 return result;
}

test('OP-07 atomically installs two large FULL/HALF excluders and one complete honey-body pair',()=>{
 const prepared=prepareOP07Fixture(),{fixture,deps}=prepared;
 const result=Coordinator.completeOP07(fixture.state,op07Request(prepared),deps);
 assert.equal(result.ok,true,JSON.stringify(result.details||result));
 const record=fixture.state.sectionalTechProcesses[0],op07=record.state.operations.find(row=>row.operationId==='OP-07');
 assert.equal(op07.status,'DONE');
 assert.equal(op07.evidence.timingMode,'WITH_SECOND_ROW');
 assert.deepEqual(fixture.state.sectionalLayouts[0].honeyStack.bodyIds,['honey1','honey2']);
 assert.equal(fixture.state.sectionalLayouts[0].honeyStack.excluders.length,2);
 assert.equal(fixture.state.equipmentInventory.bodies.honey1.frames.length,10);
 const labelledHoneyFrame=Labels.listLabelledFrames(fixture.state);
 assert.equal(labelledHoneyFrame.length,1);
 assert.equal(labelledHoneyFrame[0].locationType,'hive');
 assert.equal(labelledHoneyFrame[0].box,'honey:honey1');
 for(const id of ['ex-left','ex-right']){
  const excluder=fixture.state.equipmentInventory.items[id];
  assert.equal(excluder.location.type,'hive');
  assert.equal(excluder.events.at(-1).type,'moved');
 }
 for(const id of ['honey1','honey2']){
  const body=fixture.state.equipmentInventory.bodies[id];
  assert.equal(body.storageLocation,undefined);
  assert.ok(body.events.some(event=>event.operationId==='OP-07'&&event.type==='placed'));
 }
 for(const stack of fixture.state.sectionalLayouts[0].stacks){
  assert.equal(stack.coverItemId,undefined);
  assert.equal(stack.topRiserItemId,undefined);
 }
 assert.equal(fixture.state.auditLog.at(-1).operationId,'OP-07');
 assert.deepEqual(Coordinator.inspect(fixture.state,deps),[]);
});

test('OP-07 requires early honey foundation frames to be separated by drawn comb, at most two per body',()=>{
 const cases=[
  {name:'three foundation frames in one body',mutate:frames=>{frames[1].combType='wax_foundation';frames[3].combType='wax_foundation';frames[5].combType='wax_foundation'},code:'wax_foundation_limit_exceeded'},
  {name:'adjacent foundation frames',mutate:frames=>{frames[3].combType='wax_foundation';frames[4].combType='wax_foundation'},code:'wax_foundation_must_be_between_drawn_comb'},
  {name:'foundation at the edge',mutate:frames=>{frames[0].combType='wax_foundation'},code:'wax_foundation_must_be_between_drawn_comb'},
  {name:'unclassified frame',mutate:frames=>{delete frames[2].combType},code:'frame_comb_type_missing_or_invalid'}
 ];
 for(const scenario of cases){
  const prepared=prepareOP07Fixture(),{fixture,deps}=prepared;
  scenario.mutate(fixture.state.equipmentInventory.bodies.honey1.frames);
  const before=structuredClone(fixture.state);
  const result=Coordinator.completeOP07(fixture.state,op07Request(prepared),deps);
  assert.equal(result.ok,false,scenario.name);
  assert.equal(result.error,'op07_early_honey_frame_composition_invalid',scenario.name);
  assert.ok(result.details.errors.some(error=>error.code===scenario.code),scenario.name);
  assert.deepEqual(fixture.state,before,scenario.name+' must roll back without mutations');
 }
});
test('OP-07 rejects an incomplete honey body and rolls back all changes',()=>{
 const prepared=prepareOP07Fixture(),{fixture,deps}=prepared;
 fixture.state.equipmentInventory.bodies.honey1.frames.pop();
 const before=structuredClone(fixture.state);
 const result=Coordinator.completeOP07(fixture.state,op07Request(prepared),deps);
 assert.equal(result.ok,false);
 assert.equal(result.error,'op07_honey_frame_capacity_mismatch');
 assert.deepEqual(result.details,{bodyId:'honey1',expected:10,actual:9});
 assert.deepEqual(fixture.state,before);
});
test('OP-07 permits up to two separated foundation frames in each honey body independently',()=>{
 const prepared=prepareOP07Fixture(),{fixture,deps}=prepared;
 const result=Coordinator.completeOP07(fixture.state,op07Request(prepared),deps);
 assert.equal(result.ok,true,JSON.stringify(result.details||result));
 const composition=fixture.state.equipmentInventory.bodies;
 assert.equal(composition.honey1.frames.filter(frame=>frame.combType==='wax_foundation').length,2);
 assert.equal(composition.honey2.frames.filter(frame=>frame.combType==='wax_foundation').length,2);
 assert.equal(composition.honey1.frames[3].history.at(-1).action,'corpus_from_storage');
 assert.equal(composition.honey1.frames[3].history.at(-1).to.box,'honey:honey1');assert.ok(composition.honey1.frames[3].history.at(-1).id);assert.equal(composition.honey1.frames[3].history.at(-1).at,NOW);
 assert.deepEqual(Coordinator.inspect(fixture.state,deps),[]);
});
test('OP-07 allows installation with the second row or 12-15 calendar days later only',()=>{
 const accepted=[
  {occurredAt:'2026-11-17T10:00:00.000Z',timingMode:'WITH_SECOND_ROW',days:0},
  {occurredAt:'2026-11-29T10:00:00.000Z',timingMode:'APPROX_12_DAYS_AFTER_SECOND_ROW',days:12},
  {occurredAt:'2026-12-02T10:00:00.000Z',timingMode:'APPROX_12_DAYS_AFTER_SECOND_ROW',days:15}
 ];
 for(const scenario of accepted){
  const prepared=prepareOP07Fixture(),{fixture,deps}=prepared;
  const result=Coordinator.completeOP07(fixture.state,op07Request(prepared,scenario),deps);
  assert.equal(result.ok,true,JSON.stringify(result.details||result));
  const evidence=fixture.state.sectionalTechProcesses[0].state.operations.find(row=>row.operationId==='OP-07').evidence;
  assert.equal(evidence.daysAfterSecondRow,scenario.days);
  assert.deepEqual(Coordinator.inspect(fixture.state,deps),[]);
 }
 for(const [occurredAt,days] of [['2026-11-28T10:00:00.000Z',11],['2026-12-03T10:00:00.000Z',16]]){
  const prepared=prepareOP07Fixture(),{fixture,deps}=prepared,before=structuredClone(fixture.state);
  const result=Coordinator.completeOP07(fixture.state,op07Request(prepared,{occurredAt,timingMode:'APPROX_12_DAYS_AFTER_SECOND_ROW'}),deps);
  assert.equal(result.ok,false);
  assert.equal(result.error,'op07_delayed_timing_outside_12_15_day_window');
  assert.equal(result.details.daysAfterSecondRow,days);
  assert.deepEqual(fixture.state,before);
 }
 const tampered=prepareOP07Fixture(),{fixture,deps}=tampered;
 const completed=Coordinator.completeOP07(fixture.state,op07Request(tampered,{occurredAt:'2026-11-29T10:00:00.000Z',timingMode:'APPROX_12_DAYS_AFTER_SECOND_ROW'}),deps);
 assert.equal(completed.ok,true,JSON.stringify(completed.details||completed));
 fixture.state.sectionalTechProcesses[0].state.operations.find(row=>row.operationId==='OP-07').evidence.daysAfterSecondRow=11;
 assert.ok(Coordinator.inspect(fixture.state,deps).some(error=>error.code==='sectional_tech_process_op07_timing_evidence_mismatch'));
});

test('OP-07 requires an explicit timing variant and a complete pair of honey bodies',()=>{
 const prepared=prepareOP07Fixture(),{fixture,deps}=prepared,before=structuredClone(fixture.state);
 let result=Coordinator.completeOP07(fixture.state,op07Request(prepared,{timingMode:null}),deps);
 assert.equal(result.ok,false);assert.equal(result.error,'op07_timing_mode_required');
 assert.deepEqual(fixture.state,before);
 fixture.state.equipmentInventory.bodies.honey2.pairId='different-pair';
 const invalid=structuredClone(fixture.state);
 result=Coordinator.completeOP07(fixture.state,op07Request(prepared),deps);
 assert.equal(result.ok,false);assert.equal(result.error,'op07_honey_bodies_must_be_complete_pairs');
 assert.deepEqual(fixture.state,invalid);
});

test('OP-07 rolls back body and accessory movements if an excluder move fails',()=>{
 const prepared=prepareOP07Fixture(),{fixture}=prepared,before=structuredClone(fixture.state);
 let moves=0;
 const equipment={...Items,place:(state,request,makeId,now)=>{moves++;if(moves===8)return {ok:false,error:'forced_failure'};return Items.place(state,request,makeId,now)}};
 const result=Coordinator.completeOP07(fixture.state,op07Request(prepared),dependencies({PasekaEquipmentItems:equipment}));
 assert.equal(result.ok,false);assert.equal(result.error,'op07_equipment_move_rejected');
 assert.deepEqual(fixture.state,before);
});

test('OP-07 after OP-06 requires completed mesh removal, while alternate source timing modes may precede OP-06',()=>{
 const prepared=prepareOP07Fixture(),{fixture,deps}=prepared;
 const result=Coordinator.completeOP07(fixture.state,op07Request(prepared,{timingMode:'AFTER_OP06'}),deps);
 assert.equal(result.ok,false);assert.equal(result.error,'op07_requires_completed_op06');
 assert.deepEqual(fixture.state.sectionalLayouts[0].honeyStack,undefined);
});
test('OP-05 and OP-06 remain valid after OP-07 has installed honey bodies and large excluders',()=>{
 const prepared=prepareOP07Fixture(),{fixture,deps}=prepared;
 const op07=Coordinator.completeOP07(fixture.state,op07Request(prepared),deps);
 assert.equal(op07.ok,true,JSON.stringify(op07.details||op07));
 const op05=installOP05AfterHoneyStage(prepared);
 assert.equal(op05.ok,true,JSON.stringify(op05.details||op05));
 assert.equal(fixture.state.sectionalLayouts[0].honeyStack.excluders.length,2);
 prepareOP06Queens(fixture.state,deps);
 const oldLayout=fixture.state.sectionalLayouts[0],layout=structuredClone(oldLayout);
 layout.temporaryQueenIsolation=[];
 const itemMoves=oldLayout.temporaryQueenIsolation.map(plug=>({itemId:plug.itemId,location:{type:'storage',label:'Склад'}}));
 const op06=Coordinator.completeOP06(fixture.state,{userConfirmed:true,hiveId:'h1',techProcessId:'tp-h1',occurredAt:'2026-12-07T10:00:00.000Z',layout,itemMoves},deps);
 assert.equal(op06.ok,true,JSON.stringify(op06.details||op06));
 assert.equal(fixture.state.sectionalLayouts[0].honeyStack.bodyIds.length,2);
 assert.equal(fixture.state.sectionalLayouts[0].temporaryQueenIsolation.length,0);
 assert.deepEqual(Coordinator.inspect(fixture.state,deps),[]);
});

test('OP-07 supports the source sequence after OP-06 and preserves the completed OP-06 evidence',()=>{
 const prepared=prepareOP07Fixture(),{fixture,deps}=prepared;
 prepareOP06Queens(fixture.state,deps);
 const op06=Coordinator.completeOP06(fixture.state,{userConfirmed:true,noPlugsInstalledConfirmed:true,hiveId:'h1',techProcessId:'tp-h1',occurredAt:'2026-12-07T10:00:00.000Z',layout:structuredClone(fixture.state.sectionalLayouts[0]),itemMoves:[]},deps);
 assert.equal(op06.ok,true,JSON.stringify(op06.details||op06));
 const op07=Coordinator.completeOP07(fixture.state,op07Request(prepared,{timingMode:'AFTER_OP06',occurredAt:'2026-12-07T10:30:00.000Z'}),deps);
 assert.equal(op07.ok,true,JSON.stringify(op07.details||op07));
 assert.equal(fixture.state.sectionalTechProcesses[0].state.operations.find(row=>row.operationId==='OP-06').status,'DONE');
 assert.deepEqual(Coordinator.inspect(fixture.state,deps),[]);
});



test('OP-07 inspector verifies exact equipment movement identities and directions',()=>{
 const makeCompleted=()=>{
  const prepared=prepareOP07Fixture(),result=Coordinator.completeOP07(prepared.fixture.state,op07Request(prepared),prepared.deps);
  assert.equal(result.ok,true,JSON.stringify(result.details||result));
  return prepared;
 };
 const wrongEvent=makeCompleted(),wrongState=wrongEvent.fixture.state;
 const evidence=wrongState.sectionalTechProcesses[0].state.operations.find(row=>row.operationId==='OP-07').evidence.itemMovementEventIds;
 evidence[0].eventId=evidence[1].eventId;
 assert.ok(Coordinator.inspect(wrongState,wrongEvent.deps).some(error=>error.code==='sectional_tech_process_op07_item_movement_evidence_invalid'));

 const wrongDirection=makeCompleted(),directionState=wrongDirection.fixture.state;
 const directionEvidence=directionState.sectionalTechProcesses[0].state.operations.find(row=>row.operationId==='OP-07').evidence.itemMovementEventIds[0];
 const directionItem=directionState.equipmentInventory.items[directionEvidence.itemId];
 directionItem.events.find(event=>event.id===directionEvidence.eventId).type='moved';
 assert.ok(Coordinator.inspect(directionState,wrongDirection.deps).some(error=>error.code==='sectional_tech_process_op07_item_movement_evidence_invalid'));

 const missingBodyHistory=makeCompleted(),bodyState=missingBodyHistory.fixture.state;
 const honeyBody=bodyState.equipmentInventory.bodies.honey1;
 honeyBody.events=honeyBody.events.filter(event=>event.operationId!=='OP-07');
 assert.ok(Coordinator.inspect(bodyState,missingBodyHistory.deps).some(error=>error.code==='sectional_tech_process_op07_honey_body_history_invalid'));
});


test('OP-04 staged first-row to second-row sequence composes with OP-05, OP-06 and OP-07',()=>{
 const fixture=firstRowFixture(),deps=dependencies(),start=request(fixture);
 start.bodyStorageMoves=[{bodyId:'b2',storageLocation:'Склад'}];
 const started=Coordinator.completeOP04(fixture.state,start,deps);
 assert.equal(started.ok,true,JSON.stringify(started.details||started));
 const final=makeFixture(),secondRowMoves=final.layout.technicalConnections.flatMap(connection=>connection.openings.filter(opening=>['grid5','grid6','grid7','grid8'].includes(opening.itemId)).map(opening=>({
  itemId:opening.itemId,location:{type:'hive',hiveId:'h1',bodyId:opening.bodyId,openingId:opening.openingId}
 })));
 const secondRow=Coordinator.completeOP04SecondRow(fixture.state,{
  userConfirmed:true,hiveId:'h1',techProcessId:'tp-h1',occurredAt:'2026-11-18T10:00:00.000Z',
  layout:final.layout,addedBodyIds:['b2','b4','b6'],itemMoves:secondRowMoves
 },deps);
 assert.equal(secondRow.ok,true,JSON.stringify(secondRow.details||secondRow));

 const layout=structuredClone(fixture.state.sectionalLayouts[0]),itemMoves=[];
 layout.temporaryQueenIsolation=layout.technicalConnections.flatMap(connection=>connection.openings).map((opening,index)=>{
  const itemId='staged-mesh-'+(index+1);
  fixture.state.equipmentInventory.items[itemId]=item(itemId,'metalMeshPlug',{type:'storage',label:'Склад'});
  itemMoves.push({itemId,location:{type:'hive',hiveId:'h1',bodyId:opening.bodyId,openingId:opening.openingId}});
  return {itemId,bodyId:opening.bodyId,openingId:opening.openingId};
 });
 const op05=Coordinator.completeOP05(fixture.state,{
  userConfirmed:true,standLevelConfirmed:true,hiveId:'h1',techProcessId:'tp-h1',
  occurredAt:'2026-11-25T10:00:00.000Z',layout,itemMoves
 },deps);
 assert.equal(op05.ok,true,JSON.stringify(op05.details||op05));

 prepareOP06Queens(fixture.state,deps);
 const beforeRemoval=fixture.state.sectionalLayouts[0],op06Layout=structuredClone(beforeRemoval);
 op06Layout.temporaryQueenIsolation=[];
 const removalMoves=beforeRemoval.temporaryQueenIsolation.map(plug=>({itemId:plug.itemId,location:{type:'storage',label:'Склад'}}));
 const op06=Coordinator.completeOP06(fixture.state,{
  userConfirmed:true,hiveId:'h1',techProcessId:'tp-h1',occurredAt:'2026-12-07T10:00:00.000Z',
  layout:op06Layout,itemMoves:removalMoves
 },deps);
 assert.equal(op06.ok,true,JSON.stringify(op06.details||op06));

 const honeyBodyIds=['staged-honey-1','staged-honey-2'];
 for(const [index,id] of honeyBodyIds.entries()){
  fixture.state.equipmentInventory.bodies[id]={id,kind:'honey',condition:'good',spec:{profileId:PROFILE,framesPerBox:10},pairId:'staged-honey-pair',storageLocation:'Склад',events:[],frames:honeyFrames(id)};
  fixture.state.equipmentLabels.bodies[id]=index===0?'ААХ':'ААЦ';
 }
 fixture.state.equipmentInventory.items['staged-ex-left']=item('staged-ex-left','honeyQueenExcluder',{type:'storage',label:'Склад'});
 fixture.state.equipmentInventory.items['staged-ex-right']=item('staged-ex-right','honeyQueenExcluder',{type:'storage',label:'Склад'});
 const honeyLayout=structuredClone(fixture.state.sectionalLayouts[0]);
 for(const stack of honeyLayout.stacks){delete stack.coverItemId;delete stack.topRiserItemId}
 honeyLayout.honeyStack={purpose:'early',bodyIds:honeyBodyIds,excluders:[{side:'left',itemId:'staged-ex-left'},{side:'right',itemId:'staged-ex-right'}]};
 const honeyMoves=[];
 for(const stack of beforeRemoval.stacks){
  honeyMoves.push({itemId:stack.coverItemId,location:{type:'storage',label:'Склад'}});
  honeyMoves.push({itemId:stack.topRiserItemId,location:{type:'storage',label:'Склад'}});
 }
 honeyMoves.push({itemId:'staged-ex-left',location:{type:'hive',hiveId:'h1',footprint:[{bodyId:'b2',coverage:'FULL'},{bodyId:'b4',coverage:'HALF'}]}});
 honeyMoves.push({itemId:'staged-ex-right',location:{type:'hive',hiveId:'h1',footprint:[{bodyId:'b4',coverage:'HALF'},{bodyId:'b6',coverage:'FULL'}]}});
 const op07=Coordinator.completeOP07(fixture.state,{
  userConfirmed:true,hiveId:'h1',techProcessId:'tp-h1',occurredAt:'2026-12-07T10:30:00.000Z',
  timingMode:'AFTER_OP06',layout:honeyLayout,itemMoves:honeyMoves,bodyStorageMoves:[]
 },deps);
 assert.equal(op07.ok,true,JSON.stringify(op07.details||op07));
 assert.deepEqual(Coordinator.inspect(fixture.state,deps),[]);
 assert.deepEqual(fixture.state.sectionalTechProcesses[0].state.operations.map(row=>row.operationId),['OP-04','OP-05','OP-06','OP-07']);
});

test('OP-06 refuses all mesh removal when one split family has a still-unresolved confirmed absence',()=>{
 const prepared=prepareOP05Fixture(),{fixture,deps}=prepared;
 assert.equal(Coordinator.completeOP05(fixture.state,op05Request(prepared),deps).ok,true);
 prepareOP06Queens(fixture.state,deps);
 const process=fixture.state.sectionalTechProcesses[0],splitEvent=fixture.state.familyEvents.find(e=>e.id===process.state.operations.find(o=>o.operationId==='OP-04').evidence.familyEventId);
 assert.ok(splitEvent);
 fixture.state.familyEvents.push({id:'confirmed-missing-queen-p0',type:'queen_absence_confirmed',userConfirmed:true,
  outcome:'not_returned_from_mating_flight',familyId:splitEvent.resultFamilyIds[2],splitEventId:splitEvent.id,
  operationId:'OP-04',techProcessId:process.id,hiveId:process.hiveId,occurredAt:'2026-12-06T08:00:00.000Z'});
 const before=structuredClone(fixture.state);
 const result=Coordinator.completeOP06(fixture.state,op06Request(prepared),deps);
 assert.equal(result.ok,false);
 assert.equal(result.error,'op06_two_queen_mesh_removal_procedure_unconfirmed');
 assert.deepEqual(fixture.state,before);
 assert.equal(fixture.state.sectionalLayouts[0].temporaryQueenIsolation.length,8);
 assert.equal(process.state.operations.some(op=>op.operationId==='OP-06'),false);
});

test('OP-06 later than the day 20–21 orientation is allowed only with all three confirmed laying queens',()=>{
 const prepared=prepareOP05Fixture(),{fixture,deps}=prepared;
 assert.equal(Coordinator.completeOP05(fixture.state,op05Request(prepared),deps).ok,true);
 prepareOP06Queens(fixture.state,deps);
 const result=Coordinator.completeOP06(fixture.state,op06Request(prepared,{occurredAt:'2026-12-10T10:00:00.000Z'}),deps);
 assert.equal(result.ok,true,JSON.stringify(result));
 const stage=fixture.state.sectionalTechProcesses[0].state.operations.find(o=>o.operationId==='OP-06');
 assert.equal(stage.evidence.daysAfterDivision,23);
 assert.equal(stage.evidence.timingBeyondSourceOrientation,true);
 assert.equal(fixture.state.sectionalLayouts[0].temporaryQueenIsolation.length,0);
 assert.deepEqual(Coordinator.inspect(fixture.state,deps),[]);
});
test('OP-06 late observation cannot bypass missing laying evidence',()=>{
 const prepared=prepareOP05Fixture(),{fixture,deps}=prepared;
 assert.equal(Coordinator.completeOP05(fixture.state,op05Request(prepared),deps).ok,true);
 prepareOP06Queens(fixture.state,deps);
 fixture.state.queenEvents=fixture.state.queenEvents.filter(e=>!(e.type==='laying_observed'&&e.familyId==='f2'));
 const before=structuredClone(fixture.state);
 const result=Coordinator.completeOP06(fixture.state,op06Request(prepared,{occurredAt:'2026-12-10T10:00:00.000Z'}),deps);
 assert.equal(result.ok,false);
 assert.equal(result.error,'op06_queen_laying_observation_required');
 assert.deepEqual(fixture.state,before);
});

test('OP-03 physically swaps top and bottom brood bodies, keeps middle and original frames',()=>{
 const fixture=makeFixture(),original=structuredClone(fixture.state),deps=dependencies();
 const r=OP03Swap.applySwap(fixture.state,{hiveId:'h1',userConfirmed:true,occurredAt:'2026-11-17T10:00:00.000Z'},
  {...deps,now:'2026-11-17T10:01:00.000Z'});
 assert.equal(r.ok,true,JSON.stringify(r.details||r));
 assert.deepEqual(fixture.state,original,'pure preflight must not mutate real state');
 const before=original.sectionalLayouts[0].sections[0].broodBodyIds;
 const after=r.draft.sectionalLayouts[0].sections[0].broodBodyIds;
 assert.deepEqual(after,[before[2],before[1],before[0]]);
 assert.equal(r.draft.sectionalLayouts[0].sections[0].upperBroodBodyId,before[0]);
 assert.deepEqual(r.draft.equipmentInventory.bodies.b2,original.equipmentInventory.bodies.b2,'middle body not changed');
 assert.deepEqual(r.draft.equipmentInventory.bodies.b1.frames.map(x=>x.frameId),original.equipmentInventory.bodies.b1.frames.map(x=>x.frameId));
 assert.equal(r.draft.equipmentInventory.bodies.b1.frames[0].history.at(-1).action,'sectional_body_reordered');
 assert.equal(r.draft.equipmentInventory.bodies.b3.frames[0].history.at(-1).action,'sectional_body_reordered');
 assert.equal(r.draft.sectionalBodyReorders.length,1);
 assert.equal(r.draft.sectionalBodyReorders[0].userConfirmed,true);
 assert.deepEqual(OP03Swap.inspect(r.draft),[]);
 assert.deepEqual(Layout.inspect(r.draft),[]);
 assert.deepEqual(Lineage.inspect(r.draft),[]);
});
test('OP-03 refuses unconfirmed or duplicate swap and preserves all original state',()=>{
 const f=makeFixture(),deps=dependencies(),before=structuredClone(f.state);
 assert.equal(OP03Swap.applySwap(f.state,{hiveId:'h1',userConfirmed:false,occurredAt:NOW},{...deps,now:NOW}).ok,false);
 assert.deepEqual(f.state,before);
 let r=OP03Swap.applySwap(f.state,{hiveId:'h1',userConfirmed:true,occurredAt:NOW},{...deps,now:NOW});
 assert.equal(r.ok,true,JSON.stringify(r.details||r));
 const second=OP03Swap.applySwap(r.draft,{hiveId:'h1',userConfirmed:true,occurredAt:NOW},{...dependencies(),now:NOW});
 assert.equal(second.error,'optional_swap_already_recorded');
 assert.equal(OP03Swap.inspect(r.draft).length,0);
 const changed=structuredClone(f.state);changed.hives[0].profileId='farrar-6x6-v1';
 assert.equal(OP03Swap.applySwap(changed,{hiveId:'h1',userConfirmed:true,occurredAt:NOW},{...dependencies(),now:NOW}).error,'sectional_profile_required');
});
test('OP-03 fail-closed with partial body inventory, invalid timestamp or active split',()=>{
 const f=makeFixture();
 let modified=structuredClone(f.state);modified.equipmentInventory.bodies.b1.frames.pop();
 assert.equal(OP03Swap.applySwap(modified,{hiveId:'h1',userConfirmed:true,occurredAt:NOW},{...dependencies(),now:NOW}).error,'body_or_frame_inventory_invalid');
 modified=structuredClone(f.state);modified.sectionalTechProcesses.push({id:'tp',hiveId:'h1'});
 assert.equal(OP03Swap.applySwap(modified,{hiveId:'h1',userConfirmed:true,occurredAt:NOW},{...dependencies(),now:NOW}).error,'pre_split_only');
 assert.equal(OP03Swap.applySwap(f.state,{hiveId:'h1',userConfirmed:true,occurredAt:'2026-11-18T10:00:00.000Z'},{...dependencies(),now:NOW}).error,'operation_time_invalid');
});

test('OP-03 physical layout and complete frame histories survive isolated IndexedDB reopen',async()=>{
 const {IDBFactory}=await import('fake-indexeddb');
 const idb=new IDBFactory(),open=()=>new Promise((ok,no)=>{const q=idb.open('p1-op03-reopen',1);q.onupgradeneeded=()=>q.result.createObjectStore('main');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)});
 const f=makeFixture(),deps=dependencies();
 const result=OP03Swap.applySwap(f.state,{hiveId:'h1',userConfirmed:true,occurredAt:NOW},{...deps,now:'2026-11-17T10:01:00.000Z'});
 assert.equal(result.ok,true,JSON.stringify(result));
 let db=await open();
 await new Promise((ok,no)=>{const tx=db.transaction('main','readwrite');tx.objectStore('main').put(result.draft,'state');tx.oncomplete=ok;tx.onabort=()=>no(tx.error)});
 db.close();db=await open();
 const saved=await new Promise((ok,no)=>{const req=db.transaction('main','readonly').objectStore('main').get('state');req.onsuccess=()=>ok(req.result);req.onerror=()=>no(req.error)});
 assert.deepEqual(OP03Swap.inspect(saved),[]);
 assert.deepEqual(Layout.inspect(saved),[]);
 assert.deepEqual(saved.sectionalLayouts[0].sections[0].broodBodyIds,['b3','b2','b1']);
 assert.equal(saved.equipmentInventory.bodies.b1.frames[0].history.at(-1).action,'sectional_body_reordered');
 assert.equal(saved.equipmentInventory.bodies.b3.frames[0].history.at(-1).action,'sectional_body_reordered');
 db.close();
});
test('OP-03 UI integrates confirmed durable swap without enabling premature profile activation',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.match(html,/js\/sectional-op03-body-swap\.js/);
 assert.match(html,/id="sectionalOp03Confirmed"/);
 assert.match(html,/async function saveSectionalOp03\(\)/);
 assert.match(html,/PasekaSectionalOP03BodySwap\.inspect\(S\)/);
 assert.match(html,/PasekaSectionalOP03BodySwap\.inspect\(state\)/);
 assert.match(html,/sectionalBodyReorders:S\.sectionalBodyReorders\|\|\[\]/);
 assert.match(sw,/sectional-op03-body-swap\.js/);
});
