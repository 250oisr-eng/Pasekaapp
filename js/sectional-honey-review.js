(function(){
'use strict';
// Draft-only planning adapter for B07. Not loaded by the application.
// Never changes the supplied state, saves, activates a profile or confirms physical work.
const PROFILE='sectional-multiqueen-v1';
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const str=x=>typeof x==='string'&&x.trim().length>0;
const unique=x=>Array.isArray(x)&&x.every(str)&&new Set(x).size===x.length;
const fail=error=>({ok:false,error});
const rows=x=>Array.isArray(x)?x:[];
const same=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const depsOk=d=>typeof d?.inventory?.locateAll==='function'&&typeof d?.coordinator?.inspect==='function'&&typeof d?.physicalLayout?.inspect==='function';
function dateOnly(x){
 if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;
 const n=Date.parse(x+'T00:00:00Z');
 return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===x;
}
function context(state,hiveId,deps){
 if(!obj(state)||!str(hiveId)||!depsOk(deps)||Number(state.meta?.schemaVersion||0)<15)return fail('sectional_context_unavailable');
 const h=rows(state.hives).filter(x=>x?.id===hiveId),l=rows(state.sectionalLayouts).filter(x=>x?.hiveId===hiveId);
 if(h.length!==1||h[0].profileId!==PROFILE||l.length!==1||l[0].profileId!==PROFILE||l[0].mode!=='SIDE_BY_SIDE')return fail('sectional_layout_unavailable');
 if(!obj(state.equipmentInventory?.bodies))return fail('sectional_inventory_unavailable');
 return {ok:true,layout:l[0],bodies:state.equipmentInventory.bodies};
}
function pairGroups(state,ids,location,deps){
 if(!unique(ids)||![2,4].includes(ids.length)||!obj(state?.equipmentInventory?.bodies))return fail('complete_honey_pairs_required');
 const inventory=state.equipmentInventory.bodies,groups=new Map(),framesSeen=new Set();
 for(const id of ids){
  const b=inventory[id];
  if(!obj(b)||b.id!==id||b.kind!=='honey'||b.condition!=='good'||b.spec?.profileId!==PROFILE||b.spec?.framesPerBox!==10||!str(b.pairId))return fail('incompatible_honey_body');
  const locations=deps.inventory.locateAll(state,id);
  if(location.type==='storage'){
   if(locations.length!==0||!str(b.storageLocation))return fail('body_not_in_storage');
  }else if(locations.length!==1||locations[0].type!=='sectional'||locations[0].hiveId!==location.hiveId||locations[0].layoutId!==location.layoutId||locations[0].bodyRole!=='honey'||str(b.storageLocation))return fail('body_location_mismatch');
  if(!Array.isArray(b.frames)||b.frames.length>10||b.frames.some(f=>!obj(f)||!str(f.frameId)||f.history!=null&&!Array.isArray(f.history)))return fail('invalid_honey_frames');
  for(const f of b.frames){if(framesSeen.has(f.frameId))return fail('duplicate_frame_identity');framesSeen.add(f.frameId);}
  if(!groups.has(b.pairId))groups.set(b.pairId,[]);
  groups.get(b.pairId).push(id);
 }
 const pairs=[];
 for(const [pairId,bodyIds] of groups){
  const registered=Object.values(inventory).filter(b=>b?.pairId===pairId);
  if(bodyIds.length!==2||registered.length!==2||registered.some(b=>!bodyIds.includes(b.id)))return fail('incomplete_or_ambiguous_pair');
  pairs.push({pairId,bodyIds:bodyIds.slice()});
 }
 // Pairs are contiguous in the physical stack; no rearrangement on read.
 if(!same(pairs.flatMap(p=>p.bodyIds),ids))return fail('pair_order_mismatch');
 return {ok:true,pairs};
}
// B07.1: stock/installed inventory read by immutable physical body ID, not H1/H2.
function inventoryReview(state,request,deps){
 const c=context(state,request?.hiveId,deps);if(!c.ok)return c;
 const stack=c.layout.honeyStack,ids=stack?.bodyIds;
 if(!['early','main'].includes(stack?.purpose)||![2,4].includes(ids?.length))return fail('honey_stack_unavailable');
 const installed=pairGroups(state,ids,{type:'sectional',hiveId:request.hiveId,layoutId:c.layout.id},deps);
 if(!installed.ok)return installed;
 if(deps.physicalLayout.inspect(state).length||deps.coordinator.inspect(state,deps.operationDependencies||{}).length)return fail('sectional_evidence_invalid');
 const pending=rows(state.extractions).flatMap(e=>rows(e.items).filter(i=>i?.hiveId===request.hiveId&&i.sectional&&i.sectional.kind!=='full-cycle-v1'&&!i.returnedAt).map(i=>({extractionId:e.id,bodyIds:i.sectional.bodyIds.slice(),pairIds:i.sectional.pairIds.slice()})));
 const raw=!pending.length&&typeof deps.coordinator.availableSecondHoneyPairs==='function'&&str(request.techProcessId)?deps.coordinator.availableSecondHoneyPairs(state,request):[];
 const offers=rows(raw).filter(p=>{
  const checked=pairGroups(state,p?.bodyIds,{type:'storage'},deps);
  return checked.ok&&checked.pairs.length===1&&checked.pairs[0].pairId===p.pairId&&p.bodyIds.every(id=>c.bodies[id].frames.length===10);
 }).map(p=>({pairId:p.pairId,bodyIds:p.bodyIds.slice()}));
 return {ok:true,layoutId:c.layout.id,purpose:stack.purpose,bodyCount:ids.length,installedPairs:installed.pairs,offers,pending};
}
// OP08 owner clarification: full removal only. Plans are read-only and
// cannot be committed until the full physical state and replay validators exist.
function extractionReview(state,request,deps){
 const v=inventoryReview(state,request,deps);if(!v.ok)return v;
 if(!dateOnly(request.date)||!dateOnly(request.today)||request.date>request.today||v.pending.length)return fail('invalid_extraction_review');
 if(!Number.isFinite(request.kilograms)||request.kilograms<=0)return fail('invalid_extraction_amount');
 const allPairIds=v.installedPairs.map(p=>p.pairId);
 if(request.pairIds!=null&&(!unique(request.pairIds)||request.pairIds.length!==allPairIds.length||!allPairIds.every(id=>request.pairIds.includes(id))))return fail('all_installed_honey_pairs_required');
 const c=context(state,request.hiveId,deps);if(!c.ok)return c;
 const excluders=rows(c.layout.honeyStack.excluders),excluderIds=excluders.map(x=>x?.itemId);
 if(excluderIds.length!==2||!unique(excluderIds)||!['left','right'].every(side=>excluders.filter(x=>x?.side===side).length===1))return fail('both_excluders_required');
 const bodyIds=v.installedPairs.flatMap(p=>p.bodyIds),sealed=[],unsealed=[],unknown=[];
 for(const bodyId of bodyIds){
  const frames=c.bodies[bodyId].frames;
  if(frames.length!==10)return fail('full_frame_inventory_required');
  for(const frame of frames){
   const f={bodyId,frameId:frame.frameId};
   if(frame.status==='sealed')sealed.push(f);
   else if(frame.status==='nectar')unsealed.push(f);
   else if(!['drawn','foundation','partial','extracted'].includes(frame.status))unknown.push(f);
  }
 }
 if(sealed.length!==bodyIds.length*10)return {ok:false,error:'all_frames_must_be_ready',readyCount:sealed.length,requiredCount:bodyIds.length*10,unsealedFrames:unsealed,unknownFrames:unknown};
 return {ok:true,kind:'full_removal_review',hiveId:request.hiveId,layoutId:v.layoutId,priorCount:v.bodyCount,targetCount:0,bodyIds,pairIds:allPairIds,excluderIds,sealedFrames:sealed,unsealedFrames:unsealed,unknownFrames:unknown,closureRequired:true,requiredCovers:3,requiredTopRisers:3,canCommit:false,date:request.date,kilograms:request.kilograms};
}
// A new installation after a zero-honey interval does not inherit the count
// or identity of the removed stack. Candidate IDs must be selected explicitly;
// availability is reviewed without reserving or moving any equipment.
function installationReview(state,request,deps){
 const c=context(state,request?.hiveId,deps);if(!c.ok)return c;
 if(c.layout.honeyStack!=null)return fail('zero_honey_layout_required');
 if(!dateOnly(request.date)||!dateOnly(request.today)||request.date>request.today||!['early','main'].includes(request.purpose))return fail('invalid_installation_date_or_purpose');
 if(!unique(request.bodyIds)||![2,4].includes(request.bodyIds.length))return fail('two_or_four_bodies_required');
 const checked=pairGroups(state,request.bodyIds,{type:'storage'},deps);if(!checked.ok)return checked;
 if(request.bodyIds.some(id=>c.bodies[id].frames.length!==10))return fail('full_frame_inventory_required');
 const ids=request.excluderIds;
 if(!unique(ids)||ids.length!==2)return fail('both_excluders_required');
 const items=state.equipmentInventory.items||{};
 if(ids.some(id=>items[id]?.kind!=='honeyQueenExcluder'||items[id]?.condition!=='good'||items[id]?.location?.type!=='storage'))return fail('excluder_unavailable');
 return {ok:true,kind:'new_installation_review',hiveId:request.hiveId,layoutId:c.layout.id,priorCount:0,targetCount:request.bodyIds.length,purpose:request.purpose,bodyIds:request.bodyIds.slice(),pairIds:checked.pairs.map(p=>p.pairId),excluderIds:ids.slice(),date:request.date,canCommit:false};
}
// Deprecated name: old return-by-extraction-ID is no longer a valid contract.
// Existing records are never deleted or rewritten by this adapter.
function returnReview(){return fail('use_independent_installation_review');}
// B07.4: detached candidate for the existing additional-pair coordinator.
// Caller must still integrate the current IndexedDB CAS/save queue, verify
// durability and handle rollback. No write callback is accepted here.
function prepareAdditionalPair(state,request,deps){
 if(!str(state?.meta?.revisionId)||request?.expectedRevisionId!==state.meta.revisionId)return fail('revision_required_or_changed');
 if(request.userConfirmed!==true)return fail('user_confirmation_required');
 const v=inventoryReview(state,request,deps);
 if(!v.ok)return v;
 const selected=v.offers.find(p=>p.pairId===request.pairId);
 if(!selected||!unique(request.addedBodyIds)||!same(selected.bodyIds,request.addedBodyIds))return fail('reviewed_stock_pair_changed');
 if(typeof deps.coordinator.completeOP07AdditionalHoneyPair!=='function')return fail('coordinator_unavailable');
 try{
  const draft=structuredClone(state);
  const result=deps.coordinator.completeOP07AdditionalHoneyPair(draft,{hiveId:request.hiveId,techProcessId:request.techProcessId,expectedRevisionId:request.expectedRevisionId,userConfirmed:true,occurredAt:request.occurredAt,addedBodyIds:selected.bodyIds.slice()},deps.operationDependencies||{});
  if(!result?.ok)return fail(result?.error||'candidate_rejected');
  return {ok:true,kind:'unsaved_candidate',expectedRevisionId:request.expectedRevisionId,draft};
 }catch{return fail('candidate_preparation_failed');}
}
// B07.5: read-only presentation model. No actionable button or event handler.
function viewModel(state,request,deps){
 const c=context(state,request?.hiveId,deps);if(!c.ok)return {visible:false};
 if(c.layout.honeyStack==null){if(deps.physicalLayout.inspect(state).length||deps.coordinator.inspect(state,deps.operationDependencies||{}).length)return {visible:false};return {visible:true,bodyCount:0,installedPairs:[],offers:[],pending:[],canReviewInstallation:true,canCommit:false,reason:'B07_BLOCKED'};}
 const v=inventoryReview(state,request,deps);if(!v.ok)return {visible:false};
 return {visible:true,bodyCount:v.bodyCount,installedPairs:v.installedPairs,offers:v.bodyCount===2&&!v.pending.length?v.offers:[],pending:v.pending,readyFrames:v.installedPairs.flatMap(p=>p.bodyIds).reduce((sum,id)=>sum+rows(c.bodies[id].frames).filter(f=>f.status==='sealed').length,0),requiredFrames:v.bodyCount*10,canReviewExtraction:[2,4].includes(v.bodyCount)&&!v.pending.length,canCommit:false,reason:'B07_BLOCKED'};
}
window.PasekaSectionalHoneyReview=Object.freeze({inventoryReview,extractionReview,installationReview,returnReview,prepareAdditionalPair,viewModel});
})();
