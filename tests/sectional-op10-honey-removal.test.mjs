import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};new Function('window',readFileSync(new URL('../js/sectional-op10-honey-removal.js',import.meta.url),'utf8'))(w);
const stage=w.PasekaSectionalOP10HoneyRemoval.stage;
const at='2026-11-22T10:00:00Z',profile='sectional-multiqueen-v1';
function fixture(){
 const body=id=>({id,kind:'honey',frames:[{frameId:id+'-f1',history:[]}],events:[]});
 const items={x1:{kind:'honeyQueenExcluder',location:{type:'hive',hiveId:'h1'},events:[]},x2:{kind:'honeyQueenExcluder',location:{type:'hive',hiveId:'h1'},events:[]}};
 const stackAccessories={};
 for(const id of ['left','middle','right']){
  stackAccessories[id]={coverItemId:'cover-'+id,topRiserItemId:'riser-'+id};
  items['cover-'+id]={kind:'cover',location:{type:'storage',label:'склад'},events:[]};
  items['riser-'+id]={kind:'topRiser',location:{type:'storage',label:'склад'},events:[]};
 }
 const state={meta:{revisionId:'r1'},hives:[{id:'h1',profileId:profile}],sectionalTechProcesses:[],sectionalSeasonCycles:[{id:'cy1',hiveId:'h1',status:'ACTIVE'}],sectionalLayouts:[{id:'l1',hiveId:'h1',profileId:profile,mode:'SIDE_BY_SIDE',stacks:['left','middle','right'].map(id=>({id})),sections:[],honeyStack:{purpose:'main',bodyIds:['honey-a','honey-b'],excluders:[{itemId:'x1'},{itemId:'x2'}]}}],equipmentInventory:{bodies:{'honey-a':body('honey-a'),'honey-b':body('honey-b')},items,events:[],itemEvents:[]},auditLog:[]};
 const req={operationId:'OP-10',hiveId:'h1',userConfirmed:true,honeyBodiesStoredConfirmed:true,excludersStoredConfirmed:true,coversActuallyReinstalled:true,occurredAt:at,bodyStorageLocations:{'honey-a':'склад','honey-b':'склад'},excluderStorageLocations:{x1:'склад',x2:'склад'},stackAccessories};
 let i=0;
 // Emulate equipment API's internal clone + root commit; stale layout references must not be used.
 const place=(state,request,makeId,time)=>{
  const next=structuredClone(state),item=next.equipmentInventory.items[request.itemId];
  if(!item||JSON.stringify(item.location)===JSON.stringify(request.location))return {ok:false,error:'invalid_move'};
  item.events.push({id:makeId(),itemId:request.itemId,type:request.location.type==='storage'?'moved_to_storage':'moved',at:time});
  item.location=request.location;
  Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,next);
  return {ok:true};
 };
 return {state,req,deps:{now:'2026-11-23T10:00:00Z',makeId:()=>String(++i),PasekaEquipmentItems:{place}}};
}
test('OP10 physically removes honey bodies and records all frame histories without mutating input',()=>{
 const f=fixture(),original=structuredClone(f.state),r=stage(f.state,f.req,f.deps);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.deepEqual(f.state,original);
 const layout=r.draft.sectionalLayouts[0];assert.equal(layout.honeyStack,undefined);
 for(const s of layout.stacks){assert.equal(s.coverItemId,'cover-'+s.id);assert.equal(s.topRiserItemId,'riser-'+s.id)}
 for(const id of ['honey-a','honey-b']){const b=r.draft.equipmentInventory.bodies[id];assert.equal(b.storageLocation,'склад');assert.equal(b.events.at(-1).operationId,'OP-10');assert.equal(b.frames[0].history.at(-1).operationId,'OP-10')}
 assert.equal(r.draft.auditLog.at(-1).operationId,'OP-10');
});
test('OP10 without personal confirmation fails closed',()=>{const f=fixture();f.req.userConfirmed=false;assert.equal(stage(f.state,f.req,f.deps).ok,false)});
test('OP10 missing honey body storage blocks without modifying source',()=>{const f=fixture(),before=structuredClone(f.state);delete f.req.bodyStorageLocations['honey-b'];assert.equal(stage(f.state,f.req,f.deps).ok,false);assert.deepEqual(f.state,before)});
test('OP10 wrong accessory kind blocks',()=>{const f=fixture();f.state.equipmentInventory.items['riser-left'].kind='cover';assert.equal(stage(f.state,f.req,f.deps).ok,false)});
test('OP10 refuses unmigrated v1 coordinator',()=>{const f=fixture();f.state.sectionalTechProcesses.push({hiveId:'h1'});assert.equal(stage(f.state,f.req,f.deps).error,'op10_legacy_coordinator_must_be_migrated')});
test('OP10 rejects future timestamp',()=>{const f=fixture();f.req.occurredAt='2026-12-01T10:00:00Z';assert.equal(stage(f.state,f.req,f.deps).ok,false)});
test('OP10 failure midway cannot change original state',()=>{const f=fixture(),before=structuredClone(f.state);let n=0;f.deps.PasekaEquipmentItems.place=()=>++n>1?{ok:false,error:'io_failure'}:{ok:true};assert.equal(stage(f.state,f.req,f.deps).ok,false);assert.deepEqual(f.state,before)});
test('OP10 rejects no active seasonal cycle',()=>{const f=fixture();f.state.sectionalSeasonCycles=[];assert.equal(stage(f.state,f.req,f.deps).ok,false)});
