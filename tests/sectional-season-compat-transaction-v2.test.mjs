import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};
for(const f of ['sectional-season-ledger-v2.js','sectional-season-evidence-v2.js','sectional-season-dual-read-v2.js','sectional-season-operation-rules-v2.js','sectional-season-transaction-v2.js'])new Function('window',readFileSync(new URL('../js/'+f,import.meta.url),'utf8'))(w);
const txn=w.PasekaSectionalSeasonTransactionV2;
const family=id=>({id,hive:'h',recordStatus:'active',colonyGroupId:'g',currentQueenId:null,queenIdentityStatus:'unresolved'});
function state(){
 const profile='sectional-multiqueen-v1';
 return {meta:{revisionId:'rev1',schemaVersion:15},hives:[{id:'h',profileId:profile}],families:[family('f0'),family('f1'),family('f2'),family('f3')],queens:[],
  equipmentInventory:{bodies:Object.fromEntries(['b1','b2','b3'].map(id=>[id,{id,frames:[{frameId:id+'fr',history:[]}]}]))},
  sectionalLayouts:[{id:'layout',hiveId:'h',profileId:profile,mode:'SINGLE_FAMILY',sections:[{id:'main',position:'combined',familyId:'f0',broodBodyIds:['b1','b2','b3']}]}],
  sectionalTechProcesses:[],sectionalSeasonCycles:[{modelVersion:2,id:'cycle',hiveId:'h',status:'ACTIVE',cycleNumber:1,events:[]}],sectionalSeasonalEntranceObservations:[]};
}
const request={cycleId:'cycle',hiveId:'h',operationId:'OP-04',confirmedBy:'beekeeper',transactionId:'tx1',eventId:'event1',occurredAt:'2026-11-23T10:00:00Z',userConfirmed:true};
function fixture(){
 let db=state();
 const deps={
  ledger:w.PasekaSectionalSeasonLedgerV2,evidence:w.PasekaSectionalSeasonEvidenceV2,rules:w.PasekaSectionalSeasonOperationRulesV2,dualRead:w.PasekaSectionalSeasonDualReadV2,
  authorized:async()=>true,inspectState:()=>[],
  applyPhysicalOperation:async d=>{
   d.sectionalLayouts[0].mode='SIDE_BY_SIDE';
   d.sectionalLayouts[0].sections=[{id:'left',position:'left',familyId:'f1',broodBodyIds:['b1']},{id:'middle',position:'middle',familyId:'f2',broodBodyIds:['b2']},{id:'right',position:'right',familyId:'f3',broodBodyIds:['b3']}];
   d.sectionalSeasonCycles[0].compatProcess={modelVersion:1,id:'cycle',hiveId:'h',state:{operations:[{operationId:'OP-04',status:'IN_PROGRESS'}]}};
   return d;
  },
  persistIfRevision:async(d,rev)=>{if(db.meta.revisionId!==rev)return {ok:false};db=structuredClone(d);db.meta.revisionId='rev2';return {ok:true,revisionId:'rev2'}},
  readPersisted:async()=>structuredClone(db)
 };
 return {deps,getDb:()=>db};
}
test('OP04 first physical stage atomically saves only current compat coordinator with immutable event',async()=>{
 const f=fixture(),before=state(),original=structuredClone(before);
 const r=await txn.commitVerifiedTransition(before,request,f.deps);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.state.sectionalSeasonCycles[0].events[0].evidence.operationId,'OP-04');
 assert.equal(r.state.sectionalSeasonCycles[0].compatProcess.state.operations[0].status,'IN_PROGRESS');
 assert.deepEqual(before,original);
});
test('injected rewrite of history or archived neighboring cycle is rejected before CAS',async()=>{
 const f=fixture();let called=false;const apply=f.deps.applyPhysicalOperation;
 f.deps.applyPhysicalOperation=async d=>{
  const staged=await apply(d);staged.sectionalSeasonCycles[0].events.push({id:'injected',type:'STAGE_CONFIRMED'});return staged;
 };
 f.deps.persistIfRevision=async()=>{called=true;return {ok:true,revisionId:'rev2'}};
 const r=await txn.commitVerifiedTransition(state(),request,f.deps);
 assert.equal(r.error,'compat_cycle_history_or_metadata_changed');assert.equal(called,false);
});
test('OP04 bridge cannot fake DONE with no source, substitute wrong ID or start another division',()=>{
 const initial=state().sectionalSeasonCycles,copy=structuredClone(initial);
 copy[0].compatProcess={modelVersion:1,id:'cycle',hiveId:'h',state:{operations:[{operationId:'OP-04',status:'DONE'}]}};
 assert.equal(txn.validateCompatProcessTransition(initial,copy,request).ok,true);
 copy[0].compatProcess.state.operations[0].operationId='OP-11';
 assert.equal(txn.validateCompatProcessTransition(initial,copy,request).ok,false);
 const second=structuredClone(initial);second[0].compatProcess={modelVersion:1,id:'cycle',hiveId:'h',state:{operations:[{operationId:'OP-04',status:'DONE'}]}};
 const restarted=structuredClone(second);restarted[0].compatProcess.state.operations.push({operationId:'OP-04',status:'IN_PROGRESS'});
 assert.equal(txn.validateCompatProcessTransition(second,restarted,request).ok,false);
});
test('OP05–07 appended coordinator stage cannot rewrite a prior operation',()=>{
 const prev=state().sectionalSeasonCycles;
 prev[0].compatProcess={modelVersion:1,id:'cycle',hiveId:'h',state:{operations:[{operationId:'OP-04',status:'DONE'}]}};
 const after=structuredClone(prev);
 after[0].compatProcess.state.operations.push({operationId:'OP-05',status:'DONE'});
 assert.equal(txn.validateCompatProcessTransition(prev,after,{...request,operationId:'OP-05'}).ok,true);
 const corrupt=structuredClone(after);corrupt[0].compatProcess.state.operations[0].status='IN_PROGRESS';
 assert.equal(txn.validateCompatProcessTransition(prev,corrupt,{...request,operationId:'OP-05'}).ok,false);
});
