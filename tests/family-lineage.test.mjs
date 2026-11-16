import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../js/family-lineage.js',import.meta.url),'utf8');
const windowRef={};
new Function('window',source)(windowRef);
const api=windowRef.PasekaFamilyLineage;
let sequence=0;
const makeId=()=> 'generated-'+(++sequence);
function baseState(){
 const families=[1,2,3].map(i=>({id:'f'+i,hive:'h1',name:'26-'+i,recordStatus:'active',colonyGroupId:'group-1',currentQueenId:'q'+i,queenIdentityStatus:'identified'}));
 const queens=[1,2,3].map(i=>({id:'q'+i,familyId:'f'+i,status:'current',code:'Q'+i}));
 return {meta:{schemaVersion:14},hives:[{id:'h1'}],families,queens,queenEvents:[],familyEvents:[],layouts:{},equipmentInventory:{items:{}}};
}
function children(prefix='child'){
 return [1,2,3].map(i=>({id:prefix+'-'+i,hive:'h1',name:prefix+' '+i}));
}
function addSpringMoves(state,techProcessId){
 state.equipmentInventory.bodies={b2:{id:'b2'},b2new:{id:'b2new'},b3:{id:'b3'},b3new:{id:'b3new'}};
 state.equipmentInventory.items={bottom2:{id:'bottom2',kind:'bottom',condition:'good',location:{type:'hive',hiveId:'h1',positionLabel:'separate-bottom-2'}},bottom3:{id:'bottom3',kind:'bottom',condition:'good',location:{type:'hive',hiveId:'h1',positionLabel:'separate-bottom-3'}}};
 assert.equal(api.recordPlacementChanged(state,{familyIds:['f1','f2','f3'],familyId:'f2',techProcessId,from:{position:'middle',bodyIds:['b2']},to:{position:'separate_bottom',bottomItemId:'bottom2',bodyIds:['b2','b2new']}},makeId,'2026-04-20T10:00:00.000Z').ok,true);
 assert.equal(api.recordPlacementChanged(state,{familyIds:['f1','f2','f3'],familyId:'f3',techProcessId,from:{position:'upper',bodyIds:['b3']},to:{position:'separate_bottom',bottomItemId:'bottom3',bodyIds:['b3','b3new']}},makeId,'2026-04-20T10:05:00.000Z').ok,true);
}
function addEarlyHoneyPhysicalSetup(state){
 const profileId='sectional-multiqueen-v1';
 Object.assign(state.equipmentInventory.bodies,{upper1:{id:'upper1',kind:'brood',condition:'good',spec:{profileId,framesPerBox:6}},upper2:{id:'upper2',kind:'brood',condition:'good',spec:{profileId,framesPerBox:6}},upper3:{id:'upper3',kind:'brood',condition:'good',spec:{profileId,framesPerBox:6}},honey1:{id:'honey1',kind:'honey',condition:'good',spec:{profileId,framesPerBox:10}},honey2:{id:'honey2',kind:'honey',condition:'good',spec:{profileId,framesPerBox:10}}});
 Object.assign(state.equipmentInventory.items,{'grid-left':{id:'grid-left',kind:'honeyQueenExcluder',condition:'good'},'grid-right':{id:'grid-right',kind:'honeyQueenExcluder',condition:'good'}});
 return {honeyBodyIds:['honey1','honey2'],honeyBodySnapshots:[{bodyId:'honey1',kind:'honey',condition:'good',framesPerBox:10,profileId,hiveId:'h1',installed:true},{bodyId:'honey2',kind:'honey',condition:'good',framesPerBox:10,profileId,hiveId:'h1',installed:true}],largeExcluderIds:['grid-left','grid-right'],largeExcluderSnapshots:[{itemId:'grid-left',kind:'honeyQueenExcluder',condition:'good',hiveId:'h1',installed:true,footprint:[{bodyId:'upper1',coverage:'FULL'},{bodyId:'upper2',coverage:'HALF'}]},{itemId:'grid-right',kind:'honeyQueenExcluder',condition:'good',hiveId:'h1',installed:true,footprint:[{bodyId:'upper2',coverage:'HALF'},{bodyId:'upper3',coverage:'FULL'}]}],upperBodyIds:['upper1','upper2','upper3']};
}

test('legacy records without familyEvents remain readable and are not assigned invented lineage',()=>{
 const state={meta:{schemaVersion:13},families:[{id:'f1',hive:'h1'}],queens:[]};
 assert.deepEqual(api.inspect(state),[]);
 assert.equal(state.families[0].colonyGroupId,undefined);
 assert.equal(state.families[0].recordStatus,undefined);
 assert.equal(state.familyEvents,undefined);
});

test('OP-04 split preserves source family and queen history while creating three new unresolved family identities',()=>{
 const state={...baseState(),families:[baseState().families[0]],queens:[baseState().queens[0]]};
 const result=api.applySplit(state,{sourceFamilyId:'f1',operationId:'OP-04',resultFamilies:children('op04')},makeId,'2026-04-01T10:00:00.000Z');
 assert.equal(result.ok,true);
 assert.equal(state.families.length,4);
 const source=state.families.find(x=>x.id==='f1');
 assert.equal(source.recordStatus,'historical');
 assert.equal(source.currentQueenId,null);
 assert.equal(source.queenIdentityStatus,'unresolved');
 assert.equal(state.queens[0].id,'q1');
 assert.equal(state.queens[0].familyId,'f1');
 assert.equal(state.queens[0].originFamilyId,'f1');
 assert.equal(state.queens[0].status,'unknown');
 const created=state.families.filter(x=>x.id.startsWith('op04-'));
 assert.equal(created.length,3);
 assert.ok(created.every(x=>x.recordStatus==='active'&&x.queenIdentityStatus==='unresolved'&&!x.currentQueenId));
 assert.equal(new Set(created.map(x=>x.colonyGroupId)).size,1);
 assert.equal(created[0].colonyGroupId,source.colonyGroupId);
 assert.deepEqual(result.event.candidateQueenIds,['q1']);
 assert.deepEqual(api.inspect(state),[]);
});

test('merge creates a new account identity and preserves all queen candidates without selecting a survivor',()=>{
 const state=baseState();
 const result=api.applyMerge(state,{
  sourceFamilyIds:['f1','f2','f3'],operationId:'OP-11',
  resultFamily:{id:'winter-result',hive:'h1',name:'Зимующая семья'}
 },makeId,'2026-10-15T10:00:00.000Z');
 assert.equal(result.ok,true);
 assert.equal(result.family.id,'winter-result');
 assert.equal(result.family.currentQueenId,null);
 assert.equal(result.family.queenIdentityStatus,'unresolved');
 assert.equal(result.family.recordStatus,'active');
 assert.deepEqual(result.event.candidateQueenIds,['q1','q2','q3']);
 assert.equal('survivorFamilyId' in result.event,false);
 assert.ok(state.families.filter(x=>['f1','f2','f3'].includes(x.id)).every(x=>x.recordStatus==='historical'&&!x.currentQueenId));
 assert.ok(state.queens.every(q=>q.status==='unknown'));
 assert.deepEqual(api.inspect(state),[]);
});

test('queen identity can be confirmed only from the merge candidate list and keeps originFamilyId',()=>{
 const state=baseState();
 api.applyMerge(state,{sourceFamilyIds:['f1','f2','f3'],resultFamily:{id:'merged',hive:'h1'}},makeId,'2026-10-15T10:00:00.000Z');
 const invalid=api.confirmQueenIdentity(state,{familyId:'merged',queenId:'invented'},makeId,'2026-10-20T10:00:00.000Z');
 assert.equal(invalid.ok,false);
 const confirmed=api.confirmQueenIdentity(state,{familyId:'merged',queenId:'q2'},makeId,'2026-10-20T10:00:00.000Z');
 assert.equal(confirmed.ok,true);
 assert.equal(confirmed.family.currentQueenId,'q2');
 assert.equal(confirmed.family.queenIdentityStatus,'identified');
 assert.equal(confirmed.queen.familyId,'merged');
 assert.equal(confirmed.queen.originFamilyId,'f2');
 assert.equal(state.queenEvents[0].type,'identity_confirmed');
 assert.deepEqual(api.inspect(state),[]);
});

test('alternative wintering requires three independent families, two real installed mesh diaphragms and 2+1+1 layout',()=>{
 const state=baseState();
 state.equipmentInventory.items={
  d1:{id:'d1',kind:'meshDiaphragm',condition:'good',location:{type:'hive',hiveId:'h1',positionLabel:'between-lower-middle'}},
  d2:{id:'d2',kind:'meshDiaphragm',condition:'good',location:{type:'hive',hiveId:'h1',positionLabel:'between-middle-upper'}}
 };
 const result=api.configureAlternativeWintering(state,{
  familyIds:['f1','f2','f3'],diaphragmItemIds:['d1','d2'],
  layout:[
   {familyId:'f1',position:'lower',bodyCount:2},
   {familyId:'f2',position:'middle',bodyCount:1},
   {familyId:'f3',position:'upper',bodyCount:1}
  ],techProcessId:'tech-12'
 },makeId,'2026-10-01T10:00:00.000Z');
 assert.equal(result.ok,true);
 assert.equal(state.familyEvents[0].type,'alternative_wintering_configured');
 assert.ok(state.families.every(x=>x.recordStatus==='active'));
 assert.equal(state.familyEvents[0].familyIds.length,3);
 assert.deepEqual(api.inspect(state),[]);
 const bad=api.configureAlternativeWintering(state,{
  familyIds:['f1','f2','f3'],diaphragmItemIds:['d1','missing'],
  layout:[{familyId:'f1',position:'lower',bodyCount:2},{familyId:'f2',position:'middle',bodyCount:1},{familyId:'f3',position:'upper',bodyCount:1}]
 },makeId,'2026-10-02T10:00:00.000Z');
 assert.equal(bad.ok,false);
});

test('OP-13 records two upper-family relocations without merging the three families',()=>{
 const state=baseState();addSpringMoves(state,'tech-13');
 const record={id:'tech-13',hiveId:'h1',state:{operations:[{operationId:'OP-12',status:'DONE'},{operationId:'OP-13',status:'DONE'}],sections:[{familyId:'f1',winteringPosition:'lower',bodyIds:['b1','b1new']},{familyId:'f2',winteringPosition:'separate_bottom',bodyIds:['b2','b2new']},{familyId:'f3',winteringPosition:'separate_bottom',bodyIds:['b3','b3new']}]}};
 assert.deepEqual(api.validateOperationEvidence(state,record,'OP-13'),[]);
 assert.ok(state.families.every(f=>f.recordStatus==='active'&&f.currentQueenId));
 assert.deepEqual(api.inspect(state),[]);
});

test('OP-14 cannot be complete without harvest, temporary merge and repeat split events',()=>{
 const state=baseState();addSpringMoves(state,'tech-14');const physicalSetup=addEarlyHoneyPhysicalSetup(state);
 const record={id:'tech-14',hiveId:'h1',state:{earlyHoneySetup:physicalSetup,operations:[{operationId:'OP-12',status:'DONE'},{operationId:'OP-13',status:'DONE'},{operationId:'OP-14',status:'DONE'}],sections:children('section').map((x,i)=>({...x,familyId:x.id,index:i+1}))}};
 assert.ok(api.validateOperationEvidence(state,record,'OP-14').some(x=>x.code==='OP14_EARLY_HONEY_HARVEST_CONFIRMATION_REQUIRED'));
 const missingPhysical=api.recordEarlyHoneyHarvest(state,{familyIds:['f1','f2','f3'],nestBodiesAfterHarvest:3,honeyBodiesRemoved:true,largeExcludersRemoved:true,harvestConfirmed:true,diaphragmsRemoved:true,familiesOnSeparateBottoms:true,techProcessId:'tech-14'},makeId,'2026-05-01T09:00:00.000Z');
 assert.equal(missingPhysical.ok,false);
 const harvested=api.recordEarlyHoneyHarvest(state,{
  familyIds:['f1','f2','f3'],nestBodiesAfterHarvest:3,physicalSetup,
  honeyBodiesRemoved:true,largeExcludersRemoved:true,harvestConfirmed:true,
  diaphragmsRemoved:true,familiesOnSeparateBottoms:true,techProcessId:'tech-14'
 },makeId,'2026-05-01T10:00:00.000Z');
 assert.equal(harvested.ok,true);
 const merged=api.applyMerge(state,{
  sourceFamilyIds:['f1','f2','f3'],operationId:'OP-14',scenario:'EARLY_HONEY',techProcessId:'tech-14',
  resultFamily:{id:'early-merge',hive:'h1'}
 },makeId,'2026-05-04T10:00:00.000Z');
 assert.equal(merged.ok,true);
 const split=api.applySplit(state,{
  sourceFamilyId:'early-merge',operationId:'OP-14',scenario:'EARLY_HONEY',techProcessId:'tech-14',
  resultFamilies:children('after-early-honey')
 },makeId,'2026-05-10T10:00:00.000Z');
 assert.equal(split.ok,true);
 record.state.sections=split.families.map((family,index)=>({familyId:family.id,index:index+1,queenIdentityStatus:'unresolved'}));
 assert.deepEqual(api.validateOperationEvidence(state,record,'OP-14'),[]);
 assert.deepEqual(api.inspect(state),[]);
});

test('family event integrity rejects broken references, duplicate IDs and survivorFamilyId',()=>{
 const state=baseState();
 state.familyEvents=[
  {id:'e1',type:'merge',sourceFamilyIds:['f1','missing'],resultFamilyIds:['f2'],candidateQueenIds:['q1'],occurredAt:'2026-10-01T10:00:00.000Z',survivorFamilyId:'f1'},
  {id:'e1',type:'unknown',sourceFamilyIds:[],resultFamilyIds:[],occurredAt:'invalid'}
 ];
 const codes=api.inspect(state).map(x=>x.code);
 assert.ok(codes.includes('family_event_id_duplicate'));
 assert.ok(codes.includes('family_event_family_missing'));
 assert.ok(codes.includes('forbidden_survivor_family_id'));
 assert.ok(codes.includes('family_event_type_invalid'));
 assert.ok(codes.includes('family_event_time_invalid'));
});

test('queen reassignment records the immediately previous family while preserving original provenance across repeated cycles',()=>{
 const state=baseState();
 const firstMerge=api.applyMerge(state,{sourceFamilyIds:['f1','f2','f3'],operationId:'OP-11',resultFamily:{id:'merge-1',hive:'h1'}},makeId,'2026-10-15T10:00:00.000Z');
 assert.equal(firstMerge.ok,true);
 const firstSplit=api.applySplit(state,{sourceFamilyId:'merge-1',operationId:'OP-04',resultFamilies:children('first')},makeId,'2027-04-01T10:00:00.000Z');
 assert.equal(firstSplit.ok,true);
 assert.equal(api.confirmQueenIdentity(state,{familyId:'first-2',queenId:'q2'},makeId,'2027-04-10T10:00:00.000Z').ok,true);
 state.queens.push({id:'q1-next',familyId:'first-1',status:'current',originFamilyId:'f1'});
 state.queens.push({id:'q3-next',familyId:'first-3',status:'current',originFamilyId:'f3'});
 state.families.find(f=>f.id==='first-1').currentQueenId='q1-next';
 state.families.find(f=>f.id==='first-1').queenIdentityStatus='identified';
 state.families.find(f=>f.id==='first-3').currentQueenId='q3-next';
 state.families.find(f=>f.id==='first-3').queenIdentityStatus='identified';
 const secondMerge=api.applyMerge(state,{sourceFamilyIds:['first-1','first-2','first-3'],operationId:'OP-11',resultFamily:{id:'merge-2',hive:'h1'}},makeId,'2027-10-15T10:00:00.000Z');
 assert.equal(secondMerge.ok,true);
 const secondSplit=api.applySplit(state,{sourceFamilyId:'merge-2',operationId:'OP-04',resultFamilies:children('second')},makeId,'2028-04-01T10:00:00.000Z');
 assert.equal(secondSplit.ok,true);
 const confirmed=api.confirmQueenIdentity(state,{familyId:'second-2',queenId:'q2'},makeId,'2028-04-10T10:00:00.000Z');
 assert.equal(confirmed.ok,true);
 assert.equal(confirmed.queen.originFamilyId,'f2');
 assert.equal(confirmed.queen.familyId,'second-2');
 assert.equal(state.queenEvents.at(-1).previousFamilyId,'first-2');
 assert.deepEqual(api.inspect(state),[]);
});


test('split cannot inject unrelated queen candidates or change an existing lineage group',()=>{
 const state=baseState();
 const injected=api.applySplit(state,{sourceFamilyId:'f1',operationId:'OP-04',candidateQueenIds:['q2'],resultFamilies:children('safe-child')},makeId,'2026-04-01T10:00:00.000Z');
 assert.equal(injected.ok,false);
 assert.equal(injected.error,'split_candidate_queen_not_in_source_lineage');
 assert.equal(state.families.length,3,'failed split must not mutate the source state');
 const changedGroup=api.applySplit(state,{sourceFamilyId:'f1',operationId:'OP-04',colonyGroupId:'other-group',resultFamilies:children('safe-child')},makeId,'2026-04-01T10:00:00.000Z');
 assert.equal(changedGroup.ok,false);
 assert.equal(changedGroup.error,'split_colony_group_change_forbidden');
 assert.equal(state.families.length,3);
});

test('OP-04 and OP-14 split operations require exactly three result families',()=>{
 for(const operationId of ['OP-04','OP-14']){
  const state=baseState();
  const result=api.applySplit(state,{sourceFamilyId:'f1',operationId,scenario:operationId==='OP-14'?'EARLY_HONEY':undefined,resultFamilies:[{id:'only-a',hive:'h1'},{id:'only-b',hive:'h1'}]},makeId,'2026-04-01T10:00:00.000Z');
  assert.equal(result.ok,false);
  assert.equal(result.error,'split_result_families_invalid');
  assert.equal(state.families.length,3);
 }
});


test('new split lineage group cannot collide with an unrelated existing group',()=>{
 const state=baseState();
 state.families[0].colonyGroupId=undefined;
 state.families[1].colonyGroupId='already-used';
 const result=api.applySplit(state,{sourceFamilyId:'f1',operationId:'OP-04',colonyGroupId:'already-used',resultFamilies:children('collision-child')},makeId,'2026-04-01T10:00:00.000Z');
 assert.equal(result.ok,false);
 assert.equal(result.error,'split_colony_group_already_in_use');
 assert.equal(state.families.length,3);
});

test('OP-11 and OP-14 merges require exactly three source families',()=>{
 for(const operationId of ['OP-11','OP-14']){
  const state=baseState();
  const result=api.applyMerge(state,{sourceFamilyIds:['f1','f2'],operationId,scenario:operationId==='OP-14'?'EARLY_HONEY':undefined,resultFamily:{id:'bad-merge-'+operationId,hive:'h1'}},makeId,'2026-10-15T10:00:00.000Z');
  assert.equal(result.ok,false);
  assert.equal(result.error,'merge_source_families_invalid');
  assert.equal(state.families.length,3);
 }
});

test('queen identity confirmation rejects a candidate that is no longer marked unknown',()=>{
 const state=baseState();
 api.applyMerge(state,{sourceFamilyIds:['f1','f2','f3'],resultFamily:{id:'merged',hive:'h1'}},makeId,'2026-10-15T10:00:00.000Z');
 state.queens.find(q=>q.id==='q2').status='dead';
 const before=structuredClone(state);
 const result=api.confirmQueenIdentity(state,{familyId:'merged',queenId:'q2'},makeId,'2026-10-20T10:00:00.000Z');
 assert.equal(result.ok,false);
 assert.equal(result.error,'identity_queen_not_unknown');
 assert.deepEqual(state,before);
});
