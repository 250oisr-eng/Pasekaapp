import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};new Function('window',readFileSync(new URL('../js/sectional-season-physical-executor-v2.js',import.meta.url),'utf8'))(w);
const stage=w.PasekaSectionalSeasonPhysicalExecutorV2.stage,AT='2026-11-22T10:00:00Z';
function fixture(){
 const source={id:'l1',hiveId:'h1',profileId:'sectional-multiqueen-v1',mode:'SIDE_BY_SIDE',sections:['left','middle','right'].map((position,i)=>({id:position,position,familyId:'f'+(i+1),broodBodyIds:['b'+(i*2+1),'b'+(i*2+2)],upperBroodBodyId:'b'+(i*2+2)})),stacks:[]};
 const bodies=Object.fromEntries(Array.from({length:6},(_,i)=>{const id='b'+(i+1);return [id,{id,kind:'brood',frames:[{frameId:id+'f',history:[]}],events:[]}]}));
 const state={meta:{revisionId:'rev1'},sectionalTechProcesses:[],sectionalSeasonCycles:[{id:'cycle1',hiveId:'h1',status:'ACTIVE'}],sectionalLayouts:[source],families:['f1','f2','f3'].map(id=>({id,hive:'h1',currentQueenId:'q'+id,queenIdentityStatus:'identified',recordStatus:'active'})),queens:['f1','f2','f3'].map(id=>({id:'q'+id,familyId:id,status:'current'})),familyEvents:[],queenEvents:[],equipmentInventory:{bodies,items:{},events:[],itemEvents:[]},auditLog:[]};
 const target={id:'l1',hiveId:'h1',profileId:'sectional-multiqueen-v1',mode:'SINGLE_FAMILY',sections:[{id:'combined',position:'combined',familyId:'f-result',broodBodyIds:['b2','b4','b6']}],stacks:[]};
 const oldIds=source.sections.flatMap(x=>x.broodBodyIds),newIds=target.sections[0].broodBodyIds;
 const request={operationId:'OP-11',hiveId:'h1',occurredAt:AT,userConfirmed:true,actualWorkConfirmed:true,actualMergeConfirmed:true,resultFamily:{id:'f-result',hive:'h1'},targetLayout:target,itemMoves:[],bodyMoves:oldIds.map((bodyId,index)=>({bodyId,from:{type:'sectional',hiveId:'h1',layoutId:'l1',bodyRole:'brood',sectionId:source.sections[Math.floor(index/2)].id,position:source.sections[Math.floor(index/2)].position},to:newIds.includes(bodyId)?{type:'sectional',hiveId:'h1',layoutId:'l1',bodyRole:'brood',sectionId:'combined',position:'combined'}:{type:'storage',label:'склад'}})),storageLocations:{b1:'склад',b3:'склад',b5:'склад'}};
 // Simplified mock of existing lineage API's no-placement and unknown-queen semantics.
 const lineage={applyMerge:(draft,req)=>{
  if(draft.sectionalLayouts.some(l=>l.hiveId===req.resultFamily.hive))return {ok:false,error:'still_placed'};
  for(const f of draft.families){f.recordStatus='historical';f.currentQueenId=null;f.queenIdentityStatus='unresolved'}
  for(const q of draft.queens)q.status='unknown';
  draft.families.push({...req.resultFamily,recordStatus:'active',currentQueenId:null,queenIdentityStatus:'unresolved'});
  draft.familyEvents.push({id:'merge-ev',type:'merge',hiveId:'h1',operationId:'OP-11',sourceFamilyIds:['f1','f2','f3'],resultFamilyIds:['f-result']});
  return {ok:true};
 }};
 let seq=0;const deps={now:'2026-11-23T10:00:00Z',makeId:()=>String(++seq),PasekaEquipmentItems:{place:()=>({ok:true})},PasekaFamilyLineage:lineage};
 return {state,request,deps};
}
test('OP11 stages merge preserving three existing upper brood bodies, immutable source, unknown queen',()=>{
 const f=fixture(),original=structuredClone(f.state),r=stage(f.state,f.request,f.deps);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.deepEqual(f.state,original);assert.equal(r.draft.sectionalLayouts[0].mode,'SINGLE_FAMILY');
 assert.equal(r.draft.families.find(x=>x.id==='f-result').queenIdentityStatus,'unresolved');
 for(const id of ['b1','b3','b5'])assert.equal(r.draft.equipmentInventory.bodies[id].storageLocation,'склад');
 assert.equal(r.draft.equipmentInventory.events.length,6);
});
test('OP11 incomplete body manifest rejected',()=>{const f=fixture();f.request.bodyMoves.pop();assert.equal(stage(f.state,f.request,f.deps).ok,false)});
test('OP11 missing storage location rejected',()=>{const f=fixture();delete f.request.storageLocations.b1;assert.equal(stage(f.state,f.request,f.deps).ok,false)});
test('OP11 does not invent a surviving queen',()=>{const f=fixture();f.request.resultFamily.currentQueenId='qf1';assert.equal(stage(f.state,f.request,f.deps).ok,false)});
test('OP11 unsuccessful lineage leaves source state unchanged',()=>{const f=fixture(),before=structuredClone(f.state);f.deps.PasekaFamilyLineage.applyMerge=()=>({ok:false,error:'lineage_denied'});assert.equal(stage(f.state,f.request,f.deps).ok,false);assert.deepEqual(f.state,before)});
test('OP12 refuses unconfirmed isolation',()=>{const f=fixture();f.request.operationId='OP-12';f.request.targetLayout.mode='ALTERNATIVE_WINTERING_COLUMN';assert.equal(stage(f.state,f.request,f.deps).ok,false)});
test('OP13 refuses operation without actual spring separation',()=>{const f=fixture();f.request.operationId='OP-13';assert.equal(stage(f.state,f.request,f.deps).ok,false)});
test('OP14 refuses early honey merge without actual harvest proof',()=>{const f=fixture();f.request.operationId='OP-14';assert.equal(stage(f.state,f.request,f.deps).ok,false)});
test('all OP11-14 reject legacy single-season coordinator',()=>{const f=fixture();f.state.sectionalTechProcesses=[{hiveId:'h1'}];for(const op of ['OP-11','OP-12','OP-13','OP-14'])assert.equal(stage(f.state,{...f.request,operationId:op},f.deps).error,'season_legacy_coordinator_must_be_migrated')});

test('OP11–14 fail closed when imported v1 cycle has not been activated',()=>{const f=fixture();f.state.sectionalSeasonCycles[0].migrationStatus='BASELINE_IMPORTED_PENDING_ACTIVATION';assert.equal(stage(f.state,f.request,f.deps).error,'season_active_v2_cycle_required')});
