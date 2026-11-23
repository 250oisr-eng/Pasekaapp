(function(){
'use strict';
// Isolated contract: no IndexedDB writes, mutation, UI or authorization of physical work.
const VERSION=2, obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=x=>typeof x==='string'&&x.trim().length>0;
const copy=x=>structuredClone(x);
function inspect(records){
 if(!Array.isArray(records))return [{code:'season_ledger_not_array'}];
 const errors=[],ids=new Set(),byHive=new Map();
 records.forEach((r,index)=>{
  if(!obj(r)||r.modelVersion!==2||!text(r.id)||!text(r.hiveId)||!Number.isSafeInteger(r.cycleNumber)||r.cycleNumber<1||!['ACTIVE','CLOSED'].includes(r.status)||!Array.isArray(r.events)){errors.push({code:'season_record_invalid',index});return;}
  if(ids.has(r.id))errors.push({code:'season_id_duplicate',index});ids.add(r.id);
  const list=byHive.get(r.hiveId)||[];list.push(r);byHive.set(r.hiveId,list);
  let last=-Infinity,term=0;const eventIds=new Set();
  r.events.forEach((e,j)=>{
   if(!obj(e)||!text(e.id)||!text(e.type)||!text(e.occurredAt)||!Number.isFinite(Date.parse(e.occurredAt))||!obj(e.evidence)){errors.push({code:'season_event_invalid',index,eventIndex:j});return;}
   if(eventIds.has(e.id))errors.push({code:'season_event_duplicate',index,eventIndex:j});eventIds.add(e.id);
   const at=Date.parse(e.occurredAt);if(at<last)errors.push({code:'season_event_time_reverse',index,eventIndex:j});last=at;
   if(e.type==='CYCLE_CLOSED'){term++;if(j!==r.events.length-1||!text(e.evidence.reason)||!text(e.evidence.confirmedBy))errors.push({code:'season_close_evidence_invalid',index,eventIndex:j});}
  });
  if((r.status==='CLOSED'&&term!==1)||(r.status==='ACTIVE'&&term!==0))errors.push({code:'season_terminal_state_invalid',index});
 });
 for(const [h,list] of byHive){
  list.sort((a,b)=>a.cycleNumber-b.cycleNumber);
  if(list.filter(r=>r.status==='ACTIVE').length>1)errors.push({code:'season_multiple_active',hiveId:h});
  list.forEach((r,i)=>{if(r.cycleNumber!==i+1)errors.push({code:'season_cycle_number_gap_or_duplicate',hiveId:h});if(i<list.length-1&&r.status!=='CLOSED')errors.push({code:'season_previous_not_closed',hiveId:h});});
 }
 return errors;
}
function previewV1(records){
 if(!Array.isArray(records))return {ok:false,errors:[{code:'legacy_records_not_array'}]};
 const errors=[],result=[],hives=new Set();
 records.forEach((r,index)=>{
  if(!obj(r)||r.modelVersion!==1||!text(r.id)||!text(r.hiveId)||hives.has(r.hiveId)){errors.push({code:'legacy_process_invalid_or_duplicate',index});return;}
  hives.add(r.hiveId);
  result.push({modelVersion:2,id:'legacy-v1:'+r.id,hiveId:r.hiveId,cycleNumber:1,status:'ACTIVE',events:[],migrationStatus:'REQUIRES_RECONCILIATION',legacy:{sourceId:r.id,sourceModelVersion:1,original:copy(r)}});
 });
 if(errors.length)return {ok:false,errors};
 const check=inspect(result);return check.length?{ok:false,errors:check}:{ok:true,readOnly:true,records:result};
}

function inspectTerminalEvidence(records){
 const errors=[];
 if(!Array.isArray(records))return [{code:'terminal_records_invalid'}];
 for(const r of records){
  if(!obj(r)||r.status!=='CLOSED')continue;
  const events=r.events||[],last=events.at(-1),previous=events.at(-2);
  if(!previous||previous.type!=='STAGE_CONFIRMED'||!['OP-11','OP-14'].includes(previous.evidence?.operationId)||previous.evidence?.after?.layout?.mode!=='SINGLE_FAMILY'||previous.evidence?.stagedWithPhysicalState!==true||last?.type!=='CYCLE_CLOSED'||last.evidence?.lastStageEventId!==previous.id||!text(last.evidence?.userConfirmationRef)||r.migrationStatus==='REQUIRES_RECONCILIATION')errors.push({code:'terminal_physical_evidence_missing',cycleId:r.id});
 }
 return errors;
}
function planCloseCycle(records,request){
 const errs=[...inspect(records),...inspectTerminalEvidence(records)];
 if(errs.length)return {ok:false,errors:errs};
 if(!obj(request)||request.userConfirmed!==true||!text(request.confirmationRef)||!text(request.id)||!text(request.cycleId)||!text(request.occurredAt)||!Number.isFinite(Date.parse(request.occurredAt)))return {ok:false,errors:[{code:'cycle_close_confirmation_required'}]};
 if(records.some(r=>r.events?.some(e=>e.id===request.id)))return {ok:false,errors:[{code:'cycle_close_event_id_duplicate'}]};
 const current=records.find(r=>r.id===request.cycleId);
 if(!current||current.status!=='ACTIVE'||['REQUIRES_RECONCILIATION','BASELINE_IMPORTED_PENDING_ACTIVATION'].includes(current.migrationStatus))return {ok:false,errors:[{code:'cycle_close_not_allowed'}]};
 const last=current.events.at(-1),ev=last?.evidence;
 if(last?.type!=='STAGE_CONFIRMED'||!['OP-11','OP-14'].includes(ev?.operationId)||ev?.after?.layout?.mode!=='SINGLE_FAMILY'||ev?.stagedWithPhysicalState!==true)return {ok:false,errors:[{code:'cycle_terminal_physical_state_missing'}]};
 if(Date.parse(request.occurredAt)<Date.parse(last.occurredAt))return {ok:false,errors:[{code:'cycle_close_before_last_stage'}]};
 const result=copy(records),target=result.find(r=>r.id===request.cycleId);
 target.events.push({id:request.id,type:'CYCLE_CLOSED',occurredAt:request.occurredAt,evidence:{reason:'confirmed_terminal_physical_transition',confirmedBy:'beekeeper',userConfirmationRef:request.confirmationRef,lastStageEventId:last.id}});
 target.status='CLOSED';
 const errors=[...inspect(result),...inspectTerminalEvidence(result)];
 return errors.length?{ok:false,errors}:{ok:true,records:result};
}

function planNewCycle(records,request){
 const errors=[...inspect(records),...inspectTerminalEvidence(records)];if(errors.length)return {ok:false,errors};
 if(!obj(request)||!text(request.id)||!text(request.hiveId)||!text(request.occurredAt)||!Number.isFinite(Date.parse(request.occurredAt)))return {ok:false,errors:[{code:'season_open_request_invalid'}]};
 if(records.some(r=>r.id===request.id))return {ok:false,errors:[{code:'season_id_duplicate'}]};
 const prior=records.filter(r=>r.hiveId===request.hiveId).sort((a,b)=>b.cycleNumber-a.cycleNumber)[0];
 if(prior&&prior.status!=='CLOSED')return {ok:false,errors:[{code:'season_previous_not_closed'}]};
 if(['REQUIRES_RECONCILIATION','BASELINE_IMPORTED_PENDING_ACTIVATION'].includes(prior?.migrationStatus))return {ok:false,errors:[{code:'season_legacy_unreconciled'}]};
 const close=prior?.events.at(-1)?.occurredAt;
 if(close&&Date.parse(request.occurredAt)<Date.parse(close))return {ok:false,errors:[{code:'season_open_before_close'}]};
 const next={modelVersion:2,id:request.id,hiveId:request.hiveId,cycleNumber:(prior?.cycleNumber||0)+1,status:'ACTIVE',events:[]};
 return {ok:true,newCycle:next,records:[...copy(records),next]};
}
window.PasekaSectionalSeasonLedgerV2=Object.freeze({VERSION,inspect,inspectTerminalEvidence,previewV1,planCloseCycle,planNewCycle});
})();