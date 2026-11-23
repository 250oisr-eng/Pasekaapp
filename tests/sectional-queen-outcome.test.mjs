import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const appWindow={};
for(const path of ['../js/family-lineage.js','../js/sectional-queen-outcome.js']){
 const source=await readFile(new URL(path,import.meta.url),'utf8');
 new Function('window',source)(appWindow);
}
const lineage=appWindow.PasekaFamilyLineage,api=appWindow.PasekaSectionalQueenOutcome;
let n=0;const makeId=()=> 'twoq-evidence-'+(++n);
const now='2026-04-22T09:00:00.000Z';
function fixture(){
 const state={
  meta:{schemaVersion:15},hives:[{id:'h1',profileId:'sectional-multiqueen-v1'}],
  families:[{id:'source',hive:'h1',name:'source',recordStatus:'active',currentQueenId:'queen-old',queenIdentityStatus:'identified'}],
  queens:[{id:'queen-old',familyId:'source',status:'current',originType:'unknown'}],
  queenEvents:[],familyEvents:[],sectionalTechProcesses:[],equipmentInventory:{items:{}},layouts:{}
 };
 const split=lineage.applySplit(state,{sourceFamilyId:'source',operationId:'OP-04',techProcessId:'tp1',
  resultFamilies:[1,2,3].map(i=>({id:'section-'+i,hive:'h1',name:'Section '+i}))},makeId,'2026-04-01T10:00:00.000Z');
 assert.equal(split.ok,true,JSON.stringify(split));
 state.sectionalTechProcesses.push({id:'tp1',hiveId:'h1',state:{operations:[{operationId:'OP-04',status:'DONE',evidence:{familyEventId:split.event.id}}]}});
 return {state,split};
}
test('unknown, wrongly profiled and malformed split are fail-closed',()=>{
 const {state}=fixture();
 assert.equal(api.assess(state,'other',lineage).code,'PROCESS_NOT_FOUND');
 state.hives[0].profileId='farrar';
 assert.equal(api.assess(state,'tp1',lineage).code,'PROFILE_NOT_ACTIVE');
 state.hives[0].profileId='sectional-multiqueen-v1';
 assert.equal(api.assess(state,'tp1',lineage).outcome,'NOT_DETERMINED');
 assert.equal(api.assess(state,'tp1',lineage).canCompleteOP06,false);
});
test('absence is never guessed and requires an explicit confirmation',()=>{
 const {state}=fixture(),before=structuredClone(state);
 const denied=api.recordConfirmedAbsence(state,{familyId:'section-3',processId:'tp1',occurredAt:'2026-04-20T10:00:00.000Z'},lineage,makeId,now);
 assert.equal(denied.ok,false);assert.deepEqual(state,before);
 const badFamily=api.recordConfirmedAbsence(state,{userConfirmed:true,familyId:'unknown',processId:'tp1',occurredAt:'2026-04-20T10:00:00.000Z'},lineage,makeId,now);
 assert.equal(badFamily.ok,false);assert.deepEqual(state,before);
 const result=api.recordConfirmedAbsence(state,{userConfirmed:true,familyId:'section-3',processId:'tp1',occurredAt:'2026-04-20T10:00:00.000Z',notes:'Не вернулась с облёта — подтверждено осмотром'},lineage,makeId,now);
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.event.type,'queen_absence_confirmed');
 assert.equal(result.event.familyId,'section-3');
 assert.equal(lineage.getQueenPresenceStatus(state,'section-3'),'confirmed_absent');
 assert.equal(result.status.absentCount,1);
 assert.equal(result.status.canRemoveMesh,false);
 assert.equal(result.status.canCompleteOP06,false);
 const copy=structuredClone(state);
 assert.equal(api.recordConfirmedAbsence(state,{userConfirmed:true,familyId:'section-2',processId:'tp1',occurredAt:'2026-04-20T10:00:00.000Z'},lineage,makeId,now).ok,false);
 assert.deepEqual(state,copy);
});
test('two laying queens plus confirmed absence never authorizes OP06 or mesh removal',()=>{
 const {state,split}=fixture();
 const ids=['section-1','section-2'];
 for(const [index,id] of ids.entries()){
  // Directly model confirmed evidence for this read-only assessment (writer remains existing lineage API).
  const family=state.families.find(f=>f.id===id);
  const queenId='queen-test-'+index;
  family.currentQueenId=queenId;family.queenIdentityStatus='identified';
  state.queens.push({id:queenId,familyId:id,status:'current'});
  state.queenEvents.push({id:makeId(),type:'laying_observed',familyId:id,queenId,splitEventId:split.event.id,techProcessId:'tp1',userConfirmed:true,occurredAt:'2026-04-20T09:00:00.000Z'});
 }
 const absence=api.recordConfirmedAbsence(state,{userConfirmed:true,familyId:'section-3',processId:'tp1',occurredAt:'2026-04-20T10:00:00.000Z'},lineage,makeId,now);
 assert.equal(absence.ok,true,JSON.stringify(absence));
 const result=api.assess(state,'tp1',lineage);
 assert.equal(result.outcome,'TWO_LAYING_QUEENS_ONE_ABSENT');
 assert.equal(result.presentCount,2);assert.equal(result.absentCount,1);assert.equal(result.layingConfirmedCount,2);
 assert.equal(result.requiresProcedureConfirmation,true);
 assert.equal(result.canCompleteOP06,false);
 assert.equal(result.canRemoveMesh,false);
 assert.equal(state.sectionalTechProcesses[0].state.operations.some(x=>x.operationId==='OP-06'),false);
});
