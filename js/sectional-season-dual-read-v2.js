(function(){
'use strict';
// Read-only dual-format view. Never creates/writes/migrates IndexedDB state.
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function inspectMixedState(state,deps){
 const errors=[];
 if(!isObject(state))return [{code:'season_state_invalid'}];
 if(!deps?.ledger||typeof deps.ledger.inspect!=='function'||typeof deps.ledger.previewV1!=='function')return [{code:'season_ledger_dependency_missing'}];
 const legacy=state.sectionalTechProcesses,modern=state.sectionalSeasonCycles,archive=state.sectionalTechProcessesArchive;
 if(legacy!=null&&!Array.isArray(legacy))errors.push({code:'season_legacy_shape_invalid'});
 if(modern!=null&&!Array.isArray(modern))errors.push({code:'season_v2_shape_invalid'});
 if(archive!=null&&!Array.isArray(archive))errors.push({code:'season_v1_archive_shape_invalid'});
 if(errors.length)return errors;
 const v1=legacy||[],v2=modern||[],archived=archive||[];
 const archivedPreview=deps.ledger.previewV1(archived);if(!archivedPreview.ok)errors.push(...archivedPreview.errors);
 for(const row of archived){if(v1.some(x=>x.id===row.id))errors.push({code:'season_legacy_active_archive_duplicate',hiveId:row.hiveId});
  const exact=v2.find(x=>x?.legacy?.sourceId===row.id&&x.hiveId===row.hiveId);
  if(!exact||!same(exact.legacy?.original,row))errors.push({code:'season_v1_archive_provenance_mismatch',hiveId:row.hiveId});
 }
 const converted=deps.ledger.previewV1(v1);
 if(!converted.ok)errors.push(...converted.errors);
 errors.push(...deps.ledger.inspect(v2));
 if(typeof deps.ledger.inspectTerminalEvidence==='function')errors.push(...deps.ledger.inspectTerminalEvidence(v2));
 const ids=new Set();
 for(const r of v2){if(ids.has(r?.id))errors.push({code:'season_v2_duplicate_cycle_id'});ids.add(r?.id)}
 const byHive=new Map();
 for(const r of v2){const arr=byHive.get(r?.hiveId)||[];arr.push(r);byHive.set(r?.hiveId,arr)}
 for(const old of v1){
  const existing=byHive.get(old.hiveId)||[];
  if(!existing.length)continue;
  const preview=converted.records?.find(x=>x.legacy.sourceId===old.id);
  const imported=existing.find(x=>x?.legacy?.sourceId===old.id&&x.cycleNumber===1);
  if(!preview||!imported||!same(imported.legacy?.original,preview.legacy.original))errors.push({code:'season_legacy_provenance_mismatch',hiveId:old.hiveId});
  if(existing.some(x=>x.id!==imported?.id&&x.status==='ACTIVE')&&imported?.status!=='CLOSED')errors.push({code:'season_legacy_active_overlap',hiveId:old.hiveId});
 }
 return errors;
}
function readView(state,deps){
 const errors=inspectMixedState(state,deps);if(errors.length)return {ok:false,errors};
 const legacy=state.sectionalTechProcesses||[],modern=state.sectionalSeasonCycles||[];
 const modernHives=new Set(modern.map(x=>x.hiveId));
 const preview=deps.ledger.previewV1(legacy.filter(x=>!modernHives.has(x.hiveId)));
 if(!preview.ok)return preview;
 const records=structuredClone([...modern,...preview.records]);
 records.sort((a,b)=>a.hiveId.localeCompare(b.hiveId)||a.cycleNumber-b.cycleNumber);
 return {ok:true,readOnly:true,records};
}
window.PasekaSectionalSeasonDualReadV2=Object.freeze({inspectMixedState,readView});
})();