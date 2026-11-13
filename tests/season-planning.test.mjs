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
