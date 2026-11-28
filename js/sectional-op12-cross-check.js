(()=>{'use strict';
// DOCX 64-70. Cross-record OP12 audit only; does not rearrange families, queens,
// boxes, diaphragms or change the lineage/event table.
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const arr=x=>Array.isArray(x)?x:[];
const valid=x=>typeof x==='string'&&x.trim().length>0;
const reject=(error,details={})=>({ok:false,error,details});
function inspect(state,request){
 if(!obj(state)||!obj(request)||!valid(request.hiveId)||!valid(request.expectedRevisionId))
  return reject('op12_hive_and_revision_required');
 if(state.meta?.revisionId!==request.expectedRevisionId)return reject('op12_stale_revision');
 const profile='sectional-multiqueen-v1';
 const hives=arr(state.hives).filter(h=>h?.id===request.hiveId);
 if(hives.length!==1||(hives[0].profileId!==profile&&hives[0].profile?.id!==profile))
  return reject('op12_sectional_hive_required');
 const physical=arr(state.sectionalLayouts).filter(l=>l?.hiveId===request.hiveId);
 if(physical.length!==1)return reject('op12_single_physical_layout_required');
 const layout=physical[0],validator=window.PasekaSectionalPhysicalLayout;
 if(typeof validator?.validate!=='function')return reject('op12_physical_validator_required');
 const checked=validator.validate(layout,state);
 if(!checked.valid)return reject('op12_invalid_physical_layout',{codes:checked.errors.map(x=>x.code)});
 if(layout.mode!=='ALTERNATIVE_WINTERING_COLUMN')return reject('op12_winter_mode_required');
 const source=['lower','middle','upper'].map(position=>arr(layout.sections).find(s=>s?.position===position));
 if(source.some(x=>!x)||new Set(source.map(x=>x.familyId)).size!==3 ||
  source.some((x,i)=>arr(x.broodBodyIds).length!==[2,1,1][i]))
  return reject('op12_physical_order_invalid');
 const history=arr(state.familyEvents).filter(e=>e?.type==='alternative_wintering_configured'&&
   e.operationId==='OP-12'&&e.hiveId===request.hiveId);
 const selected=valid(request.techProcessId)?history.filter(e=>e.techProcessId===request.techProcessId):history;
 if(selected.length!==1)return reject('op12_unique_winter_event_required',{events:selected.length});
 const event=selected[0],rows=arr(event.layout);
 if(rows.length!==3||!Array.isArray(event.familyIds)||event.familyIds.length!==3)
  return reject('op12_history_layout_incomplete');
 const byPosition=new Map(rows.map(row=>[row?.position,row]));
 if(byPosition.size!==3||source.some((section,i)=>{
  const row=byPosition.get(['lower','middle','upper'][i]);
  return !row||row.familyId!==section.familyId||row.bodyCount!==[2,1,1][i]||
    !event.familyIds.includes(section.familyId);
 }))return reject('op12_layout_and_history_diverge');
 const d=arr(layout.meshDiaphragms).map(x=>x?.itemId),e=arr(event.diaphragmItemIds);
 if(d.length!==2||e.length!==2||new Set(d).size!==2||new Set(e).size!==2||
  !d.every(id=>e.includes(id)))
  return reject('op12_diaphragm_history_diverges');
 if(source.some(section=>{
  const family=arr(state.families).find(f=>f.id===section.familyId);
  return !family||family.hive!==request.hiveId||family.recordStatus==='historical';
 }))
  return reject('op12_family_hive_or_history_invalid');
 return {ok:true,readOnly:true,readyForPersistence:false,completionRecorded:false,
  hiveId:request.hiveId,sourceRevisionId:request.expectedRevisionId,
  techProcessId:event.techProcessId??null,
  physicalFamilyOrder:source.map((s,i)=>({
    position:['lower','middle','upper'][i],familyId:s.familyId,
    existingBroodBodyIds:[...s.broodBodyIds]
  })),
  installedMeshDiaphragmIds:[...d],
  strongestFamilyId:source[0].familyId,strongestSelectionConfirmed:false,
  physicalWorkConfirmed:false,storageWrites:0};
}
window.PasekaSectionalOP12CrossCheck=Object.freeze({inspect});
})();