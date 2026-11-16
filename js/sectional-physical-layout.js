(() => {
'use strict';
const MODES=new Set(['THREE_SIDE_BY_SIDE_SECTIONS','VERTICAL_COLUMN_THREE_FAMILIES','SINGLE_STACK_ONE_FAMILY']);
function validate(record,apiaryState){
 const errors=[],add=(code,details={})=>errors.push({code:'PHYSICAL_LAYOUT_'+code,details});
 const state=record?.state;
 if(!state||state.physicalLayoutVersion==null)return {valid:true,errors};
 if(state.physicalLayoutVersion!==1){add('VERSION_UNSUPPORTED',{version:state.physicalLayoutVersion});return {valid:false,errors};}
 const hiveId=record?.hiveId,layout=apiaryState?.layouts?.[hiveId],inventory=apiaryState?.equipmentInventory||{},items=inventory.items||{},bodies=inventory.bodies||{};
 if(!apiaryState||!hiveId||!layout||!layout.corpusIds){add('APIARY_CONTEXT_REQUIRED',{hiveId:hiveId||null});return {valid:false,errors};}
 const physical=state.physicalLayout;
 if(!physical||physical.version!==1||!MODES.has(physical.mode)||!Array.isArray(physical.stacks)){add('CONFIG_INVALID',{mode:physical?.mode||null});return {valid:false,errors};}
 const sections=Array.isArray(state.sections)?state.sections:[],sectionById=new Map(),bodyOwners=new Map(),openingById=new Map(),stackById=new Map(),familyOwners=new Set();
 if(state.familyLineageVersion!==1)add('FAMILY_LINEAGE_VERSION_REQUIRED',{familyLineageVersion:state.familyLineageVersion??null});
 const opDone=id=>(Array.isArray(state.operations)?state.operations:[]).some(row=>row?.operationId===id&&row.status==='DONE');
 const mappedBody=(bodyId)=>Object.entries(layout.corpusIds||{}).filter(([,id])=>id===bodyId);
 const installedKeys=new Set((layout.mode==='winter'?(layout.winterOrder||[]):(layout.installedBoxes||[])).map(String));
 const item=(id,kind,context)=>{
  const row=items[id];
  if(!id||!row||row.id!==id){add('ITEM_MISSING',{itemId:id||null,expectedKind:kind,...context});return null;}
  if(row.kind!==kind)add('ITEM_KIND',{itemId:id,expectedKind:kind,actualKind:row.kind,...context});
  if(row.condition!=='good')add('ITEM_CONDITION',{itemId:id,condition:row.condition,...context});
  return row;
 };
 sections.forEach((section,index)=>{
  if(!section||typeof section!=='object'||Array.isArray(section)){add('SECTION_INVALID',{index});return;}
  if(typeof section.id!=='string'||!section.id.trim())add('SECTION_ID_REQUIRED',{index});
  else if(sectionById.has(section.id))add('SECTION_ID_DUPLICATE',{sectionId:section.id});
  else sectionById.set(section.id,section);
  if(!section.familyId)add('SECTION_FAMILY_REQUIRED',{sectionId:section.id||null});
  else if(familyOwners.has(section.familyId))add('FAMILY_ASSIGNED_TWICE',{familyId:section.familyId});
  else familyOwners.add(section.familyId);
  const family=(apiaryState.families||[]).find(row=>row?.id===section.familyId);
  if(!family||family.hive!==hiveId||family.recordStatus!=='active')add('SECTION_FAMILY_REFERENCE',{sectionId:section.id||null,familyId:section.familyId||null});
  else if(section.queenId){
   const queen=(apiaryState.queens||[]).find(row=>row?.id===section.queenId);
   if(family.currentQueenId!==section.queenId||family.queenIdentityStatus!=='identified'||!queen||queen.familyId!==family.id||queen.status!=='current')add('SECTION_QUEEN_REFERENCE',{sectionId:section.id||null,familyId:family.id,queenId:section.queenId});
  }else if(family.currentQueenId||family.queenIdentityStatus!=='unresolved')add('SECTION_QUEEN_UNRESOLVED_STATE',{sectionId:section.id||null,familyId:family.id,currentQueenId:family.currentQueenId||null,queenIdentityStatus:family.queenIdentityStatus||null});
  if(!Array.isArray(section.bodyIds)||!section.bodyIds.length)add('SECTION_BODIES_REQUIRED',{sectionId:section.id||null});
  for(const bodyId of Array.isArray(section.bodyIds)?section.bodyIds:[]){
   if(typeof bodyId!=='string'||!bodyId.trim()){add('BODY_ID_INVALID',{sectionId:section.id||null});continue;}
   if(bodyOwners.has(bodyId))add('BODY_ASSIGNED_TWICE',{bodyId,sectionIds:[bodyOwners.get(bodyId),section.id]});
   else bodyOwners.set(bodyId,section.id);
   const body=bodies[bodyId];
   if(!body||body.id!==bodyId){add('BODY_INVENTORY_MISSING',{bodyId,sectionId:section.id||null});continue;}
   if(body.kind!=='brood')add('BODY_KIND',{bodyId,kind:body.kind});
   if(body.spec?.profileId!=='sectional-multiqueen-v1'||body.spec?.framesPerBox!==6)add('BODY_PROFILE_MISMATCH',{bodyId,profileId:body.spec?.profileId??null,framesPerBox:body.spec?.framesPerBox??null});
   const locations=mappedBody(bodyId);
   if(locations.length!==1)add('BODY_LAYOUT_MAPPING',{bodyId,locations:locations.map(([key])=>key)});
   else if(!installedKeys.has(String(locations[0][0])))add('BODY_NOT_INSTALLED',{bodyId,boxKey:locations[0][0]});
  }
  if(!Array.isArray(section.openings))add('OPENINGS_REQUIRED',{sectionId:section.id||null});
  else for(const opening of section.openings){
   if(!opening||typeof opening!=='object'||Array.isArray(opening)){add('OPENING_INVALID',{sectionId:section.id||null});continue;}
   if(typeof opening.id!=='string'||!opening.id.trim())add('OPENING_ID_REQUIRED',{sectionId:section.id||null});
   else if(openingById.has(opening.id))add('OPENING_ID_DUPLICATE',{openingId:opening.id});
   else openingById.set(opening.id,{...opening,sectionId:section.id});
   if(!section.bodyIds?.includes(opening.bodyId))add('OPENING_BODY_MISMATCH',{openingId:opening.id||null,bodyId:opening.bodyId||null,sectionId:section.id||null});
   if(opening.diameterMm!==50)add('OPENING_DIAMETER',{openingId:opening.id||null,diameterMm:opening.diameterMm??null,expected:50});
  }
 });
 const stacks=physical.stacks;
 if(physical.mode==='THREE_SIDE_BY_SIDE_SECTIONS'){
  if(sections.length!==3||stacks.length!==3)add('SIDE_BY_SIDE_SHAPE',{sections:sections.length,stacks:stacks.length});
  const positions=stacks.map(x=>x?.position);
  if(['LEFT','CENTER','RIGHT'].some(x=>positions.filter(y=>y===x).length!==1))add('SIDE_BY_SIDE_POSITIONS',{positions});
  for(const stack of stacks)if(!Array.isArray(stack?.sectionIds)||stack.sectionIds.length!==1)add('SIDE_BY_SIDE_STACK_SECTION_COUNT',{stackId:stack?.id||null});
  for(const section of sections)if((section?.bodyIds||[]).length!==2)add('SIDE_BY_SIDE_BODY_COUNT',{sectionId:section?.id||null,count:section?.bodyIds?.length??0});
 }else if(physical.mode==='VERTICAL_COLUMN_THREE_FAMILIES'){
  if(sections.length!==3||stacks.length!==1)add('VERTICAL_COLUMN_SHAPE',{sections:sections.length,stacks:stacks.length});
  const stack=stacks[0];
  if(stack?.position!=='COLUMN'||!Array.isArray(stack?.sectionIds)||stack.sectionIds.length!==3)add('VERTICAL_COLUMN_STACK_INVALID',{stackId:stack?.id||null});
  const expected=[['lower',2],['middle',1],['upper',1]];
  if(stack?.sectionIds?.map(id=>sectionById.get(id)?.winteringPosition).join(',')!=='lower,middle,upper')add('VERTICAL_COLUMN_ORDER',{sectionIds:stack?.sectionIds||[]});
  expected.forEach(([position,count])=>{
   const section=sections.find(row=>row?.winteringPosition===position);
   if(!section||(section.bodyIds||[]).length!==count)add('VERTICAL_COLUMN_SECTION_LAYOUT',{position,expectedBodyCount:count,actualBodyCount:section?.bodyIds?.length??0});
  });
 }else{
  if(sections.length!==1||stacks.length!==1)add('SINGLE_FAMILY_STACK_SHAPE',{sections:sections.length,stacks:stacks.length});
  const stack=stacks[0],section=sections[0];
  if(stack?.position!=='COLUMN'||!Array.isArray(stack?.sectionIds)||stack.sectionIds.length!==1||stack.sectionIds[0]!==section?.id)add('SINGLE_FAMILY_STACK_INVALID',{stackId:stack?.id||null});
  if(![3,4].includes(section?.bodyIds?.length||0))add('SINGLE_FAMILY_BODY_COUNT',{count:section?.bodyIds?.length??0,expected:[3,4]});
 }
 const coveredSections=[],usedBottomIds=new Set();
 for(const stack of stacks){
  if(!stack||typeof stack.id!=='string'||!stack.id.trim()){add('STACK_ID_REQUIRED');continue;}
  if(stackById.has(stack.id))add('STACK_ID_DUPLICATE',{stackId:stack.id});
  stackById.set(stack.id,stack);
  for(const sectionId of Array.isArray(stack.sectionIds)?stack.sectionIds:[]){
   if(!sectionById.has(sectionId))add('STACK_SECTION_MISSING',{stackId:stack.id,sectionId});
   coveredSections.push(sectionId);
  }
  if(usedBottomIds.has(stack.bottomItemId))add('BOTTOM_REUSED',{itemId:stack.bottomItemId});
  usedBottomIds.add(stack.bottomItemId);
  const bottom=item(stack.bottomItemId,'bottom',{stackId:stack.id});
  if(bottom&&(bottom.location?.type!=='hive'||bottom.location.hiveId!==hiveId||bottom.location.stackId!==stack.id))add('STACK_BOTTOM_LOCATION',{stackId:stack.id,itemId:stack.bottomItemId,location:bottom.location||null});
 }
 if(new Set(coveredSections).size!==coveredSections.length||coveredSections.length!==sections.length||sections.some(section=>!coveredSections.includes(section.id)))add('STACK_SECTION_COVERAGE',{coveredSections,sectionIds:sections.map(x=>x?.id||null)});
 const connections=Array.isArray(state.technicalConnections)?state.technicalConnections:[];
 if(physical.mode==='THREE_SIDE_BY_SIDE_SECTIONS'){
  const expected=[[1,2],[2,3]];
  if(connections.length!==2)add('CONNECTION_COUNT',{count:connections.length,expected:2});
  const usedOpeningIds=new Set(),usedExcluderIds=new Set(),usedConnectionIds=new Set();
  for(const [fromIndex,toIndex] of expected){
   const from=sections.find(x=>x?.index===fromIndex),to=sections.find(x=>x?.index===toIndex);
   const connection=connections.find(x=>x?.fromSectionIndex===fromIndex&&x?.toSectionIndex===toIndex);
   if(!from||!to||!connection){add('CONNECTION_MISSING',{fromIndex,toIndex});continue;}
   if(typeof connection.id!=='string'||!connection.id.trim())add('CONNECTION_ID_REQUIRED',{fromIndex,toIndex});
   else if(usedConnectionIds.has(connection.id))add('CONNECTION_ID_DUPLICATE',{connectionId:connection.id});
   else usedConnectionIds.add(connection.id);
   if(connection.fromSectionId!==from.id||connection.toSectionId!==to.id)add('CONNECTION_SECTION_REFERENCE',{connectionId:connection.id||null,fromSectionId:connection.fromSectionId||null,toSectionId:connection.toSectionId||null});
   if(connection.queenExcluderLayers!==2||connection.bufferCorridorPresent!==true)add('CONNECTION_GEOMETRY',{connectionId:connection.id||null,queenExcluderLayers:connection.queenExcluderLayers??null,bufferCorridorPresent:connection.bufferCorridorPresent??null});
   const openingIds=Array.isArray(connection.openingIds)?connection.openingIds:[];
   const linkedOpenings=openingIds.map(id=>openingById.get(id)).filter(Boolean);
   if(linkedOpenings.length<2||!linkedOpenings.some(x=>x.sectionId===from.id)||!linkedOpenings.some(x=>x.sectionId===to.id))add('CONNECTION_OPENINGS',{connectionId:connection.id||null,openingIds});
   for(const id of openingIds){if(usedOpeningIds.has(id))add('OPENING_REUSED',{openingId:id});usedOpeningIds.add(id);if(!openingById.has(id))add('CONNECTION_OPENING_MISSING',{connectionId:connection.id||null,openingId:id});}
   const excluderIds=Array.isArray(connection.queenExcluderItemIds)?connection.queenExcluderItemIds:[];
   if(excluderIds.length!==2||new Set(excluderIds).size!==2)add('CONNECTION_EXCLUDERS_REQUIRED',{connectionId:connection.id||null,itemIds:excluderIds});
   for(const id of excluderIds){
    if(usedExcluderIds.has(id))add('CONNECTION_EXCLUDER_REUSED',{itemId:id});usedExcluderIds.add(id);
    const excluder=item(id,'technicalQueenExcluder',{connectionId:connection.id||null});
    if(excluder&&(excluder.location?.type!=='hive'||excluder.location.hiveId!==hiveId||excluder.location.connectionId!==connection.id))add('CONNECTION_EXCLUDER_LOCATION',{itemId:id,connectionId:connection.id||null,location:excluder.location||null});
   }
  }
  for(const openingId of openingById.keys())if(!usedOpeningIds.has(openingId))add('OPENING_NOT_CONNECTED',{openingId});
 }
 const meshPlugs=Array.isArray(state.meshPlugs)?state.meshPlugs:[];
 const plugsByOpening=new Map(),usedPlugIds=new Set();
 for(const plug of meshPlugs){
  if(!plug||typeof plug!=='object'||Array.isArray(plug)){add('MESH_PLUG_INVALID');continue;}
  const opening=openingById.get(plug.openingId);
  if(!opening)add('MESH_PLUG_OPENING_MISSING',{itemId:plug.itemId||null,openingId:plug.openingId||null});
  else if(plug.bodyId!==opening.bodyId)add('MESH_PLUG_BODY_MISMATCH',{itemId:plug.itemId||null,openingId:plug.openingId,bodyId:plug.bodyId||null});
  if(plugsByOpening.has(plug.openingId))add('MESH_PLUG_DUPLICATE_OPENING',{openingId:plug.openingId});
  plugsByOpening.set(plug.openingId,plug);
  if(usedPlugIds.has(plug.itemId))add('MESH_PLUG_ITEM_REUSED',{itemId:plug.itemId||null});
  usedPlugIds.add(plug.itemId);
  const plugItem=item(plug.itemId,'metalMeshPlug',{openingId:plug.openingId||null});
  if(plugItem){
   if(plug.installed===true){
    if(plugItem.location?.type!=='hive'||plugItem.location.hiveId!==hiveId||plugItem.location.sectionId!==opening?.sectionId||plugItem.location.bodyId!==plug.bodyId||plugItem.location.openingId!==plug.openingId)add('MESH_PLUG_LOCATION',{itemId:plug.itemId,openingId:plug.openingId||null,location:plugItem.location||null});
   }else if(plug.installed===false){
    if(plugItem.location?.type!=='storage')add('MESH_PLUG_STORAGE_LOCATION',{itemId:plug.itemId,location:plugItem.location||null});
   }else add('MESH_PLUG_INSTALLED_FLAG',{itemId:plug.itemId,installed:plug.installed??null});
  }
 }
 for(const openingId of openingById.keys())if(!plugsByOpening.has(openingId))add('MESH_PLUG_FOR_OPENING_REQUIRED',{openingId});
 if(opDone('OP-05')&&!opDone('OP-06'))for(const openingId of openingById.keys())if(plugsByOpening.get(openingId)?.installed!==true)add('OP05_MESH_PLUG_NOT_INSTALLED',{openingId});
 if(opDone('OP-06'))for(const openingId of openingById.keys())if(plugsByOpening.get(openingId)?.installed!==false)add('OP06_MESH_PLUG_NOT_REMOVED',{openingId});
 if(physical.mode==='VERTICAL_COLUMN_THREE_FAMILIES'||opDone('OP-12')){
  const diaphragms=Array.isArray(state.diaphragms)?state.diaphragms:[];
  if(diaphragms.length!==2)add('DIAPHRAGM_COUNT',{count:diaphragms.length,expected:2});
  const stack=stacks[0],ordered=(stack?.sectionIds||[]).map(id=>sectionById.get(id));
  const expectedPairs=ordered.length===3?[[ordered[0]?.id,ordered[1]?.id],[ordered[1]?.id,ordered[2]?.id]]:[];
  const positions=new Set(),ids=new Set();
  diaphragms.forEach((diaphragm,index)=>{
   if(!diaphragm||typeof diaphragm!=='object'){add('DIAPHRAGM_INVALID',{index});return;}
   if(ids.has(diaphragm.itemId))add('DIAPHRAGM_ITEM_REUSED',{itemId:diaphragm.itemId});ids.add(diaphragm.itemId);
   if(!expectedPairs.some(([from,to])=>from===diaphragm.fromSectionId&&to===diaphragm.toSectionId))add('DIAPHRAGM_SECTION_REFERENCE',{itemId:diaphragm.itemId||null,fromSectionId:diaphragm.fromSectionId||null,toSectionId:diaphragm.toSectionId||null});
   const row=item(diaphragm.itemId,'meshDiaphragm',{index});
   if(typeof diaphragm.positionLabel!=='string'||!diaphragm.positionLabel.trim()||positions.has(diaphragm.positionLabel))add('DIAPHRAGM_POSITION',{positionLabel:diaphragm.positionLabel||null});
   positions.add(diaphragm.positionLabel);
   if(row&&(row.location?.type!=='hive'||row.location.hiveId!==hiveId||row.location.positionLabel!==diaphragm.positionLabel))add('DIAPHRAGM_LOCATION',{itemId:diaphragm.itemId,location:row.location||null});
  });
 }
 return {valid:errors.length===0,errors};
}
window.PasekaSectionalPhysicalLayout=Object.freeze({validate,modes:[...MODES]});
})();