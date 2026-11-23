/* OP-03 optional pre-split swap of UPPER and LOWER brood bodies.
   Authoritative source: user technology DOCX paragraphs 7–9.
   Middle body stays in the middle. No inferred date or queen placement.
   Transaction is staged, locally validated, and never writes IndexedDB directly. */
(function(root){
'use strict';
const PROFILE='sectional-multiqueen-v1';
const array=v=>Array.isArray(v)?v:[];
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const validAt=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
function inspect(state){
 if(!object(state))return [{code:'op03_state_invalid'}];
 const history=state.sectionalBodyReorders;
 if(history==null)return [];
 if(!Array.isArray(history))return [{code:'op03_history_not_array'}];
 const errors=[],ids=new Set();
 for(const entry of history){
  if(!object(entry)||typeof entry.id!=='string'||!entry.id.trim()||ids.has(entry.id)){errors.push({code:'op03_duplicate_or_invalid_event'});continue}
  ids.add(entry.id);
  if(entry.operationId!=='OP-03'||entry.profileId!==PROFILE||!array(state.hives).some(h=>h?.id===entry.hiveId&&h?.profileId===PROFILE))errors.push({code:'op03_profile_or_hive_mismatch',id:entry.id});
  if(entry.userConfirmed!==true||!validAt(entry.occurredAt)||!validAt(entry.recordedAt)||Date.parse(entry.occurredAt)>Date.parse(entry.recordedAt))errors.push({code:'op03_event_confirmation_invalid',id:entry.id});
  const before=entry.before,after=entry.after;
  if(!Array.isArray(before)||before.length!==3||new Set(before).size!==3||!before.every(x=>typeof x==='string'&&x.length>0)||!Array.isArray(after)||JSON.stringify(after)!==JSON.stringify([before[2],before[1],before[0]]))errors.push({code:'op03_swap_evidence_invalid',id:entry.id});
 }
 return errors;
}
function applySwap(state,request,deps={}){
 const deny=error=>({ok:false,error});
 if(!object(state)||!object(request)||request.userConfirmed!==true||typeof deps.makeId!=='function'||typeof deps.PasekaSectionalPhysicalLayout?.inspect!=='function'||typeof deps.PasekaInventory?.inspect!=='function'||typeof deps.PasekaEquipmentItems?.inspect!=='function'||typeof deps.PasekaFamilyLineage?.inspect!=='function'||typeof deps.PasekaLabels?.appendFrameEvent!=='function')return deny('confirmation_or_dependencies_required');
 const at=request.occurredAt,recordedAt=deps.now;
 if(!validAt(at)||!validAt(recordedAt)||Date.parse(at)>Date.parse(recordedAt))return deny('operation_time_invalid');
 const hive=array(state.hives).find(h=>h?.id===request.hiveId);
 if(hive?.profileId!==PROFILE)return deny('sectional_profile_required');
 const layouts=array(state.sectionalLayouts).filter(l=>l?.hiveId===hive.id);
 if(layouts.length!==1)return deny('unique_layout_required');
 const layout=layouts[0];
 if(layout.profileId!==PROFILE||layout.mode!=='SINGLE_FAMILY'||array(layout.sections).length!==1||layout.honeyStack!=null)return deny('single_family_before_split_required');
 const section=layout.sections[0],before=section.broodBodyIds;
 if(!Array.isArray(before)||before.length!==3||new Set(before).size!==3||section.upperBroodBodyId!==before[2])return deny('three_ordered_brood_bodies_required');
 if(array(state.sectionalTechProcesses).some(p=>p?.hiveId===hive.id))return deny('pre_split_only');
 if(state.sectionalBodyReorders!=null&&!Array.isArray(state.sectionalBodyReorders))return deny('history_corrupt');
 if(array(state.sectionalBodyReorders).some(e=>e?.hiveId===hive.id&&e?.operationId==='OP-03'&&e?.userConfirmed))return deny('optional_swap_already_recorded');
 const bodies=state.equipmentInventory?.bodies;
 if(!object(bodies)||before.some(id=>bodies[id]?.kind!=='brood'||!Array.isArray(bodies[id]?.frames)||bodies[id].frames.length!==6||bodies[id].frames.some(fr=>!object(fr)||fr.history!=null&&!Array.isArray(fr.history))))return deny('body_or_frame_inventory_invalid');
 const initial=[...deps.PasekaSectionalPhysicalLayout.inspect(state),...deps.PasekaInventory.inspect(state,deps.PasekaLabels,deps.profileForHive),...deps.PasekaEquipmentItems.inspect(state),...deps.PasekaFamilyLineage.inspect(state),...inspect(state)];
 if(initial.length)return {ok:false,error:'initial_state_invalid',details:initial};
 let draft;
 try{draft=structuredClone(state)}catch(e){return deny('clone_failed')}
 const after=[before[2],before[1],before[0]],target=draft.sectionalLayouts.find(l=>l.id===layout.id);
 target.sections[0].broodBodyIds=after.slice();
 target.sections[0].upperBroodBodyId=after[2];
 const used=new Set([...array(draft.sectionalBodyReorders),...array(draft.equipmentInventory?.events),...array(draft.auditLog),
  ...Object.values(draft.equipmentInventory?.bodies||{}).flatMap(b=>[...array(b.events),...array(b.frames).flatMap(f=>array(f.history))])].map(x=>x?.id).filter(Boolean));
 const nextId=()=>{const id=String(deps.makeId()||'');if(!id||id.length>160||used.has(id))throw Error('event_id_conflict');used.add(id);return id};
 let event;
 try{
  const id=nextId();
  event={id,operationId:'OP-03',profileId:PROFILE,hiveId:hive.id,layoutId:layout.id,
   before:before.slice(),after:after.slice(),occurredAt:at,recordedAt,userConfirmed:true};
  if(!Array.isArray(draft.sectionalBodyReorders))draft.sectionalBodyReorders=[];
  draft.sectionalBodyReorders.push(event);
  if(!Array.isArray(draft.equipmentInventory.events))throw Error('inventory_events_missing');
  draft.equipmentInventory.events.push({id:nextId(),type:'sectional_op03_body_order_swapped',at,operationId:'OP-03',hiveId:hive.id,before:before.slice(),after:after.slice(),eventId:event.id});
  for(const bodyId of [before[0],before[2]]){
   const body=draft.equipmentInventory.bodies[bodyId];
   if(body.events!=null&&!Array.isArray(body.events))throw Error('body_history_invalid');
   if(!Array.isArray(body.events))body.events=[];
   const fromIndex=before.indexOf(bodyId)+1,toIndex=after.indexOf(bodyId)+1;
   body.events.push({id:nextId(),type:'sectional_op03_body_reordered',operationId:'OP-03',at,hiveId:hive.id,fromPosition:fromIndex,toPosition:toIndex});
   body.updatedAt=at;
   for(const frame of body.frames){
    deps.PasekaLabels.appendFrameEvent(frame,'sectional_body_reordered',{hiveId:hive.id,bodyId,operationId:'OP-03',fromPosition:fromIndex,toPosition:toIndex},at,nextId());
   }
  }
  if(!Array.isArray(draft.auditLog))draft.auditLog=[];
  draft.auditLog.push({id:nextId(),type:'sectional_operation_confirmed',operationId:'OP-03',hiveId:hive.id,at,eventId:event.id});
 }catch(e){return {ok:false,error:'history_recording_failed',details:{message:e.message}}}
 const check=[...deps.PasekaSectionalPhysicalLayout.inspect(draft),...deps.PasekaInventory.inspect(draft,deps.PasekaLabels,deps.profileForHive),...deps.PasekaEquipmentItems.inspect(draft),...deps.PasekaFamilyLineage.inspect(draft),...inspect(draft)];
 if(check.length)return {ok:false,error:'swap_validation_failed',details:check};
 // The caller must persist the complete resulting state atomically with revision CAS.
 return {ok:true,draft,event};
}
root.PasekaSectionalOP03BodySwap=Object.freeze({PROFILE,inspect,applySwap});
})(typeof window!=='undefined'?window:globalThis);
