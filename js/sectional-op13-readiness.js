(()=>{'use strict';
// DOCX P73–P77: OP13 read-only spring separation; not an operation commit.
const PROFILE='sectional-multiqueen-v1',order=['lower','middle','upper'];
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const rows=x=>Array.isArray(x)?x:[];
const id=x=>typeof x==='string'&&x.trim().length>0;
const reject=(error,details={})=>({ok:false,error,details});
function inspect(state,request){
 if(!obj(state)||!obj(request)||!id(request.hiveId)||!id(request.expectedRevisionId))
  return reject('op13_hive_and_revision_required');
 if(state.meta?.revisionId!==request.expectedRevisionId)return reject('op13_stale_revision');
 const hive=rows(state.hives).filter(h=>h?.id===request.hiveId);
 if(hive.length!==1||(hive[0].profileId!==PROFILE&&hive[0].profile?.id!==PROFILE))
  return reject('op13_sectional_profile_required');
 const layouts=rows(state.sectionalLayouts).filter(l=>l?.hiveId===request.hiveId);
 if(layouts.length!==1)return reject('op13_unique_source_layout_required');
 const layout=layouts[0],validator=window.PasekaSectionalPhysicalLayout;
 if(typeof validator?.validate!=='function')return reject('op13_physical_validator_missing');
 const checked=validator.validate(layout,state);
 if(!checked.valid)return reject('op13_invalid_winter_layout',{codes:checked.errors.map(error=>error.code)});
 if(layout.mode!=='ALTERNATIVE_WINTERING_COLUMN'||layout.profileId!==PROFILE||
    layout.honeyStack!=null||rows(layout.stacks).length!==1)
  return reject('op13_source_must_be_alternative_wintering');
 const sectionByPosition=new Map(rows(layout.sections).map(section=>[section?.position,section]));
 if(sectionByPosition.size!==3||order.some(position=>!sectionByPosition.has(position)))
  return reject('op13_three_winter_positions_required');
 const sourceCounts=order.map(position=>rows(sectionByPosition.get(position)?.broodBodyIds).length);
 if(JSON.stringify(sourceCounts)!==JSON.stringify([2,1,1]))
  return reject('op13_two_body_family_must_be_lower',{actual:sourceCounts,expected:[2,1,1]});
 const familyIds=order.map(position=>sectionByPosition.get(position).familyId);
 if(new Set(familyIds).size!==3)return reject('op13_three_distinct_families_required');
 const families=familyIds.map(fid=>rows(state.families).find(f=>f?.id===fid&&f.hive===request.hiveId&&f.recordStatus!=='historical'));
 if(families.some(f=>!f))return reject('op13_active_family_missing');
 const history=rows(state.familyEvents).filter(e=>e?.operationId==='OP-12'&&
  e.type==='alternative_wintering_configured'&&e.hiveId===request.hiveId);
 // Multi-year apiaries may have several OP12 cycles. Do not silently use the oldest.
 const event=id(request.techProcessId)?history.filter(e=>e.techProcessId===request.techProcessId):history;
 if(event.length!==1)return reject('op13_unique_confirmed_op12_evidence_required');
 const original=event[0],byPosition=new Map(rows(original.layout).map(row=>[row?.position,row]));
 if(byPosition.size!==3||order.some((position,i)=>byPosition.get(position)?.bodyCount!==sourceCounts[i]||
    byPosition.get(position)?.familyId!==familyIds[i]))
  return reject('op13_winter_evidence_layout_mismatch');
 const diaphragms=rows(layout.meshDiaphragms).map(row=>row?.itemId);
 if(diaphragms.length!==2||new Set(diaphragms).size!==2||
    diaphragms.some(key=>!original.diaphragmItemIds?.includes(key)))
  return reject('op13_diaphragm_provenance_mismatch');
 const alreadyMoved=rows(state.familyEvents).some(e=>e?.type==='placement_changed'&&
  e.operationId==='OP-13'&&e.hiveId===request.hiveId&&
  e.techProcessId===(original.techProcessId||null));
 if(alreadyMoved)return reject('op13_spring_move_already_recorded');
 return {ok:true,sourceRevisionId:request.expectedRevisionId,
  source:{strongFamilyId:familyIds[0],strongBodyIds:[...sectionByPosition.get('lower').broodBodyIds],
   smallFamilies:order.slice(1).map(position=>({
    familyId:sectionByPosition.get(position).familyId,
    position,bodyId:sectionByPosition.get(position).broodBodyIds[0]
   })),diaphragmItemIds:diaphragms},techProcessId:original.techProcessId||null};
}
function preview(state,request){
 const source=inspect(state,request);
 if(!source.ok)return source;
 if(request.firstFlightDate!=null){
  const value=request.firstFlightDate;
  const parsed=typeof value==='string'&&/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)
   ? Date.parse(value+'T00:00:00.000Z') : NaN;
  if(!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==value)
   return reject('op13_first_flight_date_invalid');
 }
 if(!obj(request.bottomAssignments))return reject('op13_two_bottom_assignments_required');
 const expected=source.source.smallFamilies.map(f=>f.familyId),provided=Object.keys(request.bottomAssignments);
 if(provided.length!==2||expected.some(fid=>!id(request.bottomAssignments[fid]))||
    provided.some(fid=>!expected.includes(fid)))
  return reject('op13_bottom_assignments_incomplete');
 const bottoms=expected.map(fid=>request.bottomAssignments[fid]);
 if(new Set(bottoms).size!==2)return reject('op13_bottom_reused');
 const items=state.equipmentInventory?.items;
 if(!obj(items))return reject('op13_inventory_missing');
 for(const itemId of bottoms){
  const item=items[itemId];
  if(!obj(item)||item.id!==itemId||item.kind!=='bottom'||item.condition!=='good'||item.location?.type!=='storage')
   return reject('op13_bottom_not_available',{itemId});
 }
 // OP13 moves each existing ONE-body family to its own bottom. A second body
 // belongs to a later explicitly confirmed expansion, never invented here.
 const plans=source.source.smallFamilies.map(row=>({
  familyId:row.familyId,fromPosition:row.position,
  retainedBodyId:row.bodyId,toBottomItemId:request.bottomAssignments[row.familyId],
  bodyIdsAfterMove:[row.bodyId],queenIdentityNotChanged:true
 }));
 return {
  ok:true,readOnly:true,readyForPersistence:false,completionRecorded:false,
  operationId:'OP-13',hiveId:request.hiveId,techProcessId:source.techProcessId,sourceRevisionId:source.sourceRevisionId,
  strongFamilyId:source.source.strongFamilyId,strongFamilyBodyIds:[...source.source.strongBodyIds],
  moves:plans,diaphragmItemIdsToRemove:[...source.source.diaphragmItemIds],
  firstFlightDate:typeof request.firstFlightDate==='string'?request.firstFlightDate:null,
  seasonalTiming:'approximately_one_and_half_months_after_first_flight_guideline_only',
  strengthObservedByBeekeeper:request.strengthObserved===true,
  additionalBroodBodiesNotAutomaticallyInstalled:true,
  confirmationsStillRequired:[
   'beekeepers_observation_of_strength_and_flight',
   'both_separate_bottoms_installed',
   'two_one_body_families_physically_moved',
   'mesh_diaphragms_physically_removed',
   'technical_openings_and_ventilation_verified',
   'equipment_moves_and_family_histories_recorded_atomically',
   'independent_archive_and_recovery_before_write'
  ]
 };
}
window.PasekaSectionalOP13Readiness=Object.freeze({inspect,preview});
})();
