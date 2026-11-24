import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const window={};
for(const path of ['sectional-season-physical-manifest-v2.js','sectional-season-op12-guided-v2.js'])
 new Function('window',readFileSync(new URL('../js/'+path,import.meta.url),'utf8'))(window);
const api=window.PasekaSectionalOP12GuidedV2,profile='sectional-multiqueen-v1';
function fixture(){
 const positions=['left','middle','right'];
 const sections=positions.map((position,i)=>({id:position,position,familyId:'f'+(i+1),
  broodBodyIds:['b'+(i*2+1),'b'+(i*2+2)],upperBroodBodyId:'b'+(i*2+2),
  openings:[]}));
 const stacks=positions.map(position=>({id:'stack-'+position,position,sectionIds:[position],
  bottomItemId:'bottom-'+position,coverItemId:'cover-'+position}));
 const bodies=Object.fromEntries(Array.from({length:6},(_,i)=>{
  const id='b'+(i+1);return [id,{id,kind:'brood',condition:'good',
   spec:{profileId:profile,framesPerBox:6},frames:Array.from({length:6},(_,j)=>({
    frameId:id+'f'+j,history:[]})),events:[]}];
 }));
 const items={};
 for(const pos of positions)for(const kind of ['bottom','cover']){
  const id=kind+'-'+pos;items[id]={id,kind,condition:'good',
   location:{type:'hive',hiveId:'h',stackId:'stack-'+pos}};
 }
 for(const id of ['d1','d2'])items[id]={id,kind:'meshDiaphragm',condition:'good',
  location:{type:'storage',label:'склад'}};
 return {meta:{revisionId:'r1'},hives:[{id:'h',profileId:profile}],
  sectionalSeasonCycles:[{hiveId:'h',status:'ACTIVE',id:'cycle'}],
  sectionalLayouts:[{id:'layout',hiveId:'h',profileId:profile,schemaVersion:1,
   mode:'SIDE_BY_SIDE',sections,stacks}],
  equipmentInventory:{bodies,items},families:positions.map((_,i)=>({id:'f'+(i+1),hive:'h'}))};
}
function selections(){
 return {hiveId:'h',sourceRevisionId:'r1',
  strongestFamilyId:'f1',middleFamilyId:'f2',upperFamilyId:'f3',
  middleBodyId:'b3',upperBodyId:'b5',
  coverItemId:'cover-left',lowerDiaphragmId:'d1',upperDiaphragmId:'d2'};
}
function confirmed(state,selection=selections()){
 const p=api.prepare(state,selection);
 assert.equal(p.ok,true,JSON.stringify(p));
 return {...selection,userConfirmed:true,actualWorkConfirmed:true,actualIsolationConfirmed:true,
  occurredAt:'2026-11-23T10:00:00Z',
  bodyStorage:Object.fromEntries(p.removedBodyIds.map(id=>[id,'склад '+id])),
  itemStorage:Object.fromEntries(p.removedItemIds.map(id=>[id,'склад '+id])),
  confirmedBodyIds:p.changedBodyIds,confirmedItemIds:p.changedItemIds};
}
test('guided OP12 preserves 2+1+1 real body IDs and creates valid manifest without writing source',()=>{
 const state=fixture(),before=structuredClone(state),req=confirmed(state);
 const p=api.prepare(state,req);
 assert.equal(p.targetLayout.mode,'ALTERNATIVE_WINTERING_COLUMN');
 assert.deepEqual(p.targetLayout.sections.map(s=>s.broodBodyIds),[['b1','b2'],['b3'],['b5']]);
 assert.deepEqual(p.removedBodyIds,['b4','b6']);
 assert.deepEqual(p.targetLayout.meshDiaphragms.map(x=>x.itemId),['d1','d2']);
 const r=api.plan(state,req);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.previewOnly,true);assert.equal(r.readyForPersistence,false);
 assert.equal(r.request.expectedSourceRevisionId,undefined); // internal request carries sourceRevisionId
 assert.equal(r.request.sourceRevisionId,'r1');
 assert.equal(r.request.bodyMoves.length,6);
 assert.deepEqual(r.request.itemMoves.map(x=>x.itemId).sort(),p.changedItemIds);
 assert.deepEqual(state,before);
});
test('guided OP12 can record strongest at right, without inventing new family or body',()=>{
 const state=fixture();const q=selections();
 q.strongestFamilyId='f3';q.middleFamilyId='f2';q.upperFamilyId='f1';
 q.middleBodyId='b3';q.upperBodyId='b1';q.coverItemId='cover-right';
 const p=api.prepare(state,q);
 assert.equal(p.ok,true,JSON.stringify(p));
 assert.equal(p.targetLayout.stacks[0].id,'stack-right');
 assert.deepEqual(p.targetLayout.sections.map(s=>s.broodBodyIds),[['b5','b6'],['b3'],['b1']]);
 assert.equal(api.plan(state,confirmed(state,q)).ok,true);
});
test('stale revision, mismatched body, repeated families or non-stored mesh fail closed',()=>{
 const state=fixture(),original=structuredClone(state);
 assert.equal(api.prepare(state,{...selections(),sourceRevisionId:'older'}).error,'op12_source_revision_stale');
 assert.equal(api.prepare(state,{...selections(),middleBodyId:'b5'}).error,'op12_body_must_belong_to_its_family');
 assert.equal(api.prepare(state,{...selections(),upperFamilyId:'f2'}).error,'op12_three_distinct_families_required');
 assert.equal(api.prepare(state,{...selections(),upperDiaphragmId:'d1'}).error,
  'op12_registered_cover_feeder_and_two_stored_diaphragms_required');
 state.equipmentInventory.items.d1.location={type:'hive',hiveId:'h',stackId:'other'};
 assert.equal(api.prepare(state,selections()).error,
  'op12_registered_cover_feeder_and_two_stored_diaphragms_required');
 assert.deepEqual({...state.equipmentInventory.items,d1:original.equipmentInventory.items.d1},
  original.equipmentInventory.items);
});
test('OP12 refuses storage omissions, missing per-item confirmations and any missing personal consent',()=>{
 const state=fixture(),req=confirmed(state),p=api.prepare(state,req);
 req.bodyStorage.b4='';
 assert.equal(api.plan(state,req).error,'op12_removed_body_storage_required');
 req.bodyStorage.b4='склад';
 delete req.itemStorage[p.removedItemIds[0]];
 assert.equal(api.plan(state,req).error,'op12_removed_item_storage_required');
 req.itemStorage[p.removedItemIds[0]]='склад';
 req.confirmedItemIds=[];
 assert.equal(api.plan(state,req).error,'manifest_item_movements_not_individually_confirmed');
 req.confirmedItemIds=p.changedItemIds;
 req.actualIsolationConfirmed=false;
 assert.equal(api.plan(state,req).error,'op12_actual_work_and_isolation_confirmation_required');
 req.actualIsolationConfirmed=true;req.userConfirmed=false;
 assert.equal(api.plan(state,req).error,'op12_actual_work_and_isolation_confirmation_required');
});
test('OP12 cannot load foreign profile, invalid schema or another active season',()=>{
 const state=fixture();state.hives[0].profileId='farrar';
 assert.equal(api.prepare(state,selections()).ok,false);
 state.hives[0].profileId=profile;state.sectionalLayouts[0].schemaVersion=0;
 assert.equal(api.prepare(state,selections()).error,'op12_source_shape_not_supported');
 state.sectionalLayouts[0].schemaVersion=1;
 state.sectionalSeasonCycles.push({id:'extra',hiveId:'h',status:'ACTIVE'});
 assert.equal(api.prepare(state,selections()).error,'op12_active_cycle_missing');
});
