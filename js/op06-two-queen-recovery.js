(function(root){
'use strict';
// Read-only OP-06 rescue planning. Live OP-06 / inventory execution remains
// fail-closed until all frame slots, meshes, evidence and restore gates exist.
const A=x=>Array.isArray(x)?x:[];
const O=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const S=x=>typeof x==='string'&&x.trim().length>0;
const PROFILE='sectional-multiqueen-v1';
const POSITIONS=['left','middle','right'];
const fail=(...errors)=>({ok:false,errors});
function plan(input){
 if(!O(input))return fail('recovery_input_required');
 const sections=A(input.sections),errors=[];
 const add=e=>errors.push(e);
 if(sections.length!==3||sections.some(s=>!S(s?.id)||!POSITIONS.includes(s.position))||
    new Set(sections.map(s=>s.id)).size!==3||
    new Set(sections.map(s=>s.position)).size!==3)add('three_actual_sections_required');
 const missing=sections.find(s=>s?.id===input.queenlessSectionId);
 if(!missing)add('queenless_section_not_identified');
 if(sections.filter(s=>s.queenState==='QUEENLESS').length!==1||
    missing?.queenState!=='QUEENLESS'||
    sections.filter(s=>s.queenState==='QUEENRIGHT').length!==2)
   add('two_queenright_one_queenless_confirmations_required');
 const transfers=A(input.transfers);
 if(transfers.length!==2)add('exactly_two_brood_frames_required');
 if(transfers.some(t=>!S(t?.frameId)||!S(t?.fromSectionId)||
   t.toSectionId!==input.queenlessSectionId||t.broodObserved!==true||
   t.queenAbsentOnTransferredFrameConfirmed!==true))
   add('brood_and_queen_safety_confirmation_required');
 if(new Set(transfers.map(t=>t?.frameId)).size!==transfers.length)add('duplicate_frame');
 if(transfers.some(t=>!sections.some(s=>s.id===t.fromSectionId&&s.queenState==='QUEENRIGHT')))
   add('donor_must_be_queenright');
 if(input.userConfirmed!==true)add('beekeeper_confirmation_required');
 if(errors.length)return {ok:false,errors};
 return {
  ok:true,readOnly:true,operationCompleted:false,releaseAllowed:false,
  queenlessSectionId:missing.id,
  transfers:transfers.map(t=>({frameId:t.frameId,fromSectionId:t.fromSectionId,toSectionId:t.toSectionId})),
  meshRule:missing.position==='middle'?'KEEP_EXISTING_MESH':
    'REAPPLY_INITIAL_ISOLATION_RULE_AT_CENTER_EDGE',
  meshBoundary:missing.position==='middle'?null:{betweenPositions:[missing.position,'middle']},
  meshTiming:'REQUIRES_ACTUAL_OBSERVATION_AND_CONFIRMATION',
  queenRearingOutcome:'UNKNOWN'
 };
}
// Inventory-grounded preview. Rejects caller-supplied queen positions; they
// must come from actual lineage observations, not a UI checkbox or AI guess.
// Does not persist, move frames, update queen identities, or install mesh.
function planFromState(state,request,deps={}){
 if(!O(state)||!O(request)||!S(request.hiveId)||!O(deps.lineage)||
   typeof deps.lineage.getQueenPresenceStatus!=='function')
   return fail('state_request_and_lineage_required');
 const hive=A(state.hives).find(h=>h?.id===request.hiveId);
 if(hive?.profileId!==PROFILE)return fail('sectional_profile_required');
 const candidates=A(state.sectionalLayouts).filter(l=>l?.hiveId===request.hiveId);
 if(candidates.length!==1)return fail('unique_physical_layout_required');
 const layout=candidates[0],inventory=state.equipmentInventory;
 if(layout.profileId!==PROFILE||layout.mode!=='SIDE_BY_SIDE'||!O(inventory?.bodies)||
    !O(inventory?.items))return fail('sectional_layout_and_inventory_required');
 if(A(layout.sections).length!==3||A(layout.sections).some((s,i)=>s?.position!==POSITIONS[i]||
    !S(s.familyId)||!S(s.id)||!Array.isArray(s.broodBodyIds)))
    return fail('actual_section_position_or_family_invalid');
 const sections=A(layout.sections).map(s=>{
  const queen=deps.lineage.getQueenPresenceStatus(state,s.familyId);
  return {id:s.id,position:s.position,
   queenState:queen==='confirmed_present'?'QUEENRIGHT':queen==='confirmed_absent'?'QUEENLESS':'UNKNOWN'};
 });
 const actualMissing=sections.find(s=>s.queenState==='QUEENLESS');
 if(!actualMissing||actualMissing.id!==request.queenlessSectionId)return fail('queenless_location_not_proven_by_lineage');
 const receiver=A(layout.sections).find(s=>s.id===actualMissing.id);
 if(!S(request.toBodyId)||!A(receiver.broodBodyIds).includes(request.toBodyId))
   return fail('receiving_body_not_in_queenless_section');
 const targetBody=inventory.bodies[request.toBodyId];
 if(targetBody?.kind!=='brood'||targetBody?.spec?.profileId!==PROFILE||targetBody?.spec?.framesPerBox!==6||
   !Array.isArray(targetBody.frames)||targetBody.condition!=='good')
   return fail('receiving_body_inventory_invalid');
 const transfers=A(request.transfers),errors=[];
 if(transfers.length!==2)return fail('exactly_two_brood_frames_required');
 const normalized=[];
 const allFrames=new Set();
 // Explicit, physical frame ownership: no duplicate ID in any present brood body.
 for(const sec of A(layout.sections))for(const bodyId of A(sec.broodBodyIds)){
  const body=inventory.bodies[bodyId];
  if(body?.kind!=='brood'||body?.condition!=='good'||body?.spec?.profileId!==PROFILE||
     body.spec.framesPerBox!==6||!Array.isArray(body.frames))return fail('registered_brood_body_invalid');
  for(const frame of body.frames){
   if(!S(frame?.frameId)||!Array.isArray(frame.history)||allFrames.has(frame.frameId))
     return fail('frame_id_or_history_corrupt');
   allFrames.add(frame.frameId);
  }
 }
 for(const t of transfers){
  const sec=A(layout.sections).find(s=>s.id===t?.fromSectionId);
  if(!O(t)||!sec||sections.find(s=>s.id===sec.id)?.queenState!=='QUEENRIGHT'||
     !S(t.fromBodyId)||!A(sec.broodBodyIds).includes(t.fromBodyId)||
     !S(t.frameId)||t.fromBodyId===request.toBodyId||
     !inventory.bodies[t.fromBodyId].frames.some(f=>f.frameId===t.frameId)){
    errors.push('donor_frame_not_in_confirmed_queenright_body');continue;
  }
  normalized.push({...t,toBodyId:request.toBodyId,toSectionId:request.queenlessSectionId});
 }
 if(errors.length)return {ok:false,errors};
 const core=plan({sections,queenlessSectionId:request.queenlessSectionId,
  transfers:normalized,userConfirmed:request.userConfirmed});
 if(!core.ok)return core;
 const result={...core,hiveId:request.hiveId,layoutId:layout.id,
   toBodyId:request.toBodyId,
   transfers:normalized.map(t=>({frameId:t.frameId,fromSectionId:t.fromSectionId,
    fromBodyId:t.fromBodyId,toSectionId:t.toSectionId,toBodyId:t.toBodyId})),
   requiresFrameSlotReconciliation:targetBody.frames.length+normalized.length>targetBody.spec.framesPerBox,
   requiresPersonalPhysicalExecution:true,
   canPersist:false};
 if(actualMissing.position==='middle'){
  result.meshRule='KEEP_EXISTING_MESH';
  result.meshBoundary=null;
  result.meshInventoryAction='DO_NOT_CHANGE';
 }else{
  const central=A(layout.sections).find(s=>s.position==='middle');
  const boundary=A(layout.technicalConnections).filter(c=>
   (c.fromSectionId===actualMissing.id&&c.toSectionId===central?.id)||
   (c.toSectionId===actualMissing.id&&c.fromSectionId===central?.id));
  if(boundary.length!==1||boundary[0].bufferCorridorPresent!==true||
    A(boundary[0].openings).length===0)return fail('center_edge_technical_boundary_unverified');
  const refs=A(boundary[0].openings),allOpenings=new Set(A(layout.sections).flatMap(s=>A(s.openings).map(o=>o.id)));
  if(refs.some(r=>!S(r?.openingId)||!S(r?.bodyId)||!allOpenings.has(r.openingId))||
    new Set(refs.map(r=>r.openingId)).size!==refs.length)
    return fail('boundary_openings_not_verified');
  const plugs=A(layout.temporaryQueenIsolation);
  const installed=refs.filter(r=>plugs.some(p=>p.openingId===r.openingId&&
   p.bodyId===r.bodyId&&inventory.items[p.itemId]?.kind==='metalMeshPlug'&&
   inventory.items[p.itemId]?.location?.type==='hive'&&
   inventory.items[p.itemId]?.location?.openingId===r.openingId));
  result.meshBoundary={betweenPositions:[actualMissing.position,'middle'],connectionId:boundary[0].id,
    openingIds:refs.map(r=>r.openingId)};
  result.existingMeshOpeningIds=installed.map(x=>x.openingId);
  result.meshInventoryAction=installed.length===refs.length?'VERIFY_EXISTING':'RECONCILE_WITH_INITIAL_RULE';
 }
 return result;
}
root.PasekaOP06TwoQueenRecovery=Object.freeze({plan,planFromState});
})(typeof window!=='undefined'?window:globalThis);
