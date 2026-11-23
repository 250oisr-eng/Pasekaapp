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

test('OP14 cannot record harvesting without the original physical honey and wintering evidence',()=>{
 const f=fixture();f.req.operationId='OP-14';f.req.earlyHoneyHarvestConfirmed=true;f.req.actualDiaphragmsRemovedConfirmed=true;f.req.familiesOnSeparateBottomsConfirmed=true;
 const before=structuredClone(f.state),r=exec(f.state,f.req,f.deps);
 assert.equal(r.error,'op14_honey_and_excluder_original_provenance_required');
 assert.deepEqual(f.state,before);
});
test('real OP14 early-honey harvest preserves installed honey and excluder footprints before merge',()=>{
 const f=fixture(),profile='sectional-multiqueen-v1',old=f.state.sectionalLayouts[0],inv=f.state.equipmentInventory;
 old.stacks=['left','middle','right'].map(id=>({id,bottomItemId:'bottom-'+id,sectionIds:[id]}));
 for(const id of ['left','middle','right'])inv.items['bottom-'+id]={id:'bottom-'+id,kind:'bottom',condition:'good',location:{type:'hive',hiveId:'h',stackId:id},events:[]};
 const honey=(id)=>({id,kind:'honey',condition:'good',spec:{profileId:profile,framesPerBox:10},pairId:'pair1',frames:Array.from({length:10},(_,i)=>({frameId:id+'fr'+i,history:[]})),events:[]});
 for(const id of ['h1','h2'])inv.bodies[id]=honey(id);
 const ex=(id,footprint)=>({id,kind:'honeyQueenExcluder',condition:'good',location:{type:'hive',hiveId:'h',footprint},events:[]});
 inv.items.x1=ex('x1',[{bodyId:'b2',coverage:'FULL'},{bodyId:'b4',coverage:'HALF'}]);
 inv.items.x2=ex('x2',[{bodyId:'b4',coverage:'HALF'},{bodyId:'b6',coverage:'FULL'}]);
 old.honeyStack={bodyIds:['h1','h2'],excluders:[{itemId:'x1',side:'left'},{itemId:'x2',side:'right'}]};
 inv.items.d1={id:'d1',kind:'meshDiaphragm',condition:'good',location:{type:'hive',hiveId:'h',positionLabel:'between-lower-middle'}};
 inv.items.d2={id:'d2',kind:'meshDiaphragm',condition:'good',location:{type:'hive',hiveId:'h',positionLabel:'between-middle-upper'}};
 const families=['f1','f2','f3'],winter=[{familyId:'f1',position:'lower',bodyCount:2},{familyId:'f2',position:'middle',bodyCount:1},{familyId:'f3',position:'upper',bodyCount:1}];
 const at='2026-11-21T10:00:00Z';
 const winterRecord=lineage.configureAlternativeWintering(f.state,{familyIds:families,diaphragmItemIds:['d1','d2'],layout:winter,techProcessId:'cy'},f.deps.makeId,at);
 assert.equal(winterRecord.ok,true,JSON.stringify(winterRecord));
 for(const [familyId,position,bodyIds,bottomItemId]of [['f2','middle',['b3','b4'],'bottom-middle'],['f3','upper',['b5','b6'],'bottom-right']]){
  const p=lineage.recordPlacementChanged(f.state,{familyIds:families,familyId,techProcessId:'cy',from:{position,bodyIds:[bodyIds[0]]},to:{position:'separate_bottom',bottomItemId,bodyIds}},f.deps.makeId,'2026-11-21T11:00:00Z');
  assert.equal(p.ok,true,JSON.stringify(p));
 }
 f.req.operationId='OP-14';f.req.earlyHoneyHarvestConfirmed=true;
 f.req.actualDiaphragmsRemovedConfirmed=true;f.req.familiesOnSeparateBottomsConfirmed=true;
 for(const id of ['h1','h2']){
  f.req.bodyMoves.push({bodyId:id,from:{type:'sectional',hiveId:'h',layoutId:'l',bodyRole:'honey',position:'shared-honey-stack'},to:{type:'storage',label:'склад'}});
  f.req.storageLocations[id]='склад';
 }
 f.req.itemMoves=[{itemId:'x1',location:{type:'storage',label:'склад'}},{itemId:'x2',location:{type:'storage',label:'склад'}}];
 f.deps.PasekaEquipmentItems.place=(state,request,makeId,at)=>{
  const item=state.equipmentInventory.items[request.itemId];if(!item)return {ok:false,error:'item_not_found'};
  const oldLocation=item.location;item.location=structuredClone(request.location);if(!Array.isArray(item.events))item.events=[];
  const event={id:makeId(),itemId:item.id,type:'moved_to_storage',at,from:oldLocation,to:item.location};
  item.events.push(event);state.equipmentInventory.itemEvents.push(event);
  return {ok:true,item};
 };
 const before=structuredClone(f.state),r=exec(f.state,f.req,f.deps);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.deepEqual(f.state,before);
 const harvest=r.draft.familyEvents.find(x=>x.type==='early_honey_harvest_completed'&&x.operationId==='OP-14');
 assert.deepEqual(harvest.physicalSetup.honeyBodyIds,['h1','h2']);
 assert.deepEqual(harvest.physicalSetup.upperBodyIds,['b2','b4','b6']);
 assert.equal(harvest.physicalSetup.largeExcluderSnapshots.length,2);
 assert.equal(r.draft.familyEvents.at(-1).scenario,'EARLY_HONEY');
 assert.equal(r.draft.families.find(x=>x.id==='merged').currentQueenId,null);
 assert.deepEqual(lineage.inspect(r.draft),[]);
});
