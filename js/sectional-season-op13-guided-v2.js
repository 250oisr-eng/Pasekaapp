(function(root){
'use strict';
// OP13 source-bound spring separation: user-selected exact physical IDs.
// This module only creates a validated manifest preview; never persists.
const A=x=>Array.isArray(x)?x:[],O=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const S=x=>typeof x==='string'&&x.trim().length>0;
const copy=x=>structuredClone(x),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=(error,details)=>({ok:false,error,...(details?{details}:{})});
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PROFILE='sectional-multiqueen-v1',POSITIONS=['left','middle','right'];
const BODY_CAPACITY=6;
function inspect(state,input){
 if(!O(state)||!O(input)||!S(input.hiveId)||!S(input.sourceRevisionId))
  return fail('op13_exact_source_and_revision_required');
 const sourceRows=A(state.sectionalLayouts).filter(l=>l?.hiveId===input.hiveId);
 const snap=root.PasekaSectionalSeasonPhysicalManifestV2?.inspectSource?.(state,input.hiveId);
 if(!snap?.ok)return fail(snap?.error||'op13_source_inventory_unverified');
 if(snap.sourceRevisionId!==input.sourceRevisionId)return fail('op13_source_revision_stale');
 const source=sourceRows[0],sections=A(source?.sections),stacks=A(source?.stacks);
 if(sourceRows.length!==1||source?.profileId!==PROFILE||source.schemaVersion!==1||
    source.mode!=='ALTERNATIVE_WINTERING_COLUMN'||source.honeyStack!=null||
    sections.length!==3||stacks.length!==1||
    !same(sections.map(s=>A(s.broodBodyIds).length).sort(),[1,1,2])||
    new Set(sections.map(s=>s.familyId)).size!==3)
  return fail('op13_one_confirmed_2_1_1_winter_layout_required');
 const cycles=A(state.sectionalSeasonCycles).filter(c=>c?.hiveId===input.hiveId&&c.status==='ACTIVE');
 if(cycles.length!==1||['REQUIRES_RECONCILIATION','BASELINE_IMPORTED_PENDING_ACTIVATION'].includes(cycles[0].migrationStatus))
  return fail('op13_active_cycle_required');
 const sourceLayout=root.PasekaSectionalPhysicalLayout?.validate?.(source,state);
 const lineage=root.PasekaFamilyLineage?.inspect?.(state);
 if(!sourceLayout?.valid||!Array.isArray(lineage)||lineage.length)
  return fail('op13_source_physical_or_lineage_invalid',{
   physicalErrors:sourceLayout?.errors?.slice(0,8)||[],
   lineageErrors:Array.isArray(lineage)?lineage.slice(0,8):[]});
 const inventory=state.equipmentInventory;
 if(!O(inventory?.bodies)||!O(inventory?.items))return fail('op13_inventory_missing');
 const original=new Map(sections.map(s=>[s.familyId,s]));
 const used=new Set(sections.flatMap(s=>A(s.broodBodyIds)));
 const storedBodies=Object.values(inventory.bodies).filter(b=>O(b)&&S(b.id)&&!used.has(b.id)&&
  b.kind==='brood'&&b.condition==='good'&&b.spec?.profileId===PROFILE&&
  b.spec.framesPerBox===BODY_CAPACITY&&Array.isArray(b.frames)&&
  b.frames.length===BODY_CAPACITY&&S(b.storageLocation)&&
  b.frames.every(f=>S(f?.frameId)&&Array.isArray(f.history)));
 return {ok:true,snapshot:snap,source,sections,original,cycles,inventory,storedBodies};
}
function makeStructure(state,input){
 const i=inspect(state,input);if(!i.ok)return i;
 const src=i.source,items=i.inventory.items;
 const specs=O(input.placements)?input.placements:{};
 if(Object.keys(specs).length!==3||Object.keys(specs).some(p=>!POSITIONS.includes(p)))
  return fail('op13_three_position_assignments_required');
 const allFamilies=POSITIONS.map(p=>specs[p]?.familyId);
 if(new Set(allFamilies).size!==3||allFamilies.some(f=>!i.original.has(f)))
  return fail('op13_unique_original_family_per_position_required');
 const preservedStrong=i.sections.find(s=>A(s.broodBodyIds).length===2);
 const takenBodies=new Set(),takenItems=new Set(),takenStacks=new Set(),added=[];
 const sections=[],stacks=[];
 const allowedItem=(id,kind)=>{
  const x=items[id];return S(id)&&O(x)&&x.id===id&&x.kind===kind&&x.condition==='good'&&
   (x.location?.type==='storage'||(x.location?.type==='hive'&&x.location.hiveId===input.hiveId));
 };
 const claimedItem=(id,kind)=>{
  if(!allowedItem(id,kind)||takenItems.has(id))return false;
  takenItems.add(id);return true;
 };
 for(const position of POSITIONS){
  const spec=specs[position],before=i.original.get(spec.familyId),order=A(spec.broodBodyIds);
  if(order.length!==2||new Set(order).size!==2||
    !A(before.broodBodyIds).every(id=>order.includes(id))||
    order.some(id=>takenBodies.has(id)))
   return fail('op13_preserve_original_family_bodies_and_choose_exact_order',{position});
  for(const id of order)takenBodies.add(id);
  if(A(before.broodBodyIds).length===1){
   const extra=order.find(id=>!A(before.broodBodyIds).includes(id));
   if(!i.storedBodies.some(b=>b.id===extra))return fail('op13_added_body_not_confirmed_on_storage',{position,bodyId:extra});
   added.push(extra);
  }
  const stackId=spec.stackId;
  if(!S(stackId)||stackId.length>128||takenStacks.has(stackId))
   return fail('op13_unique_real_stack_id_required',{position});
  takenStacks.add(stackId);
  const retainedBottom=i.source.stacks[0].bottomItemId;
  if(spec.familyId===preservedStrong.familyId){
   if(spec.bottomItemId!==retainedBottom||stackId!==i.source.stacks[0].id)
    return fail('op13_strongest_family_must_keep_original_bottom_and_stack');
  }else if(items[spec.bottomItemId]?.location?.type!=='storage')
   return fail('op13_separated_family_bottom_must_be_from_verified_storage',{position});
  for(const [key,kind]of [['bottomItemId','bottom'],['coverItemId','cover'],['topRiserItemId','topRiser']])
   if(!claimedItem(spec[key],kind))return fail('op13_each_section_requires_distinct_registered_accessory',{position,key});
  if(S(spec.feederItemId)&&!claimedItem(spec.feederItemId,'feeder'))
   return fail('op13_feeder_invalid_or_reused',{position});
  sections.push({id:position,position,familyId:spec.familyId,
   broodBodyIds:order.slice(),upperBroodBodyId:order[1],openings:[]});
  stacks.push({id:stackId,position,sectionIds:[position],bottomItemId:spec.bottomItemId,
   coverItemId:spec.coverItemId,topRiserItemId:spec.topRiserItemId,
   ...(S(spec.feederItemId)?{feederItemId:spec.feederItemId}:{})});
 }
 if(added.length!==2||new Set(added).size!==2)
  return fail('op13_exact_two_real_extra_bodies_required');
 // This is a source-bound template of required physical openings, NOT an
 // automatically assigned opening ID or excluder.
 const slots=sections.flatMap(s=>s.broodBodyIds.flatMap(bodyId=>
  (s.position==='middle'?['left','right']:[s.position]).map(side=>({
   position:s.position,bodyId,side,key:s.position+':'+bodyId+':'+side
  }))));
 if(slots.length!==8)return fail('op13_exact_eight_physical_openings_required');
 const destinations={};
 for(const stack of stacks)for(const key of ['bottomItemId','coverItemId','topRiserItemId','feederItemId']){
  if(S(stack[key]))destinations[stack[key]]={type:'hive',hiveId:input.hiveId,stackId:stack.id};
 }
 return {ok:true,readOnly:true,sourceRevisionId:input.sourceRevisionId,
  source:i,sections,stacks,slots,destinations,addedBodyIds:added};
}
function prepare(state,input){
 const b=makeStructure(state,input);if(!b.ok)return b;
 if(input.physicalOpeningsPersonallyChecked!==true)
  return fail('op13_personal_confirmation_of_opening_ids_required');
 const claims=O(input.openingClaims)?input.openingClaims:{};
 const ids=b.slots.map(s=>s.key);
 if(Object.keys(claims).length!==8||Object.keys(claims).some(x=>!ids.includes(x)))
  return fail('op13_exact_eight_opening_claims_required');
 const seenOpeningIds=new Set(),seenExcluders=new Set(),connectionEntries={left:[],right:[]};
 const original=b.source.sections.flatMap(s=>A(s.openings));
 const targetSections=b.sections.map(copy),wantedItems={...b.destinations};
 for(const slot of b.slots){
  const claim=claims[slot.key],openingId=claim?.openingId,itemId=claim?.itemId;
  const item=b.source.inventory.items[itemId];
  if(!S(openingId)||openingId.length>128||seenOpeningIds.has(openingId))
   return fail('op13_unique_physical_opening_id_required',{slot:slot.key});
  if(!S(itemId)||seenExcluders.has(itemId)||!O(item)||item.id!==itemId||
     item.kind!=='technicalQueenExcluder'||item.condition!=='good'||item.location?.type!=='storage')
   return fail('op13_unique_registered_stored_technical_excluder_required',{slot:slot.key});
  if(Number(claim.diameterMm)!==50||!S(String(claim.diameterMm??'')))
   return fail('op13_confirmed_opening_diameter_required',{slot:slot.key});
  seenOpeningIds.add(openingId);seenExcluders.add(itemId);
  targetSections.find(s=>s.position===slot.position).openings.push({
   id:openingId,bodyId:slot.bodyId,diameterMm:Number(claim.diameterMm)
  });
  wantedItems[itemId]={type:'hive',hiveId:input.hiveId,bodyId:slot.bodyId,openingId};
  const ref={sectionId:slot.position,bodyId:slot.bodyId,openingId,itemId};
  connectionEntries[slot.side].push(ref);
 }
 // An opening already present in the recorded winter physical source must
 // retain exactly its old ID. Stored bodies need direct personal observation.
 const targets=targetSections.flatMap(s=>s.openings);
 for(const before of original){
  if(!targets.some(x=>x.bodyId===before.bodyId))continue;
  if(!targets.some(x=>x.id===before.id&&x.bodyId===before.bodyId))
   return fail('op13_original_opening_identity_must_be_preserved',{openingId:before.id});
 }
 for(const target of targets){
  const hasSource=original.some(x=>x.bodyId===target.bodyId);
  if(hasSource&&!original.some(x=>x.bodyId===target.bodyId&&x.id===target.id))
   return fail('op13_existing_body_opening_must_match_source',{bodyId:target.bodyId});
 }
 const target={id:b.source.source.id,hiveId:input.hiveId,profileId:PROFILE,
  schemaVersion:1,mode:'SIDE_BY_SIDE',broodRows:2,sections:targetSections,
  stacks:b.stacks.map(copy),meshDiaphragms:[],temporaryQueenIsolation:[],
  closedOpenings:[],technicalConnections:[
   {id:'connection-'+b.source.source.id+'-left-middle',fromSectionId:'left',
    toSectionId:'middle',bufferCorridorPresent:true,openings:connectionEntries.left},
   {id:'connection-'+b.source.source.id+'-middle-right',fromSectionId:'middle',
    toSectionId:'right',bufferCorridorPresent:true,openings:connectionEntries.right}
  ]};
 const actualBodyMap=new Map(b.source.snapshot.bodyEntries.map(row=>[row.id,row.location]));
 const nextBodyMap=new Map(target.sections.flatMap(s=>s.broodBodyIds.map(id=>[id,{
  type:'sectional',hiveId:input.hiveId,layoutId:target.id,bodyRole:'brood',
  sectionId:s.id,position:s.position}])));
 const changedBodyIds=[...new Set([...actualBodyMap.keys(),...nextBodyMap.keys()])]
  .filter(id=>!same(actualBodyMap.get(id)||null,nextBodyMap.get(id)||null)).sort();
 const removedBodyIds=[...actualBodyMap.keys()].filter(id=>!nextBodyMap.has(id));
 const removedItemIds=b.source.snapshot.itemEntries.filter(e=>!Object.hasOwn(wantedItems,e.id))
  .map(e=>e.id);
 const changedItemIds=[...new Set([...removedItemIds,...Object.entries(wantedItems)
  .filter(([id,loc])=>!same(b.source.inventory.items[id]?.location,loc)).map(([id])=>id)])].sort();
 return {ok:true,previewOnly:true,sourceRevisionId:input.sourceRevisionId,
  targetLayout:target,changedBodyIds,removedBodyIds,changedItemIds,removedItemIds,
  itemDestinations:wantedItems};
}
function plan(state,input){
 const p=prepare(state,input);if(!p.ok)return p;
 const bodyStorage=O(input.bodyStorage)?input.bodyStorage:{},
  itemStorage=O(input.itemStorage)?input.itemStorage:{};
 const label=x=>S(x)&&x.length<=160;
 if(p.removedBodyIds.some(id=>!label(bodyStorage[id]))||
    Object.keys(bodyStorage).some(id=>!p.removedBodyIds.includes(id)))
  return fail('op13_removed_body_storage_required');
 if(p.removedItemIds.some(id=>!label(itemStorage[id]))||
    Object.keys(itemStorage).some(id=>!p.removedItemIds.includes(id)))
  return fail('op13_removed_item_storage_required');
 if(input.userConfirmed!==true||input.actualWorkConfirmed!==true||
    input.actualSeparationConfirmed!==true||
    !Array.isArray(input.confirmedBodyIds)||!Array.isArray(input.confirmedItemIds))
  return fail('op13_actual_work_and_individual_confirmations_required');
 const destinations={...p.itemDestinations};
 for(const id of p.removedItemIds)destinations[id]={type:'storage',label:itemStorage[id]};
 return root.PasekaSectionalSeasonPhysicalManifestV2.plan(state,{
  operationId:'OP-13',hiveId:input.hiveId,
  expectedSourceRevisionId:p.sourceRevisionId,occurredAt:input.occurredAt,
  userConfirmed:true,actualWorkConfirmed:true,actualSeparationConfirmed:true,
  targetLayout:p.targetLayout,
  confirmedBodyIds:input.confirmedBodyIds,confirmedItemIds:input.confirmedItemIds,
  storageLocations:Object.fromEntries(p.removedBodyIds.map(id=>[id,bodyStorage[id]])),
  itemDestinations:destinations
 });
}
function mount(host,getState,hiveId,controls){
 if(!host||typeof getState!=='function'||!S(hiveId))return fail('op13_guide_host_required');
 const snapshot=root.PasekaSectionalSeasonPhysicalManifestV2?.inspectSource?.(getState(),hiveId);
 if(!snapshot?.ok){host.textContent='OP-13: исходная раскладка не подтверждена.';return fail('op13_source_audit_missing')}
 const revision=snapshot.sourceRevisionId;
 const state=getState(),source=inspect(state,{hiveId,sourceRevisionId:revision});
 if(!source.ok){host.textContent='OP-13: '+source.error;return source}
 const opts=rows=>'<option value="">— Выберите лично —</option>'+
  rows.map(([v,t])=>'<option value="'+esc(v)+'">'+esc(t)+'</option>').join('');
 const families=source.sections.map(s=>[s.familyId,s.familyId+' / '+s.position]);
 const bodies=[...source.sections.flatMap(s=>s.broodBodyIds),...source.storedBodies.map(b=>b.id)]
  .map(id=>[id,id]);
 const items=Object.values(source.inventory.items).filter(i=>i?.condition==='good'&&
  (i.location?.type==='storage'||(i.location?.type==='hive'&&i.location.hiveId===hiveId)));
 const choose=kind=>opts(items.filter(i=>i.kind===kind).map(i=>[i.id,i.id]));
 host.innerHTML='<fieldset data-op13-guide><legend>OP-13 · весеннее разделение на три секции</legend>'+
  '<p>Выберите каждую семью, два реальных корпуса, дно, крышку, подкрышник и ID стопки. Два дополнительных корпуса должны действительно находиться на складе. Не придумывайте физические номера отверстий.</p>'+
  '<p>Исходная ревизия '+esc(revision)+'. Всё только для проверки, без записи.</p>'+
  POSITIONS.map(position=>'<fieldset><legend>Позиция '+esc(position)+'</legend>'+
   '<label>Семья<select data-op13-family="'+esc(position)+'">'+opts(families)+'</select></label>'+
   '<label>Нижний корпус<select data-op13-lower="'+esc(position)+'">'+opts(bodies)+'</select></label>'+
   '<label>Верхний корпус<select data-op13-upper="'+esc(position)+'">'+opts(bodies)+'</select></label>'+
   '<label>ID настоящей стопки<input maxlength="128" data-op13-stack="'+esc(position)+'" placeholder="Реальный ID"></label>'+
   '<label>Дно<select data-op13-bottom="'+esc(position)+'">'+choose('bottom')+'</select></label>'+
   '<label>Подкрышник<select data-op13-riser="'+esc(position)+'">'+choose('topRiser')+'</select></label>'+
   '<label>Крышка<select data-op13-cover="'+esc(position)+'">'+choose('cover')+'</select></label>'+
   '<label>Кормушка (необязательно)<select data-op13-feeder="'+esc(position)+'">'+choose('feeder')+'</select></label>'+
   '</fieldset>').join('')+
  '<button type="button" data-op13-next>Далее: технические отверстия</button>'+
  '<div data-op13-openings></div><div data-op13-moves></div>'+
  '<div role="status" aria-live="polite" data-op13-result></div></fieldset>';
 const field=(name,pos)=>host.querySelector('[data-op13-'+name+'="'+pos+'"]')?.value||'';
 const placements=()=>Object.fromEntries(POSITIONS.map(pos=>[pos,{
  familyId:field('family',pos),broodBodyIds:[field('lower',pos),field('upper',pos)],
  stackId:field('stack',pos),bottomItemId:field('bottom',pos),
  coverItemId:field('cover',pos),topRiserItemId:field('riser',pos),feederItemId:field('feeder',pos)}]));
 const base=()=>({hiveId,sourceRevisionId:revision,placements:placements()});
 const openingPanel=()=>host.querySelector('[data-op13-openings]');
 const moves=()=>host.querySelector('[data-op13-moves]');
 const output=()=>host.querySelector('[data-op13-result]');
 const invalidate=()=>{openingPanel().textContent='';moves().textContent='';
  output().textContent='Исходный выбор изменён. Повторите выбор отверстий и все подтверждения.'};
 for(const x of host.querySelectorAll('[data-op13-family],[data-op13-lower],[data-op13-upper],'+
  '[data-op13-stack],[data-op13-bottom],[data-op13-cover],[data-op13-riser],[data-op13-feeder]'))
  x.addEventListener('change',invalidate);
 const excluders=Object.values(source.inventory.items).filter(i=>i?.kind==='technicalQueenExcluder'&&
  i.condition==='good'&&i.location?.type==='storage').map(i=>[i.id,i.id]);
 host.querySelector('[data-op13-next]').addEventListener('click',()=>{
  const p=makeStructure(getState(),base());
  if(!p.ok){openingPanel().textContent='';moves().textContent='';output().textContent='Отказ: '+p.error;return}
  openingPanel().innerHTML='<p>Каждое из восьми технических отверстий: впишите наблюдаемый ID и диаметр, выберите конкретную складскую разделительную решётку.</p>'+
   p.slots.map(slot=>'<fieldset><legend>'+esc(slot.key)+'</legend>'+
    '<label>ID реального отверстия<input maxlength="128" data-op13-hole="'+esc(slot.key)+'" placeholder="Номер отверстия"></label>'+
    '<label>Фактический диаметр (мм)<input inputmode="numeric" type="number" min="1" data-op13-mm="'+esc(slot.key)+'" placeholder="Измеренное значение"></label>'+
    '<label>Решётка из подтверждённого склада<select data-op13-excluder="'+esc(slot.key)+'">'+opts(excluders)+'</select></label></fieldset>').join('')+
   '<label><input type="checkbox" data-op13-hole-confirm> Лично проверил соответствие каждого отверстия, диаметра и решётки фактическому корпусу</label>'+
   '<button type="button" data-op13-target>Проверить целевую геометрию</button>';
  moves().textContent='';output().textContent='Проверены ID семей/корпусов. Введите данные восьми отверстий.';
  for(const x of openingPanel().querySelectorAll('input,select'))x.addEventListener('change',()=>{
   moves().textContent='';output().textContent='Изменены отверстия или решётки — подтверждения перемещений сброшены.';
  });
  const claims=()=>Object.fromEntries(p.slots.map(slot=>[slot.key,{
   openingId:openingPanel().querySelector('[data-op13-hole="'+slot.key+'"]')?.value||'',
   diameterMm:openingPanel().querySelector('[data-op13-mm="'+slot.key+'"]')?.value||'',
   itemId:openingPanel().querySelector('[data-op13-excluder="'+slot.key+'"]')?.value||''
  }]));
  const full=()=>({...base(),openingClaims:claims(),
   physicalOpeningsPersonallyChecked:openingPanel().querySelector('[data-op13-hole-confirm]')?.checked===true});
  openingPanel().querySelector('[data-op13-target]').addEventListener('click',()=>{
   const checked=prepare(getState(),full());
   if(!checked.ok){moves().textContent='';output().textContent='Целевая раскладка не допущена: '+checked.error;return}
   const store=(kind,id)=>'<label>Фактическое место хранения '+esc(id)+
    '<input maxlength="160" data-op13-'+kind+'="'+esc(id)+'" placeholder="Реальный склад"></label>';
   const check=(kind,id)=>'<label><input type="checkbox" data-op13-confirm-'+kind+'="'+esc(id)+'"> Подтверждаю фактическое перемещение '+esc(id)+'</label>';
   moves().innerHTML='<p>Корпуса на склад</p>'+checked.removedBodyIds.map(id=>store('body-store',id)).join('')+
    '<p>Предметы на склад</p>'+checked.removedItemIds.map(id=>store('item-store',id)).join('')+
    '<p>Подтверждения перемещённых корпусов</p>'+checked.changedBodyIds.map(id=>check('body',id)).join('')+
    '<p>Подтверждения перемещённых предметов</p>'+checked.changedItemIds.map(id=>check('item',id)).join('')+
    '<label><input type="checkbox" data-op13-separate> Лично подтверждаю фактическое разделение и размещение трёх семей на своих днищах</label>'+
    '<button type="button" data-op13-check>Проверить манифест, не сохраняя</button>';
   output().textContent='Целевая схема составлена. Никаких изменений в базе.';
   const read=kind=>Object.fromEntries([...moves().querySelectorAll('[data-op13-'+kind+']')]
    .map(el=>[el.getAttribute('data-op13-'+kind),el.value]));
   const checkIds=kind=>[...moves().querySelectorAll('[data-op13-confirm-'+kind+']')]
    .filter(el=>el.checked).map(el=>el.getAttribute('data-op13-confirm-'+kind));
   moves().querySelector('[data-op13-check]').addEventListener('click',()=>{
    const at=controls?.querySelector('[data-season-at]')?.value||'';
    let result;try{result=plan(getState(),{...full(),bodyStorage:read('body-store'),
     itemStorage:read('item-store'),confirmedBodyIds:checkIds('body'),
     confirmedItemIds:checkIds('item'),occurredAt:at?new Date(at).toISOString():'',
     userConfirmed:controls?.querySelector('[data-season-confirm]')?.checked===true,
     actualWorkConfirmed:controls?.querySelector('[data-season-confirm]')?.checked===true,
     actualSeparationConfirmed:moves().querySelector('[data-op13-separate]')?.checked===true});}
    catch{result=fail('op13_preview_exception')}
    output().textContent=result.ok?
     'Предварительный манифест проверен: '+result.request.bodyMoves.length+' корпусов и '+
     result.request.itemMoves.length+' предметов. Нет записи, CAS, DONE или изменения семей.':
     'Отказ: '+String(result.error||'неизвестная ошибка')+'. Ничего не записано.';
   });
  });
 });
 return {ok:true,readOnly:true,sourceRevisionId:revision};
}
root.PasekaSectionalOP13GuidedV2=Object.freeze({inspect,makeStructure,prepare,plan,mount});
})(typeof window!=='undefined'?window:globalThis);
