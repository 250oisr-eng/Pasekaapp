(function(root){
'use strict';
// Pure, source-bound body movement manifest for OP11–14.
// This module neither changes the apiary nor marks work DONE. The target
// layout is a beekeeper-confirmed input, never inferred from season dates.
const O=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const A=x=>Array.isArray(x)?x:[];
const S=x=>typeof x==='string'&&x.trim().length>0;
const fail=(error,details)=>({ok:false,error,...(details?{details}:{})});
const PROFILE='sectional-multiqueen-v1';
const modes={'OP-11':['SIDE_BY_SIDE','SINGLE_FAMILY'],
 'OP-12':['SIDE_BY_SIDE','ALTERNATIVE_WINTERING_COLUMN'],
 'OP-13':['ALTERNATIVE_WINTERING_COLUMN','SIDE_BY_SIDE'],
 'OP-14':['SIDE_BY_SIDE','SINGLE_FAMILY']};
function positions(layout){
 const refs=new Map();
 for(const section of A(layout.sections)){
  if(!O(section)||!S(section.id)||!S(section.position))return null;
  for(const bodyId of A(section.broodBodyIds)){
   if(!S(bodyId)||refs.has(bodyId))return null;
   refs.set(bodyId,{type:'sectional',hiveId:layout.hiveId,layoutId:layout.id,
    bodyRole:'brood',sectionId:section.id,position:section.position});
  }
 }
 for(const bodyId of A(layout.honeyStack?.bodyIds)){
  if(!S(bodyId)||refs.has(bodyId))return null;
  refs.set(bodyId,{type:'sectional',hiveId:layout.hiveId,layoutId:layout.id,
   bodyRole:'honey',position:'shared-honey-stack'});
 }
 return refs;
}
function itemPositions(layout){
 const refs=new Map();
 const add=(id,role,slot)=>{
  if(id===undefined||id===null||id==='')return true;
  if(!S(id)||refs.has(id))return false;
  refs.set(id,{role,...slot});return true;
 };
 for(const stack of A(layout.stacks)){
  if(!O(stack)||!S(stack.id))return null;
  for(const [key,role] of [['bottomItemId','bottom'],['coverItemId','cover'],
   ['topRiserItemId','topRiser'],['feederItemId','feeder']]){
   if(!add(stack[key],role,{stackId:stack.id}))return null;
  }
 }
 for(const item of A(layout.honeyStack?.excluders))
  if(!add(item?.itemId,'honeyQueenExcluder',{side:item?.side||null}))return null;
 for(const item of A(layout.meshDiaphragms))
  if(!add(item?.itemId,'meshDiaphragm',{stackId:A(layout.stacks)[0]?.id||null,
   positionLabel:item?.positionLabel||null}))return null;
 for(const connection of A(layout.technicalConnections))
  for(const opening of A(connection?.openings))
   if(!add(opening?.itemId,'technicalQueenExcluder',{bodyId:opening?.bodyId,openingId:opening?.openingId}))return null;
 for(const plug of A(layout.temporaryQueenIsolation))
  if(!add(plug?.itemId,'metalMeshPlug',{bodyId:plug?.bodyId,openingId:plug?.openingId}))return null;
 for(const plug of A(layout.closedOpenings))
  if(!add(plug?.itemId,'plasticPlug',{bodyId:plug?.bodyId,openingId:plug?.openingId}))return null;
 return refs;
}
const identical=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
function stageManifest(state,request){
 const operationId=request?.operationId,hiveId=request?.hiveId;
 if(!O(state)||!O(request)||!Object.hasOwn(modes,operationId)||
    !S(hiveId)||request.userConfirmedTargetLayout!==true||
    !O(request.targetLayout)||!O(state.equipmentInventory?.bodies))
  return fail('season_manifest_target_and_personal_confirmation_required');
 const all=A(state.sectionalLayouts),source=all.filter(l=>l?.hiveId===hiveId);
 if(source.length!==1||!A(state.hives).some(h=>h.id===hiveId&&h.profileId===PROFILE))
  return fail('season_manifest_unambiguous_hive_required');
 const old=source[0],target=request.targetLayout;
 if(old.profileId!==PROFILE||target.profileId!==PROFILE||
    old.id!==target.id||old.hiveId!==target.hiveId||old.hiveId!==hiveId||
    old.mode!==modes[operationId][0]||target.mode!==modes[operationId][1])
  return fail('season_manifest_layout_identity_or_mode_invalid');
 const oldPositions=positions(old),newPositions=positions(target);
 if(!oldPositions||!newPositions||!Array.isArray(target.sections))
  return fail('season_manifest_duplicate_or_missing_body');
 const oldSections=A(old.sections),newSections=A(target.sections);
 if(['OP-11','OP-14'].includes(operationId)){
  if(oldSections.length!==3||newSections.length!==1)
   return fail('season_manifest_merge_section_count_invalid');
  const upper=oldSections.map(s=>s.upperBroodBodyId);
  const kept=A(newSections[0].broodBodyIds);
  if(upper.some(id=>!S(id)||!kept.includes(id))||
     operationId==='OP-11'&&(kept.length!==3||new Set(kept).size!==3)||
     operationId==='OP-14'&&![3,4].includes(kept.length))
   return fail('season_manifest_original_upper_bodies_not_preserved');
 }else if(operationId==='OP-12'){
  if(oldSections.length!==3||newSections.length!==3||!S(request.strongestFamilyId))
   return fail('season_manifest_winter_family_confirmation_required');
  const count=newSections.map(s=>A(s.broodBodyIds).length);
  const familyList=oldSections.map(s=>s.familyId).sort(),destList=newSections.map(s=>s.familyId).sort();
  if(JSON.stringify(count.slice().sort())!=='[1,1,2]'||
     JSON.stringify(familyList)!==JSON.stringify(destList)||
     !newSections.some(s=>s.familyId===request.strongestFamilyId&&A(s.broodBodyIds).length===2))
   return fail('season_manifest_winter_2_1_1_and_strongest_invalid');
 }else{
  const familyList=oldSections.map(s=>s.familyId).sort(),destList=newSections.map(s=>s.familyId).sort();
  if(oldSections.length!==3||newSections.length!==3||
     JSON.stringify(familyList)!==JSON.stringify(destList)||
     newSections.some(s=>A(s.broodBodyIds).length!==2))
   return fail('season_manifest_spring_family_and_body_count_invalid');
 }
 const bodies=state.equipmentInventory.bodies,storage=request.storageLocations;
 if(!O(storage)||!Array.isArray(request.itemMoves))
  return fail('season_manifest_explicit_storage_and_items_required');
 const elsewhere=new Set(A(state.sectionalLayouts).filter(l=>l.hiveId!==hiveId)
  .flatMap(l=>[...A(l.sections).flatMap(s=>A(s.broodBodyIds)),...A(l.honeyStack?.bodyIds)]));
 const legacy=new Set(Object.values(O(state.layouts)?state.layouts:{})
  .flatMap(l=>Object.values(O(l?.corpusIds)?l.corpusIds:{})));
 for(const [id,position] of newPositions){
  if(elsewhere.has(id)||legacy.has(id))return fail('season_manifest_body_owned_elsewhere',{bodyId:id});
  const body=bodies[id],kind=position.bodyRole,capacity=kind==='honey'?10:6;
  if(!O(body)||body.id!==id||body.kind!==kind||body.condition!=='good'||
    body.spec?.profileId!==PROFILE||body.spec?.framesPerBox!==capacity||
    !Array.isArray(body.frames)||body.frames.length!==capacity)
   return fail('season_manifest_body_condition_or_profile_invalid',{bodyId:id});
  if(!oldPositions.has(id)&&!S(body.storageLocation))
   return fail('season_manifest_added_body_not_from_confirmed_storage',{bodyId:id});
 }
 const moved=[...new Set([...oldPositions.keys(),...newPositions.keys()])]
  .filter(id=>!identical(oldPositions.get(id),newPositions.get(id)));
 const removed=moved.filter(id=>!newPositions.has(id));
 const labels=Object.keys(storage);
 if(labels.length!==removed.length||labels.some(id=>!removed.includes(id)))
  return fail('season_manifest_storage_keys_do_not_match_removed_bodies');
 for(const id of removed)if(!S(storage[id])||storage[id].length>160)
  return fail('season_manifest_storage_location_missing',{bodyId:id});
 for(const id of moved){
  const body=bodies[id];
  if(!O(body)||!Array.isArray(body.frames)||body.frames.some(f=>!O(f)||!S(f.frameId)||!Array.isArray(f.history)))
   return fail('season_manifest_frame_identity_or_history_missing',{bodyId:id});
 }
 const oldItems=itemPositions(old),newItems=itemPositions(target);
 if(!oldItems||!newItems)return fail('season_manifest_duplicate_accessory_reference');
 const itemChanged=[...new Set([...oldItems.keys(),...newItems.keys()])]
  .filter(id=>!identical(oldItems.get(id),newItems.get(id)));
 const movedItemsById=new Map(A(request.itemMoves).map(x=>[x?.itemId,x]));
 if(itemChanged.length!==A(request.itemMoves).length||
    itemChanged.some(id=>!movedItemsById.has(id))||
    A(request.itemMoves).some(x=>!itemChanged.includes(x?.itemId)))
  return fail('season_manifest_item_moves_incomplete_or_unrelated',
   {requiredItemIds:itemChanged});
 const itemIds=new Set(),items=state.equipmentInventory.items||{};
 for(const row of request.itemMoves){
  const item=items[row?.itemId],location=row?.location;
  const oldRef=oldItems.get(row?.itemId),newRef=newItems.get(row?.itemId);
  const expectedRole=newRef?.role||oldRef?.role;
  if(!S(row?.itemId)||itemIds.has(row.itemId)||!O(item)||item.kind!==expectedRole||
     item.condition!=='good'||!O(location)||!['hive','storage'].includes(location.type)||
     newRef&& (location.type!=='hive'||location.hiveId!==hiveId)||
     !newRef&&(location.type!=='storage'||!S(location.label))||
     newRef?.stackId&&location.stackId!==newRef.stackId||
     newRef?.bodyId&&location.bodyId!==newRef.bodyId||
     newRef?.openingId&&location.openingId!==newRef.openingId||
     newRef?.positionLabel&&location.positionLabel!==newRef.positionLabel||
     !oldRef&&item.location?.type!=='storage'||
     oldRef&&item.location?.type==='hive'&&item.location.hiveId!==hiveId)
   return fail('season_manifest_item_move_invalid',{itemId:row?.itemId});
  itemIds.add(row.itemId);
 }
 const bodyMoves=moved.map(id=>({
  bodyId:id,
  from:structuredClone(oldPositions.get(id)||null),
  to:structuredClone(newPositions.get(id)||{type:'storage',label:storage[id]})
 }));
 const mapped={...structuredClone(request),bodyMoves};
 // Do not add actualWorkConfirmed or completion flags. The physical executor,
 // independent archive gate and real CAS must independently authorize them.
 return {ok:true,stagedOnly:true,operationCompleted:false,
  physicalLayoutValidated:false,requiresFullPhysicalAndArchiveGates:true,
  request:mapped,bodyMoves,removedBodyIds:removed,addedBodyIds:moved.filter(id=>!oldPositions.has(id)),requiredItemMoveIds:itemChanged};
}
root.PasekaSectionalSeasonBodyManifestV2=Object.freeze({stageManifest});
})(typeof window!=='undefined'?window:globalThis);
