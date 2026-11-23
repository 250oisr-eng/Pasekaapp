import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const window={};
for(const file of ['sectional-season-ledger-v2.js','sectional-season-evidence-v2.js'])new Function('window',readFileSync(new URL('../js/'+file,import.meta.url),'utf8'))(window);
const ledger=window.PasekaSectionalSeasonLedgerV2,ev=window.PasekaSectionalSeasonEvidenceV2;
const layout={id:'l1',hiveId:'h1',mode:'SIDE_BY_SIDE',sections:[{id:'s1',familyId:'f1',broodBodyIds:['b1']}],honeyStack:{bodyIds:['honey1']}};
const state=()=>({hives:[{id:'h1',profileId:'sectional-multiqueen-v1'}],sectionalLayouts:[structuredClone(layout)],equipmentInventory:{bodies:{b1:{frames:[{frameId:'r1'}]},honey1:{frames:[{frameId:'r2'}]}}},families:[{id:'f1'}],queens:[{id:'q1',familyId:'f1'}]});
const fresh=()=>[{modelVersion:2,id:'c1',hiveId:'h1',cycleNumber:1,status:'ACTIVE',events:[]}];
const request=()=>({cycleId:'c1',hiveId:'h1',operationId:'OP-08',eventId:'event-1',occurredAt:'2026-11-23T10:00:00Z',userConfirmed:true,confirmedBy:'beekeeper',physicalCommitId:'durable-save-1'});
const deps={ledger,inspectBefore:()=>[],inspectAfter:()=>[]};
test('snapshot keeps physical IDs and copies without mutation',()=>{
 const s=state(),snap=ev.physicalSnapshot(s,'h1');
 assert.equal(snap.ok,true);s.equipmentInventory.bodies.b1.frames.pop();
 assert.equal(snap.snapshot.bodyInventory.b1.frames.length,1);
});
test('confirmed post-commit physical change adds chained historical snapshots without overwriting input',()=>{
 const before=state(),after=structuredClone(before),rows=fresh();
 after.sectionalLayouts[0].honeyStack.bodyIds=[];const ret=ev.appendCommittedStage(before,after,rows,request(),deps);
 assert.equal(ret.ok,true);assert.equal(rows[0].events.length,0);
 assert.deepEqual(ev.inspectStages(ret.records),[]);
 assert.equal(ret.event.evidence.before.layout.honeyStack.bodyIds.length,1);
 assert.equal(ret.event.evidence.after.layout.honeyStack.bodyIds.length,0);
});
test('reject unchanged physical state, no confirmation, no validators',()=>{
 const a=state(),r=request();assert.equal(ev.appendCommittedStage(a,a,fresh(),r,deps).ok,false);
 const b=structuredClone(a);b.equipmentInventory.bodies.b1.frames.push({frameId:'new'});
 assert.equal(ev.appendCommittedStage(a,b,fresh(),{...r,userConfirmed:false},deps).ok,false);
 assert.equal(ev.appendCommittedStage(a,b,fresh(),r,{}).ok,false);
});
test('reject body references missing from actual inventory',()=>{
 const a=state(),b=structuredClone(a);b.sectionalLayouts[0].honeyStack.bodyIds=['unknown'];
 assert.equal(ev.appendCommittedStage(a,b,fresh(),request(),deps).error,'snapshot_body_missing');
});
test('reject corrupt history and overlapping snapshot chain',()=>{
 const a=state(),b=structuredClone(a);b.equipmentInventory.bodies.b1.frames.push({frameId:'new'});
 const r=ev.appendCommittedStage(a,b,fresh(),request(),deps);assert.equal(r.ok,true);
 const c=structuredClone(b);c.equipmentInventory.bodies.b1.frames.push({frameId:'new2'});
 const mismatch=ev.appendCommittedStage(a,c,r.records,{...request(),eventId:'event-2',occurredAt:'2026-11-23T11:00:00Z'},deps);
 assert.equal(mismatch.error,'stage_prior_snapshot_mismatch');
 const tamper=structuredClone(r.records);tamper[0].events[0].evidence.physicalCommitted=false;
 assert.equal(ev.inspectStages(tamper).some(x=>x.code==='stage_evidence_invalid'),true);
});
test('only valid sectional profile can enter historical ledger',()=>{
 const a=state();a.hives[0].profileId='farrar';assert.equal(ev.physicalSnapshot(a,'h1').error,'snapshot_profile_invalid');
});
