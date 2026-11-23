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
  const identity=lineage.confirmQueenIdentity(state,{
   familyId:id,newQueen:{originType:'emergency_reared',code:'Q'+index},
   operationId:'OP-04',techProcessId:'tp1',occurredAt:'2026-04-12T08:00:00.000Z'
  },makeId,'2026-04-12T08:01:00.000Z');
  assert.equal(identity.ok,true,JSON.stringify(identity));
  const observed=lineage.recordQueenLayingObserved(state,{
   familyId:id,techProcessId:'tp1',splitEventId:split.event.id,userConfirmed:true,
   occurredAt:'2026-04-20T09:00:00.000Z'
  },makeId,now);
  assert.equal(observed.ok,true,JSON.stringify(observed));
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

test('two-queen evidence persists in isolated IndexedDB and survives database reopen',async()=>{
 const {IDBFactory}=await import('fake-indexeddb');
 const idb=new IDBFactory(),name='p1-twoqueen-reopen';
 const open=()=>new Promise((resolve,reject)=>{const q=idb.open(name,1);q.onupgradeneeded=()=>q.result.createObjectStore('main');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 const {state}=fixture();
 const recorded=api.recordConfirmedAbsence(state,{userConfirmed:true,familyId:'section-3',processId:'tp1',occurredAt:'2026-04-20T10:00:00.000Z'},lineage,makeId,now);
 assert.equal(recorded.ok,true);
 let db=await open();
 await new Promise((resolve,reject)=>{const tx=db.transaction('main','readwrite');tx.objectStore('main').put(structuredClone(state),'state');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
 db.close();db=await open();
 const loaded=await new Promise((resolve,reject)=>{const q=db.transaction('main','readonly').objectStore('main').get('state');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 assert.equal(api.assess(loaded,'tp1',lineage).absentCount,1);
 assert.equal(api.assess(loaded,'tp1',lineage).canCompleteOP06,false);
 assert.equal(loaded.familyEvents.filter(x=>x.type==='queen_absence_confirmed').length,1);
 db.close();
});
test('UI requires explicit absence evidence and never exposes an OP06 mesh-removal action',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/id="twoQueenConfirmAbsence"/);
 assert.match(html,/recordTwoQueenAbsence\(\)/);
 assert.match(html,/readMain\(\)/);
 assert.match(html,/PasekaSectionalQueenOutcome/);
 assert.match(html,/Снятие сеток и OP-06 по-прежнему заблокированы/);
 const start=html.indexOf('async function recordTwoQueenAbsence()'),end=html.indexOf('async function downloadBackup()',start);
 assert.ok(start>=0);
 assert.doesNotMatch(html.slice(start,end>start?end:start+6500),/completeOP06\(/);
});

test('laying UI remains an observation-only operation requiring user evidence',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/id="twoQueenConfirmLaying"/);
 assert.match(html,/recordTwoQueenLayingObservation\(\)/);
 assert.match(html,/PasekaFamilyLineage\.recordQueenLayingObserved\(draft/);
 assert.match(html,/userConfirmed:true,occurredAt:new Date\(at\)\.toISOString\(\)/);
 assert.match(html,/Двухматочная ветвь: <b>снятие сеток и OP-06 заблокированы<\/b>/);
});

test('fabricated laying observation without identity evidence cannot promote two-queen outcome',()=>{
 const {state,split}=fixture();
 const confirmed=api.recordConfirmedAbsence(state,{userConfirmed:true,familyId:'section-3',processId:'tp1',occurredAt:'2026-04-20T10:00:00.000Z'},lineage,makeId,now);
 assert.equal(confirmed.ok,true);
 for(const familyId of ['section-1','section-2']){
  const family=state.families.find(f=>f.id===familyId),queenId=makeId();
  family.queenIdentityStatus='identified';family.currentQueenId=queenId;
  state.queens.push({id:queenId,familyId,status:'current'});
  state.queenEvents.push({id:makeId(),type:'laying_observed',familyId,queenId,splitEventId:split.event.id,
   techProcessId:'tp1',hiveId:'h1',userConfirmed:true,occurredAt:'2026-04-20T09:00:00.000Z'});
 }
 const view=api.assess(state,'tp1',lineage);
 assert.equal(view.outcome,'TWO_QUEENS_ONE_ABSENT_LAYING_UNVERIFIED');
 assert.equal(view.layingConfirmedCount,0);
 assert.equal(view.canCompleteOP06,false);
});
