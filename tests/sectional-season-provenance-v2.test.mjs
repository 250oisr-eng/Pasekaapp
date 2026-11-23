import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};new Function('window',readFileSync(new URL('../js/sectional-season-provenance-v2.js',import.meta.url),'utf8'))(w);
const validate=w.PasekaSectionalSeasonProvenanceV2.validate;
const F=id=>({id,recordStatus:'active',currentQueenId:'q'+id,queenIdentityStatus:'identified'});
const Q=id=>({id:'q'+id,familyId:id,status:'current'});
const body=id=>({id,frames:[{frameId:id+'f',history:[]}],events:[]});
function state(){
 const sections=['f1','f2','f3'].map((id,i)=>({id,position:['left','middle','right'][i],familyId:id,broodBodyIds:['b'+(i+1)]}));
 return {sectionalLayouts:[{id:'layout',hiveId:'h',mode:'SIDE_BY_SIDE',sections,honeyStack:{bodyIds:['ha','hb']}}],families:['f1','f2','f3'].map(F),queens:['f1','f2','f3'].map(Q),familyEvents:[],queenEvents:[],equipmentInventory:{bodies:Object.fromEntries(['b1','b2','b3','ha','hb'].map(id=>[id,body(id)])),events:[]}};
}
const req=operationId=>({operationId,hiveId:'h',userConfirmed:true});
test('OP10 blocks unrecorded movement of removed honey bodies',()=>{
 const before=state(),after=structuredClone(before);
 delete after.sectionalLayouts[0].honeyStack;
 assert.ok(validate(before,after,req('OP-10')).some(x=>x.code==='provenance_removed_body_storage_missing'));
});
test('OP10 accepts documented honey bodies stored and family unchanged',()=>{
 const before=state(),after=structuredClone(before);
 delete after.sectionalLayouts[0].honeyStack;
 for(const id of ['ha','hb']){
  after.equipmentInventory.bodies[id].storageLocation='склад';
  after.equipmentInventory.bodies[id].events.push({operationId:'OP-10'});
  after.equipmentInventory.events.push({bodyId:id,operationId:'OP-10'});
 }
 assert.deepEqual(validate(before,after,req('OP-10')),[]);
});
test('OP11 cannot silently merge three families without lineage',()=>{
 const before=state(),after=structuredClone(before);
 after.sectionalLayouts[0].sections=[{id:'combined',familyId:'f4',broodBodyIds:['b1','b2','b3']}];
 delete after.sectionalLayouts[0].honeyStack;
 for(const id of ['ha','hb']){after.equipmentInventory.bodies[id].storageLocation='склад';after.equipmentInventory.bodies[id].events.push({operationId:'OP-11'});after.equipmentInventory.events.push({operationId:'OP-11',bodyId:id})}
 assert.ok(validate(before,after,req('OP-11')).some(x=>x.code==='provenance_merge_event_missing'));
});
test('OP11 rejects invented queen for merged family',()=>{
 const before=state(),after=structuredClone(before);
 after.sectionalLayouts[0].sections=[{id:'combined',familyId:'f4',broodBodyIds:['b1','b2','b3']}];
 delete after.sectionalLayouts[0].honeyStack;
 after.families.push({...F('f4')});
 after.familyEvents.push({type:'merge',operationId:'OP-11',hiveId:'h',sourceFamilyIds:['f1','f2','f3'],resultFamilyIds:['f4']});
 assert.ok(validate(before,after,req('OP-11')).some(x=>x.code==='provenance_merge_result_queen_must_be_unknown'));
});
test('OP12 must carry explicit lineage wintering event',()=>{
 const before=state(),after=structuredClone(before);
 after.sectionalLayouts[0].mode='ALTERNATIVE_WINTERING_COLUMN';
 assert.ok(validate(before,after,req('OP-12')).some(x=>x.code==='provenance_op12_family_wintering_event_missing'));
});
test('OP13 requires two distinct placements, no silent family changes',()=>{
 const before=state(),after=structuredClone(before);
 after.sectionalLayouts[0].mode='SIDE_BY_SIDE';
 after.familyEvents.push({type:'placement_changed',operationId:'OP-13',hiveId:'h',familyId:'f1'});
 assert.ok(validate(before,after,req('OP-13')).some(x=>x.code==='provenance_op13_two_family_placements_required'));
});
test('legacy family event cannot be rewritten',()=>{
 const before=state();before.familyEvents=[{id:'historic',type:'split'}];
 const after=structuredClone(before);after.familyEvents[0].type='merge';
 assert.ok(validate(before,after,req('OP-12')).some(x=>x.code==='provenance_lineage_history_rewritten'));
});
