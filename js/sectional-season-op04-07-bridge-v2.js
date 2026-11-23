(function(){
'use strict';
// Reuses the v1 validated coordinator in a nonpersistent temporary projection.
// Stores its updated state only inside the active season. Never creates a second
// live legacy process or rewrites existing legacy archives.
const A=x=>Array.isArray(x)?x:[],O=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const S=x=>typeof x==='string'&&x.trim().length>0;
const fail=(error,details)=>({ok:false,error,...(details?{details}:{})});
function stage(state,request,deps={}){
 if(!O(state)||!O(request)||!['OP-04','OP-05','OP-06','OP-07'].includes(request.operationId)||request.userConfirmed!==true||!S(request.hiveId)||!S(request.cycleId)||!S(request.occurredAt)||!O(request.layout))return fail('v2_legacy_bridge_confirmation_or_layout_missing');
 if(A(state.sectionalTechProcesses).some(p=>p?.hiveId===request.hiveId))return fail('v2_legacy_bridge_live_legacy_conflict');
 const cycle=A(state.sectionalSeasonCycles).filter(c=>c?.hiveId===request.hiveId&&c.id===request.cycleId&&c.status==='ACTIVE');
 if(cycle.length!==1||['REQUIRES_RECONCILIATION','BASELINE_IMPORTED_PENDING_ACTIVATION'].includes(cycle[0].migrationStatus))return fail('v2_legacy_bridge_active_cycle_not_ready');
 if(typeof deps.coordinator?.completeOP04!=='function'||typeof deps.coordinator?.inspect!=='function'||typeof deps.makeId!=='function')return fail('v2_legacy_bridge_coordinator_missing');
 const stored=cycle[0].compatProcess;
 if(stored!=null&&(!O(stored)||stored.id!==cycle[0].id||stored.hiveId!==request.hiveId||stored.modelVersion!==1))return fail('v2_legacy_bridge_compat_provenance_invalid');
 if(request.operationId!=='OP-04'&&!O(stored))return fail('v2_legacy_bridge_first_split_missing');
 if(request.operationId==='OP-04'&&stored?.state?.operations?.find(o=>o.operationId==='OP-04'&&o.status==='DONE'))return fail('v2_legacy_bridge_split_already_done');
 if(A(cycle[0].events).some(e=>e.type==='STAGE_CONFIRMED'&&e.evidence?.operationId===request.operationId&&request.operationId!=='OP-04'))return fail('v2_legacy_bridge_duplicate_stage');
 if(request.operationId==='OP-06'&&request.twoQueenOutcome===true)return fail('op06_two_queen_physical_mesh_removal_not_source_confirmed');
 const realCoordinator=deps.coordinator;
 const draft=structuredClone(state);
 // Only the active season's projection is visible to the v1 code; no archival v1 data is inserted.
 draft.sectionalTechProcesses=stored?[structuredClone(stored)]:[];
 const call={...structuredClone(request),techProcessId:request.cycleId};
 delete call.cycleId;delete call.operationId;
 let result;
 try{
  if(request.operationId==='OP-04'){
   const started=stored&&A(stored.state?.operations).some(o=>o.operationId==='OP-04'&&o.status==='IN_PROGRESS');
   if(started){
    if(request.actualSecondRowConfirmed!==true)return fail('v2_legacy_bridge_second_row_confirmation_required');
    if(typeof realCoordinator.completeOP04SecondRow!=='function')return fail('v2_legacy_bridge_second_row_api_missing');
    result=realCoordinator.completeOP04SecondRow(draft,call,deps);
   }else{
    if(!S(request.sourceFamilyId)||!Array.isArray(request.resultFamilies)||request.resultFamilies.length!==3)return fail('v2_legacy_bridge_split_family_ids_missing');
    result=realCoordinator.completeOP04(draft,call,deps);
   }
  }else{
   const method='complete'+request.operationId.replace('-','');
   if(typeof realCoordinator[method]!=='function')return fail('v2_legacy_bridge_stage_api_missing');
   result=realCoordinator[method](draft,call,deps);
  }
 }catch(error){return fail('v2_legacy_bridge_coordinator_threw',{message:String(error?.message||error)})}
 if(!result?.ok)return fail('v2_legacy_bridge_coordinator_rejected',{cause:result?.error,details:result?.details});
 const newCompat=A(draft.sectionalTechProcesses).find(p=>p?.id===request.cycleId&&p.hiveId===request.hiveId);
 if(!newCompat||draft.sectionalTechProcesses.length!==1)return fail('v2_legacy_bridge_result_process_invalid');
 const validated=realCoordinator.inspect(draft,deps);
 if(!Array.isArray(validated)||validated.length)return fail('v2_legacy_bridge_v1_integrity_failed',validated);
 if(!Array.isArray(draft.sectionalSeasonCycles))return fail('v2_legacy_bridge_season_history_missing');
 const active=draft.sectionalSeasonCycles.find(c=>c.id===request.cycleId);
 if(!active)return fail('v2_legacy_bridge_cycle_removed');
 active.compatProcess=structuredClone(newCompat);
 draft.sectionalTechProcesses=[];
 if(A(state.sectionalTechProcessesArchive).length&&!A(draft.sectionalTechProcessesArchive).every((x,i)=>JSON.stringify(x)===JSON.stringify(state.sectionalTechProcessesArchive[i])))return fail('v2_legacy_bridge_archive_modified');
 return {ok:true,draft,compatProcess:structuredClone(newCompat)};
}
window.PasekaSectionalSeasonOP04To07BridgeV2=Object.freeze({stage});
})();