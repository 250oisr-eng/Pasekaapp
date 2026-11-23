(function(){
'use strict';
// OP10: pure staged physical removal. No IndexedDB write, no auto-confirmation.
const A=x=>Array.isArray(x)?x:[],O=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const S=x=>typeof x==='string'&&x.trim().length>0;
const fail=(error,details)=>({ok:false,error,...(details?{details}:{})});
function stage(state,request,deps={}){
 if(!O(state)||!O(request)||request.operationId!=='OP-10'||request.userConfirmed!==true||request.honeyBodiesStoredConfirmed!==true||request.excludersStoredConfirmed!==true||request.coversActuallyReinstalled!==true||!S(request.hiveId)||!S(request.occurredAt)||!Number.isFinite(Date.parse(request.occurredAt))||typeof deps.makeId!=='function'||typeof deps.PasekaEquipmentItems?.place!=='function')return fail('op10_physical_confirmation_required');
 if(!S(deps.now)||Date.parse(request.occurredAt)>Date.parse(deps.now))return fail('op10_invalid_or_future_date');
 if(A(state.sectionalTechProcesses).some(p=>p?.hiveId===request.hiveId))return fail('op10_legacy_coordinator_must_be_migrated');
 const cycles=A(state.sectionalSeasonCycles).filter(p=>p?.hiveId===request.hiveId&&p.status==='ACTIVE');
 if(cycles.length!==1||cycles[0].migrationStatus==='REQUIRES_RECONCILIATION')return fail('op10_active_v2_cycle_required');
 const layoutList=A(state.sectionalLayouts).filter(l=>l?.hiveId===request.hiveId);
 if(layoutList.length!==1||layoutList[0].mode!=='SIDE_BY_SIDE'||layoutList[0].profileId!=='sectional-multiqueen-v1')return fail('op10_side_by_side_layout_required');
 const old=layoutList[0],honey=A(old.honeyStack?.bodyIds),excluders=A(old.honeyStack?.excluders);
 if(![2,4].includes(honey.length)||excluders.length!==2||new Set(honey).size!==honey.length||new Set(excluders.map(x=>x?.itemId)).size!==2||A(old.stacks).length!==3)return fail('op10_honey_structure_invalid');
 const bodyStorage=O(request.bodyStorageLocations)?request.bodyStorageLocations:{},itemStorage=O(request.excluderStorageLocations)?request.excluderStorageLocations:{},accessories=O(request.stackAccessories)?request.stackAccessories:{};
 if(Object.keys(bodyStorage).length!==honey.length||honey.some(id=>!S(bodyStorage[id])||bodyStorage[id].length>160)||Object.keys(itemStorage).length!==2||excluders.some(x=>!S(itemStorage[x.itemId])||itemStorage[x.itemId].length>160)||Object.keys(accessories).length!==3)return fail('op10_storage_and_stack_plan_incomplete');
 const inv=state.equipmentInventory,items=inv?.items,bodies=inv?.bodies;
 if(!O(inv)||!O(items)||!O(bodies)||!Array.isArray(inv.events)||!Array.isArray(inv.itemEvents))return fail('op10_inventory_invalid');
 for(const id of honey){const body=bodies[id];if(!O(body)||body.kind!=='honey'||!Array.isArray(body.frames)||body.frames.some(f=>!O(f)||!Array.isArray(f.history)))return fail('op10_honey_body_or_frame_invalid',{bodyId:id})}
 const equipmentIds=new Set([...excluders.map(e=>e.itemId)]);
 for(const stack of old.stacks){
  if(stack.coverItemId||stack.topRiserItemId)return fail('op10_previous_covers_unexpected');
  const pair=accessories[stack.id];
  if(!O(pair)||!S(pair.coverItemId)||!S(pair.topRiserItemId))return fail('op10_stack_accessory_missing',{stackId:stack.id});
  for(const [field,kind] of [['coverItemId','cover'],['topRiserItemId','topRiser']]){
   const id=pair[field];
   if(equipmentIds.has(id)||items[id]?.kind!==kind||items[id]?.location?.type!=='storage')return fail('op10_stack_accessory_not_in_storage',{itemId:id});
   equipmentIds.add(id);
  }
 }
 for(const e of excluders)if(items[e.itemId]?.kind!=='honeyQueenExcluder'||items[e.itemId]?.location?.type!=='hive'||items[e.itemId]?.location?.hiveId!==request.hiveId)return fail('op10_excluder_not_installed',{itemId:e.itemId});
 const used=new Set([...A(inv.events),...A(inv.itemEvents),...A(state.auditLog),...Object.values(items).flatMap(i=>A(i.events)),...Object.values(bodies).flatMap(b=>[...A(b.events),...A(b.frames).flatMap(f=>A(f.history))])].map(e=>e?.id).filter(Boolean));
 const nextId=()=>{const id=deps.makeId();if(!S(id)||used.has(id))throw Error('op10_duplicate_event_id');used.add(id);return id};
 let draft;try{draft=structuredClone(state)}catch{return fail('op10_clone_failed')}
 const target=draft.sectionalLayouts.find(l=>l.id===old.id);
 try{
  // Remove the excluders BEFORE removing their footprint from layout.
  for(const e of excluders){
   const r=deps.PasekaEquipmentItems.place(draft,{itemId:e.itemId,location:{type:'storage',label:itemStorage[e.itemId]}},nextId,request.occurredAt);
   if(!r.ok)throw Error('excluder_move:'+r.error);
  }
  delete target.honeyStack;
  for(const stack of target.stacks){
   const pair=accessories[stack.id];
   for(const [field,itemId] of Object.entries({coverItemId:pair.coverItemId,topRiserItemId:pair.topRiserItemId})){
    stack[field]=itemId;
    const r=deps.PasekaEquipmentItems.place(draft,{itemId,location:{type:'hive',hiveId:request.hiveId,stackId:stack.id}},nextId,request.occurredAt);
    if(!r.ok)throw Error('stack_move:'+r.error);
   }
  }
  for(const bodyId of honey){
   const body=draft.equipmentInventory.bodies[bodyId];
   const from={type:'sectional',hiveId:request.hiveId,layoutId:old.id,bodyRole:'honey',position:'shared-honey-stack'},to={type:'storage',label:bodyStorage[bodyId]};
   if(body.events!=null&&!Array.isArray(body.events))throw Error('invalid_body_events');
   if(!Array.isArray(body.events))body.events=[];
   const ev={id:nextId(),type:'removed_to_storage',operationId:'OP-10',at:request.occurredAt,bodyId,from,to};
   body.events.push(ev);draft.equipmentInventory.events.push({...ev,id:nextId(),type:'sectional_body_removed'});
   body.storageLocation=to.label;body.updatedAt=request.occurredAt;
   for(const frame of body.frames)frame.history.push({id:nextId(),type:'sectional_honey_body_removed_to_storage',operationId:'OP-10',at:request.occurredAt,hiveId:request.hiveId,bodyId,frameId:frame.frameId});
  }
  if(!Array.isArray(draft.auditLog))throw Error('audit_log_missing');
  draft.auditLog.push({id:nextId(),type:'sectional_operation_confirmed',operationId:'OP-10',hiveId:request.hiveId,at:request.occurredAt,bodyIds:honey.slice(),userConfirmed:true});
 }catch(e){return fail('op10_staging_failed',{message:e.message})}
 return {ok:true,draft,removedBodyIds:honey.slice(),storedExcluderIds:excluders.map(x=>x.itemId)};
}
window.PasekaSectionalOP10HoneyRemoval=Object.freeze({stage});
})();