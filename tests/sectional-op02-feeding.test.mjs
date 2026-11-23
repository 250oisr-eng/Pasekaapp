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
});
test('existing generic feeding and Farrar entries remain unmodified',()=>{
 const state=base();state.tasks.push({id:'legacy-task',hive:'farrar',type:'Подкормка',plannedFeedingAmount:'1 л',status:'pending'});
 const snapshot=structuredClone(state);
 assert.equal(api.buildDailyPlan(state,request(),id).ok,true);
 assert.deepEqual(state,snapshot);
 assert.ok(!('gramsPerColonyPerDay' in state.tasks[0]));
});
test('OP02 UI is linked only as confirmed day plan, not physical automatic completion',()=>{
 assert.match(html,/js\/sectional-op02-feeding\.js/);
 assert.match(html,/id="sectionalOp02Grams"/);
 assert.match(html,/gramsPerColonyPerDay:grams/);
 assert.match(html,/proteinActuallyFedConfirmed=true/);
 assert.match(html,/Подтверждаете фактическую выдачу сегодня жидкой подкормки 2:1/);
 assert.match(sw,/sectional-op02-feeding\.js/);
});
