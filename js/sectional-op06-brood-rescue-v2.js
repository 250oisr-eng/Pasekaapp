(function(root){
'use strict';
// P1 OP-06 rescue: an explicit, immutable four-frame physical exchange.
// This is NOT completion of OP-06. Persistence is exclusively through the
// versioned season transaction with a verified off-device recovery gate.
const A=x=>Array.isArray(x)?x:[];
const O=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const S=x=>typeof x==='string'&&x.trim().length>0;
const PROFILE='sectional-multiqueen-v1';
const OP='OP-06-RESCUE';
const fail=(error,details)=>({ok:false,error,...(details?{details}:{})});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const time=x=>S(x)&&Number.isFinite(Date.parse(x));
function stage(state,request,deps={}){
 if(!O(state)||!O(request)||request.operationId!==OP||request.userConfirmed!==true||
   request.actualWorkConfirmed!==true||request.actualFrameExchangeConfirmed!==true||
   request.meshConfigurationPersonallyVerified!==true||!S(request.hiveId)||
   !S(request.cycleId)||!time(request.occurredAt)||!time(deps.now)||
   Date.parse(request.occurredAt)>Date.parse(deps.now)||typeof deps.makeId!=='function'||
   typeof deps.inspectState!=='function'||typeof deps.recovery?.planFromState!=='function'||
   typeof deps.lineage?.getQueenPresenceStatus!=='function')
   return fail('op06_rescue_confirmation_or_capability_missing');
 if(!Array.isArray(state.sectionalTechProcesses)||state.sectionalTechProcesses.some(p=>p?.hiveId===request.hiveId))
   return fail('op06_rescue_legacy_migration_required');
 const cycle=A(state.sectionalSeasonCycles).filter(c=>c?.id===request.cycleId&&c.hiveId===request.hiveId&&c.status==='ACTIVE');
 if(cycle.length!==1||['REQUIRES_RECONCILIATION','BASELINE_IMPORTED_PENDING_ACTIVATION'].includes(cycle[0].migrationStatus))
   return fail('op06_rescue_active_cycle_required');
 const originalProblems=deps.inspectState(state);
 if(!Array.isArray(originalProblems)||originalProblems.length)return fail('op06_rescue_source_integrity_failed',originalProblems);
 const initial=deps.recovery.planFromState(state,request,{lineage:deps.lineage});
 if(!initial?.ok)return fail('op06_rescue_source_plan_invalid',initial?.errors);
 if(initial.meshInventoryAction!=='DO_NOT_CHANGE'&&initial.meshInventoryAction!=='VERIFY_EXISTING')
   return fail('op06_rescue_edge_mesh_not_physically_registered');
 const moves=A(request.transfers);
 if(moves.length!==2||new Set(moves.map(x=>x?.replacementFrameId)).size!==2||
   moves.some(x=>!S(x?.replacementFrameId)||x.freshEggsObserved!==true))
   return fail('op06_rescue_two_displacement_frames_and_eggs_required');
 const layout=A(state.sectionalLayouts).find(l=>l.hiveId===request.hiveId);
 const inventory=state.equipmentInventory,bodies=inventory?.bodies;
 if(!O(bodies)||!Array.isArray(inventory.events)||!Array.isArray(state.auditLog))
   return fail('op06_rescue_equipment_history_required');
 const dest=bodies[request.toBodyId],destRefs=new Set(A(dest?.frames).map(f=>f?.frameId));
 if(destRefs.size!==6||A(dest.frames).length!==6||moves.some(x=>!destRefs.has(x.replacementFrameId)))
   return fail('op06_rescue_receiver_slots_unverified');
 const donorIds=moves.map(x=>x.fromBodyId);
 const affectedIds=[request.toBodyId,...new Set(donorIds)];
 if(affectedIds.some(id=>!O(bodies[id])||!Array.isArray(bodies[id].events)||
   !Array.isArray(bodies[id].frames)||bodies[id].frames.length!==6))
   return fail('op06_rescue_body_history_or_capacity_invalid');
 const assigned=new Set();
 for(const m of moves)for(const frameId of [m.frameId,m.replacementFrameId]){
   if(assigned.has(frameId))return fail('op06_rescue_exchange_frame_duplicate');
   assigned.add(frameId);
 }
 // Only this hive's active cycle and these exact four frames can be altered.
 const beforeFrames={};
 for(const id of affectedIds)beforeFrames[id]=bodies[id].frames.map(x=>x.frameId);
 const records=[...A(state.auditLog),...A(inventory.events),...A(inventory.itemEvents),
   ...A(state.familyEvents),...A(state.queenEvents),...A(state.sectionalSeasonCycles).flatMap(c=>A(c.events)),
   ...Object.values(bodies).flatMap(b=>[...A(b.events),...A(b.frames).flatMap(f=>A(f.history))])];
 const used=new Set(records.map(x=>x?.id).filter(S));
 const newId=()=>{const id=deps.makeId();if(!S(id)||used.has(id))throw Error('op06_rescue_event_id_duplicate');used.add(id);return id};
 let draft;
 try{draft=structuredClone(state)}catch{return fail('op06_rescue_copy_failed')}
 try{
   const own=draft.equipmentInventory.bodies,events=draft.equipmentInventory.events;
   const seen=new Set();
   for(const [i,m] of moves.entries()){
     const donor=own[m.fromBodyId],receiver=own[request.toBodyId];
     const sourceAt=donor.frames.findIndex(f=>f.frameId===m.frameId);
     const destinationAt=receiver.frames.findIndex(f=>f.frameId===m.replacementFrameId);
     if(sourceAt<0||destinationAt<0||seen.has(m.frameId)||seen.has(m.replacementFrameId))
       throw Error('op06_rescue_source_slot_conflict');
     seen.add(m.frameId);seen.add(m.replacementFrameId);
     const src=donor.frames[sourceAt],dst=receiver.frames[destinationAt];
     if(!Array.isArray(src.history)||!Array.isArray(dst.history))throw Error('op06_rescue_frame_history_invalid');
     const originalFrom={type:'sectional',hiveId:request.hiveId,sectionId:m.fromSectionId,bodyId:m.fromBodyId,frameIndex:sourceAt};
     const originalTo={type:'sectional',hiveId:request.hiveId,sectionId:request.queenlessSectionId,bodyId:request.toBodyId,frameIndex:destinationAt};
     const one={frameId:m.frameId,from:originalFrom,to:originalTo};
     const two={frameId:m.replacementFrameId,from:originalTo,to:originalFrom};
     donor.frames[sourceAt]=dst;
     receiver.frames[destinationAt]=src;
     for(const entry of [one,two]){
       const moved=entry.frameId===m.frameId?src:dst;
       const details={operationId:OP,cycleId:request.cycleId,queenlessSectionId:request.queenlessSectionId,
         exchangePair:i+1,frameId:entry.frameId,from:entry.from,to:entry.to};
       moved.history.push({id:newId(),action:'sectional_op06_brood_rescue_exchange',
         at:request.occurredAt,date:request.occurredAt.slice(0,10),...details});
       own[entry.from.bodyId].events.push({id:newId(),type:'op06_frame_exchanged_out',at:request.occurredAt,...details});
       own[entry.to.bodyId].events.push({id:newId(),type:'op06_frame_exchanged_in',at:request.occurredAt,...details});
       events.push({id:newId(),type:'op06_rescue_frame_moved',at:request.occurredAt,...details});
     }
   }
   for(const id of affectedIds){
     if(own[id].frames.length!==6||new Set(own[id].frames.map(f=>f.frameId)).size!==6)
       throw Error('op06_rescue_post_exchange_capacity_invalid');
     own[id].updatedAt=request.occurredAt;
   }
   const audit={id:newId(),type:'sectional_op06_brood_rescue_confirmed',
     operationId:OP,cycleId:request.cycleId,hiveId:request.hiveId,
     occurredAt:request.occurredAt,queenlessSectionId:request.queenlessSectionId,
     toBodyId:request.toBodyId,
     transfers:moves.map(m=>({frameId:m.frameId,fromBodyId:m.fromBodyId,
       fromSectionId:m.fromSectionId,toBodyId:request.toBodyId,
       replacementFrameId:m.replacementFrameId})),
     meshRule:initial.meshRule,meshBoundary:initial.meshBoundary,
     noQueenMovedConfirmed:true,actualWorkConfirmed:true,userConfirmed:true};
   draft.auditLog.push(audit);
   if(!same(state.sectionalLayouts,draft.sectionalLayouts)||
      !same(state.families,draft.families)||!same(state.queens,draft.queens)||
      !same(state.familyEvents,draft.familyEvents)||!same(state.queenEvents,draft.queenEvents)||
      !same(state.sectionalSeasonCycles,draft.sectionalSeasonCycles))
      throw Error('op06_rescue_unrelated_history_changed');
   for(const [id,b] of Object.entries(bodies)){
     if(!affectedIds.includes(id)&&!same(b,draft.equipmentInventory.bodies[id]))
       throw Error('op06_rescue_unrelated_body_changed');
   }
   const candidateProblems=deps.inspectState(draft);
   if(!Array.isArray(candidateProblems)||candidateProblems.length)
     return fail('op06_rescue_candidate_integrity_failed',candidateProblems);
   return {ok:true,readOnly:false,stagedOnly:true,operationCompleted:false,
     queenOutcome:'UNKNOWN',draft,auditEvent:audit,
     changedBodyIds:affectedIds,beforeFrameOrder:beforeFrames,
     afterFrameOrder:Object.fromEntries(affectedIds.map(id=>[id,own[id].frames.map(f=>f.frameId)]))};
 }catch(e){return fail('op06_rescue_physical_staging_rejected',{message:String(e?.message||e)})}
}
root.PasekaSectionalOP06BroodRescueV2=Object.freeze({stage,OP});
})(typeof window!=='undefined'?window:globalThis);
