(function(){
'use strict';
// The executor is injected; this module never guesses frame/equipment/queen moves.
// CAS persistence + cold read are mandatory. No direct IndexedDB or physical actuation.
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
const fail=(error,details)=>({ok:false,error,...(details?{details}:{})});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const COMPAT_OPS=new Set(['OP-04','OP-05','OP-06','OP-07']);
function validateCompatProcessTransition(before,after,request){
 const reject=code=>({ok:false,error:code});
 if(!COMPAT_OPS.has(request.operationId))return reject('compat_operation_not_supported');
 if(!Array.isArray(before)||!Array.isArray(after)||before.length!==after.length)return reject('compat_season_count_changed');
 const old=before.find(c=>c.id===request.cycleId),next=after.find(c=>c.id===request.cycleId);
 if(!old||!next||old.hiveId!==request.hiveId||old.status!=='ACTIVE'||next.status!=='ACTIVE'||old.legacy&&!old.compatProcess)return reject('compat_active_cycle_invalid');
 if(before.some(c=>c.id!==request.cycleId&&!same(c,after.find(n=>n.id===c.id))))return reject('compat_other_cycle_mutated');
 const baseOld=structuredClone(old),baseNext=structuredClone(next);
 delete baseOld.compatProcess;delete baseNext.compatProcess;
 if(!same(baseOld,baseNext))return reject('compat_cycle_history_or_metadata_changed');
 const previous=old.compatProcess,updated=next.compatProcess;
 if(!obj(updated)||updated.modelVersion!==1||updated.id!==request.cycleId||updated.hiveId!==request.hiveId||!obj(updated.state)||!Array.isArray(updated.state.operations))return reject('compat_process_malformed');
 const currOps=updated.state.operations,last=currOps.at(-1),earlier=Array.isArray(previous?.state?.operations)?previous.state.operations:[];
 if(last?.operationId!==request.operationId)return reject('compat_operation_id_mismatch');
 if(request.operationId==='OP-04'){
  const first=earlier.length===0&&!previous&&currOps.length===1&&['IN_PROGRESS','DONE'].includes(last.status);
  const second=earlier.length===1&&earlier[0]?.operationId==='OP-04'&&earlier[0]?.status==='IN_PROGRESS'&&currOps.length===1&&last.status==='DONE';
  if(!first&&!second)return reject('compat_split_stage_invalid');
 }else if(!obj(previous)||earlier.length===0||earlier[0]?.operationId!=='OP-04'||earlier[0]?.status!=='DONE'||currOps.length!==earlier.length+1||!same(currOps.slice(0,-1),earlier)||last.status!=='DONE')return reject('compat_operation_history_rewritten');
 return {ok:true};
}
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
 if(['OP-10','OP-11','OP-12','OP-13','OP-14'].includes(request.operationId)){
  if(typeof deps.provenance?.validate!=='function')return fail('season_physical_provenance_validator_missing');
  const provenanceErrors=deps.provenance.validate(base,draft,request);
  if(!Array.isArray(provenanceErrors)||provenanceErrors.length)return fail('season_physical_provenance_invalid',provenanceErrors);
 }
 if(!Array.isArray(draft.sectionalSeasonCycles))return fail('season_physical_staging_mutated_history');
 if(!same(base.sectionalSeasonCycles,draft.sectionalSeasonCycles)){
  if(!COMPAT_OPS.has(request.operationId))return fail('season_physical_staging_mutated_history');
  const compat=validateCompatProcessTransition(base.sectionalSeasonCycles,draft.sectionalSeasonCycles,request);
  if(!compat.ok)return fail(compat.error);
 }
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
window.PasekaSectionalSeasonTransactionV2=Object.freeze({commitVerifiedTransition,validateCompatProcessTransition});
})();