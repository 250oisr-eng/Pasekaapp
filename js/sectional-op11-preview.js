(()=>{'use strict';
// DOCX paragraphs 52–60: OP-11 only a read-only preflight, never a transition.
// No families, queens, physical layouts, journal or IndexedDB are modified.
const PROFILE='sectional-multiqueen-v1';
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const arr=x=>Array.isArray(x)?x:[];
const str=x=>typeof x==='string'&&x.trim().length>0;
const reject=(error,details={})=>({ok:false,error,details});
function inspect(state,request){
 if(!obj(state)||!obj(request)||!str(request.hiveId)||!str(request.expectedRevisionId))
  return reject('op11_hive_and_revision_required');
 if(state.meta?.revisionId!==request.expectedRevisionId)return reject('op11_stale_revision');
 const hives=arr(state.hives).filter(h=>h?.id===request.hiveId);
 if(hives.length!==1||(hives[0].profileId!==PROFILE&&hives[0].profile?.id!==PROFILE))
  return reject('op11_sectional_profile_required');
 const layouts=arr(state.sectionalLayouts).filter(l=>l?.hiveId===request.hiveId);
 if(layouts.length!==1)return reject('op11_unique_layout_required');
 const layout=layouts[0],validator=window.PasekaSectionalPhysicalLayout;
 if(!validator?.validate)return reject('op11_physical_validator_unavailable');
 const checked=validator.validate(layout,state);
 if(!checked.valid)return reject('op11_invalid_source_layout',{codes:checked.errors.map(e=>e.code)});
 if(layout.profileId!==PROFILE||layout.mode!=='SIDE_BY_SIDE'||layout.broodRows===1||layout.honeyStack!=null)
  return reject('op11_three_two_body_sections_without_honey_required');
 const sections=arr(layout.sections),stacks=arr(layout.stacks);
 if(sections.length!==3||stacks.length!==3||
    sections.some(s=>arr(s.broodBodyIds).length!==2||!str(s.upperBroodBodyId)||
      !s.broodBodyIds.includes(s.upperBroodBodyId)))
  return reject('op11_three_upper_bodies_required');
 const kept=sections.map(s=>s.upperBroodBodyId),all=sections.flatMap(s=>s.broodBodyIds);
 if(new Set(kept).size!==3||new Set(all).size!==6)return reject('op11_duplicate_body');
 const families=arr(state.families);
 if(new Set(sections.map(s=>s.familyId)).size!==3||
    sections.some(s=>!families.some(f=>f?.id===s.familyId&&f.hive===request.hiveId&&f.recordStatus!=='historical')))
  return reject('op11_three_active_families_required');
 const items=state.equipmentInventory?.items;
 if(!obj(items))return reject('op11_item_inventory_required');
 const openings=sections.flatMap(s=>arr(s.openings).filter(o=>o?.bodyId===s.upperBroodBodyId))
  .map(o=>({bodyId:o.bodyId,openingId:o.id}));
 if(openings.length===0||new Set(openings.map(o=>o.openingId)).size!==openings.length)
  return reject('op11_unique_upper_openings_required');
 // Never return mutable aliases into an IndexedDB-backed live state, even in inspect().
 let detached;
 try{detached=structuredClone({layout,items,kept,all,openings});}
 catch{return reject('op11_snapshot_clone_failed');}
 return {ok:true,...detached,sections:detached.layout.sections,stacks:detached.layout.stacks};
}
function preview(state,request){
 const source=inspect(state,request);
 if(!source.ok)return source;
 const sequence=[request.lowerBodyId,request.middleBodyId,request.upperBodyId];
 if(sequence.some(id=>!str(id))||new Set(sequence).size!==3||
    sequence.some(id=>!source.kept.includes(id)))
  return reject('op11_three_original_upper_bodies_in_selected_order_required');
 const bottomIds=source.stacks.map(stack=>stack.bottomItemId);
 const selected=[
  [request.bottomItemId,'bottom'],[request.coverItemId,'cover'],
  [request.topRiserItemId,'topRiser'],[request.feederItemId,'feeder']
 ];
 const allowed=(id,kind,storageOnly=false)=>{
  const item=source.items[id],loc=item?.location;
  return str(id)&&obj(item)&&item.id===id&&item.kind===kind&&item.condition==='good'&&
   (loc?.type==='storage'||(!storageOnly&&loc?.type==='hive'&&loc.hiveId===request.hiveId));
 };
 if(!bottomIds.includes(request.bottomItemId)||selected.some(([id,kind])=>!allowed(id,kind)))
  return reject('op11_registered_bottom_cover_riser_and_ceiling_feeder_required');
 if(!obj(request.plugAssignments))return reject('op11_plug_assignments_required');
 const openingIds=source.openings.map(o=>o.openingId);
 const supplied=Object.keys(request.plugAssignments);
 if(supplied.length!==openingIds.length||supplied.some(id=>!openingIds.includes(id))||
    openingIds.some(id=>!allowed(request.plugAssignments[id],'plasticPlug',true)))
  return reject('op11_one_stored_plastic_plug_per_upper_opening_required');
 const ids=[...selected.map(([id])=>id),...openingIds.map(id=>request.plugAssignments[id])];
 if(new Set(ids).size!==ids.length)return reject('op11_accessory_reused');
 if(request.ventilationOption!=null&&
    !['upper_only','lower_round_plus_ceiling'].includes(request.ventilationOption))
  return reject('op11_ventilation_choice_invalid');
 const keptSet=new Set(source.kept);
 const technicalExcluderIds=arr(source.layout.technicalConnections)
  .flatMap(connection=>arr(connection.openings).map(o=>o.itemId)).filter(str);
 const originalFamilyIds=source.sections.map(s=>s.familyId);
 return {
  ok:true,readOnly:true,readyForPersistence:false,operationId:'OP-11',
  sourceRevisionId:request.expectedRevisionId,hiveId:request.hiveId,
  retainedBodyIds:[...sequence],removedBodyIds:source.all.filter(id=>!keptSet.has(id)),
  retainedBottomItemId:request.bottomItemId,
  removedBottomItemIds:bottomIds.filter(id=>id!==request.bottomItemId),
  retainedCoverItemId:request.coverItemId,retainedTopRiserItemId:request.topRiserItemId,
  ceilingFeederItemId:request.feederItemId,
  closureAssignments:source.openings.map(o=>({
   ...o,plasticPlugItemId:request.plugAssignments[o.openingId]
  })),
  removeTechnicalExcluderItemIds:[...new Set(technicalExcluderIds)],
  originalFamilyIds,
  survivingQueenId:null,queenIdentityStatus:'unresolved',
  ventilationOption:request.ventilationOption??null,
  confirmationsStillRequired:[
   'brood_nearly_absent', 'all_bees_moved_from_removed_lower_bodies',
   'three_families_physically_combined', 'all_side_openings_physically_plugged',
   'one_selected_ventilation_configuration_physically_confirmed',
   'all_removed_bodies_bottoms_and_accessories_accounted_for',
   'independent_archive_and_recovery_before_write'
  ],
  completionRecorded:false
 };
}
window.PasekaSectionalOP11Preview=Object.freeze({inspect,preview});
})();
