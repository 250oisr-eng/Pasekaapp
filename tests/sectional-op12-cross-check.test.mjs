import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const env={};
for(const name of ['sectional-physical-layout.js','equipment-items.js','sectional-op12-cross-check.js']){
 const code=await readFile(new URL('../js/'+name,import.meta.url),'utf8');
 new Function('window',code)(env);
}
const original=await readFile(new URL('./sectional-physical-layout.test.mjs',import.meta.url),'utf8');
const prefix=original.slice(original.indexOf("const PROFILE='"),original.indexOf("test('does not require a stored body"));
const {alternativeWintering}=new Function('Layout','Equipment',prefix+'\nreturn {alternativeWintering}')(
 env.PasekaSectionalPhysicalLayout,env.PasekaEquipmentItems);
const audit=env.PasekaSectionalOP12CrossCheck;
function fixture(){
 const {state,layout}=alternativeWintering('lower');
 state.meta={revisionId:'r1'};
 state.familyEvents=[{
  id:'winter-1',type:'alternative_wintering_configured',operationId:'OP-12',
  hiveId:'h1',techProcessId:'season',familyIds:['f1','f2','f3'],
  diaphragmItemIds:['d1','d2'],layout:[
   {familyId:'f1',position:'lower',bodyCount:2},
   {familyId:'f2',position:'middle',bodyCount:1},
   {familyId:'f3',position:'upper',bodyCount:1}
  ]
 }];
 return state;
}
const req=()=>({hiveId:'h1',expectedRevisionId:'r1',techProcessId:'season'});
test('OP12 exact physical layout and family event/mesh diaphragm match in ordered 2+1+1 winter',()=>{
 const s=fixture(),before=structuredClone(s);
 const result=audit.inspect(s,req());
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.deepEqual(result.physicalFamilyOrder.map(x=>x.existingBroodBodyIds.length),[2,1,1]);
 assert.equal(result.strongestFamilyId,'f1');
 assert.equal(result.strongestSelectionConfirmed,false);
 assert.equal(result.completionRecorded,false);
 assert.deepEqual(result.installedMeshDiaphragmIds,['d1','d2']);
 assert.deepEqual(s,before);
 result.physicalFamilyOrder[0].existingBroodBodyIds.push('forged');
 assert.deepEqual(s,before);
});
test('OP12 cross-check detects swapped family IDs, body counts and mesh diaphragm provenance',()=>{
 for(const bad of [
  s=>{s.familyEvents[0].layout[1].familyId='f3'},
  s=>{s.familyEvents[0].layout[0].bodyCount=1},
  s=>{s.familyEvents[0].diaphragmItemIds=['d1','wrong']},
  s=>{s.familyEvents[0].familyIds=['f1','f2','missing']},
  s=>{s.familyEvents[0].layout[2].position='lower'},
  s=>{s.familyEvents[0].layout.pop()}
 ]){
  const s=fixture();bad(s);const before=structuredClone(s);
  const out=audit.inspect(s,req());
  assert.equal(out.ok,false,JSON.stringify(out));
  assert.deepEqual(s,before);
 }
});
test('OP12 requires unique seasonal event and rejects ambiguous multi-year cycles',()=>{
 const s=fixture();
 const another=structuredClone(s.familyEvents[0]);another.id='winter-2';another.techProcessId='season-2';
 s.familyEvents.push(another);
 const before=structuredClone(s);
 assert.equal(audit.inspect(s,{hiveId:'h1',expectedRevisionId:'r1'}).error,'op12_unique_winter_event_required');
 assert.equal(audit.inspect(s,req()).ok,true);
 assert.deepEqual(s,before);
});
test('OP12 cross-check never accepts an invalid source physical state or wrong hive/revision',()=>{
 for(const patch of [
  s=>{s.meta.revisionId='changed'},
  s=>{s.hives[0].profileId='farrar'},
  s=>{s.sectionalLayouts[0].sections[0].broodBodyIds.pop()},
  s=>{s.sectionalLayouts[0].meshDiaphragms.pop()},
  s=>{s.equipmentInventory.items.d2.condition='retired'},
  s=>{s.families[0].recordStatus='historical'}
 ]){
  const s=fixture();patch(s);const before=structuredClone(s),out=audit.inspect(s,req());
  assert.equal(out.ok,false,JSON.stringify(out));
  assert.deepEqual(s,before);
 }
});
test('OP12 cross-check is not loaded by UI or SW and does not write',async()=>{
 const code=await readFile(new URL('../js/sectional-op12-cross-check.js',import.meta.url),'utf8');
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/sectional-op12-cross-check\.js/);
 assert.doesNotMatch(sw,/sectional-op12-cross-check\.js/);
 assert.doesNotMatch(code,/indexedDB\.open|writeMainWithBackup\s*\(|save\s*\(/);
});