(()=>{'use strict';
const kinds=new Set(['bottom','cover','feeder','topRiser','plasticPlug','metalMeshPlug','technicalQueenExcluder','honeyQueenExcluder','meshDiaphragm']);
const conditions=new Set(['good','needs_repair','repair','retired']);
const locationTypes=new Set(['storage','hive']);
function clone(value){return typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value))}
function commit(target,draft){for(const key of Object.keys(target))if(!(key in draft))delete target[key];Object.assign(target,draft)}
function ensure(state){
 if(!state||typeof state!=='object'||Array.isArray(state))throw new Error('invalid_apiary_state');
 if(state.equipmentInventory!=null&&(typeof state.equipmentInventory!=='object'||Array.isArray(state.equipmentInventory)))throw new Error('invalid_equipment_inventory');
 const inv=state.equipmentInventory||(state.equipmentInventory={});
 if(inv.items!=null&&(typeof inv.items!=='object'||Array.isArray(inv.items)))throw new Error('invalid_equipment_items');
 if(inv.itemEvents!=null&&!Array.isArray(inv.itemEvents))throw new Error('invalid_equipment_item_events');
 if(inv.items==null)inv.items={};
 if(inv.itemEvents==null)inv.itemEvents=[];
 return inv;
}
function addEvent(inv,item,type,details,at,makeId){
 const event={id:makeId(),itemId:item.id,type,at:at||new Date().toISOString(),...details};
 item.events=Array.isArray(item.events)?item.events:[];
 item.events.push(event);if(item.events.length>300)item.events=item.events.slice(-300);
 inv.itemEvents.push(event);if(inv.itemEvents.length>1000)inv.itemEvents=inv.itemEvents.slice(-1000);
}
function normalizeLocation(input,kind){
 if(!input||typeof input!=='object'||Array.isArray(input)||!locationTypes.has(input.type))return null;
 if(input.type==='storage'){
  const label=String(input.label||'').trim();
  return label&&label.length<=160?{type:'storage',label}:null;
 }
 const hiveId=String(input.hiveId||'').trim();
 if(!hiveId||hiveId.length>120)return null;
 const result={type:'hive',hiveId};
 for(const key of ['sectionId','stackId','bodyId','openingId','connectionId','positionLabel']){
  if(input[key]!=null){const value=String(input[key]).trim();if(!value||value.length>160)return null;result[key]=value;}
 }
 if(kind==='honeyQueenExcluder'){
  if(input.footprint!==undefined){
   const footprint=input.footprint;
   if(!Array.isArray(footprint)||footprint.length!==2||result.bodyId||result.sectionId||result.openingId||result.connectionId)return null;
   const normalized=footprint.map(part=>{
    if(!part||typeof part!=='object'||Array.isArray(part))return null;
    const bodyId=String(part.bodyId||'').trim(),coverage=part.coverage;
    if(!bodyId||bodyId.length>160||!['FULL','HALF'].includes(coverage))return null;
    return {bodyId,coverage};
   });
   if(normalized.some(x=>!x)||new Set(normalized.map(x=>x.bodyId)).size!==2||normalized.filter(x=>x.coverage==='FULL').length!==1||normalized.filter(x=>x.coverage==='HALF').length!==1)return null;
   result.footprint=normalized;
  }
 }else if(input.footprint!==undefined)return null;
 if(!['sectionId','stackId','bodyId','openingId','connectionId','positionLabel'].some(key=>result[key])&&!result.footprint)return null;
 return result;
}
function transact(state,fn){
 let draft;try{draft=clone(state)}catch(error){return {ok:false,error:'clone_failed',message:error.message}}
 let result;try{result=fn(draft)}catch(error){return {ok:false,error:'transaction_failed',message:error.message}}
 if(!result?.ok)return result;commit(state,draft);return result;
}
function registerUnsafe(state,request,makeId,now){
 const inv=ensure(state),kind=request?.kind,storageLocation=String(request?.storageLocation||'').trim(),notes=String(request?.notes||'').trim();
 if(!kinds.has(kind))return {ok:false,error:'invalid_item_kind'};
 if(!storageLocation||storageLocation.length>160||notes.length>500)return {ok:false,error:'invalid_details'};
 if(typeof makeId!=='function')return {ok:false,error:'id_generator_required'};
 const id=String(makeId()||'');
 const corpusIdUsed=Object.values(state.layouts||{}).some(layout=>Object.values(layout?.corpusIds||{}).includes(id));
 if(!id||id.length>160||inv.items[id]||inv.bodies?.[id]||corpusIdUsed)return {ok:false,error:'duplicate_item_id'};
 const time=now||new Date().toISOString();
 const item={id,kind,condition:'good',location:{type:'storage',label:storageLocation},notes,registeredAt:time,updatedAt:time,events:[]};
 inv.items[id]=item;addEvent(inv,item,'registered',{location:item.location},time,makeId);
 return {ok:true,item};
}
function register(state,request,makeId,now){return transact(state,draft=>registerUnsafe(draft,request,makeId,now))}
function placeUnsafe(state,request,makeId,now){
 const inv=ensure(state),item=inv.items[String(request?.itemId||'')];
 if(!item)return {ok:false,error:'item_missing'};
 const location=normalizeLocation(request?.location,item.kind);
 if(!location)return {ok:false,error:item.kind==='honeyQueenExcluder'?'invalid_footprint':'invalid_location'};
 if(location.type==='hive'&&(item.condition==='repair'||item.condition==='retired'))return {ok:false,error:'item_not_installable'};
 if(location.type==='hive'&&!state.hives?.some(h=>h?.id===location.hiveId))return {ok:false,error:'hive_missing'};
 if(location.type==='hive'){
  const referenceErrors=physicalReferenceErrors(state,item,location);
  if(referenceErrors.length)return {ok:false,error:referenceErrors[0].code};
 }
 if(location.type==='hive'&&location.bodyId){
  const bodyExists=Object.entries(state.layouts||{}).some(([hiveId,layout])=>hiveId===location.hiveId&&Object.values(layout?.corpusIds||{}).includes(location.bodyId));
  if(!bodyExists)return {ok:false,error:'body_reference_missing'};
 }
 if(location.type==='hive'&&Array.isArray(location.footprint)){
  const bodyIds=new Set(Object.values(state.layouts?.[location.hiveId]?.corpusIds||{}));
  if(location.footprint.some(part=>!bodyIds.has(part.bodyId)))return {ok:false,error:'footprint_body_reference_missing'};
 }
 if(location.type==='hive'&&['plasticPlug','metalMeshPlug'].includes(item.kind)&&(!location.bodyId||!location.openingId))return {ok:false,error:'body_and_opening_reference_required'};
 if(location.type==='hive'&&item.kind==='technicalQueenExcluder'&&!location.connectionId)return {ok:false,error:'connection_reference_required'};
 if(location.type==='hive'&&['plasticPlug','metalMeshPlug'].includes(item.kind)){
  const conflict=Object.values(inv.items).some(other=>other.id!==item.id&&['plasticPlug','metalMeshPlug'].includes(other.kind)&&other.location?.type==='hive'&&other.location.hiveId===location.hiveId&&other.location.openingId===location.openingId);
  if(conflict)return {ok:false,error:'opening_occupied'};
 }
 const previous=item.location;item.location=location;item.updatedAt=now||new Date().toISOString();
 addEvent(inv,item,'moved',{from:previous,to:location},item.updatedAt,makeId);
 return {ok:true,item,previous};
}
function place(state,request,makeId,now){return transact(state,draft=>placeUnsafe(draft,request,makeId,now))}
function updateCondition(state,request,makeId,now){
 return transact(state,draft=>{
  const inv=ensure(draft),item=inv.items[String(request?.itemId||'')];
  if(!item)return {ok:false,error:'item_missing'};
  if(!conditions.has(request?.condition))return {ok:false,error:'invalid_condition'};
  if(request.condition==='retired'&&item.location?.type==='hive')return {ok:false,error:'cannot_retire_installed'};
  if(request.condition==='repair'&&item.location?.type==='hive')return {ok:false,error:'cannot_repair_installed'};
  const previous=item.condition;item.condition=request.condition;item.updatedAt=now||new Date().toISOString();
  addEvent(inv,item,'condition_changed',{from:previous,to:item.condition},item.updatedAt,makeId);
  return {ok:true,item};
 });
}
function inspect(state){
 const errors=[],inv=state?.equipmentInventory;if(!inv)return errors;
 if(inv.items!=null&&(typeof inv.items!=='object'||Array.isArray(inv.items))){errors.push({code:'invalid_equipment_items'});return errors}
 const occupiedOpenings=new Map();
 for(const [id,item] of Object.entries(inv.items||{})){
  if(!item||typeof item!=='object'||Array.isArray(item)||item.id!==id){errors.push({code:'invalid_item_identity',details:{itemId:id}});continue}
  if(!kinds.has(item.kind))errors.push({code:'invalid_item_kind',details:{itemId:id,kind:item.kind}});
  if(!conditions.has(item.condition))errors.push({code:'invalid_item_condition',details:{itemId:id,condition:item.condition}});
  if(!normalizeLocation(item.location,item.kind))errors.push({code:'invalid_item_location',details:{itemId:id}});
  if(item.events!=null&&(!Array.isArray(item.events)||!item.events.every(event=>event&&typeof event==='object'&&!Array.isArray(event))))errors.push({code:'invalid_item_events',details:{itemId:id}});
  const location=item.location;
  if(location?.type==='hive'&&['plasticPlug','metalMeshPlug'].includes(item.kind)){
   if(!location.bodyId)errors.push({code:'item_body_reference_required',details:{itemId:id}});
   if(!location.openingId)errors.push({code:'item_opening_reference_required',details:{itemId:id}});
   else{const key=location.hiveId+'|'+location.openingId;if(occupiedOpenings.has(key))errors.push({code:'item_opening_occupied',details:{itemIds:[occupiedOpenings.get(key),id],openingId:location.openingId}});else occupiedOpenings.set(key,id)}
  }
  if(location?.type==='hive'&&item.kind==='technicalQueenExcluder'&&!location.connectionId)errors.push({code:'item_connection_reference_required',details:{itemId:id}});
 }
 if(inv.itemEvents!=null&&(!Array.isArray(inv.itemEvents)||!inv.itemEvents.every(event=>event&&typeof event==='object'&&!Array.isArray(event))))errors.push({code:'invalid_equipment_item_events'});
 return errors;
}
function physicalReferenceErrors(state,item,location){
 const process=(state?.sectionalTechProcesses||[]).find(row=>row?.hiveId===location?.hiveId&&row?.state?.physicalLayoutVersion===1);
 if(!process)return [];
 const ps=process.state||{},errors=[];
 const sections=Array.isArray(ps.sections)?ps.sections:[];
 const stacks=Array.isArray(ps.physicalLayout?.stacks)?ps.physicalLayout.stacks:[];
 const openings=sections.flatMap(section=>(Array.isArray(section?.openings)?section.openings:[]).map(opening=>({...opening,sectionId:section.id})));
 const connections=Array.isArray(ps.technicalConnections)?ps.technicalConnections:[];
 if(location.sectionId&&!sections.some(section=>section?.id===location.sectionId))errors.push({code:'item_section_reference_missing',details:{itemId:item.id,sectionId:location.sectionId}});
 if(location.stackId&&!stacks.some(stack=>stack?.id===location.stackId))errors.push({code:'item_stack_reference_missing',details:{itemId:item.id,stackId:location.stackId}});
 if(location.openingId){
  const opening=openings.find(row=>row?.id===location.openingId);
  if(!opening)errors.push({code:'item_opening_reference_missing',details:{itemId:item.id,openingId:location.openingId}});
  else if((location.sectionId&&opening.sectionId!==location.sectionId)||(location.bodyId&&opening.bodyId!==location.bodyId))errors.push({code:'item_opening_context_mismatch',details:{itemId:item.id,openingId:location.openingId,sectionId:location.sectionId||null,bodyId:location.bodyId||null}});
 }
 if(location.connectionId&&!connections.some(connection=>connection?.id===location.connectionId))errors.push({code:'item_connection_reference_missing',details:{itemId:item.id,connectionId:location.connectionId}});
 if(item.kind==='bottom'&&!location.stackId)errors.push({code:'item_stack_reference_required',details:{itemId:item.id}});
 if(['plasticPlug','metalMeshPlug'].includes(item.kind)&&(!location.sectionId||!location.openingId))errors.push({code:'item_section_and_opening_reference_required',details:{itemId:item.id}});
 return errors;
}
function validateReferences(state){
 const errors=[],inv=state?.equipmentInventory;if(!inv?.items)return errors;
 for(const item of Object.values(inv.items)){
  if(item?.location?.type!=='hive')continue;
  const loc=item.location;
  if(!state.hives?.some(h=>h?.id===loc.hiveId))errors.push({code:'item_hive_reference_missing',details:{itemId:item.id,hiveId:loc.hiveId}});
  if(loc.bodyId&&!Object.entries(state.layouts||{}).some(([hiveId,layout])=>hiveId===loc.hiveId&&Object.values(layout?.corpusIds||{}).includes(loc.bodyId)))errors.push({code:'item_body_reference_missing',details:{itemId:item.id,bodyId:loc.bodyId}});
  errors.push(...physicalReferenceErrors(state,item,loc));
  for(const part of Array.isArray(loc.footprint)?loc.footprint:[]){
   const bodyId=part&&typeof part.bodyId==='string'?part.bodyId:null;
   if(!bodyId||!Object.values(state.layouts?.[loc.hiveId]?.corpusIds||{}).includes(bodyId))errors.push({code:'item_footprint_body_reference_missing',details:{itemId:item.id,bodyId}});
  }
 }
 return errors;
}
window.PasekaEquipmentItems=Object.freeze({kinds:[...kinds],conditions:[...conditions],ensure,register,place,updateCondition,inspect,validateReferences});
})();