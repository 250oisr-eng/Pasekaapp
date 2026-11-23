import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};
new Function('window',readFileSync(new URL('../js/sectional-season-operations-wizard-v2.js',import.meta.url),'utf8'))(w);
const api=w.PasekaSeasonOperationsWizardV2;
function fixture(){
 const profile='sectional-multiqueen-v1';
 const bodies={};
 for(const id of ['b1','b2','b3','b4','b5','b6','foreign'])bodies[id]={id,kind:'brood',spec:{profileId:profile,framesPerBox:6},storageLocation:id==='foreign'?null:'склад',frames:[{frameId:id+'fr'}]};
 for(const [id,pairId]of [['h1','p1'],['h2','p1'],['h3','p2'],['h4','p2']])bodies[id]={id,kind:'honey',pairId,spec:{profileId:profile,framesPerBox:10},storageLocation:id==='h1'||id==='h2'?null:'склад',frames:[{frameId:id+'fr'}]};
 const items={};
 for(let i=1;i<=9;i++)items['plug'+i]={id:'plug'+i,kind:'metalMeshPlug',location:i===9?{type:'hive',hiveId:'other'}:{type:'storage',label:'склад'}};
 for(let i=1;i<=3;i++)items['ex'+i]={id:'ex'+i,kind:'honeyQueenExcluder',location:i===3?{type:'hive',hiveId:'other'}:{type:'hive',hiveId:'h1'}};
 for(let i=1;i<=2;i++){items['dia'+i]={id:'dia'+i,kind:'meshDiaphragm',location:{type:'storage',label:'склад'}};items['bottom'+i]={id:'bottom'+i,kind:'bottom',location:{type:'storage',label:'склад'}}}
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
 const f=fixture(),values={honeyBodyIds:['h1','h2'],excluderIds:['ex1','ex2'],timingMode:'AFTER_OP06'};
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
 assert.deepEqual(api.validate(f,request('OP-11',v)),[]);
 assert.ok(api.validate(f,request('OP-11',{...v,upperBodyIds:['b1','b3','b5']})).some(e=>e.code==='winter_upper_bodies_mismatch'));
});
test('OP09 checks phase and actual observations of three sections',()=>{
 const f=fixture(),v={phase:'SUMMER_FULL',allSectionsObserved:true};
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
 const f=fixture(),old=structuredClone(f);
 const r=request('OP-11',{upperBodyIds:['b2','b4','b6'],actualMerge:true});
 api.validate(f,r);api.candidates(f,'h1','frame');
 assert.deepEqual(f,old);
});

test('OP04, OP08, OP12, OP13 and OP14 have non-placeholder witnessed input contracts',()=>{
 const f=fixture();
 const cases=[
  ['OP-04',{sourceFamilyId:'f1',threeSectionsObserved:true,secondRowObserved:false}],
  ['OP-08',{sealedFrameIds:['h1fr','h2fr'],sealingObserved:true}],
  ['OP-12',{diaphragmIds:['dia1','dia2'],winterBodyIds:['b1','b2','b3','b4'],actualIsolation:true}],
  ['OP-13',{bottomIds:['bottom1','bottom2'],additionalBodyIds:['b5','b6'],actualSeparation:true}],
  ['OP-14',{honeyBodyIds:['h1','h2'],excluderIds:['ex1','ex2'],nestBodiesAfterHarvest:3,actualMerge:true}]
 ];
 for(const [id,values]of cases){
  assert.deepEqual(api.validate(f,request(id,values)),[],id+' should accept a fully supplied witnessed form');
  const required={'OP-04':'threeSectionsObserved','OP-08':'sealingObserved','OP-12':'actualIsolation','OP-13':'actualSeparation','OP-14':'actualMerge'}[id];
  const bad={...values,[required]:false};
  assert.ok(api.validate(f,request(id,bad)).length>0,id+' must reject invalid proof');
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
 const f=fixture(),values={honeyBodyIds:['h1','h2'],excluderIds:['ex1','ex2'],timingMode:'APPROX_12_DAYS_AFTER_SECOND_ROW'};
 assert.deepEqual(api.validate(f,request('OP-07',values)),[]);
 assert.ok(api.validate(f,request('OP-07',{...values,timingMode:'APPROX_12_15_DAYS_AFTER_SECOND_ROW'})).some(e=>e.code==='timing_invalid'));
});
