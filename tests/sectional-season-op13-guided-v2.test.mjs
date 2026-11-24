import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};
for(const name of ['sectional-season-physical-manifest-v2.js',
 'sectional-physical-layout.js','family-lineage.js',
 'sectional-season-physical-executor-v2.js','sectional-season-provenance-v2.js',
 'sectional-season-op13-guided-v2.js'])
 new Function('window',readFileSync(new URL('../js/'+name,import.meta.url),'utf8'))(w);
const api=w.PasekaSectionalOP13GuidedV2,PROFILE='sectional-multiqueen-v1';
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
function winterFixture(){
 const state=fixture(),source=state.sectionalLayouts[0];
 const [strong,mid,weak]=source.sections;
 const section=(s,position,ids)=>({...structuredClone(s),id:position,position,
  broodBodyIds:ids,upperBroodBodyId:ids.at(-1),
  openings:s.openings.filter(o=>ids.includes(o.bodyId)).map(x=>structuredClone(x))});
 state.sectionalLayouts=[{id:'layout',hiveId:'h',profileId:PROFILE,schemaVersion:1,
  mode:'ALTERNATIVE_WINTERING_COLUMN',
  sections:[section(strong,'lower',['b1','b2']),section(mid,'middle',['b3']),section(weak,'upper',['b5'])],
  stacks:[{id:'stack-left',position:'column',sectionIds:['lower','middle','upper'],
   bottomItemId:'bottom-left',coverItemId:'cover-left',
   topRiserItemId:'riser-left',feederItemId:'feeder-left',
   boundaries:['lower-middle','middle-upper']}],
  meshDiaphragms:[{itemId:'d1',positionLabel:'lower-middle'},
   {itemId:'d2',positionLabel:'middle-upper'}]}];
 const inv=state.equipmentInventory;
 for(const id of ['b4','b6'])inv.bodies[id].storageLocation='реальный склад';
 for(const pos of ['middle','right'])for(const prefix of ['bottom','cover','riser'])
  inv.items[prefix+'-'+pos].location={type:'storage',label:'реальный склад'};
 for(const item of Object.values(inv.items))
  if(item.kind==='technicalQueenExcluder')item.location={type:'storage',label:'реальный склад'};
 for(const [id,positionLabel]of [['d1','lower-middle'],['d2','middle-upper']])
  inv.items[id]={id,kind:'meshDiaphragm',condition:'good',events:[],
   location:{type:'hive',hiveId:'h',stackId:'stack-left',positionLabel}};
 const familyIds=['f1','f2','f3'],at='2026-11-22T10:00:00Z';
 state.familyEvents=[{id:'winter',type:'alternative_wintering_configured',
  operationId:'OP-12',familyIds,hiveId:'h',techProcessId:'cycle',
  occurredAt:at,createdAt:at,
  diaphragmItemIds:['d1','d2'],
  diaphragmSnapshots:[{itemId:'d1',kind:'meshDiaphragm',condition:'good',
    hiveId:'h',positionLabel:'lower-middle'},
   {itemId:'d2',kind:'meshDiaphragm',condition:'good',
    hiveId:'h',positionLabel:'middle-upper'}],
  layout:[{familyId:'f1',position:'lower',bodyCount:2},
   {familyId:'f2',position:'middle',bodyCount:1},
   {familyId:'f3',position:'upper',bodyCount:1}]}];
 return state;
}
function select(){
 return {hiveId:'h',sourceRevisionId:'r1',
  placements:{
   left:{familyId:'f1',broodBodyIds:['b1','b2'],stackId:'stack-left',
    bottomItemId:'bottom-left',coverItemId:'cover-left',
    topRiserItemId:'riser-left',feederItemId:'feeder-left'},
   middle:{familyId:'f2',broodBodyIds:['b3','b4'],stackId:'stack-middle',
    bottomItemId:'bottom-middle',coverItemId:'cover-middle',
    topRiserItemId:'riser-middle',feederItemId:''},
   right:{familyId:'f3',broodBodyIds:['b5','b6'],stackId:'stack-right',
    bottomItemId:'bottom-right',coverItemId:'cover-right',
    topRiserItemId:'riser-right',feederItemId:''}
  },
  physicalOpeningsPersonallyChecked:true,
  openingClaims:{
   'left:b1:left':{openingId:'ol1',itemId:'tech-ol1',diameterMm:50},
   'left:b2:left':{openingId:'ol2',itemId:'tech-ol2',diameterMm:50},
   'middle:b3:left':{openingId:'om1L',itemId:'tech-om1L',diameterMm:50},
   'middle:b3:right':{openingId:'om1R',itemId:'tech-om1R',diameterMm:50},
   'middle:b4:left':{openingId:'om2L',itemId:'tech-om2L',diameterMm:50},
   'middle:b4:right':{openingId:'om2R',itemId:'tech-om2R',diameterMm:50},
   'right:b5:right':{openingId:'or1',itemId:'tech-or1',diameterMm:50},
   'right:b6:right':{openingId:'or2',itemId:'tech-or2',diameterMm:50}
  }
 };
}
function request(state,selected=select()){
 const p=api.prepare(state,selected);assert.equal(p.ok,true,JSON.stringify(p));
 return {...selected,occurredAt:'2026-11-23T10:00:00Z',
  userConfirmed:true,actualWorkConfirmed:true,actualSeparationConfirmed:true,
  bodyStorage:Object.fromEntries(p.removedBodyIds.map(id=>[id,'склад '+id])),
  itemStorage:Object.fromEntries(p.removedItemIds.map(id=>[id,'склад '+id])),
  confirmedBodyIds:p.changedBodyIds,confirmedItemIds:p.changedItemIds};
}
test('OP13 verifies exact existing 2+1+1 source, real wintering diaphragms and lineage',()=>{
 const state=winterFixture();
 assert.deepEqual(w.PasekaSectionalPhysicalLayout.validate(state.sectionalLayouts[0],state).errors,[]);
 assert.deepEqual(w.PasekaFamilyLineage.inspect(state),[]);
 const r=api.inspect(state,select());assert.equal(r.ok,true,JSON.stringify(r));
 assert.deepEqual(r.storedBodies.map(x=>x.id),['b4','b6']);
});
test('OP13 builds three 2-body families and 8 exact technical opening slots without guessing IDs',()=>{
 const state=winterFixture(),original=structuredClone(state),input=request(state);
 const preliminary=api.makeStructure(state,input),p=api.prepare(state,input),result=api.plan(state,input);
 assert.equal(preliminary.ok,true,JSON.stringify(preliminary));
 assert.equal(preliminary.slots.length,8);
 assert.equal(p.ok,true,JSON.stringify(p));
 assert.deepEqual(p.targetLayout.sections.map(s=>s.broodBodyIds),[
  ['b1','b2'],['b3','b4'],['b5','b6']]);
 assert.equal(p.targetLayout.technicalConnections.length,2);
 assert.equal(p.targetLayout.technicalConnections[0].openings.length,4);
 assert.equal(p.targetLayout.technicalConnections[1].openings.length,4);
 assert.deepEqual(p.removedItemIds,['d1','d2']);
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.previewOnly,true);assert.equal(result.readyForPersistence,false);
 assert.equal(result.request.bodyMoves.length,5);
 assert.deepEqual(state,original);
});
test('OP13 refuses stale source, wrong family, foreign stored body, bad opening and recycled excluder',()=>{
 const state=winterFixture(),input=select();
 assert.equal(api.prepare(state,{...input,sourceRevisionId:'stale'}).error,'op13_source_revision_stale');
 const other=structuredClone(input);
 other.placements.middle.familyId='f1';
 assert.equal(api.makeStructure(state,other).error,'op13_unique_original_family_per_position_required');
 const body=structuredClone(input);body.placements.middle.broodBodyIds=['b3','b5'];
 assert.equal(api.makeStructure(state,body).error,'op13_added_body_not_confirmed_on_storage');
 const empty=structuredClone(input);delete empty.openingClaims['middle:b4:left'];
 assert.equal(api.prepare(state,empty).error,'op13_exact_eight_opening_claims_required');
 const reused=structuredClone(input);
 reused.openingClaims['middle:b4:left'].itemId='tech-om1L';
 assert.equal(api.prepare(state,reused).error,'op13_unique_registered_stored_technical_excluder_required');
 const wrong=structuredClone(input);
 wrong.openingClaims['left:b2:left'].openingId='fictional';
 assert.equal(api.prepare(state,wrong).error,'op13_original_opening_identity_must_be_preserved');
 const measure=structuredClone(input);
 measure.openingClaims['left:b2:left'].diameterMm=0;
 assert.equal(api.prepare(state,measure).error,'op13_confirmed_opening_diameter_required');
 const noCheck=structuredClone(input);noCheck.physicalOpeningsPersonallyChecked=false;
 assert.equal(api.prepare(state,noCheck).error,'op13_personal_confirmation_of_opening_ids_required');
});
test('OP13 rejects missing real item storage, missing per-move confirmations and unconfirmed work',()=>{
 const state=winterFixture(),req=request(state);
 req.itemStorage.d1='';
 assert.equal(api.plan(state,req).error,'op13_removed_item_storage_required');
 req.itemStorage.d1='сухой склад';
 req.confirmedItemIds=[];
 assert.equal(api.plan(state,req).error,'manifest_item_movements_not_individually_confirmed');
 req.confirmedItemIds=api.prepare(state,req).changedItemIds;
 req.actualSeparationConfirmed=false;
 assert.equal(api.plan(state,req).error,'op13_actual_work_and_individual_confirmations_required');
});
test('OP13 feeds real executor and records both confirmed family relocations without mutating original',()=>{
 const state=winterFixture(),before=structuredClone(state),req=request(state),p=api.plan(state,req);
 assert.equal(p.ok,true,JSON.stringify(p));
 let counter=0;const makeId=()=> 'op13-event-'+(++counter);
 const equipmentItems={place:(draft,m,newId,at)=>{
  const item=draft.equipmentInventory.items[m.itemId];
  if(!item)return {ok:false,error:'item_missing'};
  const previous=structuredClone(item.location);
  item.location=structuredClone(m.location);
  const e={id:newId(),itemId:item.id,type:'moved',at,from:previous,to:structuredClone(item.location)};
  item.events.push(e);draft.equipmentInventory.itemEvents.push(structuredClone(e));
  return {ok:true};
 }};
 const stage=w.PasekaSectionalSeasonPhysicalExecutorV2.stage(state,p.request,{
  now:'2026-11-23T11:00:00Z',makeId,PasekaEquipmentItems:equipmentItems,
  PasekaFamilyLineage:w.PasekaFamilyLineage});
 assert.equal(stage.ok,true,JSON.stringify(stage));
 assert.equal(w.PasekaSectionalPhysicalLayout.validate(stage.draft.sectionalLayouts[0],stage.draft).valid,true);
 assert.deepEqual(w.PasekaFamilyLineage.inspect(stage.draft),[]);
 assert.deepEqual(w.PasekaSectionalSeasonProvenanceV2.validate(state,stage.draft,p.request),[]);
 const events=stage.draft.familyEvents.filter(e=>e.operationId==='OP-13'&&e.type==='placement_changed');
 assert.deepEqual(events.map(e=>e.familyId),['f2','f3']);
 assert.deepEqual(state,before);
});
