import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};
for(const path of ['sectional-season-physical-manifest-v2.js','sectional-season-op13-inventory-guide-v2.js'])
 new Function('window',readFileSync(new URL('../js/'+path,import.meta.url),'utf8'))(w);
const api=w.PasekaSectionalOP13InventoryGuideV2,PROFILE='sectional-multiqueen-v1';
function fixture(){
 const sections=[
  {id:'lower',position:'lower',familyId:'f1',broodBodyIds:['b1','b2'],upperBroodBodyId:'b2',openings:[]},
  {id:'middle',position:'middle',familyId:'f2',broodBodyIds:['b3'],upperBroodBodyId:'b3',openings:[]},
  {id:'upper',position:'upper',familyId:'f3',broodBodyIds:['b5'],upperBroodBodyId:'b5',openings:[]}
 ];
 const bodies=Object.fromEntries(Array.from({length:6},(_,i)=>{
  const id='b'+(i+1);return [id,{id,kind:'brood',condition:'good',
   spec:{profileId:PROFILE,framesPerBox:6},frames:Array.from({length:6},(_,j)=>({
    frameId:id+'-f'+j,history:[]})),events:[],
   ...([4,6].includes(i+1)?{storageLocation:'склад'}:{})}];
 }));
 const items={};
 for(const kind of ['bottom','cover','topRiser']){
  items[kind+'-left']={id:kind+'-left',kind,condition:'good',
   location:{type:'hive',hiveId:'h',stackId:'stack-left'}};
  for(const pos of ['middle','right']){
   items[kind+'-'+pos]={id:kind+'-'+pos,kind,condition:'good',
    location:{type:'storage',label:'резерв'}};
  }
 }
 for(const [id,positionLabel] of [['d1','lower-middle'],['d2','middle-upper']]){
  items[id]={id,kind:'meshDiaphragm',condition:'good',
   location:{type:'hive',hiveId:'h',stackId:'stack-left',positionLabel}};
 }
 return {meta:{revisionId:'r1'},hives:[{id:'h',profileId:PROFILE}],
  sectionalSeasonCycles:[{id:'cycle',hiveId:'h',status:'ACTIVE'}],
  sectionalLayouts:[{id:'layout',hiveId:'h',profileId:PROFILE,schemaVersion:1,
   mode:'ALTERNATIVE_WINTERING_COLUMN',sections,
   stacks:[{id:'stack-left',position:'column',sectionIds:['lower','middle','upper'],
    bottomItemId:'bottom-left',coverItemId:'cover-left',topRiserItemId:'topRiser-left',
    boundaries:['lower-middle','middle-upper']}],
   meshDiaphragms:[{itemId:'d1',positionLabel:'lower-middle'},
    {itemId:'d2',positionLabel:'middle-upper'}],technicalConnections:[]}],
  families:[1,2,3].map(i=>({id:'f'+i,hive:'h'})),
  equipmentInventory:{bodies,items}};
}
function selection(){
 return {hiveId:'h',sourceRevisionId:'r1',purpose:'EARLY_HONEY_PREPARATION',
  strongestFamilyId:'f1',confirmedExistingBottomId:'bottom-left',
  existingTargetPosition:'left',confirmedDiaphragmIds:['d1','d2'],
  separations:[
   {familyId:'f2',retainedBodyId:'b3',targetPosition:'middle',
    additionalBodyId:'b4',bottomId:'bottom-middle',coverId:'cover-middle',
    topRiserId:'topRiser-middle'},
   {familyId:'f3',retainedBodyId:'b5',targetPosition:'right',
    additionalBodyId:'b6',bottomId:'bottom-right',coverId:'cover-right',
    topRiserId:'topRiser-right'}
  ]};
}
function confirmed(state,s=selection()){
 const p=api.prepare(state,s);assert.equal(p.ok,true,JSON.stringify(p));
 return {...s,occurredAt:'2026-11-23T10:00:00Z',
  userConfirmed:true,actualSeparationConfirmed:true,
  confirmedBodyIds:p.changedBodyIds,confirmedItemIds:p.changedItemIds,
  diaphragmStorage:{d1:'склад диафрагм 1',d2:'склад диафрагм 2'}};
}
test('OP13 early honey inventory preview only, all real IDs, never fabricates target topology',()=>{
 const state=fixture(),before=structuredClone(state),r=api.plan(state,confirmed(state));
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.preflightOnly,true);
 assert.equal(r.physicalLayoutValidated,false);
 assert.equal(r.readyForPersistence,false);
 assert.equal(r.targetLayout,null);
 assert.equal(r.operationCompleted,false);
 assert.deepEqual(r.familyPlans.map(x=>x.sourceBodyIds),[['b1','b2'],['b3'],['b5']]);
 assert.deepEqual(r.changedBodyIds,['b4','b6']);
 assert.deepEqual(r.removedItemIds,['d1','d2']);
 assert.equal(r.requiresTechnicalConnectionManifest,true);
 assert.deepEqual(state,before);
});
test('OP13 source identity rejects stale revision, Farrar, wrong mode, duplicate season',()=>{
 const state=fixture(),before=structuredClone(state);
 assert.equal(api.inspect(state,'h','old').error,'op13_stale_source_revision');
 state.hives[0].profileId='farrar';
 assert.equal(api.inspect(state,'h','r1').error,'op13_alternative_wintering_2_1_1_source_required');
 state.hives[0].profileId=PROFILE;
 state.sectionalSeasonCycles.push({id:'second',hiveId:'h',status:'ACTIVE'});
 assert.equal(api.inspect(state,'h','r1').error,'op13_alternative_wintering_2_1_1_source_required');
 state.sectionalSeasonCycles.pop();
 state.sectionalLayouts[0].mode='SIDE_BY_SIDE';
 assert.equal(api.inspect(state,'h','r1').error,'op13_alternative_wintering_2_1_1_source_required');
 assert.deepEqual({...state,sectionalLayouts:before.sectionalLayouts},before);
});
test('OP13 distinguishes ordinary delayed spring development from early honey addition',()=>{
 const state=fixture();const p=api.prepare(state,{...selection(),purpose:'REGULAR_SPRING_DEVELOPMENT'});
 assert.equal(p.error,'op13_early_honey_variant_must_be_explicit');
});
test('OP13 never reallocates foreign, incomplete or already mounted bodies',()=>{
 const state=fixture(),s=selection();
 s.separations[0].additionalBodyId='b3';
 assert.equal(api.prepare(state,s).error,'op13_added_body_must_be_registered_complete_and_in_storage');
 s.separations[0].additionalBodyId='b4';
 state.equipmentInventory.bodies.b4.frames.pop();
 assert.equal(api.prepare(state,s).error,'op13_added_body_must_be_registered_complete_and_in_storage');
 state.equipmentInventory.bodies.b4.frames.push({frameId:'b4-new',history:[]});
 state.equipmentInventory.bodies.b4.frames[0].frameId=state.equipmentInventory.bodies.b1.frames[0].frameId;
 assert.equal(api.prepare(state,s).error,'op13_added_frame_identity_collision');
 state.equipmentInventory.bodies.b4.frames[0].frameId='b4-f0';
 state.sectionalLayouts.push({id:'other',hiveId:'other',sections:[{broodBodyIds:['b4']}],stacks:[]});
 assert.equal(api.prepare(state,s).error,'op13_added_body_must_be_registered_complete_and_in_storage');
});
test('OP13 requires every distinct registered bottom, cover, inner cover and target position',()=>{
 const state=fixture(),s=selection();
 s.separations[1].bottomId='bottom-middle';
 assert.equal(api.prepare(state,s).error,'op13_duplicate_physical_assignment');
 s.separations[1].bottomId='bottom-right';
 state.equipmentInventory.items['cover-right'].condition='damaged';
 assert.equal(api.prepare(state,s).error,'op13_new_stack_item_must_be_registered_in_storage');
 state.equipmentInventory.items['cover-right'].condition='good';
 s.separations[0].targetPosition='left';
 assert.equal(api.prepare(state,s).error,'op13_duplicate_physical_assignment');
 s.separations[0].targetPosition='middle';
 s.strongestFamilyId='f2';
 assert.equal(api.prepare(state,s).error,'op13_original_two_body_family_and_bottom_must_be_confirmed');
});
test('OP13 missing specific storage, confirmation and real time fail closed',()=>{
 const state=fixture(),req=confirmed(state);
 req.userConfirmed=false;
 assert.equal(api.plan(state,req).error,'op13_actual_separation_personal_confirmation_required');
 req.userConfirmed=true;req.confirmedBodyIds=['b4'];
 assert.equal(api.plan(state,req).error,'op13_every_new_body_and_item_must_be_individually_confirmed');
 req.confirmedBodyIds=['b4','b6'];
 delete req.diaphragmStorage.d2;
 assert.equal(api.plan(state,req).error,'op13_removed_diaphragm_storage_required');
 req.diaphragmStorage.d2='склад';
 req.occurredAt='2099-01-01T00:00:00Z';
 assert.equal(api.plan(state,req).error,'op13_actual_date_required');
});
