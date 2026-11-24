import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};
for(const name of ['sectional-season-physical-manifest-v2.js','sectional-season-op11-guided-v2.js',
 'sectional-physical-layout.js','family-lineage.js','sectional-season-physical-executor-v2.js',
 'sectional-season-provenance-v2.js'])
 new Function('window',readFileSync(new URL('../js/'+name,import.meta.url),'utf8'))(w);
const api=w.PasekaSectionalOP11GuidedV2,PROFILE='sectional-multiqueen-v1';
function fixture(){
 const positions=['left','middle','right'],sections=[],stacks=[],items={},bodies={};
 const queenRefs={},connLeft=[],connRight=[];
 for(let i=0;i<3;i++){
  const position=positions[i],low='b'+(i*2+1),upper='b'+(i*2+2);
  const names=i===0?['ol1','ol2']:i===1?['om1L','om1R','om2L','om2R']:['or1','or2'];
  const openings=names.map((id,j)=>({id,bodyId:i===1?(j<2?low:upper):(j===0?low:upper),
   diameterMm:50}));
  sections.push({id:position,position,familyId:'f'+(i+1),
   broodBodyIds:[low,upper],upperBroodBodyId:upper,openings});
  stacks.push({id:'stack-'+position,position,sectionIds:[position],
   bottomItemId:'bottom-'+position,coverItemId:'cover-'+position,
   topRiserItemId:'riser-'+position,...(i===0?{feederItemId:'feeder-left'}:{})});
  for(const kind of ['bottom','cover','riser',...(i===0?['feeder']:[])]){
   const id=kind+'-'+position,real=kind==='riser'?'topRiser':kind;
   items[id]={id,kind:real,condition:'good',location:{type:'hive',hiveId:'h',stackId:'stack-'+position},events:[]};
  }
  for(const b of [low,upper])bodies[b]={id:b,kind:'brood',condition:'good',spec:{profileId:PROFILE,framesPerBox:6},
   frames:Array.from({length:6},(_,j)=>({frameId:b+'f'+j,history:[]})),events:[]};
  for(const o of openings){
   const id='tech-'+o.id;items[id]={id,kind:'technicalQueenExcluder',condition:'good',
    location:{type:'hive',hiveId:'h',bodyId:o.bodyId,openingId:o.id},events:[]};
   const record={sectionId:position,bodyId:o.bodyId,openingId:o.id,itemId:id};
   if(i===0||(i===1&&o.id.endsWith('L')))connLeft.push(record);
   else connRight.push(record);
  }
 }
 for(let i=1;i<=4;i++)items['p'+i]={id:'p'+i,kind:'plasticPlug',condition:'good',
  location:{type:'storage',label:'резерв'},events:[]};
 const state={meta:{revisionId:'r1',schemaVersion:15},hives:[{id:'h',profileId:PROFILE}],
  sectionalLayouts:[{id:'layout',hiveId:'h',schemaVersion:1,profileId:PROFILE,
   mode:'SIDE_BY_SIDE',broodRows:2,sections,stacks,
   technicalConnections:[{id:'left-middle',fromSectionId:'left',toSectionId:'middle',
     bufferCorridorPresent:true,openings:connLeft},
    {id:'middle-right',fromSectionId:'middle',toSectionId:'right',
     bufferCorridorPresent:true,openings:connRight}]}],
  sectionalSeasonCycles:[{id:'cycle',hiveId:'h',status:'ACTIVE'}],
  sectionalTechProcesses:[],
  families:positions.map((_,i)=>({id:'f'+(i+1),hive:'h',recordStatus:'active',
   colonyGroupId:'group',queenIdentityStatus:'identified',currentQueenId:'q'+(i+1)})),
  queens:positions.map((_,i)=>({id:'q'+(i+1),familyId:'f'+(i+1),status:'current'})),
  auditLog:[],familyEvents:[],queenEvents:[],
  equipmentInventory:{bodies,items,events:[],itemEvents:[]}};
 return state;
}
function selection(){
 return {hiveId:'h',sourceRevisionId:'r1',resultFamilyId:'merged-1',
  lowerBodyId:'b2',middleBodyId:'b4',upperBodyId:'b6',
  bottomItemId:'bottom-left',coverItemId:'cover-left',
  topRiserItemId:'riser-left',feederItemId:'feeder-left',
  plugAssignments:{ol2:'p1',om2L:'p2',om2R:'p3',or2:'p4'}};
}
function request(state,selected=selection()){
 const p=api.prepare(state,{...selected,closuresConfirmed:true});
 assert.equal(p.ok,true,JSON.stringify(p));
 return {...selected,occurredAt:'2026-11-23T10:00:00Z',
  userConfirmed:true,actualWorkConfirmed:true,actualMergeConfirmed:true,closuresConfirmed:true,
  bodyStorage:Object.fromEntries(p.removedBodyIds.map(id=>[id,'склад '+id])),
  itemStorage:Object.fromEntries(p.removedItemIds.map(id=>[id,'склад '+id])),
  confirmedBodyIds:p.changedBodyIds,confirmedItemIds:p.changedItemIds};
}
test('OP11 source physical layout has 8 registered technical openings and real ID references',()=>{
 const state=fixture();
 const inspected=w.PasekaSectionalPhysicalLayout.validate(state.sectionalLayouts[0],state);
 assert.deepEqual(inspected.errors,[]);
 assert.equal(api.inspect(state,selection()).openings.length,4);
});
test('OP11 guided plan retains exactly three original upper bodies and four selected original openings',()=>{
 const state=fixture(),before=structuredClone(state),req=request(state),p=api.prepare(state,req);
 assert.equal(p.ok,true,JSON.stringify(p));
 assert.deepEqual(p.targetLayout.sections[0].broodBodyIds,['b2','b4','b6']);
 assert.equal(p.targetLayout.closedOpenings.length,4);
 assert.deepEqual(p.removedBodyIds,['b1','b3','b5']);
 assert.equal(p.targetLayout.purpose,'primary_wintering');
 assert.equal(p.targetLayout.sections[0].familyId,'merged-1');
 assert.equal(p.resultFamily.currentQueenId,null);
 const planned=api.plan(state,req);
 assert.equal(planned.ok,true,JSON.stringify(planned));
 assert.equal(planned.readyForPersistence,false);
 assert.equal(planned.request.bodyMoves.length,6);
 assert.equal(planned.request.itemMoves.filter(x=>x.location.type==='storage').length,p.removedItemIds.length);
 assert.deepEqual(state,before);
});
test('OP11 requires user selected body order; does not automatically assign old queen or unknown body',()=>{
 const state=fixture();const sel=selection();
 sel.lowerBodyId='b6';sel.middleBodyId='b2';sel.upperBodyId='b4';
 assert.equal(api.plan(state,request(state,sel)).ok,true);
 assert.equal(api.prepare(state,{...selection(),lowerBodyId:'b1'}).error,'op11_preserve_three_original_upper_body_ids');
 assert.equal(api.prepare(state,{...selection(),middleBodyId:'b2'}).error,'op11_preserve_three_original_upper_body_ids');
 assert.equal(api.prepare(state,{...selection(),resultFamilyId:'f1'}).error,'op11_new_unassigned_family_id_required');
});
test('OP11 source-revision, plastic plug exclusivity, storage and personal confirmation fail closed',()=>{
 const state=fixture(),source=structuredClone(state),req=request(state);
 assert.equal(api.prepare(state,{...selection(),sourceRevisionId:'stale'}).error,'op11_stale_source_revision');
 assert.equal(api.prepare(state,{...selection(),plugAssignments:{ol2:'p1',om2L:'p1',om2R:'p3',or2:'p4'}}).error,
  'op11_one_registered_stored_plastic_plug_per_opening_required');
 req.bodyStorage.b1='';
 assert.equal(api.plan(state,req).error,'op11_exact_removed_body_storage_required');
 req.bodyStorage.b1='склад';
 req.itemStorage['tech-ol1']='';
 assert.equal(api.plan(state,req).error,'op11_exact_removed_item_storage_required');
 req.itemStorage['tech-ol1']='склад';
 req.confirmedItemIds=[];
 assert.equal(api.plan(state,req).error,'manifest_item_movements_not_individually_confirmed');
 req.confirmedItemIds=api.prepare(state,req).changedItemIds;
 req.closuresConfirmed=false;
 assert.equal(api.plan(state,req).error,'op11_explicit_merge_and_plug_confirmation_required');
 req.closuresConfirmed=true;req.actualMergeConfirmed=false;
 assert.equal(api.plan(state,req).error,'op11_explicit_merge_and_plug_confirmation_required');
 assert.deepEqual(state,source);
});
test('OP11 stage integration keeps source intact and refuses to choose surviving queen',()=>{
 const state=fixture(),before=structuredClone(state),req=request(state);
 const plan=api.plan(state,req);assert.equal(plan.ok,true,JSON.stringify(plan));
 let n=0;const makeId=()=> 'op11-event-'+(++n);
 const placement={place:(draft,m,newId,at)=>{
  const item=draft.equipmentInventory.items[m.itemId];if(!item)return {ok:false};
  const from=structuredClone(item.location);item.location=structuredClone(m.location);
  const event={id:newId(),itemId:m.itemId,type:'moved',at,from,to:structuredClone(m.location)};
  item.events.push(event);draft.equipmentInventory.itemEvents.push(structuredClone(event));
  return {ok:true};
 }};
 const staged=w.PasekaSectionalSeasonPhysicalExecutorV2.stage(state,plan.request,{
  now:'2026-11-23T11:00:00Z',makeId,PasekaEquipmentItems:placement,
  PasekaFamilyLineage:w.PasekaFamilyLineage});
 assert.equal(staged.ok,true,JSON.stringify(staged));
 assert.equal(staged.draft.families.find(f=>f.id==='merged-1').queenIdentityStatus,'unresolved');
 assert.equal(staged.draft.families.find(f=>f.id==='merged-1').currentQueenId,null);
 const validation=w.PasekaSectionalPhysicalLayout.validate(staged.draft.sectionalLayouts[0],staged.draft);
 assert.equal(validation.valid,true,JSON.stringify(validation.errors));
 const misplaced=structuredClone(staged.draft);
 misplaced.equipmentInventory.items['riser-left'].location.stackId='wrong-stack';
 const errors=w.PasekaSectionalPhysicalLayout.validate(misplaced.sectionalLayouts[0],misplaced).errors;
 assert.ok(errors.some(e=>e.code==='section_accessory_position_mismatch'),JSON.stringify(errors));
 assert.deepEqual(state,before);
});
