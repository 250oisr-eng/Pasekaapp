(function(){
'use strict';
// OP11–14 staged executor. Takes the beekeeper's explicit physical target and item
// manifest; never invents equipment, selects a queen or persists anything.
const A=x=>Array.isArray(x)?x:[],O=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const S=x=>typeof x==='string'&&x.trim().length>0;
const fail=(error,details)=>({ok:false,error,...(details?{details}:{})});
function locations(layout){
 const m=new Map();
 for(const s of A(layout.sections))for(const id of A(s.broodBodyIds))m.set(id,{type:'sectional',hiveId:layout.hiveId,layoutId:layout.id,bodyRole:'brood',sectionId:s.id,position:s.position});
 for(const id of A(layout.honeyStack?.bodyIds))m.set(id,{type:'sectional',hiveId:layout.hiveId,layoutId:layout.id,bodyRole:'honey',position:'shared-honey-stack'});
 return m;
}
function earlyHoneyPhysicalSnapshot(state,layout){
 const honey=A(layout.honeyStack?.bodyIds),excluders=A(layout.honeyStack?.excluders),sections=A(layout.sections),stacks=A(layout.stacks);
 if(honey.length!==2||excluders.length!==2||sections.length!==3||stacks.length!==3||A(layout.meshDiaphragms).length)return null;
 const upperBodyIds=sections.map(row=>row.upperBroodBodyId);
 if(upperBodyIds.some(x=>!S(x))||new Set(upperBodyIds).size!==3)return null;
 if(new Set(stacks.map(x=>x.bottomItemId)).size!==3||stacks.some(x=>!S(x.bottomItemId)))return null;
 const bodyMap=state.equipmentInventory?.bodies||{},items=state.equipmentInventory?.items||{};
 const honeyBodySnapshots=honey.map(bodyId=>{
  const body=bodyMap[bodyId];
  if(!body||body.kind!=='honey'||body.condition!=='good'||body.spec?.framesPerBox!==10||body.spec?.profileId!==layout.profileId)return null;
  return {bodyId,kind:'honey',condition:'good',framesPerBox:10,profileId:layout.profileId,hiveId:layout.hiveId,installed:true};
 });
 if(honeyBodySnapshots.some(x=>!x))return null;
 const largeExcluderSnapshots=excluders.map(row=>{
  const item=items[row.itemId],footprint=item?.location?.footprint;
  if(!item||item.kind!=='honeyQueenExcluder'||item.condition!=='good'||item.location?.type!=='hive'||item.location?.hiveId!==layout.hiveId||!Array.isArray(footprint)||footprint.length!==2)return null;
  return {itemId:item.id,kind:item.kind,condition:item.condition,hiveId:layout.hiveId,installed:true,footprint:structuredClone(footprint)};
 });
 if(largeExcluderSnapshots.some(x=>!x)||new Set(excluders.map(x=>x.itemId)).size!==2)return null;
 const full=largeExcluderSnapshots.map(x=>x.footprint.find(p=>p.coverage==='FULL')?.bodyId);
 const half=largeExcluderSnapshots.map(x=>x.footprint.find(p=>p.coverage==='HALF')?.bodyId);
 if(new Set(full).size!==2||!full.includes(upperBodyIds[0])||!full.includes(upperBodyIds[2])||half.some(id=>id!==upperBodyIds[1]))return null;
 return {honeyBodyIds:honey.slice(),honeyBodySnapshots,largeExcluderIds:excluders.map(x=>x.itemId),largeExcluderSnapshots,upperBodyIds};
}
function stage(state,request,deps={}){
 const op=request?.operationId;
 if(!O(state)||!O(request)||!['OP-11','OP-12','OP-13','OP-14'].includes(op)||request.userConfirmed!==true||request.actualWorkConfirmed!==true||!S(request.hiveId)||!S(request.occurredAt)||!S(deps.now)||Date.parse(request.occurredAt)>Date.parse(deps.now)||!Number.isFinite(Date.parse(request.occurredAt))||typeof deps.makeId!=='function'||typeof deps.PasekaEquipmentItems?.place!=='function'||!O(deps.PasekaFamilyLineage))return fail('season_actual_operation_and_dependencies_required');
 if(A(state.sectionalTechProcesses).some(p=>p?.hiveId===request.hiveId))return fail('season_legacy_coordinator_must_be_migrated');
 const cycle=A(state.sectionalSeasonCycles).filter(p=>p?.hiveId===request.hiveId&&p.status==='ACTIVE');
 if(cycle.length!==1||['REQUIRES_RECONCILIATION','BASELINE_IMPORTED_PENDING_ACTIVATION'].includes(cycle[0].migrationStatus))return fail('season_active_v2_cycle_required');
 const layouts=A(state.sectionalLayouts).filter(l=>l?.hiveId===request.hiveId),old=layouts[0],target=request.targetLayout;
 if(layouts.length!==1||old?.profileId!=='sectional-multiqueen-v1'||!O(target)||target.hiveId!==request.hiveId||target.id!==old.id||target.profileId!==old.profileId)return fail('season_target_layout_invalid');
 const itemMoves=A(request.itemMoves),bodyMoves=A(request.bodyMoves);
 if(!Array.isArray(request.itemMoves)||!Array.isArray(request.bodyMoves)||itemMoves.some(m=>!S(m?.itemId)||!O(m.location))||new Set(itemMoves.map(x=>x.itemId)).size!==itemMoves.length||new Set(bodyMoves.map(x=>x?.bodyId)).size!==bodyMoves.length)return fail('season_movement_manifest_invalid');
 const before=locations(old),after=locations(target),inventory=state.equipmentInventory;
 if(!O(inventory?.bodies)||!O(inventory?.items)||!Array.isArray(inventory.events)||!Array.isArray(inventory.itemEvents)||!Array.isArray(state.auditLog)||!Array.isArray(state.familyEvents)||!Array.isArray(state.queenEvents))return fail('season_inventory_or_history_invalid');
 const storageLocations=O(request.storageLocations)?request.storageLocations:{};
 const changed=[...new Set([...before.keys(),...after.keys()])].filter(id=>JSON.stringify(before.get(id)||null)!==JSON.stringify(after.get(id)||null));
 if(changed.length!==bodyMoves.length||changed.some(id=>!bodyMoves.some(x=>x.bodyId===id&&JSON.stringify(x.from??null)===JSON.stringify(before.get(id)||null)&&JSON.stringify(x.to??null)===JSON.stringify(after.get(id)||(!after.has(id)&&S(storageLocations[id])?{type:'storage',label:storageLocations[id]}:null)))))return fail('season_body_movement_manifest_incomplete');
 for(const id of changed){
  const b=inventory.bodies[id];
  if(!O(b)||!Array.isArray(b.frames)||b.frames.some(f=>!O(f)||!Array.isArray(f.history)))return fail('season_movement_body_or_frame_invalid',{bodyId:id});
  if(!after.has(id)&&(!S(storageLocations[id])||storageLocations[id].length>160))return fail('season_body_storage_location_required',{bodyId:id});
  if(after.has(id)&&!before.has(id)&&!S(b.storageLocation))return fail('season_added_body_not_in_storage',{bodyId:id});
 }
 const initialFamilyIds=A(old.sections).map(s=>s.familyId);
 if(op==='OP-11'||op==='OP-14'){
  if(old.mode!=='SIDE_BY_SIDE'||target.mode!=='SINGLE_FAMILY'||initialFamilyIds.length!==3||A(target.sections).length!==1||!O(request.resultFamily)||request.resultFamily.hive!==request.hiveId||!S(request.resultFamily.id)||request.resultFamily.currentQueenId||request.resultFamily.queenId)return fail('season_merge_plan_invalid');
  if(op==='OP-11'&&request.actualMergeConfirmed!==true)return fail('op11_merge_confirmation_missing');
  if(op==='OP-11'){
   const expected=A(old.sections).map(s=>s.upperBroodBodyId);
   if(expected.some(id=>!S(id))||A(target.sections[0].broodBodyIds).length!==3||!expected.every(id=>A(target.sections[0].broodBodyIds).includes(id)))return fail('op11_must_preserve_exact_three_upper_bodies');
  }
  if(op==='OP-14'&&(request.actualMergeConfirmed!==true||request.earlyHoneyHarvestConfirmed!==true||request.actualDiaphragmsRemovedConfirmed!==true||request.familiesOnSeparateBottomsConfirmed!==true))return fail('op14_harvest_and_merge_confirmation_missing');
  if(op==='OP-14'){
   const historicalSetup=earlyHoneyPhysicalSnapshot(state,old);
   if(!historicalSetup)return fail('op14_honey_and_excluder_original_provenance_required');
   const preserved=A(target.sections[0].broodBodyIds);
   if(historicalSetup.upperBodyIds.some(id=>!preserved.includes(id)))return fail('op14_original_upper_bodies_must_survive');
   if(!A(state.familyEvents).some(e=>e.type==='alternative_wintering_configured'&&e.hiveId===request.hiveId&&e.techProcessId===cycle[0].id))return fail('op14_wintering_lineage_missing');
   const moves=A(state.familyEvents).filter(e=>e.type==='placement_changed'&&e.operationId==='OP-13'&&e.hiveId===request.hiveId&&e.techProcessId===cycle[0].id);
   if(moves.length!==2||new Set(moves.map(e=>e.familyId)).size!==2)return fail('op14_spring_relocation_provenance_missing');
  }
 }else if(op==='OP-12'){
  if(old.mode!=='SIDE_BY_SIDE'||target.mode!=='ALTERNATIVE_WINTERING_COLUMN'||request.actualIsolationConfirmed!==true||A(target.sections).length!==3||!initialFamilyIds.every(id=>A(target.sections).some(s=>s.familyId===id)))return fail('op12_wintering_confirmation_missing');
 }else if(old.mode!=='ALTERNATIVE_WINTERING_COLUMN'||target.mode!=='SIDE_BY_SIDE'||request.actualSeparationConfirmed!==true||A(target.sections).length!==3||!initialFamilyIds.every(id=>A(target.sections).some(s=>s.familyId===id)))return fail('op13_spring_separation_confirmation_missing');
 let draft;try{draft=structuredClone(state)}catch{return fail('season_clone_failed')}
 const used=new Set([...A(draft.auditLog),...A(draft.familyEvents),...A(draft.queenEvents),...A(inventory.events),...A(inventory.itemEvents),...Object.values(inventory.bodies).flatMap(b=>[...A(b.events),...A(b.frames).flatMap(f=>A(f.history))]),...Object.values(inventory.items).flatMap(i=>A(i.events))].map(e=>e?.id).filter(Boolean));
 const makeId=()=>{const id=deps.makeId();if(!S(id)||used.has(id))throw Error('season_event_id_conflict');used.add(id);return id};
 const place=(m)=>{const r=deps.PasekaEquipmentItems.place(draft,{itemId:m.itemId,location:m.location},makeId,request.occurredAt);if(!r?.ok)throw Error('season_item_move_failed:'+r?.error)};
 try{
  // Store items removed from the old physical layout before replacing it.
  for(const m of itemMoves.filter(x=>x.location.type==='storage'))place(m);
  if(op==='OP-11'||op==='OP-14'){
   // The lineage API correctly refuses merging families still physically placed.
   draft.sectionalLayouts=draft.sectionalLayouts.filter(l=>l.hiveId!==request.hiveId);
   if(op==='OP-14'){
    if(typeof deps.PasekaFamilyLineage.recordEarlyHoneyHarvest!=='function')throw Error('early_honey_lineage_api_missing');
    const h=deps.PasekaFamilyLineage.recordEarlyHoneyHarvest(draft,{
     familyIds:initialFamilyIds,nestBodiesAfterHarvest:A(target.sections[0].broodBodyIds).length,
     honeyBodiesRemoved:true,largeExcludersRemoved:true,harvestConfirmed:true,
     diaphragmsRemoved:true,familiesOnSeparateBottoms:true,physicalSetup:earlyHoneyPhysicalSnapshot(state,old),
     operationId:'OP-14',techProcessId:cycle[0].id,occurredAt:request.occurredAt
    },makeId,request.occurredAt);
    if(!h?.ok)throw Error('early_honey_lineage_rejected:'+h?.error);
   }
   if(typeof deps.PasekaFamilyLineage.applyMerge!=='function')throw Error('merge_lineage_api_missing');
   const m=deps.PasekaFamilyLineage.applyMerge(draft,{sourceFamilyIds:initialFamilyIds,resultFamily:request.resultFamily,operationId:op,scenario:op==='OP-14'?'EARLY_HONEY':null,techProcessId:cycle[0].id,occurredAt:request.occurredAt},makeId,request.occurredAt);
   if(!m?.ok)throw Error('merge_lineage_rejected:'+m?.error);
  }else{
   const ix=draft.sectionalLayouts.findIndex(l=>l.id===old.id);
   if(ix<0)throw Error('layout_missing');
   draft.sectionalLayouts.splice(ix,1);
  }
  draft.sectionalLayouts.push(structuredClone(target));
  for(const m of itemMoves.filter(x=>x.location.type==='hive'))place(m);
  if(op==='OP-12'){
   if(typeof deps.PasekaFamilyLineage.configureAlternativeWintering!=='function')throw Error('wintering_lineage_api_missing');
   const r=deps.PasekaFamilyLineage.configureAlternativeWintering(draft,{familyIds:initialFamilyIds,diaphragmItemIds:A(target.meshDiaphragms).map(x=>x.itemId),layout:A(target.sections).map(s=>({familyId:s.familyId,position:s.position,bodyCount:A(s.broodBodyIds).length})),techProcessId:cycle[0].id,occurredAt:request.occurredAt},makeId,request.occurredAt);
   if(!r?.ok)throw Error('wintering_lineage_rejected:'+r?.error);
  }else if(op==='OP-13'){
   if(typeof deps.PasekaFamilyLineage.recordPlacementChanged!=='function')throw Error('spring_lineage_api_missing');
   const source=A(old.sections).filter(s=>A(s.broodBodyIds).length===1);
   if(source.length!==2)throw Error('spring_single_body_sources_required');
   for(const s of source){
    const dest=A(target.sections).find(x=>x.familyId===s.familyId),stack=A(target.stacks).find(x=>A(x.sectionIds).includes(dest?.id));
    const r=deps.PasekaFamilyLineage.recordPlacementChanged(draft,{familyIds:initialFamilyIds,familyId:s.familyId,from:{position:s.position,bodyIds:s.broodBodyIds},to:{position:'separate_bottom',bottomItemId:stack?.bottomItemId,bodyIds:dest?.broodBodyIds},techProcessId:cycle[0].id,occurredAt:request.occurredAt},makeId,request.occurredAt);
    if(!r?.ok)throw Error('spring_lineage_rejected:'+r?.error);
   }
  }
  for(const id of changed){
   const body=draft.equipmentInventory.bodies[id],from=before.get(id)||{type:'storage',label:body.storageLocation},to=after.get(id)||{type:'storage',label:storageLocations[id]};
   const details={operationId:op,at:request.occurredAt,bodyId:id,from,to};
   if(body.events!=null&&!Array.isArray(body.events))throw Error('body_events_invalid');
   if(!Array.isArray(body.events))body.events=[];
   body.events.push({id:makeId(),type:'seasonal_body_moved',...details});
   draft.equipmentInventory.events.push({id:makeId(),type:'sectional_body_moved',...details});
   if(after.has(id))delete body.storageLocation;else body.storageLocation=to.label;
   body.updatedAt=request.occurredAt;
   for(const frame of body.frames)frame.history.push({id:makeId(),type:'sectional_body_relocated',frameId:frame.frameId,operationId:op,at:request.occurredAt,hiveId:request.hiveId,bodyId:id,from,to});
  }
  draft.auditLog.push({id:makeId(),type:'sectional_operation_confirmed',operationId:op,hiveId:request.hiveId,at:request.occurredAt,cycleId:cycle[0].id,userConfirmed:true});
 }catch(e){return fail('season_physical_staging_rejected',{message:e.message})}
 return {ok:true,draft};
}
window.PasekaSectionalSeasonPhysicalExecutorV2=Object.freeze({stage});
})();