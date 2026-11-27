import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../js/season-planning.js',import.meta.url),'utf8');
const appWindow={};new Function('window',source)(appWindow);
const plan=appWindow.PasekaSeasonPlanning;
test('nectar backward planning calculates a range from flowering date',()=>{
 const result=plan.buildNectarBackwardPlan({plantName:'Липа',floweringDate:'2027-07-05'});
 assert.deepEqual(result.eggLayingWindow,{from:'2027-05-17',to:'2027-05-31'});
 assert.equal(result.targetEggLayingDate,'2027-05-24');
 assert.match(result.warning,/не стимулируй.*автоматически/i);
});
test('nectar planner rejects impossible dates and inverted ranges',()=>{
 assert.throws(()=>plan.buildNectarBackwardPlan({floweringDate:'2027-02-30'}),/дату/i);
 assert.throws(()=>plan.buildNectarBackwardPlan({floweringDate:'2027-07-05',minLeadDays:50,maxLeadDays:40,targetLeadDays:42}),/диапазон/i);
});
test('nectar planner uses the midpoint of the selected window and respects explicit targets',()=>{
 const input={floweringDate:'2027-01-15'};
 for(const [min,max,target] of [[21,21,21],[21,30,26],[40,49,45],[50,60,55],[70,70,70]]){
  const result=plan.buildNectarBackwardPlan({...input,minLeadDays:min,maxLeadDays:max});
  assert.equal(result.leadDays.target,target);
 }
 assert.equal(plan.buildNectarBackwardPlan({...input,minLeadDays:50,maxLeadDays:60,targetLeadDays:51}).leadDays.target,51);
 assert.throws(()=>plan.buildNectarBackwardPlan({...input,minLeadDays:50,maxLeadDays:60,targetLeadDays:42}),/диапазон/i);
});
test('planning screen displays the custom window and midpoint across the year boundary',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const handler=html.slice(html.indexOf('function renderNectarBackwardPlan()'),html.indexOf('function renderQueenRearingTimeline()'));
 const fields={nectarPlantName:{value:'Липа'},nectarFloweringDate:{value:'2027-01-15'},
  nectarMinLead:{value:'50'},nectarMaxLead:{value:'60'},nectarPlanResult:{}};
 new Function('$','PasekaSeasonPlanning','safe',handler+';renderNectarBackwardPlan()')(id=>fields[id],plan,String);
 assert.match(fields.nectarPlanResult.innerHTML,/2026-11-16 — 2026-11-26/);
 assert.match(fields.nectarPlanResult.innerHTML,/Средний ориентир: 2026-11-21/);
});
test('queen rearing timeline accounts for larval age and gives weather-dependent windows',()=>{
 const result=plan.buildQueenRearingTimeline({graftDate:'2027-06-01',larvaAgeHours:24});
 assert.deepEqual(result.estimatedEmergence,{from:'2027-06-12',target:'2027-06-13',to:'2027-06-14'});
 assert.equal(result.milestones.find(x=>x.key==='acceptance').from,'2027-06-02');
 assert.equal(result.milestones.find(x=>x.key==='mating').from,'2027-06-17');
 assert.match(result.warning,/погоды/i);
 assert.throws(()=>plan.buildQueenRearingTimeline({graftDate:'2027-06-01',larvaAgeHours:72}),/возраст/i);
});
test('inspection reminder is configurable and does not claim to prevent swarming',()=>{
 const result=plan.buildInspectionReminder({lastInspection:'2027-06-01',intervalDays:7});
 assert.equal(result.dueDate,'2027-06-08');
 assert.match(result.warning,/не гарантия/i);
 assert.throws(()=>plan.buildInspectionReminder({lastInspection:'2027-06-01',intervalDays:0}),/интервал/i);
});
test('colony strength comparison is relative and requires at least four colonies',()=>{
 const small=plan.rankColonyStrength([{hiveId:'1',occupiedStreets:2},{hiveId:'2',occupiedStreets:5}]);
 assert.equal(small.status,'insufficient_sample');
 const full=plan.rankColonyStrength([{hiveId:'1',occupiedStreets:2},{hiveId:'2',occupiedStreets:4},{hiveId:'3',occupiedStreets:6},{hiveId:'4',occupiedStreets:8}]);
 assert.equal(full.status,'relative_only');
 assert.equal(full.items.find(x=>x.hiveId==='1').percentile,0);
 assert.equal(full.items.find(x=>x.hiveId==='4').percentile,100);
});
test('breeding trait summary requires repeated observations before a stable label',()=>{
 const first=plan.summarizeTraitScores([{gentleness:4},{gentleness:3},{gentleness:4}]).find(x=>x.trait==='gentleness');
 assert.equal(first.status,'preliminary');assert.equal(first.average,3.67);
 const repeated=plan.summarizeTraitScores([{gentleness:4},{gentleness:3},{gentleness:4},{gentleness:4}]).find(x=>x.trait==='gentleness');
 assert.equal(repeated.status,'repeated_observations');
});
test('planning module is included in the phone app and offline cache',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.match(html,/data-tab="planning"/);
 assert.match(html,/PasekaSeasonPlanning\.buildNectarBackwardPlan/);
 assert.match(html,/PasekaSeasonPlanning\.buildQueenRearingTimeline/);
 assert.match(sw,/\.\/js\/season-planning\.js/);
});


test('latest saved inspection is hive-bound and ignores archived, invalid, future or wrong type',()=>{
 const rows=[
  {id:'a',hive:'h1',type:'Осмотр',date:'2026-10-12'},
  {id:'b',hive:'h1',type:'Осмотр',date:'2026-10-25'},
  {id:'c',hive:'h1',type:'Осмотр',date:'2026-11-24',archivedAt:'2026-11-25'},
  {id:'d',hive:'h1',type:'Осмотр',date:'2027-01-01'},
  {id:'e',hive:'h2',type:'Осмотр',date:'2026-11-20'},
  {id:'f',hive:'h1',type:'Задача',date:'2026-11-26'},
  {id:'g',hive:'h1',type:'Осмотр',date:'2026-02-30'}
 ];
 const before=JSON.stringify(rows);
 assert.deepEqual(plan.latestSavedInspection(rows,'h1','2026-11-26'),{date:'2026-10-25',recordId:'b'});
 assert.deepEqual(plan.latestSavedInspection(rows,'h2','2026-11-26'),{date:'2026-11-20',recordId:'e'});
 assert.equal(plan.latestSavedInspection(rows,'h3','2026-11-26'),null);
 assert.equal(JSON.stringify(rows),before);
 assert.throws(()=>plan.latestSavedInspection(rows,'','2026-11-26'),/выбери улей/i);
 assert.throws(()=>plan.latestSavedInspection(null,'h1','2026-11-26'),/выбери улей/i);
});
test('inspection reminder prefill reads only chosen hive and never saves or auto-completes',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const start=html.indexOf('function useLastSavedInspection(){');
 const end=html.indexOf('function renderNectarBackwardPlan(){',start);
 assert.ok(start>0&&end>start,'prefill handler exists');
 const src=html.slice(start,end);
 const fields={inspectionHiveSelect:{value:'h1'},inspectionLastDate:{value:'2026-11-26',dataset:{}},
  inspectionPrefillStatus:{textContent:''},inspectionReminderResult:{textContent:'stale result'}};
 const rows=[{id:'one',hive:'h1',type:'Осмотр',date:'2026-11-19'},
             {id:'other',hive:'h2',type:'Осмотр',date:'2026-11-25'}];
 const S={records:rows};
 const fn=new Function('$','PasekaSeasonPlanning','S','today','hname',
   src+';return useLastSavedInspection');
 const handler=fn(id=>fields[id],plan, S,()=> '2026-11-26',id=>'Улей '+id);
 handler();
 assert.equal(fields.inspectionLastDate.value,'2026-11-19');
 assert.equal(fields.inspectionReminderResult.textContent,'');
 assert.match(fields.inspectionPrefillStatus.textContent,/из журнала/i);
 assert.doesNotMatch(src,/db\.transaction|save\(|saveQueue|put\(|deleteRecord|createRecord/);
 fields.inspectionHiveSelect.value='';
 fields.inspectionLastDate.value='2026-11-01';
 handler();
 assert.equal(fields.inspectionLastDate.value,'2026-11-01','no hive must not overwrite manual input');
});
test('planning UI offers explicit hive selection and leaves the date calculation manual',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/id="inspectionHiveSelect"/);
 assert.match(html,/onclick="useLastSavedInspection\(\)"/);
 assert.match(html,/Дата подставляется только из фактически сохранённой записи/);
 assert.match(html,/onclick="renderInspectionReminder\(\)"/);
 assert.match(html,/latestSavedInspection\(S\.records,hive,today\(\),familyId\)/);
});

test('planning does not default the last real inspection date to today',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const start=html.indexOf('function renderSeasonPlanning(){');
 const end=html.indexOf('function useLastSavedInspection(){',start);
 const source=html.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.doesNotMatch(source,/['"]inspectionLastDate['"],today\(\)/);
 assert.match(source,/id==='inspectionLastDate'|last inspection is a recorded fact/);
 const fields={inspectionHiveSelect:{value:'',innerHTML:''},
  inspectionLastDate:{value:''},nectarFloweringDate:{value:''},queenGraftDate:{value:''}};
 const fn=new Function('$','today','S','selectedHiveId','safe','hname',source+';return renderSeasonPlanning');
 const render=fn(id=>fields[id],()=> '2026-11-26',{hives:[{id:'h1'}]},'',String,id=>'Улей '+id);
 render();
 assert.equal(fields.inspectionLastDate.value,'','must not invent completed inspection');
 assert.equal(fields.nectarFloweringDate.value,'2026-11-26');
 assert.ok(fields.inspectionHiveSelect.innerHTML.includes('h1'));
});

test('changing hive clears the prior inspection, attribution and due date',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/id="inspectionHiveSelect" onchange="resetInspectionReminder\(\)"/);
 const handlers=html.slice(html.indexOf('function clearInspectionCalculation()'),html.indexOf('function useLastSavedInspection()'));
 const fields={inspectionLastDate:{value:'2026-11-01',dataset:{fromJournal:'h1'}},
  inspectionReminderResult:{textContent:'2026-11-08'},inspectionPrefillStatus:{textContent:'Улей 1'}};
 new Function('$',handlers+';resetInspectionReminder()')(id=>fields[id]);
 assert.equal(fields.inspectionLastDate.value,'');
 assert.deepEqual(fields.inspectionLastDate.dataset,{});
 assert.equal(fields.inspectionReminderResult.textContent,'');
 assert.equal(fields.inspectionPrefillStatus.textContent,'');
});

test('saved inspection is family-bound after a hive is reused, without changing old API',()=>{
 const rows=[
  {id:'old',hive:'h1',family:'prior',type:'Осмотр',date:'2026-11-25'},
  {id:'current',hive:'h1',family:'active',type:'Осмотр',date:'2026-11-19'},
  {id:'legacy',hive:'h1',type:'Осмотр',date:'2026-11-26'},
  {id:'conflict',hive:'h1',family:'active',familySnapshotAtTime:{id:'prior'},type:'Осмотр',date:'2026-11-27'},
  {id:'moved',hive:'other',family:'active',type:'Осмотр',date:'2026-11-28'},
  {id:'archived',hive:'h1',family:'active',type:'Осмотр',date:'2026-11-21',archivedAt:'2026-11-22'}
 ];
 const original=structuredClone(rows);
 assert.deepEqual(plan.latestSavedInspection(rows,'h1','2026-11-27','active'),{date:'2026-11-19',recordId:'current'});
 assert.deepEqual(plan.latestSavedInspection(rows,'h1','2026-11-27','prior'),{date:'2026-11-25',recordId:'old'});
 assert.equal(plan.latestSavedInspection(rows,'h1','2026-11-27','new-family'),null);
 assert.deepEqual(plan.latestSavedInspection(rows,'h1','2026-11-27'),{date:'2026-11-27',recordId:'conflict'},
  'legacy hive-only 3-argument API remains compatible');
 assert.deepEqual(rows,original,'inspection lookup is read-only');
 assert.throws(()=>plan.latestSavedInspection(rows,'h1','2026-11-27',''),/идентичность/i);
});
test('reminder prefill does not confuse older family records or multiple current families',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const start=html.indexOf('function useLastSavedInspection(){');
 const end=html.indexOf('function renderNectarBackwardPlan(){',start);
 const source=html.slice(start,end);
 const resetHelpers=html.slice(html.indexOf('function clearInspectionCalculation()'),start);
 const fields={inspectionHiveSelect:{value:'h1'},inspectionLastDate:{value:'',dataset:{}},
  inspectionPrefillStatus:{textContent:''},inspectionReminderResult:{textContent:'stale'}};
 const state={records:[
  {id:'old',hive:'h1',family:'old',type:'Осмотр',date:'2026-11-25'},
  {id:'now',hive:'h1',family:'new',type:'Осмотр',date:'2026-11-21'},
  {id:'not-attributed',hive:'h1',type:'Осмотр',date:'2026-11-26'}
 ],families:[{id:'new',hive:'h1'}]};
 const run=new Function('$','PasekaSeasonPlanning','S','today','hname',
   resetHelpers+source+';return useLastSavedInspection')(id=>fields[id],plan,state,()=> '2026-11-27',id=>'Улей '+id);
 run();
 assert.equal(fields.inspectionLastDate.value,'2026-11-21');
 assert.equal(fields.inspectionLastDate.dataset.fromJournal,'h1');
 assert.match(fields.inspectionPrefillStatus.textContent,/текущая семья/);
 state.families.push({id:'another',hive:'h1'});
 run();
 assert.equal(fields.inspectionLastDate.value,'','previous auto-filled date must be cleared on ambiguous assignment');
 assert.equal(fields.inspectionLastDate.dataset.fromJournal,undefined);
 assert.match(fields.inspectionPrefillStatus.textContent,/несколько семей/);
 state.families=[{id:'new',hive:'h1'}];
 state.records=state.records.filter(r=>r.family!=='new');
 run();
 assert.equal(fields.inspectionLastDate.value,'');
 assert.match(fields.inspectionPrefillStatus.textContent,/нет подтверждённого/);
 assert.equal(state.records.length,2,'no persistent mutation');
});
