import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};
for(const file of ['family-lineage.js','sectional-season-physical-executor-v2.js'])new Function('window',readFileSync(new URL('../js/'+file,import.meta.url),'utf8'))(w);
const exec=w.PasekaSectionalSeasonPhysicalExecutorV2.stage,lineage=w.PasekaFamilyLineage;
function fixture(){
 const at='2026-11-22T10:00:00Z',profile='sectional-multiqueen-v1';
 const sections=['left','middle','right'].map((position,i)=>({id:position,position,familyId:'f'+(i+1),broodBodyIds:['b'+(i*2+1),'b'+(i*2+2)],upperBroodBodyId:'b'+(i*2+2)}));
 const bodies=Object.fromEntries(Array.from({length:6},(_,i)=>{const id='b'+(i+1);return [id,{id,kind:'brood',condition:'good',spec:{profileId:profile,framesPerBox:6},frames:Array.from({length:6},(_,k)=>({frameId:id+'-'+k,history:[]})),events:[]}]}));
 const old={id:'l',hiveId:'h',profileId:profile,mode:'SIDE_BY_SIDE',sections,stacks:[]};
 const next={id:'l',hiveId:'h',profileId:profile,mode:'SINGLE_FAMILY',sections:[{id:'combined',position:'combined',familyId:'merged',broodBodyIds:['b2','b4','b6'],upperBroodBodyId:'b6'}],stacks:[]};
 const state={meta:{schemaVersion:15,revisionId:'r1'},hives:[{id:'h',profileId:profile}],sectionalSeasonCycles:[{id:'cy',hiveId:'h',status:'ACTIVE'}],sectionalTechProcesses:[],sectionalLayouts:[old],layouts:{},families:[1,2,3].map(i=>({id:'f'+i,hive:'h',recordStatus:'active',colonyGroupId:'g',queenIdentityStatus:'identified',currentQueenId:'q'+i})),queens:[1,2,3].map(i=>({id:'q'+i,familyId:'f'+i,status:'current'})),familyEvents:[],queenEvents:[],equipmentInventory:{bodies,items:{},events:[],itemEvents:[]},auditLog:[]};
 const left=new Set(['b2','b4','b6']);const loc=(id,layout)=>{
  const sec=layout.sections.find(s=>s.broodBodyIds.includes(id));
  return sec?{type:'sectional',hiveId:'h',layoutId:'l',bodyRole:'brood',sectionId:sec.id,position:sec.position}:null;
 };
 const req={operationId:'OP-11',hiveId:'h',occurredAt:at,userConfirmed:true,actualWorkConfirmed:true,actualMergeConfirmed:true,resultFamily:{id:'merged',hive:'h'},targetLayout:next,itemMoves:[],bodyMoves:Object.keys(bodies).map(bodyId=>({bodyId,from:loc(bodyId,old),to:left.has(bodyId)?loc(bodyId,next):{type:'storage',label:'склад'}})),storageLocations:{b1:'склад',b3:'склад',b5:'склад'}};
 let index=0;const deps={now:'2026-11-23T10:00:00Z',makeId:()=> 'evt-'+(++index),PasekaEquipmentItems:{place:()=>({ok:true})},PasekaFamilyLineage:lineage};
 return {state,req,deps};
}
test('real lineage API records confirmed OP11 merge while preserving all 3 queen histories',()=>{
 const f=fixture(),original=structuredClone(f.state);
 const result=exec(f.state,f.req,f.deps);
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.deepEqual(f.state,original);
 assert.equal(result.draft.sectionalTechProcesses.length,0);
 assert.equal(result.draft.familyEvents.at(-1).type,'merge');
 assert.equal(result.draft.families.find(x=>x.id==='merged').currentQueenId,null);
 assert.equal(result.draft.queens.filter(q=>q.status==='unknown').length,3);
 assert.deepEqual(lineage.inspect(result.draft),[]);
 assert.equal(result.draft.equipmentInventory.events.length,6);
 for(const id of ['b1','b3','b5'])assert.equal(result.draft.equipmentInventory.bodies[id].frames[0].history.at(-1).operationId,'OP-11');
});
test('actual lineage merge fails closed if a queen is not identified',()=>{
 const f=fixture();f.state.families[2].queenIdentityStatus='unresolved';
 const prior=structuredClone(f.state),result=exec(f.state,f.req,f.deps);
 assert.equal(result.ok,false);assert.deepEqual(f.state,prior);
});

test('real OP14 early-honey harvest and merge must preserve actual lineage with unresolved queen',()=>{
 const f=fixture();f.req.operationId='OP-14';f.req.earlyHoneyHarvestConfirmed=true;
 const before=structuredClone(f.state),result=exec(f.state,f.req,f.deps);
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.deepEqual(f.state,before);
 assert.equal(result.draft.familyEvents.filter(e=>e.operationId==='OP-14'&&e.type==='early_honey_harvest_completed').length,1);
 assert.equal(result.draft.familyEvents.filter(e=>e.operationId==='OP-14'&&e.type==='merge').length,1);
 assert.equal(result.draft.families.find(x=>x.id==='merged').currentQueenId,null);
 assert.deepEqual(lineage.inspect(result.draft),[]);
});
