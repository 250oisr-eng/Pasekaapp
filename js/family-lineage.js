(() => {
'use strict';

const EVENT_TYPES = Object.freeze([
 'split','merge','alternative_wintering_configured','placement_changed',
 'queen_identity_confirmed','early_honey_harvest_completed','offshoot_created'
]);
const POSITIONS = Object.freeze(['lower','middle','upper']);
const clone = value => typeof structuredClone === 'function'
 ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const uniqueStrings = values => Array.isArray(values) && values.every(x => typeof x === 'string' && x.trim()) && new Set(values).size === values.length;
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const familyStatus = family => family?.recordStatus === 'historical' ? 'historical' : 'active';
const isActive = family => familyStatus(family) === 'active';
const commit = (target, draft) => {
 for (const key of Object.keys(target)) if (!(key in draft)) delete target[key];
 Object.assign(target, draft);
};
function inspect(state) {
 const errors = [], add = (code, details={}) => errors.push({code, details});
 if (!isObject(state)) return [{code:'family_lineage_state_invalid',details:{}}];
 const families = Array.isArray(state.families) ? state.families : [];
 const queens = Array.isArray(state.queens) ? state.queens : [];
 const events = Array.isArray(state.familyEvents) ? state.familyEvents : [];
 if (state.meta?.schemaVersion >= 14 && !Array.isArray(state.familyEvents))
  add('family_events_section_missing');
 if (state.familyEvents != null && !Array.isArray(state.familyEvents))
  add('family_events_not_array');
 const familyMap = new Map(), queenMap = new Map();
 for (const family of families) {
  if (!isObject(family) || typeof family.id !== 'string' || !family.id.trim()) {
   add('family_lineage_family_identity_invalid',{familyId:family?.id??null});
   continue;
  }
  if (familyMap.has(family.id)) add('family_lineage_family_id_duplicate',{familyId:family.id});
  else familyMap.set(family.id,family);
  if (family.recordStatus != null && !['active','historical'].includes(family.recordStatus))
   add('family_record_status_invalid',{familyId:family.id,status:family.recordStatus});
  if (family.colonyGroupId != null && (typeof family.colonyGroupId !== 'string' || !family.colonyGroupId.trim() || family.colonyGroupId.length > 160))
   add('family_colony_group_invalid',{familyId:family.id});
  if (family.queenIdentityStatus != null && !['identified','unresolved'].includes(family.queenIdentityStatus))
   add('family_queen_identity_status_invalid',{familyId:family.id,status:family.queenIdentityStatus});
  if (family.queenIdentityStatus === 'unresolved' && family.currentQueenId)
   add('unresolved_family_has_current_queen',{familyId:family.id,queenId:family.currentQueenId});
  if (family.queenIdentityStatus === 'identified' && !family.currentQueenId)
   add('identified_family_queen_missing',{familyId:family.id});
 }
 for (const queen of queens) {
  if (!isObject(queen) || typeof queen.id !== 'string' || !queen.id.trim()) continue;
  if (queenMap.has(queen.id)) add('family_lineage_queen_id_duplicate',{queenId:queen.id});
  else queenMap.set(queen.id,queen);
 }
 for (const queen of queens) {
  if (!isObject(queen) || !queen.id) continue;
  if (queen.originFamilyId != null && !familyMap.has(queen.originFamilyId))
   add('queen_origin_family_missing',{queenId:queen.id,originFamilyId:queen.originFamilyId});
  if (queen.originType != null && !['emergency_reared','introduced','unknown'].includes(queen.originType))
   add('queen_origin_type_invalid',{queenId:queen.id,originType:queen.originType});
 }
 if (Number(state.meta?.schemaVersion)>=14) {
  const activeQueenOwners=new Map();
  for (const family of families) {
   if (!isObject(family)||!isActive(family)||!family.currentQueenId) continue;
   const queen=queenMap.get(family.currentQueenId);
   if (!queen) add('family_current_queen_missing',{familyId:family.id,queenId:family.currentQueenId});
   else {
    if (queen.familyId!==family.id) add('family_current_queen_link_mismatch',{familyId:family.id,queenId:queen.id,queenFamilyId:queen.familyId??null});
    if (['dead','retired','lost','culled'].includes(queen.status)) add('inactive_queen_assigned_to_active_family',{familyId:family.id,queenId:queen.id,status:queen.status});
   }
   if (activeQueenOwners.has(family.currentQueenId)) add('queen_assigned_to_multiple_active_families',{queenId:family.currentQueenId,familyIds:[activeQueenOwners.get(family.currentQueenId),family.id]});
   else activeQueenOwners.set(family.currentQueenId,family.id);
  }
 }
 const eventIds = new Set();
 for (const event of events) {
  if (!isObject(event) || typeof event.id !== 'string' || !event.id.trim()) {
   add('family_event_identity_invalid',{eventId:event?.id??null});
   continue;
  }
  if (eventIds.has(event.id)) add('family_event_id_duplicate',{eventId:event.id});
  eventIds.add(event.id);
  if (!EVENT_TYPES.includes(event.type)) add('family_event_type_invalid',{eventId:event.id,type:event.type??null});
  if (event.survivorFamilyId != null) add('forbidden_survivor_family_id',{eventId:event.id});
  if (!validTime(event.occurredAt)) add('family_event_time_invalid',{eventId:event.id});
  if (event.createdAt != null && !validTime(event.createdAt)) add('family_event_created_at_invalid',{eventId:event.id});
  if (event.operationId != null && (typeof event.operationId !== 'string' || event.operationId.length > 24))
   add('family_event_operation_id_invalid',{eventId:event.id});
  const sourceIds = event.sourceFamilyIds == null ? [] : event.sourceFamilyIds;
  const resultIds = event.resultFamilyIds == null ? [] : event.resultFamilyIds;
  if (!uniqueStrings(sourceIds)) add('family_event_source_ids_invalid',{eventId:event.id});
  if (!uniqueStrings(resultIds)) add('family_event_result_ids_invalid',{eventId:event.id});
  for (const id of [...(Array.isArray(sourceIds)?sourceIds:[]),...(Array.isArray(resultIds)?resultIds:[])])
   if (!familyMap.has(id)) add('family_event_family_missing',{eventId:event.id,familyId:id});
  const candidateIds = event.candidateQueenIds == null ? [] : event.candidateQueenIds;
  if (!uniqueStrings(candidateIds)) add('family_event_candidate_queen_ids_invalid',{eventId:event.id});
  for (const id of Array.isArray(candidateIds)?candidateIds:[])
   if (!queenMap.has(id)) add('family_event_candidate_queen_missing',{eventId:event.id,queenId:id});
  if (event.type === 'split' && (!Array.isArray(sourceIds) || sourceIds.length !== 1 || !Array.isArray(resultIds) || resultIds.length < 2))
   add('family_split_shape_invalid',{eventId:event.id});
  if (event.type === 'merge' && (!Array.isArray(sourceIds) || sourceIds.length < 2 || !Array.isArray(resultIds) || resultIds.length !== 1))
   add('family_merge_shape_invalid',{eventId:event.id});
  if (['split','merge'].includes(event.type) && event.colonyGroupId) {
   for (const familyId of [...(Array.isArray(sourceIds)?sourceIds:[]),...(Array.isArray(resultIds)?resultIds:[])]) {
    const family=familyMap.get(familyId);
    if (family && family.colonyGroupId!==event.colonyGroupId) add('family_event_colony_group_mismatch',{eventId:event.id,familyId,colonyGroupId:event.colonyGroupId});
   }
  }
  if (event.type === 'alternative_wintering_configured') {
   if (!uniqueStrings(event.familyIds) || event.familyIds.length !== 3) add('alternative_wintering_families_invalid',{eventId:event.id});
   const winterGroups=(Array.isArray(event.familyIds)?event.familyIds:[]).map(id=>familyMap.get(id)?.colonyGroupId);
   if (winterGroups.some(id=>!id)||new Set(winterGroups).size!==1) add('alternative_wintering_colony_group_mismatch',{eventId:event.id});
   if (!uniqueStrings(event.diaphragmItemIds) || event.diaphragmItemIds.length !== 2) add('alternative_wintering_diaphragms_invalid',{eventId:event.id});
   if (!Array.isArray(event.layout) || event.layout.length !== 3) add('alternative_wintering_layout_invalid',{eventId:event.id});
   else {
    const positions = event.layout.map(row=>row?.position);
    if (POSITIONS.some(position=>positions.filter(value=>value===position).length!==1)) add('alternative_wintering_positions_invalid',{eventId:event.id});
    for (const row of event.layout) {
     if (!event.familyIds?.includes(row?.familyId) || ![1,2].includes(row?.bodyCount))
      add('alternative_wintering_body_distribution_invalid',{eventId:event.id,position:row?.position,bodyCount:row?.bodyCount??null});
    }
    const bodyCounts=event.layout.map(row=>row?.bodyCount).sort((a,b)=>a-b);
    if (bodyCounts.length!==3||bodyCounts[0]!==1||bodyCounts[1]!==1||bodyCounts[2]!==2)
     add('alternative_wintering_body_distribution_invalid',{eventId:event.id,bodyCounts});
    if (new Set(event.layout.map(row=>row?.familyId)).size !== 3) add('alternative_wintering_layout_family_duplicate',{eventId:event.id});
   }
   const itemMap = state.equipmentInventory?.items;
   for (const itemId of Array.isArray(event.diaphragmItemIds)?event.diaphragmItemIds:[]) {
    const item = isObject(itemMap) ? itemMap[itemId] : null;
    if (!item || item.id !== itemId) add('alternative_wintering_diaphragm_missing',{eventId:event.id,itemId});
    else {
     if (item.kind !== 'meshDiaphragm') add('alternative_wintering_diaphragm_kind_invalid',{eventId:event.id,itemId,kind:item.kind??null});
    }
   }
   const snapshots=Array.isArray(event.diaphragmSnapshots)?event.diaphragmSnapshots:[];
   if (snapshots.length!==2 || snapshots.some(snapshot=>!event.diaphragmItemIds?.includes(snapshot?.itemId)||snapshot?.kind!=='meshDiaphragm'||snapshot?.condition!=='good'||snapshot?.hiveId!==event.hiveId||!snapshot?.positionLabel)) add('alternative_wintering_diaphragm_snapshot_invalid',{eventId:event.id});
   const labels=snapshots.map(snapshot=>snapshot.positionLabel).filter(Boolean);
   if (labels.length===2 && new Set(labels).size!==2) add('alternative_wintering_diaphragm_position_duplicate',{eventId:event.id});
   for (const familyId of Array.isArray(event.familyIds)?event.familyIds:[])
    if (!familyMap.has(familyId)) add('family_event_family_missing',{eventId:event.id,familyId});
  }
  if (event.type === 'early_honey_harvest_completed') {
   if (!uniqueStrings(event.familyIds) || event.familyIds.length !== 3) add('early_honey_family_ids_invalid',{eventId:event.id});
   for (const key of ['honeyBodiesRemoved','largeExcludersRemoved','harvestConfirmed','diaphragmsRemoved','familiesOnSeparateBottoms'])
    if (event[key] !== true) add('early_honey_confirmation_missing',{eventId:event.id,field:key});
   if (![3,4].includes(event.nestBodiesAfterHarvest)) add('early_honey_nest_reduction_invalid',{eventId:event.id,value:event.nestBodiesAfterHarvest??null});
   for (const familyId of Array.isArray(event.familyIds)?event.familyIds:[])
    if (!familyMap.has(familyId)) add('family_event_family_missing',{eventId:event.id,familyId});
   const harvestGroups=(Array.isArray(event.familyIds)?event.familyIds:[]).map(id=>familyMap.get(id)?.colonyGroupId);
   if (harvestGroups.some(id=>!id)||new Set(harvestGroups).size!==1) add('early_honey_colony_group_mismatch',{eventId:event.id});
   const setup=event.physicalSetup;
   if (!isObject(setup)) add('early_honey_physical_setup_missing',{eventId:event.id});
   else {
    if (!uniqueStrings(setup.honeyBodyIds)||setup.honeyBodyIds.length!==2) add('early_honey_body_ids_invalid',{eventId:event.id});
    if (!uniqueStrings(setup.largeExcluderIds)||setup.largeExcluderIds.length!==2) add('early_honey_excluder_ids_invalid',{eventId:event.id});
    if (!uniqueStrings(setup.upperBodyIds)||setup.upperBodyIds.length!==3) add('early_honey_upper_body_ids_invalid',{eventId:event.id});
    const bodyInventory=state.equipmentInventory?.bodies||{};
    const honeySnapshots=Array.isArray(setup.honeyBodySnapshots)?setup.honeyBodySnapshots:[];
    if (honeySnapshots.length!==2 || !uniqueStrings(honeySnapshots.map(snapshot=>snapshot?.bodyId)) || !uniqueStrings(setup.honeyBodyIds) || !honeySnapshots.every(snapshot=>setup.honeyBodyIds.includes(snapshot?.bodyId))) add('early_honey_body_snapshots_invalid',{eventId:event.id});
    for (const snapshot of honeySnapshots) {
     const body=bodyInventory[snapshot?.bodyId];
     if (!setup.honeyBodyIds?.includes(snapshot?.bodyId)||snapshot?.kind!=='honey'||snapshot?.condition!=='good'||snapshot?.framesPerBox!==10||snapshot?.profileId!=='sectional-multiqueen-v1'||snapshot?.hiveId!==event.hiveId||snapshot?.installed!==true)
      add('early_honey_body_snapshot_invalid',{eventId:event.id,bodyId:snapshot?.bodyId??null});
     if (!body||body.id!==snapshot?.bodyId||body.kind!=='honey'||body.spec?.framesPerBox!==10||body.spec?.profileId!=='sectional-multiqueen-v1')
      add('early_honey_body_physical_reference_invalid',{eventId:event.id,bodyId:snapshot?.bodyId??null});
    }
    const excluderSnapshots=Array.isArray(setup.largeExcluderSnapshots)?setup.largeExcluderSnapshots:[];
    if (excluderSnapshots.length!==2 || !uniqueStrings(excluderSnapshots.map(snapshot=>snapshot?.itemId)) || !uniqueStrings(setup.largeExcluderIds) || !excluderSnapshots.every(snapshot=>setup.largeExcluderIds.includes(snapshot?.itemId))) add('early_honey_excluder_snapshots_invalid',{eventId:event.id});
    const itemInventory=state.equipmentInventory?.items||{};
    const fullBodies=[],halfBodies=[];
    for (const snapshot of excluderSnapshots) {
     const item=itemInventory[snapshot?.itemId],coverage=Array.isArray(snapshot?.footprint)?snapshot.footprint:[];
     if (!setup.largeExcluderIds?.includes(snapshot?.itemId)||snapshot?.kind!=='honeyQueenExcluder'||snapshot?.condition!=='good'||snapshot?.hiveId!==event.hiveId||snapshot?.installed!==true)
      add('early_honey_excluder_snapshot_invalid',{eventId:event.id,itemId:snapshot?.itemId??null});
     if (!item||item.id!==snapshot?.itemId||item.kind!=='honeyQueenExcluder')
      add('early_honey_excluder_physical_reference_invalid',{eventId:event.id,itemId:snapshot?.itemId??null});
     if (coverage.length!==2||coverage.filter(row=>row?.coverage==='FULL').length!==1||coverage.filter(row=>row?.coverage==='HALF').length!==1||new Set(coverage.map(row=>row?.bodyId)).size!==2)
      add('early_honey_excluder_footprint_invalid',{eventId:event.id,itemId:snapshot?.itemId??null});
     if (coverage.length===2) { fullBodies.push(coverage.find(row=>row.coverage==='FULL')?.bodyId); halfBodies.push(coverage.find(row=>row.coverage==='HALF')?.bodyId); }
    }
    if (fullBodies.length===2&&halfBodies.length===2&&(!new Set(fullBodies).has(setup.upperBodyIds?.[0])||!new Set(fullBodies).has(setup.upperBodyIds?.[2])||halfBodies[0]!==setup.upperBodyIds?.[1]||halfBodies[1]!==setup.upperBodyIds?.[1]))
     add('early_honey_excluder_geometry_invalid',{eventId:event.id});
    for (const bodyId of Array.isArray(setup.upperBodyIds)?setup.upperBodyIds:[]) {
     const body=bodyInventory[bodyId];
     if (!body||body.id!==bodyId||body.kind!=='brood'||body.spec?.framesPerBox!==6||body.spec?.profileId!=='sectional-multiqueen-v1')
      add('early_honey_upper_body_reference_invalid',{eventId:event.id,bodyId});
    }
   }
  }
  if (event.type === 'queen_identity_confirmed') {
   const family = familyMap.get(event.familyId), queen = queenMap.get(event.queenId);
   if (!family) add('queen_identity_family_missing',{eventId:event.id,familyId:event.familyId??null});
   if (!queen) add('queen_identity_queen_missing',{eventId:event.id,queenId:event.queenId??null});
   const eventTime=Date.parse(event.createdAt||event.occurredAt||'');
   const superseded=state.familyEvents.some(other=>other?.id!==event.id&&Number.isFinite(Date.parse(other?.createdAt||''))&&Date.parse(other.createdAt)>eventTime&&((other.sourceFamilyIds||[]).includes(event.familyId)||(other.resultFamilyIds||[]).includes(event.familyId)||other.familyId===event.familyId))||state.queenEvents.some(other=>other?.familyId===event.familyId&&Number.isFinite(Date.parse(other?.createdAt||''))&&Date.parse(other.createdAt)>eventTime);
   if (family && isActive(family) && family.currentQueenId !== event.queenId && !superseded) add('queen_identity_family_link_mismatch',{eventId:event.id,familyId:family.id,queenId:event.queenId??null});
   if (family && isActive(family) && family.currentQueenId === event.queenId && queen && queen.familyId !== event.familyId) add('queen_identity_queen_link_mismatch',{eventId:event.id,queenId:queen.id,familyId:event.familyId??null});
  }
  if (event.type === 'placement_changed') {
   const family=familyMap.get(event.familyId);
   if (!family) add('family_placement_event_family_missing',{eventId:event.id,familyId:event.familyId??null});
   if (!uniqueStrings(event.familyIds) || event.familyIds.length!==3 || !event.familyIds.includes(event.familyId)) add('family_placement_event_group_invalid',{eventId:event.id});
   const groupIds=(Array.isArray(event.familyIds)?event.familyIds:[]).map(id=>familyMap.get(id)?.colonyGroupId);
   if (groupIds.some(id=>!id)||new Set(groupIds).size!==1) add('family_placement_event_colony_group_mismatch',{eventId:event.id});
   if (!POSITIONS.includes(event.from?.position) || event.to?.position!=='separate_bottom') add('family_placement_event_positions_invalid',{eventId:event.id});
   const eventIndex=events.indexOf(event),winterEvent=events.slice(0,eventIndex).reverse().find(row=>row?.type==='alternative_wintering_configured'&&row.hiveId===event.hiveId&&row.familyIds?.includes(event.familyId));
   const sourceRow=winterEvent?.layout?.find(row=>row?.familyId===event.familyId);
   if (!sourceRow||sourceRow.bodyCount!==1||sourceRow.position!==event.from?.position) add('family_placement_event_source_mismatch',{eventId:event.id});
   if (!uniqueStrings(event.from?.bodyIds) || event.from.bodyIds.length!==1 || !uniqueStrings(event.to?.bodyIds) || event.to.bodyIds.length!==2) add('family_placement_event_body_refs_invalid',{eventId:event.id});
   const bodyMap=state.equipmentInventory?.bodies||{};
   for (const bodyId of [...(Array.isArray(event.from?.bodyIds)?event.from.bodyIds:[]),...(Array.isArray(event.to?.bodyIds)?event.to.bodyIds:[])]) if (!bodyMap[bodyId] || bodyMap[bodyId].id!==bodyId) add('family_placement_event_body_missing',{eventId:event.id,bodyId});
   const itemMap=state.equipmentInventory?.items||{},bottom=itemMap[event.to?.bottomItemId];
   if (!bottom || bottom.id!==event.to?.bottomItemId || bottom.kind!=='bottom') add('family_placement_event_bottom_missing',{eventId:event.id,bottomItemId:event.to?.bottomItemId??null});
   const snapshot=event.bottomSnapshot;
   if (!snapshot || snapshot.itemId!==event.to?.bottomItemId || snapshot.kind!=='bottom' || snapshot.condition!=='good' || snapshot.hiveId!==event.hiveId || !snapshot.positionLabel) add('family_placement_event_bottom_snapshot_invalid',{eventId:event.id});
   for (const familyId of Array.isArray(event.familyIds)?event.familyIds:[]) if (!familyMap.has(familyId)) add('family_event_family_missing',{eventId:event.id,familyId});
  }
 }
 return errors;
}
function nextId(makeId, used) {
 if (typeof makeId !== 'function') return null;
 const id = String(makeId() || '');
 return id && id.length <= 160 && !used.has(id) ? id : null;
}
function transact(state, operation) {
 if (!isObject(state)) return {ok:false,error:'state_invalid'};
 let draft;
 try { draft=clone(state); } catch (error) { return {ok:false,error:'clone_failed',message:error.message}; }
 draft.families=Array.isArray(draft.families)?draft.families:[];
 draft.queens=Array.isArray(draft.queens)?draft.queens:[];
 draft.queenEvents=Array.isArray(draft.queenEvents)?draft.queenEvents:[];
 draft.familyEvents=Array.isArray(draft.familyEvents)?draft.familyEvents:[];
 let result;
 try { result=operation(draft); } catch (error) { return {ok:false,error:'transaction_failed',message:error.message}; }
 if (!result?.ok) return result;
 const errors=inspect(draft);
 if (errors.length) return {ok:false,error:'state_integrity_failed',details:errors};
 commit(state,draft);
 return result;
}
function familyHasPhysicalPlacement(state,family){
 if(!family)return false;
 if(family.box!=null)return true;
 if(Object.values(state.layouts||{}).some(layout=>Object.values(layout?.boxes||{}).some(box=>box?.family===family.id)))return true;
 const layouts=Array.isArray(state.sectionalLayouts)?state.sectionalLayouts:Object.values(state.sectionalLayouts||{});
 return layouts.some(layout=>Array.isArray(layout?.sections)&&layout.sections.some(section=>section?.familyId===family.id));
}
function applySplit(state, request, makeId, now) {
 return transact(state, draft => {
  const source=draft.families.find(f=>f?.id===request?.sourceFamilyId);
  const children=Array.isArray(request?.resultFamilies)?request.resultFamilies:[];
  if (!source || !isActive(source)) return {ok:false,error:'source_family_missing_or_historical'};
  if (familyHasPhysicalPlacement(draft,source))
   return {ok:false,error:'source_family_has_physical_placement'};
  if (children.length<2 || (['OP-04','OP-14'].includes(request?.operationId)&&children.length!==3) || children.some(row=>!isObject(row)||typeof row.id!=='string'||!row.id.trim()))
   return {ok:false,error:'split_result_families_invalid'};
  const existing=new Set(draft.families.map(f=>f?.id).filter(Boolean));
  const childIds=children.map(row=>row.id);
  if (new Set(childIds).size!==childIds.length || childIds.some(id=>existing.has(id)))
   return {ok:false,error:'split_result_family_id_duplicate'};
  if (children.some(row=>row.hive!==source.hive)) return {ok:false,error:'split_result_hive_mismatch'};
  if (children.some(row=>row.currentQueenId || row.queenId))
   return {ok:false,error:'split_result_queen_must_remain_unresolved'};
  const used=new Set([...existing,...draft.queens.map(q=>q?.id).filter(Boolean),...draft.familyEvents.map(e=>e?.id).filter(Boolean)]);
  if (source.colonyGroupId && request?.colonyGroupId && request.colonyGroupId!==source.colonyGroupId)
   return {ok:false,error:'split_colony_group_change_forbidden'};
  const lineageGroupIds=new Set(draft.families.map(f=>f?.colonyGroupId).filter(Boolean));
  const colonyGroupId=String(source.colonyGroupId||request?.colonyGroupId||nextId(makeId,new Set([...used,...lineageGroupIds]))||'');
  if (!source.colonyGroupId && lineageGroupIds.has(colonyGroupId)) return {ok:false,error:'split_colony_group_already_in_use'};
  if (!colonyGroupId || colonyGroupId.length>160) return {ok:false,error:'colony_group_id_required'};
  const previousMerge=draft.familyEvents.slice().reverse().find(event=>event?.type==='merge'&&event.resultFamilyIds?.includes(source.id));
  const knownCandidateQueenIds=[...new Set([
   ...(source.currentQueenId?[source.currentQueenId]:[]),
   ...(Array.isArray(previousMerge?.candidateQueenIds)?previousMerge.candidateQueenIds:[])
  ])];
  if (Array.isArray(request?.candidateQueenIds) && request.candidateQueenIds.some(id=>!knownCandidateQueenIds.includes(id)))
   return {ok:false,error:'split_candidate_queen_not_in_source_lineage'};
  const candidateQueenIds=knownCandidateQueenIds;
  if (request?.operationId==='OP-04' && !source.currentQueenId && (!previousMerge || !Array.isArray(previousMerge.candidateQueenIds) || previousMerge.candidateQueenIds.length!==3))
   return {ok:false,error:'OP04_SOURCE_QUEEN_NOT_IDENTIFIED'};
  for (const queenId of candidateQueenIds) {
   const queen=draft.queens.find(q=>q?.id===queenId);
   if (!queen) return {ok:false,error:'split_candidate_queen_missing',details:{queenId}};
   queen.originFamilyId=queen.originFamilyId||queen.familyId;
   queen.status='unknown';
   queen.updatedAt=now||new Date().toISOString();
  }
  source.recordStatus='historical';
  source.colonyGroupId=colonyGroupId;
  source.currentQueenId=null;
  source.queenIdentityStatus='unresolved';
  const created=children.map(row=>({...clone(row),recordStatus:'active',colonyGroupId,currentQueenId:null,queenIdentityStatus:'unresolved'}));
  draft.families.push(...created);
  const at=now||new Date().toISOString(),eventId=nextId(makeId,new Set([...used,colonyGroupId,...childIds]));
  if (!eventId) return {ok:false,error:'family_event_id_required'};
  const event={id:eventId,type:'split',sourceFamilyIds:[source.id],resultFamilyIds:childIds,candidateQueenIds,colonyGroupId,hiveId:source.hive,operationId:request?.operationId||null,scenario:request?.scenario||null,techProcessId:request?.techProcessId||null,occurredAt:request?.occurredAt||at,createdAt:at};
  draft.familyEvents.push(event);
  return {ok:true,families:created,event,colonyGroupId};
 });
}
function applyMerge(state, request, makeId, now) {
 return transact(state, draft => {
  const sourceIds=Array.isArray(request?.sourceFamilyIds)?request.sourceFamilyIds:[];
  if (sourceIds.length<2 || !uniqueStrings(sourceIds) || (['OP-11','OP-14'].includes(request?.operationId)&&sourceIds.length!==3)) return {ok:false,error:'merge_source_families_invalid'};
  const sources=sourceIds.map(id=>draft.families.find(f=>f?.id===id));
  if (sources.some(f=>!f||!isActive(f))) return {ok:false,error:'merge_source_family_missing_or_historical'};
  if (new Set(sources.map(f=>f.hive)).size!==1) return {ok:false,error:'merge_source_hive_mismatch'};
  if (sources.some(f=>familyHasPhysicalPlacement(draft,f)))
   return {ok:false,error:'merge_source_family_has_physical_placement'};
  const result=request?.resultFamily;
  if (!isObject(result)||typeof result.id!=='string'||!result.id.trim()||draft.families.some(f=>f?.id===result.id))
   return {ok:false,error:'merge_result_family_invalid'};
  if (result.hive!==sources[0].hive || result.currentQueenId || result.queenId)
   return {ok:false,error:'merge_result_must_have_unknown_queen'};
  const queenIds=sources.map(f=>f.currentQueenId);
  if (queenIds.some(id=>!id) || new Set(queenIds).size!==sources.length)
   return {ok:false,error:'merge_source_queens_not_identified'};
  for (const queenId of queenIds) if (!draft.queens.some(q=>q?.id===queenId))
   return {ok:false,error:'merge_source_queen_missing',details:{queenId}};
  const groups=[...new Set(sources.map(f=>f.colonyGroupId).filter(Boolean))];
  if (groups.length!==1 || sources.some(f=>f.colonyGroupId!==groups[0])) return {ok:false,error:'merge_source_colony_group_mismatch'};
  const colonyGroupId=groups[0];
  if (request?.colonyGroupId && request.colonyGroupId!==colonyGroupId) return {ok:false,error:'merge_colony_group_change_forbidden'};
  const at=now||new Date().toISOString();
  for (const source of sources) {
   const queen=draft.queens.find(q=>q.id===source.currentQueenId);
   queen.originFamilyId=queen.originFamilyId||queen.familyId;
   queen.status='unknown';
   queen.updatedAt=at;
   source.recordStatus='historical';
   source.currentQueenId=null;
   source.queenIdentityStatus='unresolved';
  }
  const created={...clone(result),recordStatus:'active',colonyGroupId,currentQueenId:null,queenIdentityStatus:'unresolved',queen:null};
  draft.families.push(created);
  const used=new Set([...draft.families.map(f=>f?.id).filter(Boolean),...draft.queens.map(q=>q?.id).filter(Boolean),...draft.familyEvents.map(e=>e?.id).filter(Boolean)]);
  const eventId=nextId(makeId,used);
  if (!eventId) return {ok:false,error:'family_event_id_required'};
  const event={id:eventId,type:'merge',sourceFamilyIds:sourceIds,resultFamilyIds:[created.id],candidateQueenIds:queenIds,colonyGroupId,hiveId:sources[0].hive,operationId:request?.operationId||null,scenario:request?.scenario||null,techProcessId:request?.techProcessId||null,occurredAt:request?.occurredAt||at,createdAt:at};
  draft.familyEvents.push(event);
  return {ok:true,family:created,event,colonyGroupId};
 });
}
function confirmQueenIdentity(state, request, makeId, now) {
 return transact(state, draft => {
  const family=draft.families.find(f=>f?.id===request?.familyId);
  if (!family || !isActive(family)) return {ok:false,error:'identity_family_missing_or_historical'};
  if (family.currentQueenId) return {ok:false,error:'identity_family_already_has_queen'};
  const sourceEvent=draft.familyEvents.slice().reverse().find(event=>
   (event?.type==='split'||event?.type==='merge')&&event.resultFamilyIds?.includes(family.id)&&Array.isArray(event.candidateQueenIds)
  );
  if (!sourceEvent) return {ok:false,error:'identity_lineage_event_missing'};
  let queen=null,createdDuringConfirmation=false;
  if (request?.newQueen!=null) {
   if (request.queenId) return {ok:false,error:'identity_request_ambiguous'};
   if (sourceEvent.type!=='split') return {ok:false,error:'new_queen_requires_split_event'};
   const details=request.newQueen;
   if (!isObject(details)) return {ok:false,error:'new_queen_details_invalid'};
   const originType=details.originType||'emergency_reared';
   if (!['emergency_reared','introduced','unknown'].includes(originType)) return {ok:false,error:'new_queen_origin_type_invalid'};
   for (const [key,max] of [['code',80],['source',120],['notes',500]]) {
    if (details[key]!=null&&(typeof details[key]!=='string'||details[key].length>max)) return {ok:false,error:'new_queen_details_invalid',details:{field:key}};
   }
   if (details.year!=null&&(!['string','number'].includes(typeof details.year)||(typeof details.year==='number'&&!Number.isFinite(details.year)))) return {ok:false,error:'new_queen_details_invalid',details:{field:'year'}};
   const defaultOriginFamilyId=originType==='emergency_reared'?(sourceEvent.sourceFamilyIds||[])[0]||null:null;
   const originFamilyId=details.originFamilyId??defaultOriginFamilyId;
   if (originFamilyId!=null&&!draft.families.some(row=>row?.id===originFamilyId)) return {ok:false,error:'new_queen_origin_family_missing'};
   const at=now||new Date().toISOString();
   const used=new Set([...draft.families.map(row=>row?.id).filter(Boolean),...draft.queens.map(row=>row?.id).filter(Boolean),...draft.familyEvents.map(row=>row?.id).filter(Boolean),...draft.queenEvents.map(row=>row?.id).filter(Boolean)]);
   const queenId=nextId(makeId,used);
   if (!queenId) return {ok:false,error:'queen_id_required'};
   queen={id:queenId,familyId:null,originFamilyId,originType,status:'unknown',code:details.code?.trim()||null,year:details.year??null,source:details.source?.trim()||null,notes:details.notes?.trim()||null,createdAt:at,updatedAt:at};
   draft.queens.push(queen);
   sourceEvent.candidateQueenIds=[...new Set([...(sourceEvent.candidateQueenIds||[]),queenId])];
   createdDuringConfirmation=true;
  } else {
   queen=draft.queens.find(q=>q?.id===request?.queenId);
   if (!queen) return {ok:false,error:'identity_queen_missing'};
   if (!Array.isArray(sourceEvent.candidateQueenIds)||!sourceEvent.candidateQueenIds.includes(queen.id))
    return {ok:false,error:'identity_queen_not_candidate'};
   if (['dead','retired','lost','culled'].includes(queen.status)) return {ok:false,error:'identity_queen_inactive'};
  }
  if (draft.families.some(f=>f?.id!==family.id&&isActive(f)&&f.currentQueenId===queen.id))
   return {ok:false,error:'identity_queen_already_assigned'};
  const at=now||new Date().toISOString(),used=new Set([...draft.families.map(f=>f?.id).filter(Boolean),...draft.queens.map(q=>q?.id).filter(Boolean),...draft.familyEvents.map(e=>e?.id).filter(Boolean),...draft.queenEvents.map(e=>e?.id).filter(Boolean)]);
  const eventId=nextId(makeId,used),queenEventId=nextId(makeId,new Set([...used,eventId]));
  if (!eventId||!queenEventId) return {ok:false,error:'family_event_id_required'};
  const previousFamilyId=queen.familyId??null;
  queen.originFamilyId=queen.originFamilyId||previousFamilyId;
  queen.familyId=family.id;
  queen.status='current';
  queen.updatedAt=at;
  family.currentQueenId=queen.id;
  family.queenIdentityStatus='identified';
  family.queen={code:queen.code||null,year:queen.year??null,source:queen.source||null,notes:queen.notes||null,originType:queen.originType||null};
  const event={id:eventId,type:'queen_identity_confirmed',sourceFamilyIds:[],resultFamilyIds:[family.id],candidateQueenIds:[queen.id],familyId:family.id,queenId:queen.id,previousFamilyId,originType:queen.originType||null,createdDuringConfirmation,operationId:request?.operationId||null,scenario:request?.scenario||null,techProcessId:request?.techProcessId||null,hiveId:family.hive,occurredAt:request?.occurredAt||at,createdAt:at};
  draft.familyEvents.push(event);
  draft.queenEvents.push({id:queenEventId,type:'identity_confirmed',queenId:queen.id,familyId:family.id,previousFamilyId,originType:queen.originType||null,createdDuringConfirmation,date:request?.date||null,createdAt:at,notes:'Идентичность матки подтверждена пчеловодом.'});
  return {ok:true,family,queen,event,createdDuringConfirmation};
 });
}
function configureAlternativeWintering(state, request, makeId, now) {
 return transact(state, draft => {
  const familyIds=Array.isArray(request?.familyIds)?request.familyIds:[];
  const itemIds=Array.isArray(request?.diaphragmItemIds)?request.diaphragmItemIds:[];
  const layout=Array.isArray(request?.layout)?request.layout:[];
  if (!uniqueStrings(familyIds)||familyIds.length!==3) return {ok:false,error:'alternative_wintering_family_ids_invalid'};
  if (!uniqueStrings(itemIds)||itemIds.length!==2) return {ok:false,error:'alternative_wintering_diaphragm_ids_invalid'};
  const families=familyIds.map(id=>draft.families.find(f=>f?.id===id));
  if (families.some(f=>!f||!isActive(f))) return {ok:false,error:'alternative_wintering_family_missing_or_historical'};
  if (families.some(f=>!f.currentQueenId||f.queenIdentityStatus==='unresolved')) return {ok:false,error:'alternative_wintering_queen_not_identified'};
  if (families.some(f=>!f.colonyGroupId)||new Set(families.map(f=>f.colonyGroupId)).size!==1) return {ok:false,error:'alternative_wintering_colony_group_mismatch'};
  if (new Set(families.map(f=>f.hive)).size!==1) return {ok:false,error:'alternative_wintering_hive_mismatch'};
  const hiveId=families[0].hive;
  if (layout.length!==3||POSITIONS.some(position=>layout.filter(row=>row?.position===position).length!==1))
   return {ok:false,error:'alternative_wintering_layout_invalid'};
  if (layout.some(row=>!familyIds.includes(row?.familyId)||![1,2].includes(row?.bodyCount))||new Set(layout.map(row=>row?.familyId)).size!==3)
   return {ok:false,error:'alternative_wintering_body_distribution_invalid'};
  const counts=layout.map(row=>row.bodyCount).sort((a,b)=>a-b);
  if (counts[0]!==1||counts[1]!==1||counts[2]!==2) return {ok:false,error:'alternative_wintering_body_distribution_invalid'};
  const items=itemIds.map(id=>draft.equipmentInventory?.items?.[id]);
  if (items.some(item=>!item||item.kind!=='meshDiaphragm'||item.condition!=='good'||item.location?.type!=='hive'||item.location?.hiveId!==hiveId||!item.location?.positionLabel))
   return {ok:false,error:'alternative_wintering_physical_diaphragm_invalid'};
  if (new Set(items.map(item=>item.location.positionLabel)).size!==2)
   return {ok:false,error:'alternative_wintering_diaphragm_position_duplicate'};
  const at=now||new Date().toISOString(),used=new Set([...draft.familyEvents.map(e=>e?.id).filter(Boolean)]);
  const eventId=nextId(makeId,used);
  if (!eventId) return {ok:false,error:'family_event_id_required'};
  const diaphragmSnapshots=items.map((item,index)=>({itemId:itemIds[index],kind:item.kind,condition:item.condition,hiveId,positionLabel:item.location.positionLabel}));
  const event={id:eventId,type:'alternative_wintering_configured',familyIds,diaphragmItemIds:itemIds,diaphragmSnapshots,layout:clone(layout),hiveId,operationId:'OP-12',techProcessId:request?.techProcessId||null,occurredAt:request?.occurredAt||at,createdAt:at};
  draft.familyEvents.push(event);
  return {ok:true,event};
 });
}
function recordPlacementChanged(state, request, makeId, now) {
 return transact(state, draft => {
  const familyIds=Array.isArray(request?.familyIds)?request.familyIds:[];
  if (!uniqueStrings(familyIds)||familyIds.length!==3) return {ok:false,error:'placement_family_group_invalid'};
  const families=familyIds.map(id=>draft.families.find(f=>f?.id===id));
  if (families.some(f=>!f||!isActive(f))) return {ok:false,error:'placement_family_missing_or_historical'};
  if (families.some(f=>!f.currentQueenId||f.queenIdentityStatus==='unresolved')) return {ok:false,error:'placement_family_queen_not_identified'};
  if (new Set(families.map(f=>f.hive)).size!==1) return {ok:false,error:'placement_hive_mismatch'};
  if (families.some(f=>!f.colonyGroupId)||new Set(families.map(f=>f.colonyGroupId)).size!==1) return {ok:false,error:'placement_colony_group_mismatch'};
  const family=families.find(row=>row.id===request?.familyId);
  if (!family||!POSITIONS.includes(request?.from?.position)) return {ok:false,error:'placement_source_invalid'};
  if (request?.to?.position!=='separate_bottom') return {ok:false,error:'placement_target_invalid'};
  const winterEvent=draft.familyEvents.slice().reverse().find(event=>event?.type==='alternative_wintering_configured'&&event.hiveId===family.hive&&event.familyIds?.includes(family.id));
  const sourceRow=winterEvent?.layout?.find(row=>row?.familyId===family.id);
  if (!sourceRow||sourceRow.bodyCount!==1||sourceRow.position!==request.from.position)
   return {ok:false,error:'placement_source_not_single_body_family'};
  if (winterEvent.familyIds.length!==familyIds.length||!familyIds.every(id=>winterEvent.familyIds.includes(id)))
   return {ok:false,error:'placement_family_group_mismatch'};
  if (draft.familyEvents.some(event=>event?.type==='placement_changed'&&event.operationId==='OP-13'&&event.techProcessId===(request?.techProcessId||null)&&event.familyId===family.id))
   return {ok:false,error:'placement_already_recorded'};
  const fromBodyIds=Array.isArray(request?.from?.bodyIds)?request.from.bodyIds:[];
  const toBodyIds=Array.isArray(request?.to?.bodyIds)?request.to.bodyIds:[];
  if (!uniqueStrings(fromBodyIds)||fromBodyIds.length!==1||!uniqueStrings(toBodyIds)||toBodyIds.length!==2)
   return {ok:false,error:'placement_body_references_invalid'};
  const bodyMap=draft.equipmentInventory?.bodies||{};
  if ([...fromBodyIds,...toBodyIds].some(id=>!bodyMap[id]||bodyMap[id].id!==id))
   return {ok:false,error:'placement_body_reference_missing'};
  const bottom=draft.equipmentInventory?.items?.[request?.to?.bottomItemId];
  if (!bottom||bottom.kind!=='bottom'||bottom.condition!=='good'||bottom.location?.type!=='hive'||bottom.location?.hiveId!==family.hive||!bottom.location?.positionLabel)
   return {ok:false,error:'placement_bottom_not_installed'};
  const at=now||new Date().toISOString(),eventId=nextId(makeId,new Set(draft.familyEvents.map(e=>e?.id).filter(Boolean)));
  if (!eventId) return {ok:false,error:'family_event_id_required'};
  const event={id:eventId,type:'placement_changed',familyId:family.id,familyIds,hiveId:family.hive,operationId:'OP-13',scenario:'ALT_WINTERING_SPRING',techProcessId:request?.techProcessId||null,from:{position:request.from.position,bodyIds:fromBodyIds},to:{position:'separate_bottom',bottomItemId:bottom.id,bodyIds:toBodyIds},bottomSnapshot:{itemId:bottom.id,kind:bottom.kind,condition:bottom.condition,hiveId:family.hive,positionLabel:bottom.location.positionLabel},occurredAt:request?.occurredAt||at,createdAt:at};
  draft.familyEvents.push(event);
  return {ok:true,event};
 });
}
function recordEarlyHoneyHarvest(state, request, makeId, now) {
 return transact(state, draft => {
  const familyIds=Array.isArray(request?.familyIds)?request.familyIds:[];
  if (!uniqueStrings(familyIds)||familyIds.length!==3) return {ok:false,error:'early_honey_family_ids_invalid'};
  if (![3,4].includes(request?.nestBodiesAfterHarvest)) return {ok:false,error:'early_honey_nest_bodies_invalid'};
  const confirmations=['honeyBodiesRemoved','largeExcludersRemoved','harvestConfirmed','diaphragmsRemoved','familiesOnSeparateBottoms'];
  if (confirmations.some(key=>request?.[key]!==true)) return {ok:false,error:'early_honey_confirmations_required'};
  if (!isObject(request?.physicalSetup)) return {ok:false,error:'early_honey_physical_setup_required'};
  const families=familyIds.map(id=>draft.families.find(f=>f?.id===id));
  if (families.some(f=>!f||!isActive(f))) return {ok:false,error:'early_honey_family_missing_or_historical'};
  if (families.some(f=>!f.currentQueenId||f.queenIdentityStatus==='unresolved')) return {ok:false,error:'early_honey_queen_not_identified'};
  if (families.some(f=>!f.colonyGroupId)||new Set(families.map(f=>f.colonyGroupId)).size!==1) return {ok:false,error:'early_honey_colony_group_mismatch'};
  if (new Set(families.map(f=>f.hive)).size!==1) return {ok:false,error:'early_honey_hive_mismatch'};
  const at=now||new Date().toISOString(),eventId=nextId(makeId,new Set(draft.familyEvents.map(e=>e?.id).filter(Boolean)));
  if (!eventId) return {ok:false,error:'family_event_id_required'};
  const event={id:eventId,type:'early_honey_harvest_completed',familyIds,nestBodiesAfterHarvest:request.nestBodiesAfterHarvest,physicalSetup:clone(request.physicalSetup),...Object.fromEntries(confirmations.map(key=>[key,true])),hiveId:families[0].hive,operationId:'OP-14',scenario:'EARLY_HONEY',techProcessId:request?.techProcessId||null,occurredAt:request?.occurredAt||at,createdAt:at};
  draft.familyEvents.push(event);
  return {ok:true,event};
 });
}
function validateOperationEvidence(state, record, operationId) {
 const errors=[],add=(code,details={})=>errors.push({code,details});
 const events=Array.isArray(state?.familyEvents)?state.familyEvents:[];
 const techProcessId=record?.id,hiveId=record?.hiveId;
 const matches=type=>events.filter(event=>event?.type===type&&event.operationId===operationId&&event.techProcessId===techProcessId&&(!hiveId||event.hiveId===hiveId));
 const sections=Array.isArray(record?.state?.sections)?record.state.sections:[];
 const sectionFamilyIds=sections.map(section=>section?.familyId).filter(Boolean);
 const sameSet=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every(id=>b.includes(id));
 if (operationId==='OP-04') {
  const splits=matches('split').filter(event=>event.sourceFamilyIds?.length===1&&event.resultFamilyIds?.length===3);
  if (splits.length!==1) add('OP04_FAMILY_SPLIT_EVENT_REQUIRED',{techProcessId});
  else {
   const event=splits[0],source=state.families.find(f=>f?.id===event.sourceFamilyIds[0]);
   if (!['OP-11','OP-14'].some(id=>record.state.operations?.some(operation=>operation?.operationId===id&&operation.status==='DONE')) && !sameSet(event.resultFamilyIds,sectionFamilyIds)) add('OP04_SECTION_FAMILY_LINK_MISMATCH',{techProcessId});
   if (!source||familyStatus(source)!=='historical') add('OP04_SOURCE_FAMILY_NOT_HISTORICAL',{sourceFamilyId:event.sourceFamilyIds[0]});
   if (event.candidateQueenIds?.length<1) add('OP04_ORIGINAL_QUEEN_CANDIDATE_MISSING',{techProcessId});
   
  }
 }
 if (operationId==='OP-11') {
  const merges=matches('merge').filter(event=>event.sourceFamilyIds?.length===3&&event.resultFamilyIds?.length===1);
  if (merges.length!==1) add('OP11_FAMILY_MERGE_EVENT_REQUIRED',{techProcessId});
  else {
   const event=merges[0],result=state.families.find(f=>f?.id===event.resultFamilyIds[0]);
   if (event.candidateQueenIds?.length!==3) add('OP11_QUEEN_CANDIDATES_REQUIRED',{techProcessId});
   if (!result||result.currentQueenId||result.queenIdentityStatus!=='unresolved')
    add('OP11_RESULT_QUEEN_MUST_REMAIN_UNKNOWN',{resultFamilyId:event.resultFamilyIds[0]});
   if (event.sourceFamilyIds.some(id=>isActive(state.families.find(f=>f?.id===id))))
    add('OP11_SOURCE_FAMILIES_MUST_BE_HISTORICAL',{techProcessId});
  }
 }
 if (operationId==='OP-12') {
  const rows=matches('alternative_wintering_configured');
  if (rows.length!==1) add('OP12_ALTERNATIVE_WINTERING_EVENT_REQUIRED',{techProcessId});
  else {
   const event=rows[0],layout=Array.isArray(event.layout)?event.layout:[];
   const validLayout=layout.length===3&&POSITIONS.every(position=>layout.filter(row=>row?.position===position).length===1)&&new Set(layout.map(row=>row?.familyId)).size===3&&layout.every(row=>event.familyIds?.includes(row?.familyId)&&[1,2].includes(row?.bodyCount))&&layout.filter(row=>row?.bodyCount===2).length===1&&layout.filter(row=>row?.bodyCount===1).length===2;
   const laterEarlyHoneySplit=record.state.operations?.some(operation=>operation?.operationId==='OP-14'&&operation.status==='DONE');
   if (!laterEarlyHoneySplit&&!sameSet(event.familyIds,sectionFamilyIds)) add('OP12_SECTION_FAMILY_LINK_MISMATCH',{techProcessId});
   if (event.diaphragmItemIds?.length!==2) add('OP12_TWO_PHYSICAL_DIAPHRAGMS_REQUIRED',{techProcessId});
   const stateDiaphragmIds=(record.state.diaphragms||[]).map(item=>item?.itemId).filter(Boolean);
   if (record.state.phase==='ALT_WINTERING'&&!sameSet(event.diaphragmItemIds,stateDiaphragmIds)) add('OP12_DIAPHRAGM_REFERENCE_MISMATCH',{techProcessId});
   if (!validLayout) add('OP12_BODY_LAYOUT_REQUIRED',{techProcessId});
   if (record.state.phase==='ALT_WINTERING'&&validLayout&&layout.some(row=>!record.state.sections?.some(section=>section?.familyId===row.familyId&&section?.winteringPosition===row.position&&section?.bodyIds?.length===row.bodyCount)))
    add('OP12_STATE_LAYOUT_MISMATCH',{techProcessId});
  }
 }
 if (operationId==='OP-13') {
  if (!record.state.operations?.some(operation=>operation?.operationId==='OP-12'&&operation.status==='DONE')) add('OP13_ALTERNATIVE_WINTERING_PRECONDITION_REQUIRED',{techProcessId});
  const moves=matches('placement_changed').filter(event=>event.scenario==='ALT_WINTERING_SPRING');
  const winterEvents=events.filter(event=>event?.type==='alternative_wintering_configured'&&event.operationId==='OP-12'&&event.techProcessId===techProcessId&&(!hiveId||event.hiveId===hiveId));
  const winterLayout=winterEvents.length===1&&Array.isArray(winterEvents[0].layout)?winterEvents[0].layout:[];
  const singleBodyRows=winterLayout.filter(row=>row?.bodyCount===1),twoBodyRows=winterLayout.filter(row=>row?.bodyCount===2);
  if (moves.length!==2) add('OP13_TWO_SINGLE_BODY_FAMILY_MOVES_REQUIRED',{techProcessId});
  else {
   const movedIds=moves.map(event=>event.familyId),expectedMovedIds=singleBodyRows.map(row=>row.familyId);
   if (new Set(movedIds).size!==2||!sameSet(movedIds,expectedMovedIds)||twoBodyRows.length!==1)
    add('OP13_SINGLE_BODY_FAMILIES_MUST_MOVE',{techProcessId});
   if (new Set(moves.map(event=>event.to?.bottomItemId)).size!==2) add('OP13_SEPARATE_BOTTOMS_REQUIRED',{techProcessId});
   const familyGroupIds=moves[0].familyIds;
   if (moves.some(event=>!sameSet(event.familyIds,familyGroupIds))||!sameSet(familyGroupIds,winterEvents[0]?.familyIds||[]))
    add('OP13_FAMILY_GROUP_MISMATCH',{techProcessId});
   const laterEarlyHoney=record.state.operations?.some(operation=>operation?.operationId==='OP-14'&&operation.status==='DONE');
   if (!laterEarlyHoney) {
    if (!sameSet(familyGroupIds,sectionFamilyIds)) add('OP13_SECTION_FAMILY_LINK_MISMATCH',{techProcessId});
    for (const familyId of familyGroupIds) {
     const family=state.families.find(row=>row?.id===familyId);
     if (!family||!isActive(family)||!family.currentQueenId||family.queenIdentityStatus==='unresolved') add('OP13_FAMILIES_MUST_REMAIN_INDEPENDENT',{familyId});
    }
    const strongRow=twoBodyRows[0],strong=sections.find(section=>section?.familyId===strongRow?.familyId);
    if (!strong||strong.winteringPosition!==strongRow.position||strong.bodyIds?.length!==2)
     add('OP13_TWO_BODY_FAMILY_REMAINS',{techProcessId});
    for (const move of moves) {
     const sourceRow=winterLayout.find(row=>row?.familyId===move.familyId),section=sections.find(row=>row?.familyId===move.familyId);
     if (!sourceRow||move.from?.position!==sourceRow.position||move.from?.bodyIds?.length!==1||move.to?.bodyIds?.length!==2)
      add('OP13_MOVE_SOURCE_OR_BODY_COUNT_MISMATCH',{familyId:move.familyId});
     if (!section||section.winteringPosition!=='separate_bottom'||section.bodyIds?.length!==2)
      add('OP13_SEPARATE_BOTTOM_STATE_MISMATCH',{familyId:move.familyId});
    }
   }
  }
 }
 if (operationId==='OP-14') {
  if (!record.state.operations?.some(operation=>operation?.operationId==='OP-12'&&operation.status==='DONE')) add('OP14_ALTERNATIVE_WINTERING_PRECONDITION_REQUIRED',{techProcessId});
  if (!record.state.operations?.some(operation=>operation?.operationId==='OP-13'&&operation.status==='DONE')) add('OP14_SPRING_RELOCATION_PRECONDITION_REQUIRED',{techProcessId});
  const placements=events.filter(event=>event?.type==='placement_changed'&&event.operationId==='OP-13'&&event.techProcessId===techProcessId&&(!hiveId||event.hiveId===hiveId)&&event.scenario==='ALT_WINTERING_SPRING');
  const harvests=matches('early_honey_harvest_completed');
  const merges=matches('merge').filter(event=>event.scenario==='EARLY_HONEY'&&event.sourceFamilyIds?.length===3&&event.resultFamilyIds?.length===1);
  const splits=matches('split').filter(event=>event.scenario==='EARLY_HONEY'&&event.sourceFamilyIds?.length===1&&event.resultFamilyIds?.length===3);
  if (placements.length!==2) add('OP14_SPRING_PLACEMENT_EVENTS_REQUIRED',{techProcessId});
  if (harvests.length!==1) add('OP14_EARLY_HONEY_HARVEST_CONFIRMATION_REQUIRED',{techProcessId});
  if (merges.length!==1) add('OP14_TEMPORARY_MERGE_EVENT_REQUIRED',{techProcessId});
  if (splits.length!==1) add('OP14_REPEAT_SPLIT_EVENT_REQUIRED',{techProcessId});
  if (placements.length===2&&harvests.length===1&&merges.length===1&&splits.length===1) {
   const harvest=harvests[0],merge=merges[0],split=splits[0];
   if (!isObject(record.state.earlyHoneySetup) || JSON.stringify(record.state.earlyHoneySetup)!==JSON.stringify(harvest.physicalSetup)) add('OP14_PHYSICAL_SETUP_SNAPSHOT_MISMATCH',{techProcessId});
   if (!sameSet(harvest.familyIds,merge.sourceFamilyIds)) add('OP14_HARVEST_MERGE_FAMILY_MISMATCH',{techProcessId});
   const winterEvent=events.find(event=>event?.type==='alternative_wintering_configured'&&event.operationId==='OP-12'&&event.techProcessId===techProcessId&&(!hiveId||event.hiveId===hiveId));
   const expectedSingleBodyIds=(winterEvent?.layout||[]).filter(row=>row?.bodyCount===1).map(row=>row.familyId);
   const movedSingleBodyIds=placements.map(event=>event.familyId);
   if (placements.some(event=>!sameSet(event.familyIds,harvest.familyIds)) || new Set(movedSingleBodyIds).size!==2 || !sameSet(movedSingleBodyIds,expectedSingleBodyIds) || placements.some(event=>!expectedSingleBodyIds.includes(event.familyId)||event.from?.position!==winterEvent?.layout?.find(row=>row.familyId===event.familyId)?.position) || new Set(placements.map(event=>event.to?.bottomItemId)).size!==2) add('OP14_SPRING_PLACEMENT_FAMILY_MISMATCH',{techProcessId});
   if (placements.some(event=>Date.parse(event.occurredAt)>Date.parse(harvest.occurredAt))) add('OP14_PLACEMENT_AFTER_HARVEST',{techProcessId});
   if (!sameSet(split.sourceFamilyIds,merge.resultFamilyIds)) add('OP14_REPEAT_SPLIT_SOURCE_MISMATCH',{techProcessId});
   if (!sameSet(split.resultFamilyIds,sectionFamilyIds)) add('OP14_SECTION_FAMILY_LINK_MISMATCH',{techProcessId});
   if (split.resultFamilyIds.some(id=>!isActive(state.families.find(f=>f?.id===id)))) add('OP14_RESULT_FAMILIES_NOT_ACTIVE',{techProcessId});
   if (Date.parse(harvest.occurredAt)>Date.parse(merge.occurredAt)||Date.parse(merge.occurredAt)>Date.parse(split.occurredAt))
    add('OP14_EVENT_ORDER_INVALID',{techProcessId});
   const merged=state.families.find(f=>f?.id===merge.resultFamilyIds[0]);
   if (!merged||merged.currentQueenId||merged.queenIdentityStatus!=='unresolved')
    add('OP14_TEMPORARY_MERGE_QUEEN_MUST_REMAIN_UNKNOWN',{resultFamilyId:merge.resultFamilyIds[0]});
  }
 }
 return errors;
}
window.PasekaFamilyLineage=Object.freeze({
 EVENT_TYPES,inspect,isActive,familyStatus,applySplit,applyMerge,confirmQueenIdentity,
 configureAlternativeWintering,recordPlacementChanged,recordEarlyHoneyHarvest,validateOperationEvidence
});
})();