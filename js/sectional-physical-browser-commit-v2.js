(function(root){
'use strict';
// Capability-bound OP11–14 adapter. NOT wired to the live wizard.
// The entire restore proof and CAS writer must come from trusted runtime
// capabilities. A manifest/checkbox can never authorize a physical write.
const OPS=new Set(['OP-11','OP-12','OP-13','OP-14']);
const O=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const S=x=>typeof x==='string'&&x.trim().length>0;
const fail=(error,details)=>({ok:false,error,...(details?{details}:{})});
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const stableFields=['operationId','hiveId','cycleId','sourceRevisionId','userConfirmed',
 'actualWorkConfirmed','occurredAt','targetLayout','bodyMoves','itemMoves',
 'storageLocations','strongestFamilyId','resultFamily','actualMergeConfirmed',
 'actualIsolationConfirmed','actualSeparationConfirmed','earlyHoneyHarvestConfirmed',
 'actualDiaphragmsRemovedConfirmed','familiesOnSeparateBottomsConfirmed'];
function samePlan(a,b){
 return stableFields.every(k=>equal(a?.[k],b?.[k]));
}
function validateStage(source,planned,deps){
 let staged;
 try{
  staged=deps.physicalExecutor.stage(structuredClone(source),planned.request,{
   now:deps.now,makeId:deps.makeId,
   PasekaEquipmentItems:deps.equipmentItems,PasekaFamilyLineage:deps.lineage});
 }catch{return fail('physical_bridge_stage_exception')}
 if(!staged?.ok||!O(staged.draft))
  return fail('physical_bridge_stage_invalid',staged);
 const layout=staged.draft.sectionalLayouts?.find(x=>x?.hiveId===planned.request.hiveId);
 if(!layout||layout.id!==planned.request.targetLayout.id)
  return fail('physical_bridge_target_layout_not_found');
 let physical,lineage,provenance,global;
 try{
  physical=deps.layout.validate(layout,staged.draft);
  lineage=deps.lineage.inspect(staged.draft);
  provenance=deps.provenance.validate(source,staged.draft,planned.request);
  global=deps.validateState(staged.draft);
 }catch{return fail('physical_bridge_required_inspector_failed')}
 if(!physical?.valid||!Array.isArray(lineage)||lineage.length||
    !Array.isArray(provenance)||provenance.length||
    !Array.isArray(global)||global.length)
  return fail('physical_bridge_full_stage_integrity_failed',{
   physicalErrors:physical?.errors||[],lineageErrors:lineage,
   provenanceErrors:provenance,globalErrors:global});
 return {ok:true};
}
async function commitWitnessed(input,expectedRevision,deps={}){
 if(!O(input)||!OPS.has(input.operationId)||input.userConfirmed!==true||
    input.actualWorkConfirmed!==true||!S(input.hiveId)||!S(input.occurredAt)||
    !S(expectedRevision)||!S(input.expectedSourceRevisionId)||
    input.expectedSourceRevisionId!==expectedRevision)
  return fail('physical_bridge_exact_user_input_and_revision_required');
 const methods=['readMain','writeMainIfUnchanged','verifyFullArchiveAndReplay',
  'validateState','makeRevisionId','preparePersistentSnapshot','makeId'];
 if(methods.some(k=>typeof deps[k]!=='function')||!S(deps.now)||
    !O(deps.runtime)||typeof deps.runtime.commit!=='function'||
    typeof deps.runtime.integrity?.sameData!=='function'||
    typeof deps.manifest?.plan!=='function'||
    typeof deps.physicalExecutor?.stage!=='function'||
    typeof deps.layout?.validate!=='function'||
    typeof deps.lineage?.inspect!=='function'||
    typeof deps.provenance?.validate!=='function'||
    typeof deps.equipmentItems?.place!=='function'||
    !O(deps.transaction)||!O(deps.evidence)||!O(deps.ledger)||
    !O(deps.dualRead)||!O(deps.rules))
  return fail('physical_bridge_missing_real_storage_or_restore_capabilities');
 let latest;
 try{latest=await deps.readMain()}catch{return fail('physical_bridge_state_read_failed')}
 if(!O(latest)||latest.meta?.revisionId!==expectedRevision)
  return fail('physical_bridge_stale_source_revision');
 let planned;
 try{planned=deps.manifest.plan(latest,input)}
 catch{return fail('physical_bridge_manifest_unavailable')}
 if(!planned?.ok||planned.previewOnly!==true||
    planned.sourceRevisionId!==expectedRevision||
    !O(planned.request)||planned.request.sourceRevisionId!==expectedRevision||
    planned.request.operationId!==input.operationId)
  return fail('physical_bridge_source_bound_manifest_invalid',planned);
 const checked=validateStage(latest,planned,deps);
 if(!checked.ok)return checked;
 const eventId=deps.makeId(),transactionId=deps.makeId();
 if(!S(eventId)||!S(transactionId)||eventId===transactionId)
  return fail('physical_bridge_event_ids_invalid');
 const request={...structuredClone(planned.request),eventId,transactionId,
  confirmedBy:'beekeeper'};
 const executor=async(state,req)=>{
  if(state.meta?.revisionId!==expectedRevision||
     req.sourceRevisionId!==expectedRevision||req.operationId!==input.operationId)
   return fail('physical_bridge_source_revision_changed_before_stage');
  let live;
  try{live=deps.manifest.plan(state,input)}catch{return fail('physical_bridge_manifest_recheck_failed')}
  if(!live?.ok||live.sourceRevisionId!==expectedRevision||
     !samePlan(live.request,planned.request)||
     !samePlan(live.request,req))
   return fail('physical_bridge_manifest_changed_before_stage');
  return deps.physicalExecutor.stage(state,req,{
   now:deps.now,makeId:deps.makeId,
   PasekaEquipmentItems:deps.equipmentItems,PasekaFamilyLineage:deps.lineage});
 };
 let result;
 try{
  result=await deps.runtime.commit(request,{
   readMain:deps.readMain,writeMainIfUnchanged:deps.writeMainIfUnchanged,
   verifyFullArchiveAndReplay:deps.verifyFullArchiveAndReplay,
   validateState:deps.validateState,makeRevisionId:deps.makeRevisionId,
   preparePersistentSnapshot:deps.preparePersistentSnapshot,
   transaction:deps.transaction,evidence:deps.evidence,ledger:deps.ledger,
   dualRead:deps.dualRead,rules:deps.rules,provenance:deps.provenance,
   executors:{[request.operationId]:executor}
  });
 }catch{return fail('physical_bridge_runtime_exception_no_durable_proof')}
 if(result?.ok!==true||result.durable!==true)
  return result?.ok===false?result:fail('physical_bridge_runtime_did_not_confirm_durability');
 return result;
}
root.PasekaSectionalPhysicalBrowserCommitV2=Object.freeze({
 commitWitnessed,writableOperations:[...OPS]});
})(typeof window!=='undefined'?window:globalThis);
