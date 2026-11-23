import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};new Function('window',readFileSync(new URL('../js/sectional-season-ledger-v2.js',import.meta.url),'utf8'))(w);
const L=w.PasekaSectionalSeasonLedgerV2;
const closed={modelVersion:2,id:'c1',hiveId:'h1',cycleNumber:1,status:'CLOSED',events:[{id:'stage11',type:'STAGE_CONFIRMED',occurredAt:'2026-11-20T11:00:00Z',evidence:{operationId:'OP-11',after:{layout:{mode:'SINGLE_FAMILY'}},stagedWithPhysicalState:true}},{id:'e1',type:'CYCLE_CLOSED',occurredAt:'2026-11-20T12:00:00Z',evidence:{reason:'confirmed merge',confirmedBy:'user',userConfirmationRef:'confirmation1',lastStageEventId:'stage11'}}]};
test('v1 preview copies original without modifying it',()=>{
 const old={modelVersion:1,id:'p1',hiveId:'h1',state:{operations:[{operationId:'OP-07',evidence:{honeyBodyIds:['a','b']}}]}};
 const before=structuredClone(old),p=L.previewV1([old]);
 assert.equal(p.ok,true);assert.deepEqual(old,before);assert.deepEqual(p.records[0].legacy.original,before);
 assert.equal(p.records[0].migrationStatus,'REQUIRES_RECONCILIATION');
});
test('v1 duplicates fail closed',()=>assert.equal(L.previewV1([{id:'a',hiveId:'h',modelVersion:1},{id:'b',hiveId:'h',modelVersion:1}]).ok,false));
test('invalid v1 fails closed',()=>assert.equal(L.previewV1([{id:'a',hiveId:'h',modelVersion:5}]).ok,false));
test('active cycle blocks repetition',()=>assert.equal(L.planNewCycle([{...closed,status:'ACTIVE',events:[]}],{hiveId:'h1',id:'c2',occurredAt:'2026-11-21T12:00:00Z'}).ok,false));
test('closed confirmed cycle permits next numbered cycle',()=>{
 const r=L.planNewCycle([closed],{hiveId:'h1',id:'c2',occurredAt:'2026-11-21T12:00:00Z'});
 assert.equal(r.ok,true);assert.equal(r.newCycle.cycleNumber,2);assert.deepEqual(r.records[0],closed);
});
test('multiple active cycles and numbering gaps fail',()=>{
 assert.ok(L.inspect([{...closed,status:'ACTIVE',events:[]},{...closed,id:'c2',cycleNumber:2,status:'ACTIVE',events:[]}]).length);
 assert.ok(L.inspect([{...closed,cycleNumber:3}]).length);
});
test('closing requires confirmed terminal event',()=>{
 assert.ok(L.inspect([{...closed,events:[]}]).length);
 assert.ok(L.inspect([{...closed,events:[{...closed.events[0],evidence:{reason:'x'}}]}]).length);
});
test('cannot open cycle before confirmed close date',()=>assert.equal(L.planNewCycle([closed],{hiveId:'h1',id:'c2',occurredAt:'2026-11-19T12:00:00Z'}).ok,false));
test('legacy preview cannot authorize another cycle',()=>{
 const p=L.previewV1([{modelVersion:1,id:'old',hiveId:'h1',state:{}}]);
 assert.equal(L.planNewCycle(p.records,{hiveId:'h1',id:'next',occurredAt:'2026-11-23T00:00:00Z'}).ok,false);
});

test('confirmed OP11 physical merge permits closing active cycle',()=>{
 const active={...closed,status:'ACTIVE',events:[closed.events[0]]};
 const result=L.planCloseCycle([active],{userConfirmed:true,confirmationRef:'beekeeping-note',id:'e1',cycleId:'c1',occurredAt:'2026-11-20T12:00:00Z'});
 assert.equal(result.ok,true);assert.equal(result.records[0].status,'CLOSED');assert.equal(active.status,'ACTIVE');
});
test('cannot close OP12 wintering or without real confirmed physical stage',()=>{
 const active={...closed,status:'ACTIVE',events:[{...closed.events[0],evidence:{...closed.events[0].evidence,operationId:'OP-12'}}]};
 assert.equal(L.planCloseCycle([active],{userConfirmed:true,confirmationRef:'note',id:'e1',cycleId:'c1',occurredAt:'2026-11-20T12:00:00Z'}).ok,false);
});
test('falsified CLOSED record cannot authorize new season',()=>{
 const forged=structuredClone(closed);forged.events[0].evidence.stagedWithPhysicalState=false;
 assert.equal(L.planNewCycle([forged],{hiveId:'h1',id:'c2',occurredAt:'2026-11-21T12:00:00Z'}).ok,false);
});

test('imported pending baseline cannot close or authorize new cycle even with terminal record',()=>{const pending={...closed,migrationStatus:'BASELINE_IMPORTED_PENDING_ACTIVATION'};assert.equal(L.planNewCycle([pending],{hiveId:'h1',id:'c2',occurredAt:'2026-11-21T12:00:00Z'}).ok,false);const active={...pending,status:'ACTIVE',events:[closed.events[0]]};assert.equal(L.planCloseCycle([active],{userConfirmed:true,confirmationRef:'witness',id:'close',cycleId:'c1',occurredAt:'2026-11-21T12:00:00Z'}).ok,false)});

test('v2 compat coordinator is accepted only when all completed stages have physical history',()=>{
 const cycle={modelVersion:2,id:'c1',hiveId:'h1',cycleNumber:1,status:'ACTIVE',events:[
  {id:'physical-split',type:'STAGE_CONFIRMED',occurredAt:'2026-11-20T10:00:00Z',evidence:{operationId:'OP-04'}},
  {id:'physical-mesh',type:'STAGE_CONFIRMED',occurredAt:'2026-11-21T10:00:00Z',evidence:{operationId:'OP-05'}}
 ],compatProcess:{id:'c1',hiveId:'h1',modelVersion:1,state:{operations:[{operationId:'OP-04',status:'DONE'},{operationId:'OP-05',status:'DONE'}]}}};
 assert.deepEqual(L.inspect([cycle]),[]);
 const missing=structuredClone(cycle);missing.events.pop();
 assert.ok(L.inspect([missing]).some(e=>e.code==='season_compat_stages_unproven'));
 const corrupted=structuredClone(cycle);corrupted.compatProcess.state.operations[1].status='IN_PROGRESS';
 assert.ok(L.inspect([corrupted]).some(e=>e.code==='season_compat_process_invalid'));
 const none=structuredClone(cycle);delete none.compatProcess;
 assert.ok(L.inspect([none]).some(e=>e.code==='season_compat_process_missing'));
});
