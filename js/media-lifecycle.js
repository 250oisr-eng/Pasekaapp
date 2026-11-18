(function(root){
'use strict';

const MEDIA_JOB_STATES=Object.freeze([
 'queued','analyzing','failed_retryable','failed_permanent',
 'result_received','result_persisted','cleanup_pending',
 'completed_retained','completed_deleted'
]);

const TRANSITIONS=Object.freeze({
 queued:['analyzing','failed_permanent'],
 analyzing:['result_received','failed_retryable','failed_permanent'],
 failed_retryable:['analyzing','failed_permanent'],
 failed_permanent:['queued'],
 result_received:['result_persisted','failed_retryable'],
 result_persisted:['cleanup_pending','completed_retained'],
 cleanup_pending:['completed_deleted','completed_retained'],
 completed_retained:[],
 completed_deleted:[]
});

function isObject(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
function hasText(value){return typeof value==='string'&&value.trim().length>0;}
function validTimestamp(value){return typeof value==='string'&&Number.isFinite(Date.parse(value));}

/**
 * Pure state transition for a locally persisted media-analysis job.
 * Blob bytes live in a separate IndexedDB store; this record contains only a stable blob key.
 * The caller must persist the returned job in the same transaction as any associated state change.
 */
function transitionMediaJob(job,next,details={},now=new Date().toISOString()){
 if(!isObject(job)||!MEDIA_JOB_STATES.includes(job.status)||!MEDIA_JOB_STATES.includes(next))
  return {ok:false,reason:'invalid_state'};
 if(!isObject(details)||!validTimestamp(now))
  return {ok:false,reason:'invalid_transition_details'};
 if(!TRANSITIONS[job.status].includes(next))
  return {ok:false,reason:'transition_not_allowed'};

 const updated={...job,...details,status:next,updatedAt:now};
 if(next==='analyzing')updated.lastAttemptAt=now;
 if(next==='failed_retryable'||next==='failed_permanent'){
  updated.retryCount=Math.max(0,Number.isInteger(job.retryCount)?job.retryCount:0)+(next==='failed_retryable'?1:0);
  updated.lastError=String(details.lastError||'Неизвестная ошибка').slice(0,500);
 }
 if(next==='queued'){
  updated.lastError=null;
  updated.nextAttemptAt=null;
 }
 if(next==='result_persisted'){
  if(!hasText(updated.resultId)||!validTimestamp(updated.resultPersistedAt))
   return {ok:false,reason:'persisted_result_required'};
  if(!hasText(updated.originalRef))
   return {ok:false,reason:'original_reference_required'};
 }
 if(next==='cleanup_pending'){
  if(!canDeleteMediaOriginal({...updated,status:'result_persisted'}))
   return {ok:false,reason:'cleanup_preconditions_not_met'};
  updated.cleanupRequestedAt=now;
 }
 if(next==='completed_retained'){
  if(!['result_persisted','cleanup_pending'].includes(job.status)||updated.retainOriginal!==true)
   return {ok:false,reason:'retain_original_not_confirmed'};
  updated.retainedAt=now;
 }
 if(next==='completed_deleted'){
  if(job.status!=='cleanup_pending'||!validTimestamp(details.originalDeletedAt)||details.originalDeleted!==true)
   return {ok:false,reason:'original_deletion_not_confirmed'};
  updated.originalDeletedAt=details.originalDeletedAt;
 }
 return {ok:true,job:updated};
}

function canDeleteMediaOriginal(job){
 return !!job&&job.status==='result_persisted'&&
  hasText(job.resultId)&&validTimestamp(job.resultPersistedAt)&&
  hasText(job.originalRef)&&job.retainOriginal!==true;
}

function canStartMediaAnalysis(job){
 return !!job&&['queued','failed_retryable'].includes(job.status);
}

root.PasekaMediaLifecycle=Object.freeze({
 MEDIA_JOB_STATES,
 transitionMediaJob,
 canDeleteMediaOriginal,
 canStartMediaAnalysis
});
})(typeof window!=='undefined'?window:globalThis);
