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
 if(!['OP-08','OP-09','OP-10','OP-11','OP-12','OP-13','OP-14'].includes(op))return [...errors,{code:'operation_v2_rule_missing'}];
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
  if(old.mode!=='SIDE_BY_SIDE'||newer.mode!=='SIDE_BY_SIDE'||!same(families(old),families(newer)))add('op09_layout_mode_invalid');
  if(![2,4].includes(oldHoney.length)||![2,4].includes(newHoney.length)||new Set(newHoney).size!==newHoney.length)add('op09_honey_pairs_required');
  if(oldHoney.length===2&&newHoney.length===4&&!oldHoney.every(x=>newHoney.includes(x)))add('op09_addition_must_keep_existing_bodies');
  if(oldHoney.length===4&&newHoney.length===2&&!newHoney.every(x=>oldHoney.includes(x)))add('op09_removal_not_from_existing');
  if(!request.inventoryMovesConfirmed)add('op09_inventory_move_confirmation_required');
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
  if(old.mode!=='SIDE_BY_SIDE'||newer.mode!=='SINGLE_FAMILY'||rows(newer.sections).length!==1||oldHoney.length!==0||newHoney.length!==0||![3,4].includes(broodCount(newer)))add('op14_early_honey_merge_invalid');
  if(request.earlyHoneyHarvestConfirmed!==true||request.actualMergeConfirmed!==true||request.queenIdentityAutoSelected===true)add('op14_early_harvest_merge_confirmations_required');
 }
 if(op==='OP-11'||op==='OP-12'||op==='OP-13'||op==='OP-14'){
  if(new Set(oldBodies).size!==oldBodies.length||new Set(newBodies).size!==newBodies.length)add('operation_body_ids_invalid');
 }
 return errors;
}
window.PasekaSectionalSeasonOperationRulesV2=Object.freeze({validate});
})();