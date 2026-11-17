import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const layoutSource=await readFile(new URL('../js/sectional-physical-layout.js',import.meta.url),'utf8');
const equipmentSource=await readFile(new URL('../js/equipment-items.js',import.meta.url),'utf8');
const appWindow={};
new Function('window',equipmentSource)(appWindow);
new Function('window',layoutSource)(appWindow);
const Layout=appWindow.PasekaSectionalPhysicalLayout;
const Equipment=appWindow.PasekaEquipmentItems;
const PROFILE='sectional-multiqueen-v1';
const NOW='2026-11-17T08:00:00.000Z';

function makeItem(id,kind,location){
 return {id,kind,label:id,condition:'good',location,notes:'',registeredAt:NOW,updatedAt:NOW,events:[]};
}
function honeyFrames(id){return Array.from({length:10},(_,index)=>({frameId:id+'-frame-'+(index+1),combType:'drawn_comb',history:[]}));}
function makeBody(id,kind='brood'){
 return {id,kind,condition:'good',spec:{profileId:PROFILE,framesPerBox:kind==='brood'?6:10},...(kind==='honey'?{frames:honeyFrames(id)}:{})};
}
function honeyFrames(id){
 return Array.from({length:10},(_,index)=>({frameId:id+'-frame-'+(index+1),combType:'drawn_comb',history:[]}));
}
function baseFamilies(){
 return [
  {id:'f1',hive:'h1',recordStatus:'active',colonyGroupId:'g1',queenIdentityStatus:'identified',currentQueenId:'q1'},
  {id:'f2',hive:'h1',recordStatus:'active',colonyGroupId:'g1',queenIdentityStatus:'unresolved',currentQueenId:null},
  {id:'f3',hive:'h1',recordStatus:'active',colonyGroupId:'g1',queenIdentityStatus:'unresolved',currentQueenId:null}
 ];
}
function sideBySide(){
 const bodies=Object.fromEntries(['b1','b2','b3','b4','b5','b6'].map(id=>[id,makeBody(id)]));
 const items={
  bl:makeItem('bl','bottom',{type:'hive',hiveId:'h1',stackId:'sl'}),
  bm:makeItem('bm','bottom',{type:'hive',hiveId:'h1',stackId:'sm'}),
  br:makeItem('br','bottom',{type:'hive',hiveId:'h1',stackId:'sr'}),
  cl:makeItem('cl','cover',{type:'hive',hiveId:'h1',stackId:'sl'}),
  cm:makeItem('cm','cover',{type:'hive',hiveId:'h1',stackId:'sm'}),
  cr:makeItem('cr','cover',{type:'hive',hiveId:'h1',stackId:'sr'}),
  tl:makeItem('tl','topRiser',{type:'hive',hiveId:'h1',stackId:'sl'}),
  tm:makeItem('tm','topRiser',{type:'hive',hiveId:'h1',stackId:'sm'}),
  tr:makeItem('tr','topRiser',{type:'hive',hiveId:'h1',stackId:'sr'}),
  gl1:makeItem('gl1','technicalQueenExcluder',{type:'hive',hiveId:'h1',bodyId:'b1',openingId:'o1'}),
  gl2:makeItem('gl2','technicalQueenExcluder',{type:'hive',hiveId:'h1',bodyId:'b3',openingId:'o2'}),
  gl3:makeItem('gl3','technicalQueenExcluder',{type:'hive',hiveId:'h1',bodyId:'b2',openingId:'o5'}),
  gl4:makeItem('gl4','technicalQueenExcluder',{type:'hive',hiveId:'h1',bodyId:'b4',openingId:'o6'}),
  gr1:makeItem('gr1','technicalQueenExcluder',{type:'hive',hiveId:'h1',bodyId:'b3',openingId:'o3'}),
  gr2:makeItem('gr2','technicalQueenExcluder',{type:'hive',hiveId:'h1',bodyId:'b5',openingId:'o4'}),
  gr3:makeItem('gr3','technicalQueenExcluder',{type:'hive',hiveId:'h1',bodyId:'b4',openingId:'o7'}),
  gr4:makeItem('gr4','technicalQueenExcluder',{type:'hive',hiveId:'h1',bodyId:'b6',openingId:'o8'})
 };
 const sections=[
  {id:'s-left',position:'left',familyId:'f1',broodBodyIds:['b1','b2'],upperBroodBodyId:'b2',openings:[{id:'o1',bodyId:'b1',diameterMm:50},{id:'o5',bodyId:'b2',diameterMm:50}]},
  {id:'s-middle',position:'middle',familyId:'f2',broodBodyIds:['b3','b4'],upperBroodBodyId:'b4',openings:[{id:'o2',bodyId:'b3',diameterMm:50},{id:'o3',bodyId:'b3',diameterMm:50},{id:'o6',bodyId:'b4',diameterMm:50},{id:'o7',bodyId:'b4',diameterMm:50}]},
  {id:'s-right',position:'right',familyId:'f3',broodBodyIds:['b5','b6'],upperBroodBodyId:'b6',openings:[{id:'o4',bodyId:'b5',diameterMm:50},{id:'o8',bodyId:'b6',diameterMm:50}]}
 ];
 const layout={
  schemaVersion:1,id:'layout-h1',hiveId:'h1',profileId:PROFILE,mode:Layout.MODES.SIDE_BY_SIDE,
  sections,
  stacks:[
   {id:'sl',position:'left',sectionIds:['s-left'],bottomItemId:'bl',coverItemId:'cl',topRiserItemId:'tl'},
   {id:'sm',position:'middle',sectionIds:['s-middle'],bottomItemId:'bm',coverItemId:'cm',topRiserItemId:'tm'},
   {id:'sr',position:'right',sectionIds:['s-right'],bottomItemId:'br',coverItemId:'cr',topRiserItemId:'tr'}
  ],
  technicalConnections:[
   {id:'c-lm',fromSectionId:'s-left',toSectionId:'s-middle',bufferCorridorPresent:true,openings:[
    {sectionId:'s-left',bodyId:'b1',openingId:'o1',itemId:'gl1'},
    {sectionId:'s-middle',bodyId:'b3',openingId:'o2',itemId:'gl2'},
    {sectionId:'s-left',bodyId:'b2',openingId:'o5',itemId:'gl3'},
    {sectionId:'s-middle',bodyId:'b4',openingId:'o6',itemId:'gl4'}
   ]},
   {id:'c-mr',fromSectionId:'s-middle',toSectionId:'s-right',bufferCorridorPresent:true,openings:[
    {sectionId:'s-middle',bodyId:'b3',openingId:'o3',itemId:'gr1'},
    {sectionId:'s-right',bodyId:'b5',openingId:'o4',itemId:'gr2'},
    {sectionId:'s-middle',bodyId:'b4',openingId:'o7',itemId:'gr3'},
    {sectionId:'s-right',bodyId:'b6',openingId:'o8',itemId:'gr4'}
   ]}
  ],
  meshDiaphragms:[],temporaryQueenIsolation:[],closedOpenings:[]
 };
 const state={
  hives:[{id:'h1',profileId:PROFILE}],families:baseFamilies(),
  queens:[{id:'q1',familyId:'f1',status:'current'}],
  equipmentInventory:{bodies,items,itemEvents:[]},sectionalLayouts:[layout],layouts:{}
 };
 return {state,layout};
}
function alternativeWintering(twoBodyPosition='lower'){
 const base=sideBySide(),{state,layout}=base;
 const idsByPosition={lower:['b1','b2'],middle:['b3'],upper:['b4']};
 if(twoBodyPosition!=='lower'){
  const all=['b1','b2','b3','b4'];
  const counts={lower:1,middle:1,upper:1};counts[twoBodyPosition]=2;
  let cursor=0;
  for(const position of ['lower','middle','upper'])idsByPosition[position]=all.slice(cursor,cursor+counts[position]),cursor+=counts[position];
 }
 layout.mode=Layout.MODES.ALTERNATIVE_WINTERING_COLUMN;
 layout.sections=[
  {id:'s-lower',position:'lower',familyId:'f1',broodBodyIds:idsByPosition.lower,upperBroodBodyId:idsByPosition.lower.at(-1),openings:[]},
  {id:'s-middle',position:'middle',familyId:'f2',broodBodyIds:idsByPosition.middle,upperBroodBodyId:idsByPosition.middle.at(-1),openings:[]},
  {id:'s-upper',position:'upper',familyId:'f3',broodBodyIds:idsByPosition.upper,upperBroodBodyId:idsByPosition.upper.at(-1),openings:[]}
 ];
 layout.stacks=[{id:'column',position:'column',sectionIds:['s-lower','s-middle','s-upper'],bottomItemId:'bc',boundaries:['lower-middle','middle-upper']}];
 layout.technicalConnections=[];
 layout.temporaryQueenIsolation=[];
 layout.closedOpenings=[];
 layout.meshDiaphragms=[
  {itemId:'d1',positionLabel:'lower-middle'},
  {itemId:'d2',positionLabel:'middle-upper'}
 ];
 state.equipmentInventory.items={
  bc:makeItem('bc','bottom',{type:'hive',hiveId:'h1',stackId:'column'}),
  d1:makeItem('d1','meshDiaphragm',{type:'hive',hiveId:'h1',stackId:'column',positionLabel:'lower-middle'}),
  d2:makeItem('d2','meshDiaphragm',{type:'hive',hiveId:'h1',stackId:'column',positionLabel:'middle-upper'})
 };
 return {state,layout};
}
function singleFamily(purpose='primary_wintering',count=3){
 const bodies=Object.fromEntries(['b1','b2','b3','b4'].map(id=>[id,makeBody(id)]));
 const openings=[{id:'o1',bodyId:'b2',diameterMm:50},{id:'o2',bodyId:'b3',diameterMm:50}];
 const family={id:'f1',hive:'h1',recordStatus:'active',colonyGroupId:'g1',queenIdentityStatus:'identified',currentQueenId:'q1'};
 const bodyIds=['b1','b2','b3','b4'].slice(0,count);
 const layout={
  schemaVersion:1,id:'layout-h1',hiveId:'h1',profileId:PROFILE,mode:Layout.MODES.SINGLE_FAMILY,purpose,
  sections:[{id:'s-combined',position:'combined',familyId:'f1',broodBodyIds:bodyIds,upperBroodBodyId:bodyIds.at(-1),openings}],
  stacks:[{id:'combined',position:'combined',sectionIds:['s-combined'],bottomItemId:'bottom'}],
  technicalConnections:[],meshDiaphragms:[],temporaryQueenIsolation:[],closedOpenings:[]
 };
 const items={bottom:makeItem('bottom','bottom',{type:'hive',hiveId:'h1',stackId:'combined'})};
 if(purpose==='primary_wintering'){
  layout.closuresConfirmed=true;
  layout.closedOpenings=[
   {itemId:'p1',bodyId:'b2',openingId:'o1'},
   {itemId:'p2',bodyId:'b3',openingId:'o2'}
  ];
  items.p1=makeItem('p1','plasticPlug',{type:'hive',hiveId:'h1',bodyId:'b2',openingId:'o1'});
  items.p2=makeItem('p2','plasticPlug',{type:'hive',hiveId:'h1',bodyId:'b3',openingId:'o2'});
 }
 return {layout,state:{hives:[{id:'h1',profileId:PROFILE}],families:[family],queens:[{id:'q1',familyId:'f1',status:'current'}],equipmentInventory:{bodies,items,itemEvents:[]},sectionalLayouts:[layout],layouts:{}}};
}
function validateAll(state){
 const errors=[...Layout.inspect(state),...Equipment.inspect(state),...Equipment.validateReferences(state)];
 return errors;
}

test('accepts the confirmed first OP-04 row with three separate bottoms, top risers and covers',()=>{
 const {state,layout}=sideBySide();
 layout.broodRows=1;
 const bodyByPosition={left:'b1',middle:'b3',right:'b5'};
 const openingByPosition={left:[{id:'o1',bodyId:'b1',diameterMm:50}],middle:[{id:'o2',bodyId:'b3',diameterMm:50},{id:'o3',bodyId:'b3',diameterMm:50}],right:[{id:'o4',bodyId:'b5',diameterMm:50}]};
 for(const section of layout.sections){
  section.broodBodyIds=[bodyByPosition[section.position]];
  section.upperBroodBodyId=bodyByPosition[section.position];
  section.openings=openingByPosition[section.position];
 }
 const refs={o1:'b1',o2:'b3',o3:'b3',o4:'b5'};
 for(const connection of layout.technicalConnections)connection.openings=connection.openings.filter(opening=>Object.hasOwn(refs,opening.openingId));
 for(const id of ['gl3','gl4','gr3','gr4'])state.equipmentInventory.items[id].location={type:'storage',label:'Склад'};
 for(const connection of layout.technicalConnections)for(const opening of connection.openings){
  opening.bodyId=refs[opening.openingId];
  state.equipmentInventory.items[opening.itemId].location.bodyId=opening.bodyId;
 }
 assert.deepEqual(validateAll(state),[]);
 assert.equal(layout.stacks.length,3);
 assert.equal(layout.stacks.filter(row=>row.bottomItemId).length,3);
 assert.equal(layout.stacks.filter(row=>row.topRiserItemId).length,3);
 assert.equal(layout.stacks.filter(row=>row.coverItemId).length,3);
});

test('one-row SIDE_BY_SIDE rejects sections with inconsistent body counts',()=>{
 const {state,layout}=sideBySide();
 layout.broodRows=1;
 layout.sections[1].broodBodyIds=['b3','b4'];
 layout.sections[1].upperBroodBodyId='b4';
 assert.ok(Layout.inspect(state).some(error=>error.code==='section_brood_body_count_invalid'));
});

test('accepts three side-by-side sections with explicit bodies, openings, bottoms and two technical connections',()=>{
 const {state}=sideBySide(),before=JSON.stringify(state);
 assert.deepEqual(validateAll(state),[]);
 assert.equal(JSON.stringify(state),before,'validation must not mutate the physical state');
});

test('side-by-side layout requires one real cover and top riser for every stack',()=>{
 const missingCover=sideBySide();
 delete missingCover.layout.stacks[0].coverItemId;
 assert.ok(Layout.inspect(missingCover.state).some(error=>error.code==='section_stack_cover_required'));
 const missingTopRiser=sideBySide();
 delete missingTopRiser.layout.stacks[1].topRiserItemId;
 assert.ok(Layout.inspect(missingTopRiser.state).some(error=>error.code==='section_stack_top_riser_required'));
});

test('side-by-side layout allows at most one installed ceiling feeder without assuming its stack',()=>{
 const {state,layout}=sideBySide();
 state.equipmentInventory.items.feederMiddle=makeItem('feederMiddle','feeder',{type:'hive',hiveId:'h1',stackId:'sm'});
 layout.stacks[1].feederItemId='feederMiddle';
 assert.deepEqual(validateAll(state),[]);
 state.equipmentInventory.items.feederRight=makeItem('feederRight','feeder',{type:'hive',hiveId:'h1',stackId:'sr'});
 layout.stacks[2].feederItemId='feederRight';
 assert.ok(Layout.inspect(state).some(error=>error.code==='section_stack_feeder_count_invalid'));
});

test('side-by-side mode rejects remaining plastic plugs after OP-04 setup',()=>{
 const {state,layout}=sideBySide();
 state.equipmentInventory.items.plastic=makeItem('plastic','plasticPlug',{type:'hive',hiveId:'h1',bodyId:'b2',openingId:'o1'});
 layout.closedOpenings=[{bodyId:'b2',openingId:'o1',itemId:'plastic'}];
 assert.ok(Layout.inspect(state).some(error=>error.code==='side_by_side_plastic_plugs_must_be_removed'));
});

test('OP-05 coverage helper requires actual openings before checking plugs',()=>{
 const {layout}=sideBySide();
 layout.technicalConnections=[];
 assert.ok(Layout.validateTemporaryQueenIsolationCoverage(layout).some(error=>error.code==='temporary_queen_expected_openings_missing'));
 assert.deepEqual(Layout.validateTemporaryQueenIsolationCoverage({...layout,mode:Layout.MODES.SINGLE_FAMILY}),[{code:'temporary_queen_coverage_requires_side_by_side',details:{}}]);
});

test('OP-05 coverage helper requires exactly one mesh plug for every actual technical opening',()=>{
 const {layout}=sideBySide();
 const openingRefs=layout.technicalConnections.flatMap(connection=>connection.openings);
 layout.temporaryQueenIsolation=openingRefs.map((ref,index)=>({bodyId:ref.bodyId,openingId:ref.openingId,itemId:'mesh-'+index}));
 assert.deepEqual(Layout.validateTemporaryQueenIsolationCoverage(layout),[]);
 layout.temporaryQueenIsolation.pop();
 assert.ok(Layout.validateTemporaryQueenIsolationCoverage(layout).some(error=>error.code==='temporary_queen_plug_coverage_missing'));
 layout.temporaryQueenIsolation.push({...openingRefs[0],itemId:'mesh-duplicate'});
 assert.ok(Layout.validateTemporaryQueenIsolationCoverage(layout).some(error=>error.code==='temporary_queen_plug_coverage_duplicate'));
 layout.temporaryQueenIsolation=openingRefs.map((ref,index)=>({bodyId:ref.bodyId,openingId:ref.openingId,itemId:'mesh-'+index}));
 layout.temporaryQueenIsolation.push({bodyId:'unknown-body',openingId:'unknown-opening',itemId:'mesh-extra'});
 assert.ok(Layout.validateTemporaryQueenIsolationCoverage(layout).some(error=>error.code==='temporary_queen_plug_coverage_extra'));
});

test('rejects a missing explicit upper body instead of inferring the last array element',()=>{
 const {state,layout}=sideBySide();
 delete layout.sections[1].upperBroodBodyId;
 assert.ok(Layout.inspect(state).some(error=>error.code==='section_upper_body_reference_required'));
});

test('rejects duplicate brood-body ownership and legacy layout overlap',()=>{
 const duplicate=sideBySide();
 duplicate.layout.sections[1].broodBodyIds[0]='b2';
 assert.ok(Layout.inspect(duplicate.state).some(error=>error.code==='section_body_duplicate'));
 const legacy=sideBySide();
 legacy.state.layouts.h1={corpusIds:{A:'b2'}};
 assert.ok(Layout.inspect(legacy.state).some(error=>error.code==='section_body_also_in_legacy_layout'));
});

test('requires a common colony group and valid queen identity references',()=>{
 const group=sideBySide();group.state.families[2].colonyGroupId='other';
 assert.ok(Layout.inspect(group.state).some(error=>error.code==='section_colony_group_mismatch'));
 const queen=sideBySide();queen.state.families[0].currentQueenId='missing';
 assert.ok(Layout.inspect(queen.state).some(error=>error.code==='section_family_current_queen_invalid'));
});

test('technical connections require every brood-row opening and the buffer corridor',()=>{
 const buffer=sideBySide();buffer.layout.technicalConnections[0].bufferCorridorPresent=false;
 assert.ok(Layout.inspect(buffer.state).some(error=>error.code==='technical_connection_buffer_required'));
 const opening=sideBySide();opening.layout.technicalConnections[0].openings[1].openingId='missing';
 assert.ok(Layout.inspect(opening.state).some(error=>error.code==='technical_connection_opening_reference_invalid'));
});

test('alternative wintering accepts [2,1,1] with the two-body family in any vertical position',()=>{
 for(const position of ['lower','middle','upper']){
  const {state}=alternativeWintering(position);
  assert.deepEqual(validateAll(state),[],position);
 }
});

test('allows a technical grid to remain in a recorded opening when no inter-family connection is active',()=>{
 const {state,layout}=alternativeWintering('lower');
 layout.sections[0].openings=[{id:'o-winter',bodyId:'b2',diameterMm:50}];
 state.equipmentInventory.items.grid=makeItem('grid','technicalQueenExcluder',{type:'hive',hiveId:'h1',bodyId:'b2',openingId:'o-winter'});
 assert.deepEqual(validateAll(state),[]);
});

test('alternative wintering rejects distributions other than [2,1,1] and requires two distinct diaphragms',()=>{
 const distribution=alternativeWintering('lower');
 distribution.layout.sections[1].broodBodyIds.push('b3');
 assert.ok(Layout.inspect(distribution.state).some(error=>error.code==='wintering_body_distribution_invalid'));
 const diaphragms=alternativeWintering('lower');
 diaphragms.layout.meshDiaphragms[1].positionLabel='lower-middle';
 assert.ok(Layout.inspect(diaphragms.state).some(error=>error.code==='wintering_mesh_diaphragm_position_invalid'));
});

test('primary single-family wintering requires one plastic plug for every declared technical opening',()=>{
 const {state,layout}=singleFamily();
 assert.deepEqual(validateAll(state),[]);
 layout.closedOpenings.pop();
 delete state.equipmentInventory.items.p2;
 assert.ok(Layout.inspect(state).some(error=>error.code==='winter_plastic_plug_coverage_invalid'));
});

test('primary wintering requires explicit user confirmation of technical-opening closure',()=>{
 const {state,layout}=singleFamily();
 layout.closuresConfirmed=false;
 assert.ok(Layout.inspect(state).some(error=>error.code==='winter_technical_openings_closure_confirmation_required'));
});

test('each active technical connection requires two distinct opening references',()=>{
 const {state,layout}=sideBySide();
 layout.technicalConnections[0].openings.pop();
 assert.ok(Layout.inspect(state).some(error=>error.code==='technical_connection_opening_count_invalid'));
});

test('single-family layout accepts three or four brood bodies without inventing extra bodies',()=>{
 assert.deepEqual(validateAll(singleFamily('early_honey_merge',3).state),[]);
 assert.deepEqual(validateAll(singleFamily('early_honey_merge',4).state),[]);
});

function removeHoneyStageAccessories(state,layout){
 for(const stack of layout.stacks){
  for(const key of ['coverItemId','topRiserItemId']){
   const itemId=stack[key];
   if(itemId&&state.equipmentInventory.items[itemId])state.equipmentInventory.items[itemId].location={type:'storage',label:'Склад'};
   delete stack[key];
  }
 }
}

test('R4 accepts exactly two large excluders with FULL/HALF footprints on explicit upper bodies',()=>{
 const {state,layout}=sideBySide();
 removeHoneyStageAccessories(state,layout);
 state.equipmentInventory.bodies.hb1=makeBody('hb1','honey');
 state.equipmentInventory.bodies.hb2=makeBody('hb2','honey');
 const left=[{bodyId:'b2',coverage:'FULL'},{bodyId:'b4',coverage:'HALF'}];
 const right=[{bodyId:'b4',coverage:'HALF'},{bodyId:'b6',coverage:'FULL'}];
 state.equipmentInventory.items.hl=makeItem('hl','honeyQueenExcluder',{type:'hive',hiveId:'h1',footprint:left});
 state.equipmentInventory.items.hr=makeItem('hr','honeyQueenExcluder',{type:'hive',hiveId:'h1',footprint:right});
 layout.honeyStack={purpose:'early',bodyIds:['hb1','hb2'],excluders:[{side:'left',itemId:'hl'},{side:'right',itemId:'hr'}]};
 assert.deepEqual(validateAll(state),[]);
});

test('R4 rejects incorrect FULL/HALF section assignment and an unsupported early four-body stack',()=>{
 const {state,layout}=sideBySide();
 removeHoneyStageAccessories(state,layout);
 state.equipmentInventory.bodies.hb1=makeBody('hb1','honey');
 state.equipmentInventory.bodies.hb2=makeBody('hb2','honey');
 state.equipmentInventory.bodies.hb3=makeBody('hb3','honey');
 state.equipmentInventory.bodies.hb4=makeBody('hb4','honey');
 const wrong=[{bodyId:'b4',coverage:'FULL'},{bodyId:'b2',coverage:'HALF'}];
 state.equipmentInventory.items.hl=makeItem('hl','honeyQueenExcluder',{type:'hive',hiveId:'h1',footprint:wrong});
 state.equipmentInventory.items.hr=makeItem('hr','honeyQueenExcluder',{type:'hive',hiveId:'h1',footprint:[{bodyId:'b4',coverage:'HALF'},{bodyId:'b6',coverage:'FULL'}]});
 layout.honeyStack={purpose:'early',bodyIds:['hb1','hb2','hb3','hb4'],excluders:[{side:'left',itemId:'hl'},{side:'right',itemId:'hr'}]};
 assert.ok(Layout.inspect(state).some(error=>error.code==='honey_stack_body_count_invalid'));
 assert.ok(Layout.inspect(state).some(error=>error.code==='section_accessory_footprint_mismatch'));
});

test('rejects malformed optional physical-layout collections instead of silently ignoring them',()=>{
 const {state,layout}=sideBySide();
 layout.meshDiaphragms={bad:true};
 assert.ok(Layout.inspect(state).some(error=>error.code==='sectional_layout_array_invalid'&&error.details.field==='meshDiaphragms'));
});

test('legacy states without sectional layouts remain valid and are not rewritten',()=>{
 const state={hives:[{id:'old'}],families:[],equipmentInventory:{bodies:{},items:{},itemEvents:[]}};
 const before=JSON.stringify(state);
 assert.deepEqual(Layout.inspect(state),[]);
 assert.equal(JSON.stringify(state),before);
});

test('rejects duplicate layout identity and duplicate physical item references across layouts',()=>{
 const first=sideBySide();
 const second=sideBySide();
 second.layout.id='layout-2';
 second.layout.hiveId='h2';
 second.state.hives.push({id:'h2',profileId:PROFILE});
 second.state.sectionalLayouts=[first.layout,second.layout];
 second.state.equipmentInventory=first.state.equipmentInventory;
 second.state.families=first.state.families;
 second.state.queens=first.state.queens;
 assert.ok(Layout.inspect(second.state).some(error=>error.code==='sectional_layout_item_reused'));
});


test('OP-05 coverage helper is pure and derives its expected set from the actual layout',()=>{
 const {layout}=sideBySide();
 const openingRefs=layout.technicalConnections.flatMap(connection=>connection.openings);
 layout.temporaryQueenIsolation=openingRefs.map((ref,index)=>({bodyId:ref.bodyId,openingId:ref.openingId,itemId:'mesh-'+index}));
 const before=JSON.stringify(layout);
 assert.deepEqual(Layout.validateTemporaryQueenIsolationCoverage(layout),[]);
 assert.equal(JSON.stringify(layout),before);
 layout.technicalConnections[0].openings[0].openingId='opening-renamed';
 assert.ok(Layout.validateTemporaryQueenIsolationCoverage(layout).some(error=>error.code==='temporary_queen_plug_coverage_missing'&&error.details.openingId==='opening-renamed'));
});


test('two-row SIDE_BY_SIDE requires one opening per body in each outer section and two per body in the middle',()=>{
 const {state,layout}=sideBySide();
 assert.deepEqual(layout.sections.map(section=>section.openings.length),[2,4,2]);
 assert.deepEqual(layout.technicalConnections.map(connection=>connection.openings.length),[4,4]);
 const missingLower=sideBySide();
 missingLower.layout.sections[0].openings=missingLower.layout.sections[0].openings.filter(opening=>opening.bodyId!=='b1');
 missingLower.layout.technicalConnections[0].openings=missingLower.layout.technicalConnections[0].openings.filter(opening=>opening.openingId!=='o1');
 assert.ok(Layout.inspect(missingLower.state).some(error=>error.code==='section_opening_body_coverage_invalid'));
 assert.ok(Layout.inspect(missingLower.state).some(error=>error.code==='technical_connection_opening_count_invalid'));
});

test('every actual section opening must be linked to exactly one active technical connection',()=>{
 const {state,layout}=sideBySide();
 layout.sections[0].openings.push({id:'unlinked',bodyId:'b1',diameterMm:50});
 assert.ok(Layout.inspect(state).some(error=>error.code==='section_opening_body_coverage_invalid'));
 assert.ok(Layout.inspect(state).some(error=>error.code==='technical_opening_unlinked'));
});
