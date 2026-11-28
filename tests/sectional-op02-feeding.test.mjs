import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const js=await readFile(new URL('../js/sectional-op02-feeding.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
const root={};new Function('window',js)(root);
const api=root.PasekaSectionalOP02Feeding;
const base=()=>({hives:[{id:'h1',profileId:'sectional-multiqueen-v1'},{id:'farrar',profileId:'farrar'}],
 families:[{id:'f1',hive:'h1',recordStatus:'active'},{id:'f2',hive:'h1',recordStatus:'historical'},{id:'farrar-family',hive:'farrar',recordStatus:'active'}],tasks:[],records:[]});
const request=(overrides={})=>({hiveId:'h1',familyId:'f1',date:'2026-04-15',gramsPerColonyPerDay:150,syrupRatio:'2:1',proteinFeedingDaily:true,userConfirmed:true,...overrides});
let n=0;const id=()=> 'op02-test-'+(++n);
test('OP02 builds one-day plan using confirmed daily grams, not portionGrams',()=>{
 const state=base(),before=structuredClone(state);
 const result=api.buildDailyPlan(state,request(),id,'2026-04-01T10:00:00Z');
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.deepEqual(state,before);
 assert.equal(result.task.gramsPerColonyPerDay,150);
 assert.equal(result.task.syrupRatio,'2:1');
 assert.equal(result.task.proteinFeedingDaily,true);
 assert.equal(result.task.operationId,'OP-02');
 assert.equal(result.task.op02Scope,'daily_plan');
 assert.equal(result.task.type,'Подкормка');
 assert.equal(result.task.status,'pending');
 assert.ok(!('portionGrams' in result.task));
 assert.ok(!('completedAt' in result.task));
 assert.ok(!('completedRecordId' in result.task));
});
test('OP02 rejects unconfirmed, different profile, absent family and values outside 100–200',()=>{
 const state=base();
 for(const overrides of [{userConfirmed:false},{hiveId:'farrar',familyId:'farrar-family'},{familyId:'f2'},
  {gramsPerColonyPerDay:99},{gramsPerColonyPerDay:201},{gramsPerColonyPerDay:NaN},{gramsPerColonyPerDay:'150'},
  {syrupRatio:'1:1'},{proteinFeedingDaily:false},{date:'2026-02-30'}]){
  const before=structuredClone(state);
  const result=api.buildDailyPlan(state,request(overrides),id);
  assert.equal(result.ok,false,JSON.stringify(overrides));
  assert.deepEqual(state,before);
 }
});
test('duplicate OP02 per family per day is blocked but another date permitted',()=>{
 const state=base();
 const first=api.buildDailyPlan(state,request(),id);
 assert.equal(first.ok,true);state.tasks.push(first.task);
 assert.equal(api.buildDailyPlan(state,request(),id).error,'daily_plan_already_recorded');
 assert.equal(api.buildDailyPlan(state,request({date:'2026-04-16'}),id).ok,true);
 state.families.push({id:'f3',hive:'h1',recordStatus:'active'});
 assert.equal(api.buildDailyPlan(state,request({familyId:'f3'}),id).ok,true);
});
test('existing generic feeding and Farrar entries remain unmodified',()=>{
 const state=base();state.tasks.push({id:'legacy-task',hive:'farrar',type:'Подкормка',plannedFeedingAmount:'1 л',status:'pending'});
 const snapshot=structuredClone(state);
 assert.equal(api.buildDailyPlan(state,request(),id).ok,true);
 assert.deepEqual(state,snapshot);
 assert.ok(!('gramsPerColonyPerDay' in state.tasks[0]));
});
test('OP02 model is isolated from the app shell and background worker',()=>{
 assert.doesNotMatch(html,/sectional-op02-feeding\.js|PasekaSectionalOP02Feeding/);
 assert.doesNotMatch(sw,/sectional-op02-feeding\.js/);
});

test('OP02 completion rechecks family/profile and never accepts stale or altered daily plans',()=>{
 const state=base(),result=api.buildDailyPlan(state,request(),id);
 assert.equal(result.ok,true);
 state.tasks.push(result.task);
 assert.equal(api.validateDailyCompletion(state,state.tasks[0]).ok,true);
 state.hives[0].profileId='farrar';
 assert.equal(api.validateDailyCompletion(state,state.tasks[0]).error,'sectional_profile_required');
 state.hives[0].profileId='sectional-multiqueen-v1';
 state.families[0].recordStatus='historical';
 assert.equal(api.validateDailyCompletion(state,state.tasks[0]).error,'active_family_required');
 state.families[0].recordStatus='active';
 state.families[0].hive='farrar';
 assert.equal(api.validateDailyCompletion(state,state.tasks[0]).error,'active_family_required');
 state.families[0].hive='h1';
 state.tasks[0].gramsPerColonyPerDay=999;
 assert.equal(api.validateDailyCompletion(state,state.tasks[0]).error,'daily_plan_parameters_invalid');
 state.tasks[0].gramsPerColonyPerDay=150;
 state.tasks[0].status='done';
 assert.equal(api.validateDailyCompletion(state,state.tasks[0]).error,'invalid_or_completed_daily_task');
});

test('OP02 rejects ambiguous physical hive and family IDs without changing the plan',()=>{
 for(const collection of ['hives','families']){
  const state=base();
  const plan=api.buildDailyPlan(state,request(),id);
  assert.equal(plan.ok,true);
  state.tasks.push(plan.task);
  const duplicate={...state[collection][0]};
  if(collection==='families')duplicate.hive='farrar';
  state[collection].push(duplicate);
  const before=structuredClone(state);
  assert.equal(api.buildDailyPlan(state,request({date:'2026-04-16'}),id).ok,false);
  assert.equal(api.validateDailyCompletion(state,plan.task).ok,false);
  assert.deepEqual(state,before);
 }
});

test('OP02 preflight rejects stale tasks and duplicate factual records without mutation',()=>{
 const cases=[
  [state=>state.tasks.push({...state.tasks[0]}),'task_not_current'],
  [state=>{state.tasks[0].type='Осмотр'},'invalid_or_completed_daily_task'],
  [state=>{state.tasks[0].completedAt='2026-04-15'},'invalid_or_completed_daily_task'],
  [state=>{state.tasks[0].completedRecordId='record'},'invalid_or_completed_daily_task'],
  [state=>state.records.push({id:'record',taskId:state.tasks[0].id,archivedAt:'2026-04-16'}),'invalid_or_completed_daily_task']
 ];
 for(const [mutate,error] of cases){
  const state=base();
  const {task}=api.buildDailyPlan(state,request(),id);
  state.tasks.push(task);
  mutate(state);
  const before=structuredClone(state);
  assert.deepEqual(api.validateDailyCompletion(state,task),{ok:false,error});
  assert.deepEqual(state,before);
 }
});

test('OP02 accepts both confirmed endpoints and keeps legacy fields outside the new plan',()=>{
 for(const grams of [100,200]){
  const state=base();
  state.families[0].recordStatus=undefined;
  state.tasks.push({id:'legacy',hive:'h1',type:'Подкормка',portionGrams:150,status:'pending'});
  const before=structuredClone(state);
  const {task}=api.buildDailyPlan(state,request({gramsPerColonyPerDay:grams}),id);
  assert.equal(task.plannedFeedingAmount,grams+' г');
  assert.equal(task.gramsPerColonyPerDay,grams);
  assert.deepEqual(state,before);
  assert.equal(api.validateDailyCompletion(state,task).error,'task_not_current');
  state.tasks.push(task);
  assert.equal(api.validateDailyCompletion(state,{...task}).error,'task_not_current');
  assert.deepEqual(api.validateDailyCompletion(state,task),{ok:true});
 }
});


test('OP02 fails closed if tasks or factual-record index is unavailable',()=>{
 for(const field of ['tasks','records']){
  const state=base();
  delete state[field];
  const before=structuredClone(state);
  assert.deepEqual(api.buildDailyPlan(state,request(),id),{ok:false,error:'incomplete_accounting_state'});
  assert.deepEqual(state,before);
 }
 for(const field of ['tasks','records']){
  const state=base();
  state[field]={};
  assert.deepEqual(api.buildDailyPlan(state,request(),id),{ok:false,error:'incomplete_accounting_state'});
 }
});
