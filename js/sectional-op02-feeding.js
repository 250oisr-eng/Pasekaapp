/* OP-02 source-backed DAILY PLAN ONLY. No automatic feeding, no course completion. */
(function(root){
'use strict';
const PROFILE='sectional-multiqueen-v1',OP='OP-02';
function validDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const [y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));
 return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
}
function buildDailyPlan(state,request,makeId,now){
 const fail=(error)=>({ok:false,error});
 if(!state||typeof state!=='object'||!request||typeof request!=='object'||typeof makeId!=='function')return fail('invalid_request');
 if(request.userConfirmed!==true)return fail('user_confirmation_required');
 const hive=(Array.isArray(state.hives)?state.hives:[]).find(x=>x?.id===request.hiveId);
 if(!hive||hive.profileId!==PROFILE)return fail('sectional_profile_required');
 const family=(Array.isArray(state.families)?state.families:[]).find(x=>x?.id===request.familyId&&x?.hive===hive.id&&x?.recordStatus!=='historical');
 if(!family)return fail('active_family_required');
 if(!validDate(request.date))return fail('valid_calendar_date_required');
 const grams=request.gramsPerColonyPerDay;
 if(typeof grams!=='number'||!Number.isFinite(grams)||grams<100||grams>200)return fail('daily_liquid_feeding_norm_outside_confirmed_range');
 if(request.syrupRatio!=='2:1')return fail('confirmed_syrup_ratio_required');
 if(request.proteinFeedingDaily!==true)return fail('daily_protein_plan_required');
 if(request.notes!=null&&(typeof request.notes!=='string'||request.notes.length>1000))return fail('invalid_notes');
 const tasks=Array.isArray(state.tasks)?state.tasks:[];
 if(tasks.some(x=>x?.operationId===OP&&x?.hive===hive.id&&x?.familyId===family.id&&x?.date===request.date&&x?.status!=='dismissed'))return fail('daily_plan_already_recorded');
 const id=String(makeId()||'');
 if(!id||id.length>160||tasks.some(x=>x?.id===id)||Array.isArray(state.records)&&state.records.some(x=>x?.id===id))return fail('duplicate_or_missing_task_id');
 const at=typeof now==='string'&&Number.isFinite(Date.parse(now))?now:new Date().toISOString();
 const task={id,hive:hive.id,familyId:family.id,type:'Подкормка',operationId:OP,op02Scope:'daily_plan',
  gramsPerColonyPerDay:grams,syrupRatio:'2:1',proteinFeedingDaily:true,
  plannedFeedingType:'сироп',plannedFeedingConcentration:'2:1',
  plannedFeedingAmount:grams+' г',date:request.date,source:'manual',status:'pending',
  note:String(request.notes||'').trim(),createdAt:at};
 return {ok:true,task};
}
root.PasekaSectionalOP02Feeding=Object.freeze({PROFILE,OP,buildDailyPlan});
})(typeof window!=='undefined'?window:globalThis);
