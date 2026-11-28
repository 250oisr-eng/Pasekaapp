import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const env={};
for(const name of ['sectional-physical-layout.js','sectional-op11-preview.js','sectional-op11-frame-custody.js']){
 const code=await readFile(new URL('../js/'+name,import.meta.url),'utf8');
 new Function('window',code)(env);
}
const original=await readFile(new URL('./sectional-op11-preview.test.mjs',import.meta.url),'utf8');
const fixtureCode=original.slice(original.indexOf("const PROFILE='"),original.indexOf("test('OP11 source"));
const {fixture,selection}=new Function(fixtureCode+'\nreturn {fixture,selection}')();
const Custody=env.PasekaSectionalOP11FrameCustody;
function source(){
 const state=fixture();
 for(const body of Object.values(state.equipmentInventory.bodies)){
  body.spec.frame={heightMm:180};
 }
 return state;
}
const actions=(state)=>{
 const scan=Custody.inspect(state,selection());
 assert.equal(scan.ok,true,JSON.stringify(scan));
 return Object.fromEntries(scan.removed.flatMap(body=>body.frameIds.map(id=>[id,{
  destination:'processing',observedContent:'unobserved'
 }])));
};
test('OP11 36-frame custody keeps original IDs and separates 18 removed frames without write',()=>{
 const state=source(),before=structuredClone(state);
 const scan=Custody.inspect(state,selection());
 assert.equal(scan.ok,true,JSON.stringify(scan));
 assert.deepEqual(scan.retained.map(x=>x.bodyId),['b2','b4','b6']);
 assert.deepEqual(scan.removed.map(x=>x.bodyId),['b1','b3','b5']);
 assert.equal(scan.removedFrameCount,18);
 assert.equal(scan.retainedFrameCount,18);
 assert.equal(scan.processingNotRecorded,true);
 assert.equal(scan.frameContentsNotInferred,true);
 assert.deepEqual(state,before);
 scan.removed[0].frameIds[0]='tampered';
 assert.deepEqual(state,before);
});
test('OP11 frame custody needs explicit processing intent for each of 18 removed frames',()=>{
 const s=source(),before=structuredClone(s),input=selection(),all=actions(s);
 const noActions=Custody.previewCustody(s,input);
 assert.equal(noActions.ok,false);
 const exact=Custody.previewCustody(s,{...input,frameActions:all});
 assert.equal(exact.ok,true,JSON.stringify(exact));
 assert.equal(exact.frameProcessingIntents.length,18);
 assert.equal(exact.frameHistoryCommitted,false);
 assert.equal(exact.physicalProcessingConfirmed,false);
 assert.equal(exact.readyForPersistence,false);
 const first=Object.keys(all)[0];
 for(const patch of [
  {[first]:undefined},
  {[first]:{destination:'storage',observedContent:'honey'}},
  {[first]:{destination:'processing',observedContent:'invented'}},
  {foreign:{destination:'processing',observedContent:'perga'}}
 ]){
  const modified={...all,...patch};
  const out=Custody.previewCustody(s,{...input,frameActions:modified});
  assert.equal(out.ok,false,JSON.stringify(patch));
 }
 assert.deepEqual(s,before);
});
test('OP11 refuses missing unknown or duplicate frame geometry and global frame IDs',()=>{
 const mutations=[
  s=>{delete s.equipmentInventory.bodies.b1.spec.frame.heightMm},
  s=>{s.equipmentInventory.bodies.b1.spec.frame.heightMm=195},
  s=>{s.equipmentInventory.bodies.b2.frames.pop()},
  s=>{s.equipmentInventory.bodies.b4.frames[0].frameId=''},
  s=>{s.equipmentInventory.bodies.b5.frames[0].frameId=s.equipmentInventory.bodies.b1.frames[0].frameId},
  s=>{s.equipmentInventory.bodies.b3.frames[0].history='bad'},
  s=>{s.equipmentInventory.bodies.b1.kind='honey'},
  s=>{s.equipmentInventory.bodies.b6.condition='retired'}
 ];
 for(const mutate of mutations){
  const s=source();mutate(s);const before=structuredClone(s);
  const out=Custody.inspect(s,selection());
  assert.equal(out.ok,false,JSON.stringify(out));
  assert.deepEqual(s,before);
 }
});
test('OP11 custody fails closed on stale revision and bad source hive',()=>{
 const s=source(),before=structuredClone(s);
 for(const patch of [{expectedRevisionId:'stale'},{hiveId:'other'},{upperBodyId:'b1'}]){
  assert.equal(Custody.inspect(s,{...selection(),...patch}).ok,false);
 }
 assert.deepEqual(s,before);
});
test('OP11 custody module remains offline-inert and never a persistence or real-operation API',async()=>{
 const code=await readFile(new URL('../js/sectional-op11-frame-custody.js',import.meta.url),'utf8');
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/sectional-op11-frame-custody\.js/);
 assert.doesNotMatch(sw,/sectional-op11-frame-custody\.js/);
 assert.doesNotMatch(code,/indexedDB\.open|writeMainWithBackup\s*\(|saveState\s*\(/);
});
