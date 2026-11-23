import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};new Function('window',readFileSync(new URL('../js/sectional-season-ledger-v2.js',import.meta.url),'utf8'))(w);
const L=w.PasekaSectionalSeasonLedgerV2;
const closed={modelVersion:2,id:'c1',hiveId:'h1',cycleNumber:1,status:'CLOSED',events:[{id:'e1',type:'CYCLE_CLOSED',occurredAt:'2026-11-20T12:00:00Z',evidence:{reason:'confirmed merge',confirmedBy:'user'}}]};
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
