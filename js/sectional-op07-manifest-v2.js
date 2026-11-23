(function(root){
'use strict';
// Construct an OP07 proposal from user-selected IDs and the ACTUAL current
// three-section layout. No data mutation and no operational completion.
const arr=x=>Array.isArray(x)?x:[],obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const str=x=>typeof x==='string'&&x.trim().length>0;
const fail=(error,details)=>({ok:false,error,...(details?{details}:{})});
function plan(state,input){
 if(!obj(state)||!obj(input)||!str(input.hiveId)||!str(input.cycleId)||input.userConfirmed!==true||
 !str(input.occurredAt)||!Number.isFinite(Date.parse(input.occurredAt))||Date.parse(input.occurredAt)>Date.now())return fail('op07_observation_required');
 if(!['AFTER_OP06','WITH_SECOND_ROW','APPROX_12_DAYS_AFTER_SECOND_ROW'].includes(input.timingMode)||
 !['early','main'].includes(input.honeyPurpose)||!str(input.storageLabel)||input.storageLabel.length>160||
 input.actualCoversRemoved!==true||input.actualExcludersInstalled!==true||
 input.actualHoneyBodiesInstalled!==true)return fail('op07_physical_confirmations_required');
 const cycles=arr(state.sectionalSeasonCycles).filter(c=>c.id===input.cycleId&&c.hiveId===input.hiveId&&c.status==='ACTIVE');
 const cycle=cycles.length===1?cycles[0]:null,compat=cycle?.compatProcess;
 const stages=arr(compat?.state?.operations),op04=stages.find(op=>op.operationId==='OP-04');
 if(!cycle||['REQUIRES_RECONCILIATION','BASELINE_IMPORTED_PENDING_ACTIVATION'].includes(cycle.migrationStatus)||
  compat?.modelVersion!==1||compat.id!==cycle.id||op04?.status!=='DONE'||!Number.isFinite(Date.parse(op04?.completedAt)))
  return fail('op07_requires_confirmed_two_row_split');
 const secondRowAt=op04.evidence?.secondRowAt||op04.completedAt;
 const dayDiff=(later,earlier)=>Number.isFinite(Date.parse(later))&&Number.isFinite(Date.parse(earlier))?
  Math.round((Date.parse(later.slice(0,10)+'T00:00:00Z')-Date.parse(earlier.slice(0,10)+'T00:00:00Z'))/86400000):null;
 const days=dayDiff(input.occurredAt,secondRowAt);
 if(days==null||days<0)return fail('op07_before_actual_second_row');
 if(input.timingMode==='WITH_SECOND_ROW'&&days!==0)return fail('op07_simultaneous_timing_mismatch');
 if(input.timingMode==='APPROX_12_DAYS_AFTER_SECOND_ROW'&&(days<12||days>15))return fail('op07_confirmed_12_15_day_range_required');
 if(input.timingMode==='AFTER_OP06'&&!stages.some(op=>op.operationId==='OP-06'&&op.status==='DONE'&&Date.parse(op.completedAt)<=Date.parse(input.occurredAt)))return fail('op07_confirmed_op06_precondition_missing');
 const hive=arr(state.hives).find(h=>h.id===input.hiveId);
 if(hive?.profileId!=='sectional-multiqueen-v1')return fail('op07_profile_mismatch');
 const existing=arr(state.sectionalLayouts).filter(l=>l?.hiveId===input.hiveId);
 if(existing.length!==1||existing[0].mode!=='SIDE_BY_SIDE'||existing[0].broodRows!==2||
 existing[0].honeyStack!=null)return fail('op07_prior_layout_not_ready');
 const layout=existing[0],sections=arr(layout.sections);
 if(sections.length!==3||arr(layout.stacks).length!==3)return fail('op07_three_stacks_missing');
 const upper=sections.map(s=>s.upperBroodBodyId);
 if(sections.map(s=>s.position).join('|')!=='left|middle|right'||upper.some(id=>!str(id))||new Set(upper).size!==3)return fail('op07_current_upper_body_geometry_missing');
 const honeyIds=arr(input.honeyBodyIds),excluderIds=[input.leftExcluderId,input.rightExcluderId],bodies=state.equipmentInventory?.bodies||{},items=state.equipmentInventory?.items||{};
 if(![2,4].includes(honeyIds.length)||(input.honeyPurpose==='early'&&honeyIds.length!==2)||
 new Set(honeyIds).size!==honeyIds.length||excluderIds.some(id=>!str(id))||excluderIds[0]===excluderIds[1])return fail('op07_honey_pairs_and_two_excluders_required');
 const pairs=new Map();
 for(const id of honeyIds){
  const b=bodies[id];
  if(!b||b.kind!=='honey'||b.condition!=='good'||b.spec?.profileId!=='sectional-multiqueen-v1'||b.spec?.framesPerBox!==10||
   !str(b.storageLocation)||!str(b.pairId)||arr(b.frames).length!==10)return fail('op07_honey_body_unavailable',{id});
  if(input.honeyPurpose==='early'){
   const frames=arr(b.frames),types=frames.map(x=>x?.combType);
   const foundation=types.flatMap((kind,index)=>kind==='wax_foundation'?[index]:[]);
   if(types.some(kind=>!['drawn_comb','wax_foundation'].includes(kind))||!types.includes('drawn_comb')||foundation.length>2||
    foundation.some(index=>index===0||index===types.length-1||types[index-1]!=='drawn_comb'||types[index+1]!=='drawn_comb'))
    return fail('op07_early_honey_requires_drawn_comb_and_separated_max_two_foundation',{id});
  }
  pairs.set(b.pairId,(pairs.get(b.pairId)||0)+1);
 }
 if([...pairs.values()].some(n=>n!==2)||pairs.size!==honeyIds.length/2)return fail('op07_incomplete_body_pair');
 for(const id of excluderIds){const item=items[id];if(item?.kind!=='honeyQueenExcluder'||item?.condition!=='good'||item?.location?.type!=='storage')return fail('op07_excluder_not_available',{id});}
 const moves=[],removals=[];
 for(const stack of arr(layout.stacks)){
  for(const [key,kind]of [['coverItemId','cover'],['topRiserItemId','topRiser']]){
   const id=stack[key],item=items[id];
   if(!str(id)||item?.kind!==kind||item?.condition!=='good'||item?.location?.type!=='hive'||item.location.hiveId!==input.hiveId||item.location.stackId!==stack.id)return fail('op07_stack_accessory_missing_or_wrong_position',{stackId:stack.id,kind});
   moves.push({itemId:id,location:{type:'storage',label:input.storageLabel}});removals.push(id);
  }
 }
 if(new Set(removals).size!==6||excluderIds.some(id=>removals.includes(id)))return fail('op07_duplicate_accessories');
 moves.push({itemId:excluderIds[0],location:{type:'hive',hiveId:input.hiveId,footprint:[{bodyId:upper[0],coverage:'FULL'},{bodyId:upper[1],coverage:'HALF'}]}});
 moves.push({itemId:excluderIds[1],location:{type:'hive',hiveId:input.hiveId,footprint:[{bodyId:upper[1],coverage:'HALF'},{bodyId:upper[2],coverage:'FULL'}]}});
 const target=structuredClone(layout);
 for(const stack of target.stacks){delete stack.coverItemId;delete stack.topRiserItemId;}
 target.honeyStack={purpose:input.honeyPurpose,bodyIds:honeyIds.slice(),excluders:[{side:'left',itemId:excluderIds[0]},{side:'right',itemId:excluderIds[1]}]};
 return {ok:true,previewOnly:true,request:{
  hiveId:input.hiveId,cycleId:input.cycleId,operationId:'OP-07',userConfirmed:true,occurredAt:input.occurredAt,
  timingMode:input.timingMode,layout:target,itemMoves:moves,bodyStorageMoves:[]
 },upperBroodBodyIds:upper.slice(),removedStackAccessoryIds:removals};
}
root.PasekaSectionalOP07ManifestV2=Object.freeze({plan});
})(typeof window!=='undefined'?window:globalThis);
