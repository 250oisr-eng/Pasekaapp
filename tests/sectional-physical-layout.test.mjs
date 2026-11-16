import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../js/sectional-physical-layout.js',import.meta.url),'utf8');
const windowRef={};
new Function('window',source)(windowRef);
const api=windowRef.PasekaSectionalPhysicalLayout;

function baseState(){
 const families=[1,2,3].map(i=>({id:'f'+i,hive:'h1',recordStatus:'active',colonyGroupId:'group-1',currentQueenId:null,queenIdentityStatus:'unresolved'}));
 const bodies={};
 for(let section=1;section<=3;section++)for(let level=1;level<=3;level++){
  const bodyId='b'+section+'-'+level;
  bodies[bodyId]={id:bodyId,kind:'brood',condition:'good',spec:{profileId:api.PROFILE_ID,framesPerBox:6}};
 }
 const items={};
 const addItem=(itemId,kind,location)=>{items[itemId]={id:itemId,kind,condition:'good',location:{type:'hive',hiveId:'h1',...location}}};
 const sections=[1,2,3].map(i=>({
  id:'s'+i,familyId:'f'+i,position:['left','middle','right'][i-1],
  broodBodyIds:['b'+i+'-1','b'+i+'-2'],bottomId:'bottom-'+i,coverId:'cover-'+i
 }));
 sections.forEach(section=>{
  addItem(section.bottomId,'bottom',{sectionId:section.id});
  addItem(section.coverId,'cover',{sectionId:section.id});
 });
 const technicalConnections=[
  {id:'conn-12',fromSectionId:'s1',toSectionId:'s2',bufferCorridorPresent:true,
   from:{bodyId:'b1-1',openingId:'b1-right',itemId:'grid-1'},to:{bodyId:'b2-1',openingId:'b2-left',itemId:'grid-2'}},
  {id:'conn-23',fromSectionId:'s2',toSectionId:'s3',bufferCorridorPresent:true,
   from:{bodyId:'b2-2',openingId:'b2-right',itemId:'grid-3'},to:{bodyId:'b3-1',openingId:'b3-left',itemId:'grid-4'}}
 ];
 technicalConnections.forEach(connection=>{
  for(const side of ['from','to']){
   const opening=connection[side];
   addItem(opening.itemId,'technicalQueenExcluder',{connectionId:connection.id,bodyId:opening.bodyId,openingId:opening.openingId});
  }
 });
 return {
  hives:[{id:'h1'}],families,equipmentInventory:{bodies,items},layouts:{},
  layout:{id:'layout-1',schemaVersion:1,hiveId:'h1',profileId:api.PROFILE_ID,mode:api.MODES.SIDE_BY_SIDE,sections,technicalConnections}
 };
}
function addHoneyStack(state,layout,purpose='early',count=2){
 const pairIds=count===4?['pair-a','pair-a','pair-b','pair-b']:['pair-a','pair-a'];
 const bodyIds=[];
 for(let i=0;i<count;i++){
  const bodyId='honey-'+(i+1);
  bodyIds.push(bodyId);
  state.equipmentInventory.bodies[bodyId]={id:bodyId,kind:'honey',condition:'good',pairId:pairIds[i],spec:{profileId:api.PROFILE_ID,framesPerBox:10}};
 }
 const leftFootprint=[{bodyId:'b1-2',coverage:'FULL'},{bodyId:'b2-2',coverage:'HALF'}];
 const rightFootprint=[{bodyId:'b2-2',coverage:'HALF'},{bodyId:'b3-2',coverage:'FULL'}];
 state.equipmentInventory.items['large-left']={id:'large-left',kind:'honeyQueenExcluder',condition:'good',location:{type:'hive',hiveId:'h1',footprint:leftFootprint}};
 state.equipmentInventory.items['large-right']={id:'large-right',kind:'honeyQueenExcluder',condition:'good',location:{type:'hive',hiveId:'h1',footprint:rightFootprint}};
 layout.honeyStack={purpose,bodyIds,excluders:[{side:'left',itemId:'large-left',footprint:leftFootprint},{side:'right',itemId:'large-right',footprint:rightFootprint}]};
}
test('validates three independent side-by-side families with two brood bodies each and paired technical connections',()=>{
 const {layout,...state}=baseState();
 const result=api.validate(layout,state);
 assert.equal(result.valid,true,JSON.stringify(result.errors));
 assert.deepEqual(result.errors,[]);
});
test('validates alternative wintering as three independent families in a 2+1+1 column',()=>{
 const state=baseState();
 const layout={id:'winter-layout',schemaVersion:1,hiveId:'h1',profileId:api.PROFILE_ID,mode:api.MODES.ALTERNATIVE_WINTERING_COLUMN,
  sections:[
   {id:'s1',familyId:'f1',position:'lower',broodBodyIds:['b1-1','b1-2']},
   {id:'s2',familyId:'f2',position:'middle',broodBodyIds:['b2-1']},
   {id:'s3',familyId:'f3',position:'upper',broodBodyIds:['b3-1']}
  ],
  column:{bottomId:'column-bottom',coverId:'column-cover',meshDiaphragms:[
   {itemId:'diaphragm-1',between:'lower-middle'},{itemId:'diaphragm-2',between:'middle-upper'}
  ]}
 };
 state.equipmentInventory.items['column-bottom']={id:'column-bottom',kind:'bottom',condition:'good',location:{type:'hive',hiveId:'h1'}};
 state.equipmentInventory.items['column-cover']={id:'column-cover',kind:'cover',condition:'good',location:{type:'hive',hiveId:'h1'}};
 state.equipmentInventory.items['diaphragm-1']={id:'diaphragm-1',kind:'meshDiaphragm',condition:'good',location:{type:'hive',hiveId:'h1',positionLabel:'lower-middle'}};
 state.equipmentInventory.items['diaphragm-2']={id:'diaphragm-2',kind:'meshDiaphragm',condition:'good',location:{type:'hive',hiveId:'h1',positionLabel:'middle-upper'}};
 const result=api.validate(layout,state);
 assert.equal(result.valid,true,JSON.stringify(result.errors));
});
test('validates early honey harvest with exactly two honey bodies and the two FULL/HALF grids',()=>{
 const {layout,...state}=baseState();
 addHoneyStack(state,layout,'early',2);
 const result=api.validate(layout,state);
 assert.equal(result.valid,true,JSON.stringify(result.errors));
});
test('validates optional four-body main-honey stack as two independent pairs',()=>{
 const {layout,...state}=baseState();
 addHoneyStack(state,layout,'main',4);
 const result=api.validate(layout,state);
 assert.equal(result.valid,true,JSON.stringify(result.errors));
});
test('validates primary wintering as one family in three brood bodies with confirmed closure records',()=>{
 const state=baseState();
 const layout={id:'combined-layout',schemaVersion:1,hiveId:'h1',profileId:api.PROFILE_ID,mode:api.MODES.SINGLE_FAMILY,purpose:'primary_wintering',
  sections:[{id:'combined',familyId:'f1',position:'combined',broodBodyIds:['b1-1','b1-2','b1-3'],bottomId:'winter-bottom',coverId:'winter-cover'}],
  closuresConfirmed:true,closedOpenings:[{itemId:'plug-1',bodyId:'b1-1',openingId:'left-opening'}]
 };
 state.equipmentInventory.items['winter-bottom']={id:'winter-bottom',kind:'bottom',condition:'good',location:{type:'hive',hiveId:'h1',sectionId:'combined'}};
 state.equipmentInventory.items['winter-cover']={id:'winter-cover',kind:'cover',condition:'good',location:{type:'hive',hiveId:'h1',sectionId:'combined'}};
 state.equipmentInventory.items['plug-1']={id:'plug-1',kind:'plasticPlug',condition:'good',location:{type:'hive',hiveId:'h1',bodyId:'b1-1',openingId:'left-opening'}};
 const result=api.validate(layout,state);
 assert.equal(result.valid,true,JSON.stringify(result.errors));
});
test('rejects missing permanent technical grid, buffer corridor and duplicate body placement',()=>{
 const {layout,...state}=baseState();
 layout.technicalConnections[0].from.itemId='missing-grid';
 layout.technicalConnections[1].bufferCorridorPresent=false;
 layout.sections[1].broodBodyIds[0]='b1-1';
 const codes=api.validate(layout,state).errors.map(x=>x.code);
 assert.ok(codes.includes('section_accessory_missing'));
 assert.ok(codes.includes('technical_connection_buffer_required'));
 assert.ok(codes.includes('section_body_duplicate'));
});
test('rejects foreign or historical families and inconsistent colony groups',()=>{
 const {layout,...state}=baseState();
 state.families[1].recordStatus='historical';
 state.families[2].colonyGroupId='other-group';
 const codes=api.validate(layout,state).errors.map(x=>x.code);
 assert.ok(codes.includes('section_family_historical'));
 assert.ok(codes.includes('section_colony_group_mismatch'));
});
test('rejects three honey bodies and broken pair identity',()=>{
 const {layout,...state}=baseState();
 addHoneyStack(state,layout,'main',4);
 layout.honeyStack.bodyIds.pop();
 const codes=api.validate(layout,state).errors.map(x=>x.code);
 assert.ok(codes.includes('honey_stack_body_count_invalid'));
 assert.ok(codes.includes('honey_body_pair_structure_invalid'));
});
test('rejects a large excluder with wrong FULL/HALF footprint',()=>{
 const {layout,...state}=baseState();
 addHoneyStack(state,layout,'early',2);
 state.equipmentInventory.items['large-left'].location.footprint[0].bodyId='b1-1';
 const codes=api.validate(layout,state).errors.map(x=>x.code);
 assert.ok(codes.includes('section_accessory_footprint_mismatch'));
 assert.ok(codes.includes('large_excluder_inventory_footprint_mismatch'));
});
test('rejects alternative wintering with missing or misplaced mesh diaphragms',()=>{
 const state=baseState();
 const layout={id:'winter-layout',schemaVersion:1,hiveId:'h1',profileId:api.PROFILE_ID,mode:api.MODES.ALTERNATIVE_WINTERING_COLUMN,
  sections:[
   {id:'s1',familyId:'f1',position:'lower',broodBodyIds:['b1-1','b1-2']},
   {id:'s2',familyId:'f2',position:'middle',broodBodyIds:['b2-1']},
   {id:'s3',familyId:'f3',position:'upper',broodBodyIds:['b3-1']}
  ],column:{bottomId:'column-bottom',coverId:'column-cover',meshDiaphragms:[{itemId:'missing',between:'lower-middle'},{itemId:'missing-2',between:'lower-middle'}]}
 };
 state.equipmentInventory.items['column-bottom']={id:'column-bottom',kind:'bottom',condition:'good',location:{type:'hive',hiveId:'h1'}};
 state.equipmentInventory.items['column-cover']={id:'column-cover',kind:'cover',condition:'good',location:{type:'hive',hiveId:'h1'}};
 const codes=api.validate(layout,state).errors.map(x=>x.code);
 assert.ok(codes.includes('section_accessory_missing'));
 assert.ok(codes.includes('wintering_mesh_diaphragm_coverage_incomplete'));
});
test('inspection validates stored layout collections and rejects duplicate hive layouts',()=>{
 const {layout,...state}=baseState();
 state.sectionalPhysicalLayouts=[layout,{...layout,id:'second'}];
 const errors=api.inspect(state).map(x=>x.code);
 assert.ok(errors.includes('sectional_layout_hive_duplicate'));
 assert.deepEqual(api.inspect({}),[]);
 assert.ok(api.inspect({sectionalPhysicalLayouts:{}}).some(x=>x.code==='sectional_physical_layouts_invalid'));
});


test('requires each section cover when no shared honey stack is installed',()=>{
 const {layout,...state}=baseState();
 delete layout.sections[1].coverId;
 const codes=api.validate(layout,state).errors.map(x=>x.code);
 assert.ok(codes.includes('section_cover_required'));
});


test('early honey configuration requires two brood bodies in each of the three sections',()=>{
 const {layout,...state}=baseState();
 addHoneyStack(state,layout,'early',2);
 layout.sections[0].broodBodyIds.push('b1-3');
 const codes=api.validate(layout,state).errors.map(x=>x.code);
 assert.ok(codes.includes('early_honey_section_body_count_invalid'));
});

test('winter closure plugs must reference a body physically assigned to the combined family',()=>{
 const state=baseState();
 const layout={id:'combined-layout',schemaVersion:1,hiveId:'h1',profileId:api.PROFILE_ID,mode:api.MODES.SINGLE_FAMILY,purpose:'primary_wintering',
  sections:[{id:'combined',familyId:'f1',position:'combined',broodBodyIds:['b1-1','b1-2','b1-3'],bottomId:'winter-bottom',coverId:'winter-cover'}],
  closuresConfirmed:true,closedOpenings:[{itemId:'plug-1',bodyId:'b2-1',openingId:'wrong-opening'}]
 };
 state.equipmentInventory.items['winter-bottom']={id:'winter-bottom',kind:'bottom',condition:'good',location:{type:'hive',hiveId:'h1',sectionId:'combined'}};
 state.equipmentInventory.items['winter-cover']={id:'winter-cover',kind:'cover',condition:'good',location:{type:'hive',hiveId:'h1',sectionId:'combined'}};
 state.equipmentInventory.items['plug-1']={id:'plug-1',kind:'plasticPlug',condition:'good',location:{type:'hive',hiveId:'h1',bodyId:'b2-1',openingId:'wrong-opening'}};
 const codes=api.validate(layout,state).errors.map(x=>x.code);
 assert.ok(codes.includes('winter_plug_body_not_in_section'));
});
