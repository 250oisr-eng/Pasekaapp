(function(){
'use strict';
// Two-phase CAS migration. Never auto-activates a legacy season.
// No writes without independent full-media backup+restore proof tied to revision.
const O=x=>x!==null&&typeof x==='object'&&!Array.isArray(x),S=x=>typeof x==='string'&&x.trim().length>0;
const fail=(error,details)=>({ok:false,error,...(details?{details}:{})});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function proof(deps,source,request){
 if(typeof deps.verifyFullArchiveAndReplay!=='function')return null;
 let p;try{p=await deps.verifyFullArchiveAndReplay(source,request)}catch{return null}
 if(!O(p)||p.ok!==true||p.restoreReplayVerified!==true||p.includesOriginalMedia!==true||p.externalCopyConfirmed!==true||p.verificationScope!=='SECOND_DEVICE_VERIFIED'||!S(p.verificationId)||p.originalRevisionId!==source.meta?.revisionId)return null;
 return p;
}
async function writeAndRead(source,candidate,deps){
 const old=source.meta.revisionId,revision=deps.makeRevisionId();
 if(!S(revision)||revision===old)return fail('migration_new_revision_invalid');
 candidate.meta={...candidate.meta,revisionId:revision};
 if(!same(source.equipmentInventory,candidate.equipmentInventory)||!same(source.families,candidate.families)||!same(source.queens,candidate.queens)||!same(source.familyEvents,candidate.familyEvents)||!same(source.queenEvents,candidate.queenEvents)||!same(source.sectionalLayouts,candidate.sectionalLayouts))return fail('migration_physical_state_would_change');
 try{await deps.writeMainIfUnchanged(candidate,old)}catch{return fail('migration_cas_failed_or_uncertain')}
 let result;try{result=await deps.readMain()}catch{return fail('migration_cold_read_failed_commit_uncertain')}
 if(!O(result)||result.meta?.revisionId!==revision||!same(result.sectionalTechProcesses,candidate.sectionalTechProcesses)||!same(result.sectionalTechProcessesArchive,candidate.sectionalTechProcessesArchive)||!same(result.sectionalSeasonCycles,candidate.sectionalSeasonCycles))return fail('migration_cold_read_mismatch_commit_uncertain');
 return {ok:true,durable:true,state:result,revisionId:revision};
}
function capabilities(deps){
 return ['readMain','writeMainIfUnchanged','makeRevisionId','verifyFullArchiveAndReplay','inspectV1','inspectPhysical'].every(k=>typeof deps?.[k]==='function')&&O(deps.ledger)&&O(deps.evidence)&&O(deps.dualRead)&&O(deps.migration);
}
async function importLegacy(request,deps={}){
 if(!capabilities(deps)||!O(request)||request.userConfirmed!==true||!S(request.occurredAt)||!Number.isFinite(Date.parse(request.occurredAt)))return fail('migration_capabilities_or_user_confirmation_missing');
 let source;try{source=await deps.readMain()}catch{return fail('migration_main_read_failed')}
 if(!O(source)||!S(source.meta?.revisionId))return fail('migration_revision_missing');
 const verified=await proof(deps,source,request);
 if(!verified)return fail('migration_full_backup_restore_proof_required');
 const plan=deps.migration.planMigration(source,{expectedRevisionId:source.meta.revisionId,backupVerificationId:verified.verificationId,fullBackupVerified:true,restoreReplayVerified:true,occurredAt:request.occurredAt},{ledger:deps.ledger,evidence:deps.evidence,dualRead:deps.dualRead,inspectV1:deps.inspectV1,inspectPhysical:deps.inspectPhysical});
 if(!plan?.ok)return fail(plan?.error||'migration_plan_failed',plan?.details||plan?.errors);
 const candidate=plan.candidate;
 if(!same(candidate.sectionalTechProcessesArchive,source.sectionalTechProcesses)||candidate.sectionalSeasonCycles.some(c=>c.migrationStatus!=='BASELINE_IMPORTED_PENDING_ACTIVATION'))return fail('migration_plan_not_reversible');
 const result=await writeAndRead(source,candidate,deps);
 return result.ok?{...result,phase:'IMPORTED_NOT_ACTIVATED',verificationId:verified.verificationId,migrationCount:plan.migrationCount}:result;
}
async function activateLegacy(request,deps={}){
 if(!capabilities(deps)||!O(request)||request.userConfirmed!==true||request.physicalLayoutPersonallyVerified!==true||!S(request.confirmationRef))return fail('activation_personal_physical_reconciliation_required');
 let source;try{source=await deps.readMain()}catch{return fail('activation_main_read_failed')}
 if(!O(source)||!S(source.meta?.revisionId))return fail('activation_revision_missing');
 const verified=await proof(deps,source,request);
 if(!verified)return fail('activation_full_backup_restore_proof_required');
 const archive=source.sectionalTechProcessesArchive,cycles=source.sectionalSeasonCycles;
 if(!Array.isArray(archive)||!archive.length||!Array.isArray(cycles)||cycles.length!==archive.length||!Array.isArray(source.sectionalTechProcesses)||source.sectionalTechProcesses.length)return fail('activation_legacy_archive_invalid');
 const preview=deps.ledger.previewV1(archive);
 if(!preview.ok||preview.records.length!==cycles.length)return fail('activation_legacy_preview_invalid');
 const candidate=structuredClone(source);
 for(const cycle of candidate.sectionalSeasonCycles){
  if(cycle.migrationStatus!=='BASELINE_IMPORTED_PENDING_ACTIVATION'||cycle.status!=='ACTIVE'||cycle.events?.length!==1||cycle.events[0]?.type!=='BASELINE_IMPORTED')return fail('activation_imported_cycle_changed');
  const original=archive.find(p=>p.id===cycle.legacy?.sourceId);
  if(!original||!same(original,cycle.legacy.original))return fail('activation_legacy_provenance_mismatch');
  const snapshot=deps.evidence.physicalSnapshot(source,cycle.hiveId);
  if(!snapshot.ok||!same(snapshot.snapshot,cycle.events[0].evidence?.snapshot))return fail('activation_physical_snapshot_mismatch');
  cycle.migrationStatus='ACTIVATED';
  cycle.activation={confirmedBy:'beekeeper',confirmationRef:request.confirmationRef,fullBackupVerificationId:verified.verificationId};
 }
 const errs=[...deps.ledger.inspect(candidate.sectionalSeasonCycles),...deps.evidence.inspectStages(candidate.sectionalSeasonCycles),...deps.dualRead.inspectMixedState(candidate,{ledger:deps.ledger})];
 if(errs.length)return fail('activation_integrity_failed',errs);
 const result=await writeAndRead(source,candidate,deps);
 return result.ok?{...result,phase:'ACTIVATED',verificationId:verified.verificationId}:result;
}
window.PasekaSectionalSeasonMigrationRuntimeV2=Object.freeze({importLegacy,activateLegacy});
})();