import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};
for(const name of ['sectional-season-physical-manifest-v2.js',
 'sectional-physical-layout.js','family-lineage.js','sectional-season-op14-guided-v2.js'])
 new Function('window',readFileSync(new URL('../js/'+name,import.meta.url),'utf8'))(w);
const api=w.PasekaSectionalOP14GuidedV2,PROFILE='sectional-multiqueen-v1';
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
function fixture14(){
 const state=fixture(),layout=state.sectionalLayouts[0];
 // In the early honey stage, the covers and risers are off the individual nests.
 for(const s of layout.stacks)for(const key of ['coverItemId','topRiserItemId','feederItemId']){
  const id=s[key];if(!id)continue;
  state.equipmentInventory.items[id].location={type:'storage',label:'резерв'};
  delete s[key];
 }
 const honey=(id)=>({id,kind:'honey',condition:'good',
  spec:{profileId:PROFILE,framesPerBox:10},frames:Array.from({length:10},(_,j)=>({
   frameId:id+'f'+j,history:[],combType:'drawn_comb'})),events:[]});
 for(const id of ['honey1','honey2'])state.equipmentInventory.bodies[id]=honey(id);
 const upper=layout.sections.map(s=>s.upperBroodBodyId);
 const footprints={
  xleft:[{bodyId:upper[0],coverage:'FULL'},{bodyId:upper[1],coverage:'HALF'}],
  xright:[{bodyId:upper[1],coverage:'HALF'},{bodyId:upper[2],coverage:'FULL'}]
 };
 for(const [id,footprint]of Object.entries(footprints))
  state.equipmentInventory.items[id]={id,kind:'honeyQueenExcluder',
   condition:'good',location:{type:'hive',hiveId:'h',footprint},events:[]};
 layout.honeyStack={purpose:'early',bodyIds:['honey1','honey2'],
  excluders:[{itemId:'xleft',side:'left'},{itemId:'xright',side:'right'}]};
 const familyIds=['f1','f2','f3'],now='2026-11-22T10:00:00Z';
 for(const [id,label]of [['d1','lower-middle'],['d2','middle-upper']])
  state.equipmentInventory.items[id]={id,kind:'meshDiaphragm',condition:'good',
   location:{type:'storage',label:'снятая диафрагма'},events:[]};
 state.familyEvents=[
  {id:'winter',type:'alternative_wintering_configured',familyIds,hiveId:'h',
   operationId:'OP-12',techProcessId:'cycle',occurredAt:now,createdAt:now,
   diaphragmItemIds:['d1','d2'],
   diaphragmSnapshots:[
    {itemId:'d1',kind:'meshDiaphragm',condition:'good',hiveId:'h',positionLabel:'lower-middle'},
    {itemId:'d2',kind:'meshDiaphragm',condition:'good',hiveId:'h',positionLabel:'middle-upper'}
   ],layout:[
    {familyId:'f1',position:'lower',bodyCount:2},
    {familyId:'f2',position:'middle',bodyCount:1},
    {familyId:'f3',position:'upper',bodyCount:1}
   ]}
 ];
 for(const [index,familyId,sourcePosition,bodyIds,bottomId,stackId]of [
  [1,'f2','middle',['b3','b4'],'bottom-middle','stack-middle'],
  [2,'f3','upper',['b5','b6'],'bottom-right','stack-right']]){
  state.familyEvents.push({
   id:'sep'+index,type:'placement_changed',familyIds,familyId,hiveId:'h',
   operationId:'OP-13',scenario:'ALT_WINTERING_SPRING',techProcessId:'cycle',
   from:{position:sourcePosition,bodyIds:[bodyIds[0]]},
   to:{position:'separate_bottom',bottomItemId:bottomId,bodyIds},
   bottomSnapshot:{itemId:bottomId,kind:'bottom',condition:'good',
    hiveId:'h',positionLabel:null,stackId},
   occurredAt:'2026-11-23T09:00:00Z',createdAt:'2026-11-23T09:00:00Z'
  });
 }
 return state;
}
function selected(extra='',extraPos=''){
 return {hiveId:'h',sourceRevisionId:'r1',resultFamilyId:'merged-early',
  firstBodyId:'b2',secondBodyId:'b4',thirdBodyId:'b6',
  fourthBodyId:extra,fourthBodyPosition:extraPos,bottomItemId:'bottom-left',
  coverItemId:'',topRiserItemId:'',feederItemId:''};
}
function confirmed(state,select=selected()){
 const prep=api.prepare(state,select);assert.equal(prep.ok,true,JSON.stringify(prep));
 return {...select,occurredAt:'2026-11-23T10:00:00Z',
  userConfirmed:true,actualWorkConfirmed:true,actualMergeConfirmed:true,
  earlyHoneyHarvestConfirmed:true,actualDiaphragmsRemovedConfirmed:true,
  familiesOnSeparateBottomsConfirmed:true,
  bodyStorage:Object.fromEntries(prep.removedBodyIds.map(id=>[id,'сухой склад '+id])),
  itemStorage:Object.fromEntries(prep.removedItemIds.map(id=>[id,'сухой склад '+id])),
  confirmedBodyIds:prep.changedBodyIds,confirmedItemIds:prep.changedItemIds};
}
test('OP14 validates actual early-honey physical source and two-separation provenance',()=>{
 const state=fixture14(),initial=w.PasekaSectionalPhysicalLayout.validate(state.sectionalLayouts[0],state);
 assert.deepEqual(initial.errors,[]);
 assert.equal(api.inspect(state,selected()).ok,true);
});
test('OP14 guide keeps three exact original upper bodies, removes two real honey bodies and queen remains unknown',()=>{
 const state=fixture14(),before=structuredClone(state),req=confirmed(state);
 const candidate=api.prepare(state,req),result=api.plan(state,req);
 assert.equal(candidate.ok,true,JSON.stringify(candidate));
 assert.deepEqual(candidate.targetLayout.sections[0].broodBodyIds,['b2','b4','b6']);
 assert.equal(candidate.targetLayout.purpose,'early_honey_merge');
 assert.ok(candidate.removedBodyIds.includes('honey1'));
 assert.ok(candidate.removedBodyIds.includes('honey2'));
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.previewOnly,true);assert.equal(result.readyForPersistence,false);
 assert.equal(result.request.bodyMoves.length,8);
 assert.equal(result.request.resultFamily.currentQueenId,null);
 assert.deepEqual(state,before);
});
test('OP14 optionally retains a real former lower brood body with explicitly chosen position',()=>{
 const state=fixture14(),selection=selected('b3','1');
 const req=confirmed(state,selection),candidate=api.prepare(state,req),p=api.plan(state,req);
 assert.deepEqual(candidate.targetLayout.sections[0].broodBodyIds,['b2','b3','b4','b6']);
 assert.equal(p.ok,true,JSON.stringify(p));
 assert.equal(candidate.removedBodyIds.length,4);
});
test('OP14 cannot fake new family, fourth body, early honey or OP13 family provenance',()=>{
 const state=fixture14(),base=selected();
 assert.equal(api.prepare(state,{...base,sourceRevisionId:'stale'}).error,'op14_source_revision_stale');
 assert.equal(api.prepare(state,{...base,resultFamilyId:'f1'}).error,'op14_new_result_family_id_required');
 assert.equal(api.prepare(state,{...base,fourthBodyId:'honey1',fourthBodyPosition:'0'}).error,
  'op14_extra_body_must_be_original_lower_with_explicit_position');
 assert.equal(api.prepare(state,{...base,fourthBodyPosition:'0'}).error,
  'op14_extra_position_without_body');
 const invalid=structuredClone(state);invalid.sectionalLayouts[0].honeyStack.purpose='main';
 assert.equal(api.prepare(invalid,base).error,'op14_confirmed_early_honey_source_required');
 const broken=structuredClone(state);broken.familyEvents[0].diaphragmSnapshots=[];
 assert.equal(api.prepare(broken,base).error,'op14_full_family_lineage_not_verified');
 const unproven=structuredClone(state);unproven.familyEvents=[];
 assert.equal(api.prepare(unproven,base).error,'op14_confirmed_op12_op13_lineage_required');
});
test('OP14 requires each storage destination and individual actual-work confirmation',()=>{
 const state=fixture14(),req=confirmed(state);
 req.bodyStorage.honey1='';
 assert.equal(api.plan(state,req).error,'op14_confirmed_body_storage_required');
 req.bodyStorage.honey1='склад';
 req.itemStorage.xleft='';
 assert.equal(api.plan(state,req).error,'op14_confirmed_item_storage_required');
 req.itemStorage.xleft='склад';
 req.confirmedItemIds=[];
 assert.equal(api.plan(state,req).error,'manifest_item_movements_not_individually_confirmed');
 req.confirmedItemIds=api.prepare(state,req).changedItemIds;
 req.actualMergeConfirmed=false;
 assert.equal(api.plan(state,req).error,'op14_harvest_and_merge_actual_confirmation_required');
});
