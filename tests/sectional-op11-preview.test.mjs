import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const appWindow={};
for(const name of ['sectional-physical-layout.js','sectional-op11-preview.js']){
 const source=await readFile(new URL('../js/'+name,import.meta.url),'utf8');
 new Function('window',source)(appWindow);
}
const Layout=appWindow.PasekaSectionalPhysicalLayout;
const OP11=appWindow.PasekaSectionalOP11Preview;
const PROFILE='sectional-multiqueen-v1';
const NOW='2026-11-28T10:00:00.000Z';
const item=(id,kind,location)=>({id,kind,condition:'good',location,events:[]});
const body=id=>({id,kind:'brood',condition:'good',spec:{profileId:PROFILE,framesPerBox:6},
 frames:Array.from({length:6},(_,i)=>({frameId:id+'-'+i,history:[]}))});
function fixture(){
 const section=(suffix,position,bodyIds,openings)=>({
  id:'s-'+suffix,position,familyId:'f-'+suffix,broodBodyIds:bodyIds,
  upperBroodBodyId:bodyIds[1],openings:openings.map(([id,bodyId])=>({id,bodyId,diameterMm:50}))
 });
 const sections=[
  section('l','left',['b1','b2'],[['o1','b1'],['o5','b2']]),
  section('m','middle',['b3','b4'],[['o2','b3'],['o3','b3'],['o6','b4'],['o7','b4']]),
  section('r','right',['b5','b6'],[['o4','b5'],['o8','b6']])
 ];
 const stacks=['l','m','r'].map((suffix,i)=>({
  id:'s'+suffix,position:['left','middle','right'][i],sectionIds:['s-'+suffix],
  bottomItemId:'b'+suffix,coverItemId:'c'+suffix,topRiserItemId:'t'+suffix
 }));
 const byOpening=Object.fromEntries(sections.flatMap(s=>s.openings.map(o=>[o.id,{
  bodyId:o.bodyId,sectionId:s.id
 }])));
 const connections=[
  {id:'lm',fromSectionId:'s-l',toSectionId:'s-m',bufferCorridorPresent:true,
   openings:['o1','o2','o5','o6'].map((openingId,i)=>({
    ...byOpening[openingId],openingId,itemId:'grid-'+openingId
   }))},
  {id:'mr',fromSectionId:'s-m',toSectionId:'s-r',bufferCorridorPresent:true,
   openings:['o3','o4','o7','o8'].map(openingId=>({
    ...byOpening[openingId],openingId,itemId:'grid-'+openingId
   }))}
 ];
 const items={};
 for(const suffix of ['l','m','r']){
  const stackId='s'+suffix;
  for(const [prefix,kind] of [['b','bottom'],['c','cover'],['t','topRiser']]){
   const id=prefix+suffix;items[id]=item(id,kind,{type:'hive',hiveId:'h',stackId});
  }
 }
 for(const [openingId,location] of Object.entries(byOpening)){
  const id='grid-'+openingId;
  items[id]=item(id,'technicalQueenExcluder',{type:'hive',hiveId:'h',
   bodyId:location.bodyId,openingId});
 }
 for(const id of ['p1','p2','p3','p4'])
  items[id]=item(id,'plasticPlug',{type:'storage',label:'Склад'});
 items.fd=item('fd','feeder',{type:'storage',label:'Склад'});
 const layout={
  id:'layout-h',schemaVersion:1,profileId:PROFILE,hiveId:'h',
  mode:'SIDE_BY_SIDE',broodRows:2,sections,stacks,technicalConnections:connections,
  meshDiaphragms:[],temporaryQueenIsolation:[],closedOpenings:[]
 };
 const state={
  meta:{revisionId:'r1'},hives:[{id:'h',profileId:PROFILE}],
  families:['l','m','r'].map(s=>({id:'f-'+s,hive:'h',recordStatus:'active',
   colonyGroupId:'g',queenIdentityStatus:'unresolved',currentQueenId:null})),
  queens:[],equipmentInventory:{bodies:Object.fromEntries(
   ['b1','b2','b3','b4','b5','b6'].map(id=>[id,body(id)])),items},
  sectionalLayouts:[layout],layouts:{}
 };
 return state;
}
const selection=()=>({
 hiveId:'h',expectedRevisionId:'r1',lowerBodyId:'b2',middleBodyId:'b4',
 upperBodyId:'b6',bottomItemId:'bl',coverItemId:'cl',topRiserItemId:'tl',
 feederItemId:'fd',plugAssignments:{o5:'p1',o6:'p2',o7:'p3',o8:'p4'},
 ventilationOption:'upper_only'
});
test('OP11 source has three registered two-body families and valid physical layout',()=>{
 const state=fixture();
 assert.deepEqual(Layout.validate(state.sectionalLayouts[0],state),{valid:true,errors:[]});
});
test('OP11 read-only plan preserves exactly three upper body IDs and never invents a surviving queen',()=>{
 const state=fixture(),before=structuredClone(state),r=OP11.preview(state,selection());
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.readOnly,true);assert.equal(r.readyForPersistence,false);
 assert.deepEqual(r.retainedBodyIds,['b2','b4','b6']);
 assert.deepEqual(r.removedBodyIds,['b1','b3','b5']);
 assert.deepEqual(r.removedBottomItemIds,['bm','br']);
 assert.deepEqual(r.closureAssignments.map(x=>x.openingId),['o5','o6','o7','o8']);
 assert.equal(r.removeTechnicalExcluderItemIds.length,8);
 assert.deepEqual(r.originalFamilyIds,['f-l','f-m','f-r']);
 assert.equal(r.queenIdentityStatus,'unresolved');assert.equal(r.survivingQueenId,null);
 assert.equal(r.completionRecorded,false);
 assert.ok(r.confirmationsStillRequired.includes('brood_nearly_absent'));
 assert.deepEqual(state,before,'never modify bees, queens, equipment or journals');
});
test('OP11 allows user-chosen ordering without automatic orientation or queen selection',()=>{
 const state=fixture(),input=selection(),before=structuredClone(state);
 input.lowerBodyId='b6';input.middleBodyId='b2';input.upperBodyId='b4';
 input.ventilationOption='lower_round_plus_ceiling';
 const r=OP11.preview(state,input);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.deepEqual(r.retainedBodyIds,['b6','b2','b4']);
 assert.equal(r.ventilationOption,'lower_round_plus_ceiling');
 assert.equal(r.queenIdentityStatus,'unresolved');
 assert.deepEqual(state,before);
});
test('OP11 source revision, exact upper body IDs and each unique closure are fail closed',()=>{
 const base=fixture(),before=structuredClone(base);
 for(const patch of [
  {expectedRevisionId:'stale'},
  {lowerBodyId:'b1'},
  {upperBodyId:'b2'},
  {plugAssignments:{o5:'p1',o6:'p2',o7:'p3'}},
  {plugAssignments:{o5:'p1',o6:'p1',o7:'p3',o8:'p4'}},
  {plugAssignments:{o5:'p1',o6:'p2',o7:'p3',o1:'p4'}},
  {ventilationOption:'autoselect'},
  {bottomItemId:'unknown'},
  {feederItemId:'cl'}
 ]){
  const res=OP11.preview(base,{...selection(),...patch});
  assert.equal(res.ok,false,JSON.stringify(patch));
  assert.deepEqual(base,before,'rejection must not mutate source');
 }
});
test('OP11 refuses foreign profiles, honey stage, invalid physical state and occupied plugs',()=>{
 const base=fixture();
 for(const modify of [
  state=>{state.hives[0].profileId='farrar-6x6-v1';},
  state=>{state.sectionalLayouts[0].honeyStack={purpose:'main',bodyIds:[]};},
  state=>{state.sectionalLayouts[0].sections[0].upperBroodBodyId='b1';},
  state=>{state.equipmentInventory.items.p1.location={type:'hive',hiveId:'h',stackId:'sl'};},
  state=>{state.sectionalLayouts[0].technicalConnections[0].openings[0].itemId='missing';}
 ]){
  const state=structuredClone(base),before=structuredClone(state);
  const out=OP11.preview(state,selection());
  assert.equal(out.ok,false);
  assert.deepEqual(state,before);
 }
});
test('OP11 preflight never completes operation even when all selections are supplied',()=>{
 const state=fixture(),input=selection();input.userConfirmed=true;
 input.actualWorkConfirmed=true;input.survivingQueenId='q-fictional';
 const out=OP11.preview(state,input);
 assert.equal(out.ok,true);
 assert.equal(out.completionRecorded,false);
 assert.equal(out.readyForPersistence,false);
 assert.equal(out.survivingQueenId,null);
 assert.equal(state.families.length,3);
 assert.deepEqual(state.queens,[]);
});
