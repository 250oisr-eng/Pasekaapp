import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};for(const f of ['sectional-season-ledger-v2.js','sectional-season-evidence-v2.js','sectional-season-dual-read-v2.js','sectional-season-operation-rules-v2.js','sectional-season-transaction-v2.js'])new Function('window',readFileSync(new URL('../js/'+f,import.meta.url),'utf8'))(w);
const {PasekaSectionalSeasonLedgerV2:ledger,PasekaSectionalSeasonEvidenceV2:evidence,PasekaSectionalSeasonDualReadV2:dualRead,PasekaSectionalSeasonOperationRulesV2:rules,PasekaSectionalSeasonTransactionV2:transaction}=w;
const initial=()=>({
 meta:{revisionId:'r1',schemaVersion:15},hives:[{id:'h1',profileId:'sectional-multiqueen-v1'}],
 sectionalLayouts:[{id:'l1',hiveId:'h1',mode:'SIDE_BY_SIDE',sections:[{id:'left',familyId:'f1',broodBodyIds:['b1']},{id:'middle',familyId:'f2',broodBodyIds:['b2']},{id:'right',familyId:'f3',broodBodyIds:['b3']}],honeyStack:{bodyIds:['h1body','h2body']}}],
 equipmentInventory:{bodies:Object.fromEntries(['b1','b2','b3','h1body','h2body'].map(id=>[id,{id,frames:[{frameId:id+'-frame',history:[]}]}]))},
 families:[{id:'f1'},{id:'f2'},{id:'f3'}],queens:[],sectionalTechProcesses:[],
 sectionalSeasonCycles:[{modelVersion:2,id:'cycle1',hiveId:'h1',cycleNumber:1,status:'ACTIVE',events:[]}],
 sectionalSeasonalEntranceObservations:[]
});
const request=()=>({cycleId:'cycle1',hiveId:'h1',operationId:'OP-09',seasonPhase:'AUTUMN_REDUCED',
 userConfirmed:true,entrancesPersonallyObserved:true,confirmedBy:'beekeeper',transactionId:'tx1',eventId:'event1',occurredAt:'2026-11-23T10:00:00Z'});
const fixture=()=>{
 let db=initial();
 const deps={ledger,evidence,rules,dualRead,authorized:async()=>true,inspectState:()=>[],
  applyPhysicalOperation:async draft=>{draft.sectionalSeasonalEntranceObservations.push({id:'entrance1',hiveId:'h1',operationId:'OP-09',phase:'AUTUMN_REDUCED',userConfirmed:true});return draft;},
  persistIfRevision:async(draft,old)=>{if(db.meta.revisionId!==old)return {ok:false};db=structuredClone(draft);db.meta.revisionId='r2';return {ok:true,revisionId:'r2'};},
  readPersisted:async()=>structuredClone(db)};
 return {deps,getDB:()=>db};
};
test('atomic OP09 write and cold read confirm both physical event and season history',async()=>{
 const state=initial(),before=structuredClone(state),f=fixture();
 const result=await transaction.commitVerifiedTransition(state,request(),f.deps);
 assert.equal(result.ok,true);assert.equal(result.durable,true);
 assert.equal(result.state.sectionalSeasonCycles[0].events.length,1);
 assert.deepEqual(state,before);
});
test('rejects authorization without touching persistence',async()=>{
 const f=fixture();f.deps.authorized=async()=>false;
 assert.equal((await transaction.commitVerifiedTransition(initial(),request(),f.deps)).error,'season_transaction_not_authorized');
 assert.equal(f.getDB().meta.revisionId,'r1');
});
test('rejects failure of physical validator without persistence',async()=>{
 const f=fixture();f.deps.inspectState=()=>[{code:'invalid_physical_state'}];
 assert.equal((await transaction.commitVerifiedTransition(initial(),request(),f.deps)).ok,false);
 assert.equal(f.getDB().meta.revisionId,'r1');
});
test('CAS failure never reports success',async()=>{
 const f=fixture();f.deps.persistIfRevision=async()=>({ok:false});
 assert.equal((await transaction.commitVerifiedTransition(initial(),request(),f.deps)).error,'season_persist_not_confirmed');
});
test('cold read mismatch reports uncertainty rather than unsafe rollback',async()=>{
 const f=fixture();f.deps.readPersisted=async()=>({...initial(),meta:{revisionId:'another'}});
 const result=await transaction.commitVerifiedTransition(initial(),request(),f.deps);
 assert.equal(result.error,'season_cold_read_revision_mismatch_commit_uncertain');
});
test('replay of same event cannot append duplicate history',async()=>{
 const f=fixture(),r=request(),first=await transaction.commitVerifiedTransition(initial(),r,f.deps);
 assert.equal(first.ok,true);
 const again=await transaction.commitVerifiedTransition(first.state,r,f.deps);
 assert.equal(again.ok,false);
});
