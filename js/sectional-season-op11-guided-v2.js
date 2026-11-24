(function(root){
'use strict';
// Source-bound OP11 primary-wintering layout proposal; no DB writes or DONE.
const A=x=>Array.isArray(x)?x:[],O=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const S=x=>typeof x==='string'&&x.trim().length>0;
const bad=(error,details)=>({ok:false,error,...(details?{details}:{})});
const clone=x=>structuredClone(x),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PROFILE='sectional-multiqueen-v1';
function inspect(state,input){
 if(!O(input)||!S(input.hiveId)||!S(input.sourceRevisionId))return bad('op11_source_required');
 const audit=root.PasekaSectionalSeasonPhysicalManifestV2?.inspectSource?.(state,input.hiveId);
 if(!audit?.ok)return bad(audit?.error||'op11_source_audit_unavailable');
 if(audit.sourceRevisionId!==input.sourceRevisionId)return bad('op11_stale_source_revision');
 const source=A(state.sectionalLayouts).filter(x=>x?.hiveId===input.hiveId)[0];
 const sections=A(source?.sections),stacks=A(source?.stacks);
 if(source?.profileId!==PROFILE||source.schemaVersion!==1||source.mode!=='SIDE_BY_SIDE'||
    source.honeyStack!=null||sections.length!==3||stacks.length!==3||
    sections.some(x=>A(x.broodBodyIds).length!==2||
       !S(x.upperBroodBodyId)||!A(x.broodBodyIds).includes(x.upperBroodBodyId))||
    A(state.sectionalSeasonCycles).filter(x=>x?.hiveId===input.hiveId&&x.status==='ACTIVE').length!==1)
  return bad('op11_three_upper_bodies_in_active_season_required');
 const upper=sections.map(x=>x.upperBroodBodyId);
 if(new Set(upper).size!==3)return bad('op11_upper_body_duplicate');
 const openings=sections.flatMap(s=>A(s.openings).filter(o=>o&&o.bodyId===s.upperBroodBodyId));
 if(!openings.length||new Set(openings.map(o=>o?.id)).size!==openings.length||
    openings.some(o=>!S(o.id)||!upper.includes(o.bodyId)))
  return bad('op11_real_upper_openings_missing');
 if(!O(state.equipmentInventory?.items)||!O(state.equipmentInventory?.bodies))
  return bad('op11_inventory_missing');
 return {ok:true,audit,source,sections,stacks,upper,openings,inventory:state.equipmentInventory};
}
function prepare(state,input){
 const b=inspect(state,input);if(!b.ok)return b;
 const resultId=input.resultFamilyId;
 if(!S(resultId)||resultId.length>128||A(state.families).some(f=>f?.id===resultId))
  return bad('op11_new_unassigned_family_id_required');
 const chosen=[input.lowerBodyId,input.middleBodyId,input.upperBodyId];
 if(chosen.some(id=>!S(id))||new Set(chosen).size!==3||
    chosen.some(id=>!b.upper.includes(id)))return bad('op11_preserve_three_original_upper_body_ids');
 const stack=b.stacks.find(x=>x.bottomItemId===input.bottomItemId);
 if(!stack||!S(stack.id))return bad('op11_registered_original_bottom_required');
 const items=b.inventory.items;
 const choose=(id,kind,storageOnly=false)=>{
  const item=items[id];return S(id)&&O(item)&&item.id===id&&item.kind===kind&&item.condition==='good'&&
   (storageOnly?item.location?.type==='storage':
    item.location?.type==='storage'||(item.location?.type==='hive'&&item.location.hiveId===input.hiveId));
 };
 if(!choose(input.bottomItemId,'bottom')||!choose(input.coverItemId,'cover')||
    !choose(input.topRiserItemId,'topRiser')||!choose(input.feederItemId,'feeder'))
  return bad('op11_exact_bottom_cover_riser_feeder_required');
 const assigned=O(input.plugAssignments)?input.plugAssignments:{};
 const openingIds=b.openings.map(x=>x.id);
 if(Object.keys(assigned).length!==openingIds.length||
    Object.keys(assigned).some(id=>!openingIds.includes(id))||
    openingIds.some(id=>!choose(assigned[id],'plasticPlug',true))||
    new Set(openingIds.map(id=>assigned[id])).size!==openingIds.length)
  return bad('op11_one_registered_stored_plastic_plug_per_opening_required');
 const selectedOpening=b.openings.filter(o=>chosen.includes(o.bodyId)).map(clone);
 const section={id:'combined',position:'combined',familyId:resultId,
  broodBodyIds:chosen,upperBroodBodyId:input.upperBodyId,openings:selectedOpening};
 const stackId=stack.id;
 const target={id:b.source.id,hiveId:input.hiveId,profileId:PROFILE,schemaVersion:1,
  mode:'SINGLE_FAMILY',purpose:'primary_wintering',closuresConfirmed:input.closuresConfirmed===true,
  sections:[section],stacks:[{id:stackId,position:'combined',sectionIds:['combined'],
   bottomItemId:input.bottomItemId,coverItemId:input.coverItemId,
   topRiserItemId:input.topRiserItemId,feederItemId:input.feederItemId}],
  technicalConnections:[],temporaryQueenIsolation:[],meshDiaphragms:[],
  closedOpenings:b.openings.map(opening=>({itemId:assigned[opening.id],
   bodyId:opening.bodyId,openingId:opening.id}))};
 const desiredItems=new Map([
  [input.bottomItemId,{type:'hive',hiveId:input.hiveId,stackId}],
  [input.coverItemId,{type:'hive',hiveId:input.hiveId,stackId}],
  [input.topRiserItemId,{type:'hive',hiveId:input.hiveId,stackId}],
  [input.feederItemId,{type:'hive',hiveId:input.hiveId,stackId}]
 ]);
 for(const x of b.openings)desiredItems.set(assigned[x.id],
  {type:'hive',hiveId:input.hiveId,bodyId:x.bodyId,openingId:x.id});
 if(desiredItems.size!==4+b.openings.length)return bad('op11_target_accessory_reused');
 const removedBodyIds=b.audit.bodyEntries.map(x=>x.id).filter(id=>!chosen.includes(id));
 const newPosition=new Map(chosen.map(id=>[id,{type:'sectional',hiveId:input.hiveId,
  layoutId:target.id,bodyRole:'brood',sectionId:'combined',position:'combined'}]));
 const changedBodyIds=b.audit.bodyEntries.filter(e=>!same(e.location,newPosition.get(e.id)||null))
  .map(x=>x.id).sort();
 const removedItemIds=b.audit.itemEntries.filter(x=>!desiredItems.has(x.id)).map(x=>x.id);
 const changedItemIds=[...new Set([...removedItemIds,
  ...[...desiredItems].filter(([id,loc])=>!same(items[id]?.location,loc)).map(([id])=>id)])].sort();
 return {ok:true,previewOnly:true,sourceRevisionId:input.sourceRevisionId,targetLayout:target,
  resultFamily:{id:resultId,hive:input.hiveId,queenIdentityStatus:'unresolved',currentQueenId:null},
  removedBodyIds,changedBodyIds,removedItemIds,changedItemIds,
  desiredItems:Object.fromEntries(desiredItems)};
}
function plan(state,input){
 const p=prepare(state,input);if(!p.ok)return p;
 const bodyStorage=O(input.bodyStorage)?input.bodyStorage:{},itemStorage=O(input.itemStorage)?input.itemStorage:{};
 const loc=x=>S(x)&&x.length<=160;
 if(p.removedBodyIds.some(id=>!loc(bodyStorage[id]))||
    Object.keys(bodyStorage).some(id=>!p.removedBodyIds.includes(id)))
  return bad('op11_exact_removed_body_storage_required');
 if(p.removedItemIds.some(id=>!loc(itemStorage[id]))||
    Object.keys(itemStorage).some(id=>!p.removedItemIds.includes(id)))
  return bad('op11_exact_removed_item_storage_required');
 if(input.userConfirmed!==true||input.actualWorkConfirmed!==true||
    input.actualMergeConfirmed!==true||input.closuresConfirmed!==true)
  return bad('op11_explicit_merge_and_plug_confirmation_required');
 const destinations={...p.desiredItems};
 for(const id of p.removedItemIds)destinations[id]={type:'storage',label:itemStorage[id]};
 return root.PasekaSectionalSeasonPhysicalManifestV2.plan(state,{
  operationId:'OP-11',hiveId:input.hiveId,expectedSourceRevisionId:p.sourceRevisionId,
  occurredAt:input.occurredAt,userConfirmed:true,actualWorkConfirmed:true,actualMergeConfirmed:true,
  resultFamily:p.resultFamily,targetLayout:p.targetLayout,
  itemDestinations:destinations,
  storageLocations:Object.fromEntries(p.removedBodyIds.map(id=>[id,bodyStorage[id]])),
  confirmedBodyIds:input.confirmedBodyIds,confirmedItemIds:input.confirmedItemIds
 });
}
function mount(host,getState,hiveId,controls){
 if(!host||typeof getState!=='function'||!S(hiveId))return bad('op11_host_or_hive_missing');
 const state=getState(),audit=root.PasekaSectionalSeasonPhysicalManifestV2?.inspectSource?.(state,hiveId);
 if(!audit?.ok){host.textContent='OP-11: исходный инвентарь не подтверждён.';return bad('op11_source_audit_failed');}
 const sourceRevisionId=audit.sourceRevisionId;
 const b=inspect(state,{hiveId,sourceRevisionId});
 if(!b.ok){host.textContent='OP-11: '+b.error;return b;}
 const physical=root.PasekaSectionalPhysicalLayout?.validate?.(b.source,state);
 if(!physical?.valid){host.textContent='OP-11: физическая модель источника не прошла локальную проверку.';return bad('op11_source_physical_layout_invalid');}
 const newId=root.crypto?.randomUUID?.();
 if(!S(newId)){host.textContent='OP-11: безопасное создание идентификатора новой семьи недоступно.';return bad('op11_unique_family_id_unavailable');}
 const list=(rows)=>'<option value="">— Выберите лично —</option>'+
  rows.map(([value,label])=>'<option value="'+esc(value)+'">'+esc(label)+'</option>').join('');
 const choices=b.upper.map(id=>[id,id]);
 const sourceBottoms=b.stacks.map(x=>[x.bottomItemId,x.bottomItemId+' / '+x.position]);
 const items=Object.values(b.inventory.items).filter(x=>x?.condition==='good'&&
  (x.location?.type==='storage'||(x.location?.type==='hive'&&x.location.hiveId===hiveId)));
 const byKind=kind=>list(items.filter(x=>x.kind===kind).map(x=>[x.id,x.id]));
 host.innerHTML='<fieldset data-op11-guide><legend>OP-11 · сборка трёх верхних корпусов на зиму</legend>'+
  '<p>Все три корпуса и их порядок выбираются вручную. Новая объединённая семья пока имеет неизвестную матку; её ID создан только в памяти формы. Ревизия '+esc(sourceRevisionId)+'</p>'+
  '<label>Нижний корпус зимней колонны<select data-op11-field="lowerBodyId">'+list(choices)+'</select></label>'+
  '<label>Средний корпус<select data-op11-field="middleBodyId">'+list(choices)+'</select></label>'+
  '<label>Верхний корпус<select data-op11-field="upperBodyId">'+list(choices)+'</select></label>'+
  '<label>Реальное оставляемое дно<select data-op11-field="bottomItemId">'+list(sourceBottoms)+'</select></label>'+
  '<label>Крышка<select data-op11-field="coverItemId">'+byKind('cover')+'</select></label>'+
  '<label>Подкрышник<select data-op11-field="topRiserItemId">'+byKind('topRiser')+'</select></label>'+
  '<label>Потолочная кормушка<select data-op11-field="feederItemId">'+byKind('feeder')+'</select></label>'+
  '<p>Пластиковая заглушка на каждое реальное техническое отверстие сохраняемого корпуса</p>'+
  b.openings.map(o=>'<label>Отверстие '+esc(o.id)+' / корпус '+esc(o.bodyId)+
   '<select data-op11-plug="'+esc(o.id)+'">'+byKind('plasticPlug')+'</select></label>').join('')+
  '<button type="button" data-op11-next>Далее: склад и подтверждения</button>'+
  '<div data-op11-moves></div><div role="status" aria-live="polite" data-op11-result></div></fieldset>';
 const val=()=>Object.fromEntries([...host.querySelectorAll('[data-op11-field]')]
  .map(x=>[x.getAttribute('data-op11-field'),x.value]));
 const plugs=()=>Object.fromEntries([...host.querySelectorAll('[data-op11-plug]')]
  .map(x=>[x.getAttribute('data-op11-plug'),x.value]));
 const output=()=>host.querySelector('[data-op11-result]');
 const moves=()=>host.querySelector('[data-op11-moves]');
 let prepared;
 for(const el of host.querySelectorAll('[data-op11-field],[data-op11-plug]'))
  el.addEventListener('change',()=>{
   prepared=null;moves().textContent='';
   output().textContent='Параметры изменились: повторите проверку выбора до заполнения склада.';
  });
 const pick=()=>({hiveId,sourceRevisionId,resultFamilyId:newId,...val(),plugAssignments:plugs()});
 host.querySelector('[data-op11-next]').addEventListener('click',()=>{
  prepared=prepare(getState(),{...pick(),closuresConfirmed:false});
  if(!prepared.ok){moves().textContent='';output().textContent='Целевая схема отклонена: '+prepared.error;return;}
  const store=(name,id)=>'<label>Фактический склад для '+esc(id)+
   '<input type="text" maxlength="160" data-op11-'+name+'="'+esc(id)+'" placeholder="Укажите реальное место"></label>';
  const confirm=(kind,id)=>'<label><input type="checkbox" data-op11-confirm-'+kind+'="'+esc(id)+'"> Лично подтверждаю перемещение '+esc(id)+'</label>';
  moves().innerHTML='<p>Снятые корпуса</p>'+prepared.removedBodyIds.map(id=>store('body-store',id)).join('')+
   '<p>Снятые предметы</p>'+prepared.removedItemIds.map(id=>store('item-store',id)).join('')+
   '<p>Подтвердите фактическое перемещение каждого изменённого корпуса</p>'+
   prepared.changedBodyIds.map(id=>confirm('body',id)).join('')+
   '<p>Подтвердите фактическое перемещение каждого изменённого предмета</p>'+
   prepared.changedItemIds.map(id=>confirm('item',id)).join('')+
   '<label><input type="checkbox" data-op11-closures> Лично подтверждаю фактическое закрытие всех указанных технических отверстий пластиковыми заглушками</label>'+
   '<label><input type="checkbox" data-op11-merge> Лично подтверждаю физическое объединение трёх семей</label>'+
   '<button type="button" data-op11-check>Предварительно проверить манифест без записи</button>';
  output().textContent='Целевая схема подготовлена. Ничего не сохранено.';
  const read=(name)=>Object.fromEntries([...moves().querySelectorAll('[data-op11-'+name+']')]
   .map(el=>[el.getAttribute('data-op11-'+name),el.value]));
  const check=(kind)=>[...moves().querySelectorAll('[data-op11-confirm-'+kind+']')]
   .filter(x=>x.checked).map(x=>x.getAttribute('data-op11-confirm-'+kind));
  moves().querySelector('[data-op11-check]').addEventListener('click',()=>{
   const at=controls?.querySelector('[data-season-at]')?.value||'';
   let r;try{r=plan(getState(),{...pick(),
    occurredAt:at?new Date(at).toISOString():'',bodyStorage:read('body-store'),
    itemStorage:read('item-store'),confirmedBodyIds:check('body'),confirmedItemIds:check('item'),
    closuresConfirmed:moves().querySelector('[data-op11-closures]').checked,
    actualMergeConfirmed:moves().querySelector('[data-op11-merge]').checked,
    userConfirmed:controls?.querySelector('[data-season-confirm]')?.checked===true,
    actualWorkConfirmed:controls?.querySelector('[data-season-confirm]')?.checked===true});}
   catch{r=bad('op11_preview_failed');}
   output().textContent=r.ok?
    'Предварительный манифест проверен: '+r.request.bodyMoves.length+
    ' корпусов и '+r.request.itemMoves.length+
    ' предметов. Ни семья, ни матка, ни инвентарь не менялись. Нужны полный archive restore и CAS.':
    'План отклонён: '+String(r.error||'неизвестная ошибка')+'. Ничего не записано.';
  });
 });
 return {ok:true,readOnly:true,sourceRevisionId};
}
root.PasekaSectionalOP11GuidedV2=Object.freeze({inspect,prepare,plan,mount});
})(typeof window!=='undefined'?window:globalThis);
