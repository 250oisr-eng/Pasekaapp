import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../js/sectional-physical-layout.js',import.meta.url),'utf8');
const windowRef={};
new Function('window',source)(windowRef);
const api=windowRef.PasekaSectionalPhysicalLayout;

function fixture(mode='THREE_SIDE_BY_SIDE_SECTIONS'){
 const sections=[1,2,3].map(index=>({
  id:'section-'+index,index,familyId:'family-'+index,queenId:'queen-'+index,queenIdentityStatus:'identified',
  bodyIds:mode==='VERTICAL_COLUMN_THREE_FAMILIES'?(index===1?['body-1-a','body-1-b']:['body-'+index+'-b']):mode==='SINGLE_STACK_ONE_FAMILY'?['body-1-a','body-1-b','body-2-a']:['body-'+index+'-a','body-'+index+'-b'],
  upperBodyId:mode==='VERTICAL_COLUMN_THREE_FAMILIES'?(index===1?'body-1-b':'body-'+index+'-b'):mode==='SINGLE_STACK_ONE_FAMILY'?'body-2-a':'body-'+index+'-b',
  winteringPosition:mode==='VERTICAL_COLUMN_THREE_FAMILIES'?['lower','middle','upper'][index-1]:undefined,
  openings:mode==='THREE_SIDE_BY_SIDE_SECTIONS'?(index===1?[{id:'opening-1',bodyId:'body-1-b',diameterMm:50}]:index===2?[{id:'opening-2',bodyId:'body-2-b',diameterMm:50},{id:'opening-3',bodyId:'body-2-b',diameterMm:50}]:[{id:'opening-4',bodyId:'body-3-b',diameterMm:50}]):[]
 }));
 const stacks=mode==='THREE_SIDE_BY_SIDE_SECTIONS'?[
  {id:'stack-1',position:'LEFT',bottomItemId:'bottom-1',sectionIds:['section-1']},
  {id:'stack-2',position:'CENTER',bottomItemId:'bottom-2',sectionIds:['section-2']},
  {id:'stack-3',position:'RIGHT',bottomItemId:'bottom-3',sectionIds:['section-3']}
 ]:[{id:'stack-column',position:'COLUMN',bottomItemId:'bottom-1',sectionIds:mode==='VERTICAL_COLUMN_THREE_FAMILIES'?['section-1','section-2','section-3']:['section-1']}];
 const items={};
 for(let index=1;index<=3;index++)items['bottom-'+index]={id:'bottom-'+index,kind:'bottom',condition:'good',location:{type:'hive',hiveId:'h1',stackId:mode==='THREE_SIDE_BY_SIDE_SECTIONS'?'stack-'+index:'stack-column'}};
 for(const id of ['excluder-12-a','excluder-12-b','excluder-23-a','excluder-23-b'])items[id]={id,kind:'technicalQueenExcluder',condition:'good',location:{type:'hive',hiveId:'h1',connectionId:id.includes('12')?'connection-12':'connection-23'}};
 for(let index=1;index<=4;index++)items['plug-'+index]={id:'plug-'+index,kind:'metalMeshPlug',condition:'good',location:{type:'storage',label:'Склад'}};
 for(let index=1;index<=2;index++)items['diaphragm-'+index]={id:'diaphragm-'+index,kind:'meshDiaphragm',condition:'good',location:{type:'hive',hiveId:'h1',positionLabel:index===1?'LOWER_MIDDLE':'MIDDLE_UPPER'}};
 const bodyIds=['body-1-a','body-1-b','body-2-a','body-2-b','body-3-a','body-3-b'];
 const bodies=Object.fromEntries(bodyIds.map(id=>[id,{id,kind:'brood',spec:{profileId:'sectional-multiqueen-v1',framesPerBox:6}}]));
 const corpusIds=Object.fromEntries(bodyIds.map((id,index)=>[String(index+1),id]));
 const state={
  physicalLayoutVersion:1,physicalLayout:{version:1,mode,stacks},
  sections:mode==='SINGLE_STACK_ONE_FAMILY'?[{...sections[0],bodyIds:['body-1-a','body-1-b','body-2-a'],openings:[]}]:sections,
  operations:mode==='VERTICAL_COLUMN_THREE_FAMILIES'?[{operationId:'OP-12',status:'DONE'}]:[],
  technicalConnections:mode==='THREE_SIDE_BY_SIDE_SECTIONS'?[
   {id:'connection-12',fromSectionIndex:1,toSectionIndex:2,fromSectionId:'section-1',toSectionId:'section-2',openingIds:['opening-1','opening-2'],queenExcluderLayers:2,bufferCorridorPresent:true,queenExcluderItemIds:['excluder-12-a','excluder-12-b']},
   {id:'connection-23',fromSectionIndex:2,toSectionIndex:3,fromSectionId:'section-2',toSectionId:'section-3',openingIds:['opening-3','opening-4'],queenExcluderLayers:2,bufferCorridorPresent:true,queenExcluderItemIds:['excluder-23-a','excluder-23-b']}
  ]:[],
  meshPlugs:mode==='THREE_SIDE_BY_SIDE_SECTIONS'?['opening-1','opening-2','opening-3','opening-4'].map((openingId,index)=>({itemId:'plug-'+(index+1),openingId,bodyId:['body-1-b','body-2-b','body-2-b','body-3-b'][index],installed:false})):[],
  diaphragms:mode==='VERTICAL_COLUMN_THREE_FAMILIES'?[
   {itemId:'diaphragm-1',fromSectionId:'section-1',toSectionId:'section-2',positionLabel:'LOWER_MIDDLE'},
   {itemId:'diaphragm-2',fromSectionId:'section-2',toSectionId:'section-3',positionLabel:'MIDDLE_UPPER'}
  ]:[]
 };
 const apiary={
  layouts:{h1:{mode:'summer',installedBoxes:['1','2','3','4','5','6'],corpusIds}},
  equipmentInventory:{items,bodies},
  families:[1,2,3].map(index=>({id:'family-'+index,hive:'h1',recordStatus:'active',currentQueenId:'queen-'+index,queenIdentityStatus:'identified'})),
  queens:[1,2,3].map(index=>({id:'queen-'+index,familyId:'family-'+index,status:'current'}))
 };
 const record={hiveId:'h1',state};
 return {record,apiary,state,items};
}

test('unversioned legacy records remain untouched by the physical-layout validator',()=>{
 const result=api.validate({hiveId:'h1',state:{phase:'WINTER'}},{});
 assert.equal(result.valid,true);
 assert.deepEqual(result.errors,[]);
});

test('valid side-by-side layout links three stacks, real bottoms, bodies, openings and technical excluders',()=>{
 const {record,apiary}=fixture();
 const result=api.validate(record,apiary);
 assert.equal(result.valid,true,JSON.stringify(result.errors));
});

test('duplicate stack IDs are rejected',()=>{
 const {record,apiary}=fixture();
 record.state.physicalLayout.stacks[1].id='stack-1';
 const result=api.validate(record,apiary);
 assert.ok(result.errors.some(x=>x.code==='PHYSICAL_LAYOUT_STACK_ID_DUPLICATE'));
});

test('a technical connection must reference openings from both connected sections',()=>{
 const {record,apiary}=fixture();
 record.state.technicalConnections[0].openingIds=['opening-1','opening-3'];
 const result=api.validate(record,apiary);
 assert.ok(result.errors.some(x=>x.code==='PHYSICAL_LAYOUT_CONNECTION_OPENINGS'));
});

test('OP-05 requires one installed metal mesh plug for every actual opening',()=>{
 const {record,apiary,items}=fixture();
 record.state.operations=[{operationId:'OP-05',status:'DONE'}];
 record.state.meshPlugs[0].installed=true;
 items['plug-1'].location={type:'hive',hiveId:'h1',sectionId:'section-1',bodyId:'body-1-b',openingId:'opening-1'};
 const result=api.validate(record,apiary);
 assert.ok(result.errors.some(x=>x.code==='PHYSICAL_LAYOUT_OP05_MESH_PLUG_NOT_INSTALLED'));
});

test('alternative wintering is one vertical stack with 2+1+1 bodies and two real mesh diaphragms',()=>{
 const {record,apiary}=fixture('VERTICAL_COLUMN_THREE_FAMILIES');
 const result=api.validate(record,apiary);
 assert.equal(result.valid,true,JSON.stringify(result.errors));
});

test('a stack bottom must be a real bottom item placed on that stack',()=>{
 const {record,apiary,items}=fixture();
 items['bottom-2'].location.stackId='missing-stack';
 const result=api.validate(record,apiary);
 assert.ok(result.errors.some(x=>x.code==='PHYSICAL_LAYOUT_STACK_BOTTOM_LOCATION'));
});
