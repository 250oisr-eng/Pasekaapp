/* Source: user DOCX "улей для каждого техпроцесс.docx", paragraphs 4–5.
   OP-01 is an observed spring entrance configuration, NEVER a remote hive actuator.
   No hole dimensions are invented. New history is optional on legacy schema 15. */
(function(root){
'use strict';
const PROFILE='sectional-multiqueen-v1';
const EXPECTED=Object.freeze({lowerFlat:'slightly_open',lowerRound:'open',upperMiddle:'closed',upperTop:'closed'});
const validAt=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const rows=v=>Array.isArray(v)?v:[];
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
const keys=Object.keys(EXPECTED);
function inspect(state){
 if(!object(state))return [{code:'entrance_state_invalid'}];
 const history=state.sectionalEntranceObservations;
 if(history==null)return [];
 if(!Array.isArray(history))return [{code:'entrance_history_not_array'}];
 const errors=[],ids=new Set(),hives=new Map(rows(state.hives).map(x=>[x?.id,x]));
 history.forEach((entry,i)=>{
  const invalid=code=>errors.push({code,details:{index:i,id:entry?.id??null}});
  if(!object(entry)||typeof entry.id!=='string'||!entry.id.trim()||ids.has(entry.id)){invalid('entrance_event_invalid_or_duplicate_id');return}
  ids.add(entry.id);
  if(entry.operationId!=='OP-01'||entry.profileId!==PROFILE||hives.get(entry.hiveId)?.profileId!==PROFILE)invalid('entrance_event_hive_profile_invalid');
  if(entry.userConfirmed!==true||entry.firstFlightObserved!==true)invalid('entrance_event_confirmation_missing');
  if(!validAt(entry.occurredAt)||!validAt(entry.recordedAt)||Date.parse(entry.occurredAt)>Date.parse(entry.recordedAt))invalid('entrance_event_time_invalid');
  if(!object(entry.entrances)||keys.some(k=>entry.entrances[k]!==EXPECTED[k])||Object.keys(entry.entrances||{}).length!==keys.length)invalid('entrance_event_configuration_invalid');
  if(typeof entry.notes!=='string'||entry.notes.length>500)invalid('entrance_event_notes_invalid');
 });
 return errors;
}
function recordOP01(state,request,makeId,now){
 const fail=error=>({ok:false,error});
 if(!object(state)||!object(request)||typeof makeId!=='function')return fail('invalid_request');
 if(request.userConfirmed!==true||request.firstFlightObserved!==true)return fail('flight_and_physical_confirmation_required');
 const hive=rows(state.hives).find(x=>x?.id===request.hiveId);
 if(!hive||hive.profileId!==PROFILE)return fail('sectional_profile_required');
 const layouts=rows(state.sectionalLayouts).filter(x=>x?.hiveId===hive.id);
 if(layouts.length!==1||layouts[0].mode!=='SINGLE_FAMILY'||rows(layouts[0].sections).length!==1||rows(layouts[0].sections[0]?.broodBodyIds).length!==3)return fail('three_body_single_family_layout_required');
 const entrances=request.entrances;
 if(!object(entrances)||keys.some(k=>entrances[k]!==EXPECTED[k])||Object.keys(entrances).length!==keys.length)return fail('confirmed_source_configuration_required');
 const at=request.occurredAt,recordedAt=now;
 if(!validAt(at)||!validAt(recordedAt)||Date.parse(at)>Date.parse(recordedAt))return fail('observation_time_invalid');
 if(request.notes!=null&&(typeof request.notes!=='string'||request.notes.length>500))return fail('notes_invalid');
 if(state.sectionalEntranceObservations!=null&&!Array.isArray(state.sectionalEntranceObservations))return fail('history_corrupt');
 if(rows(state.sectionalEntranceObservations).some(x=>x?.hiveId===hive.id&&x?.operationId==='OP-01'&&x?.occurredAt===at))return fail('observation_duplicate');
 const id=String(makeId()||'');
 if(!id||id.length>160||rows(state.sectionalEntranceObservations).some(x=>x?.id===id))return fail('event_id_invalid');
 const evidence={id,operationId:'OP-01',profileId:PROFILE,hiveId:hive.id,
  occurredAt:at,recordedAt,userConfirmed:true,firstFlightObserved:true,
  entrances:{...entrances},notes:request.notes?.trim()||''};
 const after={...state,sectionalEntranceObservations:[...rows(state.sectionalEntranceObservations),evidence]};
 if(inspect(after).length)return fail('observation_integrity_failed');
 return {ok:true,event:evidence}; // PURE: caller must commit with validated durable save.
}
root.PasekaSectionalEntranceOperations=Object.freeze({PROFILE,EXPECTED,inspect,recordOP01});
})(typeof window!=='undefined'?window:globalThis);
