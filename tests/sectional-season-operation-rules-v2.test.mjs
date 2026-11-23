import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};new Function('window',readFileSync(new URL('../js/sectional-season-operation-rules-v2.js',import.meta.url),'utf8'))(w);
const validate=w.PasekaSectionalSeasonOperationRulesV2.validate;
const snap=(mode='SIDE_BY_SIDE',n=2)=>{
 const sections=mode==='SINGLE_FAMILY'?[{familyId:'merged',broodBodyIds:['b1','b2','b3']}]:mode==='ALTERNATIVE_WINTERING_COLUMN'?[{familyId:'f1',broodBodyIds:['b1','b2']},{familyId:'f2',broodBodyIds:['b3']},{familyId:'f3',broodBodyIds:['b4']}]:[{familyId:'f1',broodBodyIds:['b1','b2']},{familyId:'f2',broodBodyIds:['b3','b4']},{familyId:'f3',broodBodyIds:['b5','b6']}];
 const bodyIds=mode==='SIDE_BY_SIDE'&&n?Array.from({length:n},(_,i)=>'h'+(i+1)):[];
 const bodyInventory=Object.fromEntries([...['b1','b2','b3','b4','b5','b6'],...bodyIds].map(id=>[id,{frames:[{frameId:id+'-frame',history:[]}]}]));
 return {hiveId:'hive',profileId:'sectional-multiqueen-v1',layout:{mode,sections,honeyStack:bodyIds.length?{bodyIds}:undefined,meshDiaphragms:mode==='ALTERNATIVE_WINTERING_COLUMN'?[{id:'d1'},{id:'d2'}]:[]},bodyInventory};
};
const req=(id,extras={})=>({operationId:id,userConfirmed:true,...extras});
const fails=(arr,code)=>arr.some(x=>x.code===code);
test('OP08 requires each confirmed sealed frame to gain actual history',()=>{
 const a=snap(),b=structuredClone(a);
 b.bodyInventory.h1.frames[0].history.push({type:'honey_extracted',at:'2026-11-23'});
 assert.deepEqual(validate(a,b,req('OP-08',{sealingObserved:true,sealedFrameIds:['h1-frame']})),[]);
 assert.ok(fails(validate(a,b,req('OP-08',{sealingObserved:false,sealedFrameIds:['h1-frame']})),'op08_sealed_frame_evidence_required'));
 assert.ok(fails(validate(a,a,req('OP-08',{sealingObserved:true,sealedFrameIds:['h1-frame']})),'op08_no_frame_history_change'));
});
test('OP09 observes summer/autumn entrances but never moves honey bodies',()=>{
 const a=snap(),b=structuredClone(a);
 a.seasonalEntranceObservations=[];b.seasonalEntranceObservations=[{operationId:'OP-09',phase:'AUTUMN_REDUCED',userConfirmed:true}];
 assert.deepEqual(validate(a,b,req('OP-09',{seasonPhase:'AUTUMN_REDUCED',entrancesPersonallyObserved:true})),[]);
 b.layout.honeyStack.bodyIds=['h1','h2','h3','h4'];
 assert.ok(validate(a,b,req('OP-09',{seasonPhase:'AUTUMN_REDUCED',entrancesPersonallyObserved:true})).length);
});
test('OP10 requires removing honey tier and storing equipment',()=>{
 const a=snap(),b=snap('SIDE_BY_SIDE',0);
 assert.deepEqual(validate(a,b,req('OP-10',{excludersStoredConfirmed:true,honeyBodiesStoredConfirmed:true})),[]);
 assert.ok(validate(a,b,req('OP-10',{honeyBodiesStoredConfirmed:false})).length);
});
test('OP11 standard wintering needs three brood bodies and single family',()=>{
 const a=snap('SIDE_BY_SIDE',0),b=snap('SINGLE_FAMILY',0);
 assert.deepEqual(validate(a,b,req('OP-11',{actualMergeConfirmed:true})),[]);
 assert.ok(validate(a,a,req('OP-11',{actualMergeConfirmed:true})).length);
});
test('OP12 alternative wintering preserves three families across two mesh diaphragms',()=>{
 const a=snap('SIDE_BY_SIDE',0),b=snap('ALTERNATIVE_WINTERING_COLUMN',0);
 assert.deepEqual(validate(a,b,req('OP-12',{actualIsolationConfirmed:true})),[]);
 b.layout.meshDiaphragms.pop();
 assert.ok(validate(a,b,req('OP-12',{actualIsolationConfirmed:true})).length);
});
test('OP13 spring split needs alternative winter state and observed separation',()=>{
 const a=snap('ALTERNATIVE_WINTERING_COLUMN',0),b=snap('SIDE_BY_SIDE',0);
 assert.deepEqual(validate(a,b,req('OP-13',{actualSeparationConfirmed:true,queenObservationConfirmed:true})),[]);
 assert.ok(validate(a,b,req('OP-13',{actualSeparationConfirmed:true})).length);
});
test('OP14 confirmed early honey merge requires a real two-body harvest and blocks auto-selected queen',()=>{
 const a=snap('SIDE_BY_SIDE',2),b=snap('SINGLE_FAMILY',0);
 assert.deepEqual(validate(a,b,req('OP-14',{earlyHoneyHarvestConfirmed:true,actualMergeConfirmed:true})),[]);
 assert.ok(validate(a,b,req('OP-14',{earlyHoneyHarvestConfirmed:true,actualMergeConfirmed:true,queenIdentityAutoSelected:true})).length);
 assert.ok(fails(validate(snap('SIDE_BY_SIDE',0),b,req('OP-14',{earlyHoneyHarvestConfirmed:true,actualMergeConfirmed:true})),'op14_early_honey_merge_invalid'));
});
test('Farrar or unknown operation cannot pass sectional v2 policy',()=>{
 const a=snap(),b=snap('SIDE_BY_SIDE',4);
 a.profileId='farrar';assert.ok(validate(a,b,req('OP-09',{inventoryMovesConfirmed:true})).length);
 assert.ok(validate(snap(),b,req('OP-99')).length);
});
