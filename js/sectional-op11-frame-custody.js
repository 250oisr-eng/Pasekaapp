(()=>{'use strict';
// DOCX 53-57: every frame from the three REMOVED lower brood bodies needs
// separately tracked custody. This module is read-only and NOT the OP11 writer.
const str=x=>typeof x==='string'&&x.trim().length>0;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const fail=(error,details={})=>({ok:false,error,details});
function inspect(state,request){
 const source=window.PasekaSectionalOP11Preview?.preview?.(state,request);
 if(!source?.ok)return source||fail('op11_custody_preview_unavailable');
 const bodies=state?.equipmentInventory?.bodies;
 if(!obj(bodies))return fail('op11_custody_bodies_missing');
 const six=source.retainedBodyIds.concat(source.removedBodyIds);
 if(six.length!==6||new Set(six).size!==6)return fail('op11_custody_six_distinct_bodies_required');
 const frameOwners=new Map();
 for(const [id,body] of Object.entries(bodies)){
  if(!obj(body))return fail('op11_custody_invalid_body',{id});
  if(body.frames!=null&&!Array.isArray(body.frames))return fail('op11_custody_frames_not_array',{id});
  for(const frame of body.frames||[]){
   if(!obj(frame)||!str(frame.frameId))return fail('op11_custody_frame_id_missing',{id});
   if(frameOwners.has(frame.frameId))return fail('op11_custody_frame_id_duplicate',{frameId:frame.frameId,bodyIds:[frameOwners.get(frame.frameId),id]});
   frameOwners.set(frame.frameId,id);
  }
 }
 const inventory=[];
 for(const id of six){
  const body=bodies[id];
  if(!obj(body)||body.id!==id||body.kind!=='brood'||body.condition!=='good'||
   body.spec?.profileId!=='sectional-multiqueen-v1'||body.spec?.framesPerBox!==6||
   body.spec?.frame?.heightMm!==180||
   !Array.isArray(body.frames)||body.frames.length!==6)
   return fail('op11_custody_brood_geometry_unconfirmed',{bodyId:id});
  for(let n=0;n<6;n++){
   const frame=body.frames[n];
   if(!str(frame.frameId)||(!Array.isArray(frame.history)&&frame.history!=null))
    return fail('op11_custody_frame_history_unverified',{bodyId:id,index:n});
   if(!frameOwners.has(frame.frameId))return fail('op11_custody_frame_owner_missing',{bodyId:id,index:n});
  }
  inventory.push({bodyId:id,frameIds:body.frames.map(row=>row.frameId),
   disposition:source.retainedBodyIds.includes(id)?'retained_for_winter':'removed_for_processing'});
 }
 const removed=inventory.filter(x=>x.disposition==='removed_for_processing');
 const retained=inventory.filter(x=>x.disposition==='retained_for_winter');
 return {ok:true,readOnly:true,readyForPersistence:false,completionRecorded:false,
  operationId:'OP-11',sourceRevisionId:source.sourceRevisionId,hiveId:source.hiveId,
  retained:retained.map(x=>({...x,frameIds:[...x.frameIds]})),
  removed:removed.map(x=>({...x,frameIds:[...x.frameIds]})),
  removedFrameCount:removed.reduce((n,x)=>n+x.frameIds.length,0),
  retainedFrameCount:retained.reduce((n,x)=>n+x.frameIds.length,0),
  frameContentsNotInferred:true,processingNotRecorded:true};
}
function previewCustody(state,request){
 const scan=inspect(state,request);
 if(!scan.ok)return scan;
 const expected=scan.removed.flatMap(body=>body.frameIds);
 const action=request?.frameActions;
 if(!obj(action))return fail('op11_custody_frame_actions_required');
 const keys=Object.keys(action);
 if(keys.length!==expected.length||keys.some(id=>!expected.includes(id)))
  return fail('op11_custody_all_removed_frames_required',{expected:expected.length,actual:keys.length});
 const accepted=['honey','perga','mixed','other','unobserved'];
 const intents=[];
 for(const body of scan.removed){
  for(const id of body.frameIds){
   const row=action[id];
   if(!obj(row)||row.destination!=='processing'||!accepted.includes(row.observedContent))
    return fail('op11_custody_frame_destination_or_content_invalid',{frameId:id});
   intents.push({bodyId:body.bodyId,frameId:id,destination:'processing',
    observedContent:row.observedContent,
    observedByBeekeeper:row.observedContent!=='unobserved'});
  }
 }
 return {ok:true,readOnly:true,readyForPersistence:false,completionRecorded:false,
  operationId:'OP-11',sourceRevisionId:scan.sourceRevisionId,hiveId:scan.hiveId,
  removedBodyCount:scan.removed.length,removedFrameCount:scan.removedFrameCount,
  retainedBodyCount:scan.retained.length,retainedFrameCount:scan.retainedFrameCount,
  frameProcessingIntents:intents,
  physicalProcessingConfirmed:false,frameHistoryCommitted:false,independentBackupRestored:false,
  unresolved:['user_confirmation_all_bees_moved','actual_frame_processing',
   'append_only_body_and_frame_events','atomic_cas','verified_independent_restore']};
}
window.PasekaSectionalOP11FrameCustody=Object.freeze({inspect,previewCustody});
})();
