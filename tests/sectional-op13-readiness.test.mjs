import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const sandbox={};
for(const name of ['sectional-physical-layout.js','sectional-op13-readiness.js']){
 const code=await readFile(new URL('../js/'+name,import.meta.url),'utf8');
 new Function('window',code)(sandbox);
}
const Layout=sandbox.PasekaSectionalPhysicalLayout;
const OP13=sandbox.PasekaSectionalOP13Readiness;
const PROFILE='sectional-multiqueen-v1';
const makeItem=(itemId,kind,location)=>({id:itemId,kind,condition:'good',location,events:[]});
function fixture(){
 const bodies=Object.fromEntries(['b1','b2','b3','b4'].map(id=>[id,{
  id,kind:'brood',condition:'good',spec:{profileId:PROFILE,framesPerBox:6},
  frames:Array.from({length:6},(_,n)=>({frameId:id+'-'+n,history:[]}))
 }]));
 const sections=[
  {id:'s-lower',position:'lower',familyId:'f1',broodBodyIds:['b1','b2'],upperBroodBodyId:'b2',openings:[]},
  {id:'s-middle',position:'middle',familyId:'f2',broodBodyIds:['b3'],upperBroodBodyId:'b3',openings:[]},
  {id:'s-upper',position:'upper',familyId:'f3',broodBodyIds:['b4'],upperBroodBodyId:'b4',openings:[]}
 ];
 const layout={
  id:'layout-h1',schemaVersion:1,profileId:PROFILE,hiveId:'h1',mode:'ALTERNATIVE_WINTERING_COLUMN',
  sections,stacks:[{id:'column',position:'column',sectionIds:sections.map(s=>s.id),
   bottomItemId:'bc',boundaries:['lower-middle','middle-upper']}],
  technicalConnections:[],temporaryQueenIsolation:[],closedOpenings:[],
  meshDiaphragms:[{itemId:'d1',positionLabel:'lower-middle'},{itemId:'d2',positionLabel:'middle-upper'}]
 };
 const items={
  bc:makeItem('bc','bottom',{type:'hive',hiveId:'h1',stackId:'column'}),
  d1:makeItem('d1','meshDiaphragm',{type:'hive',hiveId:'h1',stackId:'column',positionLabel:'lower-middle'}),
  d2:makeItem('d2','meshDiaphragm',{type:'hive',hiveId:'h1',stackId:'column',positionLabel:'middle-upper'}),
  bottom2:makeItem('bottom2','bottom',{type:'storage',label:'Склад'}),
  bottom3:makeItem('bottom3','bottom',{type:'storage',label:'Склад'})
 };
 const families=[1,2,3].map(n=>({id:'f'+n,hive:'h1',recordStatus:'active',colonyGroupId:'g',
  queenIdentityStatus:'identified',currentQueenId:'q'+n}));
 const queens=[1,2,3].map(n=>({id:'q'+n,familyId:'f'+n,status:'current'}));
 const winter={
  id:'winter-evt',type:'alternative_wintering_configured',operationId:'OP-12',
  hiveId:'h1',techProcessId:'season',familyIds:['f1','f2','f3'],diaphragmItemIds:['d1','d2'],
  layout:[{familyId:'f1',position:'lower',bodyCount:2},
   {familyId:'f2',position:'middle',bodyCount:1},{familyId:'f3',position:'upper',bodyCount:1}]
 };
 return {meta:{revisionId:'r1'},hives:[{id:'h1',profileId:PROFILE}],families,queens,
  sectionalLayouts:[layout],familyEvents:[winter],equipmentInventory:{bodies,items},layouts:{}};
}
const request=()=>({hiveId:'h1',expectedRevisionId:'r1',
 bottomAssignments:{f2:'bottom2',f3:'bottom3'},firstFlightDate:'2027-03-19',strengthObserved:true});

test('OP13 synthetic winter fixture passes real physical validator',()=>{
 const s=fixture();
 assert.deepEqual(Layout.validate(s.sectionalLayouts[0],s),{valid:true,errors:[]});
});
test('OP13 read-only one-body spring plan preserves lower family, original bodies and all history',()=>{
 const s=fixture(),before=structuredClone(s);
 const out=OP13.preview(s,request());
 assert.equal(out.ok,true,JSON.stringify(out));
 assert.equal(out.readOnly,true);assert.equal(out.readyForPersistence,false);assert.equal(out.completionRecorded,false);
 assert.equal(out.strongFamilyId,'f1');
 assert.deepEqual(out.strongFamilyBodyIds,['b1','b2']);
 assert.deepEqual(out.moves,[
  {familyId:'f2',fromPosition:'middle',retainedBodyId:'b3',
   toBottomItemId:'bottom2',bodyIdsAfterMove:['b3'],queenIdentityNotChanged:true},
  {familyId:'f3',fromPosition:'upper',retainedBodyId:'b4',
   toBottomItemId:'bottom3',bodyIdsAfterMove:['b4'],queenIdentityNotChanged:true}
 ]);
 assert.deepEqual(out.diaphragmItemIdsToRemove,['d1','d2']);
 assert.equal(out.additionalBroodBodiesNotAutomaticallyInstalled,true);
 assert.equal(out.strengthObservedByBeekeeper,true);
 assert.deepEqual(s,before);
 out.moves[0].bodyIdsAfterMove.push('forged');
 assert.deepEqual(s,before,'caller cannot mutate source by changing returned plan');
});
test('OP13 leaves approximate 1.5-month interval as a guide, never a hard calendar completion gate',()=>{
 const s=fixture();
 for(const firstFlightDate of ['2027-04-25','2027-02-01']){
  const out=OP13.preview(s,{...request(),firstFlightDate,strengthObserved:false});
  assert.equal(out.ok,true,firstFlightDate);
  assert.equal(out.firstFlightDate,firstFlightDate);
  assert.equal(out.strengthObservedByBeekeeper,false);
  assert.equal(out.completionRecorded,false);
  assert.match(out.seasonalTiming,/guideline_only/);
 }
});
test('OP13 fails closed on stale revision, wrong profile, wrong physical mode and missing winter event',()=>{
 const cases=[
  [s=>{s.meta.revisionId='changed'},'op13_stale_revision'],
  [s=>{s.hives[0].profileId='farrar'},'op13_sectional_profile_required'],
  [s=>{s.sectionalLayouts[0].mode='SINGLE_FAMILY'},null],
  [s=>{s.familyEvents=[]},'op13_unique_confirmed_op12_evidence_required'],
  [s=>{s.familyEvents[0].layout[0].bodyCount=1},'op13_winter_evidence_layout_mismatch'],
  [s=>{s.sectionalLayouts[0].meshDiaphragms.pop()},null],
  [s=>{s.familyEvents.push({type:'placement_changed',operationId:'OP-13',hiveId:'h1',techProcessId:'season'})},'op13_spring_move_already_recorded']
 ];
 for(const [mutate,expected] of cases){
  const s=fixture();mutate(s);const before=structuredClone(s),out=OP13.preview(s,request());
  assert.equal(out.ok,false,expected||'invalid physical source must fail');
  if(expected)assert.equal(out.error,expected);
  assert.deepEqual(s,before);
 }
});
test('OP13 refuses duplicate, installed, damaged or wrongly typed bottoms without mutating state',()=>{
 for(const patch of [
  r=>{r.bottomAssignments.f3='bottom2'},
  r=>{r.bottomAssignments.f3='bc'},
  r=>{r.bottomAssignments.f3='missing'},
  r=>{delete r.bottomAssignments.f3},
  r=>{r.bottomAssignments.f1='bottom2'},
 ]){
  const s=fixture(),r=request(),before=structuredClone(s);patch(r);
  const out=OP13.preview(s,r);
  assert.equal(out.ok,false,JSON.stringify(r));
  assert.deepEqual(s,before);
 }
 for(const change of [
  item=>{item.condition='retired'},
  item=>{item.kind='cover'},
  item=>{item.location={type:'hive',hiveId:'h1',stackId:'column'}}
 ]){
  const s=fixture();change(s.equipmentInventory.items.bottom3);
  const before=structuredClone(s),out=OP13.preview(s,request());
  assert.equal(out.ok,false);
  assert.deepEqual(s,before);
 }
});
test('OP13 never completes physical relocation even when caller sets userConfirmed',()=>{
 const s=fixture(),before=structuredClone(s),out=OP13.preview(s,{...request(),userConfirmed:true,done:true});
 assert.equal(out.ok,true);
 assert.equal(out.completionRecorded,false);assert.equal(out.readyForPersistence,false);
 assert.equal(s.familyEvents.length,1);assert.deepEqual(s,before);
});

test('OP13 ambiguous multi-year winter records require explicit techProcessId and remain read only',()=>{
 const s=fixture(),prior=structuredClone(s.familyEvents[0]);
 prior.id='old-season-event';prior.techProcessId='previous-year';
 s.familyEvents.unshift(prior);
 const before=structuredClone(s);
 const ambiguous=OP13.preview(s,request());
 assert.equal(ambiguous.ok,false);
 assert.equal(ambiguous.error,'op13_unique_confirmed_op12_evidence_required');
 const selected=OP13.preview(s,{...request(),techProcessId:'season'});
 assert.equal(selected.ok,true,JSON.stringify(selected));
 assert.equal(selected.techProcessId,'season');
 assert.deepEqual(s,before);
});
test('OP13 accepts absent first-flight date but rejects invalid calendar dates without throwing or mutation',()=>{
 const s=fixture(),before=structuredClone(s);
 const unspecified=OP13.preview(s,{...request(),firstFlightDate:null});
 assert.equal(unspecified.ok,true);assert.equal(unspecified.firstFlightDate,null);
 for(const firstFlightDate of ['2027-02-31','2027-13-01','2027/03/01','not-a-date','']){
  const out=OP13.preview(s,{...request(),firstFlightDate});
  assert.equal(out.ok,false,firstFlightDate);
  assert.equal(out.error,'op13_first_flight_date_invalid',firstFlightDate);
 }
 assert.deepEqual(s,before);
});
