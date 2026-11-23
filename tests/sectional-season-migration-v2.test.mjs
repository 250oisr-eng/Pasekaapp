import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};for(const f of ['sectional-season-ledger-v2.js','sectional-season-evidence-v2.js','sectional-season-dual-read-v2.js','sectional-season-migration-v2.js'])new Function('window',readFileSync(new URL('../js/'+f,import.meta.url),'utf8'))(w);
const {PasekaSectionalSeasonLedgerV2:ledger,PasekaSectionalSeasonEvidenceV2:evidence,PasekaSectionalSeasonDualReadV2:dualRead,PasekaSectionalSeasonMigrationV2:migrate}=w;
const original=()=>({
 meta:{revisionId:'revision-1',schemaVersion:15},hives:[{id:'hive',profileId:'sectional-multiqueen-v1'}],
 sectionalLayouts:[{id:'layout1',hiveId:'hive',mode:'SIDE_BY_SIDE',sections:[{id:'s1',familyId:'family1',broodBodyIds:['body1']}]}],
 equipmentInventory:{bodies:{body1:{id:'body1',frames:[{frameId:'frame1',history:[]}]}}},families:[{id:'family1'}],queens:[{id:'queen1',familyId:'family1'}],
 sectionalTechProcesses:[{modelVersion:1,id:'legacy',hiveId:'hive',state:{operations:[{operationId:'OP-07',evidence:{bodyIds:['body1']}}]}}]
});
const req=()=>({expectedRevisionId:'revision-1',fullBackupVerified:true,restoreReplayVerified:true,backupVerificationId:'backup-verified-1',occurredAt:'2026-11-23T10:00:00Z'});
const deps={ledger,evidence,dualRead,inspectV1:()=>[],inspectPhysical:()=>[]};
test('migration candidate preserves full raw v1 original and original in memory',()=>{
 const before=original(),snapshot=structuredClone(before);
 const result=migrate.planMigration(before,req(),deps);
 assert.equal(result.ok,true);assert.equal(result.notPersisted,true);
 assert.equal(result.requiresAtomicCAS,true);
 assert.deepEqual(before,snapshot);
 assert.deepEqual(result.candidate.sectionalTechProcessesArchive,snapshot.sectionalTechProcesses);
 assert.deepEqual(result.candidate.sectionalSeasonCycles[0].legacy.original,snapshot.sectionalTechProcesses[0]);
 assert.equal(result.candidate.sectionalSeasonCycles[0].events[0].type,'BASELINE_IMPORTED');
 assert.equal(dualRead.readView(result.candidate,{ledger}).ok,true);
});
test('no full backup or restore replay prevents migration',()=>{
 assert.equal(migrate.planMigration(original(),{...req(),fullBackupVerified:false},deps).ok,false);
 assert.equal(migrate.planMigration(original(),{...req(),restoreReplayVerified:false},deps).ok,false);
});
test('revision conflict prevents migration',()=>{
 assert.equal(migrate.planMigration(original(),{...req(),expectedRevisionId:'obsolete'},deps).error,'migration_restore_gate_required');
});
test('failed physical inspection blocks candidate and cannot damage input',()=>{
 const state=original(),copy=structuredClone(state);
 assert.equal(migrate.planMigration(state,req(),{...deps,inspectPhysical:()=>[{code:'inventory_broken'}]}).ok,false);
 assert.deepEqual(state,copy);
});
test('corrupt archive provenance is rejected after migration',()=>{
 const result=migrate.planMigration(original(),req(),deps);
 const bad=structuredClone(result.candidate);
 bad.sectionalTechProcessesArchive[0].state.operations[0].evidence.bodyIds=['other'];
 assert.equal(dualRead.readView(bad,{ledger}).ok,false);
});
test('migration cannot silently overwrite existing v2 or archive',()=>{
 const old=original();old.sectionalSeasonCycles=[{modelVersion:2,id:'new',hiveId:'other',cycleNumber:1,status:'ACTIVE',events:[]}];
 assert.equal(migrate.planMigration(old,req(),deps).ok,false);
 const state=original();state.sectionalTechProcessesArchive=[structuredClone(state.sectionalTechProcesses[0])];
 assert.equal(migrate.planMigration(state,req(),deps).ok,false);
});
test('baseline missing physical body stops migration without exception',()=>{
 const state=original();delete state.equipmentInventory.bodies.body1;
 assert.equal(migrate.planMigration(state,req(),deps).error,'migration_baseline_invalid');
});
