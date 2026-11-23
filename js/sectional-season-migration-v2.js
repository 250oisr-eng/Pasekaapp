(function(){
'use strict';
// Pure migration candidate only. Caller must provide a separately VERIFIED full backup,
// execute one atomic state CAS, re-open IndexedDB and verify restore before activation.
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const str=x=>typeof x==='string'&&x.trim().length>0;
const fail=(code,details)=>({ok:false,error:code,...(details?{details}:{})});
function planMigration(state,request,deps){
 if(!obj(state)||!obj(request)||!deps?.ledger||!deps?.evidence||!deps?.dualRead||typeof deps.inspectV1!=='function'||typeof deps.inspectPhysical!=='function')return fail('migration_dependencies_invalid');
 if(!str(request.expectedRevisionId)||state.meta?.revisionId!==request.expectedRevisionId||!str(request.backupVerificationId)||request.fullBackupVerified!==true||request.restoreReplayVerified!==true)return fail('migration_restore_gate_required');
 if(!Array.isArray(state.sectionalTechProcesses)||!Array.isArray(state.sectionalLayouts)||!Array.isArray(state.families)||!Array.isArray(state.queens)||!obj(state.equipmentInventory))return fail('migration_source_shape_invalid');
 const oldErrors=deps.inspectV1(state),physicalErrors=deps.inspectPhysical(state);
 if(!Array.isArray(oldErrors)||oldErrors.length||!Array.isArray(physicalErrors)||physicalErrors.length)return fail('migration_source_integrity_failed');
 if(deps.dualRead.inspectMixedState(state,{ledger:deps.ledger}).length)return fail('migration_preexisting_season_data_invalid');
 const old=state.sectionalTechProcesses;
 if(!old.length)return fail('migration_no_legacy_records');
 const archive=state.sectionalTechProcessesArchive;
 if(archive!=null&&(!Array.isArray(archive)||archive.length))return fail('migration_existing_archive_requires_manual_review');
 const previous=state.sectionalSeasonCycles;
 if(previous!=null&&(!Array.isArray(previous)||previous.length))return fail('migration_existing_v2_requires_manual_review');
 const converted=deps.ledger.previewV1(old);
 if(!converted.ok)return fail('migration_legacy_preview_rejected',converted.errors);
 const candidate=structuredClone(state);
 candidate.sectionalTechProcessesArchive=structuredClone(old);
 candidate.sectionalTechProcesses=[];
 candidate.sectionalSeasonCycles=converted.records.map(rec=>{
  const snap=deps.evidence.physicalSnapshot(state,rec.hiveId);
  if(!snap.ok)throw Object.assign(new Error('baseline failed'),{code:snap.error});
  return {...rec,migrationStatus:'BASELINE_IMPORTED_PENDING_ACTIVATION',
   events:[{id:'baseline:'+rec.id,type:'BASELINE_IMPORTED',occurredAt:request.occurredAt,evidence:{
    snapshot:snap.snapshot,sourceLegacyId:rec.legacy.sourceId,sourceRevisionId:request.expectedRevisionId,
    backupVerificationId:request.backupVerificationId,restoreReplayVerified:true
   }}]};
 });
 const postErrors=[...deps.ledger.inspect(candidate.sectionalSeasonCycles),...deps.dualRead.inspectMixedState(candidate,{ledger:deps.ledger})];
 if(postErrors.length)return fail('migration_candidate_integrity_failed',postErrors);
 if(JSON.stringify(candidate.sectionalTechProcessesArchive)!==JSON.stringify(old))return fail('migration_legacy_archive_changed');
 return {ok:true,notPersisted:true,requiresAtomicCAS:true,expectedRevisionId:request.expectedRevisionId,
  candidate,originalState:structuredClone(state),migrationCount:old.length};
}
window.PasekaSectionalSeasonMigrationV2=Object.freeze({planMigration});
})();