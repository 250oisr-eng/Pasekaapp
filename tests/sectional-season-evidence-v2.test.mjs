import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const window={};
for(const file of ['sectional-season-ledger-v2.js','sectional-season-evidence-v2.js'])new Function('window',readFileSync(new URL('../js/'+file,import.meta.url),'utf8'))(window);
const ledger=window.PasekaSectionalSeasonLedgerV2,ev=window.PasekaSectionalSeasonEvidenceV2;
const layout={id:'l1',hiveId:'h1',mode:'SIDE_BY_SIDE',sections:[{id:'s1',familyId:'f1',broodBodyIds:['b1']}],honeyStack:{bodyIds:['honey1']}};
const state=()=>({hives:[{id:'h1',profileId:'sectional-multiqueen-v1'}],sectionalLayouts:[structuredClone(layout)],equipmentInventory:{bodies:{b1:{frames:[{frameId:'r1'}]},honey1:{frames:[{frameId:'r2'}]}}},families:[{id:'f1'}],queens:[{id:'q1',familyId:'f1'}]});
const fresh=()=>[{modelVersion:2,id:'c1',hiveId:'h1',cycleNumber:1,status:'ACTIVE',events:[]}];
const request=()=>({cycleId:'c1',hiveId:'h1',operationId:'OP-08',eventId:'event-1',occurredAt:'2026-11-23T10:00:00Z',userConfirmed:true,confirmedBy:'beekeeper',transactionId:'durable-save-1'});
const deps={ledger,inspectBefore:()=>[],inspectAfter:()=>[],validateTransition:()=>[]};
test('snapshot keeps physical IDs and copies without mutation',()=>{
 const s=state(),snap=ev.physicalSnapshot(s,'h1');
 assert.equal(snap.ok,true);s.equipmentInventory.bodies.b1.frames.pop();
 assert.equal(snap.snapshot.bodyInventory.b1.frames.length,1);
});
test('confirmed post-commit physical change adds chained historical snapshots without overwriting input',()=>{
 const before=state(),after=structuredClone(before),rows=fresh();
 after.sectionalLayouts[0].honeyStack.bodyIds=[];const ret=ev.stagePhysicalTransition(before,after,rows,request(),deps);
 assert.equal(ret.ok,true);assert.equal(rows[0].events.length,0);
 assert.deepEqual(ev.inspectStages(ret.records),[]);
 assert.equal(ret.event.evidence.before.layout.honeyStack.bodyIds.length,1);
 assert.equal(ret.event.evidence.after.layout.honeyStack.bodyIds.length,0);
});
test('reject unchanged physical state, no confirmation, no validators',()=>{
 const a=state(),r=request();assert.equal(ev.stagePhysicalTransition(a,a,fresh(),r,deps).ok,false);
 const b=structuredClone(a);b.equipmentInventory.bodies.b1.frames.push({frameId:'new'});
 assert.equal(ev.stagePhysicalTransition(a,b,fresh(),{...r,userConfirmed:false},deps).ok,false);
 assert.equal(ev.stagePhysicalTransition(a,b,fresh(),r,{}).ok,false);
});
test('reject body references missing from actual inventory',()=>{
 const a=state(),b=structuredClone(a);b.sectionalLayouts[0].honeyStack.bodyIds=['unknown'];
 assert.equal(ev.stagePhysicalTransition(a,b,fresh(),request(),deps).error,'snapshot_body_missing');
});
test('reject corrupt history and overlapping snapshot chain',()=>{
 const a=state(),b=structuredClone(a);b.equipmentInventory.bodies.b1.frames.push({frameId:'new'});
 const r=ev.stagePhysicalTransition(a,b,fresh(),request(),deps);assert.equal(r.ok,true);
 const c=structuredClone(b);c.equipmentInventory.bodies.b1.frames.push({frameId:'new2'});
 const mismatch=ev.stagePhysicalTransition(a,c,r.records,{...request(),eventId:'event-2',occurredAt:'2026-11-23T11:00:00Z'},deps);
 assert.equal(mismatch.error,'stage_prior_snapshot_mismatch');
 const tamper=structuredClone(r.records);tamper[0].events[0].evidence.stagedWithPhysicalState=false;
 assert.equal(ev.inspectStages(tamper).some(x=>x.code==='stage_evidence_invalid'),true);
});
test('only valid sectional profile can enter historical ledger',()=>{
 const a=state();a.hives[0].profileId='farrar';assert.equal(ev.physicalSnapshot(a,'h1').error,'snapshot_profile_invalid');
});

test('imported legacy cycle cannot be staged until activated after verified restore',()=>{
 const a=state(),b=structuredClone(a);b.equipmentInventory.bodies.b1.frames.push({frameId:'new'});
 const rows=fresh();rows[0].migrationStatus='BASELINE_IMPORTED_PENDING_ACTIVATION';
 rows[0].events=[{id:'baseline',type:'BASELINE_IMPORTED',occurredAt:'2026-11-22T09:00:00Z',evidence:{snapshot:ev.physicalSnapshot(a,'h1').snapshot,backupVerificationId:'verified-backup',restoreReplayVerified:true}}];
 assert.deepEqual(ev.inspectStages(rows),[]);
 assert.equal(ev.stagePhysicalTransition(a,b,rows,request(),deps).error,'stage_imported_cycle_not_activated');
 const activated=structuredClone(rows);activated[0].migrationStatus='ACTIVATED';
 assert.equal(ev.stagePhysicalTransition(a,b,activated,request(),deps).ok,true);
});
test('corrupt or mismatched imported baseline blocks future transitions',()=>{
 const a=state(),b=structuredClone(a);b.equipmentInventory.bodies.b1.frames.push({frameId:'new'});
 const rows=fresh();rows[0].migrationStatus='ACTIVATED';
 rows[0].events=[{id:'baseline',type:'BASELINE_IMPORTED',occurredAt:'2026-11-22T09:00:00Z',evidence:{snapshot:ev.physicalSnapshot(a,'h1').snapshot,backupVerificationId:'archive',restoreReplayVerified:true}}];
 rows[0].events[0].evidence.snapshot.layout.id='forged';
 assert.equal(ev.stagePhysicalTransition(a,b,rows,request(),deps).error,'stage_imported_baseline_mismatch');
 rows[0].events[0].evidence.backupVerificationId='';
 assert.ok(ev.inspectStages(rows).some(x=>x.code==='stage_imported_baseline_invalid'));
});
