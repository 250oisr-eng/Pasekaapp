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
 if(!['early','main'].includes(stack?.purpose)||stack.purpose==='early'&&ids?.length!==2)return fail('honey_stack_unavailable');
 const installed=pairGroups(state,ids,{type:'sectional',hiveId:request.hiveId,layoutId:c.layout.id},deps);
 if(!installed.ok)return installed;
 if(deps.physicalLayout.inspect(state).length||deps.coordinator.inspect(state).length)return fail('sectional_evidence_invalid');
 const raw=typeof deps.coordinator.availableSecondHoneyPairs==='function'&&str(request.techProcessId)?deps.coordinator.availableSecondHoneyPairs(state,request):[];
 const offers=rows(raw).filter(p=>{
  const checked=pairGroups(state,p?.bodyIds,{type:'storage'},deps);
  return checked.ok&&checked.pairs.length===1&&checked.pairs[0].pairId===p.pairId&&p.bodyIds.every(id=>c.bodies[id].frames.length===10);
 }).map(p=>({pairId:p.pairId,bodyIds:p.bodyIds.slice()}));
 return {ok:true,layoutId:c.layout.id,purpose:stack.purpose,bodyCount:ids.length,installedPairs:installed.pairs,offers};
}
// B07.2: an extraction review is a selection only. P38/OP08: do not
// treat unsealed or unknown honey as harvest-ready; no record is created.
function extractionReview(state,request,deps){
 const v=inventoryReview(state,request,deps);if(!v.ok)return v;
 if(v.purpose!=='main')return fail('main_harvest_required');
 if(!unique(request.pairIds)||!request.pairIds.length||!dateOnly(request.date)||!dateOnly(request.today)||request.date>request.today||typeof request.kilograms!=='number'||!Number.isFinite(request.kilograms)||request.kilograms<=0)return fail('invalid_extraction_review');
 const selected=v.installedPairs.filter(p=>request.pairIds.includes(p.pairId));
 if(selected.length!==request.pairIds.length)return fail('selected_pair_not_installed');
 const bodyIds=selected.flatMap(p=>p.bodyIds),frames=[];
 for(const bodyId of bodyIds){
  const body=state.equipmentInventory.bodies[bodyId];
  for(const frame of body.frames){
   if(!['sealed','drawn','foundation','partial','extracted'].includes(frame.status))return fail('unsealed_or_unknown_frame_requires_review');
   if(frame.status==='sealed')frames.push({bodyId,frameId:frame.frameId});
  }
 }
 if(!frames.length)return fail('no_sealed_honey');
 return {ok:true,kind:'extraction_review',hiveId:request.hiveId,layoutId:v.layoutId,pairIds:selected.map(p=>p.pairId),bodyIds,frames,date:request.date,kilograms:request.kilograms};
}
// B07.3: future sectional extraction records must carry physical IDs and
// original layout ID. Legacy records never qualify. This reads existing
// evidence only; it does not manufacture a pending record or return bodies.
function returnReview(state,request,deps){
 const c=context(state,request?.hiveId,deps);if(!c.ok)return c;
 if(!str(request.extractionId)||!dateOnly(request.date)||!dateOnly(request.today)||request.date>request.today)return fail('invalid_return_review');
 const events=rows(state.extractions).filter(e=>e?.id===request.extractionId);
 if(events.length!==1||!dateOnly(events[0].date)||request.date<events[0].date)return fail('extraction_evidence_missing_or_invalid');
 const items=rows(events[0].items).filter(i=>i?.hiveId===request.hiveId);
 if(items.length!==1)return fail('extraction_item_ambiguous');
 const item=items[0],e=item.sectional;
 if(!obj(e)||e.profileId!==PROFILE||e.layoutId!==c.layout.id||item.returnedAt||item.returned===true)return fail('sectional_pending_return_required');
 const checked=pairGroups(state,e.bodyIds,{type:'storage'},deps);
 if(!checked.ok)return checked;
 if(!unique(e.pairIds)||!same(checked.pairs.map(p=>p.pairId),e.pairIds))return fail('pending_pair_identity_mismatch');
 const installed=rows(c.layout.honeyStack?.bodyIds);
 if(installed.some(id=>e.bodyIds.includes(id))||![2,4].includes(installed.length+e.bodyIds.length))return fail('return_capacity_or_location_mismatch');
 return {ok:true,kind:'return_review',extractionId:request.extractionId,hiveId:request.hiveId,layoutId:e.layoutId,pairIds:e.pairIds.slice(),bodyIds:e.bodyIds.slice(),date:request.date};
}
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
 const v=inventoryReview(state,request,deps);if(!v.ok)return {visible:false};
 return {visible:true,bodyCount:v.bodyCount,installedPairs:v.installedPairs,offers:v.bodyCount===2?v.offers:[],canCommit:false,reason:'B07_BLOCKED'};
}
window.PasekaSectionalHoneyReview=Object.freeze({inventoryReview,extractionReview,returnReview,prepareAdditionalPair,viewModel});
})();
