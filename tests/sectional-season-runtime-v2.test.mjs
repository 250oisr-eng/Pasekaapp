import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};for(const file of ['sectional-season-ledger-v2.js','sectional-season-evidence-v2.js','sectional-season-dual-read-v2.js','sectional-season-operation-rules-v2.js','sectional-season-transaction-v2.js','sectional-season-runtime-v2.js'])new Function('window',readFileSync(new URL('../js/'+file,import.meta.url),'utf8'))(w);
const runtime=w.PasekaSectionalSeasonRuntimeV2;
function fixture(){
 const state={meta:{revisionId:'rev1',schemaVersion:15},hives:[{id:'h',profileId:'sectional-multiqueen-v1'}],sectionalLayouts:[{id:'layout',hiveId:'h',profileId:'sectional-multiqueen-v1',mode:'SIDE_BY_SIDE',sections:[{id:'left',familyId:'f1',broodBodyIds:['b1']},{id:'middle',familyId:'f2',broodBodyIds:['b2']},{id:'right',familyId:'f3',broodBodyIds:['b3']}]}],equipmentInventory:{bodies:Object.fromEntries(['b1','b2','b3'].map(id=>[id,{id,frames:[{frameId:id+'-f',history:[]}]}]))},families:[{id:'f1'},{id:'f2'},{id:'f3'}],queens:[],sectionalTechProcesses:[],sectionalSeasonCycles:[{id:'cy1',hiveId:'h',modelVersion:2,cycleNumber:1,status:'ACTIVE',events:[]}],sectionalSeasonalEntranceObservations:[],familyEvents:[],queenEvents:[]};
 let db=structuredClone(state),saved=0;
 const request={operationId:'OP-09',hiveId:'h',cycleId:'cy1',userConfirmed:true,eventId:'e1',transactionId:'tx1',occurredAt:'2026-11-23T10:00:00Z',confirmedBy:'beekeeper',seasonPhase:'AUTUMN_REDUCED',entrancesPersonallyObserved:true};
 const deps={
  ledger:w.PasekaSectionalSeasonLedgerV2,evidence:w.PasekaSectionalSeasonEvidenceV2,dualRead:w.PasekaSectionalSeasonDualReadV2,rules:w.PasekaSectionalSeasonOperationRulesV2,transaction:w.PasekaSectionalSeasonTransactionV2,
  readMain:async()=>structuredClone(db),writeMainIfUnchanged:async(candidate,rev)=>{if(db.meta.revisionId!==rev)throw Error('CAS');db=structuredClone(candidate);saved++},
  verifyFullArchiveAndReplay:async(source)=>({ok:true,restoreReplayVerified:true,includesOriginalMedia:true,externalCopyConfirmed:true,verificationScope:'SECOND_DEVICE_VERIFIED',originalRevisionId:source.meta.revisionId,verificationId:'proof-1'}),
  validateState:()=>[],makeRevisionId:()=> 'rev2',
  preparePersistentSnapshot:async(state,old,revision)=>({...structuredClone(state),meta:{...state.meta,revisionId:revision},snapshots:[{at:'2026-11-23'}]}),
  executors:{'OP-09':async draft=>{draft.sectionalSeasonalEntranceObservations.push({id:'obs1',hiveId:'h',operationId:'OP-09',phase:'AUTUMN_REDUCED',userConfirmed:true});return {ok:true,draft}}}
 };
 return {request,deps,get:()=>db,count:()=>saved};
}
test('verified full archive, staged physical event, atomic CAS and cold read required',async()=>{
 const f=fixture(),r=await runtime.commit(f.request,f.deps);
 assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.durable,true);assert.equal(f.count(),1);
 assert.equal(f.get().sectionalSeasonCycles[0].events.length,1);
 assert.equal(r.fullBackupVerificationId,'proof-1');
});
test('refuses unverified full archive without writes',async()=>{
 const f=fixture();f.deps.verifyFullArchiveAndReplay=async()=>({ok:true,restoreReplayVerified:false,includesOriginalMedia:true,externalCopyConfirmed:true,verificationScope:'SECOND_DEVICE_VERIFIED',originalRevisionId:'rev1',verificationId:'proof'});
 assert.equal((await runtime.commit(f.request,f.deps)).error,'season_runtime_verified_full_archive_required');assert.equal(f.count(),0);
});
test('refuses backup of different revision without writes',async()=>{
 const f=fixture();f.deps.verifyFullArchiveAndReplay=async()=>({ok:true,restoreReplayVerified:true,includesOriginalMedia:true,externalCopyConfirmed:true,verificationScope:'SECOND_DEVICE_VERIFIED',originalRevisionId:'old',verificationId:'proof'});
 assert.equal((await runtime.commit(f.request,f.deps)).ok,false);assert.equal(f.count(),0);
});
test('refuses unverified original media without writes',async()=>{
 const f=fixture();f.deps.verifyFullArchiveAndReplay=async()=>({ok:true,restoreReplayVerified:true,includesOriginalMedia:false,originalRevisionId:'rev1',verificationId:'proof'});
 assert.equal((await runtime.commit(f.request,f.deps)).ok,false);assert.equal(f.count(),0);
});
test('refuses legacy process and pending migration without writes',async()=>{
 const f=fixture();const beforeRead=f.deps.readMain;
 f.deps.readMain=async()=>({...await beforeRead(),sectionalTechProcesses:[{hiveId:'h'}]});
 assert.equal((await runtime.commit(f.request,f.deps)).ok,false);assert.equal(f.count(),0);
 const f2=fixture(),oldRead=f2.deps.readMain;f2.deps.readMain=async()=>{const s=await oldRead();s.sectionalSeasonCycles[0].migrationStatus='BASELINE_IMPORTED_PENDING_ACTIVATION';return s};
 assert.equal((await runtime.commit(f2.request,f2.deps)).ok,false);assert.equal(f2.count(),0);
});
test('CAS writer failure never reports durable operation',async()=>{
 const f=fixture();f.deps.writeMainIfUnchanged=async()=>{throw Error('CAS')};
 assert.equal((await runtime.commit(f.request,f.deps)).ok,false);assert.equal(f.count(),0);
});
test('snapshot preparer cannot alter equipment or families',async()=>{
 const f=fixture();f.deps.preparePersistentSnapshot=async(state,old,rev)=>{const s=structuredClone(state);s.meta.revisionId=rev;s.families=[];return s};
 assert.equal((await runtime.commit(f.request,f.deps)).ok,false);assert.equal(f.count(),0);
});
test('absence of physical executor or validator fails closed',async()=>{
 const f=fixture();delete f.deps.executors['OP-09'];assert.equal((await runtime.commit(f.request,f.deps)).ok,false);
 const g=fixture();delete g.deps.validateState;assert.equal((await runtime.commit(g.request,g.deps)).ok,false);
});

test('same-phone isolated replay is insufficient for physical operation activation',async()=>{
 const f=fixture();f.deps.verifyFullArchiveAndReplay=async()=>({ok:true,restoreReplayVerified:true,includesOriginalMedia:true,externalCopyConfirmed:false,verificationScope:'LOCAL_INDEPENDENT_INDEXEDDB_REPLAY',originalRevisionId:'rev1',verificationId:'local'});
 assert.equal((await runtime.commit(f.request,f.deps)).error,'season_runtime_verified_full_archive_required');assert.equal(f.count(),0);
});


test('snapshot preparer cannot rewrite an existing journal record or audit history',async()=>{
 for(const key of ['records','auditLog','extractions','sectionalSeasonalEntranceObservations']){
  const f=fixture(),baseline=f.deps.readMain;
  f.deps.readMain=async()=>{
   const state=await baseline();
   if(key!=='sectionalSeasonalEntranceObservations')state[key]=[{id:'original',note:'keep'}];
   return state;
  };
  f.deps.preparePersistentSnapshot=async(s,old,rev)=>{
   s.meta.revisionId=rev;
   s[key]=[{id:'tampered',note:'changed'}];
   return s;
  };
  const r=await runtime.commit(f.request,f.deps);
  assert.equal(r.ok,false,key+' silently rewritten');
  assert.equal(f.count(),0,key+' must never reach IndexedDB');
 }
});
test('snapshot preparer cannot rewrite meta schema, add unknown fields or previous snapshots',async()=>{
 const options=[
  (s)=>{s.meta.schemaVersion=999;},
  (s)=>{s.unrelatedSecret='unapproved';},
  (s)=>{s.snapshots=[{id:'replaced-snapshot'}];}
 ];
 for(let i=0;i<options.length;i++){
  const f=fixture(),read=f.deps.readMain;
  f.deps.readMain=async()=>{
   const state=await read();state.snapshots=[{id:'previous',revisionId:'rev0'}];
   return state;
  };
  f.deps.preparePersistentSnapshot=async(s,old,rev)=>{
   s.meta.revisionId=rev;options[i](s);return s;
  };
  assert.equal((await runtime.commit(f.request,f.deps)).ok,false,'mutation '+i);
  assert.equal(f.count(),0);
 }
});
test('binary original media is compared byte for byte, not Blob size/type or JSON serialization',async()=>{
 const f=fixture(),read=f.deps.readMain;
 f.deps.readMain=async()=>{
  const s=await read();
  s.records=[{id:'record',originalBlob:new Blob(['ABCD'],{type:'video/mp4'})}];
  return s;
 };
 f.deps.preparePersistentSnapshot=async(s,old,rev)=>{
  s.meta.revisionId=rev;
  s.records[0].originalBlob=new Blob(['WXYZ'],{type:'video/mp4'});
  return s;
 };
 const result=await runtime.commit(f.request,f.deps);
 assert.equal(result.ok,false);
 assert.equal(f.count(),0,'same-size media replacement cannot be persisted');
});
test('a snapshot preparer cannot conceal in-place mutations by returning the same object',async()=>{
 const f=fixture();
 f.deps.preparePersistentSnapshot=async(s,old,rev)=>{
  s.meta.revisionId=rev;s.families[0].id='other';
  return s;
 };
 assert.equal((await runtime.commit(f.request,f.deps)).ok,false);
 assert.equal(f.count(),0);
});
test('complete cold read rejects unrelated record or video changes after atomic write',async()=>{
 for(const kind of ['journal','video']){
  const f=fixture(),read=f.deps.readMain;
  let n=0;
  f.deps.readMain=async()=>{
   const s=await read();n++;
   // First read is source. Second read is the post-write cold read.
   if(kind==='journal'){
    s.records=[{id:'entry',text:n===1?'saved':'silently overwritten'}];
   }else{
    s.entranceMedia=[{id:'clip',blob:new Blob([n===1?'ABCD':'WXYZ'],{type:'video/mp4'})}];
   }
   return s;
  };
  const result=await runtime.commit(f.request,f.deps);
  assert.equal(result.error,'season_runtime_full_cold_read_mismatch_commit_uncertain');
  assert.equal(f.count(),1,'write happened: state must be marked uncertain, not rolled back');
 }
});
test('valid unchanged originals and newly appended snapshots survive safe CAS and cold read',async()=>{
 const f=fixture(),read=f.deps.readMain;
 f.deps.readMain=async()=>({
  ...await read(),
  records:[{id:'entry',text:'inspection',blob:new Blob(['same content'],{type:'video/mp4'})}],
  auditLog:[{id:'prior',type:'inspection'}]
 });
 const result=await runtime.commit(f.request,f.deps);
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(f.count(),1);
 assert.equal(result.state.records[0].text,'inspection');
 assert.equal(result.state.auditLog[0].id,'prior');
});
