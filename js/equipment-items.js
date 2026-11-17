(()=>{'use strict';
const kinds=new Set(['bottom','cover','feeder','topRiser','plasticPlug','metalMeshPlug','technicalQueenExcluder','honeyQueenExcluder','meshDiaphragm']);
const conditions=new Set(['good','needs_repair','repair','retired']);
const eventTypes=new Set(['registered','moved','moved_to_storage','condition_changed']);
const plugKinds=new Set(['plasticPlug','metalMeshPlug']);
const stackKinds=new Set(['bottom','cover','feeder','topRiser']);
const diaphragmPositions=new Set(['lower-middle','middle-upper']);
function isObject(value){return !!value&&typeof value==='object'&&!Array.isArray(value)}
function rows(value){return Array.isArray(value)?value:Object.values(value||{})}
function clone(value){return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value))}
function commit(target,draft){for(const key of Object.keys(target))if(!(key in draft))delete target[key];Object.assign(target,draft)}
function ensure(state){
 if(!isObject(state))throw new Error('invalid_apiary_state');
 if(state.equipmentInventory!=null&&!isObject(state.equipmentInventory))throw new Error('invalid_equipment_inventory');
 const inv=state.equipmentInventory||(state.equipmentInventory={});
 if(inv.items!=null&&!isObject(inv.items))throw new Error('invalid_equipment_items');
 if(inv.itemEvents!=null&&!Array.isArray(inv.itemEvents))throw new Error('invalid_equipment_item_events');
 if(inv.items==null)inv.items={};
 if(inv.itemEvents==null)inv.itemEvents=[];
 return inv;
}
function allKnownIds(state){
 const ids=new Set(),add=value=>{if(typeof value==='string'&&value)ids.add(value)};
 for(const row of rows(state.hives))add(row?.id);
 for(const row of rows(state.families))add(row?.id);
 for(const row of rows(state.queens))add(row?.id);
 const inv=state.equipmentInventory||{};
 for(const id of Object.keys(inv.bodies||{}))add(id);
 for(const id of Object.keys(inv.items||{}))add(id);
 for(const event of inv.itemEvents||[])add(event?.id);
 for(const item of Object.values(inv.items||{}))for(const event of item?.events||[])add(event?.id);
 for(const layout of rows(state.layouts))for(const id of Object.values(layout?.corpusIds||{}))add(id);
 for(const layout of rows(state.sectionalLayouts)){
  add(layout?.id);
  for(const stack of layout?.stacks||[]){add(stack?.id);for(const boundary of stack?.boundaries||[])add(boundary?.id)}
  for(const section of layout?.sections||[]){add(section?.id);for(const bodyId of section?.broodBodyIds||[])add(bodyId);for(const opening of section?.openings||[])add(opening?.id)}
  for(const bodyId of layout?.honeyStack?.bodyIds||[])add(bodyId);
 }
 return ids;
}
function nextUniqueId(makeId,used){
 if(typeof makeId!=='function')return null;
 let value;try{value=String(makeId()||'')}catch(error){return null}
 if(!value||value.length>160||used.has(value))return null;
 used.add(value);return value;
}
function normalizeFootprint(input){
 if(!Array.isArray(input)||input.length!==2)return null;
 const parts=input.map(part=>{
  if(!isObject(part))return null;
  const bodyId=String(part.bodyId||'').trim(),coverage=part.coverage;
  if(!bodyId||bodyId.length>160||!['FULL','HALF'].includes(coverage))return null;
  return {bodyId,coverage};
 });
 if(parts.some(part=>!part)||new Set(parts.map(part=>part.bodyId)).size!==2||parts.filter(part=>part.coverage==='FULL').length!==1||parts.filter(part=>part.coverage==='HALF').length!==1)return null;
 return parts;
}
function normalizeLocation(input,kind){
 if(!isObject(input)||!['storage','hive'].includes(input.type))return null;
 if(input.type==='storage'){
  if(Object.keys(input).some(key=>!['type','label'].includes(key)))return null;
  const label=String(input.label||'').trim();
  return label&&label.length<=160?{type:'storage',label}:null;
 }
 if(Object.keys(input).some(key=>!['type','hiveId','stackId','bodyId','openingId','positionLabel','footprint'].includes(key)))return null;
 const hiveId=String(input.hiveId||'').trim();
 if(!hiveId||hiveId.length>120)return null;
 const result={type:'hive',hiveId};
 for(const key of ['stackId','bodyId','openingId','positionLabel']){
  if(input[key]!=null){const value=String(input[key]).trim();if(!value||value.length>160)return null;result[key]=value}
 }
 if(kind==='honeyQueenExcluder'){
  const footprint=normalizeFootprint(input.footprint);
  if(!footprint||result.stackId||result.bodyId||result.openingId||result.positionLabel)return null;
  result.footprint=footprint;
  return result;
 }else if(input.footprint!==undefined)return null;
 if(plugKinds.has(kind)||kind==='technicalQueenExcluder'){
  if(!result.bodyId||!result.openingId||result.stackId||result.positionLabel)return null;
 }else if(kind==='meshDiaphragm'){
  if(!result.stackId||!diaphragmPositions.has(result.positionLabel)||result.bodyId||result.openingId)return null;
 }else if(stackKinds.has(kind)){
  if(!result.stackId||result.bodyId||result.openingId||result.positionLabel)return null;
 }else return null;
 return result;
}
function findLayout(state,hiveId){
 const layouts=rows(state?.sectionalLayouts);
 return layouts.find(layout=>layout?.hiveId===hiveId)||null;
}
function getSections(layout){return Array.isArray(layout?.sections)?layout.sections:[]}
function getStacks(layout){return Array.isArray(layout?.stacks)?layout.stacks:[]}
function layoutContainsBody(layout,bodyId){return getSections(layout).some(section=>Array.isArray(section?.broodBodyIds)&&section.broodBodyIds.includes(bodyId))}
function findOpening(layout,bodyId,openingId){
 for(const section of getSections(layout))for(const opening of Array.isArray(section?.openings)?section.openings:[])if(opening?.id===openingId&&opening?.bodyId===bodyId)return opening;
 return null;
}
function validateLocationReferences(state,item,location){
 const errors=[],inv=state?.equipmentInventory||{},add=(code,details={})=>errors.push({code,details:{itemId:item?.id||null,...details}});
 if(!rows(state?.hives).some(hive=>hive?.id===location.hiveId)){add('item_hive_reference_missing',{hiveId:location.hiveId});return errors}
 const layout=findLayout(state,location.hiveId);
 if(!layout){add('item_sectional_layout_missing',{hiveId:location.hiveId});return errors}
 if(location.stackId&&!getStacks(layout).some(stack=>stack?.id===location.stackId))add('item_stack_reference_missing',{stackId:location.stackId});
 if(location.bodyId){
  const body=inv.bodies?.[location.bodyId];
  if(!body)add('item_body_reference_missing',{bodyId:location.bodyId});
  else {
   if(body.kind!=='brood')add('item_body_kind_mismatch',{bodyId:location.bodyId,kind:body.kind});
   if(body.spec?.profileId&&layout.profileId&&body.spec.profileId!==layout.profileId)add('item_body_profile_mismatch',{bodyId:location.bodyId,profileId:body.spec.profileId,layoutProfileId:layout.profileId});
   if(body.spec?.framesPerBox!=null&&body.spec.framesPerBox!==6)add('item_body_frame_capacity_mismatch',{bodyId:location.bodyId,framesPerBox:body.spec.framesPerBox});
  }
  if(!layoutContainsBody(layout,location.bodyId))add('item_body_layout_reference_missing',{bodyId:location.bodyId});
 }
 if(location.openingId){
  const opening=findOpening(layout,location.bodyId,location.openingId);
  if(!opening)add('item_opening_reference_missing',{bodyId:location.bodyId,openingId:location.openingId});
  else if(opening.diameterMm!==50)add('item_opening_diameter_mismatch',{bodyId:location.bodyId,openingId:location.openingId,diameterMm:opening.diameterMm??null});
 }
 if(location.footprint){
  for(const part of location.footprint){
   if(!isObject(part)){add('item_footprint_part_invalid');continue}
   const body=inv.bodies?.[part.bodyId];
   if(!body)add('item_footprint_body_missing',{bodyId:part.bodyId});
   else {
    if(body.kind!=='brood')add('item_footprint_body_kind_mismatch',{bodyId:part.bodyId,kind:body.kind});
    if(body.spec?.profileId&&layout.profileId&&body.spec.profileId!==layout.profileId)add('item_footprint_body_profile_mismatch',{bodyId:part.bodyId,profileId:body.spec.profileId,layoutProfileId:layout.profileId});
    if(body.spec?.framesPerBox!=null&&body.spec.framesPerBox!==6)add('item_footprint_body_frame_capacity_mismatch',{bodyId:part.bodyId,framesPerBox:body.spec.framesPerBox});
   }
   if(!layoutContainsBody(layout,part.bodyId))add('item_footprint_body_layout_missing',{bodyId:part.bodyId});
   if(!getSections(layout).some(section=>section?.upperBroodBodyId===part.bodyId))add('item_footprint_upper_body_reference_missing',{bodyId:part.bodyId});
  }
 }
 if(item?.kind==='meshDiaphragm'&&location.stackId){
  const stack=getStacks(layout).find(row=>row?.id===location.stackId);
  if(stack&&(!Array.isArray(stack.boundaries)||!stack.boundaries.includes(location.positionLabel)))add('item_diaphragm_boundary_missing',{stackId:location.stackId,positionLabel:location.positionLabel});
 }
 return errors;
}
function placementConflicts(state,item,location){
 const errors=[],items=Object.values(state?.equipmentInventory?.items||{}),add=(code,other)=>errors.push({code,details:{itemId:item.id,otherItemId:other.id}});
 for(const other of items){
  if(!other||other.id===item.id||other.location?.type!=='hive'||other.location.hiveId!==location.hiveId)continue;
  const sameOpening=location.bodyId&&location.openingId&&other.location.bodyId===location.bodyId&&other.location.openingId===location.openingId;
  if(sameOpening&&item.kind==='technicalQueenExcluder'&&other.kind==='technicalQueenExcluder')add('technical_opening_grid_occupied',other);
  if(sameOpening&&plugKinds.has(item.kind)&&plugKinds.has(other.kind))add('technical_opening_plug_occupied',other);
  if(item.kind==='meshDiaphragm'&&other.kind==='meshDiaphragm'&&other.location.stackId===location.stackId&&other.location.positionLabel===location.positionLabel)add('diaphragm_boundary_occupied',other);
  if(stackKinds.has(item.kind)&&other.kind===item.kind&&other.location.stackId===location.stackId)add('stack_accessory_occupied',other);
  if(item.kind==='honeyQueenExcluder'&&other.kind==='honeyQueenExcluder'){
   const a=location.footprint.map(part=>part.bodyId+':'+part.coverage).sort().join('|');
   const otherFootprint=Array.isArray(other.location.footprint)?other.location.footprint.filter(part=>isObject(part)&&part.bodyId&&part.coverage):[];
   const b=otherFootprint.map(part=>part.bodyId+':'+part.coverage).sort().join('|');
   if(b&&a===b)add('honey_excluder_footprint_occupied',other);
  }
 }
 return errors;
}
function appendEvent(inv,item,type,details,at,makeId,used){
 if(!Array.isArray(item.events)||!Array.isArray(inv.itemEvents))return {ok:false,error:'invalid_item_event_journal'};
 const eventId=nextUniqueId(makeId,used);
 if(!eventId)return {ok:false,error:'duplicate_or_invalid_event_id'};
 const timestamp=at||new Date().toISOString();
 if(!Number.isFinite(Date.parse(timestamp)))return {ok:false,error:'invalid_event_timestamp'};
 const event={id:eventId,itemId:item.id,type,at:timestamp,...details};
 item.events.push(event);inv.itemEvents.push(event);
 return {ok:true,event};
}
function transact(state,fn){
 let draft;try{draft=clone(state)}catch(error){return {ok:false,error:'clone_failed',message:error.message}}
 let result;try{result=fn(draft)}catch(error){return {ok:false,error:'transaction_failed',message:error.message}}
 if(!result?.ok)return result;
 commit(state,draft);return result;
}
function registerUnsafe(state,request,makeId,now){
 const inv=ensure(state),kind=request?.kind,storageLocation=typeof request?.storageLocation==='string'?request.storageLocation.trim():'',label=typeof request?.label==='string'?request.label.trim():'',notes=typeof request?.notes==='string'?request.notes.trim():'';
 if(!kinds.has(kind))return {ok:false,error:'invalid_item_kind'};
 if(!storageLocation||storageLocation.length>160||label.length>80||notes.length>500)return {ok:false,error:'invalid_details'};
 const used=allKnownIds(state),id=nextUniqueId(makeId,used);
 if(!id)return {ok:false,error:'duplicate_or_invalid_item_id'};
 const timestamp=now||new Date().toISOString();
 if(!Number.isFinite(Date.parse(timestamp)))return {ok:false,error:'invalid_event_timestamp'};
 const item={id,kind,label,condition:'good',location:{type:'storage',label:storageLocation},notes,registeredAt:timestamp,updatedAt:timestamp,events:[]};
 inv.items[id]=item;
 const event=appendEvent(inv,item,'registered',{location:item.location},item.registeredAt,makeId,used);
 if(!event.ok)return event;
 return {ok:true,item};
}
function register(state,request,makeId,now){return transact(state,draft=>registerUnsafe(draft,request,makeId,now))}
function placeUnsafe(state,request,makeId,now){
 const inv=ensure(state),item=inv.items[String(request?.itemId||'')];
 if(!item)return {ok:false,error:'item_missing'};
 const location=normalizeLocation(request?.location,item.kind);
 if(!location)return {ok:false,error:item.kind==='honeyQueenExcluder'?'invalid_footprint':'invalid_location'};
 if(location.type==='hive'){
  if(item.condition!=='good')return {ok:false,error:'item_not_installable'};
  const refs=validateLocationReferences(state,item,location);
  if(refs.length)return {ok:false,error:'physical_reference_invalid',details:refs};
  const conflicts=placementConflicts(state,item,location);
  if(conflicts.length)return {ok:false,error:conflicts[0].code,details:conflicts[0].details};
 }
 if(!Array.isArray(item.events)||!Array.isArray(inv.itemEvents))return {ok:false,error:'invalid_item_event_journal'};
 const previous=item.location;
 if(JSON.stringify(previous)===JSON.stringify(location))return {ok:false,error:'location_unchanged'};
 item.location=location;item.updatedAt=now||new Date().toISOString();
 const event=appendEvent(inv,item,location.type==='storage'?'moved_to_storage':'moved',{from:previous,to:location},item.updatedAt,makeId,allKnownIds(state));
 if(!event.ok)return event;
 return {ok:true,item,previous};
}
function place(state,request,makeId,now){return transact(state,draft=>placeUnsafe(draft,request,makeId,now))}
function updateCondition(state,request,makeId,now){
 return transact(state,draft=>{
  const inv=ensure(draft),item=inv.items[String(request?.itemId||'')];
  if(!item)return {ok:false,error:'item_missing'};
  if(!conditions.has(request?.condition))return {ok:false,error:'invalid_condition'};
  if(item.condition===request.condition)return {ok:false,error:'condition_unchanged'};
  if(item.location?.type==='hive'&&request.condition==='repair')return {ok:false,error:'cannot_repair_installed'};
  if(item.location?.type==='hive'&&request.condition==='retired')return {ok:false,error:'cannot_retire_installed'};
  if(!Array.isArray(item.events)||!Array.isArray(inv.itemEvents))return {ok:false,error:'invalid_item_event_journal'};
  const previous=item.condition;item.condition=request.condition;item.updatedAt=now||new Date().toISOString();
  const event=appendEvent(inv,item,'condition_changed',{from:previous,to:item.condition},item.updatedAt,makeId,allKnownIds(draft));
  if(!event.ok)return event;
  return {ok:true,item};
 });
}
function inspect(state){
 const errors=[],inv=state?.equipmentInventory;if(!inv)return errors;
 if(inv.items!=null&&!isObject(inv.items)){errors.push({code:'invalid_equipment_items'});return errors}
 if(inv.itemEvents!=null&&!Array.isArray(inv.itemEvents)){errors.push({code:'invalid_equipment_item_events'});return errors}
 if(Object.keys(inv.items||{}).length&&!Array.isArray(inv.itemEvents)){errors.push({code:'equipment_item_global_journal_missing'});return errors}
 const globalEvents=Array.isArray(inv.itemEvents)?inv.itemEvents:null,usedEventIds=new Set(),itemEventIds=new Set(),occupied=new Map();
 for(const [id,item] of Object.entries(inv.items||{})){
  if(!isObject(item)||item.id!==id){errors.push({code:'invalid_item_identity',details:{itemId:id}});continue}
  if(!kinds.has(item.kind))errors.push({code:'invalid_item_kind',details:{itemId:id,kind:item.kind}});
  if(!conditions.has(item.condition))errors.push({code:'invalid_item_condition',details:{itemId:id,condition:item.condition}});
  if(typeof item.label!=='string'||item.label.length>80)errors.push({code:'invalid_item_label',details:{itemId:id}});
  if(typeof item.notes!=='string'||item.notes.length>500)errors.push({code:'invalid_item_notes',details:{itemId:id}});
  if(!Number.isFinite(Date.parse(item.registeredAt))||!Number.isFinite(Date.parse(item.updatedAt)))errors.push({code:'invalid_item_timestamp',details:{itemId:id}});
  if(!normalizeLocation(item.location,item.kind))errors.push({code:'invalid_item_location',details:{itemId:id}});
  if(!Array.isArray(item.events)){errors.push({code:'invalid_item_events',details:{itemId:id}});continue}
  for(const event of item.events){
   if(!isObject(event)||!event.id||event.itemId!==id||!eventTypes.has(event.type)||!Number.isFinite(Date.parse(event.at))){errors.push({code:'invalid_item_event',details:{itemId:id,eventId:event?.id||null}});continue}
   if(itemEventIds.has(event.id))errors.push({code:'duplicate_item_event_id',details:{eventId:event.id}});
   else itemEventIds.add(event.id);
   if(globalEvents&&!globalEvents.some(row=>row?.id===event.id&&row?.itemId===id))errors.push({code:'item_event_missing_from_global_log',details:{eventId:event.id,itemId:id}});
  }
  const loc=item.location;
  if(loc?.type==='hive'){
   let key='';
   if(item.kind==='technicalQueenExcluder'){key='grid|'+loc.hiveId+'|'+loc.bodyId+'|'+loc.openingId}
   else if(plugKinds.has(item.kind)){key='plug|'+loc.hiveId+'|'+loc.bodyId+'|'+loc.openingId}
   else if(item.kind==='meshDiaphragm')key='diaphragm|'+loc.hiveId+'|'+loc.stackId+'|'+loc.positionLabel;
   else if(stackKinds.has(item.kind))key='stack|'+loc.hiveId+'|'+item.kind+'|'+loc.stackId;
   else if(item.kind==='honeyQueenExcluder'&&Array.isArray(loc.footprint)&&loc.footprint.every(part=>isObject(part)&&part.bodyId&&part.coverage))key='honey|'+loc.hiveId+'|'+loc.footprint.map(part=>part.bodyId+':'+part.coverage).sort().join('|');
   if(key){if(occupied.has(key))errors.push({code:'duplicate_item_placement',details:{itemIds:[occupied.get(key),id]}});else occupied.set(key,id)}
  }
 }
 if(globalEvents){
  for(const event of globalEvents){
   if(!isObject(event)||!event.id||!eventTypes.has(event.type)||!Number.isFinite(Date.parse(event.at))||!inv.items?.[event.itemId]){errors.push({code:'invalid_equipment_item_event',details:{eventId:event?.id||null,itemId:event?.itemId||null}});continue}
   if(usedEventIds.has(event.id))errors.push({code:'duplicate_equipment_item_event_id',details:{eventId:event.id}});
   else usedEventIds.add(event.id);
   if(!itemEventIds.has(event.id))errors.push({code:'orphan_equipment_item_event',details:{eventId:event.id,itemId:event.itemId}});
  }
  for(const id of itemEventIds)if(!usedEventIds.has(id))errors.push({code:'item_event_missing_from_global_log',details:{eventId:id}});
 }
 return errors;
}
function validateReferences(state){
 const errors=[],inv=state?.equipmentInventory;if(!inv?.items)return errors;
 for(const item of Object.values(inv.items)){
  if(item?.location?.type!=='hive')continue;
  errors.push(...validateLocationReferences(state,item,item.location));
 }
 return errors;
}
window.PasekaEquipmentItems=Object.freeze({kinds:[...kinds],conditions:[...conditions],ensure,register,place,updateCondition,inspect,validateReferences,normalizeLocation});
})();