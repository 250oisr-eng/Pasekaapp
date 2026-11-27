import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { indexedDB } from 'fake-indexeddb';

const appWindow={};
for(const path of [
 '../js/equipment-labels.js',
 '../js/equipment-inventory.js',
 '../js/equipment-items.js',
 '../js/sectional-physical-layout.js',
 '../js/family-lineage.js',
 '../js/sectional-operation-coordinator.js',
 '../js/sectional-stock-pairs.js',
 '../js/sectional-honey-persistence.js'
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


// Fixture copied from the OP07 integration fixture at e2fed6fa; isolated,
// no working-apiary data, no production DB.
const Stock=appWindow.PasekaSectionalStockPairs,Persistence=appWindow.PasekaSectionalHoneyPersistence;
const date=n=>'2026-11-'+n+'T10:00:00.000Z';
function setupFour(){
 const p=prepareOP07Fixture(),s=p.fixture.state;
 p.layout.honeyStack.purpose='early';
 for(const [i,id] of ['honey3','honey4'].entries()){
  s.equipmentInventory.bodies[id]={id,kind:'honey',condition:'good',spec:{profileId:PROFILE,framesPerBox:10},pairId:'honey-pair-2',storageLocation:'Склад',events:[],frames:honeyFrames(id)};
  s.equipmentLabels.bodies[id]=i===0?'ААЧ':'ААШ';
 }
 p.layout.honeyStack.bodyIds.push('honey3','honey4');
 const result=Coordinator.completeOP07(s,op07Request(p),p.deps);
 assert.equal(result.ok,true,JSON.stringify(result));s.meta.revisionId='r0';s.extractions=[];s.records=[];
 for(const id of p.layout.honeyStack.bodyIds)for(const f of s.equipmentInventory.bodies[id].frames)f.status='sealed';
 p.deps.PasekaSectionalOperationCoordinator=Coordinator;
 return p;
}
function extract(p,state,at=date(18)){
 const old=state.sectionalLayouts[0],target=structuredClone(old),op=state.sectionalTechProcesses[0].state.operations.find(o=>o.operationId==='OP-07');
 const items=state.equipmentInventory.items;
 const itemMoves=old.honeyStack.excluders.map(e=>({itemId:e.itemId,location:{type:'storage',label:'Склад'}}));
 for(const stack of target.stacks){
  const pick=kind=>op.evidence.removedStackAccessories.filter(x=>x.kind===kind).find(x=>items[x.itemId].events.some(e=>e.type==='moved_to_storage'&&e.from?.stackId===stack.id)).itemId;
  stack.coverItemId=pick('cover');stack.topRiserItemId=pick('topRiser');
  for(const id of [stack.coverItemId,stack.topRiserItemId])itemMoves.push({itemId:id,location:{type:'hive',hiveId:'h1',stackId:stack.id}});
 }
 delete target.honeyStack;
 return Coordinator.prepareFullHoneyPhysicalTransition(state,{userConfirmed:true,expectedRevisionId:state.meta.revisionId,kind:'extract',hiveId:'h1',techProcessId:'tp-h1',occurredAt:at,kilograms:22,layout:target,itemMoves,bodyStorageMoves:old.honeyStack.bodyIds.map(bodyId=>({bodyId,storageLocation:'Склад'}))},p.deps);
}
function install(p,state,ids,at=date(20)){
 const target=structuredClone(state.sectionalLayouts[0]),itemMoves=[];
 for(const stack of target.stacks){for(const id of [stack.coverItemId,stack.topRiserItemId])itemMoves.push({itemId:id,location:{type:'storage',label:'Склад'}});delete stack.coverItemId;delete stack.topRiserItemId;}
 target.honeyStack={purpose:'main',bodyIds:ids,excluders:structuredClone(p.layout.honeyStack.excluders)};
 for(const row of p.itemMoves.filter(x=>x.location.type==='hive'))itemMoves.push(structuredClone(row));
 return Coordinator.prepareFullHoneyPhysicalTransition(state,{userConfirmed:true,expectedRevisionId:state.meta.revisionId,kind:'install',hiveId:'h1',techProcessId:'tp-h1',occurredAt:at,layout:target,itemMoves,bodyStorageMoves:[]},p.deps);
}
test('owner full cycle: early four, zero, regroup different bodies, two, zero; preserve original OP07',()=>{
 const p=setupFour(),s=p.fixture.state,original=structuredClone(s),originalEvidence=structuredClone(s.sectionalTechProcesses[0].state.operations.find(x=>x.operationId==='OP-07'));
 const blocked=structuredClone(s);blocked.equipmentInventory.bodies.honey4.frames[9].status='nectar';
 const blockedBefore=structuredClone(blocked);assert.equal(extract(p,blocked).ok,false);assert.deepEqual(blocked,blockedBefore);
 const removed=extract(p,s);assert.equal(removed.ok,true,JSON.stringify(removed));assert.deepEqual(s,original);
 assert.equal(removed.draft.sectionalLayouts[0].honeyStack,undefined);assert.equal(removed.draft.extractions[0].items[0].frameIds.length,40);
 const regroup=Stock.prepare(removed.draft,{userConfirmed:true,expectedRevisionId:'r0',occurredAt:date(19),bodyIds:['honey1','honey3']},p.deps);
 assert.equal(regroup.ok,true,JSON.stringify(regroup));
 const installed=install(p,regroup.draft,['honey1','honey3']);assert.equal(installed.ok,true,JSON.stringify(installed));
 assert.deepEqual(installed.draft.sectionalLayouts[0].honeyStack.bodyIds,['honey1','honey3']);
 for(const id of ['honey1','honey3'])for(const f of installed.draft.equipmentInventory.bodies[id].frames)f.status='sealed';
 const final=extract(p,installed.draft,date(21));assert.equal(final.ok,true,JSON.stringify(final));
 assert.equal(final.draft.extractions.length,2);assert.equal(final.draft.extractions[1].items[0].frameIds.length,20);
 assert.deepEqual(final.draft.sectionalTechProcesses[0].state.operations.find(x=>x.operationId==='OP-07'),originalEvidence);
 assert.deepEqual(Coordinator.inspect(JSON.parse(JSON.stringify(final.draft)),p.deps),[]);
 const tamper=structuredClone(final.draft);tamper.sectionalTechProcesses[0].state.honeyTransitions[0].frameEvents.pop();
 assert.ok(Coordinator.inspect(tamper,p.deps).length);
});
test('stock regroup rejects an installed body and never edits input',()=>{
 const p=setupFour(),s=p.fixture.state,before=structuredClone(s);
 const result=Stock.prepare(s,{userConfirmed:true,expectedRevisionId:'r0',occurredAt:date(19),bodyIds:['honey1','honey2']},p.deps);
 assert.equal(result.ok,false);assert.deepEqual(s,before);
});
function openDB(){return new Promise((resolve,reject)=>{const q=indexedDB.open('paseka-b07-synthetic',1);q.onupgradeneeded=()=>q.result.createObjectStore('main');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}
function read(db){return new Promise((resolve,reject)=>{const q=db.transaction('main').objectStore('main').get('state');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}
function cas(db,state,expected){return new Promise((resolve,reject)=>{const tx=db.transaction('main','readwrite'),store=tx.objectStore('main'),q=store.get('state');let prior;q.onsuccess=()=>{prior=q.result;if((prior?.meta?.revisionId||null)!==expected){tx.abort();return;}store.put(state,'state');};tx.oncomplete=()=>resolve(prior);tx.onabort=()=>reject(Error('CAS abort'));tx.onerror=()=>reject(tx.error);});}
test('runtime CAS writes detached full harvest to isolated IndexedDB, rejects stale revision and reports backup failures separately',async()=>{
 const p=setupFour(),base=p.fixture.state,db=await openDB();
 try{
  await cas(db,base,null);let current=structuredClone(base),revision='r0',chain=Promise.resolve(),backups=0;
  const adapter={withExclusiveMutation:fn=>fn(),enqueue:fn=>{const task=chain.then(fn,fn);chain=task.catch(()=>{});return task;},getState:()=>current,getPersistedRevision:()=>revision,isWriteReady:()=>true,validate:s=>Coordinator.inspect(s,p.deps),newRevision:()=> 'r1',buildSnapshot:s=>structuredClone(s),writeMainIfUnchanged:(s,e)=>cas(db,s,e),writeAutoBackup:async()=>{backups++;return false;},publishCommitted:(s,r)=>{current=structuredClone(s);revision=r;}};
  const candidate=extract(p,base);assert.equal(candidate.ok,true,JSON.stringify(candidate));
  const commit=Persistence.createRuntimeCommitter(adapter),result=await commit(candidate,base);
  assert.equal(result.ok,true,JSON.stringify(result));assert.deepEqual(result.warnings,['backup_not_confirmed']);assert.equal(backups,1);
  assert.equal((await read(db)).meta.revisionId,'r1');assert.equal((await read(db)).extractions.length,1);
  assert.equal((await commit(candidate,base)).ok,false);assert.equal((await read(db)).extractions.length,1);
 }finally{db.close();}
});
