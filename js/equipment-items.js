(()=>{'use strict';
const kinds=new Set(['bottom','cover','feeder','topRiser','plasticPlug','metalMeshPlug','technicalQueenExcluder','honeyQueenExcluder','meshDiaphragm']);
const conditions=new Set(['good','needs_repair','repair','retired']);
const eventTypes=new Set(['registered','moved','condition_changed']);
const plugKinds=new Set(['plasticPlug','metalMeshPlug']);
const openingKinds=new Set(['plasticPlug','metalMeshPlug','technicalQueenExcluder']);
const isObject=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const nonEmpty=value=>typeof value==='string'&&value.trim().length>0;
const unique=values=>new Set(values).size===values.length;
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
function sectionalLayoutsForHive(state,hiveId){return Array.isArray(state?.sectionalLayouts)?state.sectionalLayouts.filter(layout=>layout?.hiveId===hiveId):[]}
function layoutBodyIds(layout){
 const ids=[];
 for(const section of Array.isArray(layout?.sections)?layout.sections:[])for(const id of Array.isArray(section?.broodBodyIds)?section.broodBodyIds:[])ids.push(id);
 for(const id of Array.isArray(layout?.honeyStack?.bodyIds)?layout.honeyStack.bodyIds:[])ids.push(id);
 return ids;
}
function bodyPlacements(state,bodyId){
 const rows=[];
 for(const [hiveId,layout] of Object.entries(state?.layouts||{}))if(Object.values(layout?.corpusIds||{}).includes(bodyId))rows.push({hiveId,source:'legacy'});
 for(const layout of Array.isArray(state?.sectionalLayouts)?state.sectionalLayouts:[])if(layoutBodyIds(layout).includes(bodyId))rows.push({hiveId:layout.hiveId,source:'sectional',layoutId:layout.id});
 return rows;
}
function layoutHasOpening(layout,bodyId,openingId,connectionId){
 for(const section of Array.isArray(layout?.sections)?layout.sections:[]){
  if(!Array.isArray(section?.broodBodyIds)||!section.broodBodyIds.includes(bodyId))continue;
  if((Array.isArray(section.openings)?section.openings:[]).some(opening=>opening?.bodyId===bodyId&&opening?.id===openingId))return true;
 }
 for(const connection of Array.isArray(layout?.technicalConnections)?layout.technicalConnections:[]){
  if(connectionId&&connection?.id!==connectionId)continue;
  for(const side of ['from','to']){const opening=connection?.[side];if(opening?.bodyId===bodyId&&opening?.openingId===openingId)return true}
 }
 for(const row of [...(Array.isArray(layout?.temporaryQueenIsolation)?layout.temporaryQueenIsolation:[]),...(Array.isArray(layout?.closedOpenings)?layout.closedOpenings:[])])if(row?.bodyId===bodyId&&row?.openingId===openingId)return true;
 return false;
}
function normalizeLocation(input,kind){
 if(!isObject(input)||!['storage','hive'].includes(input.type))return null;
 if(input.type==='storage'){const label=String(input.label||'').trim();return label&&label.length<=160?{type:'storage',label}:null}
 const hiveId=String(input.hiveId||'').trim();if(!hiveId||hiveId.length>120)return null;
 const result={type:'hive',hiveId};
 for(const key of ['sectionId','bodyId','openingId','connectionId','positionLabel']){
  if(input[key]!=null){const value=String(input[key]).trim();if(!value||value.length>160)return null;result[key]=value}
 }
 if(input.footprint!==undefined){
  if(kind!=='honeyQueenExcluder'||!Array.isArray(input.footprint)||input.footprint.length!==2)return null;
  const footprint=input.footprint.map(part=>{
   if(!isObject(part))return null;
   const bodyId=String(part.bodyId||'').trim(),coverage=part.coverage;
   if(!bodyId||bodyId.length>160||!['FULL','HALF'].includes(coverage))return null;
   return {bodyId,coverage};
  });
  if(footprint.some(part=>!part)||!unique(footprint.map(part=>part.bodyId))||footprint.filter(part=>part.coverage==='FULL').length!==1||footprint.filter(part=>part.coverage==='HALF').length!==1)return null;
  result.footprint=footprint;
 }else if(kind==='honeyQueenExcluder')return null;
 if(kind==='honeyQueenExcluder'&&(result.sectionId||result.bodyId||result.openingId||result.connectionId||result.positionLabel))return null;
 if(openingKinds.has(kind)&&(!result.bodyId||!result.openingId))return null;
 if(kind==='technicalQueenExcluder'&&!result.connectionId)return null;
 if(kind==='meshDiaphragm'&&!result.positionLabel)return null;
 if(['bottom','cover'].includes(kind)&&!result.sectionId&&!result.positionLabel)return null;
 if(['feeder','topRiser'].includes(kind)&&!result.sectionId&&!result.bodyId&&!result.positionLabel)return null;
 return result;
}
function validateLocationReferences(state,item,location){
 const errors=[],add=(code,details={})=>errors.push({code,details}),hiveId=location.hiveId;
 if(!(Array.isArray(state.hives)?state.hives:[]).some(hive=>hive?.id===hiveId))add('item_hive_reference_missing',{itemId:item.id,hiveId});
 const layouts=sectionalLayoutsForHive(state,hiveId);
 if(layouts.length>1)add('item_sectional_layout_ambiguous',{itemId:item.id,hiveId,layoutIds:layouts.map(layout=>layout.id||null)});
 const layout=layouts.length===1?layouts[0]:null;
 const referencedBodyIds=[...(location.bodyId?[location.bodyId]:[]),...(Array.isArray(location.footprint)?location.footprint.map(part=>part.bodyId):[])];
 for(const bodyId of referencedBodyIds){
  const body=state.equipmentInventory?.bodies?.[bodyId];
  if(!isObject(body)||body.id!==bodyId)add('item_body_inventory_reference_missing',{itemId:item.id,bodyId});
  const placements=bodyPlacements(state,bodyId);
  if(!placements.some(row=>row.hiveId===hiveId))add('item_body_reference_missing',{itemId:item.id,bodyId,hiveId});
  if(placements.length>1)add('item_body_reference_ambiguous',{itemId:item.id,bodyId,placements});
 }
 if(location.sectionId&&(!layout||!(Array.isArray(layout.sections)?layout.sections:[]).some(section=>section?.id===location.sectionId)))add('item_section_reference_missing',{itemId:item.id,sectionId:location.sectionId,hiveId});
 if(location.connectionId&&(!layout||!(Array.isArray(layout.technicalConnections)?layout.technicalConnections:[]).some(connection=>connection?.id===location.connectionId)))add('item_connection_reference_missing',{itemId:item.id,connectionId:location.connectionId,hiveId});
 if(location.openingId&&(!layout||!layoutHasOpening(layout,location.bodyId,location.openingId,location.connectionId)))add('item_opening_reference_missing',{itemId:item.id,bodyId:location.bodyId,openingId:location.openingId,connectionId:location.connectionId??null,hiveId});
 if(location.positionLabel&&item.kind==='meshDiaphragm'){
  const positions=(Array.isArray(layout?.column?.meshDiaphragms)?layout.column.meshDiaphragms:[]).map(row=>row?.between);
  if(!layout||!positions.includes(location.positionLabel))add('item_position_reference_missing',{itemId:item.id,positionLabel:location.positionLabel,hiveId});
 }
 if(Array.isArray(location.footprint)){
  const layoutIds=new Set(layout?layoutBodyIds(layout):[]);
  for(const part of location.footprint){
   const placements=bodyPlacements(state,part.bodyId);
   if(layout&&!layoutIds.has(part.bodyId))add('item_footprint_body_reference_missing',{itemId:item.id,bodyId:part.bodyId,hiveId});
   else if(!layout&&!placements.some(row=>row.hiveId===hiveId))add('item_footprint_body_reference_missing',{itemId:item.id,bodyId:part.bodyId,hiveId});
  }
 }
 return errors;
}
function transact(state,fn){
 let draft;try{draft=clone(state)}catch(error){return {ok:false,error:'clone_failed',message:error.message}}
 let result;try{result=fn(draft)}catch(error){return {ok:false,error:'transaction_failed',message:error.message}}
 if(!result?.ok)return result;commit(state,draft);return result;
}
function allEventIds(inv){
 const ids=new Set();
 for(const event of Array.isArray(inv.itemEvents)?inv.itemEvents:[])if(event?.id)ids.add(event.id);
 for(const item of Object.values(inv.items||{}))for(const event of Array.isArray(item?.events)?item.events:[])if(event?.id)ids.add(event.id);
 return ids;
}
function addEvent(inv,item,type,details,at,makeId){
 const id=String(makeId()||''),used=allEventIds(inv);
 if(!id||id.length>160||used.has(id)||inv.items[id]||inv.bodies?.[id])return {ok:false,error:'duplicate_or_invalid_item_event_id'};
 const event={id,itemId:item.id,type,at:at||new Date().toISOString(),...details};
 item.events=Array.isArray(item.events)?item.events:[];
 item.events.push(event);
 inv.itemEvents.push(clone(event));
 return {ok:true,event};
}
function registerUnsafe(state,request,makeId,now){
 if(state.sectionalLayouts!=null&&!Array.isArray(state.sectionalLayouts))return {ok:false,error:'invalid_sectional_layout_collection'};
 const inv=ensure(state),kind=request?.kind,storageLocation=String(request?.storageLocation||'').trim(),notes=String(request?.notes||'').trim();
 if(!kinds.has(kind))return {ok:false,error:'invalid_item_kind'};
 if(!storageLocation||storageLocation.length>160||notes.length>500)return {ok:false,error:'invalid_details'};
 if(typeof makeId!=='function')return {ok:false,error:'id_generator_required'};
 const id=String(makeId()||'');
 const sectionalBodyIds=(Array.isArray(state.sectionalLayouts)?state.sectionalLayouts:[]).flatMap(layout=>layoutBodyIds(layout));
 const legacyBodyIds=Object.values(state.layouts||{}).flatMap(layout=>Object.values(layout?.corpusIds||{}));
 if(!id||id.length>160||inv.items[id]||inv.bodies?.[id]||allEventIds(inv).has(id)||legacyBodyIds.includes(id)||sectionalBodyIds.includes(id)||(Array.isArray(state.sectionalLayouts)&&state.sectionalLayouts.some(layout=>layout?.id===id)))return {ok:false,error:'duplicate_item_id'};
 const time=now||new Date().toISOString(),item={id,kind,condition:'good',location:{type:'storage',label:storageLocation},notes,registeredAt:time,updatedAt:time,events:[]};
 inv.items[id]=item;
 const event=addEvent(inv,item,'registered',{location:item.location},time,makeId);
 if(!event.ok)return event;
 return {ok:true,item};
}
function register(state,request,makeId,now){return transact(state,draft=>registerUnsafe(draft,request,makeId,now))}
function placeUnsafe(state,request,makeId,now){
 const inv=ensure(state),item=inv.items[String(request?.itemId||'')];
 if(!item)return {ok:false,error:'item_missing'};
 const location=normalizeLocation(request?.location,item.kind);
 if(!location)return {ok:false,error:item.kind==='honeyQueenExcluder'?'invalid_footprint_or_location':'invalid_location'};
 if(location.type==='hive'&&(item.condition==='repair'||item.condition==='retired'))return {ok:false,error:'item_not_installable'};
 if(location.type==='hive'){
  const referenceErrors=validateLocationReferences(state,item,location);
  if(referenceErrors.length)return {ok:false,error:referenceErrors[0].code,details:referenceErrors};
  if(plugKinds.has(item.kind)){
   const conflict=Object.values(inv.items).find(other=>other.id!==item.id&&plugKinds.has(other.kind)&&other.location?.type==='hive'&&other.location.hiveId===location.hiveId&&other.location.bodyId===location.bodyId&&other.location.openingId===location.openingId);
   if(conflict)return {ok:false,error:'opening_occupied',details:{itemId:conflict.id,openingId:location.openingId}};
  }
 }
 const previous=item.location;item.location=location;item.updatedAt=now||new Date().toISOString();
 const event=addEvent(inv,item,'moved',{from:previous,to:location},item.updatedAt,makeId);
 if(!event.ok)return event;
 return {ok:true,item,previous};
}
function place(state,request,makeId,now){return transact(state,draft=>placeUnsafe(draft,request,makeId,now))}
function updateCondition(state,request,makeId,now){
 return transact(state,draft=>{
  const inv=ensure(draft),item=inv.items[String(request?.itemId||'')];
  if(!item)return {ok:false,error:'item_missing'};
  if(!conditions.has(request?.condition))return {ok:false,error:'invalid_condition'};
  if(request.condition==='repair'&&item.location?.type==='hive')return {ok:false,error:'cannot_repair_installed'};
  if(request.condition==='retired'&&item.location?.type==='hive')return {ok:false,error:'cannot_retire_installed'};
  const previous=item.condition;item.condition=request.condition;item.updatedAt=now||new Date().toISOString();
  const event=addEvent(inv,item,'condition_changed',{from:previous,to:item.condition},item.updatedAt,makeId);
  if(!event.ok)return event;
  return {ok:true,item};
 });
}
function inspect(state){
 const errors=[],inv=state?.equipmentInventory;
 if(state?.sectionalLayouts!=null&&!Array.isArray(state.sectionalLayouts))errors.push({code:'invalid_sectional_layout_collection'});
 if(!inv)return errors;
 if(!isObject(inv)){errors.push({code:'invalid_equipment_inventory'});return errors}
 if(inv.items!=null&&!isObject(inv.items)){errors.push({code:'invalid_equipment_items'});return errors}
 if(inv.itemEvents!=null&&!Array.isArray(inv.itemEvents)){errors.push({code:'invalid_equipment_item_events'});return errors}
 const items=isObject(inv.items)?inv.items:{},globalEvents=Array.isArray(inv.itemEvents)?inv.itemEvents:[];
 const globalById=new Map(),seenEventIds=new Set(),occupiedOpenings=new Map();
 for(const event of globalEvents){
  if(!isObject(event)||!nonEmpty(event.id)||!nonEmpty(event.itemId)||!eventTypes.has(event.type)||!Number.isFinite(Date.parse(event.at||''))){errors.push({code:'invalid_equipment_item_event'});continue}
  if(seenEventIds.has(event.id))errors.push({code:'duplicate_equipment_item_event_id',details:{eventId:event.id}});
  if(items[event.id]||inv.bodies?.[event.id])errors.push({code:'equipment_item_event_id_collision',details:{eventId:event.id}});
  seenEventIds.add(event.id);globalById.set(event.id,event);
  if(!items[event.itemId])errors.push({code:'orphan_equipment_item_event',details:{eventId:event.id,itemId:event.itemId}});
  else if(!Array.isArray(items[event.itemId].events)||!items[event.itemId].events.some(row=>row?.id===event.id))errors.push({code:'item_event_global_mismatch',details:{itemId:event.itemId,eventId:event.id}});
 }
 for(const [id,item] of Object.entries(items)){
  if(!isObject(item)||item.id!==id){errors.push({code:'invalid_item_identity',details:{itemId:id}});continue}
  if(!kinds.has(item.kind))errors.push({code:'invalid_item_kind',details:{itemId:id,kind:item.kind}});
  if(!conditions.has(item.condition))errors.push({code:'invalid_item_condition',details:{itemId:id,condition:item.condition}});
  if(!normalizeLocation(item.location,item.kind))errors.push({code:'invalid_item_location',details:{itemId:id}});
  if(!Array.isArray(item.events))errors.push({code:'invalid_item_events',details:{itemId:id}});
  else for(const event of item.events){
   if(!isObject(event)||event.itemId!==id||!nonEmpty(event.id)||!eventTypes.has(event.type)||!Number.isFinite(Date.parse(event.at||'')))errors.push({code:'invalid_item_event',details:{itemId:id}});
   else if(!globalById.has(event.id)||globalById.get(event.id).itemId!==id)errors.push({code:'item_event_global_mismatch',details:{itemId:id,eventId:event.id}});
  }
  const location=item.location;
  if(location?.type==='hive'&&['repair','retired'].includes(item.condition))errors.push({code:'unusable_item_installed',details:{itemId:id,condition:item.condition}});
  if(location?.type==='hive'&&plugKinds.has(item.kind)&&location.bodyId&&location.openingId){
   const key=location.hiveId+'|'+location.bodyId+'|'+location.openingId;
   if(occupiedOpenings.has(key))errors.push({code:'item_opening_occupied',details:{itemIds:[occupiedOpenings.get(key),id],bodyId:location.bodyId,openingId:location.openingId}});
   else occupiedOpenings.set(key,id);
  }
 }
 if(Object.keys(items).length&&!Array.isArray(inv.itemEvents))errors.push({code:'equipment_item_event_journal_required'});
 return errors;
}
function validateReferences(state){
 const errors=[],inv=state?.equipmentInventory;
 if(!inv||!isObject(inv)||!isObject(inv.items))return errors;
 for(const item of Object.values(inv.items)){
  if(!isObject(item)||item.location?.type!=='hive')continue;
  const normalized=normalizeLocation(item.location,item.kind);
  if(!normalized){errors.push({code:'invalid_item_location',details:{itemId:item.id}});continue}
  errors.push(...validateLocationReferences(state,item,normalized));
 }
 return errors;
}
window.PasekaEquipmentItems=Object.freeze({kinds:[...kinds],conditions:[...conditions],ensure,register,place,updateCondition,inspect,validateReferences});
})();