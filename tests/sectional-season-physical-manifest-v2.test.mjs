import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};
new Function('window',readFileSync(new URL('../js/sectional-season-physical-manifest-v2.js',import.meta.url),'utf8'))(w);
const plan=w.PasekaSectionalSeasonPhysicalManifestV2.plan,profile='sectional-multiqueen-v1';
function base(){
 const positions=['left','middle','right'];
 const sections=positions.map((position,i)=>({
  id:position,position,familyId:'f'+(i+1),
  broodBodyIds:['b'+(i*2+1),'b'+(i*2+2)],upperBroodBodyId:'b'+(i*2+2)
 }));
 const stacks=positions.map(position=>({
  id:'stack-'+position,position,sectionIds:[position],bottomItemId:'bottom-'+position
 }));
 const b=Object.fromEntries(Array.from({length:6},(_,i)=>{
  const id='b'+(i+1);
  return [id,{id,kind:'brood',condition:'good',spec:{profileId:profile,framesPerBox:6},
   frames:Array.from({length:6},(_,j)=>({frameId:id+'-f'+(j+1),history:[]})),events:[]}];
 }));
 const items=Object.fromEntries(positions.map(position=>{
  const id='bottom-'+position;return [id,{id,kind:'bottom',condition:'good',
   location:{type:'hive',hiveId:'h',stackId:'stack-'+position}}];
 }));
 for(const [id,positionLabel]of [['d1','lower-middle'],['d2','middle-upper']]){
  items[id]={id,kind:'meshDiaphragm',condition:'good',
   location:{type:'storage',label:'склад'}};
 }
 return {
  meta:{revisionId:'revision1'},hives:[{id:'h',profileId:profile}],
  sectionalSeasonCycles:[{id:'cy',hiveId:'h',status:'ACTIVE'}],
  sectionalLayouts:[{id:'layout',hiveId:'h',profileId:profile,mode:'SIDE_BY_SIDE',
   sections,stacks}],
  equipmentInventory:{bodies:b,items},families:[1,2,3].map(i=>({id:'f'+i,hive:'h'}))
 };
}
const winterTarget=()=>({
 id:'layout',hiveId:'h',profileId:profile,mode:'ALTERNATIVE_WINTERING_COLUMN',
 sections:[
  {id:'lower',position:'lower',familyId:'f1',broodBodyIds:['b1','b2'],upperBroodBodyId:'b2'},
  {id:'middle',position:'middle',familyId:'f2',broodBodyIds:['b3'],upperBroodBodyId:'b3'},
  {id:'upper',position:'upper',familyId:'f3',broodBodyIds:['b5'],upperBroodBodyId:'b5'}
 ],
 stacks:[{id:'stack-left',position:'column',sectionIds:['lower','middle','upper'],
  bottomItemId:'bottom-left',boundaries:['lower-middle','middle-upper']}],
 meshDiaphragms:[{itemId:'d1',positionLabel:'lower-middle'},{itemId:'d2',positionLabel:'middle-upper'}]
});
function mergeTarget(family='merged',ids=['b2','b4','b6']){
 return {id:'layout',hiveId:'h',profileId:profile,mode:'SINGLE_FAMILY',
  purpose:'primary_wintering',sections:[{id:'combined',position:'combined',
   familyId:family,broodBodyIds:ids,upperBroodBodyId:ids.at(-1)}],
  stacks:[{id:'stack-left',position:'combined',sectionIds:['combined'],
   bottomItemId:'bottom-left'}]};
}
function request(operationId,target,extra={}){
 return {operationId,hiveId:'h',userConfirmed:true,
  actualWorkConfirmed:true,occurredAt:'2026-11-23T10:00:00Z',
  targetLayout:target,itemDestinations:{},storageLocations:{},
  confirmedBodyIds:[],confirmedItemIds:[],...extra};
}
function finalize(state,req){
 // Collect proof IDs, but never auto-confirm in the actual app. This helper
 // belongs exclusively to isolated synthetic test fixtures.
 let r=plan(state,req);
 if(r.error==='manifest_body_movements_not_individually_confirmed'){
  req.confirmedBodyIds=r.details.requiredBodyIds;
  r=plan(state,req);
 }
 if(r.error==='manifest_item_movements_not_individually_confirmed'){
  req.confirmedItemIds=r.details.requiredItemIds;
  r=plan(state,req);
 }
 return r;
}
test('OP11 derives 6 exact brood body moves and storage of 2 existing bottoms without choosing queen',()=>{
 const state=base(),before=structuredClone(state),req=request('OP-11',mergeTarget(),{
  actualMergeConfirmed:true,resultFamily:{id:'merged',hive:'h'},
  storageLocations:{b1:'склад',b3:'склад',b5:'склад'},
  itemDestinations:{
   'bottom-middle':{type:'storage',label:'склад'},
   'bottom-right':{type:'storage',label:'склад'}
  }
 });
 const result=finalize(state,req);
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.previewOnly,true);assert.equal(result.readyForPersistence,false);
 assert.equal(result.request.resultFamily.currentQueenId,undefined);
 assert.equal(result.request.bodyMoves.length,6);
 assert.deepEqual(result.request.bodyMoves.filter(x=>x.to.type==='storage').map(x=>x.bodyId),['b1','b3','b5']);
 assert.deepEqual(result.request.itemMoves.map(x=>x.itemId),['bottom-middle','bottom-right']);
 assert.equal(result.request.sourceRevisionId,'revision1');
 assert.deepEqual(state,before);
});
test('OP12 2+1+1 requires real diaphragm IDs, declared positions and unused upper bodies in storage',()=>{
 const state=base(),req=request('OP-12',winterTarget(),{
  actualIsolationConfirmed:true,storageLocations:{b4:'склад',b6:'склад'},
  itemDestinations:{
   'bottom-middle':{type:'storage',label:'склад'},
   'bottom-right':{type:'storage',label:'склад'},
   d1:{type:'hive',hiveId:'h',stackId:'stack-left',positionLabel:'lower-middle'},
   d2:{type:'hive',hiveId:'h',stackId:'stack-left',positionLabel:'middle-upper'}
  }
 });
 const r=finalize(state,req);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.request.bodyMoves.length,6);
 assert.deepEqual(r.request.itemMoves.map(x=>x.itemId),['bottom-middle','bottom-right','d1','d2']);
 assert.deepEqual(r.request.storageLocations,{b4:'склад',b6:'склад'});
 const wrong=structuredClone(req);wrong.itemDestinations.d1.positionLabel='wrong';
 assert.equal(plan(state,wrong).error,'manifest_installed_item_destination_missing_or_wrong');
});
test('OP13 rejects unregistered or already installed extra bodies, accepts genuine reverse winter inventory',()=>{
 const state=base(),winter=winterTarget();
 state.sectionalLayouts=[winter];
 for(const id of ['b4','b6'])state.equipmentInventory.bodies[id].storageLocation='склад';
 for(const id of ['bottom-middle','bottom-right'])
  state.equipmentInventory.items[id].location={type:'storage',label:'склад'};
 for(const [id,positionLabel]of [['d1','lower-middle'],['d2','middle-upper']])
  state.equipmentInventory.items[id].location={type:'hive',hiveId:'h',
   stackId:'stack-left',positionLabel};
 const tgt=base().sectionalLayouts[0];
 const req=request('OP-13',tgt,{
  actualSeparationConfirmed:true,
  itemDestinations:{
   'bottom-middle':{type:'hive',hiveId:'h',stackId:'stack-middle'},
   'bottom-right':{type:'hive',hiveId:'h',stackId:'stack-right'},
   d1:{type:'storage',label:'склад'},d2:{type:'storage',label:'склад'}
  }
 });
 const r=finalize(state,req);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.deepEqual(r.request.itemMoves.map(x=>x.itemId),['bottom-middle','bottom-right','d1','d2']);
 assert.equal(r.request.bodyMoves.length,6);
 delete state.equipmentInventory.bodies.b4.storageLocation;
 assert.equal(plan(state,req).error,'manifest_body_not_available_from_storage');
});
test('OP14 uses only installed early honey, source excluders and confirmed 3-4 upper brood bodies',()=>{
 const state=base();
 const honey=id=>({id,kind:'honey',condition:'good',spec:{profileId:profile,framesPerBox:10},
  frames:Array.from({length:10},(_,i)=>({frameId:id+'-f'+i,history:[]}))});
 for(const id of ['h1','h2'])state.equipmentInventory.bodies[id]=honey(id);
 state.sectionalLayouts[0].honeyStack={purpose:'early',bodyIds:['h1','h2'],
  excluders:[{itemId:'x1',side:'left'},{itemId:'x2',side:'right'}]};
 for(const [id,footprint]of [['x1',[{bodyId:'b2',coverage:'FULL'},{bodyId:'b4',coverage:'HALF'}]],
  ['x2',[{bodyId:'b4',coverage:'HALF'},{bodyId:'b6',coverage:'FULL'}]]])
  state.equipmentInventory.items[id]={id,kind:'honeyQueenExcluder',condition:'good',
   location:{type:'hive',hiveId:'h',footprint}};
 const req=request('OP-14',mergeTarget('merged'),{
  actualMergeConfirmed:true,earlyHoneyHarvestConfirmed:true,
  actualDiaphragmsRemovedConfirmed:true,familiesOnSeparateBottomsConfirmed:true,
  resultFamily:{id:'merged',hive:'h'},
  storageLocations:{b1:'склад',b3:'склад',b5:'склад',h1:'склад',h2:'склад'},
  itemDestinations:{
   'bottom-middle':{type:'storage',label:'склад'},
   'bottom-right':{type:'storage',label:'склад'},
   x1:{type:'storage',label:'склад'},x2:{type:'storage',label:'склад'}
  }
 });
 const r=finalize(state,req);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.request.bodyMoves.length,8);
 assert.deepEqual(r.request.itemMoves.map(x=>x.itemId),['bottom-middle','bottom-right','x1','x2']);
 const fake=structuredClone(state);fake.sectionalLayouts[0].honeyStack.purpose='main';
 assert.equal(plan(fake,req).error,'manifest_op14_actual_early_honey_history_required');
});
test('fail closed on unconfirmed individual moves, unknown location, repeated body, another hive and forced queen',()=>{
 const state=base(),req=request('OP-11',mergeTarget(),{
  actualMergeConfirmed:true,resultFamily:{id:'merged',hive:'h'},
  storageLocations:{b1:'склад',b3:'склад',b5:'склад'},
  itemDestinations:{'bottom-middle':{type:'storage',label:'склад'},
   'bottom-right':{type:'storage',label:'склад'}}
 });
 assert.equal(plan(state,req).error,'manifest_body_movements_not_individually_confirmed');
 const withConfirmed=structuredClone(req);withConfirmed.confirmedBodyIds=['b1','b2','b3','b4','b5','b6'];
 assert.equal(plan(state,withConfirmed).error,'manifest_item_movements_not_individually_confirmed');
 const missing=structuredClone(withConfirmed);missing.storageLocations.b3='';
 assert.equal(plan(state,missing).error,'manifest_missing_real_body_storage_location');
 const duplicate=structuredClone(withConfirmed);duplicate.targetLayout.sections[0].broodBodyIds=['b2','b2','b6'];
 assert.equal(plan(state,duplicate).error,'manifest_duplicate_or_invalid_physical_id');
 const queen=structuredClone(req);queen.resultFamily.currentQueenId='q1';
 assert.equal(finalize(state,queen).error,'manifest_survivor_queen_must_remain_unknown');
 const foreign=structuredClone(state);foreign.hives.push({id:'other',profileId:profile});
 foreign.sectionalLayouts.push({id:'other-layout',hiveId:'other',profileId:profile,
  mode:'SIDE_BY_SIDE',sections:[{id:'other',position:'left',broodBodyIds:['b2']}],stacks:[]});
 assert.equal(plan(foreign,req).error,'manifest_body_or_frame_inventory_invalid');
});
