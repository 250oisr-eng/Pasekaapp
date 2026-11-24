(function(root){
'use strict';
// Pre-commit manifest for OP11–14. The target is a beekeeper-supplied exact
// physical layout, never an invented hive design. All output is read-only.
const A=x=>Array.isArray(x)?x:[],O=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const S=x=>typeof x==='string'&&x.trim().length>0;
const fail=(error,details)=>({ok:false,error,...(details?{details}:{})});
const PROFILE='sectional-multiqueen-v1',OPS=new Set(['OP-11','OP-12','OP-13','OP-14']);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function bodyMap(layout){
 const map=new Map();
 function place(id,location){
  if(!S(id)||map.has(id))throw Error('duplicate_or_unknown_body_id');
  map.set(id,location);
 }
 for(const s of A(layout.sections))for(const id of A(s.broodBodyIds))
  place(id,{type:'sectional',hiveId:layout.hiveId,layoutId:layout.id,bodyRole:'brood',sectionId:s.id,position:s.position});
 for(const id of A(layout.honeyStack?.bodyIds))
  place(id,{type:'sectional',hiveId:layout.hiveId,layoutId:layout.id,bodyRole:'honey',position:'shared-honey-stack'});
 return map;
}
// Enumerate every installed accessory family understood by the physical model.
// More than one placement for one inventory ID is never allowed.
function itemMap(layout){
 const map=new Map();
 const add=(id,kind,fields={})=>{
  if(!S(id)||map.has(id))throw Error('duplicate_or_unknown_item_id');
  map.set(id,{kind,expected:{type:'hive',hiveId:layout.hiveId,...fields}});
 };
 for(const stack of A(layout.stacks)){
  for(const [key,kind] of [['bottomItemId','bottom'],['coverItemId','cover'],['topRiserItemId','topRiser'],['feederItemId','feeder']])
   if(S(stack?.[key]))add(stack[key],kind,{stackId:stack.id});
 }
 for(const row of A(layout.honeyStack?.excluders))add(row?.itemId,'honeyQueenExcluder');
 for(const connection of A(layout.technicalConnections))for(const row of A(connection?.openings))
  add(row?.itemId,'technicalQueenExcluder',{bodyId:row?.bodyId,openingId:row?.openingId});
 for(const row of A(layout.temporaryQueenIsolation))
  add(row?.itemId,'metalMeshPlug',{bodyId:row?.bodyId,openingId:row?.openingId});
 const winterStack=A(layout.stacks)[0];
 for(const row of A(layout.meshDiaphragms))
  add(row?.itemId,'meshDiaphragm',{stackId:winterStack?.id,positionLabel:row?.positionLabel});
 for(const row of A(layout.closedOpenings))
  add(row?.itemId,'plasticPlug',{bodyId:row?.bodyId,openingId:row?.openingId});
 return map;
}
function validateDestination(item,expected,destination){
 if(!O(item)||item.kind!==expected.kind||item.condition!=='good'||!O(destination))return false;
 const location=expected.expected;
 if(destination.type!=='hive'||destination.hiveId!==location.hiveId)return false;
 for(const [key,value]of Object.entries(location)){
  if(destination[key]!==value)return false;
 }
 if(item.kind==='honeyQueenExcluder'){
  const fp=destination.footprint;
  if(!Array.isArray(fp)||fp.length!==2||
    !fp.some(x=>x.coverage==='FULL')||!fp.some(x=>x.coverage==='HALF'))return false;
 }
 return true;
}
function plan(state,input){
 if(!O(state)||!O(input)||!OPS.has(input.operationId)||input.userConfirmed!==true||
    !S(input.hiveId)||!S(input.occurredAt)||!Number.isFinite(Date.parse(input.occurredAt))||
    Date.parse(input.occurredAt)>Date.now()||
    input.actualWorkConfirmed!==true)return fail('manifest_user_confirmed_actual_work_required');
 // A draft captured before a tab write, restore or migration cannot be
 // reinterpreted as a fresh physical observation after the state changes.
 if(!S(input.expectedSourceRevisionId)||!S(state.meta?.revisionId)||
    input.expectedSourceRevisionId!==state.meta.revisionId)
  return fail('manifest_source_revision_stale_or_missing');
 const h=state.hives?.find(x=>x?.id===input.hiveId);
 if(h?.profileId!==PROFILE)return fail('manifest_profile_invalid');
 const cycles=A(state.sectionalSeasonCycles).filter(c=>c?.hiveId===input.hiveId&&c.status==='ACTIVE');
 if(cycles.length!==1||['REQUIRES_RECONCILIATION','BASELINE_IMPORTED_PENDING_ACTIVATION'].includes(cycles[0].migrationStatus))
  return fail('manifest_active_cycle_missing');
 const layouts=A(state.sectionalLayouts).filter(l=>l?.hiveId===input.hiveId);
 const source=layouts[0],target=input.targetLayout,inventory=state.equipmentInventory;
 if(layouts.length!==1||!O(source)||!O(target)||source.id!==target.id||
    target.hiveId!==input.hiveId||source.profileId!==PROFILE||target.profileId!==PROFILE||
    !O(inventory?.bodies)||!O(inventory?.items))
  return fail('manifest_original_and_target_layout_required');
 if(!O(input.itemDestinations)||!O(input.storageLocations)||
    !Array.isArray(input.confirmedBodyIds)||!Array.isArray(input.confirmedItemIds))
  return fail('manifest_explicit_locations_and_per_item_proof_required');
 let oldBodies,nextBodies,oldItems,nextItems;
 try{oldBodies=bodyMap(source);nextBodies=bodyMap(target);oldItems=itemMap(source);nextItems=itemMap(target)}
 catch(e){return fail('manifest_duplicate_or_invalid_physical_id',{message:e.message})}
 // Exact OP-specific physical shape. This is a preliminary filter; the
 // full local layout/lineage/executor checks remain mandatory before CAS.
 const op=input.operationId,oldSections=A(source.sections),newSections=A(target.sections);
 const oldFamilyIds=oldSections.map(s=>s.familyId),newFamilyIds=newSections.map(s=>s.familyId);
 const sameFamilies=oldFamilyIds.length===newFamilyIds.length&&
  new Set(oldFamilyIds).size===oldFamilyIds.length&&
  oldFamilyIds.every(id=>newFamilyIds.includes(id))&&
  new Set(newFamilyIds).size===newFamilyIds.length;
 const newCount=newSections.reduce((n,s)=>n+A(s.broodBodyIds).length,0);
 if(op==='OP-11'){
  const upper=oldSections.map(s=>s.upperBroodBodyId);
  if(source.mode!=='SIDE_BY_SIDE'||target.mode!=='SINGLE_FAMILY'||target.purpose!=='primary_wintering'||
    source.honeyStack!=null||target.honeyStack!=null||oldSections.length!==3||
    oldSections.some(s=>A(s.broodBodyIds).length!==2)||newSections.length!==1||
    newCount!==3||upper.some(id=>!S(id)||!A(newSections[0].broodBodyIds).includes(id))||
    input.actualMergeConfirmed!==true||!O(input.resultFamily)||
    newSections[0].familyId!==input.resultFamily.id||
    oldFamilyIds.includes(newSections[0].familyId))
   return fail('manifest_op11_three_upper_bodies_and_new_unknown_family_required');
 }else if(op==='OP-12'){
  if(source.mode!=='SIDE_BY_SIDE'||target.mode!=='ALTERNATIVE_WINTERING_COLUMN'||
    !sameFamilies||source.honeyStack!=null||target.honeyStack!=null||
    oldSections.length!==3||oldSections.some(s=>A(s.broodBodyIds).length!==2)||
    newSections.length!==3||
    newCount!==4||!same(newSections.map(s=>A(s.broodBodyIds).length).sort(),[1,1,2])||
    !S(input.strongestFamilyId)||
    !oldFamilyIds.includes(input.strongestFamilyId)||
    !newSections.some(s=>s.familyId===input.strongestFamilyId&&A(s.broodBodyIds).length===2)||
    newSections.some(s=>{
     const before=oldSections.find(x=>x.familyId===s.familyId);
     return A(s.broodBodyIds).some(id=>!A(before?.broodBodyIds).includes(id));
    })||
    A(target.meshDiaphragms).length!==2||input.actualIsolationConfirmed!==true)
   return fail('manifest_op12_2_1_1_and_two_diaphragms_required');
 }else if(op==='OP-13'){
  if(source.mode!=='ALTERNATIVE_WINTERING_COLUMN'||target.mode!=='SIDE_BY_SIDE'||
    !sameFamilies||source.honeyStack!=null||target.honeyStack!=null||
    !same(oldSections.map(s=>A(s.broodBodyIds).length).sort(),[1,1,2])||
    newSections.length!==3||
    newSections.some(s=>{
     const before=oldSections.find(x=>x.familyId===s.familyId);
     return A(s.broodBodyIds).length!==2||
       A(before?.broodBodyIds).some(id=>!A(s.broodBodyIds).includes(id));
    })||
    A(source.sections).filter(s=>A(s.broodBodyIds).length===1).length!==2||
    input.actualSeparationConfirmed!==true)
   return fail('manifest_op13_three_families_and_two_new_bodies_required');
 }else{
  const upper=oldSections.map(s=>s.upperBroodBodyId);
  if(source.mode!=='SIDE_BY_SIDE'||source.honeyStack?.purpose!=='early'||
    oldSections.length!==3||oldSections.some(s=>A(s.broodBodyIds).length!==2)||
    target.honeyStack!=null||
    newSections.some(s=>A(s.broodBodyIds).some(id=>
     !oldSections.some(old=>A(old.broodBodyIds).includes(id))))||
    A(source.honeyStack?.bodyIds).length!==2||
    A(source.honeyStack?.excluders).length!==2||
    target.mode!=='SINGLE_FAMILY'||target.purpose!=='early_honey_merge'||newSections.length!==1||
    ![3,4].includes(newCount)||upper.some(id=>!S(id)||!A(newSections[0].broodBodyIds).includes(id))||
    oldFamilyIds.includes(newSections[0].familyId)||
    newSections[0].familyId!==input.resultFamily?.id||
    input.actualMergeConfirmed!==true||
    input.earlyHoneyHarvestConfirmed!==true||
    input.actualDiaphragmsRemovedConfirmed!==true||
    input.familiesOnSeparateBottomsConfirmed!==true)
   return fail('manifest_op14_actual_early_honey_history_required');
 }
 if((op==='OP-11'||op==='OP-14')&&
    (!O(input.resultFamily)||!S(input.resultFamily.id)||
     A(state.families).some(f=>f?.id===input.resultFamily.id)))
  return fail('manifest_result_family_must_be_new_and_registered_later');
 if((op==='OP-12'||op==='OP-13')&&input.resultFamily!==undefined)
  return fail('manifest_no_family_merge_during_winter_isolation');
 const allLayouts=A(state.sectionalLayouts).filter(l=>l?.hiveId!==input.hiveId);
 const foreignBodies=new Set(allLayouts.flatMap(l=>[
   ...A(l.sections).flatMap(s=>A(s.broodBodyIds)),...A(l.honeyStack?.bodyIds)
 ]));
 let foreignItemIds;
 try{foreignItemIds=allLayouts.flatMap(l=>[...itemMap(l).keys()])}
 catch{return fail('manifest_foreign_layout_invalid')}
 const foreignItems=new Set(foreignItemIds);
 const currentInstalledItems=new Set([...oldItems.keys()]);
 const kinds=new Set(['bottom','cover','topRiser','feeder','honeyQueenExcluder',
   'technicalQueenExcluder','metalMeshPlug','meshDiaphragm','plasticPlug']);
 for(const item of Object.values(inventory.items)){
  if(item?.location?.type==='hive'&&item.location.hiveId===input.hiveId&&
     kinds.has(item.kind)&&!currentInstalledItems.has(item.id))
   return fail('manifest_unreferenced_installed_accessory',{itemId:item.id});
 }
 const allBodies=new Set([...oldBodies.keys(),...nextBodies.keys()]);
 const seenFrames=new Set();
 for(const id of allBodies){
  const b=inventory.bodies[id],wanted=nextBodies.get(id),before=oldBodies.get(id);
  const kind=wanted?.bodyRole||before?.bodyRole;
  if(foreignBodies.has(id)||!O(b)||b.id!==id||b.kind!==kind||
     b.condition!=='good'||b.spec?.profileId!==PROFILE||
     b.spec?.framesPerBox!==(kind==='brood'?6:10)||
     !Array.isArray(b.frames)||b.frames.length!==(kind==='brood'?6:10)||
     b.frames.some(f=>!S(f?.frameId)||!Array.isArray(f.history)))
   return fail('manifest_body_or_frame_inventory_invalid',{bodyId:id});
  for(const frame of b.frames){
   if(seenFrames.has(frame.frameId))
    return fail('manifest_frame_identity_repeated_across_bodies',{frameId:frame.frameId});
   seenFrames.add(frame.frameId);
  }
  if(before&&S(b.storageLocation))
   return fail('manifest_installed_body_falsely_marked_stored',{bodyId:id});
  if(wanted&&!before&&!S(b.storageLocation))
   return fail('manifest_body_not_available_from_storage',{bodyId:id});
 }
 const changedBodies=[...allBodies].filter(id=>!same(oldBodies.get(id)||null,nextBodies.get(id)||null)).sort();
 const confirmedBodies=A(input.confirmedBodyIds),confirmedItems=A(input.confirmedItemIds);
 const sameIds=(provided,expected)=>provided.length===expected.length&&
  new Set(provided).size===provided.length&&provided.every(id=>expected.includes(id));
 if(!sameIds(confirmedBodies,changedBodies))return fail('manifest_body_movements_not_individually_confirmed',
   {requiredBodyIds:changedBodies});
 const bodyMoves=[],locations={};
 for(const id of changedBodies){
  const destination=nextBodies.get(id);
  const removal=!destination;
  if(removal){
   if(!S(input.storageLocations[id])||input.storageLocations[id].length>160)
    return fail('manifest_missing_real_body_storage_location',{bodyId:id});
   locations[id]=input.storageLocations[id];
  }
  bodyMoves.push({bodyId:id,from:oldBodies.get(id)||null,
    to:destination||{type:'storage',label:locations[id]}});
 }
 // No unaccounted body destinations, especially from outside this hive.
 if(Object.keys(input.storageLocations).some(id=>!changedBodies.includes(id)||
    nextBodies.has(id)))return fail('manifest_unreferenced_body_storage_claim');
 const allItems=new Set([...oldItems.keys(),...nextItems.keys()]);
 const itemChanges=[];
 for(const id of [...allItems].sort()){
  const item=inventory.items[id],previous=oldItems.get(id),desired=nextItems.get(id);
  if(foreignItems.has(id)||!O(item)||item.id!==id||item.condition!=='good'||
     item.kind!==(desired?.kind||previous?.kind))
   return fail('manifest_item_unknown_foreign_or_wrong_kind',{itemId:id});
  const loc=item.location;
  if(!O(loc)||(loc.type!=='storage'&&
     (loc.type!=='hive'||loc.hiveId!==input.hiveId)))
   return fail('manifest_item_not_held_by_hive_or_storage',{itemId:id});
  if(previous){
   if(loc.type!=='hive'||Object.entries(previous.expected).some(([key,value])=>loc[key]!==value))
    return fail('manifest_source_item_wrong_actual_position',{itemId:id});
  }
  if(previous&&!O(desired)&&loc.type!=='hive')
   return fail('manifest_source_item_no_longer_installed',{itemId:id});
  if(!previous&&desired&&loc.type!=='storage')
   return fail('manifest_added_item_not_in_storage',{itemId:id});
  let next=desired?input.itemDestinations[id]:input.itemDestinations[id];
  if(!desired){
   if(!O(next)||next.type!=='storage'||!S(next.label)||next.label.length>160)
    return fail('manifest_removed_item_needs_explicit_storage',{itemId:id});
  }else if(!validateDestination(item,desired,next)){
   // Unchanged accessories may reuse their real installed location. A
   // replacement/move always needs explicit target-position confirmation.
   if(previous&&same(previous.expected,desired.expected)&&
      validateDestination(item,desired,loc)&&next===undefined)next=loc;
   else return fail('manifest_installed_item_destination_missing_or_wrong',{itemId:id});
  }
  if(!same(loc,next))itemChanges.push({itemId:id,location:structuredClone(next)});
 }
 // No unrelated accessory movement or a hidden change of foreign inventory.
 if(Object.keys(input.itemDestinations).some(id=>!allItems.has(id)))
  return fail('manifest_unreferenced_item_destination');
 const itemIds=itemChanges.map(x=>x.itemId);
 if(!sameIds(confirmedItems,itemIds))return fail('manifest_item_movements_not_individually_confirmed',
   {requiredItemIds:itemIds});
 // Record the exact source revision so this cannot be replayed after another
 // tab or an offline restore changes inventory.
 if(!S(state.meta?.revisionId))return fail('manifest_revision_missing');
 const request={operationId:input.operationId,hiveId:input.hiveId,cycleId:cycles[0].id,
   sourceRevisionId:state.meta.revisionId,userConfirmed:true,
   actualWorkConfirmed:true,occurredAt:input.occurredAt,
   targetLayout:structuredClone(target),bodyMoves,itemMoves:itemChanges,
   storageLocations:locations};
 if(op==='OP-12')request.strongestFamilyId=input.strongestFamilyId;
 for(const key of ['actualMergeConfirmed','actualIsolationConfirmed','actualSeparationConfirmed',
   'earlyHoneyHarvestConfirmed','actualDiaphragmsRemovedConfirmed','familiesOnSeparateBottomsConfirmed']){
  if(input[key]!==undefined)request[key]=input[key];
 }
 if(O(input.resultFamily)){
  if(input.resultFamily.currentQueenId!=null||input.resultFamily.queenId!=null)
   return fail('manifest_survivor_queen_must_remain_unknown');
  request.resultFamily=structuredClone(input.resultFamily);
 }
 return {ok:true,previewOnly:true,readyForPersistence:false,
   requiresIndependentArchiveVerification:true,sourceRevisionId:state.meta.revisionId,
   changedBodyIds:changedBodies,changedItemIds:itemIds,
   request};
}
function inspectSource(state,hiveId){
 const h=A(state?.hives).find(x=>x?.id===hiveId);
 const layouts=A(state?.sectionalLayouts).filter(x=>x?.hiveId===hiveId);
 if(h?.profileId!==PROFILE||layouts.length!==1||!S(state?.meta?.revisionId))
  return fail('manifest_source_revision_or_layout_missing');
 try{
  const bodies=bodyMap(layouts[0]),items=itemMap(layouts[0]);
  const inv=state.equipmentInventory;
  if(!O(inv?.bodies)||!O(inv?.items))return fail('manifest_source_inventory_missing');
  const bodyEntries=[...bodies].map(([id,location])=>({id,location,
   frameIds:A(inv.bodies[id]?.frames).map(f=>f.frameId)}));
  const itemEntries=[...items].map(([id,{kind,expected}])=>({
   id,kind,expected,actual:inv.items[id]?.location||null
  }));
  const frameIds=new Set();
  for(const entry of bodyEntries){
   const body=inv.bodies[entry.id],needed=entry.location.bodyRole==='brood'?6:10;
   if(!O(body)||body.id!==entry.id||body.kind!==entry.location.bodyRole||
      body.condition!=='good'||body.spec?.profileId!==PROFILE||
      body.spec?.framesPerBox!==needed||!Array.isArray(body.frames)||
      body.frames.length!==needed||S(body.storageLocation))
    return fail('manifest_source_body_inventory_unverified',{bodyId:entry.id});
   for(const frame of body.frames){
    if(!S(frame?.frameId)||!Array.isArray(frame.history)||frameIds.has(frame.frameId))
     return fail('manifest_source_frame_identity_duplicate_or_invalid');
    frameIds.add(frame.frameId);
   }
  }
  for(const entry of itemEntries){
   const item=inv.items[entry.id],actual=item?.location;
   if(!O(item)||item.id!==entry.id||item.kind!==entry.kind||
      item.condition!=='good'||actual?.type!=='hive'||
      Object.entries(entry.expected).some(([key,value])=>actual[key]!==value))
    return fail('manifest_source_accessory_position_unverified',{itemId:entry.id});
  }
  return {ok:true,readOnly:true,sourceRevisionId:state.meta.revisionId,
   bodyEntries,itemEntries,mode:layouts[0].mode};
 }catch{return fail('manifest_source_duplicate_or_incomplete')}
}
function previewStage(state,input,deps={}){
 const planned=plan(state,input);
 if(!planned.ok)return planned;
 if(typeof deps.executor?.stage!=='function'||
    typeof deps.layout?.validate!=='function'||
    typeof deps.lineage?.inspect!=='function'||
    typeof deps.provenance?.validate!=='function'||
    typeof deps.equipmentItems?.place!=='function'||
    typeof deps.makeId!=='function'||!S(deps.now))
  return fail('manifest_required_local_integrity_inspector_missing');
 let simulation;
 try{
  simulation=deps.executor.stage(state,planned.request,{
   now:deps.now,makeId:deps.makeId,PasekaEquipmentItems:deps.equipmentItems,
   PasekaFamilyLineage:deps.lineage
  });
 }catch{return fail('manifest_executor_simulation_unavailable')}
 if(!simulation?.ok||!O(simulation.draft))
  return fail('manifest_executor_rejected',simulation);
 try{
  const check=deps.layout.validate(planned.request.targetLayout,simulation.draft);
  const lineage=deps.lineage.inspect(simulation.draft);
  const provenance=deps.provenance.validate(state,simulation.draft,planned.request);
  if(!check?.valid||!Array.isArray(lineage)||lineage.length||
     !Array.isArray(provenance)||provenance.length)
   return fail('manifest_simulated_physical_or_lineage_invalid',{
    layoutErrors:check?.errors||[],lineageErrors:lineage,provenanceErrors:provenance
   });
 }catch{return fail('manifest_full_local_validation_unavailable')}
 return {ok:true,previewOnly:true,readyForPersistence:false,
  requiresIndependentArchiveVerification:true,sourceRevisionId:planned.sourceRevisionId,
  changedBodyIds:planned.changedBodyIds,changedItemIds:planned.changedItemIds,
  operationCompleted:false};
}
root.PasekaSectionalSeasonPhysicalManifestV2=Object.freeze({plan,inspectSource,previewStage});
})(typeof window!=='undefined'?window:globalThis);
