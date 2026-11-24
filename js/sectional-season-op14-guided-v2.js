(function(root){
'use strict';
// OP14 original early-honey consolidation: exact user choices, read-only.
const A=x=>Array.isArray(x)?x:[],O=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const S=x=>typeof x==='string'&&x.trim().length>0,copy=x=>structuredClone(x);
const fail=(error,details)=>({ok:false,error,...(details?{details}:{})});
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PROFILE='sectional-multiqueen-v1',same=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
function inspect(state,input){
 if(!O(input)||!S(input.hiveId)||!S(input.sourceRevisionId))return fail('op14_source_required');
 const snapshot=root.PasekaSectionalSeasonPhysicalManifestV2?.inspectSource?.(state,input.hiveId);
 if(!snapshot?.ok)return fail(snapshot?.error||'op14_source_audit_missing');
 if(snapshot.sourceRevisionId!==input.sourceRevisionId)return fail('op14_source_revision_stale');
 const layouts=A(state.sectionalLayouts).filter(l=>l?.hiveId===input.hiveId);
 const source=layouts[0],sections=A(source?.sections),stacks=A(source?.stacks),honey=source?.honeyStack;
 if(layouts.length!==1||source?.profileId!==PROFILE||source.schemaVersion!==1||
    source.mode!=='SIDE_BY_SIDE'||sections.length!==3||stacks.length!==3||
    sections.some(s=>A(s.broodBodyIds).length!==2||!A(s.broodBodyIds).includes(s.upperBroodBodyId))||
    honey?.purpose!=='early'||A(honey.bodyIds).length!==2||A(honey.excluders).length!==2)
   return fail('op14_confirmed_early_honey_source_required');
 const cycles=A(state.sectionalSeasonCycles).filter(c=>c?.hiveId===input.hiveId&&c.status==='ACTIVE');
 if(cycles.length!==1)return fail('op14_active_cycle_required');
 // OP14 is a post-OP13 operation, not an independent fall merge.
 const events=A(state.familyEvents);
 const winter=events.some(e=>e.type==='alternative_wintering_configured'&&
  e.hiveId===input.hiveId&&e.techProcessId===cycles[0].id);
 const placements=events.filter(e=>e.type==='placement_changed'&&
  e.operationId==='OP-13'&&e.hiveId===input.hiveId&&e.techProcessId===cycles[0].id);
 if(!winter||placements.length!==2||new Set(placements.map(e=>e.familyId)).size!==2)
  return fail('op14_confirmed_op12_op13_lineage_required');
 const upper=sections.map(s=>s.upperBroodBodyId);
 if(new Set(upper).size!==3)return fail('op14_upper_body_identity_invalid');
 const physical=root.PasekaSectionalPhysicalLayout?.validate?.(source,state);
 if(!physical?.valid)return fail('op14_original_physical_layout_invalid',
  {errors:physical?.errors?.slice(0,8)||[]});
 return {ok:true,snapshot,source,sections,stacks,honey,upper,cycle:cycles[0],
  inventory:state.equipmentInventory};
}
function prepare(state,input){
 const src=inspect(state,input);if(!src.ok)return src;
 if(!S(input.resultFamilyId)||input.resultFamilyId.length>128||
    A(state.families).some(f=>f?.id===input.resultFamilyId))
  return fail('op14_new_result_family_id_required');
 const upper=[input.firstBodyId,input.secondBodyId,input.thirdBodyId];
 if(upper.some(x=>!S(x))||new Set(upper).size!==3||
    upper.some(x=>!src.upper.includes(x)))
  return fail('op14_three_original_upper_body_order_required');
 const bodies=upper.slice(),extra=input.fourthBodyId;
 if(S(extra)){
  const original=src.sections.flatMap(s=>A(s.broodBodyIds));
  const index=Number(input.fourthBodyPosition);
  if(!original.includes(extra)||src.upper.includes(extra)||!Number.isInteger(index)||
     index<0||index>3)return fail('op14_extra_body_must_be_original_lower_with_explicit_position');
  bodies.splice(index,0,extra);
 }else if(input.fourthBodyPosition!=null&&input.fourthBodyPosition!==''){
  return fail('op14_extra_position_without_body');
 }
 const inventory=src.inventory,items=inventory?.items;
 const allowed=(id,kind)=>{
  const i=items?.[id];return S(id)&&O(i)&&i.id===id&&i.kind===kind&&
   i.condition==='good'&&(i.location?.type==='storage'||
    (i.location?.type==='hive'&&i.location.hiveId===input.hiveId));
 };
 const oldBottoms=src.stacks.map(s=>s.bottomItemId);
 if(!oldBottoms.includes(input.bottomItemId)||!allowed(input.bottomItemId,'bottom'))
  return fail('op14_actual_existing_bottom_required');
 for(const [key,kind]of [['coverItemId','cover'],['topRiserItemId','topRiser'],['feederItemId','feeder']]){
  if(S(input[key])&&!allowed(input[key],kind))return fail('op14_unknown_or_foreign_accessory',{key});
 }
 const stack=src.stacks.find(s=>s.bottomItemId===input.bottomItemId),stackId=stack.id;
 const itemTo={};
 const place=(id)=>{if(S(id))itemTo[id]={type:'hive',hiveId:input.hiveId,stackId}};
 place(input.bottomItemId);
 place(input.coverItemId);place(input.topRiserItemId);place(input.feederItemId);
 const openings=src.sections.flatMap(s=>A(s.openings)
   .filter(o=>bodies.includes(o.bodyId)).map(copy));
 const target={id:src.source.id,hiveId:input.hiveId,profileId:PROFILE,
  schemaVersion:1,mode:'SINGLE_FAMILY',purpose:'early_honey_merge',
  sections:[{id:'combined',position:'combined',familyId:input.resultFamilyId,
   broodBodyIds:bodies,upperBroodBodyId:bodies[bodies.length-1],openings}],
  stacks:[{id:stackId,position:'combined',sectionIds:['combined'],
   bottomItemId:input.bottomItemId,
   ...(S(input.coverItemId)?{coverItemId:input.coverItemId}:{}),
   ...(S(input.topRiserItemId)?{topRiserItemId:input.topRiserItemId}:{}),
   ...(S(input.feederItemId)?{feederItemId:input.feederItemId}:{})}],
  technicalConnections:[],temporaryQueenIsolation:[],closedOpenings:[],
  meshDiaphragms:[]};
 const after=new Map(bodies.map(id=>[id,{type:'sectional',hiveId:input.hiveId,
  layoutId:target.id,bodyRole:'brood',sectionId:'combined',position:'combined'}]));
 const changedBodyIds=src.snapshot.bodyEntries.filter(b=>!same(b.location,after.get(b.id)||null))
  .map(b=>b.id).sort();
 const removedBodyIds=src.snapshot.bodyEntries.filter(b=>!after.has(b.id)).map(b=>b.id);
 const removedItemIds=src.snapshot.itemEntries.filter(i=>!Object.hasOwn(itemTo,i.id)).map(i=>i.id);
 const changedItemIds=[...new Set([...removedItemIds,...Object.entries(itemTo)
  .filter(([id,loc])=>!same(items[id]?.location,loc)).map(([id])=>id)])].sort();
 return {ok:true,previewOnly:true,sourceRevisionId:input.sourceRevisionId,
  targetLayout:target,resultFamily:{id:input.resultFamilyId,hive:input.hiveId,
   queenIdentityStatus:'unresolved',currentQueenId:null},
  removedBodyIds,changedBodyIds,removedItemIds,changedItemIds,itemDestinations:itemTo};
}
function plan(state,input){
 const p=prepare(state,input);if(!p.ok)return p;
 const bodyStorage=O(input.bodyStorage)?input.bodyStorage:{},
  itemStorage=O(input.itemStorage)?input.itemStorage:{};
 const loc=x=>S(x)&&x.length<=160;
 if(p.removedBodyIds.some(id=>!loc(bodyStorage[id]))||
    Object.keys(bodyStorage).some(id=>!p.removedBodyIds.includes(id)))
  return fail('op14_confirmed_body_storage_required');
 if(p.removedItemIds.some(id=>!loc(itemStorage[id]))||
    Object.keys(itemStorage).some(id=>!p.removedItemIds.includes(id)))
  return fail('op14_confirmed_item_storage_required');
 if(!Array.isArray(input.confirmedBodyIds)||!Array.isArray(input.confirmedItemIds))
  return fail('op14_explicit_movement_confirmations_required');
 if(input.userConfirmed!==true||input.actualWorkConfirmed!==true||
    input.actualMergeConfirmed!==true||input.earlyHoneyHarvestConfirmed!==true||
    input.actualDiaphragmsRemovedConfirmed!==true||
    input.familiesOnSeparateBottomsConfirmed!==true)
  return fail('op14_harvest_and_merge_actual_confirmation_required');
 const itemDestinations={...p.itemDestinations};
 for(const id of p.removedItemIds)itemDestinations[id]={type:'storage',label:itemStorage[id]};
 return root.PasekaSectionalSeasonPhysicalManifestV2.plan(state,{
  operationId:'OP-14',hiveId:input.hiveId,
  expectedSourceRevisionId:p.sourceRevisionId,occurredAt:input.occurredAt,
  userConfirmed:true,actualWorkConfirmed:true,
  actualMergeConfirmed:true,earlyHoneyHarvestConfirmed:true,
  actualDiaphragmsRemovedConfirmed:true,familiesOnSeparateBottomsConfirmed:true,
  resultFamily:p.resultFamily,targetLayout:p.targetLayout,
  storageLocations:Object.fromEntries(p.removedBodyIds.map(id=>[id,bodyStorage[id]])),
  itemDestinations,confirmedBodyIds:input.confirmedBodyIds,
  confirmedItemIds:input.confirmedItemIds
 });
}
function mount(host,getState,hiveId,controls){
 if(!host||typeof getState!=='function'||!S(hiveId))return fail('op14_host_or_hive_missing');
 const audit=root.PasekaSectionalSeasonPhysicalManifestV2?.inspectSource?.(getState(),hiveId);
 if(!audit?.ok){host.textContent='OP-14: исходный инвентарь не подтверждён.';return fail('op14_audit_failed')}
 const revision=audit.sourceRevisionId,b=inspect(getState(),{hiveId,sourceRevisionId:revision});
 if(!b.ok){host.textContent='OP-14: '+b.error;return b}
 const resultId=root.crypto?.randomUUID?.();
 if(!S(resultId)){host.textContent='OP-14: безопасный ID новой семьи недоступен.';return fail('op14_id_missing')}
 const opts=rows=>'<option value="">— Выберите лично —</option>'+
  rows.map(([id,label])=>'<option value="'+esc(id)+'">'+esc(label)+'</option>').join('');
 const brood=b.sections.flatMap(s=>s.broodBodyIds);
 const lower=brood.filter(x=>!b.upper.includes(x));
 const avail=Object.values(b.inventory.items).filter(i=>i?.condition==='good'&&
  (i.location?.type==='storage'||(i.location?.type==='hive'&&i.location.hiveId===hiveId)));
 const choices=kind=>opts(avail.filter(i=>i.kind===kind).map(x=>[x.id,x.id]));
 host.innerHTML='<fieldset data-op14-guide><legend>OP-14 · объединение после раннего медосбора</legend>'+
  '<p>Выберите три прежних верхних гнездовых корпуса в точном порядке снизу вверх. Четвёртый корпус — только если он реально оставлен после отбора мёда. Матка новой семьи неизвестна.</p>'+
  '<p>Исходная ревизия '+esc(revision)+', медовые корпуса '+esc(b.honey.bodyIds.join(', '))+'</p>'+
  '<label>Корпус 1<select data-op14-field="firstBodyId">'+opts(b.upper.map(x=>[x,x]))+'</select></label>'+
  '<label>Корпус 2<select data-op14-field="secondBodyId">'+opts(b.upper.map(x=>[x,x]))+'</select></label>'+
  '<label>Корпус 3<select data-op14-field="thirdBodyId">'+opts(b.upper.map(x=>[x,x]))+'</select></label>'+
  '<label>Дополнительный гнездовой корпус (необязательный)<select data-op14-field="fourthBodyId">'+opts(lower.map(x=>[x,x]))+'</select></label>'+
  '<label>Расположение четвёртого корпуса снизу<select data-op14-field="fourthBodyPosition">'+
   opts([['0','Самый нижний'],['1','Второй'],['2','Третий'],['3','Самый верхний']])+'</select></label>'+
  '<label>Дно для объединённой семьи<select data-op14-field="bottomItemId">'+
   opts(b.stacks.map(s=>[s.bottomItemId,s.bottomItemId+' / '+s.position]))+'</select></label>'+
  '<label>Крышка (при фактической установке)<select data-op14-field="coverItemId">'+choices('cover')+'</select></label>'+
  '<label>Подкрышник (при фактической установке)<select data-op14-field="topRiserItemId">'+choices('topRiser')+'</select></label>'+
  '<label>Кормушка (при фактической установке)<select data-op14-field="feederItemId">'+choices('feeder')+'</select></label>'+
  '<button type="button" data-op14-next>Далее: реальный склад и подтверждения</button>'+
  '<div data-op14-moves></div><div role="status" aria-live="polite" data-op14-result></div></fieldset>';
 const values=()=>Object.fromEntries([...host.querySelectorAll('[data-op14-field]')]
  .map(el=>[el.getAttribute('data-op14-field'),el.value]));
 const output=()=>host.querySelector('[data-op14-result]');
 const panel=()=>host.querySelector('[data-op14-moves]');
 const pick=()=>({hiveId,sourceRevisionId:revision,resultFamilyId:resultId,...values()});
 for(const el of host.querySelectorAll('[data-op14-field]'))el.addEventListener('change',()=>{
  panel().textContent='';output().textContent='Параметры изменены; предыдущие подтверждения сброшены.';
 });
 host.querySelector('[data-op14-next]').addEventListener('click',()=>{
  const p=prepare(getState(),pick());
  if(!p.ok){panel().textContent='';output().textContent='Целевая схема отклонена: '+p.error;return}
  const store=(kind,id)=>'<label>Место хранения '+esc(id)+
   '<input type="text" maxlength="160" data-op14-'+kind+'="'+esc(id)+'" placeholder="Реальное место"></label>';
  const check=(kind,id)=>'<label><input type="checkbox" data-op14-confirm-'+kind+'="'+esc(id)+'"> Лично подтверждаю перемещение '+esc(id)+'</label>';
  panel().innerHTML='<p>Корпуса на склад</p>'+p.removedBodyIds.map(x=>store('body-store',x)).join('')+
   '<p>Оборудование на склад</p>'+p.removedItemIds.map(x=>store('item-store',x)).join('')+
   '<p>Подтверждения всех изменённых корпусов</p>'+p.changedBodyIds.map(x=>check('body',x)).join('')+
   '<p>Подтверждения всех изменённых предметов</p>'+p.changedItemIds.map(x=>check('item',x)).join('')+
   '<label><input type="checkbox" data-op14-harvest> Ранний мёд и медовые корпуса действительно сняты</label>'+
   '<label><input type="checkbox" data-op14-diaphragms> Диафрагмы действительно удалены ранее</label>'+
   '<label><input type="checkbox" data-op14-separate> Перед объединением семьи действительно находились на отдельных днищах</label>'+
   '<label><input type="checkbox" data-op14-merge> Физическое объединение действительно выполнено</label>'+
   '<button type="button" data-op14-preview>Предварительно проверить без записи</button>';
  output().textContent='Составлено только предварительное размещение; ничего не сохранено.';
  const read=kind=>Object.fromEntries([...panel().querySelectorAll('[data-op14-'+kind+']')]
   .map(el=>[el.getAttribute('data-op14-'+kind),el.value]));
  const checked=kind=>[...panel().querySelectorAll('[data-op14-confirm-'+kind+']')]
   .filter(el=>el.checked).map(el=>el.getAttribute('data-op14-confirm-'+kind));
  panel().querySelector('[data-op14-preview]').addEventListener('click',()=>{
   const at=controls?.querySelector('[data-season-at]')?.value||'';
   let r;try{r=plan(getState(),{...pick(),bodyStorage:read('body-store'),
    itemStorage:read('item-store'),confirmedBodyIds:checked('body'),
    confirmedItemIds:checked('item'),occurredAt:at?new Date(at).toISOString():'',
    userConfirmed:controls?.querySelector('[data-season-confirm]')?.checked===true,
    actualWorkConfirmed:controls?.querySelector('[data-season-confirm]')?.checked===true,
    actualMergeConfirmed:panel().querySelector('[data-op14-merge]').checked,
    earlyHoneyHarvestConfirmed:panel().querySelector('[data-op14-harvest]').checked,
    actualDiaphragmsRemovedConfirmed:panel().querySelector('[data-op14-diaphragms]').checked,
    familiesOnSeparateBottomsConfirmed:panel().querySelector('[data-op14-separate]').checked});}
    catch{r=fail('op14_preview_unavailable')}
   output().textContent=r.ok?
    'Предварительный манифест проверен: '+r.request.bodyMoves.length+
    ' перемещений корпусов, '+r.request.itemMoves.length+
    ' перемещений оборудования. Нет CAS, DONE или изменения IndexedDB.':
    'Отказ: '+String(r.error||'неизвестная ошибка')+'. Данные не изменены.';
  });
 });
 return {ok:true,readOnly:true,sourceRevisionId:revision};
}
root.PasekaSectionalOP14GuidedV2=Object.freeze({inspect,prepare,plan,mount});
})(typeof window!=='undefined'?window:globalThis);
