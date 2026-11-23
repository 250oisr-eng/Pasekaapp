import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};
new Function('window',readFileSync(new URL('../js/sectional-season-operations-wizard-v2.js',import.meta.url),'utf8'))(w);
const api=w.PasekaSeasonOperationsWizardV2;
function fixture(){
 const profile='sectional-multiqueen-v1';
 const bodies={};
 for(const id of ['b1','b2','b3','b4','b5','b6','foreign'])bodies[id]={id,kind:'brood',spec:{profileId:profile,framesPerBox:6},storageLocation:id==='foreign'?null:'склад',condition:'good',frames:[{frameId:id+'fr'}]};
 for(const [id,pairId]of [['h1','p1'],['h2','p1'],['h3','p2'],['h4','p2']])bodies[id]={id,kind:'honey',pairId,spec:{profileId:profile,framesPerBox:10},storageLocation:id==='h1'||id==='h2'?null:'склад',frames:[{frameId:id+'fr'}]};
 const items={};
 for(let i=1;i<=9;i++)items['plug'+i]={id:'plug'+i,kind:'metalMeshPlug',location:i===9?{type:'hive',hiveId:'other'}:{type:'storage',label:'склад'}};
 for(let i=1;i<=3;i++)items['ex'+i]={id:'ex'+i,kind:'honeyQueenExcluder',location:i===3?{type:'hive',hiveId:'other'}:{type:'hive',hiveId:'h1'}};
 for(let i=1;i<=2;i++){items['dia'+i]={id:'dia'+i,kind:'meshDiaphragm',condition:'good',location:{type:'storage',label:'склад'}};items['bottom'+i]={id:'bottom'+i,kind:'bottom',condition:'good',location:{type:'storage',label:'склад'}}}
 return {hives:[{id:'h1',profileId:profile},{id:'other',profileId:profile},{id:'farrar',profileId:'farrar'}],families:[1,2,3].map(i=>({id:'f'+i,hive:'h1'})),queens:[1,2,3].map(i=>({id:'q'+i,code:'Q'+i,familyId:'f'+i,status:'current'})),
  sectionalLayouts:[{id:'l1',hiveId:'h1',mode:'SIDE_BY_SIDE',sections:[{id:'left',position:'left',familyId:'f1',broodBodyIds:['b1','b2'],upperBroodBodyId:'b2'},{id:'middle',position:'middle',familyId:'f2',broodBodyIds:['b3','b4'],upperBroodBodyId:'b4'},{id:'right',position:'right',familyId:'f3',broodBodyIds:['b5','b6'],upperBroodBodyId:'b6'}],honeyStack:{bodyIds:['h1','h2']}},{id:'otherlayout',hiveId:'other',sections:[{broodBodyIds:['foreign']}]}],equipmentInventory:{bodies,items}};
}
const request=(op,values)=>({operationId:op,hiveId:'h1',occurredAt:'2026-11-22T10:00:00Z',userConfirmed:true,values});
test('all fourteen user-facing operation specifications exist without auto completion actions',()=>{
 assert.equal(api.descriptors.length,14);
 assert.deepEqual(api.descriptors.map(x=>x[0]),Array.from({length:14},(_,i)=>'OP-'+String(i+1).padStart(2,'0')));
 const src=readFileSync(new URL('../js/sectional-season-operations-wizard-v2.js',import.meta.url),'utf8');
 assert.doesNotMatch(src,/\.status\s*=\s*['"]DONE['"]/);
});
test('physical selection excludes foreign hives, foreign installed equipment and unrelated honey frames',()=>{
 const f=fixture();
 assert.ok(!api.candidates(f,'h1','body:brood').some(x=>x.id==='foreign'));
 assert.ok(!api.candidates(f,'h1','metalMeshPlug').some(x=>x.id==='plug9'));
 assert.ok(!api.candidates(f,'h1','honeyQueenExcluder').some(x=>x.id==='ex3'));
 assert.deepEqual(api.candidates(f,'h1','frame').map(x=>x.id),['h1fr','h2fr']);
});
test('OP02 uses only gramsPerColonyPerDay, not portions, and rejects invalid daily amounts',()=>{
 const f=fixture();
 const good=request('OP-02',{familyId:'f1',gramsPerColonyPerDay:200,proteinGivenToday:true});
 assert.deepEqual(api.validate(f,good),[]);
 for(const grams of [0,99,201,100.5])assert.ok(api.validate(f,{...good,values:{...good.values,gramsPerColonyPerDay:grams}}).length);
});
test('OP05 requires actual eight known plugs and level stand',()=>{
 const f=fixture(),r=request('OP-05',{standLevelConfirmed:true,plugIds:Array.from({length:8},(_,i)=>'plug'+(i+1))});
 assert.deepEqual(api.validate(f,r),[]);
 assert.ok(api.validate(f,{...r,values:{...r.values,plugIds:['plug1','plug9']}}).length);
});
test('OP06 cannot present two-queen outcome as safe mesh removal',()=>{
 const f=fixture(),r=request('OP-06',{queenIds:['q1','q2','q3'],layingObserved:true,twoQueenOutcome:true});
 assert.ok(api.validate(f,r).some(e=>e.code==='op06_two_queen_blocked'));
 assert.deepEqual(api.validate(f,{...r,values:{...r.values,twoQueenOutcome:false}}),[]);
});
test('OP07 requires complete honey pairs and exactly two own excluders',()=>{
 const f=fixture(),values={honeyBodyIds:['h1','h2'],excluderIds:['ex1','ex2'],leftExcluderId:'ex1',rightExcluderId:'ex2',honeyPurpose:'main',storageLabel:'склад',actualCoversRemoved:true,actualExcludersInstalled:true,actualHoneyBodiesInstalled:true,timingMode:'AFTER_OP06'};
 assert.deepEqual(api.validate(f,request('OP-07',values)),[]);
 assert.ok(api.validate(f,request('OP-07',{...values,honeyBodyIds:['h1','h3']})).some(e=>e.code==='honey_incomplete_pair'));
});
test('OP10 cannot silently leave installed honey body on hive',()=>{
 const f=fixture(),v={honeyBodyIds:['h1','h2'],excluderIds:['ex1','ex2'],storageLabel:'склад',actualHoneyStored:true,actualExcludersStored:true,coversReinstalled:true,stackAccessories:{}};
 f.sectionalLayouts[0].stacks=['left','middle','right'].map(id=>({id}));
 for(const id of ['left','middle','right']){
  v.stackAccessories[id]={coverItemId:'cover-'+id,topRiserItemId:'riser-'+id};
  f.equipmentInventory.items['cover-'+id]={id:'cover-'+id,kind:'cover',condition:'good',location:{type:'storage',label:'склад'}};
  f.equipmentInventory.items['riser-'+id]={id:'riser-'+id,kind:'topRiser',condition:'good',location:{type:'storage',label:'склад'}};
 }
 assert.deepEqual(api.validate(f,request('OP-10',v)),[]);
 assert.ok(api.validate(f,request('OP-10',{...v,honeyBodyIds:['h3','h4']})).some(e=>e.code==='honey_remove_not_current'));
});
test('OP11 requires exactly the three upper brood bodies',()=>{
 const f=fixture(),v={upperBodyIds:['b2','b4','b6'],actualMerge:true};
 f.sectionalLayouts[0].honeyStack=null;
 assert.deepEqual(api.validate(f,request('OP-11',v)),[]);
 assert.ok(api.validate(f,request('OP-11',{...v,upperBodyIds:['b1','b3','b5']})).some(e=>e.code==='winter_upper_bodies_mismatch'));
});
test('OP09 checks phase and actual observations of three sections',()=>{
 const f=fixture(),v={phase:'SUMMER_FULL',allSectionsObserved:true,sectionEntrances:['left','middle','right'].map(sectionId=>({sectionId,roundEntrances:'all_open',flatEntrance:'fully_open',personallyObserved:true}))};
 assert.deepEqual(api.validate(f,request('OP-09',v)),[]);
 assert.ok(api.validate(f,request('OP-09',{...v,allSectionsObserved:false})).length);
});
test('Farrar and timestamps from future cannot pass physical OP form validation',()=>{
 const f=fixture(),r=request('OP-01',{flightObserved:true,entrancesObserved:true});
 assert.deepEqual(api.validate(f,r),[]);
 assert.ok(api.validate(f,{...r,hiveId:'farrar'}).length);
 assert.ok(api.validate(f,{...r,occurredAt:'2099-11-22T10:00:00Z'}).length);
});
test('wizard validates without mutating any registered family, queen, frame or inventory item',()=>{
 const f=fixture();f.sectionalLayouts[0].honeyStack=null;
 const old=structuredClone(f);
 const r=request('OP-11',{upperBodyIds:['b2','b4','b6'],actualMerge:true});
 api.validate(f,r);api.candidates(f,'h1','frame');
 assert.deepEqual(f,old);
});

test('OP04, OP08, OP12, OP13 and OP14 have non-placeholder witnessed input contracts',()=>{
 const f=fixture();
 const cases=[
  ['OP-04',{sourceFamilyId:'f1',threeSectionsObserved:true,secondRowObserved:false}],
  ['OP-08',{sealedFrameIds:['h1fr','h2fr'],sealingObserved:true,actualExtraction:true,actualHoneyBodyReturn:true}],
  ['OP-12',{diaphragmIds:['dia1','dia2'],winterBodyIds:['b1','b2','b3','b5'],strongestFamilyId:'f1',actualIsolation:true}],
  ['OP-13',{bottomIds:['bottom1','bottom2'],additionalBodyIds:['b5','b6'],actualSeparation:true}],
  ['OP-14',{honeyBodyIds:['h1','h2'],excluderIds:['ex1','ex2'],nestBodiesAfterHarvest:3,actualMerge:true}]
 ];
 for(const [id,values]of cases){
  const current=fixture();
  if(id==='OP-12')current.sectionalLayouts[0].honeyStack=null;
  if(id==='OP-13'){
   const l=current.sectionalLayouts[0];l.mode='ALTERNATIVE_WINTERING_COLUMN';l.honeyStack=null;
   l.sections=[
    {id:'lower',position:'lower',familyId:'f1',broodBodyIds:['b1','b2']},
    {id:'middle',position:'middle',familyId:'f2',broodBodyIds:['b3']},
    {id:'upper',position:'upper',familyId:'f3',broodBodyIds:['b4']}
   ];
  }
  if(id==='OP-14'){
   const source=fixture().sectionalLayouts[0];
   current.sectionalLayouts[0].sections=source.sections;
   current.sectionalLayouts[0].mode='SIDE_BY_SIDE';
   current.sectionalLayouts[0].honeyStack={purpose:'early',bodyIds:['h1','h2'],excluders:[{itemId:'ex1'},{itemId:'ex2'}]};
  }
  assert.deepEqual(api.validate(current,request(id,values)),[],id+' should accept a fully supplied witnessed form');
  const required={'OP-04':'threeSectionsObserved','OP-08':'sealingObserved','OP-12':'actualIsolation','OP-13':'actualSeparation','OP-14':'actualMerge'}[id];
  const bad={...values,[required]:false};
  assert.ok(api.validate(current,request(id,bad)).length>0,id+' must reject invalid proof');
 }
});
test('OP03 cannot claim physical swap if current layout positions disagree',()=>{
 const f=fixture(),r=request('OP-03',{topBodyId:'b3',bottomBodyId:'b1',middleStayed:true});
 assert.ok(api.validate(f,r).some(e=>e.code==='swap_actual_position_mismatch'));
 f.sectionalLayouts[0].mode='SINGLE_FAMILY';
 f.sectionalLayouts[0].sections=[{id:'combined',broodBodyIds:['b1','b2','b3']}];
 assert.deepEqual(api.validate(f,r),[]);
});

test('OP07 12–15-day option passes the exact coordinator timing enum, without inventing a new mode',()=>{
 const f=fixture(),values={honeyBodyIds:['h1','h2'],excluderIds:['ex1','ex2'],leftExcluderId:'ex1',rightExcluderId:'ex2',honeyPurpose:'main',storageLabel:'склад',actualCoversRemoved:true,actualExcludersInstalled:true,actualHoneyBodiesInstalled:true,timingMode:'APPROX_12_DAYS_AFTER_SECOND_ROW'};
 assert.deepEqual(api.validate(f,request('OP-07',values)),[]);
 assert.ok(api.validate(f,request('OP-07',{...values,timingMode:'APPROX_12_15_DAYS_AFTER_SECOND_ROW'})).some(e=>e.code==='timing_invalid'));
});


test('OP11 blocks winter merge while the honey layer is still physically installed',()=>{
 const f=fixture(),r=request('OP-11',{upperBodyIds:['b2','b4','b6'],actualMerge:true});
 assert.ok(api.validate(f,r).some(e=>e.code==='winter_source_layout_not_ready'));
});
test('OP12 requires 2+1+1 from actual installed brood bodies and personally chosen strongest family',()=>{
 const f=fixture();f.sectionalLayouts[0].honeyStack=null;
 const values={diaphragmIds:['dia1','dia2'],winterBodyIds:['b1','b2','b3','b5'],
  strongestFamilyId:'f1',actualIsolation:true};
 assert.deepEqual(api.validate(f,request('OP-12',values)),[]);
 assert.ok(api.validate(f,request('OP-12',{...values,winterBodyIds:['b1','b2','b3','b4']}))
  .some(e=>e.code==='op12_physical_2_1_1_not_proven'));
 assert.ok(api.validate(f,request('OP-12',{...values,strongestFamilyId:'f2'}))
  .some(e=>e.code==='op12_strongest_family_not_confirmed'));
 f.equipmentInventory.items.dia2.location={type:'hive',hiveId:'h1'};
 assert.ok(api.validate(f,request('OP-12',values)).some(e=>e.code==='op12_diaphragms_not_from_storage'));
});
test('OP13 only accepts alternative wintering and freely available stored bottoms/bodies',()=>{
 const f=fixture(),values={bottomIds:['bottom1','bottom2'],additionalBodyIds:['b5','b6'],
  actualSeparation:true};
 assert.ok(api.validate(f,request('OP-13',values)).some(e=>e.code==='op13_source_wintering_layout_invalid'));
 const l=f.sectionalLayouts[0];l.mode='ALTERNATIVE_WINTERING_COLUMN';l.honeyStack=null;
 l.sections=[
  {id:'lower',position:'lower',broodBodyIds:['b1','b2']},
  {id:'middle',position:'middle',broodBodyIds:['b3']},
  {id:'upper',position:'upper',broodBodyIds:['b4']}
 ];
 assert.deepEqual(api.validate(f,request('OP-13',values)),[]);
 f.equipmentInventory.items.bottom1.location={type:'hive',hiveId:'h1'};
 assert.ok(api.validate(f,request('OP-13',values)).some(e=>e.code==='op13_bottoms_not_in_storage'));
});
test('OP14 refuses main honey or incorrect identity of installed early pair',()=>{
 const f=fixture(),values={honeyBodyIds:['h1','h2'],excluderIds:['ex1','ex2'],
  nestBodiesAfterHarvest:3,actualMerge:true};
 assert.ok(api.validate(f,request('OP-14',values)).some(e=>e.code==='op14_original_early_honey_layout_mismatch'));
 f.sectionalLayouts[0].honeyStack={purpose:'early',bodyIds:['h1','h2'],
  excluders:[{itemId:'ex1'},{itemId:'ex2'}]};
 assert.deepEqual(api.validate(f,request('OP-14',values)),[]);
 assert.ok(api.validate(f,request('OP-14',{...values,honeyBodyIds:['h3','h4']}))
  .some(e=>e.code==='op14_original_early_honey_layout_mismatch'));
});


test('OP08 requires actual extraction and return, not just visually sealed honey',()=>{
 const f=fixture(),v={sealedFrameIds:['h1fr'],sealingObserved:true,
  actualExtraction:true,actualHoneyBodyReturn:true};
 assert.deepEqual(api.validate(f,request('OP-08',v)),[]);
 for(const missing of ['actualExtraction','actualHoneyBodyReturn']){
  assert.ok(api.validate(f,request('OP-08',{...v,[missing]:false}))
   .some(e=>e.code==='confirmation_missing'));
 }
});
test('OP09 requires three individually witnessed entrance configurations',()=>{
 const f=fixture(),sections=['left','middle','right'].map(sectionId=>({
  sectionId,roundEntrances:'one_open',flatEntrance:'one_bee_width',personallyObserved:true
 }));
 const v={phase:'AUTUMN_REDUCED',allSectionsObserved:true,sectionEntrances:sections};
 assert.deepEqual(api.validate(f,request('OP-09',v)),[]);
 for(const changed of [
  sections.slice(0,2),
  sections.map((s,i)=>i===1?{...s,personallyObserved:false}:s),
  sections.map((s,i)=>i===1?{...s,flatEntrance:'fully_open'}:s),
  sections.map((s,i)=>i===1?{...s,sectionId:'left'}:s)
 ])assert.ok(api.validate(f,request('OP-09',{...v,sectionEntrances:changed}))
  .some(e=>e.code==='op09_actual_sections_not_verified'));
});
