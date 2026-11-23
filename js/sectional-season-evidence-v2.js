(function(){
'use strict';
// Pure staged bridge: physical state + event must be saved in ONE atomic CAS transaction. NO direct writes or implicit DONE.
const PROFILE='sectional-multiqueen-v1';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
const clone=x=>structuredClone(x);
const stamp=x=>nonempty(x)&&Number.isFinite(Date.parse(x));
const fail=(code,details)=>({ok:false,error:code,...(details?{details}:{})});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const operations=new Set([...Array.from({length:11},(_,i)=>'OP-'+String(i+4).padStart(2,'0')),'OP-06-RESCUE']);
function physicalSnapshot(state,hiveId){
 if(!object(state)||!nonempty(hiveId))return fail('snapshot_state_invalid');
 const hive=(Array.isArray(state.hives)?state.hives:[]).find(x=>x?.id===hiveId);
 if(!hive||hive.profileId!==PROFILE)return fail('snapshot_profile_invalid');
 const layouts=(Array.isArray(state.sectionalLayouts)?state.sectionalLayouts:[]).filter(x=>x?.hiveId===hiveId);
 if(layouts.length!==1)return fail('snapshot_layout_ambiguous');
 const layout=layouts[0];
 if(!nonempty(layout.id)||!nonempty(layout.mode)||!Array.isArray(layout.sections))return fail('snapshot_layout_invalid');
 const bodyIds=[...layout.sections.flatMap(s=>Array.isArray(s?.broodBodyIds)?s.broodBodyIds:[]),...(Array.isArray(layout.honeyStack?.bodyIds)?layout.honeyStack.bodyIds:[])];
 if(bodyIds.some(x=>!nonempty(x))||new Set(bodyIds).size!==bodyIds.length)return fail('snapshot_body_reference_invalid');
 const inventory=state.equipmentInventory?.bodies;
 if(!object(inventory)||bodyIds.some(id=>!object(inventory[id])))return fail('snapshot_body_missing');
 const bodyMap={};for(const id of bodyIds)bodyMap[id]=clone(inventory[id]);
 const familyIds=layout.sections.map(s=>s?.familyId).filter(nonempty);
 const families=(Array.isArray(state.families)?state.families:[]).filter(f=>familyIds.includes(f?.id)).map(clone);
 if(new Set(familyIds).size!==familyIds.length||families.length!==familyIds.length)return fail('snapshot_family_reference_invalid');
 const queens=(Array.isArray(state.queens)?state.queens:[]).filter(q=>familyIds.includes(q?.familyId)).map(clone);
 const seasonalEntranceObservations=(Array.isArray(state.sectionalSeasonalEntranceObservations)?state.sectionalSeasonalEntranceObservations:[]).filter(x=>x?.hiveId===hiveId).map(clone);
 return {ok:true,snapshot:{hiveId,profileId:PROFILE,layout:clone(layout),bodyInventory:bodyMap,families,queens,seasonalEntranceObservations}};
}
function inspectStages(records){
 const errors=[];
 if(!Array.isArray(records))return [{code:'stage_ledger_invalid'}];
 for(const rec of records){
  if(!object(rec)||!Array.isArray(rec.events))continue;
  let previous=null;
  const baseline=rec.events.find(e=>e?.type==='BASELINE_IMPORTED');
  if(baseline){
   if(!object(baseline.evidence?.snapshot)||!nonempty(baseline.evidence?.backupVerificationId)||baseline.evidence.restoreReplayVerified!==true||rec.events[0]!==baseline)errors.push({code:'stage_imported_baseline_invalid',cycleId:rec.id});
   else previous=baseline.evidence.snapshot;
  }
  for(let i=0;i<rec.events.length;i++){
   const event=rec.events[i];
   if(event?.type!=='STAGE_CONFIRMED')continue;
   const ev=event.evidence;
   if(!object(ev)||!operations.has(ev.operationId)||!object(ev.before)||!object(ev.after)||!nonempty(ev.confirmedBy)||ev.stagedWithPhysicalState!==true||!nonempty(ev.transactionId)){
    errors.push({code:'stage_evidence_invalid',cycleId:rec.id,index:i});continue;
   }
   if(ev.before.hiveId!==rec.hiveId||ev.after.hiveId!==rec.hiveId||ev.before.profileId!==PROFILE||ev.after.profileId!==PROFILE)errors.push({code:'stage_hive_profile_mismatch',cycleId:rec.id,index:i});
   if(same(ev.before,ev.after))errors.push({code:'stage_no_physical_change',cycleId:rec.id,index:i});
   if(previous&&!same(previous,ev.before))errors.push({code:'stage_snapshot_chain_broken',cycleId:rec.id,index:i});
   previous=ev.after;
  }
 }
 return errors;
}
function stagePhysicalTransition(beforeState,afterState,ledger,request,deps={}){
 if(!object(request)||request.userConfirmed!==true||!nonempty(request.confirmedBy)||!nonempty(request.transactionId)||!nonempty(request.eventId)||!stamp(request.occurredAt)||!operations.has(request.operationId)||!nonempty(request.cycleId))return fail('stage_confirmation_required');
 if(!Array.isArray(ledger)||!deps||typeof deps.inspectBefore!=='function'||typeof deps.inspectAfter!=='function')return fail('stage_validator_required');
 const baseErrors=deps.inspectBefore(beforeState);
 const finalErrors=deps.inspectAfter(afterState);
 if(!Array.isArray(baseErrors)||baseErrors.length||!Array.isArray(finalErrors)||finalErrors.length)return fail('stage_physical_integrity_failed');
 const Ledger=deps.ledger;
 if(!Ledger||typeof Ledger.inspect!=='function')return fail('stage_ledger_validator_missing');
 if(Ledger.inspect(ledger).length||inspectStages(ledger).length)return fail('stage_ledger_corrupted');
 const rec=ledger.find(x=>x?.id===request.cycleId);
 if(!rec||rec.status!=='ACTIVE'||rec.hiveId!==request.hiveId)return fail('stage_cycle_not_active');
 if(['REQUIRES_RECONCILIATION','BASELINE_IMPORTED_PENDING_ACTIVATION'].includes(rec.migrationStatus))return fail('stage_imported_cycle_not_activated');
 if(ledger.some(x=>x.events?.some(e=>e.id===request.eventId)))return fail('stage_event_id_duplicate');
 const before=physicalSnapshot(beforeState,request.hiveId),after=physicalSnapshot(afterState,request.hiveId);
 if(!before.ok)return before;if(!after.ok)return after;
 if(same(before.snapshot,after.snapshot))return fail('stage_physical_state_unchanged');
 const lastEvent=rec.events.at(-1);
 if(lastEvent&&Date.parse(request.occurredAt)<Date.parse(lastEvent.occurredAt))return fail('stage_time_reverse');
 const priorStages=rec.events.filter(x=>x.type==='STAGE_CONFIRMED');
 if(priorStages.length&&!same(priorStages.at(-1).evidence.after,before.snapshot))return fail('stage_prior_snapshot_mismatch');
 if(!priorStages.length&&rec.events.some(e=>e.type==='BASELINE_IMPORTED')&&!same(rec.events.find(e=>e.type==='BASELINE_IMPORTED').evidence.snapshot,before.snapshot))return fail('stage_imported_baseline_mismatch');
 if(typeof deps.validateTransition!=='function')return fail('stage_transition_rule_validator_missing');
 const transitionErrors=deps.validateTransition(before.snapshot,after.snapshot,request);
 if(!Array.isArray(transitionErrors)||transitionErrors.length)return fail('stage_transition_not_allowed',transitionErrors);
 const result=clone(ledger),target=result.find(x=>x.id===request.cycleId);
 target.events.push({id:request.eventId,type:'STAGE_CONFIRMED',occurredAt:request.occurredAt,evidence:{operationId:request.operationId,before:before.snapshot,after:after.snapshot,confirmedBy:request.confirmedBy,transactionId:request.transactionId,stagedWithPhysicalState:true}});
 // Commit the coordinator's current-cycle compat state together with the
 // physical evidence. Neither one may be inspected or persisted on its own.
 if(deps.nextCompatProcess!==undefined){
  if(!['OP-04','OP-05','OP-06','OP-07'].includes(request.operationId)||!object(deps.nextCompatProcess)||deps.nextCompatProcess.id!==target.id||deps.nextCompatProcess.hiveId!==target.hiveId||deps.nextCompatProcess.modelVersion!==1)return fail('stage_compat_process_invalid');
  target.compatProcess=clone(deps.nextCompatProcess);
 }
 const errors=[...Ledger.inspect(result),...inspectStages(result)];
 return errors.length?fail('stage_result_invalid',errors):{ok:true,records:result,event:clone(target.events.at(-1))};
}
window.PasekaSectionalSeasonEvidenceV2=Object.freeze({PROFILE,physicalSnapshot,inspectStages,stagePhysicalTransition});
})();