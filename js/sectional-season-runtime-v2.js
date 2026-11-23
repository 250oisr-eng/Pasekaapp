(function(){
'use strict';
// Capability-bound persistence bridge. Caller must supply real independent
// full backup verification, all local inspectors, and an atomic IDB CAS writer.
// Never infer backup success from a checkbox, filename or user statement.
const O=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const S=x=>typeof x==='string'&&x.trim().length>0;
const fail=(error,details)=>({ok:false,error,...(details?{details}:{})});
const ops=new Set(['OP-08','OP-09','OP-10','OP-11','OP-12','OP-13','OP-14']);
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
 if(!O(verified)||verified.ok!==true||verified.restoreReplayVerified!==true||verified.includesOriginalMedia!==true||verified.originalRevisionId!==source.meta.revisionId||!S(verified.verificationId))return fail('season_runtime_verified_full_archive_required');
 const currentErrors=deps.validateState(source);
 if(!Array.isArray(currentErrors)||currentErrors.length)return fail('season_runtime_source_invalid',currentErrors);
 let persistedSnapshot=null;
 const capabilities={
  ledger:deps.ledger,evidence:deps.evidence,dualRead:deps.dualRead,rules:deps.rules,
  provenance:deps.provenance,
  authorized:async(state,req)=>req.userConfirmed===true&&state.meta?.revisionId===verified.originalRevisionId,
  inspectState:deps.validateState,
  applyPhysicalOperation:async(state,req)=>{
   const result=await executor(state,req);
   if(!result?.ok||!O(result.draft))throw Error('physical_executor_rejected');
   return result.draft;
  },
  persistIfRevision:async(candidate,expectedRevision)=>{
   const revision=deps.makeRevisionId();
   if(!S(revision)||revision===expectedRevision)return {ok:false};
   let prepared;
   try{prepared=await deps.preparePersistentSnapshot(candidate,expectedRevision,revision)}catch{return {ok:false}};
   if(!O(prepared)||!O(prepared.meta)||prepared.meta.revisionId!==revision||!S(prepared.meta.revisionId))return {ok:false};
   // No mutation of equipment/family/season history by the snapshot preparer.
   for(const key of ['sectionalLayouts','equipmentInventory','families','queens','familyEvents','queenEvents','sectionalSeasonCycles','sectionalTechProcessesArchive']){
    if(JSON.stringify(prepared[key])!==JSON.stringify(candidate[key]))return {ok:false};
   }
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
 return {...result,fullBackupVerificationId:verified.verificationId};
}
window.PasekaSectionalSeasonRuntimeV2=Object.freeze({commit});
})();