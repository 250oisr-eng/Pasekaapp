(()=>{'use strict';
const validDate=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const [y,m,d]=value.split('-').map(Number),x=new Date(Date.UTC(y,m-1,d));return x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d};
const clone=value=>typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));
const id=()=>window.crypto?.randomUUID?.()||'reconcile-'+Date.now()+'-'+Math.random().toString(36).slice(2);
function targetFrames(state,target,labels){
 const all=labels.listLabelledFrames(state);
 if(target?.type==='hive'){if(!state?.hives?.some(h=>h?.id===target.hiveId))return {error:'hive_not_found'};return {all,expected:all.filter(x=>x.locationType==='hive'&&x.hiveId===target.hiveId&&(!target.boxKey||target.boxKey==='*'||String(x.box)===String(target.boxKey)))}}
 if(target?.type==='storage'){if(!state?.equipmentInventory?.bodies?.[target.bodyId])return {error:'body_not_found'};return {all,expected:all.filter(x=>x.locationType==='storage'&&x.bodyId===target.bodyId)}}
 return {error:'invalid_target'}
}
function preview(state,target,rawCodes,labels){
 const scope=targetFrames(state,target,labels);if(scope.error)return {ok:false,error:scope.error};
 const tokens=Array.isArray(rawCodes)?rawCodes.map(x=>String(x??'').trim()).filter(Boolean):String(rawCodes??'').split(/[\s,;]+/u).map(x=>x.trim()).filter(Boolean);
 const expected=scope.expected,expectedByCode=new Map(expected.map(x=>[labels.normalizeCode(x.labelCode,'frame'),x])),allByCode=new Map(scope.all.map(x=>[labels.normalizeCode(x.labelCode,'frame'),x]));
 const observed=[],counts=new Map(),issues=[];
 for(const token of tokens){const code=labels.normalizeCode(token,'frame');if(!code){issues.push({id:id(),type:'invalid_code',code:null,raw:token,status:'open',resolution:null});continue}
  observed.push(code);counts.set(code,(counts.get(code)||0)+1);if(counts.get(code)>1)issues.push({id:id(),type:'duplicate_observation',code,raw:token,status:'open',resolution:null});
  const found=allByCode.get(code);if(found?.locationType==='retired')issues.push({id:id(),type:'retired_found',code,expectedLocation:found,raw:token,status:'open',resolution:null});else if(!expectedByCode.has(code)&&found)issues.push({id:id(),type:'wrong_location',code,actualLocation:found,raw:token,status:'open',resolution:null});else if(!found)issues.push({id:id(),type:'unexpected_code',code,raw:token,status:'open',resolution:null});
 }
 for(const item of expected){const code=labels.normalizeCode(item.labelCode,'frame');if(!counts.has(code))issues.push({id:id(),type:'missing_in_field',code,expectedLocation:item,status:'open',resolution:null})}
 return {ok:true,expectedCount:expected.length,observedCount:observed.length,observedCodes:observed,issues}
}
function record(state,request,labels,at){
 if(!state||typeof state!=='object')return {ok:false,error:'invalid_state'};if(!validDate(request?.date))return {ok:false,error:'invalid_date'};
 const result=preview(state,request.target,request.observedCodes,labels);if(!result.ok)return result;
 const draft=clone(state),inv=draft.equipmentInventory||(draft.equipmentInventory={});if(inv.reconciliations!=null&&!Array.isArray(inv.reconciliations))return {ok:false,error:'invalid_reconciliation_registry'};
 inv.reconciliations=inv.reconciliations||[];inv.events=Array.isArray(inv.events)?inv.events:[];
 const inspection={id:id(),date:request.date,target:clone(request.target),notes:String(request.notes||'').trim().slice(0,1000),createdAt:at||new Date().toISOString(),expectedCount:result.expectedCount,observedCount:result.observedCount,observedCodes:result.observedCodes.slice(),issues:result.issues.map(x=>({...x})),history:[]};
 inspection.history.push({type:'inspection_recorded',at:inspection.createdAt,issueCount:inspection.issues.length});inv.reconciliations.push(inspection);if(inv.reconciliations.length>300)inv.reconciliations=inv.reconciliations.slice(-300);
 inv.events.push({id:id(),type:'physical_frame_reconciliation_recorded',at:inspection.createdAt,inspectionId:inspection.id,target:clone(inspection.target),issueCount:inspection.issues.length});if(inv.events.length>1000)inv.events=inv.events.slice(-1000);
 for(const key of Object.keys(state))if(!(key in draft))delete state[key];Object.assign(state,draft);return {ok:true,inspection}
}
function resolve(state,inspectionId,issueId,note,at){
 const inv=state?.equipmentInventory,inspection=inv?.reconciliations?.find(x=>x.id===inspectionId);if(!inspection)return {ok:false,error:'inspection_not_found'};
 const issue=inspection.issues?.find(x=>x.id===issueId);if(!issue)return {ok:false,error:'issue_not_found'};const text=String(note||'').trim();if(!text||text.length>500)return {ok:false,error:'resolution_note_required'};if(issue.status==='resolved')return {ok:false,error:'already_resolved'};
 const time=at||new Date().toISOString();issue.status='resolved';issue.resolution={note:text,at:time};inspection.history=Array.isArray(inspection.history)?inspection.history:[];inspection.history.push({type:'discrepancy_resolved',issueId,issueType:issue.type,code:issue.code||null,note:text,at:time});
 inv.events=Array.isArray(inv.events)?inv.events:[];inv.events.push({id:id(),type:'physical_frame_discrepancy_resolved',at:time,inspectionId,issueId,issueType:issue.type,code:issue.code||null,note:text});if(inv.events.length>1000)inv.events=inv.events.slice(-1000);return {ok:true,inspection,issue}
}
function list(state){return (Array.isArray(state?.equipmentInventory?.reconciliations)?state.equipmentInventory.reconciliations:[]).slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))}
window.PasekaReconciliation={preview,record,resolve,list};
})();