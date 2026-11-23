import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};new Function('window',readFileSync(new URL('../js/sectional-op02-course.js',import.meta.url),'utf8'))(w);
const api=w.PasekaSectionalOP02Course,now='2026-11-23T14:00:00Z';
const base=()=>({hives:[{id:'h1',profileId:'sectional-multiqueen-v1'}],families:[{id:'f1',hive:'h1'}],records:[],tasks:[]});
const completed=(date,id)=>({id,operationId:'OP-02',op02Scope:'one_day',date,hive:'h1',family:'f1',proteinActuallyFedConfirmed:true,proteinFeedingDaily:true,syrupRatio:'2:1',gramsPerColonyPerDay:150});
test('starting manual spring course never auto-completes, preserves source state',()=>{
 const s=base(),old=structuredClone(s);const r=api.begin(s,{hiveId:'h1',familyId:'f1',startedDate:'2026-11-20',userConfirmed:true},()=> 'course1',now);
 assert.equal(r.ok,true);assert.equal(r.course.status,'ACTIVE');assert.deepEqual(s,old);
});
test('manual end refuses any unconfirmed calendar day, no automatic 12–15 day completion',()=>{
 const s=base();s.sectionalFeedingCourses=api.begin(s,{hiveId:'h1',familyId:'f1',startedDate:'2026-11-20',userConfirmed:true},()=> 'course1',now).stagedCourses;
 s.records=[completed('2026-11-20','r1'),completed('2026-11-22','r3')];
 const r=api.complete(s,{courseId:'course1',completedDate:'2026-11-22',userConfirmed:true,confirmationRef:'note'},now);
 assert.equal(r.error,'op02_course_unconfirmed_daily_records');
 assert.deepEqual(r.details.missingDates,['2026-11-21']);
 assert.equal(s.sectionalFeedingCourses[0].status,'ACTIVE');
});
test('verified daily records permit explicit completion with immutable daily record links',()=>{
 const s=base();s.sectionalFeedingCourses=api.begin(s,{hiveId:'h1',familyId:'f1',startedDate:'2026-11-20',userConfirmed:true},()=> 'course1',now).stagedCourses;
 s.records=[completed('2026-11-20','r1'),completed('2026-11-21','r2'),completed('2026-11-22','r3')];
 const r=api.complete(s,{courseId:'course1',completedDate:'2026-11-22',userConfirmed:true,confirmationRef:'beekeeper-note'},now);
 assert.equal(r.ok,true);assert.equal(r.course.status,'COMPLETED');assert.equal(r.course.dailyEvidence.length,3);
 assert.equal(s.sectionalFeedingCourses[0].status,'ACTIVE');
 const proposed={...s,sectionalFeedingCourses:r.stagedCourses};
 assert.deepEqual(api.inspect(proposed),[]);
 proposed.records[0].proteinActuallyFedConfirmed=false;
 assert.ok(api.inspect(proposed).length);
});
test('cannot use Farrar or future calendar date',()=>{
 const s=base();s.hives[0].profileId='farrar';
 assert.equal(api.begin(s,{hiveId:'h1',familyId:'f1',startedDate:'2026-11-20',userConfirmed:true},()=> 'x',now).ok,false);
 assert.equal(api.begin(base(),{hiveId:'h1',familyId:'f1',startedDate:'2026-11-24',userConfirmed:true},()=> 'x',now).ok,false);
});
test('duplicate active course is forbidden',()=>{
 const s=base();s.sectionalFeedingCourses=api.begin(s,{hiveId:'h1',familyId:'f1',startedDate:'2026-11-20',userConfirmed:true},()=> 'course1',now).stagedCourses;
 assert.equal(api.begin(s,{hiveId:'h1',familyId:'f1',startedDate:'2026-11-21',userConfirmed:true},()=> 'course2',now).ok,false);
});
