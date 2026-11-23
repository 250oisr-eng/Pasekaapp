(function(){
'use strict';
// Additional fail-closed provenance checks for already staged physical changes.
// Does not perform a merge, wintering, transfer or any physical actuation.
const rows=v=>Array.isArray(v)?v:[],obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),seteq=(a,b)=>a.length===b.length&&new Set(a).size===a.length&&new Set(b).size===b.length&&a.every(x=>b.includes(x));
const fields=(s,h)=>rows(s?.sectionalLayouts).filter(l=>l?.hiveId===h);
const occupants=l=>rows(l?.sections).map(x=>x?.familyId);
const brood=l=>rows(l?.sections).flatMap(x=>rows(x?.broodBodyIds));
function validate(before,after,request){
 const errors=[],add=code=>errors.push({code});
 if(!obj(before)||!obj(after)||!obj(request)||request.userConfirmed!==true)return [{code:'provenance_confirmation_or_state_missing'}];
 const op=request.operationId,h=request.hiveId,ol=fields(before,h),nl=fields(after,h);
 if(!['OP-10','OP-11','OP-12','OP-13','OP-14'].includes(op))return [{code:'provenance_operation_unsupported'}];
 if(ol.length!==1||nl.length!==1)return [{code:'provenance_layout_ambiguous'}];
 const a=ol[0],b=nl[0],oldIds=occupants(a),newIds=occupants(b);
 const oldFam=rows(before.families),newFam=rows(after.families),oldEvent=rows(before.familyEvents),newEvent=rows(after.familyEvents);
 if(!same(oldEvent,newEvent.slice(0,oldEvent.length)))add('provenance_lineage_history_rewritten');
 if(!same(rows(before.queenEvents),rows(after.queenEvents).slice(0,rows(before.queenEvents).length)))add('provenance_queen_history_rewritten');
 const newEvents=newEvent.slice(oldEvent.length);
 const transitions=newEvents.filter(e=>e?.operationId===op&&e.hiveId===h);
 const previousBodies=new Set([...brood(a),...rows(a.honeyStack?.bodyIds)]);
 const nextBodies=new Set([...brood(b),...rows(b.honeyStack?.bodyIds)]);
 const removed=[...previousBodies].filter(x=>!nextBodies.has(x));
 const added=[...nextBodies].filter(x=>!previousBodies.has(x));
 const events=rows(after.equipmentInventory?.events);
 const previousEvents=rows(before.equipmentInventory?.events);
 if(!same(previousEvents,events.slice(0,previousEvents.length)))add('provenance_equipment_history_rewritten');
 for(const id of removed){
  const old=before.equipmentInventory?.bodies?.[id],next=after.equipmentInventory?.bodies?.[id];
  if(!obj(old)||!obj(next)||!same(rows(old.frames).map(x=>x?.frameId),rows(next.frames).map(x=>x?.frameId)))add('provenance_removed_body_frames_missing');
  if(!obj(next)||typeof next.storageLocation!=='string'||!next.storageLocation.trim())add('provenance_removed_body_storage_missing');
  if(!rows(next?.events).some(e=>e?.operationId===op)||!events.slice(previousEvents.length).some(e=>e?.bodyId===id&&e.operationId===op))add('provenance_removed_body_event_missing');
 }
 for(const id of added){
  const next=after.equipmentInventory?.bodies?.[id];
  if(!obj(next)||next.storageLocation) add('provenance_installed_body_not_located');
  if(!rows(next?.events).some(e=>e?.operationId===op)||!events.slice(previousEvents.length).some(e=>e?.bodyId===id&&e.operationId===op))add('provenance_installed_body_event_missing');
 }
 if(op==='OP-10'){
  if(!same(oldIds,newIds)||newEvents.length||removed.length!==rows(a.honeyStack?.bodyIds).length||added.length)add('provenance_op10_families_or_bodies_changed');
  for(const id of oldIds)if(!same(oldFam.find(f=>f.id===id),newFam.find(f=>f.id===id)))add('provenance_op10_family_changed');
 }
 if(op==='OP-11'||op==='OP-14'){
  if(oldIds.length!==3||newIds.length!==1||oldIds.includes(newIds[0]))add('provenance_merge_layout_invalid');
  const merged=transitions.filter(e=>e.type==='merge'&&seteq(rows(e.sourceFamilyIds),oldIds)&&seteq(rows(e.resultFamilyIds),newIds));
  if(merged.length!==1)add('provenance_merge_event_missing');
  for(const id of oldIds){
   const prev=oldFam.find(f=>f.id===id),now=newFam.find(f=>f.id===id);
   if(!prev||!now||now.recordStatus!=='historical'||now.currentQueenId!=null||now.queenIdentityStatus!=='unresolved')add('provenance_merge_source_not_historical');
   const oldQueen=rows(before.queens).find(q=>q.id===prev?.currentQueenId);
   const newQueen=rows(after.queens).find(q=>q.id===oldQueen?.id);
   if(!oldQueen||!newQueen||newQueen.status!=='unknown')add('provenance_merge_queen_automatically_assigned');
  }
  const result=newFam.find(f=>f.id===newIds[0]);
  if(!result||result.recordStatus!=='active'||result.currentQueenId!=null||result.queenIdentityStatus!=='unresolved')add('provenance_merge_result_queen_must_be_unknown');
 }
 if(op==='OP-12'){
  if(!seteq(oldIds,newIds)||transitions.filter(e=>e.type==='alternative_wintering_configured').length!==1)add('provenance_op12_family_wintering_event_missing');
  for(const id of oldIds){const old=oldFam.find(f=>f.id===id),current=newFam.find(f=>f.id===id);if(!same(old,current))add('provenance_op12_family_mutated')}
 }
 if(op==='OP-13'){
  if(!seteq(oldIds,newIds)||transitions.filter(e=>e.type==='placement_changed').length!==2||new Set(transitions.filter(e=>e.type==='placement_changed').map(e=>e.familyId)).size!==2)add('provenance_op13_two_family_placements_required');
  for(const id of oldIds){const old=oldFam.find(f=>f.id===id),current=newFam.find(f=>f.id===id);if(!same(old,current))add('provenance_op13_family_mutated')}
 }
 return errors;
}
window.PasekaSectionalSeasonProvenanceV2=Object.freeze({validate});
})();