(function(){
'use strict';
// Detached integration adapter for the existing IndexedDB CAS transaction.
// The caller supplies the real save queue and CAS adapter; not loaded by app.
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
window.PasekaSectionalHoneyPersistence=Object.freeze({commitCandidate});
})();
