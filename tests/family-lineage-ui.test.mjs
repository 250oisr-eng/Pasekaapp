import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../js/family-lineage-ui.js',import.meta.url),'utf8');
const windowRef={};
new Function('window',source)(windowRef);
const ui=windowRef.PasekaFamilyLineageUI;

function state(){
 return {
  families:[
   {id:'f-old',name:'26-01',hive:'h1',recordStatus:'historical',currentQueenId:null,queenIdentityStatus:'unresolved',colonyGroupId:'g1'},
   {id:'f-a',name:'26-02',hive:'h1',recordStatus:'active',currentQueenId:null,queenIdentityStatus:'unresolved',colonyGroupId:'g1'},
   {id:'f-b',name:'26-03',hive:'h1',recordStatus:'active',currentQueenId:'q2',queenIdentityStatus:'identified',colonyGroupId:'g1'},
   {id:'f-c',name:'26-04',hive:'h1',recordStatus:'active',currentQueenId:null,queenIdentityStatus:'unresolved',colonyGroupId:'g1'}
  ],
  queens:[
   {id:'q1',familyId:'f-old',originFamilyId:'f-old',code:'Q-01',status:'unknown'},
   {id:'q2',familyId:'f-b',originFamilyId:'f-old',code:'Q-02',status:'current'}
  ],
  familyEvents:[
   {id:'e1',type:'split',sourceFamilyIds:['f-old'],resultFamilyIds:['f-a','f-b','f-c'],candidateQueenIds:['q1'],operationId:'OP-04',techProcessId:'tp1',occurredAt:'2026-04-01T10:00:00.000Z',createdAt:'2026-04-01T10:00:00.000Z'},
   {id:'e2',type:'queen_identity_confirmed',familyId:'f-b',queenId:'q2',occurredAt:'2026-04-10T10:00:00.000Z',createdAt:'2026-04-10T10:00:00.000Z'}
  ]
 };
}

test('overview counts active and historical families without changing source state',()=>{
 const source=state(),before=structuredClone(source);
 const overview=ui.buildOverview(source);
 assert.equal(overview.activeCount,3);
 assert.equal(overview.historicalCount,1);
 assert.equal(overview.unresolvedCount,2);
 assert.deepEqual(source,before);
});

test('queen confirmation candidates are offered only to unresolved active result families and never duplicated',()=>{
 const overview=ui.buildOverview(state());
 assert.equal(overview.pendingConfirmations.length,1);
 assert.equal(overview.pendingConfirmations[0].familyId,'f-a');
 assert.deepEqual(overview.pendingConfirmations[0].candidates.map(x=>x.queenId),['q1']);
});

test('a candidate already assigned to another active family is not offered',()=>{
 const source=state();
 source.families.find(x=>x.id==='f-a').currentQueenId=null;
 source.families.find(x=>x.id==='f-a').queenIdentityStatus='unresolved';
 source.families.find(x=>x.id==='f-b').currentQueenId='q1';
 source.queens.find(x=>x.id==='q1').familyId='f-b';
 const overview=ui.buildOverview(source);
 assert.equal(overview.pendingConfirmations.some(x=>x.familyId==='f-a'),false);
});

test('lineage event descriptions preserve source and result family relationships',()=>{
 const source=state();
 const event=ui.describeEvent(source,source.familyEvents[0]);
 assert.match(event,/26-01 → 26-02, 26-03, 26-04/);
});

test('event history is ordered newest first and uses recorded dates',()=>{
 const overview=ui.buildOverview(state());
 assert.equal(overview.events[0].id,'e2');
 assert.equal(overview.events[0].date,'2026-04-10T10:00:00.000Z');
 assert.equal(overview.events[1].operationId,'OP-04');
});

test('queen candidates with a resolved or terminal status are not offered',()=>{
 const source=state();
 source.queens.find(x=>x.id==='q1').status='dead';
 const overview=ui.buildOverview(source);
 assert.equal(overview.pendingConfirmations.length,0);
});
