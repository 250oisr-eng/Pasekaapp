import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../js/equipment-items.js',import.meta.url),'utf8');
const windowRef={};
new Function('window',source)(windowRef);
const api=windowRef.PasekaEquipmentItems;
const idFactory=()=>{let n=0;return ()=> 'item-'+(++n)};

function state(){
 return {
  hives:[{id:'h1'}],
  layouts:{h1:{corpusIds:{'1':'body-1'}}},
  sectionalTechProcesses:[{
   id:'tp-1',hiveId:'h1',
   state:{
    physicalLayoutVersion:1,
    physicalLayout:{version:1,mode:'THREE_SIDE_BY_SIDE_SECTIONS',stacks:[{id:'stack-1'}]},
    sections:[{id:'section-1',bodyIds:['body-1'],openings:[{id:'opening-1',bodyId:'body-1',diameterMm:50}]}],
    technicalConnections:[{id:'connection-1'}]
   }
  }]
 };
}

test('equipment item placement rejects a dangling section reference',()=>{
 const s=state(),makeId=idFactory();
 const registered=api.register(s,{kind:'plasticPlug',storageLocation:'Склад'},makeId,'2026-11-17T10:00:00.000Z');
 const result=api.place(s,{itemId:registered.item.id,location:{type:'hive',hiveId:'h1',sectionId:'section-missing',bodyId:'body-1',openingId:'opening-1'}},makeId,'2026-11-17T10:01:00.000Z');
 assert.equal(result.ok,false);
 assert.equal(result.error,'item_section_reference_missing');
});

test('equipment item placement rejects a dangling opening reference',()=>{
 const s=state(),makeId=idFactory();
 const registered=api.register(s,{kind:'metalMeshPlug',storageLocation:'Склад'},makeId,'2026-11-17T10:00:00.000Z');
 const result=api.place(s,{itemId:registered.item.id,location:{type:'hive',hiveId:'h1',sectionId:'section-1',bodyId:'body-1',openingId:'opening-missing'}},makeId,'2026-11-17T10:01:00.000Z');
 assert.equal(result.ok,false);
 assert.equal(result.error,'item_opening_reference_missing');
});

test('equipment item placement rejects a dangling technical connection reference',()=>{
 const s=state(),makeId=idFactory();
 const registered=api.register(s,{kind:'technicalQueenExcluder',storageLocation:'Склад'},makeId,'2026-11-17T10:00:00.000Z');
 const result=api.place(s,{itemId:registered.item.id,location:{type:'hive',hiveId:'h1',connectionId:'connection-missing'}},makeId,'2026-11-17T10:01:00.000Z');
 assert.equal(result.ok,false);
 assert.equal(result.error,'item_connection_reference_missing');
});

test('equipment item placement rejects a dangling stack reference for a bottom',()=>{
 const s=state(),makeId=idFactory();
 const registered=api.register(s,{kind:'bottom',storageLocation:'Склад'},makeId,'2026-11-17T10:00:00.000Z');
 const result=api.place(s,{itemId:registered.item.id,location:{type:'hive',hiveId:'h1',stackId:'stack-missing'}},makeId,'2026-11-17T10:01:00.000Z');
 assert.equal(result.ok,false);
 assert.equal(result.error,'item_stack_reference_missing');
});

test('valid section, opening and stack references are accepted',()=>{
 const s=state(),makeId=idFactory();
 const plug=api.register(s,{kind:'metalMeshPlug',storageLocation:'Склад'},makeId,'2026-11-17T10:00:00.000Z');
 const result=api.place(s,{itemId:plug.item.id,location:{type:'hive',hiveId:'h1',sectionId:'section-1',bodyId:'body-1',openingId:'opening-1'}},makeId,'2026-11-17T10:01:00.000Z');
 assert.equal(result.ok,true);
 assert.deepEqual(api.validateReferences(s),[]);
});

test('reference inspection reports dangling links already present in stored items',()=>{
 const s=state();
 s.equipmentInventory={items:{x:{id:'x',kind:'bottom',condition:'good',location:{type:'hive',hiveId:'h1',stackId:'missing'}}}};
 const errors=api.validateReferences(s);
 assert.ok(errors.some(error=>error.code==='item_stack_reference_missing'));
});
