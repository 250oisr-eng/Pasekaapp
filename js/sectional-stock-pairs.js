(function(){
'use strict';
const PROFILE='sectional-multiqueen-v1',rows=x=>Array.isArray(x)?x:[],str=x=>typeof x==='string'&&x.trim().length>0,fail=(error,details)=>({ok:false,error,details});
function available(state,inventory){
 if(typeof inventory?.locateAll!=='function')return [];
 return Object.values(state?.equipmentInventory?.bodies||{}).filter(b=>b?.kind==='honey'&&b.condition==='good'&&b.spec?.profileId===PROFILE&&b.spec?.kind==='honey'&&b.spec?.framesPerBox===10&&b.spec?.frame?.heightMm===180&&str(b.storageLocation)&&Array.isArray(b.frames)&&b.frames.length===10&&inventory.locateAll(state,b.id).length===0).map(b=>({id:b.id,label:b.labelCode||b.id,pairId:b.pairId||null,storageLocation:b.storageLocation}));
}
// Re-form complete pairs of selected free bodies, and dissolve affected old
// pairs only when every affected member is free in the same sectional stock.
// This is a detached transformation, never an equipment movement.
function prepare(state,request,deps={}){
 try{
  const ids=request?.bodyIds,inv=deps.PasekaInventory;
  if(request?.userConfirmed!==true||!str(state?.meta?.revisionId)||request.expectedRevisionId!==state.meta.revisionId)return fail('confirmation_or_revision_required');
  if(!Array.isArray(ids)||![2,4].includes(ids.length)||ids.some(id=>!str(id))||new Set(ids).size!==ids.length||typeof deps.makeId!=='function'||typeof inv?.inspect!=='function')return fail('two_or_four_distinct_bodies_required');
  const at=request.occurredAt,now=typeof deps.now==='function'?deps.now():Date.now();
  if(!str(at)||!Number.isFinite(Date.parse(at))||Date.parse(at)>new Date(now).getTime())return fail('invalid_timestamp');
  const errors=inv.inspect(state,deps.PasekaLabels,deps.profileForHive);if(errors.length)return fail('invalid_inventory',errors);
  const free=new Map(available(state,inv).map(b=>[b.id,b])),bodies=state.equipmentInventory.bodies;
  if(ids.some(id=>!free.has(id)))return fail('body_not_free');
  const oldPairs=new Set(ids.map(id=>bodies[id].pairId).filter(Boolean));
  const affected=Object.values(bodies).filter(b=>ids.includes(b.id)||oldPairs.has(b.pairId));
  if(affected.some(b=>!free.has(b.id)))return fail('old_partner_not_free');
  // Strictly later than recorded movement/regroup evidence: timestamps
  // distinguish old pair membership from a new stock regroup.
  for(const b of affected)if(rows(b.events).some(e=>!Number.isFinite(Date.parse(e.at))||Date.parse(e.at)>=Date.parse(at)))return fail('regroup_timestamp_not_after_body_history');
  const draft=structuredClone(state),next=draft.equipmentInventory,used=new Set();
  for(const b of Object.values(next.bodies)){if(str(b.pairId))used.add(b.pairId);for(const e of rows(b.events))if(str(e.id))used.add(e.id);}
  for(const e of rows(next.events))if(str(e.id))used.add(e.id);
  const id=()=>{for(let i=0;i<100;i++){const value=deps.makeId();if(str(value)&&!used.has(value)){used.add(value);return value;}}throw Error('unique_id_unavailable');};
  const assignments=new Map(affected.map(b=>[b.id,null])),pairs=[];
  for(let i=0;i<ids.length;i+=2){
   const members=ids.slice(i,i+2),previous=bodies[members[0]].pairId;
   const pairId=str(previous)&&previous===bodies[members[1]].pairId?previous:id();
   members.forEach(bodyId=>assignments.set(bodyId,pairId));pairs.push({pairId,bodyIds:members});
  }
  for(const [bodyId,pairId] of assignments){
   const b=next.bodies[bodyId],from=b.pairId||null;if(from===pairId)continue;
   if(!Array.isArray(b.events)||!Array.isArray(next.events))return fail('journal_invalid');
   if(pairId===null)delete b.pairId;else b.pairId=pairId;
   b.updatedAt=at;const evidence={type:'sectional_stock_pair_regrouped',at,bodyId,fromPairId:from,toPairId:pairId};
   b.events.push({id:id(),...evidence});next.events.push({id:id(),...evidence});
  }
  const after=inv.inspect(draft,deps.PasekaLabels,deps.profileForHive);
  if(after.length)return fail('regroup_validation_failed',after);
  // Do not weaken existing historical checks to force a regroup.
  const history=deps.PasekaSectionalOperationCoordinator?.inspect(draft,deps);
  if(!Array.isArray(history)||history.length)return fail('regroup_historical_validation_failed',history);
  return {ok:true,kind:'unsaved_candidate',expectedRevisionId:request.expectedRevisionId,draft,pairs};
 }catch(e){return fail('regroup_failed',String(e?.message||e));}
}
window.PasekaSectionalStockPairs=Object.freeze({available,prepare});
})();
