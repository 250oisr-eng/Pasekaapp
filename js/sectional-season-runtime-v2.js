(function(){
'use strict';
// Capability-bound persistence bridge. Caller must supply real independent
// full backup verification, all local inspectors, and an atomic IDB CAS writer.
// Never infer backup success from a checkbox, filename or user statement.
const O=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const S=x=>typeof x==='string'&&x.trim().length>0;
const fail=(error,details)=>({ok:false,error,...(details?{details}:{})});
// Exact state comparison for persistence. JSON.stringify silently maps Blob to
// {}, so it cannot protect original media or binary journal attachments.
async function sameData(a,b,seen=new WeakMap()){
 if(Object.is(a,b))return true;
 if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return false;
 const tag=Object.prototype.toString.call(a);
 if(tag!==Object.prototype.toString.call(b))return false;
 if(tag==='[object Blob]'||tag==='[object File]'){
  if(a.size!==b.size||a.type!==b.type)return false;
  if(tag==='[object File]'&&(a.name!==b.name||a.lastModified!==b.lastModified))return false;
  // Stream-sized chunks keep mobile memory bounded for original videos.
  const chunk=1024*1024;
  for(let offset=0;offset<a.size;offset+=chunk){
   const end=Math.min(offset+chunk,a.size);
   const first=new Uint8Array(await a.slice(offset,end).arrayBuffer());
   const second=new Uint8Array(await b.slice(offset,end).arrayBuffer());
   if(first.length!==second.length)return false;
   for(let i=0;i<first.length;i++)if(first[i]!==second[i])return false;
  }
  return true;
 }
 if(ArrayBuffer.isView(a)){
  if(a.constructor?.name!==b.constructor?.name||a.byteLength!==b.byteLength)return false;
  const x=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
  const y=new Uint8Array(b.buffer,b.byteOffset,b.byteLength);
  for(let i=0;i<x.length;i++)if(x[i]!==y[i])return false;
  return true;
 }
 if(tag==='[object ArrayBuffer]'){
  if(a.byteLength!==b.byteLength)return false;
  const x=new Uint8Array(a),y=new Uint8Array(b);
  for(let i=0;i<x.length;i++)if(x[i]!==y[i])return false;
  return true;
 }
 if(tag==='[object Date]')return Object.is(a.getTime(),b.getTime());
 if(tag==='[object RegExp]')return a.source===b.source&&a.flags===b.flags&&a.lastIndex===b.lastIndex;
 if(seen.has(a))return seen.get(a)===b;
 seen.set(a,b);
 if(tag==='[object Map]'){
  if(a.size!==b.size)return false;
  const xa=[...a.entries()],xb=[...b.entries()];
  for(let i=0;i<xa.length;i++)if(!await sameData(xa[i][0],xb[i][0],seen)||!await sameData(xa[i][1],xb[i][1],seen))return false;
  return true;
 }
 if(tag==='[object Set]'){
  if(a.size!==b.size)return false;
  const xa=[...a],xb=[...b];
  for(let i=0;i<xa.length;i++)if(!await sameData(xa[i],xb[i],seen))return false;
  return true;
 }
 if(tag!=='[object Object]'&&tag!=='[object Array]')return false;
 if(tag==='[object Array]'&&a.length!==b.length)return false;
 const ka=Reflect.ownKeys(a).sort(),kb=Reflect.ownKeys(b).sort();
 if(ka.length!==kb.length||ka.some((key,i)=>key!==kb[i]))return false;
 for(const key of ka){
  if(typeof key==='symbol')return false;
  if(!await sameData(a[key],b[key],seen))return false;
 }
 return true;
}
async function preparedIsSafe(candidate,prepared,revision){
 if(!O(candidate)||!O(prepared)||!O(candidate.meta)||!O(prepared.meta)||
    prepared.meta.revisionId!==revision)return false;
 const keys=x=>Object.keys(x).filter(k=>k!=='meta'&&k!=='snapshots').sort();
 const a=keys(candidate),b=keys(prepared);
 if(a.length!==b.length||a.some((x,i)=>x!==b[i]))return false;
 for(const key of a)if(!await sameData(candidate[key],prepared[key]))return false;
 const oldMeta={...candidate.meta},newMeta={...prepared.meta};
 delete oldMeta.revisionId;delete newMeta.revisionId;
 if(!await sameData(oldMeta,newMeta))return false;
 const prev=candidate.snapshots,next=prepared.snapshots;
 if(prev===undefined)return next===undefined||Array.isArray(next);
 if(!Array.isArray(prev))return sameData(prev,next);
 if(!Array.isArray(next)||next.length<prev.length)return false;
 for(let i=0;i<prev.length;i++)if(!await sameData(prev[i],next[i]))return false;
 return true;
}
// Only the fields actually owned by the selected OP may be changed by its
// physical executor. In particular, journal records/media, hive registry and
// other users' entries cannot be silently rewritten in a stage.
const mutable={
 'OP-04':['sectionalLayouts','equipmentInventory','families','queens','familyEvents','queenEvents','auditLog','sectionalSeasonCycles'],
 'OP-05':['sectionalLayouts','equipmentInventory','auditLog','sectionalSeasonCycles'],
 'OP-06':['sectionalLayouts','equipmentInventory','auditLog','sectionalSeasonCycles'],
 'OP-06-RESCUE':['equipmentInventory','auditLog'],
 'OP-07':['sectionalLayouts','equipmentInventory','auditLog','sectionalSeasonCycles'],
 'OP-08':['equipmentInventory','sectionalHoneyExtractions'],
 'OP-09':['sectionalSeasonalEntranceObservations'],
 'OP-10':['sectionalLayouts','equipmentInventory','auditLog'],
 'OP-11':['sectionalLayouts','equipmentInventory','families','queens','familyEvents','queenEvents','auditLog'],
 'OP-12':['sectionalLayouts','equipmentInventory','families','queens','familyEvents','queenEvents','auditLog'],
 'OP-13':['sectionalLayouts','equipmentInventory','families','queens','familyEvents','queenEvents','auditLog'],
 'OP-14':['sectionalLayouts','equipmentInventory','families','queens','familyEvents','queenEvents','auditLog']
};
const rows=x=>Array.isArray(x)?x:[];
async function stageWithinScope(before,after,request){
 const operationId=request?.operationId,hiveId=request?.hiveId;
 if(!O(before)||!O(after)||!S(hiveId)||!Array.isArray(mutable[operationId]))return false;
 const whitelist=new Set(mutable[operationId]);
 const keys=new Set([...Object.keys(before),...Object.keys(after)]);
 for(const key of keys){
  if(whitelist.has(key))continue;
  if(!Object.hasOwn(before,key)||!Object.hasOwn(after,key))return false;
  if(!await sameData(before[key],after[key]))return false;
 }
 // All mutable histories are append-only, including when the selected
 // operation is allowed to add records to them.
 for(const key of ['auditLog','familyEvents','queenEvents','sectionalHoneyExtractions',
    'sectionalSeasonalEntranceObservations']){
  const previous=before[key],next=after[key];
  if(previous===undefined||previous===null)continue;
  if(!Array.isArray(previous)||!Array.isArray(next)||next.length<previous.length||
     !await sameData(previous,next.slice(0,previous.length)))return false;
 }
 for(const key of ['events','itemEvents']){
  const previous=before.equipmentInventory?.[key],next=after.equipmentInventory?.[key];
  if(previous===undefined||previous===null)continue;
  if(!Array.isArray(previous)||!Array.isArray(next)||next.length<previous.length||
     !await sameData(previous,next.slice(0,previous.length)))return false;
 }
 // An operation's mutable fields remain scoped to its own hive. Even a valid
 // local stage cannot rewrite installed equipment or identities of another hive.
 const foreign=(s,key)=>rows(s[key]).filter(x=>x?.hiveId!==hiveId&&x?.hive!==hiveId);
 if(!await sameData(foreign(before,'sectionalLayouts'),foreign(after,'sectionalLayouts')))return false;
 if(!await sameData(foreign(before,'families'),foreign(after,'families')))return false;
 const foreignFamilyIds=new Set(foreign(before,'families').map(x=>x.id));
 const foreignQueens=s=>rows(s.queens).filter(q=>foreignFamilyIds.has(q.familyId));
 if(!await sameData(foreignQueens(before),foreignQueens(after)))return false;
 const foreignBodyIds=new Set(rows(before.sectionalLayouts)
  .filter(l=>l.hiveId!==hiveId).flatMap(l=>[
    ...rows(l.sections).flatMap(s=>rows(s.broodBodyIds)),
    ...rows(l.honeyStack?.bodyIds)
  ]));
 for(const id of foreignBodyIds){
  if(!await sameData(before.equipmentInventory?.bodies?.[id],
                     after.equipmentInventory?.bodies?.[id]))return false;
 }
 const foreignItems=state=>Object.fromEntries(Object.entries(state.equipmentInventory?.items||{})
  .filter(([id,item])=>item?.location?.type==='hive'&&item.location.hiveId!==hiveId));
 if(!await sameData(foreignItems(before),foreignItems(after)))return false;
 return true;
}
const ops=new Set(['OP-04','OP-05','OP-06','OP-06-RESCUE','OP-07','OP-08','OP-09','OP-10','OP-11','OP-12','OP-13','OP-14']);
async function commit(request,deps={}){
 if(!O(request)||!ops.has(request.operationId)||request.userConfirmed!==true||!S(request.hiveId)||!S(request.cycleId)||!S(request.eventId)||!S(request.transactionId)||!S(request.occurredAt)||!S(request.confirmedBy))return fail('season_runtime_user_confirmation_missing');
 const required=['readMain','writeMainIfUnchanged','verifyFullArchiveAndReplay','validateState','makeRevisionId','preparePersistentSnapshot'];
 if(required.some(k=>typeof deps[k]!=='function')||!deps.transaction||!deps.evidence||!deps.ledger||!deps.dualRead||!deps.rules||!O(deps.executors))return fail('season_runtime_capabilities_missing');
 const executor=deps.executors[request.operationId];
 if(typeof executor!=='function')return fail('season_runtime_physical_executor_missing');
 let source;try{source=await deps.readMain()}catch{return fail('season_runtime_read_main_failed')}
 if(!O(source)||!S(source.meta?.revisionId))return fail('season_runtime_revision_invalid');
 if(!Array.isArray(source.sectionalTechProcesses)||source.sectionalTechProcesses.some(p=>p?.hiveId===request.hiveId))return fail('season_runtime_legacy_process_requires_migration');
 const cycles=(Array.isArray(source.sectionalSeasonCycles)?source.sectionalSeasonCycles:[]).filter(c=>c?.hiveId===request.hiveId&&c?.id===request.cycleId&&c.status==='ACTIVE');
 if(cycles.length!==1||['BASELINE_IMPORTED_PENDING_ACTIVATION','REQUIRES_RECONCILIATION'].includes(cycles[0].migrationStatus))return fail('season_runtime_cycle_not_activated');
 let verified;
 try{verified=await deps.verifyFullArchiveAndReplay(source,request)}catch{return fail('season_runtime_backup_proof_unavailable')}
 if(!O(verified)||verified.ok!==true||verified.restoreReplayVerified!==true||verified.includesOriginalMedia!==true||verified.externalCopyConfirmed!==true||verified.verificationScope!=='SECOND_DEVICE_VERIFIED'||verified.originalRevisionId!==source.meta.revisionId||!S(verified.verificationId))return fail('season_runtime_verified_full_archive_required');
 const currentErrors=deps.validateState(source);
 if(!Array.isArray(currentErrors)||currentErrors.length)return fail('season_runtime_source_invalid',currentErrors);
 let persistedSnapshot=null;
 const capabilities={
  ledger:deps.ledger,evidence:deps.evidence,dualRead:deps.dualRead,rules:deps.rules,
  provenance:deps.provenance,
  authorized:async(state,req)=>req.userConfirmed===true&&state.meta?.revisionId===verified.originalRevisionId,
  inspectState:deps.validateState,
  applyPhysicalOperation:async(state,req)=>{
   // Use an independent input so even a badly behaved executor cannot turn a
   // pre-execution baseline into its own forged comparison target.
   const result=await executor(structuredClone(state),req);
   if(!result?.ok||!O(result.draft))throw Error('physical_executor_rejected');
   if(!await stageWithinScope(state,result.draft,req))
    throw Error('physical_executor_mutated_unrelated_state');
   return result.draft;
  },
  persistIfRevision:async(candidate,expectedRevision)=>{
   const revision=deps.makeRevisionId();
   if(!S(revision)||revision===expectedRevision)return {ok:false};
   let prepared;
   // Pass a copy: a preparer mutating its argument must not rewrite the
   // staged source and then disguise the change as the new baseline.
   try{prepared=await deps.preparePersistentSnapshot(structuredClone(candidate),expectedRevision,revision)}catch{return {ok:false}};
   try{if(!await preparedIsSafe(candidate,prepared,revision))return {ok:false}}catch{return {ok:false}};
   try{await deps.writeMainIfUnchanged(prepared,expectedRevision)}catch{return {ok:false}};
   persistedSnapshot=prepared;
   return {ok:true,revisionId:revision};
  },
  readPersisted:deps.readMain
 };
 const result=await deps.transaction.commitVerifiedTransition(source,request,capabilities);
 if(!result.ok)return result;
 // Only the read-back state is trusted. Never announce success from an in-memory candidate.
 if(!O(persistedSnapshot)||result.revisionId!==persistedSnapshot.meta.revisionId)return fail('season_runtime_persisted_proof_missing_commit_uncertain');
 // Protect unrelated journal entries, archive metadata and original media:
 // a matching physical stage alone does not prove that the rest survived.
 let persistedMatches=false;
 try{persistedMatches=await sameData(persistedSnapshot,result.state)}catch{return fail('season_runtime_full_cold_read_unavailable_commit_uncertain')}
 if(!persistedMatches)return fail('season_runtime_full_cold_read_mismatch_commit_uncertain');
 return {...result,fullBackupVerificationId:verified.verificationId};
}
window.PasekaSectionalSeasonRuntimeV2=Object.freeze({commit,integrity:Object.freeze({sameData,preparedIsSafe})});
})();