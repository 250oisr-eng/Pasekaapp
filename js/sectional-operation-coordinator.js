(function(){
'use strict';
const PROFILE_ID='sectional-multiqueen-v1';
const MODEL_VERSION=1;
const isObject=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const rows=value=>Array.isArray(value)?value:[];
const nonEmpty=value=>typeof value==='string'&&value.trim().length>0;
const validDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
function timestampIsFuture(value,deps={}){
 let nowValue;
 try{nowValue=typeof deps.now==='function'?deps.now():Date.now()}catch{return true}
 const nowMs=typeof nowValue==='number'?nowValue:Date.parse(nowValue);
 return !Number.isFinite(nowMs)||Date.parse(value)>nowMs;
}
function calendarDayDifference(later,earlier){
 if(!validDate(later)||!validDate(earlier))return null;
 const laterDay=Date.parse(later.slice(0,10)+'T00:00:00.000Z'),earlierDay=Date.parse(earlier.slice(0,10)+'T00:00:00.000Z');
 return Number.isFinite(laterDay)&&Number.isFinite(earlierDay)?Math.round((laterDay-earlierDay)/86400000):null;
}
function clone(value){return structuredClone(value)}
function commit(target,draft){for(const key of Object.keys(target))delete target[key];Object.assign(target,draft)}
function sameLocation(a,b){
 if(!isObject(a)||!isObject(b))return false;
 const keys=['type','hiveId','stackId','bodyId','openingId','positionLabel','label'];
 const sameBase=keys.every(key=>(a[key]??null)===(b[key]??null));
 const footprint=value=>Array.isArray(value)?value.map(row=>row?.bodyId+':'+row?.coverage).sort().join('|'):null;
 return sameBase&&footprint(a.footprint)===footprint(b.footprint);
}
function addTarget(map,itemId,location,errors,source){
 if(!nonEmpty(itemId)){errors.push({code:'operation_item_reference_missing',details:{source}});return}
 if(map.has(itemId)){errors.push({code:'operation_item_reference_duplicate',details:{itemId,source}});return}
 map.set(itemId,location);
}
function newLayoutTargets(layout){
 const targets=new Map(),errors=[];
 for(const stack of rows(layout?.stacks)){
  for(const key of ['bottomItemId','coverItemId','topRiserItemId','feederItemId']){
   if(stack?.[key])addTarget(targets,stack[key],{type:'hive',hiveId:layout.hiveId,stackId:stack.id},errors,'stack.'+key);
  }
 }
 for(const connection of rows(layout?.technicalConnections))for(const opening of rows(connection?.openings)){
  addTarget(targets,opening?.itemId,{type:'hive',hiveId:layout.hiveId,bodyId:opening?.bodyId,openingId:opening?.openingId},errors,'technicalConnection');
 }
 for(const plug of rows(layout?.temporaryQueenIsolation)){
  addTarget(targets,plug?.itemId,{type:'hive',hiveId:layout.hiveId,bodyId:plug?.bodyId,openingId:plug?.openingId},errors,'temporaryQueenIsolation');
 }
 const sections=rows(layout?.sections),left=sections.find(row=>row?.position==='left'),middle=sections.find(row=>row?.position==='middle'),right=sections.find(row=>row?.position==='right');
 const upper=section=>section?.upperBroodBodyId||null;
 for(const row of rows(layout?.honeyStack?.excluders)){
  const footprint=row?.side==='left'?[{bodyId:upper(left),coverage:'FULL'},{bodyId:upper(middle),coverage:'HALF'}]:row?.side==='right'?[{bodyId:upper(middle),coverage:'HALF'},{bodyId:upper(right),coverage:'FULL'}]:null;
  addTarget(targets,row?.itemId,{type:'hive',hiveId:layout.hiveId,footprint},errors,'honeyStack.excluder');
 }
 return {targets,errors};
}
function layoutItemIds(layout){
 const ids=[];
 for(const stack of rows(layout?.stacks))for(const key of ['bottomItemId','coverItemId','topRiserItemId','feederItemId'])if(stack?.[key])ids.push(stack[key]);
 for(const connection of rows(layout?.technicalConnections))for(const row of rows(connection?.openings))if(row?.itemId)ids.push(row.itemId);
 for(const row of rows(layout?.temporaryQueenIsolation))if(row?.itemId)ids.push(row.itemId);
 for(const row of rows(layout?.meshDiaphragms))if(row?.itemId)ids.push(row.itemId);
 for(const row of rows(layout?.closedOpenings))if(row?.itemId)ids.push(row.itemId);
 for(const row of rows(layout?.honeyStack?.excluders))if(row?.itemId)ids.push(row.itemId);
 return ids;
}
function planBodyMoves(state,oldLayout,newLayout,suppliedMoves){
 const errors=[],bodies=state?.equipmentInventory?.bodies||{};
 const oldIds=new Set([...rows(oldLayout?.sections).flatMap(section=>rows(section?.broodBodyIds)),...rows(oldLayout?.honeyStack?.bodyIds)]);
 const newIds=new Set([...rows(newLayout?.sections).flatMap(section=>rows(section?.broodBodyIds)),...rows(newLayout?.honeyStack?.bodyIds)]);
 const required=new Set([...oldIds].filter(id=>!newIds.has(id)));
 const supplied=rows(suppliedMoves),seen=new Set(),storageById=new Map();
 for(const row of supplied){
  const id=String(row?.bodyId||''),location=String(row?.storageLocation||'').trim();
  if(!id||seen.has(id)||!required.has(id)||!location||location.length>160){errors.push({code:'operation_body_storage_move_invalid',details:{bodyId:id||null}});continue}
  seen.add(id);storageById.set(id,location);
 }
 for(const id of required)if(!seen.has(id))errors.push({code:'operation_body_storage_move_required',details:{bodyId:id}});
 for(const id of newIds){
  if(!bodies[id])errors.push({code:'operation_target_body_missing',details:{bodyId:id}});
  for(const [hiveId,layout] of Object.entries(state.layouts||{})){
   if(Object.entries(layout?.boxes||{}).some(([boxId,box])=>boxId===id||box?.bodyId===id||box?.id===id))errors.push({code:'operation_target_body_in_legacy_layout',details:{bodyId:id,hiveId}});
  }
 }
 for(const id of required)if(!bodies[id])errors.push({code:'operation_old_body_missing',details:{bodyId:id}});
 return {errors,storageById,newIds,required};
}
function bodyLocationMap(layout){
 const locations=new Map();
 for(const section of rows(layout?.sections))for(const bodyId of rows(section?.broodBodyIds)){
  locations.set(bodyId,{type:'sectional',hiveId:layout.hiveId,layoutId:layout.id,bodyRole:'brood',sectionId:section.id,position:section.position});
 }
 for(const bodyId of rows(layout?.honeyStack?.bodyIds))locations.set(bodyId,{type:'sectional',hiveId:layout.hiveId,layoutId:layout.id,bodyRole:'honey',position:'shared-honey-stack'});
 return locations;
}
function nextUniqueId(makeId,used){
 for(let attempt=0;attempt<100;attempt++){
  const id=makeId();
  if(nonEmpty(id)&&!used.has(id)){used.add(id);return id;}
 }
 return null;
}
function collectEventIds(state){
 const used=new Set();
 for(const list of [state?.auditLog,state?.familyEvents,state?.queenEvents,state?.equipmentInventory?.events,state?.equipmentInventory?.itemEvents]){
  for(const row of rows(list))if(nonEmpty(row?.id))used.add(row.id);
 }
 for(const item of Object.values(state?.equipmentInventory?.items||{}))for(const event of rows(item?.events))if(nonEmpty(event?.id))used.add(event.id);
 for(const body of Object.values(state?.equipmentInventory?.bodies||{})){
  for(const event of rows(body?.events))if(nonEmpty(event?.id))used.add(event.id);
  for(const frame of rows(body?.frames))for(const event of rows(frame?.history))if(nonEmpty(event?.id))used.add(event.id);
 }
 for(const record of Object.values(state?.equipmentInventory?.retiredFrames||{})){const frame=record?.frame||record;for(const event of rows(frame?.history))if(nonEmpty(event?.id))used.add(event.id)}
 return used;
}
function appendBodyMovementHistory(state,oldLayout,newLayout,storageById,at,makeId,operationId='OP-04',labels){
 const inventory=state?.equipmentInventory;
 if(!isObject(inventory)||!Array.isArray(inventory.events))return {ok:false,error:'equipment_body_event_journal_invalid'};
 if(typeof makeId!=='function'||typeof labels?.appendFrameEvent!=='function')return {ok:false,error:'frame_history_api_missing'};
 const oldLocations=bodyLocationMap(oldLayout),newLocations=bodyLocationMap(newLayout);
 const bodyIds=new Set([...oldLocations.keys(),...newLocations.keys()]);
 const used=collectEventIds(state);
 const frameBox=(bodyId,location)=>location.bodyRole==='honey'?'honey:'+bodyId:'brood:'+location.position+':'+bodyId;
 for(const bodyId of bodyIds){
  const body=inventory.bodies?.[bodyId];
  if(!isObject(body))return {ok:false,error:'equipment_body_missing_for_history',details:{bodyId}};
  if(body.events!=null&&!Array.isArray(body.events))return {ok:false,error:'equipment_body_event_journal_invalid',details:{bodyId}};
  if(body.events==null)body.events=[];
  if(body.frames!=null&&!Array.isArray(body.frames))return {ok:false,error:'equipment_body_frame_registry_invalid',details:{bodyId}};
  const oldLocation=oldLocations.get(bodyId),newLocation=newLocations.get(bodyId);
  const from=oldLocation||{type:'storage',label:body.storageLocation||null};
  const to=newLocation||{type:'storage',label:storageById.get(bodyId)||null};
  if(oldLocation&&newLocation&&JSON.stringify(from)===JSON.stringify(to))continue;
  if(!newLocation&&!storageById.has(bodyId))return {ok:false,error:'equipment_body_storage_move_missing',details:{bodyId}};
  const installed=!!newLocation;
  const bodyEventId=nextUniqueId(makeId,used);
  if(!bodyEventId)return {ok:false,error:'equipment_body_event_id_unavailable',details:{bodyId}};
  body.events.push({id:bodyEventId,type:installed?'placed':'moved_to_storage',at,operationId,from:clone(from),to:clone(to)});
  body.updatedAt=at;
  const eventId=nextUniqueId(makeId,used);
  if(!eventId)return {ok:false,error:'equipment_body_event_id_unavailable',details:{bodyId}};
  inventory.events.push({id:eventId,type:installed?'sectional_body_placed':'sectional_body_moved_to_storage',at,bodyId,operationId,from:clone(from),to:clone(to)});
  for(const frame of rows(body.frames)){
   if(!isObject(frame))return {ok:false,error:'equipment_body_frame_invalid',details:{bodyId}};
   if(frame.history!=null&&!Array.isArray(frame.history))return {ok:false,error:'equipment_body_frame_history_invalid',details:{bodyId,frameId:frame.frameId??null}};
   const action=!oldLocation?'corpus_from_storage':!newLocation?'corpus_to_storage':'corpus_transfer';
   const frameFrom=oldLocation?{hiveId:oldLocation.hiveId,box:frameBox(bodyId,oldLocation)}:{storageLocation:body.storageLocation||'Склад'};
   const frameTo=newLocation?{hiveId:newLocation.hiveId,box:frameBox(bodyId,newLocation)}:{storageLocation:storageById.get(bodyId)};
   const frameEventId=nextUniqueId(makeId,used);
   if(!frameEventId)return {ok:false,error:'frame_history_event_id_unavailable',details:{bodyId,frameId:frame.frameId??null}};
   try{labels.appendFrameEvent(frame,action,{from:frameFrom,to:frameTo,operationId},at,frameEventId)}
   catch(error){return {ok:false,error:'frame_history_append_failed',details:{bodyId,frameId:frame.frameId??null,message:error?.message||String(error)}}}
  }
 }
 return {ok:true};
}
function appendOperationAudit(state,record,event,makeId){
 if(!Array.isArray(state.auditLog))return {ok:false,error:'audit_log_invalid'};
 const used=collectEventIds(state),id=nextUniqueId(makeId,used);
 if(!id)return {ok:false,error:'audit_event_id_unavailable'};
 const operation=rows(record.state.operations).find(row=>row?.operationId==='OP-04');
 const pending=operation?.status==='IN_PROGRESS';
 state.auditLog.push({id,type:pending?'sectional_operation_started':'sectional_operation_completed',at:pending?operation.startedAt:operation.completedAt,operationId:'OP-04',hiveId:record.hiveId,techProcessId:record.id,sourceFamilyId:event.sourceFamilyIds[0],resultFamilyIds:event.resultFamilyIds.slice(),familyEventId:event.id,layoutId:record.state.layoutId});
 if(state.auditLog.length>500)state.auditLog=state.auditLog.slice(-500);
 return {ok:true};
}
function appendStageOperationAudit(state,record,operationId,makeId){
 if(!Array.isArray(state.auditLog))return {ok:false,error:'audit_log_invalid'};
 const operation=rows(record.state.operations).find(row=>row?.operationId===operationId);
 if(!operation||operation.status!=='DONE'||!validDate(operation.completedAt))return {ok:false,error:'operation_audit_evidence_invalid'};
 const used=collectEventIds(state),id=nextUniqueId(makeId,used);
 if(!id)return {ok:false,error:'audit_event_id_unavailable'};
 state.auditLog.push({id,type:'sectional_operation_completed',at:operation.completedAt,operationId,hiveId:record.hiveId,techProcessId:record.id,layoutId:record.state.layoutId,...clone(operation.evidence||{})});
 if(state.auditLog.length>500)state.auditLog=state.auditLog.slice(-500);
 return {ok:true};
}
function planItemMoves(state,oldLayout,newLayout,suppliedMoves){
 const errors=[],inv=state?.equipmentInventory||{},items=inv.items||{};
 const {targets,errors:targetErrors}=newLayoutTargets(newLayout);errors.push(...targetErrors);
 const oldIds=new Set(layoutItemIds(oldLayout)),newIds=new Set(targets.keys()),required=new Map();
 for(const [itemId,target] of targets){
  const item=items[itemId];
  if(!item){errors.push({code:'operation_item_missing',details:{itemId}});continue}
  if(!sameLocation(item.location,target))required.set(itemId,target);
 }
 for(const itemId of oldIds){
  if(newIds.has(itemId))continue;
  const item=items[itemId];
  if(!item){errors.push({code:'operation_old_item_missing',details:{itemId}});continue}
  if(item.location?.type==='hive')required.set(itemId,{type:'storage'});
  else if(item.location?.type!=='storage')errors.push({code:'operation_old_item_location_invalid',details:{itemId,location:item.location??null}});
 }
 const moves=rows(suppliedMoves),seen=new Set();
 for(const move of moves){
  const itemId=String(move?.itemId||'');
  if(!itemId||seen.has(itemId)){errors.push({code:'operation_item_move_duplicate_or_invalid',details:{itemId:itemId||null}});continue}
  seen.add(itemId);
  if(!required.has(itemId)){errors.push({code:'operation_item_move_unexpected',details:{itemId}});continue}
  const target=required.get(itemId);
  if(target.type==='storage'){
   if(move.location?.type!=='storage'||!nonEmpty(move.location.label))errors.push({code:'operation_removed_item_storage_required',details:{itemId}});
  }else if(!sameLocation(move.location,target))errors.push({code:'operation_item_move_target_mismatch',details:{itemId,expected:target,actual:move.location??null}});
 }
 for(const itemId of required.keys())if(!seen.has(itemId))errors.push({code:'operation_item_move_required',details:{itemId,target:required.get(itemId)}});
 if(moves.length!==required.size)errors.push({code:'operation_item_move_count_mismatch',details:{required:required.size,provided:moves.length}});
 return {errors,moves};
}


 // A full-harvest journal is append-only. Current inventory ownership is
 // validated by the physical inspectors; old events prove historical moves.
function inspectHoneyCycles(state,record,layout,initialIds,initialExcluderIds,purpose,startedAt){
 const errors=[],bad=(reason,transitionId)=>errors.push({code:'sectional_full_honey_cycle_invalid',details:{id:record.id,reason,transitionId:transitionId??null}});
 const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b),sorted=a=>rows(a).slice().sort();
 const allUnique=a=>Array.isArray(a)&&a.every(nonEmpty)&&new Set(a).size===a.length;
 const inventory=state.equipmentInventory||{},source=record.state.honeyTransitions;
 const linked=rows(state.extractions).flatMap(e=>rows(e?.items).filter(i=>i?.hiveId===record.hiveId&&i.sectional!=null).map(i=>({e,i})));
 if(source==null&&!linked.length)return {errors,hasCycles:false};
 if(!Array.isArray(source)||!source.length){bad('journal_missing');return {errors,hasCycles:false};}
 let current={purpose,bodyIds:initialIds.slice(),excluderIds:sorted(initialExcluderIds)},last=Date.parse(startedAt),closed=null;
 const seen=new Set(),extractionIds=new Set(),moveIds=new Set();
 const stack=s=>s==null?null:{purpose:s.purpose,bodyIds:rows(s.bodyIds),excluderIds:sorted(rows(s.excluders).map(x=>x?.itemId))};
 const validStack=s=>isObject(s)&&['early','main'].includes(s.purpose)&&allUnique(s.bodyIds)&&[2,4].includes(s.bodyIds.length)&&allUnique(s.excluderIds)&&s.excluderIds.length===2;
 const slotRows=()=>rows(layout?.stacks);
 const actualClosed=()=>slotRows().map(s=>({stackId:s.id,coverItemId:s.coverItemId,topRiserItemId:s.topRiserItemId}));
 const validClosure=a=>Array.isArray(a)&&a.length===3&&allUnique(a.flatMap(x=>[x?.coverItemId,x?.topRiserItemId]))&&eq(a.map(x=>x.stackId),slotRows().map(x=>x.id));
 if(!validStack(current)||!Number.isFinite(last))bad('initial_state_invalid');
 for(const t of source){
  if(!isObject(t)||!nonEmpty(t.transitionId)||seen.has(t.transitionId)||t.hiveId!==record.hiveId||t.techProcessId!==record.id||t.layoutId!==layout?.id||!validDate(t.occurredAt)||Date.parse(t.occurredAt)<last||!['extract','install'].includes(t.kind)){bad('transition_invalid',t?.transitionId);continue}
  const id=t.transitionId,at=t.occurredAt,extract=t.kind==='extract',prior=stack(t.priorHoneyStack),next=stack(t.nextHoneyStack);
  seen.add(id);last=Date.parse(at);
  if(!eq(prior,current)||!(extract?validStack(prior)&&next===null:prior===null&&validStack(next))){bad('chain_mismatch',id);continue}
  const active=extract?prior:next,bodyIds=active.bodyIds;
  if(!eq(t.bodyIds,bodyIds)||!allUnique(t.pairIds)||t.pairIds.length!==bodyIds.length/2||!validClosure(t.closedStacks)||!eq(t.closedAccessoryIds,t.closedStacks.flatMap(s=>[s.coverItemId,s.topRiserItemId])))bad('physical_evidence_invalid',id);
  if(!extract&&!eq(closed,t.closedStacks))bad('closure_chain_mismatch',id);
  const op=(extract?'OP-08-EXTRACT:':'OP-08-INSTALL:')+id,storageMoves=rows(t.bodyStorageMoves);
  if(extract?storageMoves.length!==bodyIds.length||!allUnique(storageMoves.map(x=>x?.bodyId))||storageMoves.some(x=>!bodyIds.includes(x.bodyId)||!nonEmpty(x.storageLocation)):storageMoves.length!==0)bad('storage_evidence_invalid',id);
  for(const bodyId of bodyIds){
   const b=inventory.bodies?.[bodyId],loc={type:'sectional',hiveId:record.hiveId,layoutId:layout.id,bodyRole:'honey',position:'shared-honey-stack'};
   const moves=rows(b?.events).filter(x=>x?.operationId===op&&x.at===at&&x.type===(extract?'moved_to_storage':'placed'));
   const globals=rows(inventory.events).filter(x=>x?.operationId===op&&x.at===at&&x.bodyId===bodyId&&x.type===(extract?'sectional_body_moved_to_storage':'sectional_body_placed'));
   const e=moves[0],g=globals[0],stored=extract?e?.to:e?.from;
   if(!b||b.kind!=='honey'||moves.length!==1||globals.length!==1||!nonEmpty(e?.id)||!nonEmpty(g?.id)||moveIds.has(e.id)||moveIds.has(g.id)||!eq(e.from,g.from)||!eq(e.to,g.to)||!eq(extract?e.from:e.to,loc)||stored?.type!=='storage'||!nonEmpty(stored.label)||extract&&stored.label!==storageMoves.find(x=>x.bodyId===bodyId)?.storageLocation)bad('body_move_missing',id);
   if(e?.id)moveIds.add(e.id);if(g?.id)moveIds.add(g.id);
  }
  const coverTargets=new Map(rows(t.closedStacks).flatMap(s=>[[s.coverItemId,{kind:'cover',location:{type:'hive',hiveId:record.hiveId,stackId:s.stackId}}],[s.topRiserItemId,{kind:'topRiser',location:{type:'hive',hiveId:record.hiveId,stackId:s.stackId}}]]));
  const historicalLayout={...layout,honeyStack:extract?t.priorHoneyStack:t.nextHoneyStack,stacks:slotRows().map(s=>({...s,coverItemId:undefined,topRiserItemId:undefined}))};
  const exTargets=newLayoutTargets(historicalLayout).targets;
  const expectedItems=[...coverTargets.keys(),...active.excluderIds],itemEvidence=rows(t.itemEvents);
  if(expectedItems.length!==8||!allUnique(expectedItems)||!allUnique(itemEvidence.map(e=>e?.itemId))||!eq(sorted(itemEvidence.map(e=>e?.itemId)),sorted(expectedItems)))bad('accessory_count_invalid',id);
  for(const entry of itemEvidence){
   const item=inventory.items?.[entry?.itemId],local=rows(item?.events).filter(x=>x?.id===entry?.eventId),global=rows(inventory.itemEvents).filter(x=>x?.id===entry?.eventId&&x.itemId===entry?.itemId);
   const ev=local[0],isCover=coverTargets.has(entry.itemId),toHive=isCover?extract:!extract,expected=isCover?coverTargets.get(entry.itemId).location:exTargets.get(entry.itemId);
   const storage=toHive?ev?.from:ev?.to;
   if(!nonEmpty(entry.eventId)||moveIds.has(entry.eventId)||!item||item.kind!==(isCover?coverTargets.get(entry.itemId).kind:'honeyQueenExcluder')||local.length!==1||global.length!==1||!eq(ev,global[0])||ev?.at!==at||ev?.type!==(toHive?'moved':'moved_to_storage')||!expected||!sameLocation(toHive?ev.to:ev.from,expected)||storage?.type!=='storage'||!nonEmpty(storage.label))bad('accessory_move_missing',id);
   if(entry?.eventId)moveIds.add(entry.eventId);
  }
  const frameEvents=rows(t.frameEvents);
  if(extract){
   extractionIds.add(id);
   if(!Number.isFinite(t.kilograms)||t.kilograms<=0||frameEvents.length!==bodyIds.length*10||!allUnique(frameEvents.map(f=>f?.frameId))||!allUnique(frameEvents.map(f=>f?.eventId)))bad('harvest_evidence_invalid',id);
   for(const bodyId of bodyIds)if(frameEvents.filter(f=>f?.bodyId===bodyId).length!==10)bad('harvest_frame_count_invalid',id);
   for(const f of frameEvents){
    const matches=rows(inventory.bodies?.[f?.bodyId]?.frames).flatMap(frame=>frame?.frameId===f?.frameId?rows(frame.history).filter(e=>e?.id===f.eventId&&e.action==='extraction'&&e.extractionId===id&&e.at===at&&e.from==='sealed'&&e.to==='extracted'):[]);
    if(!bodyIds.includes(f?.bodyId)||matches.length!==1||moveIds.has(f?.eventId))bad('harvest_frame_event_missing',id);
    if(f?.eventId)moveIds.add(f.eventId);
   }
   const matches=linked.filter(x=>x.e.id===id);
   if(matches.length!==1)bad('extraction_record_missing',id);
   else{
    const {e,i}=matches[0];
    if(e.date!==at.slice(0,10)||i.kilograms!==t.kilograms||!eq(i.boxes,bodyIds)||!eq(i.frameIds,frameEvents.map(f=>f.frameId))||i.sectional?.kind!=='full-cycle-v1'||i.sectional?.transitionId!==id||i.sectional?.layoutId!==layout.id||!eq(i.sectional?.bodyIds,bodyIds)||!eq(i.sectional?.pairIds,t.pairIds)||i.returnedAt!=null||i.returned===true)bad('extraction_record_mismatch',id);
   }
   closed=t.closedStacks;
  }else if(t.kilograms!=null||frameEvents.length)bad('installation_must_not_record_harvest',id);
  current=next;
 }
 if(linked.some(x=>!extractionIds.has(x.e.id)))bad('orphan_or_legacy_partial_extraction');
 if(!eq(current,stack(layout?.honeyStack)))bad('current_stack_mismatch');
 if(current===null&&!eq(closed,actualClosed()))bad('current_closure_mismatch');
 return {errors,hasCycles:true};
}

function inspect(state,deps={}){
 const errors=[],records=state?.sectionalTechProcesses;
 const add=(code,details={})=>errors.push({code,details});
 if(!Array.isArray(records)){
  if(Number(state?.meta?.schemaVersion||0)>=15)add('sectional_tech_processes_required');
  return errors;
 }
 const ids=new Set(),hives=new Set(),hiveRows=rows(state?.hives),layouts=rows(state?.sectionalLayouts);
 for(let index=0;index<records.length;index++){
  const record=records[index];
  if(!isObject(record)){add('sectional_tech_process_invalid',{index});continue}
  if(!nonEmpty(record.id)){add('sectional_tech_process_id_invalid',{index});continue}
  if(ids.has(record.id))add('sectional_tech_process_id_duplicate',{id:record.id,index});
  ids.add(record.id);
  if(!nonEmpty(record.hiveId)||!hiveRows.some(hive=>hive?.id===record.hiveId))add('sectional_tech_process_hive_missing',{id:record.id,hiveId:record.hiveId??null});
  if(hives.has(record.hiveId))add('sectional_tech_process_hive_duplicate',{hiveId:record.hiveId});
  hives.add(record.hiveId);
  if(record.modelVersion!==MODEL_VERSION)add('sectional_tech_process_model_version_invalid',{id:record.id,modelVersion:record.modelVersion??null});
  if(record.profileId!==PROFILE_ID)add('sectional_tech_process_profile_invalid',{id:record.id,profileId:record.profileId??null});
  if(!validDate(record.createdAt)||!validDate(record.updatedAt))add('sectional_tech_process_timestamp_invalid',{id:record.id});
  const statePart=record.state;
  if(!isObject(statePart)){add('sectional_tech_process_state_invalid',{id:record.id});continue}
  if(statePart.phase!=='DIVIDED_3_SECTIONS')add('sectional_tech_process_phase_invalid',{id:record.id,phase:statePart.phase??null});
  const layout=layouts.find(row=>row?.id===statePart.layoutId&&row?.hiveId===record.hiveId);
  if(!layout||layout.mode!=='SIDE_BY_SIDE')add('sectional_tech_process_layout_missing',{id:record.id,layoutId:statePart.layoutId??null});
  const sections=rows(statePart.sections);
  if(sections.length!==3)add('sectional_tech_process_sections_invalid',{id:record.id,count:sections.length});
  if(layout&&sections.length===3){
   const expected=rows(layout.sections);
   for(const section of sections){
    const actual=expected.find(row=>row?.id===section?.sectionId);
    if(!actual||actual.familyId!==section.familyId||JSON.stringify(actual.broodBodyIds)!==JSON.stringify(section.bodyIds))
     add('sectional_tech_process_section_mismatch',{id:record.id,sectionId:section?.sectionId??null});
   }
  }
  const operations=rows(statePart.operations),op04=operations.filter(row=>row?.operationId==='OP-04'),stageRows=layout?.broodRows??2;
  const operation=op04[0];
  const pending=op04.length===1&&operation?.status==='IN_PROGRESS'&&stageRows===1&&statePart.rowStage===1&&validDate(operation.startedAt)&&operation.completedAt==null;
  const completed=op04.length===1&&operation?.status==='DONE'&&stageRows===2&&(statePart.rowStage==null||statePart.rowStage===2)&&validDate(operation.completedAt);
  if(!pending&&!completed)add('sectional_tech_process_op04_stage_invalid',{id:record.id,stageRows,status:operation?.status??null});
  const op05Rows=operations.filter(row=>row?.operationId==='OP-05'),op05=op05Rows[0],installedPlugs=rows(layout?.temporaryQueenIsolation),op06=operations.find(row=>row?.operationId==='OP-06'&&row.status==='DONE');
  if(op05Rows.length>1)add('sectional_tech_process_op05_duplicate',{id:record.id,count:op05Rows.length});
  if(op05Rows.length===0&&installedPlugs.length)add('sectional_tech_process_op05_layout_without_operation',{id:record.id});
  if(op05Rows.length===1){
   if(!completed)add('sectional_tech_process_op05_requires_completed_op04',{id:record.id});
   if(op05.status!=='DONE'||!validDate(op05.completedAt))add('sectional_tech_process_op05_status_invalid',{id:record.id,status:op05.status??null});
   if(validDate(op05.completedAt)&&validDate(operation?.completedAt)&&Date.parse(op05.completedAt)<Date.parse(operation.completedAt))add('sectional_tech_process_op05_precedes_op04_completion',{id:record.id});
   if(op05.evidence?.layoutId!==statePart.layoutId)add('sectional_tech_process_op05_layout_evidence_mismatch',{id:record.id});
   if(op05.evidence?.standLevelConfirmed!==true)add('sectional_tech_process_op05_level_stand_confirmation_missing',{id:record.id});
   const historicalPlugs=op06?rows(op06.evidence?.removedPlugs):installedPlugs;
   const layoutAtOP05=op06?{...layout,temporaryQueenIsolation:historicalPlugs}:layout;
   const coverageErrors=deps.PasekaSectionalPhysicalLayout?.validateTemporaryQueenIsolationCoverage?.(layoutAtOP05)||[{code:'temporary_queen_coverage_validator_missing'}];
   for(const error of coverageErrors)add('sectional_tech_process_'+error.code,{id:record.id,details:error.details??null});
   const itemIds=historicalPlugs.map(row=>row?.itemId).sort(),openingIds=historicalPlugs.map(row=>row?.openingId).sort();
   if(JSON.stringify(itemIds)!==JSON.stringify(rows(op05.evidence?.installedItemIds).slice().sort())||JSON.stringify(openingIds)!==JSON.stringify(rows(op05.evidence?.openingIds).slice().sort()))add('sectional_tech_process_op05_evidence_mismatch',{id:record.id});
   const movementEvidence=rows(op05.evidence?.itemMovementEventIds);
   if(movementEvidence.length!==historicalPlugs.length)add('sectional_tech_process_op05_movement_evidence_count_invalid',{id:record.id});
   for(const plug of historicalPlugs){
    const evidence=movementEvidence.find(row=>row?.itemId===plug?.itemId),item=state.equipmentInventory?.items?.[plug?.itemId];
    const event=rows(item?.events).find(row=>row?.id===evidence?.eventId),globalEvent=rows(state.equipmentInventory?.itemEvents).find(row=>row?.id===evidence?.eventId&&row?.itemId===plug?.itemId);
    const target={type:'hive',hiveId:record.hiveId,bodyId:plug?.bodyId,openingId:plug?.openingId};
    if(!evidence||!event||!globalEvent||event.type!=='moved'||event.at!==op05.completedAt||event.from?.type!=='storage'||!sameLocation(event.to,target))add('sectional_tech_process_op05_movement_evidence_invalid',{id:record.id,itemId:plug?.itemId??null});
   }
   const days=calendarDayDifference(op05.completedAt,operation?.startedAt);
   if(days==null||days<8||days>11||op05.evidence?.daysAfterDivision!==days)add('sectional_tech_process_op05_timing_invalid',{id:record.id,daysAfterDivision:days,evidenceDays:op05.evidence?.daysAfterDivision??null});
  }
  const op06Rows=operations.filter(row=>row?.operationId==='OP-06');
  if(op06Rows.length>1)add('sectional_tech_process_op06_duplicate',{id:record.id,count:op06Rows.length});
  if(op06Rows.length===1){
   if(!completed||op06.status!=='DONE'||!validDate(op06.completedAt))add('sectional_tech_process_op06_status_invalid',{id:record.id});
   if(validDate(op06.completedAt)&&validDate(operation?.startedAt)){
    const days=calendarDayDifference(op06.completedAt,operation.startedAt);
    if(days!==20&&days!==21)add('sectional_tech_process_op06_timing_invalid',{id:record.id,days});
    if(op06.evidence?.daysAfterDivision!==days)add('sectional_tech_process_op06_timing_evidence_mismatch',{id:record.id,days});
   }
   const families=sections.map(section=>state.families?.find(row=>row?.id===section.familyId));
   const splitId=operation?.evidence?.familyEventId;
   for(const family of families){
    const queen=state.queens?.find(row=>row?.id===family?.currentQueenId);
    const observed=rows(state.queenEvents).some(event=>event?.type==='laying_observed'&&event.userConfirmed===true&&event.familyId===family?.id&&event.queenId===queen?.id&&event.splitEventId===splitId&&event.techProcessId===record.id&&validDate(event.occurredAt)&&Date.parse(event.occurredAt)<=Date.parse(op06.completedAt));
    if(!family||family.recordStatus==='historical'||family.queenIdentityStatus!=='identified'||!queen||queen.status!=='current'||queen.familyId!==family.id||!observed)add('sectional_tech_process_op06_queen_laying_evidence_missing',{id:record.id,familyId:family?.id??null});
   }
   const removed=rows(op06.evidence?.removedPlugs),removedIds=removed.map(row=>row?.itemId).sort();
   if(JSON.stringify(removedIds)!==JSON.stringify(rows(op06.evidence?.removedItemIds).slice().sort()))add('sectional_tech_process_op06_removed_plug_evidence_mismatch',{id:record.id});
   if(removed.length!==0&&removed.length!==8)add('sectional_tech_process_op06_removed_plug_count_invalid',{id:record.id,count:removed.length});
   if(op06.evidence?.layoutId!==statePart.layoutId)add('sectional_tech_process_op06_layout_evidence_mismatch',{id:record.id});
   if(removed.length===0&&op06.evidence?.noPlugsInstalledConfirmed!==true)add('sectional_tech_process_op06_no_plugs_confirmation_missing',{id:record.id});
   if(removed.length===0&&op05Rows.length!==0)add('sectional_tech_process_op06_no_plugs_conflicts_with_op05',{id:record.id});
   if(removed.length>0&&(op06.evidence?.noPlugsInstalledConfirmed===true||op05Rows.length!==1))add('sectional_tech_process_op06_conflicting_plug_evidence',{id:record.id});
   for(const plug of removed){
    const item=state.equipmentInventory?.items?.[plug.itemId],evidence=rows(op06.evidence?.itemMovementEventIds).find(row=>row?.itemId===plug.itemId);
    const event=rows(item?.events).find(row=>row?.id===evidence?.eventId),globalEvent=rows(state.equipmentInventory?.itemEvents).find(row=>row?.id===evidence?.eventId&&row?.itemId===plug.itemId);
    if(!item||item.kind!=='metalMeshPlug'||item.location?.type!=='storage'||!event||!globalEvent||event.type!=='moved_to_storage'||event.at!==op06.completedAt||event.from?.type!=='hive'||event.to?.type!=='storage')add('sectional_tech_process_op06_plug_removal_evidence_invalid',{id:record.id,itemId:plug.itemId??null});
   }
   if(removed.length!==rows(op06.evidence?.itemMovementEventIds).length)add('sectional_tech_process_op06_movement_evidence_count_invalid',{id:record.id});
   if(rows(layout?.temporaryQueenIsolation).length)add('sectional_tech_process_op06_plugs_still_installed',{id:record.id});
  }
  const lateRows=operations.filter(row=>row?.operationId==='OP-07-HONEY-PAIR-ADD'),late=lateRows[0];
  if(lateRows.length>1)add('sectional_late_honey_pair_duplicate',{id:record.id,count:lateRows.length});
  if(late&&!operations.some(row=>row?.operationId==='OP-07'))add('sectional_late_honey_pair_op07_missing',{id:record.id});
  const op07Rows=operations.filter(row=>row?.operationId==='OP-07'),op07=op07Rows[0];
  if(op07Rows.length>1)add('sectional_tech_process_op07_duplicate',{id:record.id,count:op07Rows.length});
  if(op07Rows.length===1){
   if(!completed||op07.status!=='DONE'||!validDate(op07.completedAt))add('sectional_tech_process_op07_status_invalid',{id:record.id});
   const honey=layout?.honeyStack,bodyIds=rows(honey?.bodyIds).slice().sort(),excluders=rows(honey?.excluders);
   const initialHoneyIds=rows(op07.evidence?.honeyBodyIds);
   const addedHoneyIds=late?rows(late.evidence?.addedBodyIds):[];
   const expectedHoneyIds=late?[...initialHoneyIds,...addedHoneyIds]:initialHoneyIds;
   const cycles=inspectHoneyCycles(state,record,layout,expectedHoneyIds,op07.evidence?.excluderItemIds,op07.evidence?.honeyPurpose,late?.completedAt||op07.completedAt);
   errors.push(...cycles.errors);
   if(!cycles.hasCycles&&(!honey||JSON.stringify(bodyIds)!==JSON.stringify(expectedHoneyIds.slice().sort())||JSON.stringify(excluders.map(row=>row?.itemId).sort())!==JSON.stringify(rows(op07.evidence?.excluderItemIds).slice().sort())))add('sectional_tech_process_op07_layout_evidence_mismatch',{id:record.id});
   if(JSON.stringify(honeyFrameCompositionEvidence(Object.fromEntries(initialHoneyIds.map(bodyId=>[bodyId,rows(state.equipmentInventory?.bodies?.[bodyId]?.frames)]))))!==JSON.stringify(op07.evidence?.frameComposition))add('sectional_tech_process_op07_frame_composition_evidence_invalid',{id:record.id});
   if(late){
    if(late.status!=='DONE'||!validDate(late.completedAt)||Date.parse(late.completedAt)<Date.parse(op07.completedAt))add('sectional_late_honey_pair_timestamp_invalid',{id:record.id});
    if((!cycles.hasCycles&&(honey?.purpose!=='main'||bodyIds.length!==4||JSON.stringify(rows(honey?.bodyIds))!==JSON.stringify(expectedHoneyIds)))||op07.evidence?.honeyPurpose!=='main'||initialHoneyIds.length!==2||addedHoneyIds.length!==2||new Set(expectedHoneyIds).size!==4||JSON.stringify(rows(late.evidence?.previousBodyIds))!==JSON.stringify(initialHoneyIds)||JSON.stringify(rows(late.evidence?.honeyBodyIds))!==JSON.stringify(expectedHoneyIds))add('sectional_late_honey_pair_evidence_invalid',{id:record.id});
    const addedFrames=Object.fromEntries(addedHoneyIds.map(bodyId=>[bodyId,rows(state.equipmentInventory?.bodies?.[bodyId]?.frames)]));
    if(JSON.stringify(honeyFrameCompositionEvidence(addedFrames))!==JSON.stringify(late.evidence?.frameComposition))add('sectional_late_honey_pair_frame_composition_invalid',{id:record.id});
    const pairIds=addedHoneyIds.map(id=>state.equipmentInventory?.bodies?.[id]?.pairId);
    if(!pairIds.every(nonEmpty)||pairIds[0]!==pairIds[1]||initialHoneyIds.some(id=>state.equipmentInventory?.bodies?.[id]?.pairId===pairIds[0]))add('sectional_late_honey_pair_inventory_pair_invalid',{id:record.id});
    for(const bodyId of addedHoneyIds){
     const body=state.equipmentInventory?.bodies?.[bodyId];
     const local=rows(body?.events).filter(event=>event?.operationId==='OP-07-HONEY-PAIR-ADD'&&event?.type==='placed'&&event?.at===late.completedAt);
     const global=rows(state.equipmentInventory?.events).filter(event=>event?.bodyId===bodyId&&event?.operationId==='OP-07-HONEY-PAIR-ADD'&&event?.type==='sectional_body_placed'&&event?.at===late.completedAt);
     if(local.length!==1||global.length!==1||local[0]?.from?.type!=='storage'||local[0]?.to?.bodyRole!=='honey'||JSON.stringify(local[0]?.from)!==JSON.stringify(global[0]?.from)||JSON.stringify(local[0]?.to)!==JSON.stringify(global[0]?.to))add('sectional_late_honey_pair_body_history_invalid',{id:record.id,bodyId});
    }
   }
   if(honey?.purpose==='early'){
    for(const bodyId of rows(honey.bodyIds)){
     const frameErrors=earlyHoneyFrameCompositionErrors(state.equipmentInventory?.bodies?.[bodyId]?.frames);
     if(frameErrors.length)add('sectional_tech_process_op07_early_honey_frame_composition_invalid',{id:record.id,bodyId,errors:frameErrors});
    }
   }
   if(!['AFTER_OP06','WITH_SECOND_ROW','APPROX_12_DAYS_AFTER_SECOND_ROW'].includes(op07.evidence?.timingMode))add('sectional_tech_process_op07_timing_mode_invalid',{id:record.id});
   const secondRowAt=operation?.evidence?.secondRowAt||operation?.completedAt;
   const actualDaysAfterSecondRow=calendarDayDifference(op07.completedAt,secondRowAt);
   if(actualDaysAfterSecondRow==null||op07.evidence?.daysAfterSecondRow!==actualDaysAfterSecondRow)add('sectional_tech_process_op07_timing_evidence_mismatch',{id:record.id,actualDaysAfterSecondRow,evidenceDays:op07.evidence?.daysAfterSecondRow??null});
   if(op07.evidence?.timingMode==='WITH_SECOND_ROW'&&actualDaysAfterSecondRow!==0)add('sectional_tech_process_op07_immediate_timing_invalid',{id:record.id,actualDaysAfterSecondRow});
   if(op07.evidence?.timingMode==='APPROX_12_DAYS_AFTER_SECOND_ROW'&&(actualDaysAfterSecondRow==null||actualDaysAfterSecondRow<12||actualDaysAfterSecondRow>15))add('sectional_tech_process_op07_delayed_timing_invalid',{id:record.id,actualDaysAfterSecondRow,minimum:12,maximum:15});
   const removedAccessories=rows(op07.evidence?.removedStackAccessories),expectedRemoved=removedAccessories.map(row=>row?.itemId).sort();
   const excluderIds=rows(op07.evidence?.excluderItemIds).slice().sort(),removedEvidence=rows(op07.evidence?.itemMovementEventIds);
   const expectedMovementIds=[...expectedRemoved,...excluderIds].sort();
   const evidenceIds=removedEvidence.map(row=>row?.itemId).sort(),eventIds=removedEvidence.map(row=>row?.eventId);
   const accessoryKinds=new Map(),stackAccessoryCounts=new Map(),stackIds=new Set(rows(layout?.stacks).map(row=>row?.id));
   for(const row of removedAccessories){
    const item=state.equipmentInventory?.items?.[row?.itemId];
    const count=accessoryKinds.get(row?.kind)||0;accessoryKinds.set(row?.kind,count+1);
    if(!nonEmpty(row?.itemId)||!['cover','topRiser'].includes(row?.kind)||!item||item.kind!==row.kind||(!cycles.hasCycles&&item.location?.type!=='storage'))add('sectional_tech_process_op07_removed_accessory_invalid',{id:record.id,itemId:row?.itemId??null,kind:row?.kind??null});
   }
   if(expectedRemoved.length!==6||new Set(expectedRemoved).size!==6||accessoryKinds.get('cover')!==3||accessoryKinds.get('topRiser')!==3||excluderIds.length!==2||new Set(excluderIds).size!==2||JSON.stringify(expectedMovementIds)!==JSON.stringify(evidenceIds)||removedEvidence.length!==8||new Set(eventIds).size!==8||eventIds.some(id=>!nonEmpty(id)))add('sectional_tech_process_op07_movement_evidence_count_invalid',{id:record.id});
   const layoutTargets=newLayoutTargets(layout).targets;
   for(const evidence of removedEvidence){
    const item=state.equipmentInventory?.items?.[evidence?.itemId],event=rows(item?.events).find(row=>row?.id===evidence?.eventId),globalEvent=rows(state.equipmentInventory?.itemEvents).find(row=>row?.id===evidence?.eventId&&row?.itemId===evidence?.itemId);
    const accessory=removedAccessories.find(row=>row?.itemId===evidence?.itemId),target=layoutTargets.get(evidence?.itemId);
    let valid=!!item&&!!event&&!!globalEvent&&event.at===op07.completedAt&&JSON.stringify(event)===JSON.stringify(globalEvent);
    if(accessory){
     const stackId=event?.from?.stackId,counts=stackAccessoryCounts.get(stackId)||{cover:0,topRiser:0};
     if(accessory.kind==='cover')counts.cover++;if(accessory.kind==='topRiser')counts.topRiser++;stackAccessoryCounts.set(stackId,counts);
     valid=valid&&item.kind===accessory.kind&&(cycles.hasCycles||item.location?.type==='storage')&&event.type==='moved_to_storage'&&event.from?.type==='hive'&&event.from?.hiveId===record.hiveId&&stackIds.has(stackId)&&event.to?.type==='storage'&&nonEmpty(event.to?.label);
    }else{
     valid=valid&&excluderIds.includes(evidence?.itemId)&&item.kind==='honeyQueenExcluder'&&event.type==='moved'&&event.from?.type==='storage'&&event.to?.type==='hive'&&event.to?.hiveId===record.hiveId&&(cycles.hasCycles?Array.isArray(event.to?.footprint)&&event.to.footprint.length===2:target?.type==='hive'&&item.location?.type==='hive'&&sameLocation(item.location,target)&&sameLocation(event.to,target));
    }
    if(!valid)add('sectional_tech_process_op07_item_movement_evidence_invalid',{id:record.id,itemId:evidence?.itemId??null});
   }
   if(stackAccessoryCounts.size!==3||[...stackIds].some(stackId=>{const count=stackAccessoryCounts.get(stackId);return !count||count.cover!==1||count.topRiser!==1}))add('sectional_tech_process_op07_stack_accessory_history_invalid',{id:record.id});
   const honeyBodies=initialHoneyIds;
   for(const bodyId of honeyBodies){
    const body=state.equipmentInventory?.bodies?.[bodyId],bodyEvent=rows(body?.events).find(row=>row?.operationId==='OP-07'&&row?.type==='placed'&&row?.at===op07.completedAt),event=rows(state.equipmentInventory?.events).find(row=>row?.bodyId===bodyId&&row?.operationId==='OP-07'&&row?.type==='sectional_body_placed'&&row?.at===op07.completedAt);
    if(!body||body.kind!=='honey'||!bodyEvent||bodyEvent.from?.type!=='storage'||bodyEvent.to?.bodyRole!=='honey'||!event||event.from?.type!=='storage'||event.to?.bodyRole!=='honey'||JSON.stringify(bodyEvent.from)!==JSON.stringify(event.from)||JSON.stringify(bodyEvent.to)!==JSON.stringify(event.to))add('sectional_tech_process_op07_honey_body_history_invalid',{id:record.id,bodyId});
   }
   if(op07.evidence?.timingMode==='AFTER_OP06'){
    const completedOp06=operations.find(row=>row?.operationId==='OP-06'&&row.status==='DONE');
    if(!completedOp06||Date.parse(op07.completedAt)<Date.parse(completedOp06.completedAt))add('sectional_tech_process_op07_op06_dependency_invalid',{id:record.id});
   }
  }
  if(deps.PasekaFamilyLineage?.validateOperationEvidence&&op04.length===1&&(pending||completed)){
   for(const error of deps.PasekaFamilyLineage.validateOperationEvidence(state,record,'OP-04'))add('sectional_tech_process_'+error.code,{id:record.id,details:error.details??null});
  }
 }
 return errors;
}
function completeOP04(state,request,deps={}){
 const fail=(error,details)=>({ok:false,error,details:details??null});
 if(!isObject(state)||!isObject(request))return fail('invalid_request');
 if(request.userConfirmed!==true)return fail('user_confirmation_required');
 if(!nonEmpty(request.hiveId)||!nonEmpty(request.sourceFamilyId)||!nonEmpty(request.techProcessId))return fail('required_identifiers_missing');
 if(!validDate(request.occurredAt))return fail('invalid_operation_timestamp');
 if(timestampIsFuture(request.occurredAt,deps))return fail('operation_timestamp_in_future');
 if(typeof deps.makeId!=='function')return fail('id_generator_required');
 const required=['PasekaFamilyLineage','PasekaSectionalPhysicalLayout','PasekaEquipmentItems','PasekaInventory','PasekaLabels'];
 for(const key of required)if(!deps[key])return fail('dependency_missing',{dependency:key});
 if(typeof deps.PasekaFamilyLineage.applySplit!=='function'||typeof deps.PasekaFamilyLineage.validateOperationEvidence!=='function'||typeof deps.PasekaFamilyLineage.inspect!=='function'||typeof deps.PasekaSectionalPhysicalLayout.inspect!=='function'||typeof deps.PasekaEquipmentItems.place!=='function'||typeof deps.PasekaEquipmentItems.inspect!=='function'||typeof deps.PasekaEquipmentItems.validateReferences!=='function'||typeof deps.PasekaInventory.inspect!=='function'||typeof deps.PasekaLabels.normalizeCode!=='function')return fail('dependency_api_incomplete');
 if(!Array.isArray(state.sectionalTechProcesses)||Number(state.meta?.schemaVersion||0)<15)return fail('sectional_tech_process_schema_not_ready');
 const hive=rows(state.hives).find(row=>row?.id===request.hiveId);
 if(!hive||hive.profileId!==PROFILE_ID)return fail('sectional_profile_not_active_or_hive_missing');
 const source=rows(state.families).find(row=>row?.id===request.sourceFamilyId);
 if(!source||source.hive!==request.hiveId||source.recordStatus==='historical')return fail('source_family_missing_or_historical');
 if(source.box!=null||Object.values(state.layouts||{}).some(layout=>Object.values(layout?.boxes||{}).some(box=>box?.family===source.id)))
  return fail('legacy_physical_placement_requires_manual_reconciliation');
 const sourceLayouts=rows(state.sectionalLayouts).filter(row=>row?.hiveId===request.hiveId);
 if(sourceLayouts.length!==1||sourceLayouts[0]?.mode!=='SINGLE_FAMILY'||rows(sourceLayouts[0]?.sections).length!==1||sourceLayouts[0]?.sections[0]?.familyId!==source.id)
  return fail('single_family_source_layout_required');
 const oldLayout=sourceLayouts[0],nextLayout=request.layout;
 if(!isObject(nextLayout)||nextLayout.id!==oldLayout.id||nextLayout.hiveId!==request.hiveId||nextLayout.profileId!==PROFILE_ID||nextLayout.mode!=='SIDE_BY_SIDE')
  return fail('target_side_by_side_layout_invalid');
 if(rows(nextLayout.sections).length!==3||rows(nextLayout.stacks).length!==3||rows(nextLayout.technicalConnections).length!==2)
  return fail('target_layout_shape_invalid');
 if(rows(nextLayout.temporaryQueenIsolation).length||rows(nextLayout.closedOpenings).length||rows(nextLayout.meshDiaphragms).length||nextLayout.honeyStack)
  return fail('op04_target_contains_later_stage_equipment');
 const children=rows(request.resultFamilies),childIds=children.map(row=>row?.id);
 if(children.length!==3||childIds.some(id=>!nonEmpty(id))||new Set(childIds).size!==3)
  return fail('split_result_families_invalid');
 if(new Set(rows(nextLayout.sections).map(row=>row?.familyId)).size!==3||rows(nextLayout.sections).some(row=>!childIds.includes(row?.familyId)))
  return fail('target_section_family_mapping_invalid');
 const targetBroodRows=nextLayout.broodRows??2;
 if(![1,2].includes(targetBroodRows)||rows(nextLayout.sections).some(section=>rows(section?.broodBodyIds).length!==targetBroodRows))return fail('target_section_body_count_invalid');
 if(state.sectionalTechProcesses.some(row=>row?.hiveId===request.hiveId||row?.id===request.techProcessId))return fail('tech_process_already_exists');
 const initialErrors=[...deps.PasekaInventory.inspect(state,deps.PasekaLabels,deps.profileForHive),...deps.PasekaEquipmentItems.inspect(state),...deps.PasekaEquipmentItems.validateReferences(state),...deps.PasekaSectionalPhysicalLayout.inspect(state),...deps.PasekaFamilyLineage.inspect(state),...inspect(state,deps)];
 if(initialErrors.length)return fail('op04_initial_state_invalid',initialErrors);
 const bodyPlan=planBodyMoves(state,oldLayout,nextLayout,request.bodyStorageMoves);
 if(bodyPlan.errors.length)return fail('body_move_plan_invalid',bodyPlan.errors);
 const plan=planItemMoves(state,oldLayout,nextLayout,request.itemMoves);
 if(plan.errors.length)return fail('equipment_move_plan_invalid',plan.errors);
 let draft;try{draft=clone(state)}catch(error){return fail('clone_failed',{message:error.message})}
 draft.sectionalLayouts=rows(draft.sectionalLayouts).filter(row=>row?.id!==oldLayout.id);
 const split=deps.PasekaFamilyLineage.applySplit(draft,{
  sourceFamilyId:request.sourceFamilyId,resultFamilies:children,operationId:'OP-04',techProcessId:request.techProcessId,
  occurredAt:request.occurredAt,scenario:'THREE_SECTION_SIDE_BY_SIDE'
 },deps.makeId,request.occurredAt);
 if(!split?.ok)return fail('family_split_rejected',{cause:split?.error??null,details:split?.details??null});
 draft.sectionalLayouts.push(clone(nextLayout));
 const bodyHistory=appendBodyMovementHistory(draft,oldLayout,nextLayout,bodyPlan.storageById,request.occurredAt,deps.makeId,'OP-04',deps.PasekaLabels);
 if(!bodyHistory.ok)return fail(bodyHistory.error,bodyHistory.details);
 for(const id of bodyPlan.newIds)delete draft.equipmentInventory.bodies[id].storageLocation;
 for(const [id,location] of bodyPlan.storageById)draft.equipmentInventory.bodies[id].storageLocation=location;
 for(const move of plan.moves){
  const result=deps.PasekaEquipmentItems.place(draft,{itemId:move.itemId,location:move.location},deps.makeId,request.occurredAt);
  if(!result?.ok)return fail('equipment_move_rejected',{itemId:move.itemId,cause:result?.error??null,details:result?.details??null});
 }
 const record={
  id:request.techProcessId,hiveId:request.hiveId,profileId:PROFILE_ID,modelVersion:MODEL_VERSION,
  createdAt:request.occurredAt,updatedAt:request.occurredAt,
  state:{
   phase:'DIVIDED_3_SECTIONS',layoutId:nextLayout.id,sourceFamilyId:source.id,isolationStatus:'CONNECTED',rowStage:targetBroodRows,
   sections:rows(nextLayout.sections).map(section=>({sectionId:section.id,position:section.position,familyId:section.familyId,bodyIds:section.broodBodyIds.slice(),upperBodyId:section.upperBroodBodyId})),
   operations:[{operationId:'OP-04',status:targetBroodRows===2?'DONE':'IN_PROGRESS',startedAt:request.occurredAt,...(targetBroodRows===2?{completedAt:request.occurredAt}:{completedAt:null}),evidence:{familyEventId:split.event.id,layoutId:nextLayout.id}}]
  }
 };
 draft.sectionalTechProcesses.push(record);
 const validationErrors=[
  ...deps.PasekaInventory.inspect(draft,deps.PasekaLabels,deps.profileForHive),
  ...deps.PasekaEquipmentItems.inspect(draft),
  ...deps.PasekaEquipmentItems.validateReferences(draft),
  ...deps.PasekaSectionalPhysicalLayout.inspect(draft),
  ...deps.PasekaFamilyLineage.inspect(draft),
  ...deps.PasekaFamilyLineage.validateOperationEvidence(draft,record,'OP-04'),
  ...inspect(draft,deps)
 ];
 if(validationErrors.length)return fail('op04_transaction_validation_failed',validationErrors);
 const audit=appendOperationAudit(draft,record,split.event,deps.makeId);
 if(!audit.ok)return fail(audit.error,audit.details);
 commit(state,draft);
 return {ok:true,record:state.sectionalTechProcesses.find(row=>row?.id===record.id),event:state.familyEvents.find(row=>row?.id===split.event.id)};
}

function completeOP04SecondRow(state,request,deps={}){
 const fail=(error,details)=>({ok:false,error,details:details??null});
 if(!isObject(state)||!isObject(request))return fail('invalid_request');
 if(request.userConfirmed!==true)return fail('user_confirmation_required');
 if(!nonEmpty(request.hiveId)||!nonEmpty(request.techProcessId))return fail('required_identifiers_missing');
 if(!validDate(request.occurredAt))return fail('invalid_operation_timestamp');
 if(timestampIsFuture(request.occurredAt,deps))return fail('operation_timestamp_in_future');
 if(typeof deps.makeId!=='function')return fail('id_generator_required');
 const required=['PasekaFamilyLineage','PasekaSectionalPhysicalLayout','PasekaEquipmentItems','PasekaInventory','PasekaLabels'];
 for(const key of required)if(!deps[key])return fail('dependency_missing',{dependency:key});
 if(typeof deps.PasekaFamilyLineage.validateOperationEvidence!=='function'||typeof deps.PasekaFamilyLineage.inspect!=='function'||typeof deps.PasekaSectionalPhysicalLayout.inspect!=='function'||typeof deps.PasekaEquipmentItems.place!=='function'||typeof deps.PasekaEquipmentItems.inspect!=='function'||typeof deps.PasekaEquipmentItems.validateReferences!=='function'||typeof deps.PasekaInventory.inspect!=='function')return fail('dependency_api_incomplete');
 const records=rows(state.sectionalTechProcesses),record=records.find(row=>row?.id===request.techProcessId&&row?.hiveId===request.hiveId);
 if(!record)return fail('op04_tech_process_missing');
 const operation=rows(record.state?.operations).find(row=>row?.operationId==='OP-04');
 if(operation?.status!=='IN_PROGRESS'||record.state?.rowStage!==1)return fail('op04_second_row_not_pending');
 if(!validDate(operation.startedAt)||Date.parse(request.occurredAt)<Date.parse(operation.startedAt))return fail('op04_second_row_precedes_first_row');
 const hive=rows(state.hives).find(row=>row?.id===request.hiveId);
 if(!hive||hive.profileId!==PROFILE_ID)return fail('sectional_profile_not_active_or_hive_missing');
 const sourceLayouts=rows(state.sectionalLayouts).filter(row=>row?.hiveId===request.hiveId);
 if(sourceLayouts.length!==1)return fail('op04_current_layout_missing');
 const oldLayout=sourceLayouts[0],nextLayout=request.layout;
 if(oldLayout.id!==record.state.layoutId||oldLayout.mode!=='SIDE_BY_SIDE'||(oldLayout.broodRows??2)!==1)return fail('op04_first_row_layout_required');
 if(!isObject(nextLayout)||nextLayout.id!==oldLayout.id||nextLayout.hiveId!==request.hiveId||nextLayout.profileId!==PROFILE_ID||nextLayout.mode!=='SIDE_BY_SIDE'||(nextLayout.broodRows??2)!==2)return fail('op04_second_row_layout_invalid');
 if(rows(nextLayout.sections).length!==3||rows(nextLayout.stacks).length!==3||rows(nextLayout.technicalConnections).length!==2)return fail('target_layout_shape_invalid');
 if(rows(nextLayout.temporaryQueenIsolation).length||rows(nextLayout.closedOpenings).length||rows(nextLayout.meshDiaphragms).length||nextLayout.honeyStack)return fail('op04_target_contains_later_stage_equipment');
 const oldSections=rows(oldLayout.sections),newSections=rows(nextLayout.sections);
 const addedBodyIds=[];
 for(const oldSection of oldSections){
  const next=newSections.find(row=>row?.id===oldSection?.id);
  if(!next||next.familyId!==oldSection.familyId||next.position!==oldSection.position)return fail('op04_second_row_section_identity_mismatch',{sectionId:oldSection?.id??null});
  const previous=rows(oldSection.broodBodyIds),current=rows(next.broodBodyIds);
  if(previous.length!==1||current.length!==2||!current.includes(previous[0]))return fail('op04_second_row_body_extension_invalid',{sectionId:oldSection.id,previous,current});
  addedBodyIds.push(...current.filter(id=>!previous.includes(id)));
 }
 const suppliedAdded=rows(request.addedBodyIds);
 if(addedBodyIds.length!==3||new Set(addedBodyIds).size!==3||suppliedAdded.length!==3||new Set(suppliedAdded).size!==3||addedBodyIds.some(id=>!suppliedAdded.includes(id))||suppliedAdded.some(id=>!addedBodyIds.includes(id)))return fail('op04_second_row_added_bodies_mismatch',{expected:addedBodyIds,provided:suppliedAdded});
 for(const bodyId of addedBodyIds){
  const body=state.equipmentInventory?.bodies?.[bodyId];
  if(!isObject(body)||body.kind!=='brood'||body.condition!=='good'||body.spec?.profileId!==PROFILE_ID||body.spec?.framesPerBox!==6||!nonEmpty(body.storageLocation))return fail('op04_second_row_body_not_in_storage',{bodyId});
 }
 const familyIds=rows(record.state.sections).map(row=>row?.familyId);
 if(new Set(newSections.map(row=>row?.familyId)).size!==3||newSections.some(row=>!familyIds.includes(row?.familyId)))return fail('target_section_family_mapping_invalid');
 const initialErrors=[...deps.PasekaInventory.inspect(state,deps.PasekaLabels,deps.profileForHive),...deps.PasekaEquipmentItems.inspect(state),...deps.PasekaEquipmentItems.validateReferences(state),...deps.PasekaSectionalPhysicalLayout.inspect(state),...deps.PasekaFamilyLineage.inspect(state),...inspect(state,deps)];
 if(initialErrors.length)return fail('op04_second_row_initial_state_invalid',initialErrors);
 const bodyPlan=planBodyMoves(state,oldLayout,nextLayout,[]);
 if(bodyPlan.errors.length)return fail('body_move_plan_invalid',bodyPlan.errors);
 const itemPlan=planItemMoves(state,oldLayout,nextLayout,request.itemMoves);
 if(itemPlan.errors.length)return fail('equipment_move_plan_invalid',itemPlan.errors);
 let draft;try{draft=clone(state)}catch(error){return fail('clone_failed',{message:error.message})}
 draft.sectionalLayouts=rows(draft.sectionalLayouts).filter(row=>row?.id!==oldLayout.id);
 draft.sectionalLayouts.push(clone(nextLayout));
 const bodyHistory=appendBodyMovementHistory(draft,oldLayout,nextLayout,new Map(),request.occurredAt,deps.makeId,'OP-04',deps.PasekaLabels);
 if(!bodyHistory.ok)return fail(bodyHistory.error,bodyHistory.details);
 for(const bodyId of addedBodyIds)delete draft.equipmentInventory.bodies[bodyId].storageLocation;
 for(const move of itemPlan.moves){
  const result=deps.PasekaEquipmentItems.place(draft,{itemId:move.itemId,location:move.location},deps.makeId,request.occurredAt);
  if(!result?.ok)return fail('equipment_move_rejected',{itemId:move.itemId,cause:result?.error??null,details:result?.details??null});
 }
 const nextRecord=draft.sectionalTechProcesses.find(row=>row?.id===request.techProcessId);
 nextRecord.state.rowStage=2;
 nextRecord.state.sections=newSections.map(section=>({sectionId:section.id,position:section.position,familyId:section.familyId,bodyIds:section.broodBodyIds.slice(),upperBodyId:section.upperBroodBodyId}));
 const nextOperation=rows(nextRecord.state.operations).find(row=>row?.operationId==='OP-04');
 nextOperation.status='DONE';
 nextOperation.completedAt=request.occurredAt;
 nextOperation.evidence={...(nextOperation.evidence||{}),secondRowBodyIds:addedBodyIds.slice(),secondRowAt:request.occurredAt};
 nextRecord.updatedAt=request.occurredAt;
 const validationErrors=[
  ...deps.PasekaInventory.inspect(draft,deps.PasekaLabels,deps.profileForHive),
  ...deps.PasekaEquipmentItems.inspect(draft),
  ...deps.PasekaEquipmentItems.validateReferences(draft),
  ...deps.PasekaSectionalPhysicalLayout.inspect(draft),
  ...deps.PasekaFamilyLineage.inspect(draft),
  ...deps.PasekaFamilyLineage.validateOperationEvidence(draft,nextRecord,'OP-04'),
  ...inspect(draft,deps)
 ];
 if(validationErrors.length)return fail('op04_second_row_transaction_validation_failed',validationErrors);
 const splitEvent=draft.familyEvents.find(event=>event?.id===nextOperation.evidence?.familyEventId);
 if(!splitEvent)return fail('op04_family_split_event_missing');
 const audit=appendOperationAudit(draft,nextRecord,splitEvent,deps.makeId);
 if(!audit.ok)return fail(audit.error,audit.details);
 commit(state,draft);
 return {ok:true,record:state.sectionalTechProcesses.find(row=>row?.id===nextRecord.id),event:state.familyEvents.find(row=>row?.id===splitEvent.id)};
}
function completeOP05(state,request,deps={}){
 const fail=(error,details)=>({ok:false,error,details:details??null});
 if(!isObject(state)||!isObject(request))return fail('invalid_request');
 if(request.userConfirmed!==true)return fail('user_confirmation_required');
 if(request.standLevelConfirmed!==true)return fail('op05_level_stand_confirmation_required');
 if(!nonEmpty(request.hiveId)||!nonEmpty(request.techProcessId))return fail('required_identifiers_missing');
 if(!validDate(request.occurredAt))return fail('invalid_operation_timestamp');
 if(timestampIsFuture(request.occurredAt,deps))return fail('operation_timestamp_in_future');
 if(typeof deps.makeId!=='function')return fail('id_generator_required');
 const required=['PasekaSectionalPhysicalLayout','PasekaEquipmentItems','PasekaInventory','PasekaLabels'];
 for(const key of required)if(!deps[key])return fail('dependency_missing',{dependency:key});
 if(typeof deps.PasekaSectionalPhysicalLayout.inspect!=='function'||typeof deps.PasekaSectionalPhysicalLayout.validateTemporaryQueenIsolationCoverage!=='function'||typeof deps.PasekaEquipmentItems.place!=='function'||typeof deps.PasekaEquipmentItems.inspect!=='function'||typeof deps.PasekaEquipmentItems.validateReferences!=='function'||typeof deps.PasekaInventory.inspect!=='function')return fail('dependency_api_incomplete');
 if(!Array.isArray(state.sectionalTechProcesses)||Number(state.meta?.schemaVersion||0)<15)return fail('sectional_tech_process_schema_not_ready');
 const record=rows(state.sectionalTechProcesses).find(row=>row?.id===request.techProcessId&&row?.hiveId===request.hiveId);
 if(!record)return fail('op05_tech_process_missing');
 const op04=rows(record.state?.operations).find(row=>row?.operationId==='OP-04');
 if(op04?.status!=='DONE'||record.state?.rowStage!==2)return fail('op05_requires_completed_op04');
 if(!validDate(op04.completedAt)||Date.parse(request.occurredAt)<Date.parse(op04.completedAt))return fail('op05_precedes_op04_completion');
 if(rows(record.state.operations).some(row=>row?.operationId==='OP-05'))return fail('op05_already_recorded');
 const daysAfterDivision=calendarDayDifference(request.occurredAt,op04.startedAt);
 if(daysAfterDivision==null||daysAfterDivision<8||daysAfterDivision>11)return fail('op05_outside_source_window',{daysAfterDivision,requiredDayRange:[8,11]});
 const hive=rows(state.hives).find(row=>row?.id===request.hiveId);
 if(!hive||hive.profileId!==PROFILE_ID)return fail('sectional_profile_not_active_or_hive_missing');
 const sourceLayouts=rows(state.sectionalLayouts).filter(row=>row?.hiveId===request.hiveId);
 if(sourceLayouts.length!==1)return fail('op05_current_layout_missing');
 const oldLayout=sourceLayouts[0],nextLayout=request.layout;
 if(oldLayout.id!==record.state.layoutId||oldLayout.mode!=='SIDE_BY_SIDE'||(oldLayout.broodRows??2)!==2)return fail('op05_completed_two_row_layout_required');
 if(rows(oldLayout.temporaryQueenIsolation).length)return fail('op05_mesh_plugs_already_installed');
 if(!isObject(nextLayout)||nextLayout.id!==oldLayout.id||nextLayout.hiveId!==request.hiveId||nextLayout.profileId!==PROFILE_ID||nextLayout.mode!=='SIDE_BY_SIDE'||(nextLayout.broodRows??2)!==2)return fail('op05_target_layout_invalid');
 const withoutTemporaryIsolation=layout=>{const copy=clone(layout);delete copy.temporaryQueenIsolation;return copy};
 if(JSON.stringify(withoutTemporaryIsolation(nextLayout))!==JSON.stringify(withoutTemporaryIsolation(oldLayout)))return fail('op05_must_not_change_existing_physical_layout');
 const coverageErrors=deps.PasekaSectionalPhysicalLayout.validateTemporaryQueenIsolationCoverage(nextLayout);
 if(coverageErrors.length)return fail('op05_mesh_plug_coverage_invalid',coverageErrors);
 const plugs=rows(nextLayout.temporaryQueenIsolation),plugIds=plugs.map(row=>row?.itemId);
 if(plugIds.some(id=>!nonEmpty(id))||new Set(plugIds).size!==plugIds.length)return fail('op05_mesh_plug_item_ids_invalid');
 for(const plug of plugs){
  const item=state.equipmentInventory?.items?.[plug.itemId];
  if(!isObject(item)||item.kind!=='metalMeshPlug'||item.condition!=='good'||item.location?.type!=='storage')return fail('op05_mesh_plug_not_available_in_storage',{itemId:plug.itemId,kind:item?.kind??null,condition:item?.condition??null,location:item?.location??null});
 }
 const initialErrors=[...deps.PasekaInventory.inspect(state,deps.PasekaLabels,deps.profileForHive),...deps.PasekaEquipmentItems.inspect(state),...deps.PasekaEquipmentItems.validateReferences(state),...deps.PasekaSectionalPhysicalLayout.inspect(state),...inspect(state,deps)];
 if(initialErrors.length)return fail('op05_initial_state_invalid',initialErrors);
 const itemPlan=planItemMoves(state,oldLayout,nextLayout,request.itemMoves);
 if(itemPlan.errors.length)return fail('op05_equipment_move_plan_invalid',itemPlan.errors);
 let draft;try{draft=clone(state)}catch(error){return fail('clone_failed',{message:error.message})}
 draft.sectionalLayouts=rows(draft.sectionalLayouts).filter(row=>row?.id!==oldLayout.id);
 draft.sectionalLayouts.push(clone(nextLayout));
 for(const move of itemPlan.moves){
  const result=deps.PasekaEquipmentItems.place(draft,{itemId:move.itemId,location:move.location},deps.makeId,request.occurredAt);
  if(!result?.ok)return fail('op05_equipment_move_rejected',{itemId:move.itemId,cause:result?.error??null,details:result?.details??null});
 }
 const nextRecord=draft.sectionalTechProcesses.find(row=>row?.id===request.techProcessId);
 const installed=rows(nextLayout.temporaryQueenIsolation);
 const itemMovementEventIds=installed.map(plug=>({itemId:plug.itemId,eventId:rows(draft.equipmentInventory?.items?.[plug.itemId]?.events).at(-1)?.id??null})).sort((a,b)=>a.itemId.localeCompare(b.itemId));
 nextRecord.state.operations.push({operationId:'OP-05',status:'DONE',completedAt:request.occurredAt,evidence:{layoutId:nextLayout.id,standLevelConfirmed:true,installedItemIds:installed.map(row=>row.itemId).sort(),openingIds:installed.map(row=>row.openingId).sort(),itemMovementEventIds,daysAfterDivision}});
 nextRecord.updatedAt=request.occurredAt;
 const validationErrors=[...deps.PasekaInventory.inspect(draft,deps.PasekaLabels,deps.profileForHive),...deps.PasekaEquipmentItems.inspect(draft),...deps.PasekaEquipmentItems.validateReferences(draft),...deps.PasekaSectionalPhysicalLayout.inspect(draft),...inspect(draft,deps)];
 if(validationErrors.length)return fail('op05_transaction_validation_failed',validationErrors);
 const audit=appendStageOperationAudit(draft,nextRecord,'OP-05',deps.makeId);
 if(!audit.ok)return fail(audit.error,audit.details);
 commit(state,draft);
 return {ok:true,record:state.sectionalTechProcesses.find(row=>row?.id===nextRecord.id),layout:state.sectionalLayouts.find(row=>row?.id===nextLayout.id)};
}
function completeOP06(state,request,deps={}){
 const fail=(error,details)=>({ok:false,error,details:details??null});
 if(!isObject(state)||!isObject(request))return fail('invalid_request');
 if(request.userConfirmed!==true)return fail('user_confirmation_required');
 if(!nonEmpty(request.hiveId)||!nonEmpty(request.techProcessId))return fail('required_identifiers_missing');
 if(!validDate(request.occurredAt))return fail('invalid_operation_timestamp');
 if(timestampIsFuture(request.occurredAt,deps))return fail('operation_timestamp_in_future');
 if(typeof deps.makeId!=='function')return fail('id_generator_required');
 const required=['PasekaFamilyLineage','PasekaSectionalPhysicalLayout','PasekaEquipmentItems','PasekaInventory','PasekaLabels'];
 for(const key of required)if(!deps[key])return fail('dependency_missing',{dependency:key});
 if(typeof deps.PasekaFamilyLineage.inspect!=='function'||typeof deps.PasekaSectionalPhysicalLayout.inspect!=='function'||typeof deps.PasekaSectionalPhysicalLayout.validateTemporaryQueenIsolationCoverage!=='function'||typeof deps.PasekaEquipmentItems.place!=='function'||typeof deps.PasekaEquipmentItems.inspect!=='function'||typeof deps.PasekaEquipmentItems.validateReferences!=='function'||typeof deps.PasekaInventory.inspect!=='function')return fail('dependency_api_incomplete');
 if(!Array.isArray(state.sectionalTechProcesses)||Number(state.meta?.schemaVersion||0)<15)return fail('sectional_tech_process_schema_not_ready');
 const record=rows(state.sectionalTechProcesses).find(row=>row?.id===request.techProcessId&&row?.hiveId===request.hiveId);
 if(!record)return fail('op06_tech_process_missing');
 const operations=rows(record.state?.operations),op04=operations.find(row=>row?.operationId==='OP-04');
 if(op04?.status!=='DONE'||record.state?.rowStage!==2)return fail('op06_requires_completed_op04');
 if(!validDate(op04.startedAt)||!validDate(op04.completedAt)||Date.parse(request.occurredAt)<Date.parse(op04.completedAt))return fail('op06_precedes_op04_completion');
 if(operations.some(row=>row?.operationId==='OP-06'))return fail('op06_already_recorded');
 const daysAfterDivision=calendarDayDifference(request.occurredAt,op04.startedAt);
 if(daysAfterDivision!==20&&daysAfterDivision!==21)return fail('op06_outside_source_window',{daysAfterDivision,requiredDayRange:[20,21]});
 const hive=rows(state.hives).find(row=>row?.id===request.hiveId);
 if(!hive||hive.profileId!==PROFILE_ID)return fail('sectional_profile_not_active_or_hive_missing');
 const sourceLayouts=rows(state.sectionalLayouts).filter(row=>row?.hiveId===request.hiveId);
 if(sourceLayouts.length!==1)return fail('op06_current_layout_missing');
 const oldLayout=sourceLayouts[0],nextLayout=request.layout;
 if(oldLayout.id!==record.state.layoutId||oldLayout.mode!=='SIDE_BY_SIDE'||(oldLayout.broodRows??2)!==2)return fail('op06_completed_two_row_layout_required');
 if(!isObject(nextLayout)||nextLayout.id!==oldLayout.id||nextLayout.hiveId!==request.hiveId||nextLayout.profileId!==PROFILE_ID||nextLayout.mode!=='SIDE_BY_SIDE'||(nextLayout.broodRows??2)!==2)return fail('op06_target_layout_invalid');
 const withoutPlugs=layout=>{const copy=clone(layout);delete copy.temporaryQueenIsolation;return copy};
 if(JSON.stringify(withoutPlugs(nextLayout))!==JSON.stringify(withoutPlugs(oldLayout)))return fail('op06_must_not_change_other_physical_layout');
 const installed=rows(oldLayout.temporaryQueenIsolation),targetPlugs=rows(nextLayout.temporaryQueenIsolation);
 if(targetPlugs.length)return fail('op06_target_must_remove_all_temporary_plugs');
 if(installed.length!==0&&installed.length!==8)return fail('op06_partial_mesh_plug_installation_invalid',{count:installed.length});
 const op05=operations.find(row=>row?.operationId==='OP-05');
 if(installed.length===8){
  if(!op05||op05.status!=='DONE')return fail('op06_installed_plugs_require_op05_evidence');
  const coverageErrors=deps.PasekaSectionalPhysicalLayout.validateTemporaryQueenIsolationCoverage(oldLayout);
  if(coverageErrors.length)return fail('op06_installed_plug_coverage_invalid',coverageErrors);
 }else if(op05||installed.length!==0||request.noPlugsInstalledConfirmed!==true)return fail('op06_op05_absence_not_confirmed');
 const splitEvent=rows(state.familyEvents).find(event=>event?.id===op04.evidence?.familyEventId&&event.type==='split'&&event.operationId==='OP-04'&&event.techProcessId===record.id);
 if(!splitEvent||splitEvent.resultFamilyIds?.length!==3)return fail('op06_split_event_missing');
 for(const section of rows(record.state.sections)){
  const family=rows(state.families).find(row=>row?.id===section.familyId);
  if(!family||family.recordStatus==='historical'||family.hive!==request.hiveId||family.queenIdentityStatus!=='identified'||!family.currentQueenId)return fail('op06_three_identified_queens_required',{familyId:section.familyId});
  const queen=rows(state.queens).find(row=>row?.id===family.currentQueenId);
  if(!queen||queen.status!=='current'||queen.familyId!==family.id)return fail('op06_current_queen_invalid',{familyId:family.id,queenId:family.currentQueenId});
  const observations=rows(state.queenEvents).filter(event=>event?.type==='laying_observed'&&event.userConfirmed===true&&event.familyId===family.id&&event.queenId===queen.id&&event.splitEventId===splitEvent.id&&event.techProcessId===record.id&&event.hiveId===request.hiveId&&validDate(event.occurredAt)&&Date.parse(event.occurredAt)<=Date.parse(request.occurredAt));
  if(!observations.length)return fail('op06_queen_laying_observation_required',{familyId:family.id,queenId:queen.id});
 }
 const itemMoves=installed.map(plug=>({itemId:plug.itemId,location:{type:'storage',label:request.storageLabel||'Склад'}}));
 const itemPlan=planItemMoves(state,oldLayout,nextLayout,request.itemMoves??itemMoves);
 if(itemPlan.errors.length)return fail('op06_equipment_move_plan_invalid',itemPlan.errors);
 const expectedIds=installed.map(plug=>plug.itemId).sort(),providedIds=itemPlan.moves.map(move=>move.itemId).sort();
 if(JSON.stringify(expectedIds)!==JSON.stringify(providedIds))return fail('op06_all_plugs_must_be_removed');
 const initialErrors=[...deps.PasekaInventory.inspect(state,deps.PasekaLabels,deps.profileForHive),...deps.PasekaEquipmentItems.inspect(state),...deps.PasekaEquipmentItems.validateReferences(state),...deps.PasekaSectionalPhysicalLayout.inspect(state),...deps.PasekaFamilyLineage.inspect(state),...inspect(state,deps)];
 if(initialErrors.length)return fail('op06_initial_state_invalid',initialErrors);
 let draft;try{draft=clone(state)}catch(error){return fail('clone_failed',{message:error.message})}
 draft.sectionalLayouts=rows(draft.sectionalLayouts).filter(row=>row?.id!==oldLayout.id);
 draft.sectionalLayouts.push(clone(nextLayout));
 for(const move of itemPlan.moves){
  const result=deps.PasekaEquipmentItems.place(draft,{itemId:move.itemId,location:move.location},deps.makeId,request.occurredAt);
  if(!result?.ok)return fail('op06_equipment_move_rejected',{itemId:move.itemId,cause:result?.error??null,details:result?.details??null});
 }
 const nextRecord=draft.sectionalTechProcesses.find(row=>row?.id===request.techProcessId);
 const removed=installed.map(row=>({itemId:row.itemId,bodyId:row.bodyId,openingId:row.openingId})).sort((a,b)=>a.itemId.localeCompare(b.itemId));
 const itemMovementEventIds=removed.map(plug=>({itemId:plug.itemId,eventId:rows(draft.equipmentInventory?.items?.[plug.itemId]?.events).at(-1)?.id??null}));
 nextRecord.state.operations.push({operationId:'OP-06',status:'DONE',completedAt:request.occurredAt,evidence:{layoutId:nextLayout.id,daysAfterDivision,removedPlugs:removed,removedItemIds:removed.map(row=>row.itemId),noPlugsInstalledConfirmed:removed.length===0,itemMovementEventIds}});
 nextRecord.updatedAt=request.occurredAt;
 const validationErrors=[...deps.PasekaInventory.inspect(draft,deps.PasekaLabels,deps.profileForHive),...deps.PasekaEquipmentItems.inspect(draft),...deps.PasekaEquipmentItems.validateReferences(draft),...deps.PasekaSectionalPhysicalLayout.inspect(draft),...deps.PasekaFamilyLineage.inspect(draft),...inspect(draft,deps)];
 if(validationErrors.length)return fail('op06_transaction_validation_failed',validationErrors);
 const audit=appendStageOperationAudit(draft,nextRecord,'OP-06',deps.makeId);
 if(!audit.ok)return fail(audit.error,audit.details);
 commit(state,draft);
 return {ok:true,record:state.sectionalTechProcesses.find(row=>row?.id===request.techProcessId),layout:state.sectionalLayouts.find(row=>row?.id===nextLayout.id)};
}
function earlyHoneyFrameCompositionErrors(frames){
 const errors=[],list=rows(frames);
 if(list.length>10)return [{code:'frame_capacity_exceeded',maximum:10,actual:list.length}];
 if(!list.length||list.some(frame=>!isObject(frame)||!['drawn_comb','wax_foundation'].includes(frame.combType)))return [{code:'frame_comb_type_missing_or_invalid'}];
 if(!list.some(frame=>frame.combType==='drawn_comb'))return [{code:'at_least_one_drawn_comb_required'}];
 const foundation=list.map((frame,index)=>frame.combType==='wax_foundation'?index:-1).filter(index=>index>=0);
 if(foundation.length>2)errors.push({code:'wax_foundation_limit_exceeded',maximum:2,actual:foundation.length});
 for(const index of foundation){
  if(index===0||index===list.length-1||list[index-1]?.combType!=='drawn_comb'||list[index+1]?.combType!=='drawn_comb')
   errors.push({code:'wax_foundation_must_be_between_drawn_comb',position:index+1});
 }
 return errors;
}
function honeyFrameCompositionEvidence(framesByBody){
 return Object.fromEntries(Object.entries(framesByBody||{}).map(([bodyId,frames])=>[bodyId,rows(frames).map((frame,index)=>({
  position:index+1,frameUid:frame?.frameUid??null,frameId:frame?.frameId??null,labelCode:frame?.labelCode??null,combType:frame?.combType??null
 }))]));
}
function completeOP07(state,request,deps={}){
 const fail=(error,details)=>({ok:false,error,details:details??null});
 if(!isObject(state)||!isObject(request))return fail('invalid_request');
 if(request.userConfirmed!==true)return fail('user_confirmation_required');
 if(!nonEmpty(request.hiveId)||!nonEmpty(request.techProcessId))return fail('required_identifiers_missing');
 if(!validDate(request.occurredAt))return fail('invalid_operation_timestamp');
 if(timestampIsFuture(request.occurredAt,deps))return fail('operation_timestamp_in_future');
 if(!['AFTER_OP06','WITH_SECOND_ROW','APPROX_12_DAYS_AFTER_SECOND_ROW'].includes(request.timingMode))return fail('op07_timing_mode_required');
 if(typeof deps.makeId!=='function')return fail('id_generator_required');
 const required=['PasekaFamilyLineage','PasekaSectionalPhysicalLayout','PasekaEquipmentItems','PasekaInventory','PasekaLabels'];
 for(const key of required)if(!deps[key])return fail('dependency_missing',{dependency:key});
 if(typeof deps.PasekaFamilyLineage.inspect!=='function'||typeof deps.PasekaSectionalPhysicalLayout.inspect!=='function'||typeof deps.PasekaEquipmentItems.place!=='function'||typeof deps.PasekaEquipmentItems.inspect!=='function'||typeof deps.PasekaEquipmentItems.validateReferences!=='function'||typeof deps.PasekaInventory.inspect!=='function')return fail('dependency_api_incomplete');
 if(!Array.isArray(state.sectionalTechProcesses)||Number(state.meta?.schemaVersion||0)<15)return fail('sectional_tech_process_schema_not_ready');
 const record=rows(state.sectionalTechProcesses).find(row=>row?.id===request.techProcessId&&row?.hiveId===request.hiveId);
 if(!record)return fail('op07_tech_process_missing');
 const operations=rows(record.state?.operations),op04=operations.find(row=>row?.operationId==='OP-04'),op06=operations.find(row=>row?.operationId==='OP-06'&&row.status==='DONE');
 if(op04?.status!=='DONE'||record.state?.rowStage!==2)return fail('op07_requires_completed_op04');
 if(operations.some(row=>row?.operationId==='OP-07'))return fail('op07_already_recorded');
 if(!validDate(op04.completedAt)||Date.parse(request.occurredAt)<Date.parse(op04.completedAt))return fail('op07_precedes_op04_completion');
 if(request.timingMode==='AFTER_OP06'&&(!op06||!validDate(op06.completedAt)||Date.parse(request.occurredAt)<Date.parse(op06.completedAt)))return fail('op07_requires_completed_op06');
 const secondRowAt=op04.evidence?.secondRowAt||op04.completedAt;
 if(!validDate(secondRowAt)||Date.parse(request.occurredAt)<Date.parse(secondRowAt))return fail('op07_precedes_second_row');
 const hive=rows(state.hives).find(row=>row?.id===request.hiveId);
 if(!hive||hive.profileId!==PROFILE_ID)return fail('sectional_profile_not_active_or_hive_missing');
 const layouts=rows(state.sectionalLayouts).filter(row=>row?.hiveId===request.hiveId);
 if(layouts.length!==1)return fail('op07_current_layout_missing');
 const oldLayout=layouts[0];let nextLayout;try{nextLayout=clone(request.layout)}catch(error){return fail('clone_failed',{message:error.message})}
 if(oldLayout.id!==record.state.layoutId||oldLayout.mode!=='SIDE_BY_SIDE'||(oldLayout.broodRows??2)!==2)return fail('op07_completed_two_row_layout_required');
 if(!isObject(nextLayout)||nextLayout.id!==oldLayout.id||nextLayout.hiveId!==request.hiveId||nextLayout.profileId!==PROFILE_ID||nextLayout.mode!=='SIDE_BY_SIDE'||(nextLayout.broodRows??2)!==2||!isObject(nextLayout.honeyStack))return fail('op07_target_layout_invalid');
 const normalizeBase=layout=>{const copy=clone(layout);delete copy.honeyStack;for(const stack of rows(copy.stacks)){delete stack.coverItemId;delete stack.topRiserItemId}return copy};
 if(JSON.stringify(normalizeBase(oldLayout))!==JSON.stringify(normalizeBase(nextLayout)))return fail('op07_must_not_change_unrelated_physical_layout');
 for(const stack of rows(nextLayout.stacks))if(stack.coverItemId||stack.topRiserItemId)return fail('op07_stack_covers_and_top_risers_must_be_removed',{stackId:stack.id});
 const honey=nextLayout.honeyStack,bodyIds=rows(honey.bodyIds),excluders=rows(honey.excluders);
 if(!['early','main'].includes(honey.purpose)||![2,4].includes(bodyIds.length)||new Set(bodyIds).size!==bodyIds.length)return fail('op07_honey_body_configuration_invalid',{purpose:honey.purpose??null,bodyIds});
 if(excluders.length!==2||new Set(excluders.map(row=>row?.side)).size!==2||!['left','right'].every(side=>excluders.some(row=>row?.side===side)))return fail('op07_two_large_excluders_required');
 if(rows(oldLayout.temporaryQueenIsolation).length!==rows(nextLayout.temporaryQueenIsolation).length||rows(oldLayout.temporaryQueenIsolation).some(old=>!rows(nextLayout.temporaryQueenIsolation).some(row=>row?.itemId===old.itemId&&row?.openingId===old.openingId&&row?.bodyId===old.bodyId)))return fail('op07_temporary_isolation_must_be_preserved');
 for(const bodyId of bodyIds){
  const body=state.equipmentInventory?.bodies?.[bodyId];
  if(!body||body.kind!=='honey'||body.condition!=='good'||body.spec?.profileId!==PROFILE_ID||body.spec?.framesPerBox!==10||!nonEmpty(body.storageLocation)||!nonEmpty(body.pairId))return fail('op07_honey_body_not_available_in_storage',{bodyId});
 }
 const pairCounts=new Map();for(const bodyId of bodyIds){const pairId=state.equipmentInventory.bodies[bodyId].pairId;pairCounts.set(pairId,(pairCounts.get(pairId)||0)+1)}
 if([...pairCounts.values()].some(count=>count!==2)||pairCounts.size!==bodyIds.length/2)return fail('op07_honey_bodies_must_be_complete_pairs');
 const framesByBody={};
 for(const bodyId of bodyIds){
  const body=state.equipmentInventory.bodies[bodyId],frames=rows(body.frames);
  if(!Array.isArray(body.frames))return fail('op07_honey_frame_inventory_invalid',{bodyId});
  if(frames.length!==10)return fail('op07_honey_frame_capacity_mismatch',{bodyId,expected:10,actual:frames.length});
  if(frames.some(frame=>!isObject(frame)||frame.history!=null&&!Array.isArray(frame.history)))return fail('op07_honey_frame_record_invalid',{bodyId});
  if(honey.purpose==='early'){
   const compositionErrors=earlyHoneyFrameCompositionErrors(frames);
   if(compositionErrors.length)return fail('op07_early_honey_frame_composition_invalid',{bodyId,errors:compositionErrors});
  }
  framesByBody[bodyId]=clone(frames);
 }

 for(const row of excluders){
  const item=state.equipmentInventory?.items?.[row?.itemId];
  if(!item||item.kind!=='honeyQueenExcluder'||item.condition!=='good'||item.location?.type!=='storage')return fail('op07_large_excluder_not_available_in_storage',{itemId:row?.itemId??null});
 }
 const initialErrors=[...deps.PasekaInventory.inspect(state,deps.PasekaLabels,deps.profileForHive),...deps.PasekaEquipmentItems.inspect(state),...deps.PasekaEquipmentItems.validateReferences(state),...deps.PasekaSectionalPhysicalLayout.inspect(state),...deps.PasekaFamilyLineage.inspect(state),...inspect(state,deps)];
 if(initialErrors.length)return fail('op07_initial_state_invalid',initialErrors);
 const bodyPlan=planBodyMoves(state,oldLayout,nextLayout,request.bodyStorageMoves||[]);
 if(bodyPlan.errors.length)return fail('op07_body_move_plan_invalid',bodyPlan.errors);
 const itemPlan=planItemMoves(state,oldLayout,nextLayout,request.itemMoves);
 if(itemPlan.errors.length)return fail('op07_equipment_move_plan_invalid',itemPlan.errors);
 let draft;try{draft=clone(state)}catch(error){return fail('clone_failed',{message:error.message})}
 draft.sectionalLayouts=rows(draft.sectionalLayouts).filter(row=>row?.id!==oldLayout.id);
 draft.sectionalLayouts.push(clone(nextLayout));
 const bodyHistory=appendBodyMovementHistory(draft,oldLayout,nextLayout,bodyPlan.storageById,request.occurredAt,deps.makeId,'OP-07',deps.PasekaLabels);
 if(!bodyHistory.ok)return fail(bodyHistory.error,bodyHistory.details);
 for(const bodyId of bodyIds)delete draft.equipmentInventory.bodies[bodyId].storageLocation;
 for(const move of itemPlan.moves){
  const result=deps.PasekaEquipmentItems.place(draft,{itemId:move.itemId,location:move.location},deps.makeId,request.occurredAt);
  if(!result?.ok)return fail('op07_equipment_move_rejected',{itemId:move.itemId,cause:result?.error??null,details:result?.details??null});
 }
 const movementIds=itemPlan.moves.map(move=>({itemId:move.itemId,eventId:rows(draft.equipmentInventory?.items?.[move.itemId]?.events).at(-1)?.id??null}));
 const removedStackAccessories=rows(oldLayout.stacks).flatMap(stack=>[{itemId:stack.coverItemId,kind:'cover'},{itemId:stack.topRiserItemId,kind:'topRiser'}]).filter(row=>nonEmpty(row.itemId));
 const nextRecord=draft.sectionalTechProcesses.find(row=>row?.id===request.techProcessId);
 const daysAfterSecondRow=calendarDayDifference(request.occurredAt,secondRowAt);
 if(request.timingMode==='WITH_SECOND_ROW'&&daysAfterSecondRow!==0)return fail('op07_with_second_row_must_be_same_day',{daysAfterSecondRow});
 if(request.timingMode==='APPROX_12_DAYS_AFTER_SECOND_ROW'&&(daysAfterSecondRow==null||daysAfterSecondRow<12||daysAfterSecondRow>15))return fail('op07_delayed_timing_outside_12_15_day_window',{daysAfterSecondRow,minimum:12,maximum:15});
 nextRecord.state.operations.push({operationId:'OP-07',status:'DONE',completedAt:request.occurredAt,evidence:{layoutId:nextLayout.id,timingMode:request.timingMode,secondRowAt,daysAfterSecondRow,honeyPurpose:honey.purpose,honeyBodyIds:bodyIds.slice(),frameComposition:honeyFrameCompositionEvidence(framesByBody),excluderItemIds:excluders.map(row=>row.itemId).sort(),removedStackAccessories,itemMovementEventIds:movementIds}});
 nextRecord.updatedAt=request.occurredAt;
 const validationErrors=[...deps.PasekaInventory.inspect(draft,deps.PasekaLabels,deps.profileForHive),...deps.PasekaEquipmentItems.inspect(draft),...deps.PasekaEquipmentItems.validateReferences(draft),...deps.PasekaSectionalPhysicalLayout.inspect(draft),...deps.PasekaFamilyLineage.inspect(draft),...inspect(draft,deps)];
 if(validationErrors.length)return fail('op07_transaction_validation_failed',validationErrors);
 const audit=appendStageOperationAudit(draft,nextRecord,'OP-07',deps.makeId);
 if(!audit.ok)return fail(audit.error,audit.details);
 commit(state,draft);
 return {ok:true,record:state.sectionalTechProcesses.find(row=>row?.id===request.techProcessId),layout:state.sectionalLayouts.find(row=>row?.id===nextLayout.id)};
}

// Source P37: during the main nectar flow, a second COMPLETE honey pair
// may be installed after the initial two. This is a separate confirmed
// transaction: OP-07's original evidence is never rewritten.
function completeOP07AdditionalHoneyPair(state,request,deps={}){
 const fail=(error,details)=>({ok:false,error,details:details??null});
 if(!isObject(state)||!isObject(request))return fail('invalid_request');
 if(request.userConfirmed!==true)return fail('user_confirmation_required');
 // The UI must submit the revision it reviewed before confirmation. Legacy
 // schema-15 fixtures may have no revision yet; do not assign one here.
 const storedRevision=state.meta?.revisionId;
 if(nonEmpty(storedRevision)&&request.expectedRevisionId!==storedRevision)return fail('late_honey_pair_state_revision_changed');
 if(request.expectedRevisionId!=null&&request.expectedRevisionId!==storedRevision)return fail('late_honey_pair_state_revision_changed');
 if(!nonEmpty(request.hiveId)||!nonEmpty(request.techProcessId))return fail('required_identifiers_missing');
 if(!validDate(request.occurredAt))return fail('invalid_operation_timestamp');
 if(timestampIsFuture(request.occurredAt,deps))return fail('operation_timestamp_in_future');
 if(typeof deps.makeId!=='function')return fail('id_generator_required');
 const required=['PasekaFamilyLineage','PasekaSectionalPhysicalLayout','PasekaEquipmentItems','PasekaInventory','PasekaLabels'];
 for(const key of required)if(!deps[key])return fail('dependency_missing',{dependency:key});
 if(typeof deps.PasekaFamilyLineage.inspect!=='function'||typeof deps.PasekaSectionalPhysicalLayout.inspect!=='function'||typeof deps.PasekaEquipmentItems.inspect!=='function'||typeof deps.PasekaEquipmentItems.validateReferences!=='function'||typeof deps.PasekaInventory.inspect!=='function'||typeof deps.PasekaLabels.appendFrameEvent!=='function')return fail('dependency_api_incomplete');
 if(!Array.isArray(state.sectionalTechProcesses)||Number(state.meta?.schemaVersion||0)<15)return fail('sectional_tech_process_schema_not_ready');
 if(rows(request.bodyStorageMoves).length||rows(request.itemMoves).length||request.layout!=null)return fail('late_honey_pair_unrelated_changes_forbidden');
 const hiveMatches=rows(state.hives).filter(row=>row?.id===request.hiveId),hive=hiveMatches[0];
 if(hiveMatches.length!==1||hive.profileId!==PROFILE_ID)return fail('sectional_profile_not_active_or_hive_missing');
 const processMatches=rows(state.sectionalTechProcesses).filter(row=>row?.id===request.techProcessId&&row?.hiveId===request.hiveId),record=processMatches[0];
 if(processMatches.length!==1)return fail('late_honey_pair_process_missing');
 const operations=rows(record.state?.operations),op07=operations.find(row=>row?.operationId==='OP-07');
 if(!op07||op07.status!=='DONE'||!validDate(op07.completedAt))return fail('late_honey_pair_requires_completed_op07');
 if(operations.some(row=>row?.operationId==='OP-07-HONEY-PAIR-ADD'))return fail('late_honey_pair_already_recorded');
 if(Date.parse(request.occurredAt)<Date.parse(op07.completedAt))return fail('late_honey_pair_precedes_op07');
 const layouts=rows(state.sectionalLayouts).filter(row=>row?.hiveId===request.hiveId);
 if(layouts.length!==1)return fail('late_honey_pair_layout_missing');
 const oldLayout=layouts[0],honey=oldLayout?.honeyStack,oldIds=rows(honey?.bodyIds);
 if(oldLayout?.id!==record.state?.layoutId||oldLayout?.profileId!==PROFILE_ID||oldLayout?.mode!=='SIDE_BY_SIDE'||(oldLayout.broodRows??2)!==2||honey?.purpose!=='main'||op07.evidence?.honeyPurpose!=='main'||oldIds.length!==2||JSON.stringify(oldIds)!==JSON.stringify(rows(op07.evidence?.honeyBodyIds)))return fail('late_honey_pair_main_two_body_layout_required');
 if(!Array.isArray(request.addedBodyIds)||request.addedBodyIds.length!==2||request.addedBodyIds.some(id=>!nonEmpty(id))||new Set(request.addedBodyIds).size!==2||request.addedBodyIds.some(id=>oldIds.includes(id)))return fail('late_honey_pair_exactly_two_new_bodies_required');
 const addedIds=request.addedBodyIds.slice(),inventory=state.equipmentInventory?.bodies||{};
 const candidateErrors=inspectSecondHoneyPairCandidate(state,{hiveId:request.hiveId,techProcessId:request.techProcessId,bodyIds:addedIds});
 if(candidateErrors.length)return fail('late_honey_pair_candidate_invalid',candidateErrors);
 const pairIds=addedIds.map(id=>inventory[id]?.pairId);
 if(!pairIds.every(nonEmpty)||pairIds[0]!==pairIds[1]||oldIds.some(id=>inventory[id]?.pairId===pairIds[0]))return fail('late_honey_pair_same_unused_pair_required');
 for(const bodyId of addedIds){
  const body=inventory[bodyId],frames=body?.frames;
  if(!isObject(body)||body.kind!=='honey'||body.condition!=='good'||body.spec?.profileId!==PROFILE_ID||body.spec?.framesPerBox!==10||!nonEmpty(body.storageLocation))return fail('late_honey_pair_body_unavailable_in_storage',{bodyId});
  if(!Array.isArray(frames)||frames.length!==10||frames.some(frame=>!isObject(frame)||frame.history!=null&&!Array.isArray(frame.history)))return fail('late_honey_pair_frame_inventory_invalid',{bodyId});
  if(rows(state.sectionalLayouts).some(layout=>rows(layout?.honeyStack?.bodyIds).includes(bodyId)||rows(layout?.sections).some(section=>rows(section?.broodBodyIds).includes(bodyId))))return fail('late_honey_pair_body_already_used',{bodyId});
  for(const legacy of Object.values(state.layouts||{}))if(Object.values(legacy?.boxes||{}).some(box=>box?.bodyId===bodyId||box?.id===bodyId))return fail('late_honey_pair_legacy_body_in_use',{bodyId});
 }
 const before=[...deps.PasekaInventory.inspect(state,deps.PasekaLabels,deps.profileForHive),...deps.PasekaEquipmentItems.inspect(state),...deps.PasekaEquipmentItems.validateReferences(state),...deps.PasekaSectionalPhysicalLayout.inspect(state),...deps.PasekaFamilyLineage.inspect(state),...inspect(state,deps)];
 if(before.length)return fail('late_honey_pair_initial_state_invalid',before);
 let draft;try{draft=clone(state)}catch(error){return fail('clone_failed',{message:error.message})}
 const nextLayout=draft.sectionalLayouts.find(row=>row?.id===oldLayout.id);
 nextLayout.honeyStack.bodyIds.push(...addedIds);
 const history=appendBodyMovementHistory(draft,oldLayout,nextLayout,new Map(),request.occurredAt,deps.makeId,'OP-07-HONEY-PAIR-ADD',deps.PasekaLabels);
 if(!history.ok)return fail(history.error,history.details);
 for(const bodyId of addedIds)delete draft.equipmentInventory.bodies[bodyId].storageLocation;
 const nextRecord=draft.sectionalTechProcesses.find(row=>row?.id===request.techProcessId);
 nextRecord.state.operations.push({operationId:'OP-07-HONEY-PAIR-ADD',status:'DONE',completedAt:request.occurredAt,evidence:{
  previousBodyIds:oldIds.slice(),addedBodyIds:addedIds.slice(),honeyBodyIds:nextLayout.honeyStack.bodyIds.slice(),
  frameComposition:honeyFrameCompositionEvidence(Object.fromEntries(addedIds.map(id=>[id,draft.equipmentInventory.bodies[id].frames])))
 }});
 nextRecord.updatedAt=request.occurredAt;
 const after=[...deps.PasekaInventory.inspect(draft,deps.PasekaLabels,deps.profileForHive),...deps.PasekaEquipmentItems.inspect(draft),...deps.PasekaEquipmentItems.validateReferences(draft),...deps.PasekaSectionalPhysicalLayout.inspect(draft),...deps.PasekaFamilyLineage.inspect(draft),...inspect(draft,deps)];
 if(after.length)return fail('late_honey_pair_transaction_validation_failed',after);
 const audit=appendStageOperationAudit(draft,nextRecord,'OP-07-HONEY-PAIR-ADD',deps.makeId);
 if(!audit.ok)return fail(audit.error,audit.details);
 commit(state,draft);
 return {ok:true,record:state.sectionalTechProcesses.find(row=>row?.id===request.techProcessId),layout:state.sectionalLayouts.find(row=>row?.id===oldLayout.id)};
}

// Read-only candidate check for the optional main-harvest second honey pair.
// This is NOT a completion API, physical operation, or authorization to mutate.
// The separate committed operation must still validate revisions, movements,
// history, backups and the complete state before changing any records.
function inspectSecondHoneyPairCandidate(state,request){
 const errors=[],add=(code,details={})=>errors.push({code,details});
 if(!isObject(state)||!isObject(request))return [{code:'second_pair_invalid_request',details:{}}];
 if(!nonEmpty(request.hiveId)||!nonEmpty(request.techProcessId))return [{code:'second_pair_identifiers_required',details:{}}];
 if(Number(state.meta?.schemaVersion||0)<15||!Array.isArray(state.sectionalTechProcesses))add('second_pair_schema_not_ready');
 const hiveRows=rows(state.hives).filter(hive=>hive?.id===request.hiveId);
 if(hiveRows.length!==1||hiveRows[0]?.profileId!==PROFILE_ID)add('second_pair_requires_sectional_hive');
 const processRows=rows(state.sectionalTechProcesses).filter(row=>row?.id===request.techProcessId&&row?.hiveId===request.hiveId);
 if(processRows.length!==1)add('second_pair_process_missing_or_ambiguous');
 const process=processRows[0],op07Rows=rows(process?.state?.operations).filter(row=>row?.operationId==='OP-07'),op07=op07Rows[0];
 if(op07Rows.length!==1||op07?.status!=='DONE'||!validDate(op07?.completedAt))add('second_pair_requires_completed_op07');
 const layouts=rows(state.sectionalLayouts).filter(row=>row?.hiveId===request.hiveId);
 if(layouts.length!==1)add('second_pair_layout_missing_or_ambiguous');
 const layout=layouts[0],stack=layout?.honeyStack,oldIds=rows(stack?.bodyIds);
 if(layout?.profileId!==PROFILE_ID||layout?.mode!=='SIDE_BY_SIDE'||(layout?.broodRows??2)!==2||stack?.purpose!=='main'||oldIds.length!==2||new Set(oldIds).size!==2||layout?.id!==process?.state?.layoutId)add('second_pair_requires_initial_main_honey_pair');
 if(op07&&op07.evidence?.honeyPurpose!=='main')add('second_pair_original_op07_not_main');
 if(op07&&JSON.stringify(oldIds)!==JSON.stringify(rows(op07.evidence?.honeyBodyIds)))add('second_pair_original_op07_bodies_changed');
 const existingFrames=Object.fromEntries(oldIds.map(id=>[id,rows(state.equipmentInventory?.bodies?.[id]?.frames)]));
 if(op07&&JSON.stringify(honeyFrameCompositionEvidence(existingFrames))!==JSON.stringify(op07.evidence?.frameComposition))add('second_pair_original_op07_frames_changed');
 const inventory=state.equipmentInventory?.bodies||{},oldPairIds=oldIds.map(id=>inventory[id]?.pairId);
 if(oldPairIds.some(id=>!nonEmpty(id))||oldPairIds[0]!==oldPairIds[1])add('second_pair_original_pair_invalid');
 const candidates=request.bodyIds;
 if(!Array.isArray(candidates)||candidates.length!==2||candidates.some(id=>!nonEmpty(id))||new Set(candidates).size!==2){
  add('second_pair_two_distinct_body_ids_required');
 }else{
  const pairIds=[];
  for(const bodyId of candidates){
   const body=inventory[bodyId];pairIds.push(body?.pairId);
   if(oldIds.includes(bodyId))add('second_pair_body_already_installed',{bodyId});
   if(!isObject(body)||body.id!==bodyId||body.kind!=='honey'||body.condition!=='good'||body.spec?.profileId!==PROFILE_ID||body.spec?.framesPerBox!==10||!nonEmpty(body.storageLocation)||!nonEmpty(body.pairId))add('second_pair_body_unavailable',{bodyId});
   if(!Array.isArray(body?.frames)||body.frames.length!==10||body.frames.some(frame=>!isObject(frame)||frame.history!=null&&!Array.isArray(frame.history)))add('second_pair_frame_inventory_invalid',{bodyId});
   const reused=rows(state.sectionalLayouts).some(row=>rows(row?.sections).some(section=>rows(section?.broodBodyIds).includes(bodyId))||rows(row?.honeyStack?.bodyIds).includes(bodyId));
   if(reused)add('second_pair_body_already_in_layout',{bodyId});
  }
  if(!nonEmpty(pairIds[0])||pairIds[0]!==pairIds[1]||oldPairIds.includes(pairIds[0]))add('second_pair_inventory_pair_mismatch');
 }
 if(rows(process?.state?.honeyTransitions).length)add('second_pair_requires_initial_installation');
 if(inspect(state).length)add('second_pair_existing_tech_process_invalid');
 return errors;
}
// Candidate pairs for a future supported UI. No candidate means no offer.
function availableSecondHoneyPairs(state,request){
 if(!isObject(state)||!isObject(request)||!nonEmpty(request.hiveId)||!nonEmpty(request.techProcessId))return [];
 const groups=new Map();for(const body of Object.values(state.equipmentInventory?.bodies||{})){if(body?.kind!=='honey'||!nonEmpty(body.pairId))continue;if(!groups.has(body.pairId))groups.set(body.pairId,[]);groups.get(body.pairId).push(body.id);}
 return [...groups.entries()].filter(([,ids])=>ids.length===2&&!inspectSecondHoneyPairCandidate(state,{...request,bodyIds:ids}).length).map(([pairId,bodyIds])=>({pairId,bodyIds:bodyIds.slice()}));
}


 // Owner-confirmed full removal / independent installation. The draft must
 // pass physical checks and history replay before becoming an unsaved candidate.
function prepareFullHoneyPhysicalTransition(state,request,deps={}){
 const fail=(error,details)=>({ok:false,error,details:details??null});
 try{
  if(!isObject(state)||!isObject(request)||request.userConfirmed!==true||!nonEmpty(state.meta?.revisionId)||request.expectedRevisionId!==state.meta.revisionId)return fail('confirmation_or_revision_required');
  if(!validDate(request.occurredAt)||timestampIsFuture(request.occurredAt,deps)||typeof deps.makeId!=='function')return fail('invalid_operation_time_or_id_source');
  if(typeof deps.PasekaLabels?.appendFrameEvent!=='function'||typeof deps.PasekaInventory?.inspect!=='function'||typeof deps.PasekaInventory?.locateAll!=='function'||typeof deps.PasekaEquipmentItems?.inspect!=='function'||typeof deps.PasekaEquipmentItems?.validateReferences!=='function'||typeof deps.PasekaEquipmentItems?.place!=='function'||typeof deps.PasekaSectionalPhysicalLayout?.inspect!=='function'||typeof deps.PasekaFamilyLineage?.inspect!=='function')return fail('operation_dependencies_missing');
  const validatePhysical=s=>[...deps.PasekaInventory.inspect(s,deps.PasekaLabels,deps.profileForHive),...deps.PasekaEquipmentItems.inspect(s),...deps.PasekaEquipmentItems.validateReferences(s),...deps.PasekaSectionalPhysicalLayout.inspect(s),...deps.PasekaFamilyLineage.inspect(s)];
  const initialErrors=[...validatePhysical(state),...inspect(state,deps)];if(initialErrors.length)return fail('invalid_initial_physical_state',initialErrors);
  const hive=rows(state.hives).filter(h=>h?.id===request.hiveId&&h.profileId===PROFILE_ID),records=rows(state.sectionalTechProcesses).filter(r=>r?.id===request.techProcessId&&r.hiveId===request.hiveId);
  if(hive.length!==1||records.length!==1)return fail('sectional_context_missing');
  const record=records[0],oldLayouts=rows(state.sectionalLayouts).filter(l=>l?.id===record.state?.layoutId&&l.hiveId===request.hiveId);
  if(oldLayouts.length!==1)return fail('sectional_layout_missing');
  const old=oldLayouts[0],target=clone(request.layout);
  if(!isObject(target)||old.mode!=='SIDE_BY_SIDE'||(old.broodRows??2)!==2||!rows(record.state?.operations).some(x=>x?.operationId==='OP-07'&&x.status==='DONE'))return fail('completed_sectional_op07_required');
  const base=l=>{const x=clone(l);delete x.honeyStack;for(const stack of rows(x.stacks)){delete stack.coverItemId;delete stack.topRiserItemId}return x};
  if(JSON.stringify(base(old))!==JSON.stringify(base(target)))return fail('unrelated_layout_change');
  const extract=request.kind==='extract',install=request.kind==='install';
  if(!extract&&!install)return fail('unknown_operation');
  const honey=extract?old.honeyStack:target.honeyStack;
  if(!isObject(honey)||!['early','main'].includes(honey.purpose)||![2,4].includes(rows(honey.bodyIds).length)||new Set(honey.bodyIds).size!==honey.bodyIds.length||!Array.isArray(honey.excluders)||honey.excluders.length!==2||!['left','right'].every(side=>honey.excluders.filter(e=>e?.side===side).length===1))return fail('complete_honey_stack_required');
  if(extract&&(target.honeyStack!=null||!Number.isFinite(request.kilograms)||request.kilograms<=0))return fail('full_removal_and_weight_required');
  if(install&&old.honeyStack!=null)return fail('zero_honey_layout_required');
  const closed=extract?target:old,open=extract?old:target;
  const accessories=rows(closed.stacks).flatMap(s=>[s.coverItemId,s.topRiserItemId]);
  if(rows(closed.stacks).length!==3||accessories.length!==6||accessories.some(id=>!nonEmpty(id))||new Set(accessories).size!==6||rows(open.stacks).some(s=>s.coverItemId||s.topRiserItemId))return fail('three_complete_cover_pairs_required');
  const bodies=state.equipmentInventory?.bodies||{},ids=honey.bodyIds,framesSeen=new Set(),pairs=new Map();
  for(const id of ids){
   const b=bodies[id];
   if(!isObject(b)||b.id!==id||b.kind!=='honey'||b.condition!=='good'||b.spec?.profileId!==PROFILE_ID||b.spec?.framesPerBox!==10||!nonEmpty(b.pairId)||!Array.isArray(b.frames)||b.frames.length!==10)return fail('compatible_full_honey_body_required',{bodyId:id});
   const locations=deps.PasekaInventory.locateAll(state,id);
   if(extract&&(locations.length!==1||locations[0].type!=='sectional'||locations[0].hiveId!==old.hiveId||locations[0].layoutId!==old.id||locations[0].bodyRole!=='honey'))return fail('installed_body_location_mismatch',{bodyId:id});
   if(install&&(locations.length||!nonEmpty(b.storageLocation)))return fail('stock_body_unavailable',{bodyId:id});
   for(const f of b.frames){
    if(!isObject(f)||!nonEmpty(f.frameId)||framesSeen.has(f.frameId)||f.history!=null&&!Array.isArray(f.history))return fail('invalid_frame_identity',{bodyId:id});
    framesSeen.add(f.frameId);
    if(extract&&f.status!=='sealed')return fail('all_frames_must_be_ready',{bodyId:id,frameId:f.frameId});
   }
   if(install&&honey.purpose==='early'&&earlyHoneyFrameCompositionErrors(b.frames).length)return fail('early_frame_composition_invalid',{bodyId:id});
   if(!pairs.has(b.pairId))pairs.set(b.pairId,[]);pairs.get(b.pairId).push(id);
  }
  if([...pairs.values()].some(p=>p.length!==2)||JSON.stringify([...pairs.values()].flat())!==JSON.stringify(ids))return fail('complete_contiguous_pairs_required');
  const bodyPlan=planBodyMoves(state,old,target,request.bodyStorageMoves||[]);
  if(bodyPlan.errors.length)return fail('body_moves_invalid',bodyPlan.errors);
  const itemPlan=planItemMoves(state,old,target,request.itemMoves);
  if(itemPlan.errors.length)return fail('item_moves_invalid',itemPlan.errors);
  if(itemPlan.moves.length!==8)return fail('eight_accessory_moves_required');
  const draft=clone(state),at=request.occurredAt,used=collectEventIds(draft);
  for(const row of [...rows(draft.extractions),...rows(draft.records)])if(nonEmpty(row?.id))used.add(row.id);
  const transitionId=nextUniqueId(deps.makeId,used);if(!transitionId)return fail('transition_id_unavailable');
  const opId=(extract?'OP-08-EXTRACT:':'OP-08-INSTALL:')+transitionId,frameEvents=[];
  if(extract)for(const id of ids)for(const f of draft.equipmentInventory.bodies[id].frames){
   const eventId=nextUniqueId(deps.makeId,used);if(!eventId)return fail('frame_history_id_unavailable');
   deps.PasekaLabels.appendFrameEvent(f,'extraction',{from:'sealed',to:'extracted',extractionId:transitionId},at,eventId);
   f.status='extracted';frameEvents.push({bodyId:id,frameId:f.frameId,eventId});
  }
  const index=draft.sectionalLayouts.findIndex(l=>l.id===old.id);
  draft.sectionalLayouts[index]=clone(target);
  const moved=appendBodyMovementHistory(draft,old,target,bodyPlan.storageById,at,deps.makeId,opId,deps.PasekaLabels);
  if(!moved.ok)return moved;
  for(const id of ids){
   const b=draft.equipmentInventory.bodies[id];
   if(extract)b.storageLocation=bodyPlan.storageById.get(id);else delete b.storageLocation;
  }
  // Remove old accessories before placing the new ones to avoid overlapping
  // footprints. All moves are still only on the detached copy.
  const itemEvents=[];
  for(const move of itemPlan.moves.slice().sort((a,b)=>Number(b.location.type==='storage')-Number(a.location.type==='storage'))){
   const result=deps.PasekaEquipmentItems.place(draft,{itemId:move.itemId,location:move.location},deps.makeId,at);
   if(!result?.ok)return fail('accessory_move_rejected',{itemId:move.itemId,cause:result?.error});
   itemEvents.push({itemId:move.itemId,eventId:rows(draft.equipmentInventory.items[move.itemId].events).at(-1)?.id??null});
  }
  const after=validatePhysical(draft);if(after.length)return fail('physical_candidate_invalid',after);
  const evidence={transitionId,kind:request.kind,hiveId:request.hiveId,techProcessId:request.techProcessId,layoutId:old.id,occurredAt:at,priorHoneyStack:clone(old.honeyStack??null),nextHoneyStack:clone(target.honeyStack??null),bodyIds:ids.slice(),pairIds:[...pairs.keys()],frameEvents,itemEvents,closedAccessoryIds:accessories,closedStacks:rows(closed.stacks).map(s=>({stackId:s.id,coverItemId:s.coverItemId,topRiserItemId:s.topRiserItemId})),bodyStorageMoves:clone(request.bodyStorageMoves||[]),kilograms:extract?request.kilograms:null};
  const nextRecord=draft.sectionalTechProcesses.find(r=>r.id===record.id);
  if(nextRecord.state.honeyTransitions==null)nextRecord.state.honeyTransitions=[];
  if(!Array.isArray(nextRecord.state.honeyTransitions)||!Array.isArray(draft.extractions)||!Array.isArray(draft.records)||!Array.isArray(draft.auditLog))return fail('journal_missing');
  nextRecord.state.honeyTransitions.push(clone(evidence));nextRecord.updatedAt=at;
  if(extract){
   draft.extractions.push({id:transitionId,date:at.slice(0,10),createdAt:at,items:[{hiveId:request.hiveId,boxes:ids.slice(),kilograms:request.kilograms,frameIds:frameEvents.map(f=>f.frameId),returnedAt:null,sectional:{kind:'full-cycle-v1',transitionId,layoutId:old.id,bodyIds:ids.slice(),pairIds:[...pairs.keys()]}}]});
   const journalId=nextUniqueId(deps.makeId,used);if(!journalId)return fail('journal_id_unavailable');
   draft.records.push({id:journalId,date:at.slice(0,10),type:'Откачка мёда',hive:request.hiveId,family:'',text:request.kilograms+' кг · '+ids.length+' медовых корпусов',extractionId:transitionId,media:[]});
  }
  const auditId=nextUniqueId(deps.makeId,used);if(!auditId)return fail('audit_id_unavailable');
  draft.auditLog.push({id:auditId,type:extract?'sectional_honey_extracted':'sectional_honey_installed',at,hiveId:request.hiveId,transitionId,bodyIds:ids.slice()});
  const replayErrors=inspect(draft,deps);if(replayErrors.length)return fail('historical_replay_invalid',replayErrors);
  return {ok:true,kind:'unsaved_candidate',expectedRevisionId:request.expectedRevisionId,draft,evidence};
 }catch(error){return fail('full_honey_physical_candidate_failed',{message:error?.message||String(error)});}
}

window.PasekaSectionalOperationCoordinator=Object.freeze({PROFILE_ID,MODEL_VERSION,inspect,completeOP04,completeOP04SecondRow,completeOP05,completeOP06,completeOP07,completeOP07AdditionalHoneyPair,inspectSecondHoneyPairCandidate,availableSecondHoneyPairs,prepareFullHoneyPhysicalTransition});
})();