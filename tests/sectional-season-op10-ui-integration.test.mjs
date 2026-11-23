import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root={};
for(const name of ['equipment-items.js','sectional-op10-honey-removal.js','sectional-season-operations-wizard-v2.js'])
 new Function('window',readFileSync(new URL('../js/'+name,import.meta.url),'utf8'))(root);
const wizard=root.PasekaSeasonOperationsWizardV2,executor=root.PasekaSectionalOP10HoneyRemoval,equipment=root.PasekaEquipmentItems;
function setup(){
 const profile='sectional-multiqueen-v1',hiveId='h',sections=['left','middle','right'];
 const items={x1:{id:'x1',kind:'honeyQueenExcluder',condition:'good',location:{type:'hive',hiveId},events:[]},x2:{id:'x2',kind:'honeyQueenExcluder',condition:'good',location:{type:'hive',hiveId},events:[]}};
 const stackAccessories={};
 for(const id of sections){
  stackAccessories[id]={coverItemId:'cover-'+id,topRiserItemId:'riser-'+id};
  items['cover-'+id]={id:'cover-'+id,kind:'cover',condition:'good',location:{type:'storage',label:'склад'},events:[]};
  items['riser-'+id]={id:'riser-'+id,kind:'topRiser',condition:'good',location:{type:'storage',label:'склад'},events:[]};
 }
 const body=(id)=>({id,kind:'honey',condition:'good',pairId:'p1',spec:{profileId:profile,framesPerBox:10},frames:[{frameId:id+'-frame',history:[]}],events:[]});
 const state={
  hives:[{id:hiveId,profileId:profile}],sectionalSeasonCycles:[{id:'cycle',hiveId,status:'ACTIVE',events:[]}],sectionalTechProcesses:[],
  sectionalLayouts:[{id:'layout',hiveId,profileId:profile,mode:'SIDE_BY_SIDE',sections:sections.map(id=>({id,position:id,familyId:id,broodBodyIds:[]})),stacks:sections.map(id=>({id})),honeyStack:{bodyIds:['h1','h2'],excluders:[{itemId:'x1'},{itemId:'x2'}]}}],
  equipmentInventory:{bodies:{h1:body('h1'),h2:body('h2')},items,itemEvents:[],events:[]},auditLog:[]
 };
 const request={hiveId,operationId:'OP-10',occurredAt:'2026-11-22T10:00:00Z',userConfirmed:true,values:{honeyBodyIds:['h1','h2'],excluderIds:['x1','x2'],storageLabel:'склад',actualHoneyStored:true,actualExcludersStored:true,coversReinstalled:true,stackAccessories}};
 let num=0;
 const deps={executor,equipment,now:'2026-11-23T16:00:00Z',makeId:()=> 'generated-event-'+(++num)};
 return {state,request,deps};
}
test('OP10 mobile user form stages REAL equipment movements without changing live source or proclaiming DONE',()=>{
 const {state,request,deps}=setup(),original=structuredClone(state);
 assert.deepEqual(wizard.validate(state,request),[]);
 const result=wizard.previewOP10(state,request,deps);
 assert.equal(result.ok,true,JSON.stringify(result));assert.deepEqual(state,original);
 assert.equal(result.draft.sectionalLayouts[0].honeyStack,undefined);
 for(const item of Object.values(result.draft.equipmentInventory.items))assert.equal(item.location.type,item.kind==='honeyQueenExcluder'?'storage':'hive');
 assert.equal(result.draft.equipmentInventory.itemEvents.length,8);
 assert.equal(result.draft.auditLog.at(-1).operationId,'OP-10');
});
test('OP10 confirmation cannot be inferred from selected IDs or storage label',()=>{
 const {state,request,deps}=setup();
 request.values.actualExcludersStored=false;
 assert.equal(wizard.previewOP10(state,request,deps).ok,false);
});
test('OP10 refuses duplicate cover across stacks and missing current paired honey body',()=>{
 const a=setup();
 a.request.values.stackAccessories.middle.coverItemId=a.request.values.stackAccessories.left.coverItemId;
 assert.ok(wizard.validate(a.state,a.request).some(x=>x.code==='stack_accessory_not_available'));
 const b=setup();b.request.values.honeyBodyIds=['h1'];
 assert.ok(wizard.validate(b.state,b.request).some(x=>x.code==='honey_pair_invalid'));
});
test('OP10 fail-closed on wrong inventory API without changing input',()=>{
 const {state,request,deps}=setup(),before=structuredClone(state);
 deps.equipment={place:()=>({ok:false,error:'simulated_failure'})};
 const result=wizard.previewOP10(state,request,deps);
 assert.equal(result.ok,false);assert.deepEqual(state,before);
});
