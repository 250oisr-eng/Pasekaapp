(function(){
'use strict';
// The executor is injected; this module never guesses frame/equipment/queen moves.
// CAS persistence + cold read are mandatory. No direct IndexedDB or physical actuation.
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
const fail=(error,details)=>({ok:false,error,...(details?{details}:{})});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function commitVerifiedTransition(current,request,deps){
 if(!obj(current)||!obj(request)||request.userConfirmed!==true||!nonempty(current.meta?.revisionId))return fail('season_transaction_confirmation_or_revision_missing');
 const funcs=['authorized','applyPhysicalOperation','inspectState','persistIfRevision','readPersisted'];
 if(funcs.some(key=>typeof deps?.[key]!=='function'))return fail('season_transaction_dependency_missing');
 if(!deps.ledger||!deps.evidence||!deps.rules||!deps.dualRead)return fail('season_transaction_domain_dependency_missing');
 let authorized;try{authorized=await deps.authorized(current,request)}catch{return fail('season_transaction_gate_unavailable')}
 if(authorized!==true)return fail('season_transaction_not_authorized');
 const currentErrors=deps.inspectState(current);
 if(!Array.isArray(currentErrors)||currentErrors.length)return fail('season_transaction_source_invalid',currentErrors);
 if(deps.dualRead.inspectMixedState(current,{ledger:deps.ledger}).length)return fail('season_transaction_history_invalid');
 const expectedRevisionId=current.meta.revisionId,base=structuredClone(current);
 let draft;
 try{draft=await deps.applyPhysicalOperation(structuredClone(base),request)}catch{return fail('season_physical_staging_failed')}
 if(!obj(draft)||!obj(draft.meta)||draft.meta.revisionId!==expectedRevisionId)return fail('season_physical_staging_revision_changed');
 if(!Array.isArray(draft.sectionalSeasonCycles)||!same(base.sectionalSeasonCycles,draft.sectionalSeasonCycles))return fail('season_physical_staging_mutated_history');
 const initialErrors=deps.inspectState(draft);
 if(!Array.isArray(initialErrors)||initialErrors.length)return fail('season_physical_staging_integrity_failed',initialErrors);
 const stage=deps.evidence.stagePhysicalTransition(base,draft,base.sectionalSeasonCycles,request,{
  ledger:deps.ledger,inspectBefore:deps.inspectState,inspectAfter:deps.inspectState,
  validateTransition:deps.rules.validate
 });
 if(!stage?.ok)return fail(stage?.error||'season_stage_failed',stage?.details);
 draft.sectionalSeasonCycles=stage.records;
 const errors=[...deps.inspectState(draft),...deps.dualRead.inspectMixedState(draft,{ledger:deps.ledger}),...deps.evidence.inspectStages(draft.sectionalSeasonCycles)];
 if(errors.length)return fail('season_transaction_candidate_invalid',errors);
 let written;
 try{written=await deps.persistIfRevision(draft,expectedRevisionId)}catch{return fail('season_persist_failed_or_unknown')};
 if(!obj(written)||written.ok!==true||!nonempty(written.revisionId)||written.revisionId===expectedRevisionId)return fail('season_persist_not_confirmed');
 let persisted;
 try{persisted=await deps.readPersisted()}catch{return fail('season_cold_read_failed_commit_uncertain')};
 if(!obj(persisted)||persisted.meta?.revisionId!==written.revisionId)return fail('season_cold_read_revision_mismatch_commit_uncertain');
 const record=persisted.sectionalSeasonCycles?.find(x=>x?.id===request.cycleId);
 const event=record?.events?.find(x=>x?.id===request.eventId);
 if(!event||!same(event,stage.event))return fail('season_cold_read_evidence_mismatch_commit_uncertain');
 const snap=deps.evidence.physicalSnapshot(persisted,request.hiveId);
 if(!snap.ok||!same(snap.snapshot,stage.event.evidence.after))return fail('season_cold_read_physical_mismatch_commit_uncertain');
 const persistedErrors=[...deps.inspectState(persisted),...deps.dualRead.inspectMixedState(persisted,{ledger:deps.ledger})];
 if(persistedErrors.length)return fail('season_cold_read_integrity_failed_commit_uncertain',persistedErrors);
 return {ok:true,durable:true,state:persisted,revisionId:written.revisionId,event:stage.event};
}
window.PasekaSectionalSeasonTransactionV2=Object.freeze({commitVerifiedTransition});
})();