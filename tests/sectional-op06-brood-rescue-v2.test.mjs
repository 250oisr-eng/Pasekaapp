import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const host={window:{},structuredClone};
for(const filename of [
 'op06-two-queen-recovery.js','sectional-op06-brood-rescue-v2.js',
 'sectional-season-ledger-v2.js','sectional-season-evidence-v2.js',
 'sectional-season-operation-rules-v2.js','sectional-season-runtime-v2.js'
])vm.runInNewContext(readFileSync(new URL('../js/'+filename,import.meta.url),'utf8'),host);
const api=host.window.PasekaSectionalOP06BroodRescueV2;
const recovery=host.window.PasekaOP06TwoQueenRecovery;
const evidence=host.window.PasekaSectionalSeasonEvidenceV2;
const rules=host.window.PasekaSectionalSeasonOperationRulesV2;
const ledger=host.window.PasekaSectionalSeasonLedgerV2;
const runtime=host.window.PasekaSectionalSeasonRuntimeV2;
const locations=['left','middle','right'];
const timestamp='2026-11-21T13:00:00.000Z',now='2026-11-23T12:00:00.000Z';
const frame=(prefix,i)=>({frameId:prefix+'-'+i,frameUid:'uid-'+prefix+'-'+i,labelCode:null,history:[]});
function setup(absent='middle',withMesh=false){
 const sections=locations.map(position=>({id:'section-'+position,position,
  familyId:'family-'+position,broodBodyIds:['body-'+position],
  openings:['left','right'].map(suffix=>({id:'opening-'+position+'-'+suffix,bodyId:'body-'+position}))}));
 const connections=[
  {id:'connection-left',fromSectionId:'section-left',toSectionId:'section-middle',
   bufferCorridorPresent:true,openings:[
    {sectionId:'section-left',openingId:'opening-left-right',bodyId:'body-left'},
    {sectionId:'section-middle',openingId:'opening-middle-left',bodyId:'body-middle'}]},
  {id:'connection-right',fromSectionId:'section-middle',toSectionId:'section-right',
   bufferCorridorPresent:true,openings:[
    {sectionId:'section-middle',openingId:'opening-middle-right',bodyId:'body-middle'},
    {sectionId:'section-right',openingId:'opening-right-left',bodyId:'body-right'}]}
 ];
 const plugs=withMesh?connections.flatMap(c=>c.openings.map(x=>({
  itemId:'plug-'+x.openingId,openingId:x.openingId,bodyId:x.bodyId}))):[];
 const items=Object.fromEntries(plugs.map(p=>[p.itemId,{id:p.itemId,kind:'metalMeshPlug',
  location:{type:'hive',hiveId:'hive',openingId:p.openingId,bodyId:p.bodyId}}]));
 const bodies=Object.fromEntries(locations.map(position=>['body-'+position,{
  id:'body-'+position,kind:'brood',condition:'good',spec:{profileId:'sectional-multiqueen-v1',framesPerBox:6},
  frames:Array.from({length:6},(_,i)=>frame(position,i+1)),events:[],updatedAt:'2026-01-01T00:00:00.000Z'}]));
 const data={meta:{schemaVersion:15,revisionId:'revision-1'},hives:[{id:'hive',profileId:'sectional-multiqueen-v1'}],
  families:locations.map(position=>({id:'family-'+position,hive:'hive',queenIdentityStatus:position===absent?'unresolved':'identified'})),
  queens:[],familyEvents:[],queenEvents:[],sectionalTechProcesses:[],sectionalTechProcessesArchive:[],
  sectionalSeasonCycles:[{id:'cycle',hiveId:'hive',modelVersion:2,cycleNumber:1,status:'ACTIVE',events:[]}],
  sectionalLayouts:[{id:'layout',hiveId:'hive',profileId:'sectional-multiqueen-v1',
   mode:'SIDE_BY_SIDE',sections,technicalConnections:connections,temporaryQueenIsolation:plugs}],
  equipmentInventory:{bodies,items,events:[],itemEvents:[]},auditLog:[]};
 const lineage={getQueenPresenceStatus:(s,familyId)=>familyId==='family-'+absent?'confirmed_absent':'confirmed_present'};
 return {data,lineage};
}
function req(absent='middle'){
 const donor=locations.filter(x=>x!==absent);
 return {operationId:'OP-06-RESCUE',hiveId:'hive',cycleId:'cycle',
  eventId:'season-stage-event',transactionId:'transaction',confirmedBy:'beekeeper',
  occurredAt:timestamp,userConfirmed:true,actualWorkConfirmed:true,
  actualFrameExchangeConfirmed:true,meshConfigurationPersonallyVerified:true,
  queenlessSectionId:'section-'+absent,toBodyId:'body-'+absent,
  transfers:donor.map((position,i)=>({frameId:position+'-'+(i+1),
   fromSectionId:'section-'+position,fromBodyId:'body-'+position,
   toSectionId:'section-'+absent,broodObserved:true,
   freshEggsObserved:true,queenAbsentOnTransferredFrameConfirmed:true,
   replacementFrameId:absent+'-'+(i+1)}))};
}
function runner(input,request,deps={}){
 let n=0;const makeId=()=> 'proof-id-'+(++n);
 return api.stage(input,request,{now,makeId,recovery,lineage:deps.lineage,
  inspectState:deps.inspectState||(()=>[])});
}
test('center: four actual frames exchanged, identities retained, all histories append-only',()=>{
 const {data,lineage}=setup(),request=req(),old=structuredClone(data);
 const x=runner(data,request,{lineage});
 assert.equal(x.ok,true,JSON.stringify(x));
 assert.equal(x.operationCompleted,false);assert.equal(x.stagedOnly,true);
 assert.deepEqual(data,old,'no mutation before CAS');
 const after=x.draft.equipmentInventory.bodies;
 assert.deepEqual(after['body-middle'].frames.map(f=>f.frameId).slice(0,2),['left-1','right-2']);
 assert.equal(after['body-left'].frames[0].frameId,'middle-1');
 assert.equal(after['body-right'].frames[1].frameId,'middle-2');
 assert.equal(x.draft.equipmentInventory.events.length,4);
 assert.equal(x.draft.auditLog.length,1);
 assert.equal(x.draft.auditLog[0].operationId,'OP-06-RESCUE');
 assert.deepEqual(x.draft.sectionalSeasonCycles,old.sectionalSeasonCycles,'no invented DONE');
 assert.deepEqual(x.draft.queens,old.queens);
 assert.deepEqual(x.draft.families,old.families);
 assert.equal(after['body-middle'].frames.length,6);
 assert.equal(x.draft.equipmentInventory.bodies['body-middle'].events.length,4);
 for(const id of ['left-1','right-2','middle-1','middle-2']){
  const f=Object.values(after).flatMap(b=>b.frames).find(f=>f.frameId===id);
  assert.equal(f.history.length,1);assert.equal(f.history[0].action,'sectional_op06_brood_rescue_exchange');
  assert.equal(f.frameUid,'uid-'+id);
 }
 const before=evidence.physicalSnapshot(old,'hive');
 const snapshot=evidence.physicalSnapshot(x.draft,'hive');
 assert.equal(before.ok,true);assert.equal(snapshot.ok,true);
 assert.deepEqual(rules.validate(before.snapshot,snapshot.snapshot,request),[]);
 const ev=evidence.stagePhysicalTransition(old,x.draft,old.sectionalSeasonCycles,request,{
  ledger,inspectBefore:()=>[],inspectAfter:()=>[],validateTransition:rules.validate});
 assert.equal(ev.ok,true,JSON.stringify(ev));
 assert.equal(ev.event.evidence.operationId,'OP-06-RESCUE');
 assert.equal(ledger.inspect(ev.records).length,0);
 assert.equal(evidence.inspectStages(ev.records).length,0);
 assert.deepEqual(ev.records[0].events.map(e=>e.type),['STAGE_CONFIRMED']);
 assert.equal(ev.records[0].events[0].evidence.operationId,'OP-06-RESCUE');
});
test('one matron donor can supply both frames with two receiver displacements',()=>{
 const {data,lineage}=setup();const request=req();
 request.transfers[1]={...request.transfers[1],frameId:'left-2',
  fromBodyId:'body-left',fromSectionId:'section-left'};
 const result=runner(data,request,{lineage});assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.draft.equipmentInventory.bodies['body-left'].frames[1].frameId,'middle-2');
 assert.equal(result.draft.equipmentInventory.bodies['body-right'].frames[1].frameId,'right-2');
});
test('edge rescue requires exact registered mesh rather than a checkbox',()=>{
 const {data,lineage}=setup('left',false);
 assert.equal(runner(data,req('left'),{lineage}).error,'op06_rescue_edge_mesh_not_physically_registered');
 const ready=setup('left',true);
 const result=runner(ready.data,req('left'),{lineage:ready.lineage});
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.draft.sectionalLayouts[0].temporaryQueenIsolation.length,4);
});
test('refuse unconfirmed physical work, eggs, missing transfer and duplicate displacement',()=>{
 const {data,lineage}=setup();const request=req();
 request.actualWorkConfirmed=false;assert.equal(runner(data,request,{lineage}).ok,false);
 request.actualWorkConfirmed=true;request.transfers[0].freshEggsObserved=false;
 assert.equal(runner(data,request,{lineage}).ok,false);
 request.transfers[0].freshEggsObserved=true;request.transfers[1].replacementFrameId='middle-1';
 assert.equal(runner(data,request,{lineage}).ok,false);
 request.transfers[1].replacementFrameId='middle-2';request.transfers[1].frameId='unknown';
 assert.equal(runner(data,request,{lineage}).ok,false);
});
test('do not accept stale or ambiguous inventory and do not modify source on failure',()=>{
 const {data,lineage}=setup(),original=structuredClone(data);
 data.equipmentInventory.bodies['body-left'].frames.push(frame('left',7));
 const result=runner(data,req(),{lineage});
 assert.equal(result.ok,false);
 assert.equal(data.equipmentInventory.bodies['body-left'].frames.length,7);
 assert.equal(original.equipmentInventory.bodies['body-left'].frames.length,6);
});
test('tampering with frame history after staging invalidates physical rule',()=>{
 const {data,lineage}=setup(),request=req(),x=runner(data,request,{lineage});
 assert.equal(x.ok,true);
 const before=evidence.physicalSnapshot(data,'hive').snapshot;
 const after=evidence.physicalSnapshot(x.draft,'hive').snapshot;
 after.bodyInventory['body-middle'].frames[0].history[0].operationId='OP-99';
 assert.ok(rules.validate(before,after,request).some(x=>x.code==='rescue_frame_provenance_invalid'));
});
test('external-archive gate is mandatory even when an executor is available',async()=>{
 const {data,lineage}=setup(),request=req();
 const denied=await runtime.commit(request,{
  readMain:async()=>structuredClone(data),writeMainIfUnchanged:async()=>{throw Error('must not write')},
  verifyFullArchiveAndReplay:async()=>({ok:true,restoreReplayVerified:true,includesOriginalMedia:true,externalCopyConfirmed:false,verificationScope:'LOCAL_ONLY',originalRevisionId:'revision-1',verificationId:'fake'}),
  validateState:()=>[],makeRevisionId:()=> 'new-revision',
  preparePersistentSnapshot:async()=>{throw Error('must not prepare')},
  transaction:{},evidence,ledger,dualRead:{},rules,executors:{'OP-06-RESCUE':()=>runner(data,request,{lineage})}});
 assert.equal(denied.error,'season_runtime_verified_full_archive_required');
});
