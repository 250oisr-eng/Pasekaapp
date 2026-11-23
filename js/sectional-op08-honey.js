(function(){
'use strict';
// Pure OP08 staging: returns new state, never marks actual extraction without user's proof.
const PROFILE='sectional-multiqueen-v1',rows=x=>Array.isArray(x)?x:[],obj=x=>x&&typeof x==='object'&&!Array.isArray(x),stamp=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const fail=(error,details)=>({ok:false,error,...(details?{details}:{})});
function stage(state,request,deps={}){
 if(!obj(state)||!obj(request)||request.userConfirmed!==true||request.honeySealedPersonallyObserved!==true||request.honeyExtractionActuallyDone!==true||request.honeyBodiesActuallyReturned!==true||!stamp(request.occurredAt)||!Array.isArray(request.frameIds)||!request.frameIds.length||typeof deps.makeId!=='function')return fail('op08_actual_extraction_confirmation_required');
 const hive=rows(state.hives).find(h=>h?.id===request.hiveId),layouts=rows(state.sectionalLayouts).filter(l=>l?.hiveId===request.hiveId);
 if(hive?.profileId!==PROFILE||layouts.length!==1||layouts[0].mode!=='SIDE_BY_SIDE')return fail('op08_sectional_layout_required');
 const honeyIds=rows(layouts[0].honeyStack?.bodyIds);
 if(![2,4].includes(honeyIds.length)||new Set(honeyIds).size!==honeyIds.length)return fail('op08_honey_body_pair_invalid');
 const selected=new Set(request.frameIds);
 if(selected.size!==request.frameIds.length||request.frameIds.some(id=>typeof id!=='string'||!id))return fail('op08_frame_id_invalid_or_duplicate');
 if(state.sectionalHoneyExtractions!=null&&!Array.isArray(state.sectionalHoneyExtractions))return fail('op08_extraction_journal_invalid');
 const journal=rows(state.sectionalHoneyExtractions);
 if(journal.some(e=>e?.id===request.extractionId)||!request.extractionId||typeof request.extractionId!=='string')return fail('op08_extraction_id_invalid');
 const matches=[],seenFrameIds=new Set();
 for(const bodyId of honeyIds){
  const body=state.equipmentInventory?.bodies?.[bodyId];
  if(!obj(body)||!Array.isArray(body.frames)||body.kind!=='honey')return fail('op08_honey_body_inventory_invalid',{bodyId});
  for(const frame of body.frames){
   if(!obj(frame)||!frame.frameId||seenFrameIds.has(frame.frameId))return fail('op08_frame_inventory_corrupted',{bodyId});
   seenFrameIds.add(frame.frameId);
   if(selected.has(frame.frameId))matches.push({bodyId,frameId:frame.frameId,frame});
  }
 }
 if(matches.length!==selected.size)return fail('op08_selected_frames_not_in_honey_bodies');
 if(matches.some(m=>!Array.isArray(m.frame.history)))return fail('op08_frame_history_missing');
 const priorIds=new Set(journal.flatMap(e=>rows(e?.frameIds)));
 if(request.preventDuplicateCurrentHarvest===true&&matches.some(m=>priorIds.has(m.frameId)))return fail('op08_repeat_extraction_rejected');
 if(!stamp(deps.now||request.occurredAt)||Date.parse(request.occurredAt)>Date.parse(deps.now||request.occurredAt))return fail('op08_timestamp_future');
 const draft=structuredClone(state),events=[],uniqueIds=new Set();
 for(const {bodyId,frameId} of matches){
  const frame=draft.equipmentInventory.bodies[bodyId].frames.find(f=>f.frameId===frameId);
  const id=String(deps.makeId()||'');
  if(!id||uniqueIds.has(id)||frame.history.some(e=>e?.id===id))return fail('op08_history_event_id_invalid');
  uniqueIds.add(id);
  const previous=frame.honeyState??null;
  frame.history.push({id,action:'sectional_honey_extracted',at:request.occurredAt,operationId:'OP-08',extractionId:request.extractionId,bodyId,frameId,previousHoneyState:previous,sealingObserved:true,extractedConfirmed:true});
  frame.honeyState='extracted';
  events.push({bodyId,frameId,eventId:id});
 }
 draft.sectionalHoneyExtractions=[...journal,{id:request.extractionId,hiveId:request.hiveId,operationId:'OP-08',occurredAt:request.occurredAt,userConfirmed:true,source:'personal_observation',honeySealedPersonallyObserved:true,extractionActuallyDone:true,honeyBodiesActuallyReturned:true,frameIds:[...selected],frameMovementEvents:events}];
 return {ok:true,draft,extraction:draft.sectionalHoneyExtractions.at(-1)};
}
function inspect(state){
 if(!obj(state))return [{code:'op08_state_invalid'}];
 const list=state.sectionalHoneyExtractions;if(list==null)return [];if(!Array.isArray(list))return [{code:'op08_journal_invalid'}];
 const errors=[],ids=new Set();
 for(const [index,e] of list.entries()){
  if(!obj(e)||typeof e.id!=='string'||!e.id||ids.has(e.id)){errors.push({code:'op08_extraction_id_invalid',index});continue}ids.add(e.id);
  if(e.operationId!=='OP-08'||!stamp(e.occurredAt)||e.userConfirmed!==true||e.honeySealedPersonallyObserved!==true||e.extractionActuallyDone!==true||e.honeyBodiesActuallyReturned!==true)errors.push({code:'op08_extraction_proof_invalid',index});
  const hive=rows(state.hives).find(h=>h.id===e.hiveId);
  if(hive?.profileId!==PROFILE||!Array.isArray(e.frameIds)||!e.frameIds.length||new Set(e.frameIds).size!==e.frameIds.length||rows(e.frameMovementEvents).length!==e.frameIds.length)errors.push({code:'op08_extraction_references_invalid',index});
  for(const move of rows(e.frameMovementEvents)){
   const frame=state.equipmentInventory?.bodies?.[move.bodyId]?.frames?.find(f=>f.frameId===move.frameId);
   const event=rows(frame?.history).find(h=>h.id===move.eventId);
   if(!e.frameIds?.includes(move.frameId)||!event||event.action!=='sectional_honey_extracted'||event.extractionId!==e.id||event.at!==e.occurredAt)errors.push({code:'op08_frame_history_mismatch',index,frameId:move.frameId});
  }
 }
 return errors;
}
window.PasekaSectionalOP08Honey=Object.freeze({PROFILE,stage,inspect});
})();