import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};for(const f of ['sectional-season-ledger-v2.js','sectional-season-evidence-v2.js','sectional-season-dual-read-v2.js','sectional-season-migration-v2.js','sectional-season-migration-runtime-v2.js'])new Function('window',readFileSync(new URL('../js/'+f,import.meta.url),'utf8'))(w);
const runtime=w.PasekaSectionalSeasonMigrationRuntimeV2;
function fixture(){
 const state={meta:{revisionId:'r1',schemaVersion:15},hives:[{id:'h',profileId:'sectional-multiqueen-v1'}],sectionalLayouts:[{id:'l',hiveId:'h',profileId:'sectional-multiqueen-v1',mode:'SIDE_BY_SIDE',sections:[{id:'s',familyId:'f',broodBodyIds:['b']}]}],equipmentInventory:{bodies:{b:{id:'b',frames:[{frameId:'fr',history:[]}]}}},families:[{id:'f'}],queens:[{id:'q',familyId:'f'}],familyEvents:[],queenEvents:[],sectionalTechProcesses:[{modelVersion:1,id:'legacy',hiveId:'h',state:{operations:[]}}]};
 let db=structuredClone(state),seq=1,writes=0;
 const deps={ledger:w.PasekaSectionalSeasonLedgerV2,evidence:w.PasekaSectionalSeasonEvidenceV2,dualRead:w.PasekaSectionalSeasonDualReadV2,migration:w.PasekaSectionalSeasonMigrationV2,
  readMain:async()=>structuredClone(db),writeMainIfUnchanged:async(candidate,expected)=>{if(db.meta.revisionId!==expected)throw Error('conflict');db=structuredClone(candidate);writes++},
  makeRevisionId:()=> 'r'+(++seq),verifyFullArchiveAndReplay:async(source)=>({ok:true,restoreReplayVerified:true,includesOriginalMedia:true,originalRevisionId:source.meta.revisionId,verificationId:'verified:'+source.meta.revisionId}),inspectV1:()=>[],inspectPhysical:()=>[]};
 return {deps,source:state,getDB:()=>db,getWrites:()=>writes};
}
const importReq={occurredAt:'2026-11-23T12:00:00Z',userConfirmed:true};
test('verified v1 to v2 import and physical re-confirmation activation preserve original',async()=>{
 const f=fixture(),before=structuredClone(f.source),first=await runtime.importLegacy(importReq,f.deps);
 assert.equal(first.ok,true,JSON.stringify(first));assert.equal(first.phase,'IMPORTED_NOT_ACTIVATED');
 assert.equal(f.getWrites(),1);assert.deepEqual(f.source,before);
 assert.deepEqual(f.getDB().sectionalTechProcessesArchive,before.sectionalTechProcesses);
 assert.equal(f.getDB().sectionalSeasonCycles[0].migrationStatus,'BASELINE_IMPORTED_PENDING_ACTIVATION');
 const second=await runtime.activateLegacy({userConfirmed:true,physicalLayoutPersonallyVerified:true,confirmationRef:'witness-1'},f.deps);
 assert.equal(second.ok,true,JSON.stringify(second));assert.equal(second.phase,'ACTIVATED');assert.equal(f.getWrites(),2);
 assert.deepEqual(f.getDB().sectionalTechProcessesArchive,before.sectionalTechProcesses);
 assert.equal(f.getDB().sectionalSeasonCycles[0].migrationStatus,'ACTIVATED');
});
test('cannot import without verified original media and restore replay',async()=>{
 const f=fixture();f.deps.verifyFullArchiveAndReplay=async()=>({ok:true,restoreReplayVerified:true,includesOriginalMedia:false,originalRevisionId:'r1',verificationId:'x'});
 assert.equal((await runtime.importLegacy(importReq,f.deps)).ok,false);assert.equal(f.getWrites(),0);
});
test('cannot activate without personal physical confirmation',async()=>{
 const f=fixture();await runtime.importLegacy(importReq,f.deps);
 assert.equal((await runtime.activateLegacy({userConfirmed:true,confirmationRef:'x'},f.deps)).ok,false);assert.equal(f.getWrites(),1);
});
test('source revision mismatch and failed CAS never claim completed import',async()=>{
 const f=fixture();f.deps.writeMainIfUnchanged=async()=>{throw Error('conflict')};
 assert.equal((await runtime.importLegacy(importReq,f.deps)).ok,false);assert.equal(f.getWrites(),0);
});
test('tampered v1 archive cannot activate',async()=>{
 const f=fixture();await runtime.importLegacy(importReq,f.deps);const current=f.getDB();
 current.sectionalTechProcessesArchive[0].id='tampered';
 assert.equal((await runtime.activateLegacy({userConfirmed:true,physicalLayoutPersonallyVerified:true,confirmationRef:'witness'},f.deps)).ok,false);assert.equal(f.getWrites(),1);
});
test('cold-read mismatch reports uncertain commit, no fabricated rollback',async()=>{
 const f=fixture();const read=f.deps.readMain;let reads=0;
 f.deps.readMain=async()=>{const x=await read();if(++reads>1)x.meta.revisionId='incorrect';return x};
 assert.equal((await runtime.importLegacy(importReq,f.deps)).error,'migration_cold_read_mismatch_commit_uncertain');
 assert.equal(f.getWrites(),1);
});
