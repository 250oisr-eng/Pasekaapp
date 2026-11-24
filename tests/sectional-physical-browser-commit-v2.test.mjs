import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};
for(const file of [
 'sectional-season-ledger-v2.js','sectional-season-evidence-v2.js',
 'sectional-season-dual-read-v2.js','sectional-season-operation-rules-v2.js',
 'sectional-season-transaction-v2.js','sectional-season-runtime-v2.js',
 'sectional-season-physical-manifest-v2.js','sectional-physical-layout.js',
 'family-lineage.js','sectional-season-physical-executor-v2.js',
 'sectional-season-provenance-v2.js','sectional-season-op13-guided-v2.js',
 'sectional-physical-browser-commit-v2.js'
])new Function('window',readFileSync(new URL('../js/'+file,import.meta.url),'utf8'))(w);
const PROFILE='sectional-multiqueen-v1',api=w.PasekaSectionalOP13GuidedV2,
 bridge=w.PasekaSectionalPhysicalBrowserCommitV2;
function fixture(){
 const positions=['left','middle','right'],sections=[],stacks=[],items={},bodies={};
 const queenRefs={},connLeft=[],connRight=[];
 for(let i=0;i<3;i++){
  const position=positions[i],low='b'+(i*2+1),upper='b'+(i*2+2);
  const names=i===0?['ol1','ol2']:i===1?['om1L','om1R','om2L','om2R']:['or1','or2'];
  const openings=names.map((id,j)=>({id,bodyId:i===1?(j<2?low:upper):(j===0?low:upper),
   diameterMm:50}));
  sections.push({id:position,position,familyId:'f'+(i+1),
   broodBodyIds:[low,upper],upperBroodBodyId:upper,openings});
  stacks.push({id:'stack-'+position,position,sectionIds:[position],
   bottomItemId:'bottom-'+position,coverItemId:'cover-'+position,
   topRiserItemId:'riser-'+position,...(i===0?{feederItemId:'feeder-left'}:{})});
  for(const kind of ['bottom','cover','riser',...(i===0?['feeder']:[])]){
   const id=kind+'-'+position,real=kind==='riser'?'topRiser':kind;
   items[id]={id,kind:real,condition:'good',location:{type:'hive',hiveId:'h',stackId:'stack-'+position},events:[]};
  }
  for(const b of [low,upper])bodies[b]={id:b,kind:'brood',condition:'good',spec:{profileId:PROFILE,framesPerBox:6},
   frames:Array.from({length:6},(_,j)=>({frameId:b+'f'+j,history:[]})),events:[]};
  for(const o of openings){
   const id='tech-'+o.id;items[id]={id,kind:'technicalQueenExcluder',condition:'good',
    location:{type:'hive',hiveId:'h',bodyId:o.bodyId,openingId:o.id},events:[]};
   const record={sectionId:position,bodyId:o.bodyId,openingId:o.id,itemId:id};
   if(i===0||(i===1&&o.id.endsWith('L')))connLeft.push(record);
   else connRight.push(record);
  }
 }
 for(let i=1;i<=4;i++)items['p'+i]={id:'p'+i,kind:'plasticPlug',condition:'good',
  location:{type:'storage',label:'резерв'},events:[]};
 const state={meta:{revisionId:'r1',schemaVersion:15},hives:[{id:'h',profileId:PROFILE}],
  sectionalLayouts:[{id:'layout',hiveId:'h',schemaVersion:1,profileId:PROFILE,
   mode:'SIDE_BY_SIDE',broodRows:2,sections,stacks,
   technicalConnections:[{id:'left-middle',fromSectionId:'left',toSectionId:'middle',
     bufferCorridorPresent:true,openings:connLeft},
    {id:'middle-right',fromSectionId:'middle',toSectionId:'right',
     bufferCorridorPresent:true,openings:connRight}]}],
  sectionalSeasonCycles:[{id:'cycle',hiveId:'h',status:'ACTIVE'}],
  sectionalTechProcesses:[],
  families:positions.map((_,i)=>({id:'f'+(i+1),hive:'h',recordStatus:'active',
   colonyGroupId:'group',queenIdentityStatus:'identified',currentQueenId:'q'+(i+1)})),
  queens:positions.map((_,i)=>({id:'q'+(i+1),familyId:'f'+(i+1),status:'current'})),
  auditLog:[],familyEvents:[],queenEvents:[],
  equipmentInventory:{bodies,items,events:[],itemEvents:[]}};
 return state;
}
function winterFixture(){
 const state=fixture(),source=state.sectionalLayouts[0];
 const [strong,mid,weak]=source.sections;
 const section=(s,position,ids)=>({...structuredClone(s),id:position,position,
  broodBodyIds:ids,upperBroodBodyId:ids.at(-1),
  openings:s.openings.filter(o=>ids.includes(o.bodyId)).map(x=>structuredClone(x))});
 state.sectionalLayouts=[{id:'layout',hiveId:'h',profileId:PROFILE,schemaVersion:1,
  mode:'ALTERNATIVE_WINTERING_COLUMN',
  sections:[section(strong,'lower',['b1','b2']),section(mid,'middle',['b3']),section(weak,'upper',['b5'])],
  stacks:[{id:'stack-left',position:'column',sectionIds:['lower','middle','upper'],
   bottomItemId:'bottom-left',coverItemId:'cover-left',
   topRiserItemId:'riser-left',feederItemId:'feeder-left',
   boundaries:['lower-middle','middle-upper']}],
  meshDiaphragms:[{itemId:'d1',positionLabel:'lower-middle'},
   {itemId:'d2',positionLabel:'middle-upper'}]}];
 const inv=state.equipmentInventory;
 for(const id of ['b4','b6'])inv.bodies[id].storageLocation='реальный склад';
 for(const pos of ['middle','right'])for(const prefix of ['bottom','cover','riser'])
  inv.items[prefix+'-'+pos].location={type:'storage',label:'реальный склад'};
 for(const item of Object.values(inv.items))
  if(item.kind==='technicalQueenExcluder')item.location={type:'storage',label:'реальный склад'};
 for(const [id,positionLabel]of [['d1','lower-middle'],['d2','middle-upper']])
  inv.items[id]={id,kind:'meshDiaphragm',condition:'good',events:[],
   location:{type:'hive',hiveId:'h',stackId:'stack-left',positionLabel}};
 const familyIds=['f1','f2','f3'],at='2026-11-22T10:00:00Z';
 state.familyEvents=[{id:'winter',type:'alternative_wintering_configured',
  operationId:'OP-12',familyIds,hiveId:'h',techProcessId:'cycle',
  occurredAt:at,createdAt:at,
  diaphragmItemIds:['d1','d2'],
  diaphragmSnapshots:[{itemId:'d1',kind:'meshDiaphragm',condition:'good',
    hiveId:'h',positionLabel:'lower-middle'},
   {itemId:'d2',kind:'meshDiaphragm',condition:'good',
    hiveId:'h',positionLabel:'middle-upper'}],
  layout:[{familyId:'f1',position:'lower',bodyCount:2},
   {familyId:'f2',position:'middle',bodyCount:1},
   {familyId:'f3',position:'upper',bodyCount:1}]}];
 return state;
}
function select(){
 return {hiveId:'h',sourceRevisionId:'r1',
  placements:{
   left:{familyId:'f1',broodBodyIds:['b1','b2'],stackId:'stack-left',
    bottomItemId:'bottom-left',coverItemId:'cover-left',
    topRiserItemId:'riser-left',feederItemId:'feeder-left'},
   middle:{familyId:'f2',broodBodyIds:['b3','b4'],stackId:'stack-middle',
    bottomItemId:'bottom-middle',coverItemId:'cover-middle',
    topRiserItemId:'riser-middle',feederItemId:''},
   right:{familyId:'f3',broodBodyIds:['b5','b6'],stackId:'stack-right',
    bottomItemId:'bottom-right',coverItemId:'cover-right',
    topRiserItemId:'riser-right',feederItemId:''}
  },
  physicalOpeningsPersonallyChecked:true,
  openingClaims:{
   'left:b1:left':{openingId:'ol1',itemId:'tech-ol1',diameterMm:50},
   'left:b2:left':{openingId:'ol2',itemId:'tech-ol2',diameterMm:50},
   'middle:b3:left':{openingId:'om1L',itemId:'tech-om1L',diameterMm:50},
   'middle:b3:right':{openingId:'om1R',itemId:'tech-om1R',diameterMm:50},
   'middle:b4:left':{openingId:'om2L',itemId:'tech-om2L',diameterMm:50},
   'middle:b4:right':{openingId:'om2R',itemId:'tech-om2R',diameterMm:50},
   'right:b5:right':{openingId:'or1',itemId:'tech-or1',diameterMm:50},
   'right:b6:right':{openingId:'or2',itemId:'tech-or2',diameterMm:50}
  }
 };
}
function request(state,selected=select()){
 const p=api.prepare(state,selected);assert.equal(p.ok,true,JSON.stringify(p));
 return {...selected,occurredAt:'2026-11-23T10:00:00Z',
  userConfirmed:true,actualWorkConfirmed:true,actualSeparationConfirmed:true,
  bodyStorage:Object.fromEntries(p.removedBodyIds.map(id=>[id,'склад '+id])),
  itemStorage:Object.fromEntries(p.removedItemIds.map(id=>[id,'склад '+id])),
  confirmedBodyIds:p.changedBodyIds,confirmedItemIds:p.changedItemIds};
}
function setup(){
 const state=winterFixture();
 state.sectionalSeasonCycles[0]={...state.sectionalSeasonCycles[0],
  modelVersion:2,cycleNumber:1,events:[]};
 state.sectionalSeasonalEntranceObservations=[];
 state.sectionalHoneyExtractions=[];
 let db=structuredClone(state),writes=0,verifyCalls=0,created=0,readCount=0;
 const proof=async source=>{
  verifyCalls++;
  // Isolated synthetic test fixture ONLY. This is NOT a verified user backup.
  return {ok:true,restoreReplayVerified:true,includesOriginalMedia:true,
   externalCopyConfirmed:true,verificationScope:'SECOND_DEVICE_VERIFIED',
   originalRevisionId:source.meta.revisionId,verificationId:'SYNTHETIC_TEST_NOT_REAL_DEVICE'};
 };
 const deps={
  now:'2026-11-23T11:00:00Z',makeId:()=> 'bridge-event-'+(++created),
  readMain:async()=>{readCount++;return structuredClone(db)},
  writeMainIfUnchanged:async(state,rev)=>{
   if(db.meta.revisionId!==rev)throw Error('CAS conflict');
   db=structuredClone(state);writes++;
  },
  verifyFullArchiveAndReplay:proof,
  validateState:s=>[...w.PasekaSectionalPhysicalLayout.inspect(s),
   ...w.PasekaFamilyLineage.inspect(s)],
  makeRevisionId:()=> 'r2',
  preparePersistentSnapshot:async(s,oldRev,newRev)=>{
   const result=structuredClone(s);result.meta.revisionId=newRev;return result;
  },
  runtime:w.PasekaSectionalSeasonRuntimeV2,
  manifest:w.PasekaSectionalSeasonPhysicalManifestV2,
  guides:{'OP-13':w.PasekaSectionalOP13GuidedV2},
  physicalExecutor:w.PasekaSectionalSeasonPhysicalExecutorV2,
  layout:w.PasekaSectionalPhysicalLayout,
  lineage:w.PasekaFamilyLineage,
  provenance:w.PasekaSectionalSeasonProvenanceV2,
  equipmentItems:{place:(draft,m,newId,at)=>{
   const item=draft.equipmentInventory.items[m.itemId];
   if(!item)return {ok:false,error:'missing-item'};
   const from=structuredClone(item.location);item.location=structuredClone(m.location);
   const event={id:newId(),itemId:item.id,type:'moved',at,
    from,to:structuredClone(item.location)};
   item.events.push(event);draft.equipmentInventory.itemEvents.push(structuredClone(event));
   return {ok:true};
  }},
  transaction:w.PasekaSectionalSeasonTransactionV2,
  evidence:w.PasekaSectionalSeasonEvidenceV2,
  ledger:w.PasekaSectionalSeasonLedgerV2,
  dualRead:w.PasekaSectionalSeasonDualReadV2,
  rules:w.PasekaSectionalSeasonOperationRulesV2
 };
 return {input:{...request(state),operationId:'OP-13',queenObservationConfirmed:true},expectedRevision:'r1',deps,
  db:()=>db,writes:()=>writes,proofCalls:()=>verifyCalls,readCalls:()=>readCount,
  setDB:next=>{db=structuredClone(next)}};
}
test('OP11–14 adapter is never attached to live HTML or offline shell',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/sectional-physical-browser-commit-v2\.js/);
 assert.doesNotMatch(sw,/sectional-physical-browser-commit-v2\.js/);
 assert.deepEqual(bridge.writableOperations,['OP-11','OP-12','OP-13','OP-14']);
});
test('no actual archive verification capability means no runtime call or write',async()=>{
 const f=setup();delete f.deps.verifyFullArchiveAndReplay;
 const r=await bridge.commitWitnessed(f.input,f.expectedRevision,f.deps);
 assert.equal(r.error,'physical_bridge_missing_real_storage_or_restore_capabilities');
 assert.equal(f.writes(),0);assert.equal(f.proofCalls(),0);
});
test('stale form and unconfirmed move are rejected before backup verification or CAS',async()=>{
 const f=setup();const q={...f.input,expectedSourceRevisionId:'old'};
 assert.equal((await bridge.commitWitnessed(q,'r1',f.deps)).error,
  'physical_bridge_exact_user_input_and_revision_required');
 assert.equal(f.writes(),0);assert.equal(f.proofCalls(),0);
 const g=setup();g.input.confirmedBodyIds=[];
 assert.equal((await bridge.commitWitnessed(g.input,'r1',g.deps)).error,
  'physical_bridge_source_bound_manifest_invalid');
 assert.equal(g.writes(),0);assert.equal(g.proofCalls(),0);
});
test('incomplete full lineage blocks physical preflight before runtime',async()=>{
 const f=setup(),s=f.db();s.familyEvents[0].diaphragmSnapshots=[];
 f.setDB(s);
 assert.equal((await bridge.commitWitnessed(f.input,'r1',f.deps)).ok,false);
 assert.equal(f.writes(),0);assert.equal(f.proofCalls(),0);
});
test('OP13 cannot claim observed queens from generic physical-work confirmation',async()=>{
 const f=setup();delete f.input.queenObservationConfirmed;
 const result=await bridge.commitWitnessed(f.input,'r1',f.deps);
 assert.equal(result.error,'physical_bridge_op13_personal_queen_observation_required');
 assert.equal(f.proofCalls(),0);assert.equal(f.writes(),0);
});
test('synthetic same-device replay is NOT an acceptable independent full archive proof',async()=>{
 const f=setup();f.deps.verifyFullArchiveAndReplay=async source=>({
  ok:true,restoreReplayVerified:true,includesOriginalMedia:true,
  externalCopyConfirmed:false,verificationScope:'LOCAL_INDEPENDENT_INDEXEDDB_REPLAY',
  originalRevisionId:source.meta.revisionId,verificationId:'local-only'
 });
 const result=await bridge.commitWitnessed(f.input,'r1',f.deps);
 assert.equal(result.error,'season_runtime_verified_full_archive_required',JSON.stringify(result));
 assert.equal(f.writes(),0);
});
test('exact revision and synthetic contract proof allow real atomic runtime CAS and cold-read',async()=>{
 const f=setup(),original=structuredClone(f.db());
 const result=await bridge.commitWitnessed(f.input,'r1',f.deps);
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.durable,true);
 assert.equal(f.writes(),1);
 assert.equal(result.fullBackupVerificationId,'SYNTHETIC_TEST_NOT_REAL_DEVICE');
 assert.equal(f.db().meta.revisionId,'r2');
 assert.equal(f.db().familyEvents.filter(e=>e.type==='placement_changed').length,2);
 assert.equal(f.db().sectionalSeasonCycles[0].events.at(-1)?.type,'STAGE_CONFIRMED');
 assert.equal(original.meta.revisionId,'r1');
 assert.equal(original.sectionalLayouts[0].mode,'ALTERNATIVE_WINTERING_COLUMN');
});
test('source change between first read and runtime must fail without writing',async()=>{
 const f=setup(),read=f.deps.readMain;let n=0;
 f.deps.readMain=async()=>{
  const s=await read();n++;
  if(n===2)s.meta.revisionId='other-tab';
  return s;
 };
 const result=await bridge.commitWitnessed(f.input,'r1',f.deps);
 assert.equal(result.ok,false,JSON.stringify(result));
 assert.equal(f.writes(),0);
});
