import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root={};
for(const name of ['sectional-season-body-manifest-v2.js','sectional-season-physical-executor-v2.js'])
 new Function('window',readFileSync(new URL('../js/'+name,import.meta.url),'utf8'))(root);
const plan=root.PasekaSectionalSeasonBodyManifestV2.stageManifest,
 exec=root.PasekaSectionalSeasonPhysicalExecutorV2.stage,PROFILE='sectional-multiqueen-v1';
const S=x=>structuredClone(x);
function setup(){
 const sections=['left','middle','right'].map((position,i)=>({
  id:'section-'+position,position,familyId:'f'+(i+1),
  broodBodyIds:['b'+(2*i+1),'b'+(2*i+2)],upperBroodBodyId:'b'+(2*i+2)
 }));
 const bodies={};
 for(const id of [...Array.from({length:8},(_,i)=>'b'+(i+1)),'h1','h2']){
  const honey=id[0]==='h',count=honey?10:6;
  bodies[id]={id,kind:honey?'honey':'brood',condition:'good',
   ...(honey?{pairId:'pair1'}:{}),
   spec:{profileId:PROFILE,framesPerBox:count},
   frames:Array.from({length:count},(_,i)=>({frameId:id+'-f'+i,history:[]})),
   events:[],
   ...(['b7','b8'].includes(id)?{storageLocation:'склад'}:{})
  };
 }
 const old={id:'layout',hiveId:'h',profileId:PROFILE,mode:'SIDE_BY_SIDE',
  sections,stacks:[],honeyStack:null};
 const state={meta:{revisionId:'r1',schemaVersion:15},
  hives:[{id:'h',profileId:PROFILE},{id:'foreign',profileId:PROFILE}],
  sectionalTechProcesses:[],sectionalSeasonCycles:[{id:'cycle',hiveId:'h',status:'ACTIVE'}],
  sectionalLayouts:[old,{id:'other',hiveId:'foreign',mode:'SINGLE_FAMILY',profileId:PROFILE,
   sections:[{id:'foreign-section',position:'combined',familyId:'other-family',broodBodyIds:['foreign-body']}]}],
  families:['f1','f2','f3'].map(id=>({id,hive:'h',currentQueenId:'q'+id,
   queenIdentityStatus:'identified',recordStatus:'active'})),
  queens:['f1','f2','f3'].map(id=>({id:'q'+id,familyId:id,status:'current'})),
  familyEvents:[],queenEvents:[],auditLog:[],
  equipmentInventory:{bodies:{...bodies,'foreign-body':{
   id:'foreign-body',kind:'brood',condition:'good',spec:{profileId:PROFILE,framesPerBox:6},
   frames:Array.from({length:6},(_,i)=>({frameId:'foreign-f'+i,history:[]})),events:[]}},
   items:{d1:{id:'d1',kind:'meshDiaphragm',condition:'good',location:{type:'storage',label:'склад'}},
    d2:{id:'d2',kind:'meshDiaphragm',condition:'good',location:{type:'storage',label:'склад'}}},
   events:[],itemEvents:[]}
 };
 const final={...S(old),mode:'SINGLE_FAMILY',sections:[{
  id:'combined',position:'combined',familyId:'merged',broodBodyIds:['b2','b4','b6'],upperBroodBodyId:'b6'
 }],stacks:[],honeyStack:null};
 const request={operationId:'OP-11',hiveId:'h',userConfirmedTargetLayout:true,
  userConfirmed:true,actualWorkConfirmed:true,actualMergeConfirmed:true,
  occurredAt:'2026-11-22T11:00:00Z',resultFamily:{id:'merged',hive:'h'},
  targetLayout:final,storageLocations:{b1:'склад',b3:'склад',b5:'склад'},itemMoves:[]};
 return {state,request};
}
test('OP11 canonicalizes every body movement from real source and target, preserving immutable originals',()=>{
 const f=setup(),before=S(f.state),req=S(f.request);
 const result=plan(f.state,req);
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.operationCompleted,false);assert.equal(result.stagedOnly,true);
 assert.deepEqual(f.state,before);assert.deepEqual(req,f.request);
 assert.equal(result.bodyMoves.length,6);
 assert.deepEqual(result.removedBodyIds,['b1','b3','b5']);
 for(const row of result.bodyMoves){
  assert.equal(row.from.hiveId,'h');
  assert.equal(row.from.layoutId,'layout');
  if(result.removedBodyIds.includes(row.bodyId))
   assert.deepEqual(row.to,{type:'storage',label:'склад'});
  else assert.equal(row.to.sectionId,'combined');
 }
 assert.equal(result.request.actualWorkConfirmed,true);
 assert.equal(result.request.bodyMoves.length,6);
});
test('OP11 canonical manifest is accepted by the existing physical executor and writes frame histories only to copy',()=>{
 const f=setup(),original=S(f.state),manifest=plan(f.state,f.request);
 assert.equal(manifest.ok,true);
 let i=0;
 const actor=exec(f.state,manifest.request,{
  now:'2026-11-23T11:00:00Z',makeId:()=> 'id-'+(++i),
  PasekaEquipmentItems:{place:()=>({ok:true})},
  PasekaFamilyLineage:{applyMerge:(draft,req)=>{
   for(const x of draft.families){x.recordStatus='historical';x.currentQueenId=null;x.queenIdentityStatus='unresolved';}
   for(const x of draft.queens)x.status='unknown';
   draft.families.push({...req.resultFamily,recordStatus:'active',currentQueenId:null,queenIdentityStatus:'unresolved'});
   draft.familyEvents.push({id:'merge',type:'merge',operationId:'OP-11',hiveId:'h',
    sourceFamilyIds:['f1','f2','f3'],resultFamilyIds:['merged']});return {ok:true};
  }}
 });
 assert.equal(actor.ok,true,JSON.stringify(actor));
 assert.deepEqual(f.state,original);
 assert.equal(actor.draft.equipmentInventory.events.length,6);
 assert.equal(actor.draft.families.find(x=>x.id==='merged').queenIdentityStatus,'unresolved');
 assert.ok(actor.draft.equipmentInventory.bodies.b1.frames.every(x=>x.history.at(-1).operationId==='OP-11'));
});
test('OP12 source-bound exact 2+1+1 and declared strong family',()=>{
 const f=setup();
 f.request.operationId='OP-12';f.request.strongestFamilyId='f1';
 f.request.actualIsolationConfirmed=true;
 f.request.targetLayout={...S(f.state.sectionalLayouts[0]),mode:'ALTERNATIVE_WINTERING_COLUMN',
  sections:[
   {id:'w1',position:'lower',familyId:'f1',broodBodyIds:['b1','b2'],upperBroodBodyId:'b2'},
   {id:'w2',position:'middle',familyId:'f2',broodBodyIds:['b3'],upperBroodBodyId:'b3'},
   {id:'w3',position:'upper',familyId:'f3',broodBodyIds:['b5'],upperBroodBodyId:'b5'}
  ],stacks:[]};
 f.request.storageLocations={b4:'склад',b6:'склад'};
 const result=plan(f.state,f.request);
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.deepEqual(result.removedBodyIds,['b4','b6']);
 assert.equal(result.request.bodyMoves.length,6);
 f.request.strongestFamilyId='f2';
 assert.equal(plan(f.state,f.request).error,'season_manifest_winter_2_1_1_and_strongest_invalid');
});
test('OP13 returns to three sections using two explicitly stored additional bodies',()=>{
 const f=setup();
 const old=f.state.sectionalLayouts[0];
 old.mode='ALTERNATIVE_WINTERING_COLUMN';
 old.sections=[
  {id:'w1',position:'lower',familyId:'f1',broodBodyIds:['b1','b2'],upperBroodBodyId:'b2'},
  {id:'w2',position:'middle',familyId:'f2',broodBodyIds:['b3'],upperBroodBodyId:'b3'},
  {id:'w3',position:'upper',familyId:'f3',broodBodyIds:['b5'],upperBroodBodyId:'b5'}
 ];
 f.state.equipmentInventory.bodies.b4.storageLocation='склад';
 f.state.equipmentInventory.bodies.b6.storageLocation='склад';
 f.request.operationId='OP-13';f.request.actualSeparationConfirmed=true;
 f.request.targetLayout={...S(old),mode:'SIDE_BY_SIDE',
  sections:[
   {id:'s1',position:'left',familyId:'f1',broodBodyIds:['b1','b2'],upperBroodBodyId:'b2'},
   {id:'s2',position:'middle',familyId:'f2',broodBodyIds:['b3','b4'],upperBroodBodyId:'b4'},
   {id:'s3',position:'right',familyId:'f3',broodBodyIds:['b5','b6'],upperBroodBodyId:'b6'}
  ]};
 f.request.storageLocations={};
 const p=plan(f.state,f.request);
 assert.equal(p.ok,true,JSON.stringify(p));
 assert.deepEqual(p.addedBodyIds,['b4','b6']);
 assert.equal(p.bodyMoves.length,6);
});
test('OP14 requires all honey and brood bodies to be accounted for, with explicit storage',()=>{
 const f=setup(),old=f.state.sectionalLayouts[0];
 old.honeyStack={purpose:'early',bodyIds:['h1','h2'],excluders:[]};
 f.request.operationId='OP-14';
 f.request.targetLayout={...S(f.request.targetLayout),mode:'SINGLE_FAMILY',honeyStack:null};
 const failed=plan(f.state,f.request);
 assert.equal(failed.error,'season_manifest_storage_keys_do_not_match_removed_bodies');
 f.request.storageLocations={...f.request.storageLocations,h1:'склад мёда',h2:'склад мёда'};
 const p=plan(f.state,f.request);
 assert.equal(p.ok,true,JSON.stringify(p));
 assert.equal(p.bodyMoves.length,8);
 assert.deepEqual(p.removedBodyIds,['b1','b3','b5','h1','h2']);
});
test('bad inputs cannot fabricate physical placement or ownership',()=>{
 const f=setup();
 const damages=[
  r=>{delete r.storageLocations.b1},
  r=>{r.storageLocations.b1=''},
  r=>{r.storageLocations.foreign='склад'},
  r=>{r.userConfirmedTargetLayout=false},
  r=>{r.targetLayout.profileId='farrar'},
  r=>{r.targetLayout.sections[0].broodBodyIds.push('foreign-body')},
  r=>{r.targetLayout.sections[0].broodBodyIds=['b2','b2','b6']},
  r=>{r.targetLayout.sections[0].broodBodyIds=['b2','b4','b7']},
  r=>{r.itemMoves=[{itemId:'missing',location:{type:'storage',label:'склад'}}]},
  r=>{r.itemMoves=[{itemId:'d1',location:{type:'hive',hiveId:'foreign'}}]},
  r=>{r.itemMoves=[{itemId:'d1',location:{type:'storage',label:'склад'}},{itemId:'d1',location:{type:'storage',label:'склад'}}]}
 ];
 for(const [index,damage] of damages.entries()){
  const r=S(f.request);damage(r);
  assert.equal(plan(f.state,r).ok,false,'failure case '+index);
 }
});
test('source body and frame integrity are prerequisites; no inferred missing IDs',()=>{
 const f=setup();
 for(const change of [
  s=>{s.equipmentInventory.bodies.b2.condition='broken'},
  s=>{s.equipmentInventory.bodies.b2.spec.framesPerBox=10},
  s=>{s.equipmentInventory.bodies.b2.frames.pop()},
  s=>{s.equipmentInventory.bodies.b2.frames[0].history=null},
  s=>{s.equipmentInventory.bodies.b2.kind='honey'},
  s=>{s.sectionalLayouts[0].sections[1].broodBodyIds.push('b2')}
 ]){
  const s=S(f.state);change(s);assert.equal(plan(s,f.request).ok,false);
 }
});


test('OP11 cannot silently erase old lids, risers and bottoms without explicit item movements',()=>{
 const f=setup(),old=f.state.sectionalLayouts[0],target=f.request.targetLayout;
 const existing=new Set();
 for(const name of ['left','middle','right']){
  const id='bottom-'+name,cover='cover-'+name,riser='riser-'+name;
  old.stacks.push({id:'stack-'+name,bottomItemId:id,coverItemId:cover,topRiserItemId:riser});
  for(const [key,kind] of [[id,'bottom'],[cover,'cover'],[riser,'topRiser']]){
   existing.add(key);
   f.state.equipmentInventory.items[key]={id:key,kind,condition:'good',
    location:{type:'hive',hiveId:'h',stackId:'stack-'+name}};
  }
 }
 target.stacks=[{id:'one-stack',bottomItemId:'bottom-left'}];
 const required=[...existing];
 assert.equal(plan(f.state,f.request).error,'season_manifest_item_moves_incomplete_or_unrelated');
 f.request.itemMoves=required.map(id=>id==='bottom-left'?{
  itemId:id,location:{type:'hive',hiveId:'h',stackId:'one-stack'}
 }:{itemId:id,location:{type:'storage',label:'склад'}});
 const result=plan(f.state,f.request);
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.requiredItemMoveIds.length,9);
 f.request.itemMoves[1].location={type:'hive',hiveId:'foreign'};
 assert.equal(plan(f.state,f.request).ok,false);
});
test('OP12 requires both real stored diaphragms installed at witnessed target positions',()=>{
 const f=setup();f.request.operationId='OP-12';f.request.strongestFamilyId='f1';
 f.request.targetLayout={...S(f.state.sectionalLayouts[0]),mode:'ALTERNATIVE_WINTERING_COLUMN',
  sections:[
   {id:'w1',position:'lower',familyId:'f1',broodBodyIds:['b1','b2'],upperBroodBodyId:'b2'},
   {id:'w2',position:'middle',familyId:'f2',broodBodyIds:['b3'],upperBroodBodyId:'b3'},
   {id:'w3',position:'upper',familyId:'f3',broodBodyIds:['b5'],upperBroodBodyId:'b5'}
  ],stacks:[],meshDiaphragms:[{itemId:'d1',positionLabel:'lower-middle'},{itemId:'d2',positionLabel:'middle-upper'}]};
 f.request.storageLocations={b4:'склад',b6:'склад'};
 assert.equal(plan(f.state,f.request).error,'season_manifest_item_moves_incomplete_or_unrelated');
 f.request.itemMoves=['d1','d2'].map((itemId,i)=>({
  itemId,location:{type:'hive',hiveId:'h',
   positionLabel:i===0?'lower-middle':'middle-upper'}
 }));
 assert.equal(plan(f.state,f.request).ok,true);
 f.request.itemMoves[1].location.positionLabel='wrong';
 assert.equal(plan(f.state,f.request).error,'season_manifest_item_move_invalid');
 f.request.itemMoves[1].location.positionLabel='middle-upper';
 f.state.equipmentInventory.items.d2.location={type:'hive',hiveId:'foreign'};
 assert.equal(plan(f.state,f.request).error,'season_manifest_item_move_invalid');
});
test('OP13 cannot forget to store removed diaphragms and move two registered bottoms',()=>{
 const f=setup(),layout=f.state.sectionalLayouts[0];
 layout.mode='ALTERNATIVE_WINTERING_COLUMN';
 layout.sections=[
  {id:'w1',position:'lower',familyId:'f1',broodBodyIds:['b1','b2'],upperBroodBodyId:'b2'},
  {id:'w2',position:'middle',familyId:'f2',broodBodyIds:['b3'],upperBroodBodyId:'b3'},
  {id:'w3',position:'upper',familyId:'f3',broodBodyIds:['b5'],upperBroodBodyId:'b5'}
 ];
 layout.meshDiaphragms=[{itemId:'d1'},{itemId:'d2'}];
 for(const id of ['d1','d2'])f.state.equipmentInventory.items[id].location={type:'hive',hiveId:'h'};
 for(const id of ['b4','b6'])f.state.equipmentInventory.bodies[id].storageLocation='склад';
 for(const id of ['middle','right'])
  f.state.equipmentInventory.items['bottom-'+id]={
   id:'bottom-'+id,kind:'bottom',condition:'good',location:{type:'storage',label:'склад'}};
 f.request.operationId='OP-13';
 f.request.targetLayout={...S(layout),mode:'SIDE_BY_SIDE',
  sections:[
   {id:'l',position:'left',familyId:'f1',broodBodyIds:['b1','b2'],upperBroodBodyId:'b2'},
   {id:'m',position:'middle',familyId:'f2',broodBodyIds:['b3','b4'],upperBroodBodyId:'b4'},
   {id:'r',position:'right',familyId:'f3',broodBodyIds:['b5','b6'],upperBroodBodyId:'b6'}
  ],meshDiaphragms:[],stacks:[{id:'stack-middle',bottomItemId:'bottom-middle'},
   {id:'stack-right',bottomItemId:'bottom-right'}]};
 f.request.storageLocations={};
 f.request.itemMoves=[
  {itemId:'d1',location:{type:'storage',label:'склад'}},
  {itemId:'d2',location:{type:'storage',label:'склад'}},
  {itemId:'bottom-middle',location:{type:'hive',hiveId:'h',stackId:'stack-middle'}},
  {itemId:'bottom-right',location:{type:'hive',hiveId:'h',stackId:'stack-right'}}
 ];
 const r=plan(f.state,f.request);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.requiredItemMoveIds.length,4);
 assert.equal(r.addedBodyIds.length,2);
 f.request.itemMoves.pop();
 assert.equal(plan(f.state,f.request).ok,false);
});
test('OP14 removal of both installed large excluders requires two confirmed storage moves',()=>{
 const f=setup();f.request.operationId='OP-14';
 f.state.sectionalLayouts[0].honeyStack={purpose:'early',bodyIds:['h1','h2'],
  excluders:[{itemId:'x1',side:'left'},{itemId:'x2',side:'right'}]};
 f.request.targetLayout={...S(f.request.targetLayout),mode:'SINGLE_FAMILY',honeyStack:null};
 f.request.storageLocations={b1:'склад',b3:'склад',b5:'склад',h1:'склад мёда',h2:'склад мёда'};
 for(const id of ['x1','x2'])f.state.equipmentInventory.items[id]={
  id,kind:'honeyQueenExcluder',condition:'good',location:{type:'hive',hiveId:'h'}
 };
 assert.equal(plan(f.state,f.request).error,'season_manifest_item_moves_incomplete_or_unrelated');
 f.request.itemMoves=['x1','x2'].map(itemId=>({itemId,location:{type:'storage',label:'склад'}}));
 const r=plan(f.state,f.request);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.deepEqual(r.requiredItemMoveIds,['x1','x2']);
});
