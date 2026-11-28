/* OP-06 reduced-two-queen case: append-only absence evidence and read-only derived outcome.
   The original DOCX permits productive two-queen operation, but gives NO special mesh-removal
   procedure. Neither this module nor its UI may authorize OP-06 completion. */
(function(root){
'use strict';
const PROFILE='sectional-multiqueen-v1';
const array=v=>Array.isArray(v)?v:[];
const allowed=new Set(['confirmed_present','confirmed_absent','unresolved','inconsistent','historical']);
function assess(state,processId,lineage){
 const deny=(code,extra={})=>Object.freeze({ok:false,code,outcome:'UNKNOWN',canRemoveMesh:false,canCompleteOP06:false,...extra});
 if(!state||typeof state!=='object'||!lineage||typeof lineage.getQueenPresenceStatus!=='function')return deny('MISSING_DEPENDENCY');
 const process=array(state.sectionalTechProcesses).find(x=>x?.id===processId);
 if(!process||!process.hiveId)return deny('PROCESS_NOT_FOUND');
 const hive=array(state.hives).find(x=>x?.id===process.hiveId);
 if(hive?.profileId!==PROFILE)return deny('PROFILE_NOT_ACTIVE',{processId,hiveId:process.hiveId});
 const ops=array(process.state?.operations);
 const op04=ops.find(x=>x?.operationId==='OP-04');
 const split=array(state.familyEvents).find(x=>x?.id===op04?.evidence?.familyEventId&&x?.type==='split'&&x?.operationId==='OP-04'&&x?.techProcessId===processId&&x?.hiveId===process.hiveId);
 if(!split||!Array.isArray(split.resultFamilyIds)||split.resultFamilyIds.length!==3||new Set(split.resultFamilyIds).size!==3)return deny('THREE_FAMILY_SPLIT_REQUIRED');
 const families=split.resultFamilyIds.map(id=>array(state.families).find(f=>f?.id===id&&f?.hive===process.hiveId&&f?.recordStatus!=='historical'));
 if(families.some(f=>!f))return deny('CURRENT_FAMILIES_REQUIRED');
 const sections=families.map(f=>{
   const presence=lineage.getQueenPresenceStatus(state,f.id);
   const queenId=f.currentQueenId||null;
   const identity=array(state.familyEvents).find(e=>e?.type==='queen_identity_confirmed'&&e?.familyId===f.id&&e?.queenId===queenId&&e?.hiveId===process.hiveId&&e?.techProcessId===processId&&typeof e?.occurredAt==='string'&&Number.isFinite(Date.parse(e.occurredAt)));
   const observed=queenId!==null&&!!identity&&array(state.queenEvents).some(x=>x?.type==='laying_observed'&&x?.queenId===queenId&&x?.familyId===f.id&&x?.splitEventId===split.id&&x?.techProcessId===processId&&x?.hiveId===process.hiveId&&x?.userConfirmed===true&&typeof x?.occurredAt==='string'&&Number.isFinite(Date.parse(x.occurredAt))&&typeof x?.createdAt==='string'&&Number.isFinite(Date.parse(x.createdAt))&&Date.parse(x.occurredAt)>=Date.parse(identity.occurredAt)&&Date.parse(x.occurredAt)>=Date.parse(split.occurredAt));
   return Object.freeze({familyId:f.id,queenId,presence:allowed.has(presence)?presence:'inconsistent',layingConfirmed:presence==='confirmed_present'&&observed});
 });
 const count=name=>sections.filter(row=>row.presence===name).length;
 const present=count('confirmed_present'),absent=count('confirmed_absent'),laying=sections.filter(x=>x.layingConfirmed).length;
 const reduced=present===2&&absent===1&&sections.every(row=>row.presence==='confirmed_present'||row.presence==='confirmed_absent');
 const outcome=reduced?(laying===2?'TWO_LAYING_QUEENS_ONE_ABSENT':'TWO_QUEENS_ONE_ABSENT_LAYING_UNVERIFIED'):present===3&&laying===3?'THREE_LAYING_QUEENS': 'NOT_DETERMINED';
 return Object.freeze({ok:true,code:reduced?'TWO_QUEEN_BRANCH_BLOCKED':'OBSERVATION_ONLY',outcome,sections:Object.freeze(sections),processId,hiveId:process.hiveId,splitEventId:split.id,presentCount:present,absentCount:absent,layingConfirmedCount:laying,canRemoveMesh:false,canCompleteOP06:false,requiresProcedureConfirmation:reduced});
}
function recordConfirmedAbsence(state,request,lineage,makeId,now){
 if(!state||!request||request.userConfirmed!==true)return {ok:false,error:'explicit_absence_confirmation_required'};
 if(typeof request.familyId!=='string'||typeof request.processId!=='string'||typeof makeId!=='function')return {ok:false,error:'required_identifiers_missing'};
 const before=assess(state,request.processId,lineage);
 if(!before.ok)return {ok:false,error:before.code};
 if(!before.sections.some(row=>row.familyId===request.familyId&&row.presence==='unresolved'))return {ok:false,error:'family_not_unresolved'};
 if(before.absentCount!==0)return {ok:false,error:'absence_already_registered'};
 if(typeof request.occurredAt!=='string'||Number.isNaN(Date.parse(request.occurredAt)))return {ok:false,error:'invalid_observation_time'};
 if(!lineage||typeof lineage.confirmQueenAbsence!=='function')return {ok:false,error:'missing_lineage_confirmation'};
 // Existing family-lineage transaction is the authoritative, validated append-only writer.
 const result=lineage.confirmQueenAbsence(state,{
  familyId:request.familyId,splitEventId:before.splitEventId,techProcessId:request.processId,
  userConfirmed:true,occurredAt:request.occurredAt,notes:request.notes||''
 },makeId,now);
 if(!result.ok)return result;
 return {ok:true,event:result.event,status:assess(state,request.processId,lineage)};
}
root.PasekaSectionalQueenOutcome=Object.freeze({PROFILE,assess,recordConfirmedAbsence});
})(typeof window!=='undefined'?window:globalThis);
