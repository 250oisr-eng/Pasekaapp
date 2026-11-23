import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const sandbox={window:{}};
vm.runInNewContext(readFileSync(new URL('../js/op06-two-queen-recovery.js',import.meta.url),'utf8'),sandbox);
const {plan,planFromState}=sandbox.window.PasekaOP06TwoQueenRecovery;
const loc=['left','middle','right'];
const s=(queenless='middle')=>loc.map(position=>({id:'section-'+position,position,queenState:position===queenless?'QUEENLESS':'QUEENRIGHT'}));
const move=(frameId,from,to='section-middle')=>({frameId,fromSectionId:from,toSectionId:to,broodObserved:true,queenAbsentOnTransferredFrameConfirmed:true});
const input=()=>({sections:s(),queenlessSectionId:'section-middle',transfers:[move('F1','section-left'),move('F2','section-right')],userConfirmed:true});
test('canonical middle queenless: mesh remains, no completion',()=>{
 const x=plan(input());assert.equal(x.ok,true);assert.equal(x.meshRule,'KEEP_EXISTING_MESH');
 assert.equal(x.operationCompleted,false);assert.equal(x.releaseAllowed,false);
});
for(const position of ['left','right']){
 test(position+' queenless: use initial mesh rule at middle boundary',()=>{
  const x=input(),id='section-'+position,donors=loc.filter(p=>p!==position);
  x.sections=s(position);x.queenlessSectionId=id;
  x.transfers=[move('F1','section-'+donors[0],id),move('F2','section-'+donors[1],id)];
  const r=plan(x);assert.equal(r.ok,true);
  assert.equal(r.meshRule,'REAPPLY_INITIAL_ISOLATION_RULE_AT_CENTER_EDGE');
  assert.equal(r.meshBoundary.betweenPositions[0],position);
  assert.equal(r.meshBoundary.betweenPositions[1],'middle');
 });
}
test('two frames may come from same queenright donor',()=>{
 const x=input();x.transfers[1].fromSectionId='section-left';assert.equal(plan(x).ok,true);
});
test('fail closed for unknown absence, wrong donor, duplicate frame, brood, queen, missing confirmation',()=>{
 const x=input();
 x.sections[1].queenState='UNKNOWN';assert.equal(plan(x).ok,false);
 x.sections[1].queenState='QUEENLESS';x.transfers[0].fromSectionId='section-middle';assert.equal(plan(x).ok,false);
 x.transfers[0].fromSectionId='section-left';x.transfers[1].frameId='F1';assert.equal(plan(x).ok,false);
 x.transfers[1].frameId='F2';x.transfers[0].broodObserved=false;assert.equal(plan(x).ok,false);
 x.transfers[0].broodObserved=true;x.transfers[0].queenAbsentOnTransferredFrameConfirmed=false;assert.equal(plan(x).ok,false);
 x.transfers[0].queenAbsentOnTransferredFrameConfirmed=true;x.userConfirmed=false;assert.equal(plan(x).ok,false);
});
function state(queenless='middle'){
 const sections=loc.map(position=>({id:'section-'+position,position,familyId:'family-'+position,
   broodBodyIds:['body-'+position],openings:[{id:'opening-'+position,bodyId:'body-'+position}]}));
 const bodies=Object.fromEntries(loc.map(position=>['body-'+position,{
  id:'body-'+position,kind:'brood',condition:'good',
  spec:{profileId:'sectional-multiqueen-v1',framesPerBox:6},
  frames:Array.from({length:6},(_,i)=>({frameId:position+'-'+(i+1),history:[]}))
 }]));
 const connections=[
 {id:'c-left',fromSectionId:'section-left',toSectionId:'section-middle',
  bufferCorridorPresent:true,openings:[{openingId:'opening-left',bodyId:'body-left'},{openingId:'opening-middle',bodyId:'body-middle'}]},
 {id:'c-right',fromSectionId:'section-middle',toSectionId:'section-right',
  bufferCorridorPresent:true,openings:[{openingId:'opening-middle',bodyId:'body-middle'},{openingId:'opening-right',bodyId:'body-right'}]}
 ];
 const familyPresence=Object.fromEntries(loc.map(position=>['family-'+position,position===queenless?'confirmed_absent':'confirmed_present']));
 const data={hives:[{id:'hive',profileId:'sectional-multiqueen-v1'}],
  sectionalLayouts:[{id:'layout',hiveId:'hive',profileId:'sectional-multiqueen-v1',
   mode:'SIDE_BY_SIDE',sections,technicalConnections:connections,temporaryQueenIsolation:[]}],
  equipmentInventory:{bodies,items:{}}};
 const lineage={getQueenPresenceStatus:(state,familyId)=>familyPresence[familyId]};
 return {data,lineage};
}
function request(queenless='middle'){
 const donor=loc.filter(x=>x!==queenless);
 return {hiveId:'hive',queenlessSectionId:'section-'+queenless,toBodyId:'body-'+queenless,
  userConfirmed:true,transfers:[
   {frameId:donor[0]+'-1',fromBodyId:'body-'+donor[0],fromSectionId:'section-'+donor[0],
    broodObserved:true,queenAbsentOnTransferredFrameConfirmed:true},
   {frameId:donor[1]+'-2',fromBodyId:'body-'+donor[1],fromSectionId:'section-'+donor[1],
    broodObserved:true,queenAbsentOnTransferredFrameConfirmed:true}
  ]};
}
test('grounded middle recovery uses actual body/frame IDs and leaves state untouched',()=>{
 const {data,lineage}=state(),before=structuredClone(data);
 const r=planFromState(data,request(),{lineage});
 assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.meshInventoryAction,'DO_NOT_CHANGE');
 assert.equal(r.toBodyId,'body-middle');assert.equal(r.transfers.length,2);
 assert.equal(r.requiresFrameSlotReconciliation,true);assert.equal(r.operationCompleted,false);
 assert.equal(r.canPersist,false);assert.deepEqual(data,before);
});
for(const position of ['left','right']){
 test(position+' grounded edge recovery identifies exact physical connection',()=>{
  const {data,lineage}=state(position),r=planFromState(data,request(position),{lineage});
  assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.meshBoundary.connectionId,'c-'+position);
  assert.equal(r.meshInventoryAction,'RECONCILE_WITH_INITIAL_RULE');
  assert.equal(r.meshBoundary.betweenPositions[1],'middle');
 });
}
test('grounded plan rejects unverified absence and falsely claimed source frame',()=>{
 const {data,lineage}=state();
 const r=request();lineage.getQueenPresenceStatus=()=> 'unresolved';
 assert.equal(planFromState(data,r,{lineage}).ok,false);
 const {lineage:validLineage}=state();
 r.transfers[0].frameId='right-1';
 assert.equal(planFromState(data,r,{lineage:validLineage}).ok,false);
});
test('grounded plan rejects different profile, duplicated IDs and tampered equipment',()=>{
 const {data,lineage}=state(),req=request();
 data.hives[0].profileId='farrar';assert.equal(planFromState(data,req,{lineage}).ok,false);
 data.hives[0].profileId='sectional-multiqueen-v1';
 data.equipmentInventory.bodies['body-right'].frames[0].frameId='left-1';
 assert.equal(planFromState(data,req,{lineage}).ok,false);
});
test('no invented mesh schedule, storage action or queen result',()=>{
 const {data,lineage}=state('left'),r=planFromState(data,request('left'),{lineage});
 assert.equal(r.meshTiming,'REQUIRES_ACTUAL_OBSERVATION_AND_CONFIRMATION');
 assert.equal(r.queenRearingOutcome,'UNKNOWN');
 assert.equal(r.readOnly,true);assert.equal(r.releaseAllowed,false);
});
test('malformed transfer does not crash',()=>{const {data,lineage}=state();const r=request();r.transfers=[null,r.transfers[1]];assert.equal(planFromState(data,r,{lineage}).ok,false)});


test('recovery wizard offers only a read-only review when two statuses are confirmed',()=>{
 const {data,lineage}=state('middle');
 sandbox.window.PasekaFamilyLineage=lineage;
 vm.runInNewContext(readFileSync(new URL('../js/sectional-season-operations-wizard-v2.js',import.meta.url),'utf8'),sandbox);
 const w=sandbox.window.PasekaSeasonOperationsWizardV2;
 const html=w.op06RecoveryHTML(data,'hive');
 assert.match(html,/data-op06-recovery/);
 assert.match(html,/data-op06-brood="0"/);
 assert.match(html,/data-op06-queen-safe="1"/);
 assert.match(html,/Проверить восстановление \(без записи\)/);
 assert.doesNotMatch(html,/type="submit"/);
 const noQueenProof=Object.assign({},lineage,{getQueenPresenceStatus:()=> 'unresolved'});
 sandbox.window.PasekaFamilyLineage=noQueenProof;
 const missing=w.op06RecoveryHTML(data,'hive');
 assert.match(missing,/Сначала подтвердите/);
 assert.doesNotMatch(missing,/data-op06-check/);
});
test('wizard read-only button builds an inventory-grounded request and never changes state',()=>{
 const {data,lineage}=state('left'),original=structuredClone(data);
 sandbox.window.PasekaFamilyLineage=lineage;
 if(!sandbox.window.PasekaSeasonOperationsWizardV2)
  vm.runInNewContext(readFileSync(new URL('../js/sectional-season-operations-wizard-v2.js',import.meta.url),'utf8'),sandbox);
 const w=sandbox.window.PasekaSeasonOperationsWizardV2;
 const donors=[{frameId:'middle-1',fromBodyId:'body-middle',fromSectionId:'section-middle'},
 {frameId:'right-2',fromBodyId:'body-right',fromSectionId:'section-right'}];
 const panel={querySelector(sel){
  const donor=sel.match(/^\[data-op06-donor="([01])"\]$/);
  if(donor){const d=donors[Number(donor[1])];return {value:d.frameId,selectedOptions:[{getAttribute:k=>
    k==='data-from-body'?d.fromBodyId:k==='data-from-section'?d.fromSectionId:null}]};}
  if(sel==='[data-op06-target]')return {value:'body-left'};
  if(sel==='[data-op06-confirm]')return {checked:true};
  if(/^\[data-op06-(brood|queen-safe)="[01]"\]$/.test(sel))return {checked:true};
  return null;
 }};
 const r=w.checkOP06Recovery(data,'hive',panel);
 assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.meshBoundary.connectionId,'c-left');
 assert.equal(r.readOnly,true);assert.equal(r.canPersist,false);
 assert.deepEqual(data,original);
});
