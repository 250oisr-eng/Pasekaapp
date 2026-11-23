(function(){
'use strict';
const PROFILE='sectional-multiqueen-v1',OP='OP-02';
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x),rows=x=>Array.isArray(x)?x:[],validDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const fail=(error,details)=>({ok:false,error,...(details?{details}:{})});
const day=x=>Date.parse(x+'T00:00:00Z');
const span=(from,to)=>{const result=[];for(let d=day(from);d<=day(to)&&result.length<366;d+=86400000)result.push(new Date(d).toISOString().slice(0,10));return result;};
const recordsFor=(state,c,date)=>rows(state.records).filter(r=>r?.operationId===OP&&r?.op02Scope==='one_day'&&r?.hive===c.hiveId&&r?.family===c.familyId&&r.date===date&&r.proteinActuallyFedConfirmed===true&&r.syrupRatio==='2:1'&&r.proteinFeedingDaily===true&&typeof r.gramsPerColonyPerDay==='number'&&r.gramsPerColonyPerDay>=100&&r.gramsPerColonyPerDay<=200);
function inspect(state){
 if(!obj(state))return [{code:'op02_course_state_invalid'}];
 const courses=state.sectionalFeedingCourses;
 if(courses==null)return [];
 if(!Array.isArray(courses))return [{code:'op02_course_history_invalid'}];
 const errors=[],ids=new Set(),active=new Set(),hives=new Map(rows(state.hives).map(h=>[h?.id,h]));
 for(const [i,c] of courses.entries()){
  if(!obj(c)||!c.id||ids.has(c.id)){errors.push({code:'op02_course_duplicate_or_invalid',index:i});continue}ids.add(c.id);
  if(c.operationId!==OP||hives.get(c.hiveId)?.profileId!==PROFILE||!rows(state.families).some(f=>f.id===c.familyId&&f.hive===c.hiveId)||!validDate(c.startedDate)||!['ACTIVE','COMPLETED'].includes(c.status))errors.push({code:'op02_course_provenance_invalid',index:i});
  if(c.status==='ACTIVE'){
   const key=c.hiveId+'|'+c.familyId;if(active.has(key))errors.push({code:'op02_course_multiple_active',index:i});active.add(key);
   if(c.completedDate!=null)errors.push({code:'op02_course_active_has_end',index:i});
  }else{
   if(!validDate(c.completedDate)||day(c.completedDate)<day(c.startedDate)||day(c.completedDate)-day(c.startedDate)>365*86400000||c.userConfirmedCompletion!==true||typeof c.completionConfirmationRef!=='string'||!c.completionConfirmationRef)errors.push({code:'op02_course_completion_invalid',index:i});
   else{
    const dates=span(c.startedDate,c.completedDate),expected=dates.map(date=>({date,recordId:recordsFor(state,c,date)[0]?.id||null}));
    if(expected.some(x=>!x.recordId)||JSON.stringify(expected)!==JSON.stringify(c.dailyEvidence))errors.push({code:'op02_course_daily_evidence_mismatch',index:i});
   }
  }
 }
 return errors;
}
function begin(state,request,makeId,now){
 if(!obj(state)||!obj(request)||request.userConfirmed!==true||typeof makeId!=='function'||!validDate(request.startedDate)||typeof now!=='string'||!Number.isFinite(Date.parse(now)))return fail('op02_course_begin_confirmation_required');
 const hive=rows(state.hives).find(h=>h.id===request.hiveId),family=rows(state.families).find(f=>f.id===request.familyId&&f.hive===request.hiveId&&f.recordStatus!=='historical');
 if(hive?.profileId!==PROFILE||!family)return fail('op02_course_active_colony_required');
 if(day(request.startedDate)>day(now.slice(0,10)))return fail('op02_course_future_start');
 if(inspect(state).length)return fail('op02_course_existing_history_invalid');
 if(rows(state.sectionalFeedingCourses).some(c=>c.hiveId===request.hiveId&&c.familyId===request.familyId&&c.status==='ACTIVE'))return fail('op02_course_already_active');
 const id=String(makeId()||'');if(!id||rows(state.sectionalFeedingCourses).some(c=>c.id===id))return fail('op02_course_id_invalid');
 const course={id,operationId:OP,hiveId:request.hiveId,familyId:request.familyId,status:'ACTIVE',startedDate:request.startedDate,createdAt:now,notes:typeof request.notes==='string'?request.notes.trim().slice(0,500):''};
 const proposed={...state,sectionalFeedingCourses:[...rows(state.sectionalFeedingCourses),course]};
 return inspect(proposed).length?fail('op02_course_begin_invalid'):{ok:true,stagedCourses:proposed.sectionalFeedingCourses,course};
}
function complete(state,request,now){
 if(!obj(state)||!obj(request)||request.userConfirmed!==true||typeof request.confirmationRef!=='string'||!request.confirmationRef||!validDate(request.completedDate)||typeof now!=='string'||!Number.isFinite(Date.parse(now)))return fail('op02_course_completion_confirmation_required');
 if(inspect(state).length)return fail('op02_course_existing_history_invalid');
 const course=rows(state.sectionalFeedingCourses).find(x=>x.id===request.courseId);
 if(!course||course.status!=='ACTIVE'||day(request.completedDate)<day(course.startedDate)||day(request.completedDate)>day(now.slice(0,10)))return fail('op02_course_date_or_status_invalid');
 const dates=span(course.startedDate,request.completedDate);
 if(!dates.length||dates.length>365)return fail('op02_course_span_invalid');
 const evidence=dates.map(date=>({date,recordId:recordsFor(state,course,date)[0]?.id||null}));
 const missing=evidence.filter(x=>!x.recordId).map(x=>x.date);
 if(missing.length)return fail('op02_course_unconfirmed_daily_records',{missingDates:missing});
 const result=structuredClone(rows(state.sectionalFeedingCourses)),target=result.find(c=>c.id===course.id);
 Object.assign(target,{status:'COMPLETED',completedDate:request.completedDate,completedAt:now,userConfirmedCompletion:true,completionConfirmationRef:request.confirmationRef,dailyEvidence:evidence});
 const proposed={...state,sectionalFeedingCourses:result};
 return inspect(proposed).length?fail('op02_course_completion_integrity_failed'):{ok:true,stagedCourses:result,course:target};
}
window.PasekaSectionalOP02Course=Object.freeze({PROFILE,OP,inspect,begin,complete});
})();