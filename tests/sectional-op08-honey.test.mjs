import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};new Function('window',readFileSync(new URL('../js/sectional-op08-honey.js',import.meta.url),'utf8'))(w);const api=w.PasekaSectionalOP08Honey;
const state=()=>({hives:[{id:'h1',profileId:'sectional-multiqueen-v1'}],sectionalLayouts:[{hiveId:'h1',mode:'SIDE_BY_SIDE',honeyStack:{bodyIds:['honey1','honey2']}}],equipmentInventory:{bodies:{honey1:{kind:'honey',frames:[{frameId:'a',history:[]},{frameId:'b',history:[]}]},honey2:{kind:'honey',frames:[{frameId:'c',history:[]}]}}},sectionalHoneyExtractions:[]});
const request=()=>({hiveId:'h1',extractionId:'extract1',frameIds:['a','c'],userConfirmed:true,honeySealedPersonallyObserved:true,honeyExtractionActuallyDone:true,honeyBodiesActuallyReturned:true,occurredAt:'2026-11-23T11:00:00Z'});
const deps=()=>{let i=0;return {now:'2026-11-23T12:00:00Z',makeId:()=> 'evt'+(++i)};};
test('OP08 stages sealed frames with uniquely identified immutable extraction histories',()=>{
 const before=state(),copy=structuredClone(before),r=api.stage(before,request(),deps());
 assert.equal(r.ok,true);assert.deepEqual(before,copy);
 assert.deepEqual(r.extraction.frameIds,['a','c']);assert.equal(r.draft.equipmentInventory.bodies.honey1.frames[0].honeyState,'extracted');
 assert.equal(r.draft.equipmentInventory.bodies.honey1.frames[1].history.length,0);
 assert.deepEqual(api.inspect(r.draft),[]);
});
test('OP08 cannot accept uncapped honey, unconfirmed extraction or unreturned equipment',()=>{
 for(const field of ['userConfirmed','honeySealedPersonallyObserved','honeyExtractionActuallyDone','honeyBodiesActuallyReturned']){
  assert.equal(api.stage(state(),{...request(),[field]:false},deps()).ok,false);
 }
});
test('OP08 rejects untracked frames, repeated frame IDs and non-honey bodies',()=>{
 assert.equal(api.stage(state(),{...request(),frameIds:['unknown']},deps()).ok,false);
 assert.equal(api.stage(state(),{...request(),frameIds:['a','a']},deps()).ok,false);
 const bad=state();bad.equipmentInventory.bodies.honey1.kind='brood';
 assert.equal(api.stage(bad,request(),deps()).ok,false);
});
test('OP08 rejects fraudulent historical event changes',()=>{
 const good=api.stage(state(),request(),deps()).draft;
 good.equipmentInventory.bodies.honey1.frames[0].history[0].extractionId='not-the-real-extraction';
 assert.ok(api.inspect(good).length);
});
test('OP08 rejects accidental repeat of current harvest when requested',()=>{
 const first=api.stage(state(),request(),deps()).draft;
 const r=api.stage(first,{...request(),extractionId:'extract2',preventDuplicateCurrentHarvest:true},deps());
 assert.equal(r.error,'op08_repeat_extraction_rejected');
});
