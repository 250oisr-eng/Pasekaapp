(()=>{'use strict';
const PROFILE_ID='sectional-multiqueen-v1';
const MODES=Object.freeze({
 SIDE_BY_SIDE:'SIDE_BY_SIDE',
 ALTERNATIVE_WINTERING_COLUMN:'ALTERNATIVE_WINTERING_COLUMN',
 SINGLE_FAMILY:'SINGLE_FAMILY'
});
const positions={SIDE_BY_SIDE:['left','middle','right'],ALTERNATIVE_WINTERING_COLUMN:['lower','middle','upper'],SINGLE_FAMILY:['combined']};
// broodBodyIds are ordered bottom-to-top; the final ID is the upper body used by the shared grids.
const isObject=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const nonEmpty=value=>typeof value==='string'&&value.trim().length>0;
const unique=values=>new Set(values).size===values.length;
function compareFootprint(actual,expected){
 if(!Array.isArray(actual)||actual.length!==2)return false;
 const normalize=list=>list.map(x=>({bodyId:x?.bodyId,coverage:x?.coverage})).sort((a,b)=>String(a.bodyId).localeCompare(String(b.bodyId))||String(a.coverage).localeCompare(String(b.coverage)));
 return JSON.stringify(normalize(actual))===JSON.stringify(normalize(expected));
}
function validate(layout,state){
 const errors=[],warnings=[],add=(code,details={})=>errors.push({code,details}),warn=(code,details={})=>warnings.push({code,details});
 if(!isObject(layout))return {valid:false,errors:[{code:'layout_not_object',details:{}}],warnings};
 if(!isObject(state))return {valid:false,errors:[{code:'apiary_state_required',details:{}}],warnings};
 if(layout.schemaVersion!==1)add('sectional_layout_schema_unsupported',{schemaVersion:layout.schemaVersion??null});
 if(!nonEmpty(layout.id))add('sectional_layout_id_required');
 if(!nonEmpty(layout.hiveId))add('sectional_layout_hive_required');
 if(layout.profileId!==PROFILE_ID)add('sectional_layout_profile_mismatch',{profileId:layout.profileId??null});
 if(!Object.values(MODES).includes(layout.mode))add('sectional_layout_mode_invalid',{mode:layout.mode??null});
 const hive=(state.hives||[]).find(x=>x?.id===layout.hiveId);
 if(!hive)add('sectional_layout_hive_missing',{hiveId:layout.hiveId??null});
 else if(hive.profileId&&hive.profileId!==PROFILE_ID&&hive.profile?.id!==PROFILE_ID)add('sectional_layout_attached_to_other_profile',{hiveProfileId:hive.profileId});
 const familyById=new Map((Array.isArray(state.families)?state.families:[]).filter(isObject).map(x=>[x.id,x]));
 const bodyInventory=state.equipmentInventory?.bodies||{};
 const itemInventory=state.equipmentInventory?.items||{};
 const usedFamilies=new Set(),usedBodies=new Set(),usedAccessories=new Set(),sectionById=new Map();
 const checkFamily=(familyId,sectionId)=>{
  if(!nonEmpty(familyId)){add('section_family_id_required',{sectionId});return null}
  if(usedFamilies.has(familyId))add('section_family_duplicate',{familyId});
  usedFamilies.add(familyId);
  const family=familyById.get(familyId);
  if(!family){add('section_family_missing',{familyId,sectionId});return null}
  if(family.recordStatus==='historical')add('section_family_historical',{familyId,sectionId});
  if(family.hive!==layout.hiveId)add('section_family_hive_mismatch',{familyId,sectionId,familyHiveId:family.hive??null,hiveId:layout.hiveId});
  if(!nonEmpty(family.colonyGroupId))add('section_family_group_required',{familyId,sectionId});
  return family;
 };
 const checkBody=(bodyId,kind,sectionId)=>{
  if(!nonEmpty(bodyId)){add('section_body_id_required',{sectionId,kind});return null}
  if(usedBodies.has(bodyId))add('section_body_duplicate',{bodyId,sectionId});
  usedBodies.add(bodyId);
  const body=bodyInventory[bodyId];
  if(!isObject(body)||body.id!==bodyId){add('section_body_missing',{bodyId,sectionId});return null}
  if(body.kind!==kind)add('section_body_kind_mismatch',{bodyId,expected:kind,actual:body.kind??null});
  if(body.condition!=='good')add('section_body_not_usable',{bodyId,condition:body.condition??null});
  const capacity=kind==='brood'?6:10;
  if(body.spec?.profileId!==PROFILE_ID)add('section_body_profile_mismatch',{bodyId,profileId:body.spec?.profileId??null});
  if(body.spec?.framesPerBox!==capacity)add('section_body_capacity_mismatch',{bodyId,kind,expected:capacity,actual:body.spec?.framesPerBox??null});
  for(const [legacyHiveId,legacyLayout] of Object.entries(state.layouts||{})){
   if(Object.values(legacyLayout?.corpusIds||{}).includes(bodyId))add('section_body_also_in_legacy_layout',{bodyId,legacyHiveId});
  }
  return body;
 };
 const checkAccessory=(itemId,kind,sectionId,expected={})=>{
  if(!nonEmpty(itemId)){add('section_accessory_id_required',{sectionId,kind});return null}
  if(usedAccessories.has(itemId))add('section_accessory_duplicate',{itemId,sectionId});
  usedAccessories.add(itemId);
  const item=itemInventory[itemId],location=item?.location;
  if(!isObject(item)||item.id!==itemId){add('section_accessory_missing',{itemId,sectionId,kind});return null}
  if(item.kind!==kind)add('section_accessory_kind_mismatch',{itemId,expected:kind,actual:item.kind??null});
  if(item.condition!=='good')add('section_accessory_not_usable',{itemId,condition:item.condition??null});
  if(location?.type!=='hive'||location.hiveId!==layout.hiveId)add('section_accessory_location_mismatch',{itemId,hiveId:location?.hiveId??null});
  for(const key of ['sectionId','bodyId','openingId','connectionId','positionLabel']){
   if(expected[key]!=null&&location?.[key]!==expected[key])add('section_accessory_position_mismatch',{itemId,key,expected:expected[key],actual:location?.[key]??null});
  }
  if(expected.footprint&&!compareFootprint(location?.footprint,expected.footprint))add('section_accessory_footprint_mismatch',{itemId,expected:expected.footprint,actual:location?.footprint??null});
  return item;
 };
 const sections=Array.isArray(layout.sections)?layout.sections:[];
 if(!Array.isArray(layout.sections))add('sectional_layout_sections_required');
 const expectedPositions=positions[layout.mode]||[];
 if(sections.length!==expectedPositions.length)add('sectional_layout_section_count_mismatch',{mode:layout.mode,expected:expectedPositions.length,actual:sections.length});
 const sectionIds=new Set(),positionIds=new Set();
 sections.forEach((section,index)=>{
  if(!isObject(section)){add('section_record_invalid',{index});return}
  if(!nonEmpty(section.id))add('section_id_required',{index});
  else if(sectionIds.has(section.id))add('section_id_duplicate',{sectionId:section.id});
  else sectionIds.add(section.id);
  if(section.position!==expectedPositions[index])add('section_position_order_invalid',{index,expected:expectedPositions[index]??null,actual:section.position??null});
  if(positionIds.has(section.position))add('section_position_duplicate',{position:section.position});
  positionIds.add(section.position);
  sectionById.set(section.id,section);
  checkFamily(section.familyId,section.id);
  if(!Array.isArray(section.broodBodyIds))add('section_brood_bodies_required',{sectionId:section.id});
  else{
   const count=section.broodBodyIds.length;
   if(layout.mode===MODES.SIDE_BY_SIDE&&(count<2||count>3))add('section_brood_body_count_invalid',{sectionId:section.id,expected:'2 or 3',actual:count});
   if(layout.mode===MODES.ALTERNATIVE_WINTERING_COLUMN&&count!==(index===0?2:1))add('section_wintering_body_count_invalid',{sectionId:section.id,position:section.position,expected:index===0?2:1,actual:count});
   if(layout.mode===MODES.SINGLE_FAMILY&&count!==3&&count!==4)add('section_combined_body_count_invalid',{sectionId:section.id,expected:'3 or 4',actual:count});
   section.broodBodyIds.forEach(id=>checkBody(id,'brood',section.id));
  }
  if(layout.mode===MODES.SIDE_BY_SIDE){
   checkAccessory(section.bottomId,'bottom',section.id,{sectionId:section.id});
   if(section.coverId)checkAccessory(section.coverId,'cover',section.id,{sectionId:section.id});
   else if(layout.honeyStack==null)add('section_cover_required',{sectionId:section.id});
  }
 });
 if(layout.mode===MODES.SIDE_BY_SIDE||layout.mode===MODES.ALTERNATIVE_WINTERING_COLUMN){
  const groups=[...new Set(sections.map(section=>familyById.get(section?.familyId)?.colonyGroupId).filter(Boolean))];
  if(groups.length!==1)add('section_colony_group_mismatch',{groups});
 }
 if(layout.mode===MODES.SIDE_BY_SIDE){
  if(!Array.isArray(layout.technicalConnections)||layout.technicalConnections.length!==2)add('technical_connections_count_invalid',{expected:2,actual:Array.isArray(layout.technicalConnections)?layout.technicalConnections.length:null});
  const expectedPairs=[['left','middle'],['middle','right']],seenPairs=new Set();
  for(const connection of Array.isArray(layout.technicalConnections)?layout.technicalConnections:[]){
   if(!isObject(connection)){add('technical_connection_invalid');continue}
   const from=sectionById.get(connection.fromSectionId),to=sectionById.get(connection.toSectionId);
   const pair=from?.position+'>'+to?.position;
   if(!expectedPairs.some(([a,b])=>pair===a+'>'+b))add('technical_connection_pair_invalid',{connectionId:connection.id??null,pair});
   if(seenPairs.has(pair))add('technical_connection_duplicate',{pair});seenPairs.add(pair);
   if(connection.bufferCorridorPresent!==true)add('technical_connection_buffer_required',{connectionId:connection.id??null});
   for(const [side,section,opening] of [['from',from,connection.from],['to',to,connection.to]]){
    if(!isObject(opening)){add('technical_connection_opening_required',{connectionId:connection.id??null,side});continue}
    if(!Array.isArray(section?.broodBodyIds)||!section.broodBodyIds.includes(opening.bodyId))add('technical_connection_body_not_in_section',{connectionId:connection.id??null,side,bodyId:opening.bodyId??null});
    if(!nonEmpty(opening.openingId))add('technical_connection_opening_id_required',{connectionId:connection.id??null,side});
    checkAccessory(opening.itemId,'technicalQueenExcluder',connection.id,{bodyId:opening.bodyId,openingId:opening.openingId,connectionId:connection.id});
   }
  }
  if(seenPairs.size!==2)add('technical_connection_coverage_incomplete',{pairs:[...seenPairs]});
  if(layout.honeyStack!=null)validateHoneyStack(layout.honeyStack,sections,state,layout,add,checkBody,checkAccessory);
  if(layout.temporaryQueenIsolation!=null){
   if(!Array.isArray(layout.temporaryQueenIsolation))add('temporary_queen_isolation_invalid');
   else layout.temporaryQueenIsolation.forEach(plug=>{if(!isObject(plug)){add('temporary_queen_plug_invalid');return}if(!nonEmpty(plug.bodyId)||!nonEmpty(plug.openingId))add('temporary_queen_plug_opening_required');checkAccessory(plug.itemId,'metalMeshPlug',plug.sectionId||null,{bodyId:plug.bodyId,openingId:plug.openingId})});
  }
 }else if(layout.mode===MODES.ALTERNATIVE_WINTERING_COLUMN){
  const column=layout.column;
  if(!isObject(column))add('wintering_column_required');
  else{
   checkAccessory(column.bottomId,'bottom',null);
   checkAccessory(column.coverId,'cover',null);
   const diaphragms=Array.isArray(column.meshDiaphragms)?column.meshDiaphragms:[];
   if(diaphragms.length!==2)add('wintering_mesh_diaphragm_count_invalid',{expected:2,actual:diaphragms.length});
   const boundaries=new Set();
   for(const diaphragm of diaphragms){
    if(!isObject(diaphragm)){add('wintering_mesh_diaphragm_invalid');continue}
    const boundary=diaphragm.between;
    if(!['lower-middle','middle-upper'].includes(boundary))add('wintering_mesh_diaphragm_position_invalid',{between:boundary??null});
    if(boundaries.has(boundary))add('wintering_mesh_diaphragm_duplicate',{between:boundary});
    boundaries.add(boundary);
    checkAccessory(diaphragm.itemId,'meshDiaphragm',null,{positionLabel:boundary});
   }
   if(boundaries.size!==2)add('wintering_mesh_diaphragm_coverage_incomplete',{boundaries:[...boundaries]});
  }
  if(layout.honeyStack!=null)add('wintering_column_honey_stack_forbidden');
  if(layout.technicalConnections!=null&&layout.technicalConnections.length)add('wintering_column_technical_connections_forbidden');
 }else if(layout.mode===MODES.SINGLE_FAMILY){
  const section=sections[0];
  if(section){
   checkAccessory(section.bottomId,'bottom',section.id,{sectionId:section.id});
   checkAccessory(section.coverId,'cover',section.id,{sectionId:section.id});
  }
  if(!['primary_wintering','early_honey_merge'].includes(layout.purpose))add('single_family_purpose_invalid',{purpose:layout.purpose??null});
  if(layout.purpose==='primary_wintering'){
   if(layout.closuresConfirmed!==true)add('winter_technical_openings_closure_confirmation_required');
   const closures=Array.isArray(layout.closedOpenings)?layout.closedOpenings:[];
   if(!closures.length)add('winter_plastic_plugs_required');
   for(const closure of closures){
    if(!isObject(closure)){add('winter_plug_record_invalid');continue}
    if(!nonEmpty(closure.bodyId)||!nonEmpty(closure.openingId))add('winter_plug_opening_required');
    checkAccessory(closure.itemId,'plasticPlug',section?.id||null,{bodyId:closure.bodyId,openingId:closure.openingId});
   }
  }
  if(layout.honeyStack!=null)add('single_family_honey_stack_forbidden');
  if(layout.technicalConnections!=null&&layout.technicalConnections.length)add('single_family_technical_connections_forbidden');
 }
 const allFamilies=[...usedFamilies];
 if(allFamilies.length>1){
  const groups=new Set(allFamilies.map(id=>familyById.get(id)?.colonyGroupId).filter(Boolean));
  if(groups.size>1)add('section_colony_group_mismatch',{groups:[...groups]});
 }
 return {valid:errors.length===0,errors,warnings};
}
function validateHoneyStack(stack,sections,state,layout,add,checkBody,checkAccessory){
 if(!isObject(stack)){add('honey_stack_invalid');return}
 if(!['early','main'].includes(stack.purpose))add('honey_stack_purpose_invalid',{purpose:stack.purpose??null});
 const bodyIds=Array.isArray(stack.bodyIds)?stack.bodyIds:[];
 if(!Array.isArray(stack.bodyIds)||![2,4].includes(bodyIds.length))add('honey_stack_body_count_invalid',{expected:'2 or 4',actual:bodyIds.length});
 if(stack.purpose==='early'&&bodyIds.length!==2)add('early_honey_requires_two_bodies',{actual:bodyIds.length});
 const pairCounts=new Map();
 bodyIds.forEach(id=>{
  const body=checkBody(id,'honey','shared-honey-stack');
  if(body?.pairId){pairCounts.set(body.pairId,(pairCounts.get(body.pairId)||0)+1)}
  else add('honey_body_pair_required',{bodyId:id});
 });
 if(pairCounts.size!==(bodyIds.length/2)||[...pairCounts.values()].some(count=>count!==2))add('honey_body_pair_structure_invalid',{pairIds:[...pairCounts.keys()],counts:[...pairCounts.values()]});
 const excluders=Array.isArray(stack.excluders)?stack.excluders:[];
 if(excluders.length!==2)add('large_excluder_count_invalid',{expected:2,actual:excluders.length});
 const bySide=new Map(excluders.filter(isObject).map(row=>[row.side,row]));
 const left=sections.find(section=>section.position==='left'),middle=sections.find(section=>section.position==='middle'),right=sections.find(section=>section.position==='right');
 if(!left||!middle||!right)return;
 const upper=section=>Array.isArray(section.broodBodyIds)?section.broodBodyIds[section.broodBodyIds.length-1]:null;
 const expected={
  left:[{bodyId:upper(left),coverage:'FULL'},{bodyId:upper(middle),coverage:'HALF'}],
  right:[{bodyId:upper(middle),coverage:'HALF'},{bodyId:upper(right),coverage:'FULL'}]
 };
 for(const side of ['left','right']){
  const row=bySide.get(side);
  if(!row){add('large_excluder_side_missing',{side});continue}
  const item=checkAccessory(row.itemId,'honeyQueenExcluder',side,{footprint:expected[side]});
  if(row.footprint&&!compareFootprint(row.footprint,expected[side]))add('large_excluder_record_footprint_mismatch',{side,expected:expected[side],actual:row.footprint});
  if(item&&!compareFootprint(item.location?.footprint,expected[side]))add('large_excluder_inventory_footprint_mismatch',{side,expected:expected[side],actual:item.location?.footprint??null});
 }
}
function inspect(state){
 if(!isObject(state))return [{code:'apiary_state_required',details:{}}];
 if(state.sectionalPhysicalLayouts==null)return [];
 if(!Array.isArray(state.sectionalPhysicalLayouts))return [{code:'sectional_physical_layouts_invalid',details:{}}];
 const errors=[],seenIds=new Set(),seenHives=new Set();
 state.sectionalPhysicalLayouts.forEach((layout,index)=>{
  const result=validate(layout,state);
  result.errors.forEach(error=>errors.push({...error,details:{...error.details,index}}));
  if(layout?.id){if(seenIds.has(layout.id))errors.push({code:'sectional_layout_id_duplicate',details:{id:layout.id,index}});seenIds.add(layout.id)}
  if(layout?.hiveId){if(seenHives.has(layout.hiveId))errors.push({code:'sectional_layout_hive_duplicate',details:{hiveId:layout.hiveId,index}});seenHives.add(layout.hiveId)}
 });
 return errors;
}
window.PasekaSectionalPhysicalLayout=Object.freeze({PROFILE_ID,MODES,validate,inspect});
})();