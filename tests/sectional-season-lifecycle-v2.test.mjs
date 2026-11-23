import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};for(const name of ['sectional-season-ledger-v2.js','sectional-season-evidence-v2.js','sectional-season-dual-read-v2.js','sectional-season-runtime-v2.js','sectional-season-lifecycle-v2.js'])new Function('window',readFileSync(new URL('../js/'+name,import.meta.url),'utf8'))(w);
const lifecycle=w.PasekaSectionalSeasonLifecycleV2,ledger=w.PasekaSectionalSeasonLedgerV2,evidence=w.PasekaSectionalSeasonEvidenceV2,dualRead=w.PasekaSectionalSeasonDualReadV2;
function fixture(){
 const s={meta:{revisionId:'rev1',schemaVersion:15},hives:[{id:'h',profileId:'sectional-multiqueen-v1'}],sectionalTechProcesses:[],sectionalSeasonCycles:[],sectionalLayouts:[{id:'l',hiveId:'h',profileId:'sectional-multiqueen-v1',mode:'SINGLE_FAMILY',sections:[{id:'s',familyId:'f',broodBodyIds:['b1','b2','b3']}]}],equipmentInventory:{bodies:Object.fromEntries(['b1','b2','b3'].map(id=>[id,{id,frames:[{frameId:id+'f',history:[]}]}]))},families:[{id:'f'}],queens:[],familyEvents:[],queenEvents:[]};
 let db=structuredClone(s),counter=1,writes=0;
 const deps={ledger,evidence,dualRead,readMain:async()=>structuredClone(db),
  writeMainIfUnchanged:async(next,expected)=>{if(db.meta.revisionId!==expected)throw Error('conflict');db=structuredClone(next);writes++;},
  verifyFullArchiveAndReplay:async(state)=>({ok:true,restoreReplayVerified:true,includesOriginalMedia:true,externalCopyConfirmed:true,verificationScope:'SECOND_DEVICE_VERIFIED',verificationId:'verified',originalRevisionId:state.meta.revisionId}),
  validateState:()=>[],makeRevisionId:()=> 'rev'+(++counter),
  preparePersistentSnapshot:async(candidate,old,rev)=>({...structuredClone(candidate),meta:{...candidate.meta,revisionId:rev}})};
 const request={hiveId:'h',cycleId:'cycle1',occurredAt:'2026-11-23T10:00:00Z',userConfirmed:true,physicalStatePersonallyVerified:true,confirmationRef:'bee-verified'};
 return {request,deps,get:()=>db,writes:()=>writes};
}
test('opens one cycle with durable CAS and independent archive proof',async()=>{
 const f=fixture();const r=await lifecycle.open(f.request,f.deps);
 assert.equal(r.ok,true,JSON.stringify(r));assert.equal(f.writes(),1);assert.equal(f.get().sectionalSeasonCycles[0].status,'ACTIVE');
 const duplicate=await lifecycle.open({...f.request,cycleId:'cycle2'},f.deps);
 assert.equal(duplicate.ok,false);assert.equal(f.writes(),1);
});
test('cannot open without full archive restore proof',async()=>{
 const f=fixture();f.deps.verifyFullArchiveAndReplay=async()=>({ok:true,restoreReplayVerified:false,includesOriginalMedia:true,externalCopyConfirmed:true,verificationScope:'SECOND_DEVICE_VERIFIED',originalRevisionId:'rev1',verificationId:'x'});
 assert.equal((await lifecycle.open(f.request,f.deps)).ok,false);assert.equal(f.writes(),0);
});
test('refuses arbitrary winter layout or missing confirmation',async()=>{
 const f=fixture(),read=f.deps.readMain;f.deps.readMain=async()=>{const x=await read();x.sectionalLayouts[0].mode='SIDE_BY_SIDE';return x};
 assert.equal((await lifecycle.open(f.request,f.deps)).ok,false);
 const g=fixture();g.request.physicalStatePersonallyVerified=false;assert.equal((await lifecycle.open(g.request,g.deps)).ok,false);
});
test('refuses to close a cycle without actual OP11 or OP14 physical final stage',async()=>{
 const f=fixture();await lifecycle.open(f.request,f.deps);
 const r=await lifecycle.close({...f.request,eventId:'close-1',occurredAt:'2026-11-23T11:00:00Z'},f.deps);
 assert.equal(r.ok,false);assert.equal(f.writes(),1);
});
test('CAS conflict and readback mismatch never report confirmed operation',async()=>{
 const f=fixture();f.deps.writeMainIfUnchanged=async()=>{throw Error('CAS')};
 assert.equal((await lifecycle.open(f.request,f.deps)).ok,false);
 const g=fixture(),read=g.deps.readMain;let reads=0;g.deps.readMain=async()=>{const s=await read();if(++reads>1)s.meta.revisionId='other';return s};
 assert.equal((await lifecycle.open(g.request,g.deps)).error,'season_lifecycle_cold_read_mismatch_commit_uncertain');
});

test('same-device replay does not permit new physical cycle',async()=>{
 const f=fixture();f.deps.verifyFullArchiveAndReplay=async(source)=>({ok:true,restoreReplayVerified:true,includesOriginalMedia:true,externalCopyConfirmed:false,verificationScope:'LOCAL_INDEPENDENT_INDEXEDDB_REPLAY',originalRevisionId:source.meta.revisionId,verificationId:'local'});
 assert.equal((await lifecycle.open(f.request,f.deps)).error,'season_lifecycle_full_archive_not_verified');assert.equal(f.writes(),0);
});


test('OPEN lifecycle snapshot preparer may not change any prior journal or metadata',async()=>{
 for(const mutate of [
  s=>{s.records=[{id:'forged',type:'inspection'}]},
  s=>{s.auditLog=[{id:'fake'}]},
  s=>{s.meta.schemaVersion=500},
  s=>{s.families[0].id='rewritten'},
  s=>{s.privateUnknown='new'},
  s=>{s.sectionalSeasonCycles=[]}
 ]){
  const f=fixture();
  f.deps.preparePersistentSnapshot=async (candidate,old,rev)=>{
   candidate.meta.revisionId=rev;
   mutate(candidate);
   return candidate;
  };
  const r=await lifecycle.open(f.request,f.deps);
  assert.equal(r.ok,false,JSON.stringify(r));
  assert.equal(f.writes(),0);
 }
});
test('OPEN lifecycle preparer cannot mutate existing media even with identical Blob size',async()=>{
 const f=fixture(),read=f.deps.readMain;
 f.deps.readMain=async()=>({...await read(),entranceMedia:[
  {id:'clip',blob:new Blob(['AAAA'],{type:'video/mp4'})}
 ]});
 f.deps.preparePersistentSnapshot=async(s,old,rev)=>{
  s.meta.revisionId=rev;
  s.entranceMedia[0].blob=new Blob(['BBBB'],{type:'video/mp4'});
  return s;
 };
 const r=await lifecycle.open(f.request,f.deps);
 assert.equal(r.ok,false);
 assert.equal(f.writes(),0);
});
test('OPEN lifecycle preparer cannot rewrite previous archived snapshots',async()=>{
 const f=fixture(),read=f.deps.readMain;
 f.deps.readMain=async()=>({...await read(),snapshots:[{id:'original'}]});
 f.deps.preparePersistentSnapshot=async(s,old,rev)=>{
  s.meta.revisionId=rev;s.snapshots=[{id:'replaced'}];return s;
 };
 assert.equal((await lifecycle.open(f.request,f.deps)).ok,false);
 assert.equal(f.writes(),0);
});
test('OPEN lifecycle detects altered independent video on cold read even after successful CAS',async()=>{
 const f=fixture(),read=f.deps.readMain;let reads=0;
 f.deps.readMain=async()=>{
  const s=await read();reads++;
  s.entranceMedia=[{id:'clip',blob:new Blob([reads===1?'AAAA':'BBBB'],{type:'video/mp4'})}];
  return s;
 };
 const r=await lifecycle.open(f.request,f.deps);
 assert.equal(r.error,'season_lifecycle_full_cold_read_mismatch_commit_uncertain');
 assert.equal(f.writes(),1);
});
test('OPEN lifecycle detects changed inspection journal on cold read, never reports durable',async()=>{
 const f=fixture(),read=f.deps.readMain;let reads=0;
 f.deps.readMain=async()=>{
  const s=await read();s.records=[{id:'record',content:(++reads===1?'old':'tampered')}];return s;
 };
 const r=await lifecycle.open(f.request,f.deps);
 assert.equal(r.error,'season_lifecycle_full_cold_read_mismatch_commit_uncertain');
 assert.equal(f.writes(),1);
});
test('OPEN lifecycle preserves existing media and appends snapshot without changing any other data',async()=>{
 const f=fixture(),read=f.deps.readMain;
 f.deps.readMain=async()=>({...await read(),
  records:[{id:'r1',content:'kept'}],
  entranceMedia:[{id:'video1',blob:new Blob(['real bytes'],{type:'video/mp4'})}],
  snapshots:[{id:'existing'}]});
 f.deps.preparePersistentSnapshot=async (s,old,rev)=>{
  s.meta.revisionId=rev;s.snapshots.push({id:'new',revisionId:rev});return s;
 };
 const r=await lifecycle.open(f.request,f.deps);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.state.entranceMedia[0].blob.size,10);
 assert.equal(r.state.records[0].content,'kept');
 assert.equal(r.state.snapshots[0].id,'existing');
 assert.equal(r.state.snapshots[1].id,'new');
});
