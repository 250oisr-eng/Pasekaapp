(function(){
'use strict';
// Detached integration adapter for the existing IndexedDB CAS transaction.
// The caller supplies the real save queue and CAS adapter; integrated behind a QA build gate.
// No in-memory replacement until durable transaction completion.
async function commitCandidate(candidate,adapter){
 if(candidate?.ok!==true||candidate.kind!=='unsaved_candidate'||typeof candidate.expectedRevisionId!=='string'||!candidate.expectedRevisionId.trim()||candidate.draft?.meta?.revisionId!==candidate.expectedRevisionId)return {ok:false,error:'invalid_candidate'};
 if(typeof adapter?.enqueue!=='function'||typeof adapter?.getCurrentRevision!=='function'||typeof adapter?.validate!=='function'||typeof adapter?.newRevision!=='function'||typeof adapter?.writeMainIfUnchanged!=='function')return {ok:false,error:'adapter_missing'};
 let draft;try{draft=structuredClone(candidate.draft)}catch{return {ok:false,error:'clone_failed'}}
 const expected=candidate.expectedRevisionId;
 return adapter.enqueue(async()=>{
  let next;
  try{
   if(await adapter.getCurrentRevision()!==expected)return {ok:false,error:'revision_changed'};
   const errors=await adapter.validate(draft);
   if(!Array.isArray(errors)||errors.length)return {ok:false,error:'candidate_validation_failed'};
   next=adapter.newRevision();
   if(typeof next!=='string'||!next.trim()||next===expected)return {ok:false,error:'new_revision_invalid'};
   draft.meta.revisionId=next;draft.meta.updatedAt=new Date().toISOString();
   await adapter.writeMainIfUnchanged(draft,expected);
  }catch{return {ok:false,error:'transaction_not_confirmed'}}
  // A post-commit refresh/backup error is NOT a failed transaction.
  return {ok:true,revisionId:next,committedState:draft};
 });
}
// Bind to the application's existing store/queue and compare-and-swap
// implementation. Caller must supply a real exclusive mutation gate; no
// unsafe direct IndexedDB put, parallel write or automatic fallback.
function createRuntimeCommitter(runtime){
 const methods=['withExclusiveMutation','enqueue','getState','getPersistedRevision','isWriteReady','validate','newRevision','writeMainIfUnchanged','writeAutoBackup','publishCommitted','buildSnapshot'];
 if(methods.some(key=>typeof runtime?.[key]!=='function'))throw Error('sectional_runtime_bridge_incomplete');
 return async function commit(candidate,baseState){
  if(candidate?.ok!==true||candidate.kind!=='unsaved_candidate'||!baseState||candidate.expectedRevisionId!==baseState.meta?.revisionId)return {ok:false,error:'invalid_candidate'};
  const fingerprint=JSON.stringify(baseState);
  let draft;try{draft=structuredClone(candidate.draft)}catch{return {ok:false,error:'clone_failed'}}
  return runtime.enqueue(()=>runtime.withExclusiveMutation(async()=>{
   if(!runtime.isWriteReady()||runtime.getPersistedRevision()!==candidate.expectedRevisionId||JSON.stringify(runtime.getState())!==fingerprint)return {ok:false,error:'revision_or_unsaved_state_changed'};
   let snapshot,previous,next;
   try{
    const errors=await runtime.validate(draft);
    if(!Array.isArray(errors)||errors.length)return {ok:false,error:'candidate_validation_failed'};
    next=runtime.newRevision();if(typeof next!=='string'||!next.trim()||next===candidate.expectedRevisionId)return {ok:false,error:'new_revision_invalid'};
    draft.meta.revisionId=next;draft.meta.updatedAt=new Date().toISOString();
    snapshot=await runtime.buildSnapshot(draft);
    if(snapshot?.meta?.revisionId!==next)return {ok:false,error:'snapshot_invalid'};
    const finalErrors=await runtime.validate(snapshot);if(!Array.isArray(finalErrors)||finalErrors.length)return {ok:false,error:'snapshot_validation_failed'};
    if(!runtime.isWriteReady()||runtime.getPersistedRevision()!==candidate.expectedRevisionId||JSON.stringify(runtime.getState())!==fingerprint)return {ok:false,error:'revision_or_unsaved_state_changed'};
    previous=await runtime.writeMainIfUnchanged(snapshot,candidate.expectedRevisionId);
   }catch{return {ok:false,error:'transaction_not_confirmed'}}
   // Main write already succeeded. Backup/publish failures cannot turn it
   // into a failed operation or invite an unsafe repeat.
   const warnings=[];
   try{await runtime.publishCommitted(snapshot,next)}catch{warnings.push('committed_refresh_required')}
   try{if(!await runtime.writeAutoBackup(previous||snapshot,next))warnings.push('backup_not_confirmed')}catch{warnings.push('backup_not_confirmed')}
   return {ok:true,revisionId:next,warnings};
  }));
 };
}
window.PasekaSectionalHoneyPersistence=Object.freeze({commitCandidate,createRuntimeCommitter});
})();
