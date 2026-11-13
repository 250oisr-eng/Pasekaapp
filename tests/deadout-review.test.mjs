import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../js/deadout-review.js',import.meta.url),'utf8');
const appWindow={};new Function('window',source)(appWindow);
const deadout=appWindow.PasekaDeadout;
const hives=[{id:'h1',number:1}];
const base={hiveId:'h1',observedAt:'2027-03-10',lastAliveDate:'2027-02-20',foodStatus:'absent',clusterPosition:'far_from_food',moisture:'condensation',brood:'abnormal',deadBeesInCells:'heads_protruding',varroaEvidence:'not_tested',queenStatus:'not_found',rodentEvidence:'none',seasonContext:'Холодная зима',notes:'Наблюдения'};
test('deadout review stores smartphone observations without asserting a cause',()=>{
 const result=deadout.buildDeadoutReviewDraft(base,hives,[],()=> 'd1','2027-03-10T10:00:00.000Z');
 assert.equal(result.diagnosis,null);assert.equal(result.hiveNumberAtTime,1);
 const differential=deadout.suggestPossibleFactors(result);
 assert.ok(differential.candidates.some(x=>x.code==='food_access'));
 assert.ok(differential.candidates.some(x=>x.code==='moisture'));
 assert.ok(differential.candidates.some(x=>x.code==='dead_at_emergence'));
 assert.match(differential.disclaimer,/не диагноз/i);
});
test('deadout draft validates hive, dates, enum values and bounded photos',()=>{
 assert.throws(()=>deadout.buildDeadoutReviewDraft({...base,hiveId:'missing'},hives,[],()=> 'x','now'),/улей/i);
 assert.throws(()=>deadout.buildDeadoutReviewDraft({...base,observedAt:'2027-02-30'},hives,[],()=> 'x','now'),/дату/i);
 assert.throws(()=>deadout.buildDeadoutReviewDraft({...base,lastAliveDate:'2027-03-11'},hives,[],()=> 'x','now'),/последнего/i);
 assert.throws(()=>deadout.buildDeadoutReviewDraft({...base,foodStatus:'made_up'},hives,[],()=> 'x','now'),/чек-листа/i);
 assert.throws(()=>deadout.buildDeadoutReviewDraft(base,hives,[{kind:'image',name:'x',data:'not-an-image'}],()=> 'x','now'),/фотография/i);
});
test('deadout review integrity protects identity and keeps diagnosis unset',()=>{
 const item=deadout.buildDeadoutReviewDraft(base,hives,[],()=> 'd1','2027-03-10T10:00:00.000Z');
 const state={hives,deadoutReviews:[item]};
 assert.deepEqual(deadout.inspectDeadoutIntegrity(state),[]);
 assert.equal(deadout.inspectDeadoutIntegrity({hives,deadoutReviews:[{...item,diagnosis:'starvation'}]})[0].code,'deadout_diagnosis_must_remain_unset');
});
test('deadout differential does not turn a single visual sign into a definitive diagnosis',()=>{
 const item=deadout.buildDeadoutReviewDraft({...base,foodStatus:'unknown',clusterPosition:'unknown',moisture:'unknown',brood:'unknown',deadBeesInCells:'heads_protruding',varroaEvidence:'unknown',queenStatus:'unknown',rodentEvidence:'unknown'},hives,[],()=> 'd2','2027-03-10T10:00:00.000Z');
 const result=deadout.suggestPossibleFactors(item);
 assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].code,'dead_at_emergence');assert.equal(result.diagnosis,null);
});
