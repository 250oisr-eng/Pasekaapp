import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};
for(const name of ['family-lineage.js','sectional-season-physical-executor-v2.js',
 'sectional-season-provenance-v2.js','sectional-season-physical-manifest-v2.js'])
 new Function('window',readFileSync(new URL('../js/'+name,import.meta.url),'utf8'))(w);
const profile='sectional-multiqueen-v1';
function fixture(){
 const positions=['left','middle','right'];
 const sections=positions.map((position,i)=>({id:position,position,familyId:'f'+(i+1),
  broodBodyIds:['b'+(i*2+1),'b'+(i*2+2)],upperBroodBodyId:'b'+(i*2+2)}));
 const stacks=positions.map(position=>({id:'stack-'+position,position,sectionIds:[position],
  bottomItemId:'bottom-'+position}));
 const bodies=Object.fromEntries(Array.from({length:6},(_,i)=>{
  const id='b'+(i+1);
  return [id,{id,kind:'brood',condition:'good',spec:{profileId:profile,framesPerBox:6},
   frames:Array.from({length:6},(_,j)=>({frameId:id+'-frame-'+j,history:[]})),events:[]}];
 }));
 const items={};
 for(const position of positions){
  const id='bottom-'+position;
  items[id]={id,kind:'bottom',condition:'good',events:[],
   location:{type:'hive',hiveId:'h',stackId:'stack-'+position}};
 }
 for(const id of ['d1','d2'])items[id]={id,kind:'meshDiaphragm',condition:'good',
  location:{type:'storage',label:'склад'},events:[]};
 const state={
  meta:{revisionId:'r1',schemaVersion:15},hives:[{id:'h',profileId:profile}],
  sectionalLayouts:[{id:'layout',hiveId:'h',profileId:profile,mode:'SIDE_BY_SIDE',sections,stacks}],
  sectionalTechProcesses:[],sectionalSeasonCycles:[{id:'cy',hiveId:'h',status:'ACTIVE'}],
  families:[1,2,3].map(i=>({id:'f'+i,hive:'h',recordStatus:'active',colonyGroupId:'group1',
   queenIdentityStatus:'identified',currentQueenId:'q'+i})),
  queens:[1,2,3].map(i=>({id:'q'+i,familyId:'f'+i,status:'current'})),
  familyEvents:[],queenEvents:[],auditLog:[],
  equipmentInventory:{bodies,items,events:[],itemEvents:[]}
 };
 const target={
  id:'layout',hiveId:'h',profileId:profile,mode:'ALTERNATIVE_WINTERING_COLUMN',
  sections:[
   {id:'lower',position:'lower',familyId:'f1',broodBodyIds:['b1','b2'],upperBroodBodyId:'b2'},
   {id:'middle',position:'middle',familyId:'f2',broodBodyIds:['b3'],upperBroodBodyId:'b3'},
   {id:'upper',position:'upper',familyId:'f3',broodBodyIds:['b5'],upperBroodBodyId:'b5'}
  ],
  stacks:[{id:'stack-left',position:'column',sectionIds:['lower','middle','upper'],
   bottomItemId:'bottom-left',boundaries:['lower-middle','middle-upper']}],
  meshDiaphragms:[{itemId:'d1',positionLabel:'lower-middle'},
   {itemId:'d2',positionLabel:'middle-upper'}]
 };
 const request={operationId:'OP-12',hiveId:'h',userConfirmed:true,actualWorkConfirmed:true,
  actualIsolationConfirmed:true,strongestFamilyId:'f1',occurredAt:'2026-11-22T12:00:00Z',
  targetLayout:target,storageLocations:{b4:'склад',b6:'склад'},
  itemDestinations:{
   'bottom-middle':{type:'storage',label:'склад'},
   'bottom-right':{type:'storage',label:'склад'},
   d1:{type:'hive',hiveId:'h',stackId:'stack-left',positionLabel:'lower-middle'},
   d2:{type:'hive',hiveId:'h',stackId:'stack-left',positionLabel:'middle-upper'}
  },
  confirmedBodyIds:['b1','b2','b4','b5','b6'],
  confirmedItemIds:['bottom-middle','bottom-right','d1','d2']
 };
 let n=0;const makeId=()=> 'event-'+(++n);
 const placement={
  place:(draft,move,newId,at)=>{
   const item=draft.equipmentInventory.items[move.itemId];
   if(!item)return {ok:false,error:'item_not_found'};
   const from=structuredClone(item.location);
   item.location=structuredClone(move.location);
   const event={id:newId(),itemId:item.id,type:'moved',at,from,to:structuredClone(item.location)};
   item.events.push(event);draft.equipmentInventory.itemEvents.push(structuredClone(event));
   return {ok:true};
  }
 };
 const deps={now:'2026-11-23T10:00:00Z',makeId,
  PasekaFamilyLineage:w.PasekaFamilyLineage,PasekaEquipmentItems:placement};
 return {state,request,deps};
}
test('OP12 manifest composes and feeds real executor + real queen lineage + provenance without changing source',()=>{
 const f=fixture(),original=structuredClone(f.state);
 const composed=w.PasekaSectionalSeasonPhysicalManifestV2.plan(f.state,f.request);
 assert.equal(composed.ok,true,JSON.stringify(composed));
 assert.equal(composed.request.bodyMoves.length,5);
 assert.equal(composed.request.itemMoves.length,4);
 const staged=w.PasekaSectionalSeasonPhysicalExecutorV2.stage(f.state,composed.request,f.deps);
 assert.equal(staged.ok,true,JSON.stringify(staged));
 assert.deepEqual(f.state,original);
 assert.deepEqual(w.PasekaSectionalSeasonProvenanceV2.validate(f.state,staged.draft,composed.request),[]);
 assert.deepEqual(w.PasekaFamilyLineage.inspect(staged.draft),[]);
 assert.equal(staged.draft.equipmentInventory.bodies.b4.storageLocation,'склад');
 assert.equal(staged.draft.equipmentInventory.items.d1.location.stackId,'stack-left');
 assert.equal(staged.draft.familyEvents.at(-1).type,'alternative_wintering_configured');
 assert.equal(staged.draft.equipmentInventory.events.length,5);
 assert.equal(composed.readyForPersistence,false);
});
test('OP12 staged source rejects forged foreign body and wrong claimant before executor is called',()=>{
 const f=fixture();f.request.strongestFamilyId='f2';
 const r=w.PasekaSectionalSeasonPhysicalManifestV2.plan(f.state,f.request);
 assert.equal(r.error,'manifest_op12_2_1_1_and_two_diaphragms_required');
 const g=fixture();g.state.sectionalLayouts.push({hiveId:'else',id:'other',profileId:profile,
  mode:'SIDE_BY_SIDE',sections:[{id:'other',position:'left',broodBodyIds:['b2']}],stacks:[]});
 assert.equal(w.PasekaSectionalSeasonPhysicalManifestV2.plan(g.state,g.request).ok,false);
});
