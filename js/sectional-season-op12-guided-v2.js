(function(root){
'use strict';
// Read-only, user-confirmed OP12 input. Produces an exact target and movement
// request for the existing fail-closed manifest. It never persists or marks DONE.
const A=x=>Array.isArray(x)?x:[], O=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const S=x=>typeof x==='string'&&x.trim().length>0;
const fail=(error,details)=>({ok:false,error,...(details?{details}:{})});
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PROFILE='sectional-multiqueen-v1';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function inspect(state,hiveId,revision){
 const source=A(state?.sectionalLayouts).filter(x=>x?.hiveId===hiveId);
 const snapshot=root.PasekaSectionalSeasonPhysicalManifestV2?.inspectSource?.(state,hiveId);
 if(!snapshot?.ok)return fail(snapshot?.error||'op12_source_audit_unavailable');
 if(!S(revision)||revision!==snapshot.sourceRevisionId)return fail('op12_source_revision_stale');
 const l=source[0],sections=A(l?.sections),stacks=A(l?.stacks);
 if(l?.profileId!==PROFILE||l.mode!=='SIDE_BY_SIDE'||l.schemaVersion!==1||
    l.honeyStack!=null||sections.length!==3||stacks.length!==3||
    sections.some(s=>A(s.broodBodyIds).length!==2||!S(s.familyId)||!S(s.id))||
    new Set(sections.map(s=>s.familyId)).size!==3)
   return fail('op12_source_shape_not_supported');
 const inv=state.equipmentInventory;
 if(!O(inv?.items)||!O(inv?.bodies))return fail('op12_inventory_missing');
 const cycles=A(state.sectionalSeasonCycles).filter(c=>c?.hiveId===hiveId&&c.status==='ACTIVE');
 if(cycles.length!==1)return fail('op12_active_cycle_missing');
 return {ok:true,layout:l,sections,stacks,snapshot,inv};
}
function prepare(state,input){
 if(!O(input)||!S(input.hiveId))return fail('op12_input_missing');
 const b=inspect(state,input.hiveId,input.sourceRevisionId);
 if(!b.ok)return b;
 const byFamily=new Map(b.sections.map((s,i)=>[s.familyId,{section:s,stack:b.stacks[i]}]));
 const families=[input.strongestFamilyId,input.middleFamilyId,input.upperFamilyId];
 if(families.some(id=>!S(id)||!byFamily.has(id))||new Set(families).size!==3)
  return fail('op12_three_distinct_families_required');
 const strongest=byFamily.get(families[0]),middle=byFamily.get(families[1]),upper=byFamily.get(families[2]);
 if(!A(middle.section.broodBodyIds).includes(input.middleBodyId)||
    !A(upper.section.broodBodyIds).includes(input.upperBodyId))
  return fail('op12_body_must_belong_to_its_family');
 const inv=b.inv;
 const allowedItem=(id,kind,storageOnly=false)=>{
  const item=inv.items[id];
  return S(id)&&O(item)&&item.id===id&&item.kind===kind&&item.condition==='good'&&
   (storageOnly?item.location?.type==='storage':
    item.location?.type==='storage'||(item.location?.type==='hive'&&item.location.hiveId===input.hiveId));
 };
 if(!allowedItem(input.coverItemId,'cover')||
    (S(input.feederItemId)&&!allowedItem(input.feederItemId,'feeder'))||
    !allowedItem(input.lowerDiaphragmId,'meshDiaphragm',true)||
    !allowedItem(input.upperDiaphragmId,'meshDiaphragm',true)||
    input.lowerDiaphragmId===input.upperDiaphragmId)
  return fail('op12_registered_cover_feeder_and_two_stored_diaphragms_required');
 const shape=[
  {position:'lower',entry:strongest,bodies:[...strongest.section.broodBodyIds]},
  {position:'middle',entry:middle,bodies:[input.middleBodyId]},
  {position:'upper',entry:upper,bodies:[input.upperBodyId]}
 ];
 const sections=shape.map(({position,entry,bodies})=>({
  ...structuredClone(entry.section),position,broodBodyIds:bodies,
  upperBroodBodyId:bodies.includes(entry.section.upperBroodBodyId)?
   entry.section.upperBroodBodyId:bodies[bodies.length-1],
  openings:A(entry.section.openings).filter(o=>bodies.includes(o.bodyId)).map(x=>structuredClone(x))
 }));
 const stackId=strongest.stack?.id, bottomItemId=strongest.stack?.bottomItemId;
 if(!S(stackId)||!allowedItem(bottomItemId,'bottom'))
  return fail('op12_strongest_registered_bottom_missing');
 const stack={id:stackId,position:'column',sectionIds:sections.map(s=>s.id),
  bottomItemId,coverItemId:input.coverItemId,
  boundaries:['lower-middle','middle-upper']};
 if(S(input.feederItemId))stack.feederItemId=input.feederItemId;
 const target={id:b.layout.id,hiveId:input.hiveId,profileId:PROFILE,
  schemaVersion:1,mode:'ALTERNATIVE_WINTERING_COLUMN',sections,stacks:[stack],
  technicalConnections:[],temporaryQueenIsolation:[],closedOpenings:[],
  meshDiaphragms:[
   {itemId:input.lowerDiaphragmId,positionLabel:'lower-middle'},
   {itemId:input.upperDiaphragmId,positionLabel:'middle-upper'}]};
 const retainedIds=new Set(sections.flatMap(s=>s.broodBodyIds));
 const targetPositions=new Map(sections.flatMap(section=>section.broodBodyIds.map(bodyId=>[
  bodyId,{type:'sectional',hiveId:input.hiveId,layoutId:target.id,
   bodyRole:'brood',sectionId:section.id,position:section.position}])));
 const changedBodyIds=b.snapshot.bodyEntries.filter(entry=>
  !same(entry.location,targetPositions.get(entry.id)||null)).map(x=>x.id).sort();
 const removedBodyIds=changedBodyIds.filter(id=>!retainedIds.has(id));
 const desiredItems=new Map([
  [bottomItemId,{type:'hive',hiveId:input.hiveId,stackId}],
  [input.coverItemId,{type:'hive',hiveId:input.hiveId,stackId}],
  [input.lowerDiaphragmId,{type:'hive',hiveId:input.hiveId,stackId,positionLabel:'lower-middle'}],
  [input.upperDiaphragmId,{type:'hive',hiveId:input.hiveId,stackId,positionLabel:'middle-upper'}]
 ]);
 if(S(input.feederItemId))desiredItems.set(input.feederItemId,{type:'hive',hiveId:input.hiveId,stackId});
 const removedItemIds=b.snapshot.itemEntries.filter(x=>!desiredItems.has(x.id)).map(x=>x.id);
 const changedItemIds=[...new Set([...removedItemIds,
   ...[...desiredItems].filter(([id,loc])=>!same(inv.items[id]?.location,loc)).map(([id])=>id)])].sort();
 return {ok:true,readOnly:true,sourceRevisionId:input.sourceRevisionId,
  targetLayout:target,strongestFamilyId:families[0],stackId,
  changedBodyIds,removedBodyIds,removedItemIds,changedItemIds,
  desiredItems:Object.fromEntries(desiredItems)};
}
function plan(state,input){
 const p=prepare(state,input);
 if(!p.ok)return p;
 const bodyStorage=O(input.bodyStorage)?input.bodyStorage:{};
 const itemStorage=O(input.itemStorage)?input.itemStorage:{};
 const validLocation=x=>S(x)&&x.length<=160;
 if(p.removedBodyIds.some(id=>!validLocation(bodyStorage[id]))||
    Object.keys(bodyStorage).some(id=>!p.removedBodyIds.includes(id)))
  return fail('op12_removed_body_storage_required');
 if(p.removedItemIds.some(id=>!validLocation(itemStorage[id]))||
    Object.keys(itemStorage).some(id=>!p.removedItemIds.includes(id)))
  return fail('op12_removed_item_storage_required');
 if(input.userConfirmed!==true||input.actualWorkConfirmed!==true||
    input.actualIsolationConfirmed!==true)
  return fail('op12_actual_work_and_isolation_confirmation_required');
 if(!Array.isArray(input.confirmedBodyIds)||!Array.isArray(input.confirmedItemIds))
  return fail('op12_per_move_confirmation_required');
 const itemDestinations={...p.desiredItems};
 for(const id of p.removedItemIds)itemDestinations[id]={type:'storage',label:itemStorage[id]};
 return root.PasekaSectionalSeasonPhysicalManifestV2.plan(state,{
  operationId:'OP-12',hiveId:input.hiveId,
  expectedSourceRevisionId:p.sourceRevisionId,
  occurredAt:input.occurredAt,
  userConfirmed:true,actualWorkConfirmed:true,actualIsolationConfirmed:true,
  strongestFamilyId:p.strongestFamilyId,targetLayout:p.targetLayout,
  confirmedBodyIds:input.confirmedBodyIds,confirmedItemIds:input.confirmedItemIds,
  storageLocations:Object.fromEntries(p.removedBodyIds.map(id=>[id,bodyStorage[id]])),
  itemDestinations
 });
}
function mount(host,getState,getHiveId,controls){
 if(!host||typeof getState!=='function'||typeof getHiveId!=='function')
  return fail('op12_guide_host_unavailable');
 const state=getState(),hiveId=getHiveId(),snapshot=
  root.PasekaSectionalSeasonPhysicalManifestV2?.inspectSource?.(state,hiveId);
 if(!snapshot?.ok){host.textContent='OP-12 недоступна: исходный инвентарь не подтверждён.';return fail('op12_source_audit_failed');}
 const revision=snapshot.sourceRevisionId;
 const checked=inspect(state,hiveId,revision);
 if(!checked.ok){host.textContent='OP-12 недоступна: '+checked.error;return checked;}
 const options=(rows,value,title)=>'<option value="">— Выберите лично —</option>'+
  rows.map(row=>'<option value="'+esc(row[value])+'">'+esc(row[title]||row[value])+'</option>').join('');
 const families=checked.sections.map(s=>({id:s.familyId,label:s.familyId+' / '+s.position}));
 const bodyChoices=checked.sections.flatMap(s=>s.broodBodyIds.map(id=>({id,label:id+' / '+s.familyId})));
 const items=Object.values(checked.inv.items).filter(x=>x?.condition==='good'&&
  (x.location?.type==='storage'||(x.location?.type==='hive'&&x.location.hiveId===hiveId)));
 const itemOptions=kind=>options(items.filter(x=>x.kind===kind),'id','id');
 host.innerHTML='<fieldset data-op12-guide><legend>OP-12 · целевая зимняя колонна</legend>'+
  '<p>Укажите фактически выбранные семьи, корпуса, принадлежности и склад. Никаких автоматических перестановок или записи нет. Исходная ревизия: '+esc(revision)+'</p>'+
  '<label>Сильнейшая семья (2 корпуса)<select data-op12-field="strongestFamilyId">'+options(families,'id','label')+'</select></label>'+
  '<label>Семья среднего яруса<select data-op12-field="middleFamilyId">'+options(families,'id','label')+'</select></label>'+
  '<label>Её сохраняемый корпус<select data-op12-field="middleBodyId">'+options(bodyChoices,'id','label')+'</select></label>'+
  '<label>Семья верхнего яруса<select data-op12-field="upperFamilyId">'+options(families,'id','label')+'</select></label>'+
  '<label>Её сохраняемый корпус<select data-op12-field="upperBodyId">'+options(bodyChoices,'id','label')+'</select></label>'+
  '<label>Крышка для колонны<select data-op12-field="coverItemId">'+itemOptions('cover')+'</select></label>'+
  '<label>Потолочная кормушка (при наличии)<select data-op12-field="feederItemId">'+itemOptions('feeder')+'</select></label>'+
  '<label>Нижняя сетчатая диафрагма<select data-op12-field="lowerDiaphragmId">'+itemOptions('meshDiaphragm')+'</select></label>'+
  '<label>Верхняя сетчатая диафрагма<select data-op12-field="upperDiaphragmId">'+itemOptions('meshDiaphragm')+'</select></label>'+
  '<button type="button" data-op12-select>Далее: склад и подтверждения</button>'+
  '<div data-op12-moves></div><div role="status" aria-live="polite" data-op12-result></div></fieldset>';
 const fieldValues=()=>Object.fromEntries(
  [...host.querySelectorAll('[data-op12-field]')].map(el=>[el.getAttribute('data-op12-field'),el.value]));
 const result=()=>host.querySelector('[data-op12-result]');
 let prepared=null;
 const filterBody=(familyField,bodyField)=>{
  const family=host.querySelector('[data-op12-field="'+familyField+'"]')?.value;
  const select=host.querySelector('[data-op12-field="'+bodyField+'"]');
  if(!select)return;
  const matching=bodyChoices.filter(row=>row.label.endsWith(' / '+family));
  select.innerHTML=options(family?matching:[],'id','label');
 };
 for(const control of host.querySelectorAll('[data-op12-field]'))control.addEventListener('change',()=>{
  prepared=null;
  host.querySelector('[data-op12-moves]').textContent='';
  result().textContent='Целевая схема изменена: повторите подготовку для актуальных перемещений.';
  if(control.getAttribute('data-op12-field')==='middleFamilyId')filterBody('middleFamilyId','middleBodyId');
  if(control.getAttribute('data-op12-field')==='upperFamilyId')filterBody('upperFamilyId','upperBodyId');
 });
 filterBody('middleFamilyId','middleBodyId');
 filterBody('upperFamilyId','upperBodyId');
 host.querySelector('[data-op12-select]').addEventListener('click',()=>{
  prepared=prepare(getState(),{hiveId:getHiveId(),sourceRevisionId:revision,...fieldValues()});
  const panel=host.querySelector('[data-op12-moves]');
  if(!prepared.ok){panel.textContent='';result().textContent='Целевая схема не подтверждена: '+prepared.error;return;}
  const store=(name,id,label)=>'<label>'+esc(label+' '+id)+
   '<input type="text" maxlength="160" data-op12-'+name+'="'+esc(id)+'" placeholder="Фактическое место хранения"></label>';
  const confirm=(name,id)=>'<label><input type="checkbox" data-op12-confirm-'+name+'="'+esc(id)+'"> Лично подтверждаю перемещение '+esc(id)+'</label>';
  panel.innerHTML='<p>Корпуса на склад ('+prepared.removedBodyIds.length+')</p>'+
   prepared.removedBodyIds.map(id=>store('body-store',id,'Корпус')).join('')+
   '<p>Предметы на склад ('+prepared.removedItemIds.length+')</p>'+
   prepared.removedItemIds.map(id=>store('item-store',id,'Предмет')).join('')+
   '<p>Отдельно подтвердите каждое перемещение корпуса</p>'+
   prepared.changedBodyIds.map(id=>confirm('body',id)).join('')+
   '<p>Отдельно подтвердите каждое перемещение предмета</p>'+
   prepared.changedItemIds.map(id=>confirm('item',id)).join('')+
   '<label><input type="checkbox" data-op12-isolation> Подтверждаю фактическую установку двух сетчатых диафрагм и изоляцию семей</label>'+
   '<button type="button" data-op12-check>Проверить физический план без записи</button>';
  result().textContent='Целевая схема сформирована для проверки. Сначала заполните фактические места и отметьте перемещения.';
  const read=(attr)=>Object.fromEntries([...host.querySelectorAll('[data-op12-'+attr+']')]
   .map(el=>[el.getAttribute('data-op12-'+attr),el.value]));
  const checkedIds=(attr)=>[...host.querySelectorAll('[data-op12-confirm-'+attr+']')]
   .filter(el=>el.checked).map(el=>el.getAttribute('data-op12-confirm-'+attr));
  panel.querySelector('[data-op12-check]').addEventListener('click',()=>{
   const at=controls?.querySelector('[data-season-at]')?.value||'';
   const request={hiveId:getHiveId(),sourceRevisionId:revision,...fieldValues(),
    bodyStorage:read('body-store'),itemStorage:read('item-store'),
    confirmedBodyIds:checkedIds('body'),confirmedItemIds:checkedIds('item'),
    actualIsolationConfirmed:panel.querySelector('[data-op12-isolation]').checked,
    userConfirmed:controls?.querySelector('[data-season-confirm]')?.checked===true,
    actualWorkConfirmed:controls?.querySelector('[data-season-confirm]')?.checked===true,
    occurredAt:at?new Date(at).toISOString():''};
   let r;try{r=plan(getState(),request);}catch{r=fail('op12_preview_exception');}
   result().textContent=r.ok?
    'Предварительный манифест ID проверен: '+r.request.bodyMoves.length+' перемещений корпусов, '+r.request.itemMoves.length+
    ' предметов. Только предварительный просмотр; IndexedDB, история и DONE не изменены. Независимое восстановление полного архива и CAS ещё обязательны.':
    'План отклонён: '+String(r.error||'неизвестная ошибка')+'. Данные не изменены.';
  });
 });
 return {ok:true,readOnly:true,sourceRevisionId:revision};
}
root.PasekaSectionalOP12GuidedV2=Object.freeze({inspect,prepare,plan,mount});
})(typeof window!=='undefined'?window:globalThis);
