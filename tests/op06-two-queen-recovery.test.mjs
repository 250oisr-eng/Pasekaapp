import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const sandbox={window:{}};
vm.runInNewContext(readFileSync(new URL('../js/op06-two-queen-recovery.js',import.meta.url),'utf8'),sandbox);
const {plan}=sandbox.window.PasekaOP06TwoQueenRecovery;
const sections=[
 {id:'L',position:'LEFT',queenState:'QUEENRIGHT'},
 {id:'C',position:'CENTER',queenState:'QUEENLESS'},
 {id:'R',position:'RIGHT',queenState:'QUEENRIGHT'}
];
const transfer=(frameId,fromSectionId,toSectionId='C')=>({frameId,fromSectionId,toSectionId,broodObserved:true,queenAbsentOnTransferredFrameConfirmed:true});
const input=()=>({sections:structuredClone(sections),queenlessSectionId:'C',transfers:[transfer('F1','L'),transfer('F2','R')],userConfirmed:true});
test('center queenless: keep mesh; no completion',()=>{
 const x=plan(input());assert.equal(x.ok,true);assert.equal(x.meshRule,'KEEP_EXISTING_MESH');
 assert.equal(x.operationCompleted,false);assert.equal(x.releaseAllowed,false);
});
for(const [position,id,donors] of [['LEFT','L',['C','R']],['RIGHT','R',['L','C']]]){
 test(position+' queenless: initial mesh rule only on boundary with center',()=>{
  const x=input();x.sections=x.sections.map(s=>({...s,queenState:s.id===id?'QUEENLESS':'QUEENRIGHT'}));
  x.queenlessSectionId=id;x.transfers=[transfer('F1',donors[0],id),transfer('F2',donors[1],id)];
  const r=plan(x);assert.equal(r.ok,true);assert.equal(r.meshRule,'REAPPLY_INITIAL_ISOLATION_RULE_AT_CENTER_EDGE');
  assert.equal(r.meshBoundary.betweenPositions[0],position);assert.equal(r.meshBoundary.betweenPositions[1],'CENTER');
 });
}
test('both frames may come from same queenright donor',()=>{
 const x=input();x.transfers[1].fromSectionId='L';assert.equal(plan(x).ok,true);
});
test('reject unobserved missing queen and unknown donor',()=>{
 const x=input();x.sections[1].queenState='UNKNOWN';assert.equal(plan(x).ok,false);
 x.sections[1].queenState='QUEENLESS';x.transfers[0].fromSectionId='C';assert.equal(plan(x).ok,false);
});
test('reject duplicate frame, no brood, queen safety omitted, no personal confirmation',()=>{
 const x=input();x.transfers[1].frameId='F1';assert.equal(plan(x).ok,false);
 x.transfers[1].frameId='F2';x.transfers[0].broodObserved=false;assert.equal(plan(x).ok,false);
 x.transfers[0].broodObserved=true;x.transfers[0].queenAbsentOnTransferredFrameConfirmed=false;assert.equal(plan(x).ok,false);
 x.transfers[0].queenAbsentOnTransferredFrameConfirmed=true;x.userConfirmed=false;assert.equal(plan(x).ok,false);
});
test('never infer new queen or mesh release date',()=>{
 const x=plan(input());assert.equal(x.queenRearingOutcome,'UNKNOWN');
 assert.equal(x.meshTiming,'REQUIRES_ACTUAL_OBSERVATION_AND_CONFIRMATION');
 assert.equal(x.readOnly,true);
});
