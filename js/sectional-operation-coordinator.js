(function(){
'use strict';
const PROFILE_ID='sectional-multiqueen-v1';
const MODEL_VERSION=1;
const isObject=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const rows=value=>Array.isArray(value)?value:[];
const nonEmpty=value=>typeof value==='string'&&value.trim().length>0;
const validDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
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
 return keys.every(key=>(a[key]??null)===(b[key]??null));
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
 const oldIds=new Set(rows(oldLayout?.sections).flatMap(section=>rows(section?.broodBodyIds)));
 const newIds=new Set(rows(newLayout?.sections).flatMap(section=>rows(section?.broodBodyIds)));
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
  locations.set(bodyId,{type:'sectional',hiveId:layout.hiveId,layoutId:layout.id,sectionId:section.id,position:section.position});
 }
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
 return used;
}
function appendBodyMovementHistory(state,oldLayout,newLayout,storageById,at,makeId){
 const inventory=state?.equipmentInventory;
 if(!isObject(inventory)||!Array.isArray(inventory.events))return {ok:false,error:'equipment_body_event_journal_invalid'};
 const oldLocations=bodyLocationMap(oldLayout),newLocations=bodyLocationMap(newLayout);
 const bodyIds=new Set([...oldLocations.keys(),...newLocations.keys()]);
 const used=collectEventIds(state);
 for(const bodyId of bodyIds){
  const body=inventory.bodies?.[bodyId];
  if(!isObject(body))return {ok:false,error:'equipment_body_missing_for_history',details:{bodyId}};
  if(body.events!=null&&!Array.isArray(body.events))return {ok:false,error:'equipment_body_event_journal_invalid',details:{bodyId}};
  if(body.events==null)body.events=[];
  const from=oldLocations.get(bodyId)||{type:'storage',label:body.storageLocation||null};
  const to=newLocations.get(bodyId)||{type:'storage',label:storageById.get(bodyId)||null};
  if(oldLocations.has(bodyId)&&newLocations.has(bodyId)&&JSON.stringify(from)===JSON.stringify(to))continue;
  if(!newLocations.has(bodyId)&&!storageById.has(bodyId))return {ok:false,error:'equipment_body_storage_move_missing',details:{bodyId}};
  const installed=newLocations.has(bodyId);
  body.events.push({type:installed?'placed':'moved_to_storage',at,operationId:'OP-04',from:clone(from),to:clone(to)});
  if(body.events.length>300)body.events=body.events.slice(-300);
  body.updatedAt=at;
  const eventId=nextUniqueId(makeId,used);
  if(!eventId)return {ok:false,error:'equipment_body_event_id_unavailable',details:{bodyId}};
  inventory.events.push({id:eventId,type:installed?'sectional_body_placed':'sectional_body_moved_to_storage',at,bodyId,operationId:'OP-04',from:clone(from),to:clone(to)});
  if(inventory.events.length>1000)inventory.events=inventory.events.slice(-1000);
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
  const op05Rows=operations.filter(row=>row?.operationId==='OP-05'),op05=op05Rows[0],installedPlugs=rows(layout?.temporaryQueenIsolation);
  if(op05Rows.length>1)add('sectional_tech_process_op05_duplicate',{id:record.id,count:op05Rows.length});
  if(op05Rows.length===0&&installedPlugs.length)add('sectional_tech_process_op05_layout_without_operation',{id:record.id});
  if(op05Rows.length===1){
   if(!completed)add('sectional_tech_process_op05_requires_completed_op04',{id:record.id});
   if(op05.status!=='DONE'||!validDate(op05.completedAt))add('sectional_tech_process_op05_status_invalid',{id:record.id,status:op05.status??null});
   if(validDate(op05.completedAt)&&validDate(operation?.completedAt)&&Date.parse(op05.completedAt)<Date.parse(operation.completedAt))add('sectional_tech_process_op05_precedes_op04_completion',{id:record.id});
   if(op05.evidence?.layoutId!==statePart.layoutId)add('sectional_tech_process_op05_layout_evidence_mismatch',{id:record.id});
   if(op05.evidence?.standLevelConfirmed!==true)add('sectional_tech_process_op05_level_stand_confirmation_missing',{id:record.id});
   const coverageErrors=deps.PasekaSectionalPhysicalLayout?.validateTemporaryQueenIsolationCoverage?.(layout)||[{code:'temporary_queen_coverage_validator_missing'}];
   for(const error of coverageErrors)add('sectional_tech_process_'+error.code,{id:record.id,details:error.details??null});
   const itemIds=installedPlugs.map(row=>row?.itemId).sort(),openingIds=installedPlugs.map(row=>row?.openingId).sort();
   if(JSON.stringify(itemIds)!==JSON.stringify(rows(op05.evidence?.installedItemIds).slice().sort())||JSON.stringify(openingIds)!==JSON.stringify(rows(op05.evidence?.openingIds).slice().sort()))add('sectional_tech_process_op05_evidence_mismatch',{id:record.id});
   const movementEvidence=rows(op05.evidence?.itemMovementEventIds);
   if(movementEvidence.length!==installedPlugs.length)add('sectional_tech_process_op05_movement_evidence_count_invalid',{id:record.id});
   for(const plug of installedPlugs){
    const evidence=movementEvidence.find(row=>row?.itemId===plug?.itemId),item=state.equipmentInventory?.items?.[plug?.itemId];
    const event=rows(item?.events).find(row=>row?.id===evidence?.eventId),globalEvent=rows(state.equipmentInventory?.itemEvents).find(row=>row?.id===evidence?.eventId&&row?.itemId===plug?.itemId);
    const target={type:'hive',hiveId:record.hiveId,bodyId:plug?.bodyId,openingId:plug?.openingId};
    if(!evidence||!event||!globalEvent||event.type!=='moved'||event.at!==op05.completedAt||event.from?.type!=='storage'||!sameLocation(event.to,target))add('sectional_tech_process_op05_movement_evidence_invalid',{id:record.id,itemId:plug?.itemId??null});
   }
   const days=calendarDayDifference(op05.completedAt,operation?.startedAt);
   if(days==null||days<8||days>11||op05.evidence?.daysAfterDivision!==days)add('sectional_tech_process_op05_timing_invalid',{id:record.id,daysAfterDivision:days,evidenceDays:op05.evidence?.daysAfterDivision??null});
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
 const bodyHistory=appendBodyMovementHistory(draft,oldLayout,nextLayout,bodyPlan.storageById,request.occurredAt,deps.makeId);
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
   operations:[{operationId:'OP-04',status:targetBroodRows===2?'DONE':'IN_PROGRESS',...(targetBroodRows===2?{completedAt:request.occurredAt}:{startedAt:request.occurredAt,completedAt:null}),evidence:{familyEventId:split.event.id,layoutId:nextLayout.id}}]
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
 const bodyHistory=appendBodyMovementHistory(draft,oldLayout,nextLayout,new Map(),request.occurredAt,deps.makeId);
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
window.PasekaSectionalOperationCoordinator=Object.freeze({PROFILE_ID,MODEL_VERSION,inspect,completeOP04,completeOP04SecondRow,completeOP05});
})();