(function(){
'use strict';
// OP09 personally observed seasonal entrances. No actuator, no invented millimetres.
const PROFILE='sectional-multiqueen-v1',rows=x=>Array.isArray(x)?x:[],object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const valid=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const configurations={
 SUMMER_OPEN:{roundEntrances:'all_open',flatEntrance:'fully_open'},
 AUTUMN_REDUCED:{roundEntrances:'one_open',flatEntrance:'one_bee_width'}
};
const fail=error=>({ok:false,error});
function inspect(state){
 if(!object(state))return [{code:'op09_state_invalid'}];
 const history=state.sectionalSeasonalEntranceObservations;
 if(history==null)return [];
 if(!Array.isArray(history))return [{code:'op09_history_invalid'}];
 const errors=[],seen=new Set(),hives=new Set(rows(state.hives).filter(x=>x?.profileId===PROFILE).map(x=>x.id));
 for(const [index,r] of history.entries()){
  if(!object(r)||typeof r.id!=='string'||!r.id||seen.has(r.id)){errors.push({code:'op09_record_invalid_or_duplicate',index});continue}seen.add(r.id);
  if(r.profileId!==PROFILE||r.operationId!=='OP-09'||!hives.has(r.hiveId)||r.userConfirmed!==true||!valid(r.occurredAt)||!valid(r.recordedAt)||Date.parse(r.occurredAt)>Date.parse(r.recordedAt))errors.push({code:'op09_evidence_invalid',index});
  if(!Object.hasOwn(configurations,r.phase))errors.push({code:'op09_phase_invalid',index});
  const expected=configurations[r.phase];
  if(!expected||rows(r.sections).length!==3||new Set(rows(r.sections).map(s=>s.sectionId)).size!==3||rows(r.sections).some(s=>s.roundEntrances!==expected.roundEntrances||s.flatEntrance!==expected.flatEntrance))errors.push({code:'op09_section_entrances_invalid',index});
  if(typeof r.notes!=='string'||r.notes.length>500)errors.push({code:'op09_notes_invalid',index});
 }
 return errors;
}
function record(state,request,makeId,now){
 if(!object(state)||!object(request)||typeof makeId!=='function'||!valid(now)||!valid(request.occurredAt)||Date.parse(request.occurredAt)>Date.parse(now)||request.userConfirmed!==true)return fail('op09_personal_confirmation_required');
 const profile=rows(state.hives).find(h=>h?.id===request.hiveId);
 const matchingLayouts=rows(state.sectionalLayouts).filter(l=>l?.hiveId===request.hiveId);
 if(profile?.profileId!==PROFILE||matchingLayouts.length!==1||matchingLayouts[0].mode!=='SIDE_BY_SIDE')return fail('op09_three_section_layout_required');
 if(!Object.hasOwn(configurations,request.phase))return fail('op09_season_phase_invalid');
 const actual=rows(request.sections),expected=configurations[request.phase],sectionIds=rows(matchingLayouts[0].sections).map(s=>s?.id);
 if(sectionIds.length!==3||actual.length!==3||new Set(actual.map(s=>s?.sectionId)).size!==3||actual.some(s=>!sectionIds.includes(s?.sectionId)||s.roundEntrances!==expected.roundEntrances||s.flatEntrance!==expected.flatEntrance))return fail('op09_actual_entrance_configuration_not_confirmed');
 const existing=rows(state.sectionalSeasonalEntranceObservations);
 if(state.sectionalSeasonalEntranceObservations!=null&&!Array.isArray(state.sectionalSeasonalEntranceObservations))return fail('op09_history_corrupted');
 const id=String(makeId()||'');if(!id||existing.some(e=>e.id===id))return fail('op09_event_id_invalid');
 const ev={id,operationId:'OP-09',profileId:PROFILE,hiveId:request.hiveId,phase:request.phase,occurredAt:request.occurredAt,recordedAt:now,userConfirmed:true,
  sections:structuredClone(actual),notes:typeof request.notes==='string'?request.notes.trim():''};
 const proposed={...state,sectionalSeasonalEntranceObservations:[...existing,ev]};
 if(inspect(proposed).length)return fail('op09_observation_rejected');
 return {ok:true,event:ev,stagedHistory:proposed.sectionalSeasonalEntranceObservations};
}
window.PasekaSectionalOP09Entrances=Object.freeze({PROFILE,configurations,inspect,record});
})();