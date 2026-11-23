import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const w={};new Function('window',readFileSync(new URL('../js/sectional-op07-manifest-v2.js',import.meta.url),'utf8'))(w);
const plan=w.PasekaSectionalOP07ManifestV2.plan;
function fixture(){
 const p='sectional-multiqueen-v1';
 const items={};
 for(const position of ['left','middle','right']){
  const stackId='stack-'+position;
  for(const [suffix,kind]of [['cover','cover'],['riser','topRiser']]){
   const id=suffix+'-'+position;items[id]={id,kind,condition:'good',location:{type:'hive',hiveId:'h',stackId}};
  }
 }
 for(const id of ['x1','x2'])items[id]={id,kind:'honeyQueenExcluder',condition:'good',location:{type:'storage',label:'склад'}};
 const bodies={};for(const [id,pair]of [['h1','p1'],['h2','p1'],['h3','p2'],['h4','p2']])bodies[id]={id,kind:'honey',condition:'good',pairId:pair,storageLocation:'склад',spec:{profileId:p,framesPerBox:10},frames:Array.from({length:10},(_,i)=>({frameId:id+i,combType:'drawn_comb',history:[]}))};
 const layout={schemaVersion:1,id:'layout',hiveId:'h',profileId:p,mode:'SIDE_BY_SIDE',broodRows:2,sections:['left','middle','right'].map((position,i)=>({id:position,position,upperBroodBodyId:'b'+(i*2+2),broodBodyIds:['b'+(i*2+1),'b'+(i*2+2)]})),stacks:['left','middle','right'].map(position=>({id:'stack-'+position,position,sectionIds:[position],coverItemId:'cover-'+position,topRiserItemId:'riser-'+position}))};
 const state={hives:[{id:'h',profileId:p}],sectionalLayouts:[layout],equipmentInventory:{bodies,items},sectionalSeasonCycles:[{id:'c',hiveId:'h',status:'ACTIVE',modelVersion:2,cycleNumber:1,events:[],compatProcess:{id:'c',hiveId:'h',modelVersion:1,state:{rowStage:2,operations:[{operationId:'OP-04',status:'DONE',completedAt:'2026-11-10T10:00:00Z',evidence:{secondRowAt:'2026-11-10T10:00:00Z'}}]}}}]}
 const req={hiveId:'h',cycleId:'c',occurredAt:'2026-11-23T10:00:00Z',userConfirmed:true,timingMode:'APPROX_12_DAYS_AFTER_SECOND_ROW',honeyPurpose:'main',storageLabel:'склад',actualCoversRemoved:true,actualExcludersInstalled:true,actualHoneyBodiesInstalled:true,honeyBodyIds:['h1','h2'],leftExcluderId:'x1',rightExcluderId:'x2'};
 return {state,req};
}
test('OP07 main honey physical manifest is derived from verified source upper bodies, not guessed',()=>{
 const f=fixture(),before=structuredClone(f.state),r=plan(f.state,f.req);
 assert.equal(r.ok,true,JSON.stringify(r));assert.deepEqual(f.state,before);
 assert.deepEqual(r.upperBroodBodyIds,['b2','b4','b6']);
 assert.equal(r.request.layout.honeyStack.bodyIds.length,2);
 assert.equal(r.request.itemMoves.length,8);
 assert.deepEqual(r.request.itemMoves.at(-2).location.footprint,[{bodyId:'b2',coverage:'FULL'},{bodyId:'b4',coverage:'HALF'}]);
 assert.deepEqual(r.request.itemMoves.at(-1).location.footprint,[{bodyId:'b4',coverage:'HALF'},{bodyId:'b6',coverage:'FULL'}]);
 assert.ok(r.request.layout.stacks.every(s=>!s.coverItemId&&!s.topRiserItemId));
});
test('early honey requires precisely 2 bodies; main honey supports only complete pairs',()=>{
 const f=fixture();f.req.honeyPurpose='early';f.req.honeyBodyIds=['h1','h2','h3','h4'];
 assert.equal(plan(f.state,f.req).ok,false);
 f.req.honeyPurpose='main';assert.equal(plan(f.state,f.req).ok,true);
 f.req.honeyBodyIds=['h1','h3'];assert.equal(plan(f.state,f.req).error,'op07_incomplete_body_pair');
});
test('OP07 refuses missing inventory position, forged right excluder, or uncertain confirmation',()=>{
 const f=fixture();f.state.equipmentInventory.items['cover-middle'].location.stackId='other';
 assert.equal(plan(f.state,f.req).ok,false);
 const x=fixture();x.req.rightExcluderId='x1';assert.equal(plan(x.state,x.req).ok,false);
 const y=fixture();y.req.actualExcludersInstalled=false;assert.equal(plan(y.state,y.req).ok,false);
});
test('OP07 does not use Farrar hive, wrong stage or future operation time',()=>{
 const f=fixture();f.state.hives[0].profileId='farrar';assert.equal(plan(f.state,f.req).ok,false);
 const x=fixture();x.state.sectionalLayouts[0].broodRows=1;assert.equal(plan(x.state,x.req).ok,false);
 const y=fixture();y.req.occurredAt='2099-01-01T00:00:00Z';assert.equal(plan(y.state,y.req).ok,false);
});

test('mobile OP07 inputs form a concrete reversible v2 request through actual manifest',()=>{
 const form={};new Function('window',readFileSync(new URL('../js/sectional-season-operations-wizard-v2.js',import.meta.url),'utf8'))(form);
 const w=form.PasekaSeasonOperationsWizardV2,source=fixture();
 // The source fixture already contains a real confirmed split for this cycle.
 const values={honeyBodyIds:['h1','h2'],excluderIds:['x1','x2'],leftExcluderId:'x1',rightExcluderId:'x2',
 honeyPurpose:'main',timingMode:'APPROX_12_DAYS_AFTER_SECOND_ROW',storageLabel:'склад',
 actualCoversRemoved:true,actualExcludersInstalled:true,actualHoneyBodiesInstalled:true};
 const draft={operationId:'OP-07',hiveId:'h',occurredAt:'2026-11-23T10:00:00Z',userConfirmed:true,values};
 const prior=structuredClone(source.state);
 assert.deepEqual(w.validate(source.state,draft),[]);
 const result=w.previewOP07(source.state,draft,{manifest:{plan}});
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.request.layout.honeyStack.excluders[0].side,'left');
 assert.deepEqual(source.state,prior);
 const swapped={...draft,values:{...values,rightExcluderId:'x1'}};
 assert.equal(w.previewOP07(source.state,swapped,{manifest:{plan}}).ok,false);
});

test('early honey OP07 refuses 3 foundation frames or adjacent foundation before any physical preview is presented',()=>{
 const a=fixture();a.req.honeyPurpose='early';
 a.state.equipmentInventory.bodies.h1.frames[2].combType='wax_foundation';
 a.state.equipmentInventory.bodies.h1.frames[4].combType='wax_foundation';
 a.state.equipmentInventory.bodies.h1.frames[6].combType='wax_foundation';
 assert.equal(plan(a.state,a.req).error,'op07_early_honey_requires_drawn_comb_and_separated_max_two_foundation');
 const b=fixture();b.req.honeyPurpose='early';b.state.equipmentInventory.bodies.h1.frames[3].combType='wax_foundation';b.state.equipmentInventory.bodies.h1.frames[4].combType='wax_foundation';
 assert.equal(plan(b.state,b.req).ok,false);
 const good=fixture();good.req.honeyPurpose='early';good.state.equipmentInventory.bodies.h1.frames[3].combType='wax_foundation';good.state.equipmentInventory.bodies.h1.frames[6].combType='wax_foundation';
 assert.equal(plan(good.state,good.req).ok,true);
});

test('OP07 early-modes reject wrong temporal claims and missing actual OP06 proof',()=>{
 const f=fixture();f.req.timingMode='WITH_SECOND_ROW';
 assert.equal(plan(f.state,f.req).error,'op07_simultaneous_timing_mismatch');
 f.req.timingMode='AFTER_OP06';
 assert.equal(plan(f.state,f.req).error,'op07_confirmed_op06_precondition_missing');
 f.state.sectionalSeasonCycles[0].compatProcess.state.operations.push({operationId:'OP-06',status:'DONE',completedAt:'2026-11-22T10:00:00Z'});
 assert.equal(plan(f.state,f.req).ok,true);
 const g=fixture();g.state.sectionalSeasonCycles[0].compatProcess.state.operations[0].evidence.secondRowAt='2026-11-15T10:00:00Z';
 assert.equal(plan(g.state,g.req).error,'op07_confirmed_12_15_day_range_required');
});
