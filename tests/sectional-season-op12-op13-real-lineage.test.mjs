import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root={};for(const name of ['family-lineage.js','sectional-season-physical-executor-v2.js','sectional-season-provenance-v2.js'])new Function('window',readFileSync(new URL('../js/'+name,import.meta.url),'utf8'))(root);
const actor=root.PasekaSectionalSeasonPhysicalExecutorV2,lin=root.PasekaFamilyLineage,provenance=root.PasekaSectionalSeasonProvenanceV2;
function setup(){
 const profile='sectional-multiqueen-v1';
 const original={id:'layout',hiveId:'hive',profileId:profile,mode:'SIDE_BY_SIDE',sections:['left','middle','right'].map((position,i)=>({id:'s-'+position,position,familyId:'f'+(i+1),broodBodyIds:['b'+(i*2+1),'b'+(i*2+2)]})),stacks:[]};
 const bodyIds=Array.from({length:6},(_,i)=>'b'+(i+1));
 const bodies=Object.fromEntries(bodyIds.map(id=>[id,{id,kind:'brood',condition:'good',spec:{profileId:profile,framesPerBox:6},frames:[{frameId:id+'frame',history:[]}],events:[]}]));
 const items={};
 for(const id of ['d1','d2'])items[id]={id,kind:'meshDiaphragm',condition:'good',location:{type:'storage',label:'склад'},events:[]};
 for(const id of ['bottom2','bottom3'])items[id]={id,kind:'bottom',condition:'good',location:{type:'storage',label:'склад'},events:[]};
 const state={meta:{revisionId:'rev1',schemaVersion:15},hives:[{id:'hive',profileId:profile}],sectionalTechProcesses:[],sectionalSeasonCycles:[{id:'cycle',hiveId:'hive',status:'ACTIVE'}],sectionalLayouts:[original],equipmentInventory:{bodies,items,events:[],itemEvents:[]},auditLog:[],familyEvents:[],queenEvents:[],families:[1,2,3].map(i=>({id:'f'+i,hive:'hive',colonyGroupId:'g',recordStatus:'active',currentQueenId:'q'+i,queenIdentityStatus:'identified'})),queens:[1,2,3].map(i=>({id:'q'+i,familyId:'f'+i,status:'current'}))};
 let i=0;
 const deps={now:'2026-11-23T10:00:00Z',makeId:()=> 'proof-'+(++i),PasekaFamilyLineage:lin,PasekaEquipmentItems:{place:(draft,r,makeId,time)=>{
  const item=draft.equipmentInventory.items[r.itemId];if(!item)return {ok:false,error:'item_missing'};
  item.location=structuredClone(r.location);item.events.push({id:makeId(),itemId:item.id,type:r.location.type==='storage'?'moved_to_storage':'moved',at:time});
  draft.equipmentInventory.itemEvents.push({...item.events.at(-1)});
  return {ok:true};
 }}};
 function manifest(old,target,storageLocations={}){
  const before=new Map(old.sections.flatMap(x=>x.broodBodyIds.map(id=>[id,{type:'sectional',hiveId:'hive',layoutId:'layout',bodyRole:'brood',sectionId:x.id,position:x.position}])));
  const after=new Map(target.sections.flatMap(x=>x.broodBodyIds.map(id=>[id,{type:'sectional',hiveId:'hive',layoutId:'layout',bodyRole:'brood',sectionId:x.id,position:x.position}])));
  const moves=[...new Set([...before.keys(),...after.keys()])].filter(id=>JSON.stringify(before.get(id)||null)!==JSON.stringify(after.get(id)||null)).map(bodyId=>({bodyId,from:before.get(bodyId)||null,to:after.get(bodyId)||{type:'storage',label:storageLocations[bodyId]}}));
  return moves;
 }
 return {state,deps,manifest,original};
}
test('real OP12 then OP13 lineage APIs preserve all 3 queen identities and append two spring placement events',()=>{
 const f=setup(),before=structuredClone(f.state),winter={
  id:'layout',hiveId:'hive',profileId:'sectional-multiqueen-v1',mode:'ALTERNATIVE_WINTERING_COLUMN',
  sections:[{id:'w-lower',position:'lower',familyId:'f1',broodBodyIds:['b1','b2']},{id:'w-middle',position:'middle',familyId:'f2',broodBodyIds:['b3']},{id:'w-upper',position:'upper',familyId:'f3',broodBodyIds:['b5']}],
  stacks:[{id:'winter-stack',sectionIds:['w-lower','w-middle','w-upper'],bottomItemId:'winter-bottom',boundaries:['between-lower-middle','between-middle-upper']}],
  meshDiaphragms:[{itemId:'d1'},{itemId:'d2'}]
 };
 const r12={hiveId:'hive',operationId:'OP-12',occurredAt:'2026-11-22T10:00:00Z',userConfirmed:true,actualWorkConfirmed:true,actualIsolationConfirmed:true,targetLayout:winter,
  bodyMoves:f.manifest(f.original,winter,{b4:'склад',b6:'склад'}),storageLocations:{b4:'склад',b6:'склад'},
  itemMoves:[{itemId:'d1',location:{type:'hive',hiveId:'hive',stackId:'winter-stack',positionLabel:'between-lower-middle'}},{itemId:'d2',location:{type:'hive',hiveId:'hive',stackId:'winter-stack',positionLabel:'between-middle-upper'}}]};
 const first=actor.stage(f.state,r12,f.deps);
 assert.equal(first.ok,true,JSON.stringify(first));assert.deepEqual(f.state,before);
 assert.equal(first.draft.familyEvents.at(-1).type,'alternative_wintering_configured');
 assert.equal(first.draft.familyEvents.at(-1).layout.reduce((n,x)=>n+x.bodyCount,0),4);
 assert.deepEqual(provenance.validate(f.state,first.draft,r12),[]);
 const spring={id:'layout',hiveId:'hive',profileId:'sectional-multiqueen-v1',mode:'SIDE_BY_SIDE',sections:[{id:'s-left',position:'left',familyId:'f1',broodBodyIds:['b1','b2']},{id:'s-middle',position:'middle',familyId:'f2',broodBodyIds:['b3','b4']},{id:'s-right',position:'right',familyId:'f3',broodBodyIds:['b5','b6']}],stacks:[{id:'stack-left',sectionIds:['s-left']},{id:'stack-middle',sectionIds:['s-middle'],bottomItemId:'bottom2'},{id:'stack-right',sectionIds:['s-right'],bottomItemId:'bottom3'}],meshDiaphragms:[]};
 const r13={hiveId:'hive',operationId:'OP-13',occurredAt:'2026-11-22T11:00:00Z',userConfirmed:true,actualWorkConfirmed:true,actualSeparationConfirmed:true,
  targetLayout:spring,bodyMoves:f.manifest(winter,spring),storageLocations:{},
  itemMoves:[{itemId:'d1',location:{type:'storage',label:'склад'}},{itemId:'d2',location:{type:'storage',label:'склад'}},{itemId:'bottom2',location:{type:'hive',hiveId:'hive',stackId:'stack-middle'}},{itemId:'bottom3',location:{type:'hive',hiveId:'hive',stackId:'stack-right'}}]};
 const second=actor.stage(first.draft,r13,f.deps);
 assert.equal(second.ok,true,JSON.stringify(second));
 assert.equal(second.draft.familyEvents.filter(e=>e.operationId==='OP-13'&&e.type==='placement_changed').length,2);
 assert.deepEqual(provenance.validate(first.draft,second.draft,r13),[]);
 assert.deepEqual(lin.inspect(second.draft),[]);
 assert.deepEqual(second.draft.queens,before.queens);
});
