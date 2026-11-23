import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};new Function('window',readFileSync(new URL('../js/sectional-season-op04-07-bridge-v2.js',import.meta.url),'utf8'))(w);
const api=w.PasekaSectionalSeasonOP04To07BridgeV2;
function fixture(){
 const source={meta:{schemaVersion:15},sectionalTechProcesses:[],sectionalTechProcessesArchive:[],sectionalSeasonCycles:[{id:'cycle1',hiveId:'h',modelVersion:2,cycleNumber:1,status:'ACTIVE',events:[]}],sectionalLayouts:[{id:'l',hiveId:'h',profileId:'sectional-multiqueen-v1',mode:'SINGLE_FAMILY'}]};
 const at='2026-11-23T10:00:00Z';
 const request={cycleId:'cycle1',hiveId:'h',operationId:'OP-04',userConfirmed:true,occurredAt:at,layout:{id:'l',hiveId:'h',mode:'SIDE_BY_SIDE'},sourceFamilyId:'old',resultFamilies:[{id:'left'},{id:'middle'},{id:'right'}]};
 let called=0;
 const coordinator={
  inspect:()=>[],
  completeOP04:(state,req)=>{called++;state.sectionalTechProcesses=[{modelVersion:1,id:req.techProcessId,hiveId:req.hiveId,state:{operations:[{operationId:'OP-04',status:'IN_PROGRESS'}]}}];return {ok:true}},
  completeOP04SecondRow:(state,req)=>{called++;state.sectionalTechProcesses[0].state.operations[0].status='DONE';return {ok:true}},
  completeOP05:(state,req)=>{called++;state.sectionalTechProcesses[0].state.operations.push({operationId:'OP-05',status:'DONE'});return {ok:true}}
 };
 return {source,request,deps:{makeId:()=>String(++called),coordinator},called:()=>called};
}
test('first confirmed OP04 uses legacy coordinator only in transient clone',()=>{
 const f=fixture(),before=structuredClone(f.source),res=api.stage(f.source,f.request,f.deps);
 assert.equal(res.ok,true,JSON.stringify(res));assert.deepEqual(f.source,before);
 assert.deepEqual(res.draft.sectionalTechProcesses,[]);
 assert.equal(res.draft.sectionalSeasonCycles[0].compatProcess.id,'cycle1');
});
test('second physical OP04 row uses preserved compat state without re-running split',()=>{
 const f=fixture(),first=api.stage(f.source,f.request,f.deps);
 const second=api.stage(first.draft,{...f.request,actualSecondRowConfirmed:true},f.deps);
 assert.equal(second.ok,true,JSON.stringify(second));
 assert.equal(second.draft.sectionalSeasonCycles[0].compatProcess.state.operations[0].status,'DONE');
 assert.equal(second.draft.sectionalTechProcesses.length,0);
});
test('OP05 reuses compat process, not live legacy record',()=>{
 const f=fixture(),first=api.stage(f.source,f.request,f.deps);
 const second=api.stage(first.draft,{...f.request,actualSecondRowConfirmed:true},f.deps);
 const third=api.stage(second.draft,{...f.request,operationId:'OP-05'},f.deps);
 assert.equal(third.ok,true,JSON.stringify(third));assert.equal(third.draft.sectionalSeasonCycles[0].compatProcess.state.operations.at(-1).operationId,'OP-05');
});
test('confirmed two-queen OP06 remains blocked without known safe removal procedure',()=>{
 const f=fixture();assert.equal(api.stage(f.source,{...f.request,operationId:'OP-06',twoQueenOutcome:true},f.deps).ok,false);
});
test('archived v1 row blocks injection into active coordinator',()=>{
 const f=fixture();f.source.sectionalTechProcesses=[{hiveId:'h'}];assert.equal(api.stage(f.source,f.request,f.deps).ok,false);
});
test('unactivated migrated season cannot run physical coordinator',()=>{
 const f=fixture();f.source.sectionalSeasonCycles[0].migrationStatus='BASELINE_IMPORTED_PENDING_ACTIVATION';
 assert.equal(api.stage(f.source,f.request,f.deps).ok,false);
});
test('coordinator rejection preserves original and does not fabricate completion',()=>{
 const f=fixture(),before=structuredClone(f.source);f.deps.coordinator.completeOP04=()=>({ok:false,error:'invalid_layout'});
 assert.equal(api.stage(f.source,f.request,f.deps).ok,false);assert.deepEqual(f.source,before);
});
