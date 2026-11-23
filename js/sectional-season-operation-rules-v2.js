(function(){
'use strict';
// Rules for an already staged physical transaction, never an equipment mover.
// These are additional guards, not substitutes for inventory/lineage/physical inspectors.
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const rows=x=>Array.isArray(x)?x:[];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const ids=x=>rows(x).map(v=>v?.id);
function validate(before,after,request){
 const errors=[],add=(code)=>errors.push({code});
 if(!obj(before)||!obj(after)||!obj(request))return [{code:'operation_transition_required'}];
 const old=before.layout,newer=after.layout,op=request.operationId;
 if(before.hiveId!==after.hiveId||before.profileId!=='sectional-multiqueen-v1'||after.profileId!=='sectional-multiqueen-v1')add('operation_hive_profile_mismatch');
 if(!obj(old)||!obj(newer))return [...errors,{code:'operation_layout_required'}];
 if(request.userConfirmed!==true)add('operation_user_confirmation_required');
 const oldHoney=rows(old.honeyStack?.bodyIds),newHoney=rows(newer.honeyStack?.bodyIds);
 const families=layout=>rows(layout.sections).map(s=>s?.familyId);
 const broodCount=layout=>rows(layout.sections).reduce((n,s)=>n+rows(s?.broodBodyIds).length,0);
 const oldBodies=Object.keys(before.bodyInventory||{}),newBodies=Object.keys(after.bodyInventory||{});
 if(!['OP-04','OP-05','OP-06','OP-07','OP-08','OP-09','OP-10','OP-11','OP-12','OP-13','OP-14'].includes(op))return [...errors,{code:'operation_v2_rule_missing'}];

 if(op==='OP-04'){
  const oldSections=rows(old.sections),newSections=rows(newer.sections);
  const initial=old.mode==='SINGLE_FAMILY'&&oldSections.length===1&&oldSections[0]?.broodBodyIds?.length===3;
  const firstRow=newer.mode==='SIDE_BY_SIDE'&&newSections.length===3&&newSections.every(section=>rows(section.broodBodyIds).length===1);
  const secondRow=old.mode==='SIDE_BY_SIDE'&&oldSections.length===3&&oldSections.every(section=>rows(section.broodBodyIds).length===1)&&newer.mode==='SIDE_BY_SIDE'&&newSections.length===3&&newSections.every(section=>rows(section.broodBodyIds).length===2);
  const immediate=newer.mode==='SIDE_BY_SIDE'&&newSections.length===3&&newSections.every(section=>rows(section.broodBodyIds).length===2);
  if(!(initial&&(firstRow||immediate)||secondRow)||oldHoney.length||newHoney.length)add('op04_physical_transition_shape_invalid');
  if(initial&&new Set(families(newer)).size!==3)add('op04_three_distinct_result_families_required');
  if(secondRow){
   if(!same([...families(old)].sort(),[...families(newer)].sort()))add('op04_second_row_family_identity_changed');
   for(const section of oldSections){
    const next=newSections.find(s=>s.id===section.id);
    if(!next||!rows(next.broodBodyIds).includes(section.broodBodyIds[0])||rows(next.broodBodyIds).length!==2)add('op04_second_row_original_body_not_preserved');
   }
   if(request.actualSecondRowConfirmed!==true)add('op04_second_row_personal_confirmation_missing');
  }
 }
 if(op==='OP-05'){
  const normalize=layout=>{const out=structuredClone(layout);delete out.temporaryQueenIsolation;return out;};
  if(old.mode!=='SIDE_BY_SIDE'||newer.mode!=='SIDE_BY_SIDE'||oldHoney.length||newHoney.length||!same(normalize(old),normalize(newer))||rows(newer.temporaryQueenIsolation).length!==8||rows(old.temporaryQueenIsolation).length)add('op05_mesh_coverage_change_invalid');
  if(request.standLevelConfirmed!==true)add('op05_stand_level_confirmation_missing');
 }
 if(op==='OP-06'){
  const normalize=layout=>{const out=structuredClone(layout);delete out.temporaryQueenIsolation;return out;};
  if(old.mode!=='SIDE_BY_SIDE'||newer.mode!=='SIDE_BY_SIDE'||!same(normalize(old),normalize(newer))||rows(newer.temporaryQueenIsolation).length!==0||![0,8].includes(rows(old.temporaryQueenIsolation).length))add('op06_temporary_mesh_removal_invalid');
  if(request.threeQueensPersonallyVerified!==true||request.twoQueenOutcome===true)add('op06_all_three_queens_required');
 }
 if(op==='OP-07'){
  const withoutHoney=layout=>{const out=structuredClone(layout);delete out.honeyStack;for(const stack of rows(out.stacks)){delete stack.coverItemId;delete stack.topRiserItemId;}return out;};
  if(old.mode!=='SIDE_BY_SIDE'||newer.mode!=='SIDE_BY_SIDE'||oldHoney.length||![2,4].includes(newHoney.length)||!same(withoutHoney(old),withoutHoney(newer))||rows(newer.honeyStack?.excluders).length!==2||!same(families(old),families(newer)))add('op07_confirmed_honey_body_installation_invalid');
  if(rows(newer.stacks).some(stack=>stack.coverItemId||stack.topRiserItemId))add('op07_covers_not_removed');
 }
 if(op==='OP-08'){
  if(old.mode!=='SIDE_BY_SIDE'||newer.mode!=='SIDE_BY_SIDE'||newHoney.length!==oldHoney.length||!same(oldHoney,newHoney)||!same(families(old),families(newer)))add('op08_layout_must_stay_stable');
  const sealed=rows(request.sealedFrameIds);
  if(!sealed.length||sealed.some(x=>typeof x!=='string'||!x)||new Set(sealed).size!==sealed.length||request.sealingObserved!==true)add('op08_sealed_frame_evidence_required');
  const initialFrames=oldHoney.flatMap(id=>rows(before.bodyInventory?.[id]?.frames).map(f=>f?.frameId));
  if(sealed.some(id=>!initialFrames.includes(id)))add('op08_frames_not_in_honey_bodies');
  const postFrames=newHoney.flatMap(id=>rows(after.bodyInventory?.[id]?.frames).map(f=>f?.frameId));
  if(sealed.some(id=>!postFrames.includes(id)))add('op08_frames_missing_after_extraction');
  if(sealed.some(id=>{
   const initial=oldHoney.flatMap(body=>rows(before.bodyInventory?.[body]?.frames)).find(f=>f?.frameId===id);
   const final=newHoney.flatMap(body=>rows(after.bodyInventory?.[body]?.frames)).find(f=>f?.frameId===id);
   return same(initial,final)||rows(final?.history).length<=rows(initial?.history).length;
  }))add('op08_no_frame_history_change');
 }
 if(op==='OP-09'){
  if(old.mode!=='SIDE_BY_SIDE'||newer.mode!=='SIDE_BY_SIDE'||!same(old,newer)||!same(before.bodyInventory,after.bodyInventory)||!same(before.families,after.families)||!same(before.queens,after.queens))add('op09_must_only_observe_entrances');
  const prev=rows(before.seasonalEntranceObservations),next=rows(after.seasonalEntranceObservations);
  if(next.length!==prev.length+1||!same(prev,next.slice(0,-1))||next.at(-1)?.operationId!=='OP-09'||next.at(-1)?.phase!==request.seasonPhase||next.at(-1)?.userConfirmed!==true||request.entrancesPersonallyObserved!==true)add('op09_observed_entrance_event_required');
 }
 if(op==='OP-10'){
  if(old.mode!=='SIDE_BY_SIDE'||newer.mode!=='SIDE_BY_SIDE'||![2,4].includes(oldHoney.length)||newHoney.length!==0||newer.honeyStack!=null)add('op10_honey_removal_required');
  if(request.excludersStoredConfirmed!==true||request.honeyBodiesStoredConfirmed!==true)add('op10_equipment_storage_confirmation_required');
  if(!same(families(old),families(newer)))add('op10_family_transition_forbidden');
 }
 if(op==='OP-11'){
  if(old.mode!=='SIDE_BY_SIDE'||newer.mode!=='SINGLE_FAMILY'||rows(old.sections).length!==3||rows(newer.sections).length!==1||newHoney.length||oldHoney.length||broodCount(newer)!==3)add('op11_primary_wintering_layout_invalid');
  if(newer.sections?.[0]?.familyId==null||request.queenIdentityAutoSelected===true||request.actualMergeConfirmed!==true)add('op11_confirmed_merge_required');
 }
 if(op==='OP-12'){
  if(old.mode!=='SIDE_BY_SIDE'||newer.mode!=='ALTERNATIVE_WINTERING_COLUMN'||rows(newer.sections).length!==3||broodCount(newer)!==4||oldHoney.length||newHoney.length||rows(newer.meshDiaphragms).length!==2)add('op12_alternative_wintering_layout_invalid');
  if(!same([...families(old)].sort(),[...families(newer)].sort())||request.actualIsolationConfirmed!==true)add('op12_three_families_must_remain');
 }
 if(op==='OP-13'){
  if(old.mode!=='ALTERNATIVE_WINTERING_COLUMN'||newer.mode!=='SIDE_BY_SIDE'||rows(newer.sections).length!==3||rows(newer.meshDiaphragms).length!==0||newHoney.length||!same([...families(old)].sort(),[...families(newer)].sort()))add('op13_spring_reposition_invalid');
  if(request.actualSeparationConfirmed!==true||request.queenObservationConfirmed!==true)add('op13_observed_separation_required');
 }
 if(op==='OP-14'){
  if(old.mode!=='SIDE_BY_SIDE'||newer.mode!=='SINGLE_FAMILY'||rows(newer.sections).length!==1||![0,2].includes(oldHoney.length)||newHoney.length!==0||![3,4].includes(broodCount(newer)))add('op14_early_honey_merge_invalid');
  if(request.earlyHoneyHarvestConfirmed!==true||request.actualMergeConfirmed!==true||request.queenIdentityAutoSelected===true)add('op14_early_harvest_merge_confirmations_required');
 }
 if(op==='OP-11'||op==='OP-12'||op==='OP-13'||op==='OP-14'){
  if(new Set(oldBodies).size!==oldBodies.length||new Set(newBodies).size!==newBodies.length)add('operation_body_ids_invalid');
 }
 return errors;
}
window.PasekaSectionalSeasonOperationRulesV2=Object.freeze({validate});
})();