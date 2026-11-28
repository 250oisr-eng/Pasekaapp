(()=>{'use strict';
// A synthetic candidate verifier, NOT an OP11 execution path. It must not be
// included in the live shell or exposed as a completion/persistence adapter.
// DOCX paras 52–60; user must confirm the physical operation independently.
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const str=x=>typeof x==='string'&&x.trim().length>0;
const reject=(error,details={})=>({ok:false,error,details});
const loc=(hiveId,stackId)=>({type:'hive',hiveId,stackId});
function assess(state,request,deps={}){
 const Preview=window.PasekaSectionalOP11Preview;
 const Layout=window.PasekaSectionalPhysicalLayout;
 const Lineage=window.PasekaFamilyLineage;
 const Items=window.PasekaEquipmentItems;
 if(!Preview?.preview||!Layout?.validate||!Lineage?.applyMerge||!Lineage?.inspect||
    !Items?.place||!Items?.inspect||!Items?.validateReferences)
  return reject('op11_candidate_dependencies_missing');
 const plan=Preview.preview(state,request);
 if(!plan.ok)return plan;
 // The preview may display a ventilation not yet selected. A transition
 // candidate must never assume an author preference or fill it automatically.
 if(!['upper_only','lower_round_plus_ceiling'].includes(plan.ventilationOption))
  return reject('op11_candidate_explicit_ventilation_required');
 if(!str(request?.resultFamilyId)||!str(request?.storageLabel)||
    request.storageLabel.length>160||!str(request?.techProcessId))
  return reject('op11_candidate_result_family_storage_and_process_required');
 if(typeof deps.makeId!=='function')return reject('op11_candidate_id_generator_required');
 if(!Array.isArray(state.families)||!Array.isArray(state.queens)||
    !Array.isArray(state.familyEvents)||!Array.isArray(state.queenEvents)||
    !obj(state.equipmentInventory)||!Array.isArray(state.equipmentInventory.itemEvents))
  return reject('op11_candidate_existing_history_ledgers_required');
 if(state.families.some(f=>f?.id===request.resultFamilyId))
  return reject('op11_candidate_result_family_duplicate');
 if(state.familyEvents.some(event=>event?.type==='merge'&&event.operationId==='OP-11'&&
    event.techProcessId===request.techProcessId&&event.hiveId===plan.hiveId))
  return reject('op11_candidate_operation_already_recorded');
 const sources=plan.originalFamilyIds.map(fid=>state.families.find(f=>f?.id===fid));
 if(sources.some(f=>f?.queenIdentityStatus!=='identified'||!str(f.currentQueenId)))
  return reject('op11_candidate_lineage_queen_identification_incomplete');
 const queens=sources.map(f=>state.queens.find(q=>q?.id===f.currentQueenId&&q.familyId===f.id&&q.status==='current'));
 if(queens.some(q=>!q)||new Set(queens.map(q=>q.id)).size!==3)
  return reject('op11_candidate_lineage_queen_references_invalid');
 const inventory=state.equipmentInventory;
 const sourceLayout=state.sectionalLayouts.find(l=>l.hiveId===plan.hiveId);
 if(!sourceLayout)return reject('op11_candidate_source_layout_missing');
 const sourceStacks=sourceLayout.stacks;
 const originalInstalled=sourceStacks.flatMap(s=>[s.bottomItemId,s.coverItemId,s.topRiserItemId]).concat(plan.removeTechnicalExcluderItemIds);
 if(new Set(originalInstalled).size!==originalInstalled.length)
  return reject('op11_candidate_installed_item_alias');
 const selected=[plan.retainedBottomItemId,plan.retainedCoverItemId,
  plan.retainedTopRiserItemId,plan.ceilingFeederItemId];
 const plugs=plan.closureAssignments.map(row=>row.plasticPlugItemId);
 const selectedSet=new Set([...selected,...plugs]);
 if(selectedSet.size!==selected.length+plugs.length)
  return reject('op11_candidate_selected_item_alias');
 const movedToStorage=[...new Set(originalInstalled.concat(selected.filter(id=>
  inventory.items[id]?.location?.type==='hive')))];
 const removedBodies=plan.removedBodyIds.map(id=>inventory.bodies?.[id]);
 if(removedBodies.some(b=>!obj(b)||b.kind!=='brood'||b.condition!=='good'))
  return reject('op11_candidate_lower_brood_inventory_missing');
 let candidate;
 try{candidate=structuredClone(state)}
 catch{return reject('op11_candidate_clone_failed')}
 const moves=[],created=[],at=typeof request.occurredAt==='string'?request.occurredAt:null;
 if(!at||!Number.isFinite(Date.parse(at)))
  return reject('op11_candidate_timestamp_required');
 const generated=()=>{const id=deps.makeId();if(str(id))created.push(id);return id};
 function itemMove(id,location){
  const before=structuredClone(candidate.equipmentInventory.items[id]?.location);
  const result=Items.place(candidate,{itemId:id,location},generated,at);
  if(!result.ok)return result;
  moves.push({itemId:id,from:before,to:structuredClone(location)});
  return {ok:true};
 }
 // Move all old installed accessories to storage first, retaining event
 // provenance through the same inventory API as the production coordinator.
 for(const itemId of movedToStorage){
  const result=itemMove(itemId,{type:'storage',label:request.storageLabel});
  if(!result.ok)return reject('op11_candidate_stage_accessory_storage_failed',
   {itemId,reason:result.error,details:result.details||null});
 }
 const originalSections=sourceLayout.sections;
 const upperOpenings=originalSections.flatMap(s=>s.openings.filter(o=>
  plan.retainedBodyIds.includes(o.bodyId))).map(o=>structuredClone(o));
 const mergedSectionId='op11-combined-'+request.resultFamilyId;
 const newLayout=candidate.sectionalLayouts.find(l=>l.hiveId===plan.hiveId);
 newLayout.mode='SINGLE_FAMILY';newLayout.purpose='primary_wintering';
 delete newLayout.broodRows;delete newLayout.honeyStack;
 newLayout.sections=[{id:mergedSectionId,position:'combined',
  familyId:request.resultFamilyId,broodBodyIds:[...plan.retainedBodyIds],
  upperBroodBodyId:plan.retainedBodyIds.at(-1),openings:upperOpenings}];
 newLayout.stacks=[{id:'combined',position:'combined',sectionIds:[mergedSectionId],
  bottomItemId:plan.retainedBottomItemId,coverItemId:plan.retainedCoverItemId,
  topRiserItemId:plan.retainedTopRiserItemId,feederItemId:plan.ceilingFeederItemId}];
 newLayout.technicalConnections=[];newLayout.meshDiaphragms=[];newLayout.temporaryQueenIsolation=[];
 newLayout.closedOpenings=plan.closureAssignments.map(x=>({
  bodyId:x.bodyId,openingId:x.openingId,itemId:x.plasticPlugItemId
 }));
 newLayout.closuresConfirmed=true;
 // Reuse the established family/queen lineage mechanism, but only on the
 // detached candidate. Its source-placement guard must hold, not be bypassed.
 const merger=Lineage.applyMerge(candidate,{
  operationId:'OP-11',sourceFamilyIds:[...plan.originalFamilyIds],
  scenario:'PRIMARY_WINTERING',techProcessId:request.techProcessId,
  occurredAt:at,resultFamily:{id:request.resultFamilyId,hive:plan.hiveId}
 },generated,at);
 if(!merger.ok)return reject('op11_candidate_lineage_stage_failed',
  {reason:merger.error,details:merger.details||null});
 for(const [itemId,location] of [
  [plan.retainedBottomItemId,loc(plan.hiveId,'combined')],
  [plan.retainedCoverItemId,loc(plan.hiveId,'combined')],
  [plan.retainedTopRiserItemId,loc(plan.hiveId,'combined')],
  [plan.ceilingFeederItemId,loc(plan.hiveId,'combined')],
  ...plan.closureAssignments.map(x=>[x.plasticPlugItemId,
   {type:'hive',hiveId:plan.hiveId,bodyId:x.bodyId,openingId:x.openingId}])
 ]){
  const result=itemMove(itemId,location);
  if(!result.ok)return reject('op11_candidate_stage_item_install_failed',
   {itemId,reason:result.error,details:result.details||null});
 }
 const physical=Layout.validate(newLayout,candidate);
 if(!physical.valid)return reject('op11_candidate_physical_validator_failed',
  {codes:physical.errors.map(e=>e.code)});
 const lineageErrors=Lineage.inspect(candidate);
 if(lineageErrors.length)return reject('op11_candidate_lineage_validator_failed',
  {codes:lineageErrors.map(e=>e.code)});
 const itemErrors=[...Items.inspect(candidate),...Items.validateReferences(candidate)];
 if(itemErrors.length)return reject('op11_candidate_item_validator_failed',
  {codes:itemErrors.map(e=>e.code)});
 // This simulator intentionally cannot write the missing body/frame events,
 // coordinator audit evidence, required physical confirmations or CAS/backup.
 // Never return the candidate object (which contains a proposed merge event).
 return {ok:true,readOnly:true,simulated:true,
  operationId:'OP-11',hiveId:plan.hiveId,sourceRevisionId:plan.sourceRevisionId,
  sourceFamilies:[...plan.originalFamilyIds],candidateFamilyId:request.resultFamilyId,
  targetMode:newLayout.mode,retainedBodyIds:[...plan.retainedBodyIds],
  removedBodyIds:[...plan.removedBodyIds],plannedItemMoves:moves,
  plannedEventIds:[...created],candidatePhysicalValidated:true,
  candidateLineageValidated:true,candidateInventoryValidated:true,
  survivingQueenId:null,queenIdentityStatus:'unresolved',
  bodyAndFrameHistoryStaged:false,coordinatorCompletionStaged:false,
  physicalCompletionConfirmed:false,
  backupRestoreProven:false,readyForPersistence:false,completionRecorded:false,
  unresolvedWriteGates:[
   'original_body_frame_movement_history',
   'op11_tech_process_and_global_audit_log',
   'explicit_physical_operation_confirmation',
   'durable_revision_compare_and_swap',
   'independent_backup_restore',
   'offline_device_rollback_proof'
  ]};
}
window.PasekaSectionalOP11Candidate=Object.freeze({assess});
})();
