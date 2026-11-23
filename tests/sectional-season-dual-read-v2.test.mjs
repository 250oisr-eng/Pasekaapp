import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};for(const f of ['sectional-season-ledger-v2.js','sectional-season-dual-read-v2.js'])new Function('window',readFileSync(new URL('../js/'+f,import.meta.url),'utf8'))(w);
const L=w.PasekaSectionalSeasonLedgerV2,D=w.PasekaSectionalSeasonDualReadV2,deps={ledger:L};
const legacy={modelVersion:1,id:'legacy1',hiveId:'h1',state:{operations:[{operationId:'OP-07',evidence:{honeyBodyIds:['one']}}]}};
test('old state read-only preview retains original evidence and never edits data',()=>{
 const state={sectionalTechProcesses:[structuredClone(legacy)]},before=structuredClone(state),view=D.readView(state,deps);
 assert.equal(view.ok,true);assert.equal(view.readOnly,true);
 assert.deepEqual(state,before);assert.deepEqual(view.records[0].legacy.original,legacy);
});
test('unrelated new hive cycle and legacy hive can coexist',()=>{
 const state={sectionalTechProcesses:[legacy],sectionalSeasonCycles:[{modelVersion:2,id:'new',hiveId:'h2',cycleNumber:1,status:'ACTIVE',events:[]}]};
 const result=D.readView(state,deps);assert.equal(result.ok,true);assert.equal(result.records.length,2);
});
test('v2 copy of legacy with exact provenance is recognized without double representation',()=>{
 const preview=L.previewV1([legacy]);const state={sectionalTechProcesses:[legacy],sectionalSeasonCycles:preview.records};
 assert.equal(D.readView(state,deps).records.length,1);
});
test('tampered v1 original in v2 is rejected and old data unchanged',()=>{
 const copy=L.previewV1([legacy]).records[0];copy.legacy.original.state.operations[0].evidence.honeyBodyIds=['forged'];
 const state={sectionalTechProcesses:[legacy],sectionalSeasonCycles:[copy]},before=structuredClone(state);
 assert.equal(D.readView(state,deps).ok,false);assert.deepEqual(state,before);
});
test('missing legacy provenance, wrong shape and duplicate old records fail closed',()=>{
 const newRecord={modelVersion:2,id:'new',hiveId:'h1',cycleNumber:1,status:'ACTIVE',events:[]};
 assert.equal(D.readView({sectionalTechProcesses:[legacy],sectionalSeasonCycles:[newRecord]},deps).ok,false);
 assert.equal(D.readView({sectionalTechProcesses:{},sectionalSeasonCycles:[]},deps).ok,false);
 assert.equal(D.readView({sectionalTechProcesses:[legacy,legacy],sectionalSeasonCycles:[]},deps).ok,false);
});
