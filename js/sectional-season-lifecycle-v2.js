(function(){
'use strict';
// Durable ledger lifecycle. No automatic confirmation or physical equipment mutation.
const O=x=>x!==null&&typeof x==='object'&&!Array.isArray(x),S=x=>typeof x==='string'&&x.trim().length>0;
const fail=(error,details)=>({ok:false,error,...(details?{details}:{})});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function change(mode,request,deps){
 if(!['OPEN','CLOSE'].includes(mode)||!O(request)||request.userConfirmed!==true||request.physicalStatePersonallyVerified!==true||!S(request.hiveId)||!S(request.occurredAt)||!Number.isFinite(Date.parse(request.occurredAt))||!S(request.confirmationRef)||!O(deps)||!O(deps.ledger)||!O(deps.evidence)||!O(deps.dualRead))return fail('season_lifecycle_confirmation_or_dependencies_missing');
 const funcs=['readMain','writeMainIfUnchanged','verifyFullArchiveAndReplay','validateState','makeRevisionId','preparePersistentSnapshot'];
 if(funcs.some(k=>typeof deps[k]!=='function'))return fail('season_lifecycle_storage_capability_missing');
 let source;
 try{source=await deps.readMain()}catch{return fail('season_lifecycle_read_failed')}
 if(!O(source)||!S(source.meta?.revisionId)||!Array.isArray(source.sectionalTechProcesses)||source.sectionalTechProcesses.some(p=>p.hiveId===request.hiveId))return fail('season_lifecycle_legacy_or_revision_not_ready');
 const h=Array.isArray(source.hives)?source.hives.find(x=>x.id===request.hiveId):null;
 if(h?.profileId!=='sectional-multiqueen-v1')return fail('season_lifecycle_profile_not_sectional');
 const inspection=deps.validateState(source);
 if(!Array.isArray(inspection)||inspection.length||deps.dualRead.inspectMixedState(source,{ledger:deps.ledger}).length)return fail('season_lifecycle_existing_state_invalid');
 let proof;
 try{proof=await deps.verifyFullArchiveAndReplay(source,request)}catch{return fail('season_lifecycle_full_archive_unavailable')}
 if(!O(proof)||proof.ok!==true||proof.restoreReplayVerified!==true||proof.includesOriginalMedia!==true||proof.externalCopyConfirmed!==true||proof.verificationScope!=='SECOND_DEVICE_VERIFIED'||!S(proof.verificationId)||proof.originalRevisionId!==source.meta.revisionId)return fail('season_lifecycle_full_archive_not_verified');
 const records=Array.isArray(source.sectionalSeasonCycles)?source.sectionalSeasonCycles:[];
 const layout=(Array.isArray(source.sectionalLayouts)?source.sectionalLayouts:[]).filter(l=>l.hiveId===request.hiveId);
 if(layout.length!==1)return fail('season_lifecycle_physical_layout_missing');
 let plan;
 if(mode==='OPEN'){
  if(layout[0].mode!=='SINGLE_FAMILY'||layout[0].sections?.length!==1||layout[0].sections[0].broodBodyIds?.length!==3)return fail('season_open_requires_three_brood_body_single_family');
  if(!S(request.cycleId))return fail('season_open_cycle_id_required');
  plan=deps.ledger.planNewCycle(records,{id:request.cycleId,hiveId:request.hiveId,occurredAt:request.occurredAt});
 }else{
  if(layout[0].mode!=='SINGLE_FAMILY'||!S(request.cycleId)||!S(request.eventId))return fail('season_close_terminal_layout_or_ids_missing');
  const current=records.find(c=>c.id===request.cycleId&&c.hiveId===request.hiveId&&c.status==='ACTIVE');
  if(!current)return fail('season_close_active_cycle_missing');
  const last=current.events?.filter(e=>e.type==='STAGE_CONFIRMED').at(-1);
  const snapshot=deps.evidence.physicalSnapshot(source,request.hiveId);
  if(!snapshot.ok||!last||!same(last.evidence?.after,snapshot.snapshot))return fail('season_close_terminal_snapshot_outdated');
  plan=deps.ledger.planCloseCycle(records,{id:request.eventId,cycleId:request.cycleId,userConfirmed:true,confirmationRef:request.confirmationRef,occurredAt:request.occurredAt});
 }
 if(!plan?.ok)return fail('season_lifecycle_plan_rejected',plan?.errors);
 const revision=deps.makeRevisionId();
 if(!S(revision)||revision===source.meta.revisionId)return fail('season_lifecycle_new_revision_invalid');
 const candidate=structuredClone(source);
 candidate.sectionalSeasonCycles=plan.records;
 let prepared;
 try{prepared=await deps.preparePersistentSnapshot(candidate,source.meta.revisionId,revision)}catch{return fail('season_lifecycle_snapshot_preparation_failed')}
 if(!O(prepared)||prepared.meta?.revisionId!==revision||!same(prepared.sectionalSeasonCycles,plan.records))return fail('season_lifecycle_snapshot_changed');
 for(const key of ['equipmentInventory','families','queens','familyEvents','queenEvents','sectionalLayouts','sectionalTechProcesses','sectionalTechProcessesArchive']){
  if(!same(prepared[key],source[key]))return fail('season_lifecycle_physical_state_would_change');
 }
 let written=false;
 try{await deps.writeMainIfUnchanged(prepared,source.meta.revisionId);written=true}catch{return fail('season_lifecycle_cas_failed_or_unknown')}
 let durable;
 try{durable=await deps.readMain()}catch{return fail('season_lifecycle_cold_read_failed_commit_uncertain')}
 if(!O(durable)||durable.meta?.revisionId!==revision||!same(durable.sectionalSeasonCycles,plan.records))return fail('season_lifecycle_cold_read_mismatch_commit_uncertain');
 const errors=[...deps.validateState(durable),...deps.dualRead.inspectMixedState(durable,{ledger:deps.ledger}),...deps.evidence.inspectStages(durable.sectionalSeasonCycles)];
 if(errors.length)return fail('season_lifecycle_saved_integrity_failed_commit_uncertain',errors);
 return {ok:true,durable:true,mode,cycleId:request.cycleId,revisionId:revision,state:durable,fullBackupVerificationId:proof.verificationId};
}
window.PasekaSectionalSeasonLifecycleV2=Object.freeze({open:(request,deps)=>change('OPEN',request,deps),close:(request,deps)=>change('CLOSE',request,deps)});
})();