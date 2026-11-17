(()=>{'use strict';
const PROFILE_ID='sectional-multiqueen-v1';
const MODES=Object.freeze({SIDE_BY_SIDE:'SIDE_BY_SIDE',ALTERNATIVE_WINTERING_COLUMN:'ALTERNATIVE_WINTERING_COLUMN',SINGLE_FAMILY:'SINGLE_FAMILY'});
const isObject=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const nonEmpty=value=>typeof value==='string'&&value.trim().length>0;
const rows=value=>Array.isArray(value)?value:[];
function sameFootprint(actual,expected){
 if(!Array.isArray(actual)||actual.length!==2)return false;
 const normalize=list=>list.map(row=>({bodyId:row?.bodyId,coverage:row?.coverage})).sort((a,b)=>String(a.bodyId).localeCompare(String(b.bodyId))||String(a.coverage).localeCompare(String(b.coverage)));
 return JSON.stringify(normalize(actual))===JSON.stringify(normalize(expected));
}
function validate(layout,state){
 const errors=[],add=(code,details={})=>errors.push({code,details});
 if(!isObject(layout))return {valid:false,errors:[{code:'sectional_layout_not_object',details:{}}]};
 if(!isObject(state))return {valid:false,errors:[{code:'sectional_layout_state_required',details:{}}]};
 if(layout.schemaVersion!==1)add('sectional_layout_schema_unsupported',{schemaVersion:layout.schemaVersion??null});
 if(!nonEmpty(layout.id))add('sectional_layout_id_required');
 if(!nonEmpty(layout.hiveId))add('sectional_layout_hive_required');
 if(layout.profileId!==PROFILE_ID)add('sectional_layout_profile_mismatch',{profileId:layout.profileId??null});
 if(!Object.values(MODES).includes(layout.mode))add('sectional_layout_mode_invalid',{mode:layout.mode??null});
 if(layout.mode===MODES.SIDE_BY_SIDE&&layout.broodRows!=null&&![1,2].includes(layout.broodRows))add('section_brood_rows_invalid',{actual:layout.broodRows});
 if(layout.mode!==MODES.SIDE_BY_SIDE&&layout.broodRows!=null)add('section_brood_rows_not_applicable',{mode:layout.mode});
 const hive=rows(state.hives).find(row=>row?.id===layout.hiveId);
 if(!hive)add('sectional_layout_hive_missing',{hiveId:layout.hiveId??null});
 else if(hive.profileId!==PROFILE_ID&&hive.profile?.id!==PROFILE_ID)add('sectional_layout_attached_to_other_profile',{hiveProfileId:hive.profileId??hive.profile?.id??null});
 const inventory=isObject(state.equipmentInventory)?state.equipmentInventory:{};
 const bodies=isObject(inventory.bodies)?inventory.bodies:{};
 const items=isObject(inventory.items)?inventory.items:{};
 const familyMap=new Map(rows(state.families).filter(isObject).map(row=>[row.id,row]));
 const queenMap=new Map(rows(state.queens).filter(isObject).map(row=>[row.id,row]));
 const sections=rows(layout.sections),stacks=rows(layout.stacks);
 const expectedPositions=layout.mode===MODES.SIDE_BY_SIDE?['left','middle','right']:layout.mode===MODES.ALTERNATIVE_WINTERING_COLUMN?['lower','middle','upper']:['combined'];
 if(!Array.isArray(layout.sections)||sections.length!==expectedPositions.length)add('sectional_layout_section_count',{mode:layout.mode,expected:expectedPositions.length,actual:Array.isArray(layout.sections)?sections.length:null});
 if(!Array.isArray(layout.stacks))add('sectional_layout_stacks_required');
 for(const key of ['technicalConnections','meshDiaphragms','temporaryQueenIsolation','closedOpenings']){
  if(layout[key]!=null&&!Array.isArray(layout[key]))add('sectional_layout_array_invalid',{field:key});
 }
 const sectionById=new Map(),sectionByPosition=new Map(),openingById=new Map(),usedFamilies=new Set(),usedBodies=new Set(),usedItems=new Set(),usedOpenings=new Set();
 const checkBody=(bodyId,kind,owner)=>{
  if(!nonEmpty(bodyId)){add('section_body_id_required',{owner,kind});return null}
  if(usedBodies.has(bodyId))add('section_body_duplicate',{bodyId,owner});
  usedBodies.add(bodyId);
  const body=bodies[bodyId];
  if(!isObject(body)||body.id!==bodyId){add('section_body_missing',{bodyId,owner});return null}
  if(body.kind!==kind)add('section_body_kind_mismatch',{bodyId,expected:kind,actual:body.kind??null});
  if(body.condition!=='good')add('section_body_not_usable',{bodyId,condition:body.condition??null});
  const capacity=kind==='brood'?6:10;
  if(body.spec?.profileId!==PROFILE_ID)add('section_body_profile_mismatch',{bodyId,profileId:body.spec?.profileId??null});
  if(body.spec?.framesPerBox!==capacity)add('section_body_capacity_mismatch',{bodyId,kind,expected:capacity,actual:body.spec?.framesPerBox??null});
  for(const [legacyHiveId,legacyLayout] of Object.entries(isObject(state.layouts)?state.layouts:{})){
   if(Object.values(isObject(legacyLayout?.corpusIds)?legacyLayout.corpusIds:{}).includes(bodyId))add('section_body_also_in_legacy_layout',{bodyId,legacyHiveId});
  }
  return body;
 };
 const checkItem=(itemId,kind,expected={})=>{
  if(!nonEmpty(itemId)){add('section_accessory_id_required',{kind,...expected});return null}
  if(usedItems.has(itemId))add('section_accessory_reused',{itemId,kind});
  usedItems.add(itemId);
  const item=items[itemId],location=item?.location;
  if(!isObject(item)||item.id!==itemId){add('section_accessory_missing',{itemId,kind});return null}
  if(item.kind!==kind)add('section_accessory_kind_mismatch',{itemId,expected:kind,actual:item.kind??null});
  if(item.condition!=='good')add('section_accessory_not_usable',{itemId,condition:item.condition??null});
  if(location?.type!=='hive'||location.hiveId!==layout.hiveId)add('section_accessory_location_mismatch',{itemId,hiveId:location?.hiveId??null});
  for(const key of ['stackId','bodyId','openingId','positionLabel']){
   if(expected[key]!=null&&location?.[key]!==expected[key])add('section_accessory_position_mismatch',{itemId,key,expected:expected[key],actual:location?.[key]??null});
  }
  if(expected.footprint&&!sameFootprint(location?.footprint,expected.footprint))add('section_accessory_footprint_mismatch',{itemId,expected:expected.footprint,actual:location?.footprint??null});
  return item;
 };
 sections.forEach((section,index)=>{
  if(!isObject(section)){add('section_record_invalid',{index});return}
  if(!nonEmpty(section.id))add('section_id_required',{index});
  else if(sectionById.has(section.id))add('section_id_duplicate',{sectionId:section.id});
  else sectionById.set(section.id,section);
  if(section.position!==expectedPositions[index])add('section_position_order_invalid',{index,expected:expectedPositions[index]??null,actual:section.position??null});
  if(sectionByPosition.has(section.position))add('section_position_duplicate',{position:section.position});
  sectionByPosition.set(section.position,section);
  if(!nonEmpty(section.familyId))add('section_family_id_required',{sectionId:section.id??null});
  if(usedFamilies.has(section.familyId))add('section_family_duplicate',{familyId:section.familyId});
  usedFamilies.add(section.familyId);
  const family=familyMap.get(section.familyId);
  if(!family)add('section_family_missing',{familyId:section.familyId??null,sectionId:section.id??null});
  else{
   if(family.recordStatus==='historical')add('section_family_historical',{familyId:family.id});
   if(family.hive!==layout.hiveId)add('section_family_hive_mismatch',{familyId:family.id,familyHiveId:family.hive??null,hiveId:layout.hiveId});
   if(!nonEmpty(family.colonyGroupId))add('section_family_group_required',{familyId:family.id});
   if(!['identified','unresolved'].includes(family.queenIdentityStatus))add('section_family_queen_identity_status_required',{familyId:family.id,status:family.queenIdentityStatus??null});
   if(family.queenIdentityStatus==='identified'){
    const queen=queenMap.get(family.currentQueenId);
    if(!nonEmpty(family.currentQueenId))add('section_family_current_queen_missing',{familyId:family.id});
    if(!queen||queen.familyId!==family.id||queen.status!=='current')add('section_family_current_queen_invalid',{familyId:family.id,queenId:family.currentQueenId??null});
   }else if(family.currentQueenId)add('section_family_unresolved_queen_has_identity',{familyId:family.id,currentQueenId:family.currentQueenId??null});
  }
  const count=Array.isArray(section.broodBodyIds)?section.broodBodyIds.length:null;
  if(!Array.isArray(section.broodBodyIds))add('section_brood_bodies_required',{sectionId:section.id??null});
  else{
   if(layout.mode===MODES.SIDE_BY_SIDE&&count!==(layout.broodRows??2))add('section_brood_body_count_invalid',{sectionId:section.id,expected:layout.broodRows??2,actual:count});
   if(layout.mode===MODES.ALTERNATIVE_WINTERING_COLUMN&&![1,2].includes(count))add('section_wintering_body_count_invalid',{sectionId:section.id,expected:'1 or 2',actual:count});
   if(layout.mode===MODES.SINGLE_FAMILY&&![3,4].includes(count))add('section_combined_body_count_invalid',{sectionId:section.id,expected:'3 or 4',actual:count});
   section.broodBodyIds.forEach(id=>checkBody(id,'brood',section.id));
  }
  if(!nonEmpty(section.upperBroodBodyId)||!section.broodBodyIds?.includes(section.upperBroodBodyId))add('section_upper_body_reference_required',{sectionId:section.id??null,upperBroodBodyId:section.upperBroodBodyId??null});
  if(!Array.isArray(section.openings))add('section_openings_required',{sectionId:section.id??null});
  else for(const opening of section.openings){
   if(!isObject(opening)){add('section_opening_invalid',{sectionId:section.id??null});continue}
   if(!nonEmpty(opening.id))add('section_opening_id_required',{sectionId:section.id??null});
   else if(openingById.has(opening.id))add('section_opening_id_duplicate',{openingId:opening.id});
   else openingById.set(opening.id,{...opening,sectionId:section.id});
   if(!section.broodBodyIds?.includes(opening.bodyId))add('section_opening_body_mismatch',{sectionId:section.id??null,openingId:opening.id??null,bodyId:opening.bodyId??null});
   if(opening.diameterMm!==50)add('section_opening_diameter_invalid',{sectionId:section.id??null,openingId:opening.id??null,diameterMm:opening.diameterMm??null,expected:50});
  }
  if(layout.mode===MODES.SIDE_BY_SIDE&&Array.isArray(section.broodBodyIds)&&Array.isArray(section.openings)){
   const expectedPerBody=section.position==='middle'?2:1;
   for(const bodyId of section.broodBodyIds){
    const actual=section.openings.filter(opening=>opening?.bodyId===bodyId).length;
    if(actual!==expectedPerBody)add('section_opening_body_coverage_invalid',{sectionId:section.id??null,bodyId,expected:expectedPerBody,actual});
   }
  }
 });
 const groups=new Set([...usedFamilies].map(id=>familyMap.get(id)?.colonyGroupId).filter(Boolean));
 if(usedFamilies.size>1&&groups.size!==1)add('section_colony_group_mismatch',{colonyGroupIds:[...groups]});
 if([MODES.SIDE_BY_SIDE,MODES.ALTERNATIVE_WINTERING_COLUMN].includes(layout.mode)&&usedFamilies.size!==3)add('section_family_count_invalid',{expected:3,actual:usedFamilies.size});
 if(layout.mode===MODES.SINGLE_FAMILY&&usedFamilies.size!==1)add('single_family_count_invalid',{expected:1,actual:usedFamilies.size});
 if(layout.mode===MODES.ALTERNATIVE_WINTERING_COLUMN){
  const counts=sections.map(section=>Array.isArray(section?.broodBodyIds)?section.broodBodyIds.length:0).sort((a,b)=>a-b);
  if(JSON.stringify(counts)!==JSON.stringify([1,1,2]))add('wintering_body_distribution_invalid',{bodyCounts:counts,expected:[1,1,2]});
 }
 const expectedStackCount=layout.mode===MODES.SIDE_BY_SIDE?3:1;
 if(stacks.length!==expectedStackCount)add('section_stack_count_invalid',{mode:layout.mode,expected:expectedStackCount,actual:Array.isArray(layout.stacks)?stacks.length:null});
 const stackIds=new Set(),coveredSections=[];
 stacks.forEach((stack,index)=>{
  if(!isObject(stack)){add('section_stack_invalid',{index});return}
  if(!nonEmpty(stack.id))add('section_stack_id_required',{index});
  else if(stackIds.has(stack.id))add('section_stack_id_duplicate',{stackId:stack.id});
  stackIds.add(stack.id);
  const expectedPosition=layout.mode===MODES.SIDE_BY_SIDE?expectedPositions[index]:layout.mode===MODES.ALTERNATIVE_WINTERING_COLUMN?'column':'combined';
  if(stack.position!==expectedPosition)add('section_stack_position_invalid',{stackId:stack.id??null,expected:expectedPosition,actual:stack.position??null});
  const sectionIds=rows(stack.sectionIds);
  if(layout.mode===MODES.SIDE_BY_SIDE){
   if(sectionIds.length!==1||sectionIds[0]!==sections[index]?.id)add('section_stack_section_mapping_invalid',{stackId:stack.id??null,sectionIds,expectedSectionId:sections[index]?.id??null});
  }else if(JSON.stringify(sectionIds)!==JSON.stringify(sections.map(row=>row?.id)))add('section_stack_section_mapping_invalid',{stackId:stack.id??null,sectionIds,expectedSectionIds:sections.map(row=>row?.id??null)});
  coveredSections.push(...sectionIds);
  if(!nonEmpty(stack.bottomItemId))add('section_stack_bottom_required',{stackId:stack.id??null});
  else checkItem(stack.bottomItemId,'bottom',{stackId:stack.id});
  if(layout.mode===MODES.SIDE_BY_SIDE&&layout.honeyStack==null){
   if(!nonEmpty(stack.coverItemId))add('section_stack_cover_required',{stackId:stack.id??null});
   else checkItem(stack.coverItemId,'cover',{stackId:stack.id});
   if(!nonEmpty(stack.topRiserItemId))add('section_stack_top_riser_required',{stackId:stack.id??null});
   else checkItem(stack.topRiserItemId,'topRiser',{stackId:stack.id});
  }else if(layout.mode===MODES.SIDE_BY_SIDE){
   if(stack.coverItemId)add('honey_stage_cover_must_be_removed',{stackId:stack.id??null,itemId:stack.coverItemId});
   if(stack.topRiserItemId)add('honey_stage_top_riser_must_be_removed',{stackId:stack.id??null,itemId:stack.topRiserItemId});
  }else if(stack.coverItemId)checkItem(stack.coverItemId,'cover',{stackId:stack.id});
  if(stack.feederItemId)checkItem(stack.feederItemId,'feeder',{stackId:stack.id});
  if(layout.mode===MODES.ALTERNATIVE_WINTERING_COLUMN){
   const boundaries=rows(stack.boundaries);
   if(boundaries.length!==2||!['lower-middle','middle-upper'].every(value=>boundaries.includes(value))||new Set(boundaries).size!==2)add('section_stack_boundaries_invalid',{stackId:stack.id??null,boundaries});
  }else if(rows(stack.boundaries).length)add('unexpected_stack_boundaries',{stackId:stack.id??null});
 });
 if(new Set(coveredSections).size!==coveredSections.length||coveredSections.length!==sections.length||sections.some(section=>!coveredSections.includes(section?.id)))add('section_stack_coverage_invalid',{coveredSections,sectionIds:sections.map(row=>row?.id??null)});
 if(layout.mode===MODES.SIDE_BY_SIDE&&stacks.filter(stack=>!!stack?.feederItemId).length>1)add('section_stack_feeder_count_invalid',{maximum:1,actual:stacks.filter(stack=>!!stack?.feederItemId).length});
 if(layout.mode===MODES.SIDE_BY_SIDE){
  const connections=rows(layout.technicalConnections);
  if(connections.length!==2)add('technical_connections_count_invalid',{expected:2,actual:Array.isArray(layout.technicalConnections)?connections.length:null});
  const expectedPairs=[['left','middle'],['middle','right']],seenPairs=new Set(),connectionIds=new Set();
  for(const [fromPosition,toPosition] of expectedPairs){
   const from=sectionByPosition.get(fromPosition),to=sectionByPosition.get(toPosition);
   const connection=connections.find(row=>row?.fromSectionId===from?.id&&row?.toSectionId===to?.id);
   if(!connection){add('technical_connection_missing',{fromPosition,toPosition});continue}
   if(!nonEmpty(connection.id))add('technical_connection_id_required',{fromPosition,toPosition});
   else if(connectionIds.has(connection.id))add('technical_connection_id_duplicate',{connectionId:connection.id});
   connectionIds.add(connection.id);
   if(connection.bufferCorridorPresent!==true)add('technical_connection_buffer_required',{connectionId:connection.id??null});
   const refs=rows(connection.openings),rowCount=layout.broodRows??2,expectedRefs=rowCount*2,bodyRefs=new Map([[from?.id,new Set()],[to?.id,new Set()]]);
   if(refs.length!==expectedRefs)add('technical_connection_opening_count_invalid',{connectionId:connection.id??null,expected:expectedRefs,actual:Array.isArray(connection.openings)?refs.length:null});
   for(const ref of refs){
    if(!isObject(ref)){add('technical_connection_opening_invalid',{connectionId:connection.id??null});continue}
    if(!bodyRefs.has(ref.sectionId))add('technical_connection_section_reference_invalid',{connectionId:connection.id??null,sectionId:ref.sectionId??null});
    const sectionBodyRefs=bodyRefs.get(ref.sectionId);
    if(sectionBodyRefs?.has(ref.bodyId))add('technical_connection_body_reference_duplicate',{connectionId:connection.id??null,sectionId:ref.sectionId??null,bodyId:ref.bodyId??null});
    sectionBodyRefs?.add(ref.bodyId);
    const opening=openingById.get(ref.openingId);
    if(!opening||opening.sectionId!==ref.sectionId||opening.bodyId!==ref.bodyId)add('technical_connection_opening_reference_invalid',{connectionId:connection.id??null,openingId:ref.openingId??null,bodyId:ref.bodyId??null,sectionId:ref.sectionId??null});
    if(usedOpenings.has(ref.openingId))add('technical_connection_opening_reused',{openingId:ref.openingId??null});
    usedOpenings.add(ref.openingId);
    checkItem(ref.itemId,'technicalQueenExcluder',{bodyId:ref.bodyId,openingId:ref.openingId});
   }
   for(const section of [from,to]){
    const actual=bodyRefs.get(section?.id)||new Set(),expectedBodies=rows(section?.broodBodyIds);
    if(actual.size!==rowCount||expectedBodies.some(bodyId=>!actual.has(bodyId)))add('technical_connection_body_coverage_invalid',{connectionId:connection.id??null,sectionId:section?.id??null,expectedBodyIds:expectedBodies,actualBodyIds:[...actual]});
   }
   seenPairs.add(fromPosition+'>'+toPosition);
  }
  if(seenPairs.size!==2)add('technical_connection_coverage_incomplete',{pairs:[...seenPairs]});
  for(const openingId of openingById.keys())if(!usedOpenings.has(openingId))add('technical_opening_unlinked',{openingId});
  if(layout.honeyStack!=null)validateHoneyStack(layout.honeyStack,sections,add,checkBody,checkItem,state);
 }else{
  if(rows(layout.technicalConnections).length)add('technical_connections_forbidden_for_layout_mode',{mode:layout.mode});
  if(layout.honeyStack!=null)add('honey_stack_forbidden_for_layout_mode',{mode:layout.mode});
 }
 if(layout.temporaryQueenIsolation!=null){
  if(!Array.isArray(layout.temporaryQueenIsolation))add('temporary_queen_isolation_invalid');
  else layout.temporaryQueenIsolation.forEach(plug=>{
   if(!isObject(plug)){add('temporary_queen_plug_invalid');return}
   const opening=openingById.get(plug.openingId);
   if(!opening||opening.bodyId!==plug.bodyId)add('temporary_queen_plug_opening_invalid',{bodyId:plug.bodyId??null,openingId:plug.openingId??null});
   checkItem(plug.itemId,'metalMeshPlug',{bodyId:plug.bodyId,openingId:plug.openingId});
  });
 }
 if(layout.mode===MODES.ALTERNATIVE_WINTERING_COLUMN){
  const stack=stacks[0],diaphragms=rows(layout.meshDiaphragms);
  if(diaphragms.length!==2)add('wintering_mesh_diaphragm_count_invalid',{expected:2,actual:Array.isArray(layout.meshDiaphragms)?diaphragms.length:null});
  const positions=new Set();
  for(const diaphragm of diaphragms){
   if(!isObject(diaphragm)){add('wintering_mesh_diaphragm_invalid');continue}
   const position=diaphragm.positionLabel;
   if(!['lower-middle','middle-upper'].includes(position)||positions.has(position))add('wintering_mesh_diaphragm_position_invalid',{positionLabel:position??null});
   positions.add(position);
   checkItem(diaphragm.itemId,'meshDiaphragm',{stackId:stack?.id,positionLabel:position});
  }
  if(positions.size!==2)add('wintering_mesh_diaphragm_coverage_incomplete',{positions:[...positions]});
 }else if(rows(layout.meshDiaphragms).length)add('wintering_mesh_diaphragms_forbidden_for_layout_mode',{mode:layout.mode});
 if(layout.mode===MODES.SINGLE_FAMILY){
  const section=sections[0];
  if(!['primary_wintering','early_honey_merge'].includes(layout.purpose))add('single_family_purpose_invalid',{purpose:layout.purpose??null});
  if(layout.purpose==='primary_wintering'){
   if(layout.closuresConfirmed!==true)add('winter_technical_openings_closure_confirmation_required');
  }
 }
 const closed=rows(layout.closedOpenings),closedIds=new Set(),closedItems=new Set();
 if(layout.mode===MODES.SIDE_BY_SIDE&&closed.length)add('side_by_side_plastic_plugs_must_be_removed',{actual:closed.length});
 if(layout.mode===MODES.SINGLE_FAMILY&&layout.purpose==='primary_wintering'&&closed.length!==openingById.size)add('winter_plastic_plug_coverage_invalid',{expected:openingById.size,actual:Array.isArray(layout.closedOpenings)?closed.length:null});
 for(const closure of closed){
  if(!isObject(closure)){add('closed_opening_invalid');continue}
  if(closedIds.has(closure.openingId))add('closed_opening_duplicate',{openingId:closure.openingId??null});
  closedIds.add(closure.openingId);
  if(closedItems.has(closure.itemId))add('closed_opening_plug_reused',{itemId:closure.itemId??null});
  closedItems.add(closure.itemId);
  const opening=openingById.get(closure.openingId);
  if(!opening||opening.bodyId!==closure.bodyId)add('closed_opening_reference_invalid',{bodyId:closure.bodyId??null,openingId:closure.openingId??null});
  checkItem(closure.itemId,'plasticPlug',{bodyId:closure.bodyId,openingId:closure.openingId});
 }
 if(layout.mode===MODES.SINGLE_FAMILY&&layout.purpose==='primary_wintering')for(const id of openingById.keys())if(!closedIds.has(id))add('winter_plastic_plug_missing',{openingId:id});
 const referencedKinds=new Set(['bottom','cover','topRiser','feeder','honeyQueenExcluder','metalMeshPlug','plasticPlug','meshDiaphragm']);
 for(const item of Object.values(items)){
  if(!isObject(item)||item.location?.type!=='hive'||item.location.hiveId!==layout.hiveId||!referencedKinds.has(item.kind))continue;
  if(!usedItems.has(item.id))add('section_accessory_unreferenced',{itemId:item.id,kind:item.kind});
 }
 return {valid:errors.length===0,errors};
}
function validateHoneyStack(stack,sections,add,checkBody,checkItem,state){
 if(!isObject(stack)){add('honey_stack_invalid');return}
 if(!['early','main'].includes(stack.purpose))add('honey_stack_purpose_invalid',{purpose:stack.purpose??null});
 const bodyIds=rows(stack.bodyIds);
 if(![2,4].includes(bodyIds.length)||(stack.purpose==='early'&&bodyIds.length!==2))add('honey_stack_body_count_invalid',{expected:stack.purpose==='early'?2:'2 or 4',actual:bodyIds.length});
 if(new Set(bodyIds).size!==bodyIds.length)add('honey_stack_body_duplicate',{bodyIds});
 bodyIds.forEach(id=>checkBody(id,'honey','shared-honey-stack'));
 for(const bodyId of bodyIds){
  const frames=rows(state?.equipmentInventory?.bodies?.[bodyId]?.frames);
  if(frames.length>10)add('honey_stack_frame_capacity_exceeded',{bodyId,maximum:10,actual:frames.length});
  if(frames.some(frame=>!isObject(frame)||frame.history!=null&&!Array.isArray(frame.history)))add('honey_stack_frame_record_invalid',{bodyId});
  if(stack.purpose==='early'){
   if(frames.length!==10)add('early_honey_frame_count_invalid',{bodyId,expected:10,actual:frames.length});
   if(frames.some(frame=>!isObject(frame)||!['drawn_comb','wax_foundation'].includes(frame.combType)))add('early_honey_frame_comb_type_invalid',{bodyId});
   const foundation=frames.map((frame,index)=>frame?.combType==='wax_foundation'?index:-1).filter(index=>index>=0);
   if(foundation.length>2)add('early_honey_wax_foundation_limit_exceeded',{bodyId,maximum:2,actual:foundation.length});
   for(const index of foundation)if(index===0||index===frames.length-1||frames[index-1]?.combType!=='drawn_comb'||frames[index+1]?.combType!=='drawn_comb')
    add('early_honey_wax_foundation_not_between_drawn_comb',{bodyId,position:index+1});
  }
 }
 const excluders=rows(stack.excluders);
 if(excluders.length!==2)add('large_excluder_count_invalid',{expected:2,actual:Array.isArray(stack.excluders)?excluders.length:null});
 const bySide=new Map(excluders.filter(isObject).map(row=>[row.side,row]));
 const left=sections.find(section=>section.position==='left'),middle=sections.find(section=>section.position==='middle'),right=sections.find(section=>section.position==='right');
 if(!left||!middle||!right)return;
 const upper=section=>section?.upperBroodBodyId||null;
 const expected={left:[{bodyId:upper(left),coverage:'FULL'},{bodyId:upper(middle),coverage:'HALF'}],right:[{bodyId:upper(middle),coverage:'HALF'},{bodyId:upper(right),coverage:'FULL'}]};
 for(const side of ['left','right']){
  const row=bySide.get(side);
  if(!row){add('large_excluder_side_missing',{side});continue}
  checkItem(row.itemId,'honeyQueenExcluder',{footprint:expected[side]});
 }
}
function validateTemporaryQueenIsolationCoverage(layout){
 const errors=[];
 if(!isObject(layout)||layout.mode!==MODES.SIDE_BY_SIDE)return [{code:'temporary_queen_coverage_requires_side_by_side',details:{}}];
 const expected=rows(layout.technicalConnections).flatMap(connection=>rows(connection?.openings)).map(opening=>opening?.openingId).filter(nonEmpty);
 if(!expected.length)errors.push({code:'temporary_queen_expected_openings_missing',details:{}});
 const plugs=rows(layout.temporaryQueenIsolation),counts=new Map();
 for(const plug of plugs)if(nonEmpty(plug?.openingId))counts.set(plug.openingId,(counts.get(plug.openingId)||0)+1);
 for(const openingId of expected){const count=counts.get(openingId)||0;if(count===0)errors.push({code:'temporary_queen_plug_coverage_missing',details:{openingId}});else if(count>1)errors.push({code:'temporary_queen_plug_coverage_duplicate',details:{openingId,count}})}
 for(const openingId of counts.keys())if(!expected.includes(openingId))errors.push({code:'temporary_queen_plug_coverage_extra',details:{openingId}});
 if(new Set(expected).size!==expected.length)errors.push({code:'temporary_queen_expected_opening_duplicate',details:{}});
 return errors;
}
function inspect(state){
 if(!isObject(state))return [{code:'sectional_layout_state_required',details:{}}];
 if(state.sectionalLayouts==null)return [];
 if(!Array.isArray(state.sectionalLayouts))return [{code:'sectional_layouts_not_array',details:{}}];
 const errors=[],seenIds=new Set(),seenHives=new Set(),bodyOwners=new Map(),itemOwners=new Map();
 state.sectionalLayouts.forEach((layout,index)=>{
  const result=validate(layout,state);
  result.errors.forEach(error=>errors.push({...error,details:{...error.details,index}}));
  if(layout?.id){if(seenIds.has(layout.id))errors.push({code:'sectional_layout_id_duplicate',details:{id:layout.id,index}});seenIds.add(layout.id)}
  if(layout?.hiveId){if(seenHives.has(layout.hiveId))errors.push({code:'sectional_layout_hive_duplicate',details:{hiveId:layout.hiveId,index}});seenHives.add(layout.hiveId)}
  const bodyIds=[...rows(layout?.sections).flatMap(section=>rows(section?.broodBodyIds)),...rows(layout?.honeyStack?.bodyIds)];
  for(const id of bodyIds){if(bodyOwners.has(id))errors.push({code:'sectional_layout_body_reused',details:{bodyId:id,layoutIds:[bodyOwners.get(id),layout?.id??null]}});else bodyOwners.set(id,layout?.id??null)}
  const itemIds=[...rows(layout?.stacks).flatMap(stack=>[stack?.bottomItemId,stack?.coverItemId,stack?.topRiserItemId,stack?.feederItemId].filter(Boolean)),...rows(layout?.technicalConnections).flatMap(connection=>rows(connection?.openings).map(row=>row?.itemId)),...rows(layout?.temporaryQueenIsolation).map(row=>row?.itemId),...rows(layout?.meshDiaphragms).map(row=>row?.itemId),...rows(layout?.closedOpenings).map(row=>row?.itemId),...rows(layout?.honeyStack?.excluders).map(row=>row?.itemId)].filter(Boolean);
  for(const id of itemIds){if(itemOwners.has(id))errors.push({code:'sectional_layout_item_reused',details:{itemId:id,layoutIds:[itemOwners.get(id),layout?.id??null]}});else itemOwners.set(id,layout?.id??null)}
 });
 return errors;
}
window.PasekaSectionalPhysicalLayout=Object.freeze({PROFILE_ID,MODES,validate,validateTemporaryQueenIsolationCoverage,inspect});
})();