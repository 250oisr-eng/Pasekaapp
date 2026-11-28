import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Reuse the original verified OP11 synthetic source, then add the lineage
// and item-ledger fields that the existing production validators require.
const appWindow={};
for(const name of ['sectional-physical-layout.js','sectional-op11-preview.js',
 'family-lineage.js','equipment-items.js','sectional-op11-transition-candidate.js']){
 const source=await readFile(new URL('../js/'+name,import.meta.url),'utf8');
 new Function('window',source)(appWindow);
}
const source=await readFile(new URL('./sectional-op11-preview.test.mjs',import.meta.url),'utf8');
const fixtureCode=source.slice(source.indexOf("const PROFILE='"),source.indexOf("test('OP11 source"));
assert.ok(fixtureCode.includes('function fixture()'));
const base=new Function(fixtureCode+'\nreturn {fixture,selection};')();
const Candidate=appWindow.PasekaSectionalOP11Candidate;
const Layout=appWindow.PasekaSectionalPhysicalLayout;
const Items=appWindow.PasekaEquipmentItems;
const Lineage=appWindow.PasekaFamilyLineage;
const NOW='2026-11-28T10:00:00.000Z';
function fixture(){
 const state=base.fixture();
 state.queenEvents=[];state.familyEvents=[];
 state.equipmentInventory.itemEvents=[];
 state.equipmentInventory.events=[];
 for(const suffix of ['l','m','r']){
  const family=state.families.find(f=>f.id==='f-'+suffix);
  family.queenIdentityStatus='identified';
  family.currentQueenId='q-'+suffix;
  state.queens.push({id:'q-'+suffix,familyId:'f-'+suffix,status:'current',
   createdAt:NOW,updatedAt:NOW});
 }
 for(const item of Object.values(state.equipmentInventory.items)){
  item.label=item.id;item.notes='';item.registeredAt=NOW;item.updatedAt=NOW;
 }
 return state;
}
const request=()=>({...base.selection(),storageLabel:'QA склад',
 resultFamilyId:'new-family',techProcessId:'season',occurredAt:NOW});
const makeIds=()=>{let n=0;return{makeId:()=>('op11-candidate-'+(++n))}};

test('OP11 staged candidate checks actual physical, lineage and inventory validators without a write',()=>{
 const state=fixture(),before=structuredClone(state);
 assert.deepEqual(Layout.validate(state.sectionalLayouts[0],state),{valid:true,errors:[]});
 assert.deepEqual(Lineage.inspect(state),[]);
 assert.deepEqual(Items.inspect(state),[]);
 const result=Candidate.assess(state,request(),makeIds());
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.simulated,true);assert.equal(result.readOnly,true);
 assert.equal(result.targetMode,'SINGLE_FAMILY');
 assert.deepEqual(result.retainedBodyIds,['b2','b4','b6']);
 assert.deepEqual(result.removedBodyIds,['b1','b3','b5']);
 assert.deepEqual(result.sourceFamilies,['f-l','f-m','f-r']);
 assert.equal(result.candidatePhysicalValidated,true);
 assert.equal(result.candidateLineageValidated,true);
 assert.equal(result.candidateInventoryValidated,true);
 assert.equal(result.plannedItemMoves.length,9+8+4+4);
 assert.equal(result.bodyAndFrameHistoryStaged,false);
 assert.equal(result.coordinatorCompletionStaged,false);
 assert.equal(result.backupRestoreProven,false);
 assert.equal(result.readyForPersistence,false);assert.equal(result.completionRecorded,false);
 assert.equal(result.survivingQueenId,null);
 assert.equal(result.queenIdentityStatus,'unresolved');
 assert.ok(result.unresolvedWriteGates.includes('durable_revision_compare_and_swap'));
 assert.deepEqual(state,before,'candidate verification must not touch the live apiary');
 result.plannedItemMoves[0].to.label='forged';
 assert.deepEqual(state,before,'returned plan must be detached from all apiary data');
});
test('OP11 candidate requires explicit ventilation and never completes from fake confirmations',()=>{
 const state=fixture(),before=structuredClone(state),r=request();
 delete r.ventilationOption;
 assert.equal(Candidate.assess(state,r,makeIds()).error,'op11_candidate_explicit_ventilation_required');
 const simulated=Candidate.assess(state,{...request(),userConfirmed:true,actualWorkConfirmed:true,
  survivingQueenId:'q-l'},makeIds());
 assert.equal(simulated.ok,true,JSON.stringify(simulated));
 assert.equal(simulated.completionRecorded,false);
 assert.equal(simulated.readyForPersistence,false);
 assert.equal(simulated.survivingQueenId,null);
 assert.deepEqual(state,before);
});
test('OP11 candidate rejects unresolved lineage and malformed queen references without state mutation',()=>{
 for(const bad of [
  s=>{s.families[0].queenIdentityStatus='unresolved';s.families[0].currentQueenId=null;},
  s=>{s.queens[1].familyId='wrong';},
  s=>{s.queens[2].status='retired';}
 ]){
  const state=fixture();bad(state);const before=structuredClone(state);
  const out=Candidate.assess(state,request(),makeIds());
  assert.equal(out.ok,false,JSON.stringify(out));
  assert.deepEqual(state,before);
 }
});
test('OP11 candidate fail closed on stale revision, duplicate family, empty storage or replay',()=>{
 const cases=[
  [s=>{s.meta.revisionId='changed'},request(),'op11_stale_revision'],
  [s=>{s.families.push({id:'new-family'})},request(),'op11_candidate_result_family_duplicate'],
  [s=>{}, {...request(),storageLabel:''},'op11_candidate_result_family_storage_and_process_required'],
  [s=>{}, {...request(),techProcessId:''},'op11_candidate_result_family_storage_and_process_required'],
  [s=>{s.familyEvents.push({id:'old',type:'merge',operationId:'OP-11',
   hiveId:'h',techProcessId:'season'})},request(),'op11_candidate_operation_already_recorded']
 ];
 for(const [mutate,r,expected] of cases){
  const state=fixture();mutate(state);const before=structuredClone(state);
  const out=Candidate.assess(state,r,makeIds());
  assert.equal(out.error,expected,JSON.stringify(out));
  assert.deepEqual(state,before);
 }
});
test('OP11 candidate rejects missing physical inventory or event journal without fabricating records',()=>{
 for(const mutate of [
  state=>{delete state.equipmentInventory.itemEvents},
  state=>{delete state.familyEvents},
  state=>{delete state.equipmentInventory.bodies.b1},
  state=>{state.equipmentInventory.items.p1.condition='retired'}
 ]){
  const state=fixture();mutate(state);const before=structuredClone(state);
  const out=Candidate.assess(state,request(),makeIds());
  assert.equal(out.ok,false,JSON.stringify(out));
  assert.deepEqual(state,before);
 }
});
test('OP11 candidate does not assume a valid result from a failed ID generator',()=>{
 const state=fixture(),before=structuredClone(state);
 const out=Candidate.assess(state,request(),{makeId:()=>null});
 assert.equal(out.ok,false);
 assert.deepEqual(state,before);
});
test('OP11 candidate source remains a standalone non-runtime module with no persistence access',()=>{
 const src=await readFile(new URL('../js/sectional-op11-transition-candidate.js',import.meta.url),'utf8');
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/sectional-op11-transition-candidate\.js/);
 assert.doesNotMatch(sw,/sectional-op11-transition-candidate\.js/);
 assert.doesNotMatch(src,/\bindexedDB\s*\.|\blocalStorage\s*\.|\bwriteMainWithBackup\s*\(/);
 assert.doesNotMatch(src,/\bcommit\s*\(state,|\bcompleteOP11\s*\(/);
});
