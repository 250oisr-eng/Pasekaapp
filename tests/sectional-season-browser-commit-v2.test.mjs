import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};
for(const name of [
 'sectional-season-ledger-v2.js','sectional-season-evidence-v2.js',
 'sectional-season-dual-read-v2.js','sectional-season-operation-rules-v2.js',
 'sectional-season-transaction-v2.js','sectional-season-runtime-v2.js',
 'sectional-season-operations-wizard-v2.js','sectional-op08-honey.js',
 'sectional-op09-entrances.js','sectional-season-browser-commit-v2.js'
])new Function('window',readFileSync(new URL('../js/'+name,import.meta.url),'utf8'))(w);
const api=w.PasekaSectionalSeasonBrowserCommitV2;
const p='sectional-multiqueen-v1';
function setup(){
 const honey=id=>({id,kind:'honey',condition:'good',pairId:'p1',spec:{profileId:p,framesPerBox:10},
  frames:[{frameId:id+'fr',history:[]}],events:[]});
 const data={meta:{schemaVersion:15,revisionId:'r1'},hives:[{id:'h',profileId:p}],
  families:[1,2,3].map(i=>({id:'f'+i,hive:'h'})),
  queens:[],sectionalTechProcesses:[],sectionalTechProcessesArchive:[],
  sectionalSeasonCycles:[{modelVersion:2,id:'cycle',hiveId:'h',cycleNumber:1,status:'ACTIVE',events:[]}],
  sectionalLayouts:[{id:'layout',hiveId:'h',profileId:p,mode:'SIDE_BY_SIDE',
   sections:['left','middle','right'].map((position,i)=>({id:'s'+i,position,familyId:'f'+(i+1),broodBodyIds:['b'+i]})),
   honeyStack:{bodyIds:['h1','h2']}}],
  equipmentInventory:{bodies:{
   b0:{id:'b0',frames:[{frameId:'b0f',history:[]}]},
   b1:{id:'b1',frames:[{frameId:'b1f',history:[]}]},
   b2:{id:'b2',frames:[{frameId:'b2f',history:[]}]},
   h1:honey('h1'),h2:honey('h2')
  },items:{},events:[],itemEvents:[]},
  sectionalHoneyExtractions:[],sectionalSeasonalEntranceObservations:[]
 };
 let saved=structuredClone(data),n=0,writeCount=0,proofCalls=0;
 const deps={
  now:'2026-11-23T14:00:00Z',makeId:()=> 'unique-'+(++n),
  readMain:async()=>structuredClone(saved),
  writeMainIfUnchanged:async(state,rev)=>{
   if(saved.meta.revisionId!==rev)throw Error('CAS conflict');
   saved=structuredClone(state);writeCount++;return true;
  },
  verifyFullArchiveAndReplay:async(source)=>{proofCalls++;return {
   ok:true,restoreReplayVerified:true,includesOriginalMedia:true,
   externalCopyConfirmed:true,verificationScope:'SECOND_DEVICE_VERIFIED',
   originalRevisionId:source.meta.revisionId,
   verificationId:'SYNTHETIC_FIXTURE_NOT_REAL_DEVICE_PROOF'
  }},
  validateState:()=>[],makeRevisionId:()=> 'r2',
  preparePersistentSnapshot:async(s,old,rev)=>({...s,meta:{...s.meta,revisionId:rev}}),
  runtime:w.PasekaSectionalSeasonRuntimeV2,wizard:w.PasekaSeasonOperationsWizardV2,
  evidence:w.PasekaSectionalSeasonEvidenceV2,ledger:w.PasekaSectionalSeasonLedgerV2,
  dualRead:w.PasekaSectionalSeasonDualReadV2,rules:w.PasekaSectionalSeasonOperationRulesV2,
  transaction:w.PasekaSectionalSeasonTransactionV2,
  extraction:w.PasekaSectionalOP08Honey,entrances:w.PasekaSectionalOP09Entrances
 };
 return {data,deps,db:()=>saved,writes:()=>writeCount,proofs:()=>proofCalls};
}
function d(operationId,values){return {operationId,hiveId:'h',userConfirmed:true,occurredAt:'2026-11-22T13:00:00Z',values}}
const sections=['s0','s1','s2'].map(sectionId=>({sectionId,roundEntrances:'all_open',flatEntrance:'fully_open',personallyObserved:true}));
const op09=d('OP-09',{phase:'SUMMER_FULL',allSectionsObserved:true,sectionEntrances:sections});
const op08=d('OP-08',{sealedFrameIds:['h1fr','h2fr'],sealingObserved:true,
 actualExtraction:true,actualHoneyBodyReturn:true});
test('browser bridge refuses missing real backup verifier before any main read/write',async()=>{
 const f=setup();delete f.deps.verifyFullArchiveAndReplay;
 assert.equal((await api.commitWitnessed(op09,'r1',f.deps)).error,'browser_verified_storage_capabilities_missing');
 assert.equal(f.writes(),0);assert.equal(f.proofs(),0);
});
test('browser bridge rejects stale form revision and unknown operation before writes',async()=>{
 const f=setup();
 assert.equal((await api.commitWitnessed(op09,'wrong',f.deps)).error,'browser_stale_revision_refuse_to_write');
 assert.equal((await api.commitWitnessed(d('OP-14',{}),'r1',f.deps)).error,'browser_witnessed_operation_or_revision_missing');
 assert.equal(f.writes(),0);assert.equal(f.proofs(),0);
});
test('synthetic OP09 browser-to-real-recorder-to-atomic-CAS-to-cold-read',async()=>{
 const f=setup(),original=structuredClone(f.data);
 const result=await api.commitWitnessed(op09,'r1',f.deps);
 assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.durable,true);
 assert.equal(f.writes(),1);assert.equal(f.proofs(),1);
 assert.equal(f.db().meta.revisionId,'r2');
 assert.equal(f.db().sectionalSeasonCycles[0].events[0].evidence.operationId,'OP-09');
 assert.equal(f.db().sectionalSeasonalEntranceObservations.length,1);
 assert.equal(f.db().sectionalSeasonalEntranceObservations[0].sections.length,3);
 assert.deepEqual(f.data,original);
});
test('synthetic OP08 browser-to-real-extractor-to-atomic-CAS with unchanged frame identities',async()=>{
 const f=setup(),original=structuredClone(f.data);
 const result=await api.commitWitnessed(op08,'r1',f.deps);
 assert.equal(result.ok,true,JSON.stringify(result));assert.equal(f.writes(),1);
 assert.equal(f.db().sectionalHoneyExtractions.length,1);
 assert.equal(f.db().equipmentInventory.bodies.h1.frames[0].frameId,'h1fr');
 assert.equal(f.db().equipmentInventory.bodies.h1.frames[0].honeyState,'extracted');
 assert.equal(f.db().sectionalSeasonCycles[0].events[0].evidence.operationId,'OP-08');
 assert.deepEqual(f.data,original);
});
test('same-phone backup proof is insufficient and never writes',async()=>{
 const f=setup();f.deps.verifyFullArchiveAndReplay=async(source)=>({
  ok:true,restoreReplayVerified:true,includesOriginalMedia:true,
  externalCopyConfirmed:false,verificationScope:'LOCAL_ONLY',
  originalRevisionId:source.meta.revisionId,verificationId:'local'
 });
 const result=await api.commitWitnessed(op09,'r1',f.deps);
 assert.equal(result.error,'season_runtime_verified_full_archive_required');assert.equal(f.writes(),0);
});
test('actual physical confirmation of every entrance is mandatory',async()=>{
 const f=setup();
 const invalid=d('OP-09',{...op09.values,sectionEntrances:sections.map((s,i)=>i===1?{...s,personallyObserved:false}:s)});
 assert.equal((await api.commitWitnessed(invalid,'r1',f.deps)).error,'browser_wizard_preflight_rejected');
 assert.equal(f.writes(),0);
});
test('CAS fault cannot falsely complete an operation',async()=>{
 const f=setup();f.deps.writeMainIfUnchanged=async()=>{throw Error('quota exceeded')};
 const r=await api.commitWitnessed(op09,'r1',f.deps);
 assert.equal(r.ok,false);assert.equal(f.writes(),0);
});
