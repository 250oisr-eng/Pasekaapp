import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};
for(const name of ['sectional-season-operations-wizard-v2.js','sectional-op08-honey.js','sectional-op09-entrances.js'])
 new Function('window',readFileSync(new URL('../js/'+name,import.meta.url),'utf8'))(w);
const api=w.PasekaSeasonOperationsWizardV2,op08=w.PasekaSectionalOP08Honey,op09=w.PasekaSectionalOP09Entrances;
const profile='sectional-multiqueen-v1';
function fixture(){
 return {
  hives:[{id:'hive',profileId:profile}],
  families:['l','m','r'].map(x=>({id:'f-'+x,hive:'hive'})),
  sectionalLayouts:[{
   id:'layout',hiveId:'hive',profileId:profile,mode:'SIDE_BY_SIDE',
   sections:['left','middle','right'].map((position,i)=>({id:'s'+i,position,familyId:'f-'+['l','m','r'][i],broodBodyIds:['brood-'+i]})),
   honeyStack:{bodyIds:['h1','h2']}
  }],
  equipmentInventory:{bodies:{
   h1:{id:'h1',kind:'honey',pairId:'pair',spec:{profileId:profile,framesPerBox:10},
    frames:[{frameId:'h1-fr',history:[]}]},
   h2:{id:'h2',kind:'honey',pairId:'pair',spec:{profileId:profile,framesPerBox:10},
    frames:[{frameId:'h2-fr',history:[]}]}
  },items:{}},
  sectionalHoneyExtractions:[],sectionalSeasonalEntranceObservations:[]
 };
}
const operation=(op,values)=>({operationId:op,hiveId:'hive',
 occurredAt:'2026-11-22T13:00:00.000Z',userConfirmed:true,values});
test('OP08 verified honey extraction builds real frame history on a copy only',()=>{
 const state=fixture(),before=structuredClone(state),v={
  sealedFrameIds:['h1-fr','h2-fr'],sealingObserved:true,actualExtraction:true,actualHoneyBodyReturn:true
 };
 let n=0;
 const result=api.previewOP08(state,operation('OP-08',v),{
  extractor:op08,makeId:()=> 'op08-test-'+(++n),now:'2026-11-23T13:00:00.000Z'
 });
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.readOnly,true);assert.equal(result.operationCompleted,false);
 assert.deepEqual(state,before);
 assert.equal(result.draft.sectionalHoneyExtractions.length,1);
 assert.deepEqual(result.draft.sectionalHoneyExtractions[0].frameIds,['h1-fr','h2-fr']);
 assert.equal(result.draft.equipmentInventory.bodies.h1.frames[0].honeyState,'extracted');
 assert.equal(result.draft.equipmentInventory.bodies.h2.frames[0].history[0].operationId,'OP-08');
 assert.equal(op08.inspect(result.draft).length,0);
});
test('OP08 does not stage if physical work not confirmed or frame belongs elsewhere',()=>{
 const state=fixture(),v={sealedFrameIds:['h1-fr'],sealingObserved:true,
  actualExtraction:true,actualHoneyBodyReturn:true};
 const deps={extractor:op08,makeId:()=> 'x',now:'2026-11-23T13:00:00.000Z'};
 assert.equal(api.previewOP08(state,operation('OP-08',{...v,actualExtraction:false}),deps).ok,false);
 assert.equal(api.previewOP08(state,operation('OP-08',{...v,sealedFrameIds:['foreign-fr']}),deps).ok,false);
});
test('OP09 verified entrance observation builds all section events on a copy',()=>{
 const state=fixture(),before=structuredClone(state),
  sections=['s0','s1','s2'].map(sectionId=>({
   sectionId,roundEntrances:'one_open',flatEntrance:'one_bee_width',personallyObserved:true
  }));
 const v={phase:'AUTUMN_REDUCED',allSectionsObserved:true,sectionEntrances:sections};
 const result=api.previewOP09(state,operation('OP-09',v),{
  recorder:op09,makeId:()=> 'observation-id',now:'2026-11-23T13:00:00.000Z'
 });
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.readOnly,true);assert.equal(result.operationCompleted,false);
 assert.deepEqual(state,before);
 assert.equal(result.draft.sectionalSeasonalEntranceObservations.length,1);
 assert.equal(result.event.sections.length,3);
 assert.equal(result.event.phase,'AUTUMN_REDUCED');
 assert.equal(op09.inspect(result.draft).length,0);
});
test('OP09 rejects a missing observation, wrong section or mismatching configuration',()=>{
 const state=fixture(),sections=['s0','s1','s2'].map(sectionId=>({
  sectionId,roundEntrances:'all_open',flatEntrance:'fully_open',personallyObserved:true
 }));
 const deps={recorder:op09,makeId:()=> 'record',now:'2026-11-23T13:00:00.000Z'};
 const good=operation('OP-09',{phase:'SUMMER_FULL',allSectionsObserved:true,sectionEntrances:sections});
 for(const changed of [
  sections.slice(0,2),
  sections.map((x,i)=>i===2?{...x,personallyObserved:false}:x),
  sections.map((x,i)=>i===1?{...x,flatEntrance:'one_bee_width'}:x),
  sections.map((x,i)=>i===1?{...x,sectionId:'other'}:x)
 ])assert.equal(api.previewOP09(state,{...good,values:{...good.values,sectionEntrances:changed}},deps).ok,false);
});
