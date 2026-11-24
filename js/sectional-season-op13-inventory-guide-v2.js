(function(root){
'use strict';
// OP13 early-honey preparation: an inventory-bound, read-only preflight.
// Never treats 2+1+1 -> 2+2+2 as physically complete without openings,
// technical connections and the exact validated destination layout.
const A=x=>Array.isArray(x)?x:[],O=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const S=x=>typeof x==='string'&&x.trim().length>0;
const err=(error,details)=>({ok:false,error,...(details?{details}:{})});
const PROFILE='sectional-multiqueen-v1';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\u0027':'&#39;'}[c]));
const unique=ids=>new Set(ids).size===ids.length;
function inspect(state,hiveId,sourceRevisionId){
 if(!O(state)||!S(hiveId)||!S(sourceRevisionId))return err('op13_source_identity_required');
 const audit=root.PasekaSectionalSeasonPhysicalManifestV2?.inspectSource?.(state,hiveId);
 if(!audit?.ok)return err(audit?.error||'op13_source_inspection_unavailable');
 if(sourceRevisionId!==audit.sourceRevisionId)return err('op13_stale_source_revision');
 const h=A(state.hives).find(x=>x?.id===hiveId);
 const ls=A(state.sectionalLayouts).filter(x=>x?.hiveId===hiveId);
 const layout=ls[0],sections=A(layout?.sections),stacks=A(layout?.stacks);
 const cycles=A(state.sectionalSeasonCycles).filter(x=>x?.hiveId===hiveId&&x.status==='ACTIVE');
 if(h?.profileId!==PROFILE||ls.length!==1||layout?.profileId!==PROFILE||
    layout?.schemaVersion!==1||layout.mode!=='ALTERNATIVE_WINTERING_COLUMN'||
    sections.length!==3||stacks.length!==1||cycles.length!==1||
    sections.some(s=>!S(s?.familyId)||!S(s?.id)||![1,2].includes(A(s.broodBodyIds).length))||
    !unique(sections.map(s=>s.familyId))||
    sections.filter(s=>A(s.broodBodyIds).length===1).length!==2||
    sections.filter(s=>A(s.broodBodyIds).length===2).length!==1||
    A(layout.meshDiaphragms).length!==2||layout.honeyStack!=null)
  return err('op13_alternative_wintering_2_1_1_source_required');
 const inventory=state.equipmentInventory;
 if(!O(inventory?.bodies)||!O(inventory?.items))
  return err('op13_equipment_register_missing');
 const installedBodies=new Set(audit.bodyEntries.map(x=>x.id));
 const owners=new Set(A(state.sectionalLayouts).filter(l=>l?.hiveId!==hiveId)
   .flatMap(l=>[...A(l.sections).flatMap(s=>A(s.broodBodyIds)),...A(l.honeyStack?.bodyIds)]));
 const familyWithTwo=sections.find(s=>A(s.broodBodyIds).length===2);
 const singleFamilies=sections.filter(s=>A(s.broodBodyIds).length===1);
 const diaphragmIds=A(layout.meshDiaphragms).map(row=>row?.itemId);
 if(!unique(diaphragmIds)||diaphragmIds.some(id=>!S(id)||inventory.items[id]?.kind!=='meshDiaphragm'))
  return err('op13_source_diaphragm_identity_invalid');
 return {ok:true,readOnly:true,sourceRevisionId,audit,
  familyWithTwo:{id:familyWithTwo.familyId,bodyIds:familyWithTwo.broodBodyIds.slice()},
  singleFamilies:singleFamilies.map(s=>({id:s.familyId,bodyId:s.broodBodyIds[0]})),
  diaphragmIds,existingBottomId:stacks[0].bottomItemId,
  sourceStackId:stacks[0].id,
  installedBodies,foreignBodies:owners,inventory};
}
function prepare(state,input){
 if(!O(input)||!S(input.hiveId))return err('op13_input_missing');
 const b=inspect(state,input.hiveId,input.sourceRevisionId);if(!b.ok)return b;
 if(input.purpose!=='EARLY_HONEY_PREPARATION')return err('op13_early_honey_variant_must_be_explicit');
 if(input.strongestFamilyId!==b.familyWithTwo.id||
    input.confirmedExistingBottomId!==b.existingBottomId)
  return err('op13_original_two_body_family_and_bottom_must_be_confirmed');
 const rows=A(input.separations);
 if(rows.length!==2||!unique(rows.map(x=>x?.familyId))||
    rows.some(x=>!O(x)||!b.singleFamilies.some(s=>s.id===x.familyId)))
  return err('op13_two_original_single_body_families_required');
 const itemIds=[],newBodyIds=[],positionIds=[],seenFrameIds=new Set();
 for(const x of b.audit.bodyEntries){
  for(const id of x.frameIds){
   if(!S(id)||seenFrameIds.has(id))return err('op13_duplicate_source_frame_id');
   seenFrameIds.add(id);
  }
 }
 for(const row of rows){
  const original=b.singleFamilies.find(x=>x.id===row.familyId);
  if(row.retainedBodyId!==original.bodyId)return err('op13_retained_original_family_body_mismatch');
  const body=b.inventory.bodies[row.additionalBodyId];
  if(!S(row.additionalBodyId)||b.installedBodies.has(row.additionalBodyId)||
     b.foreignBodies.has(row.additionalBodyId)||!O(body)||
     body.id!==row.additionalBodyId||body.kind!=='brood'||body.condition!=='good'||
     body.spec?.profileId!==PROFILE||body.spec?.framesPerBox!==6||
     !S(body.storageLocation)||!Array.isArray(body.frames)||body.frames.length!==6||
     body.frames.some(f=>!S(f?.frameId)||!Array.isArray(f.history)))
    return err('op13_added_body_must_be_registered_complete_and_in_storage',
      {bodyId:row.additionalBodyId});
  for(const frame of body.frames){
   if(seenFrameIds.has(frame.frameId))return err('op13_added_frame_identity_collision');
   seenFrameIds.add(frame.frameId);
  }
  for(const [id,kind]of [[row.bottomId,'bottom'],[row.coverId,'cover'],[row.topRiserId,'topRiser']]){
   const item=b.inventory.items[id];
   if(!S(id)||!O(item)||item.id!==id||item.kind!==kind||
      item.condition!=='good'||item.location?.type!=='storage')
    return err('op13_new_stack_item_must_be_registered_in_storage',{kind,itemId:id});
   itemIds.push(id);
  }
  newBodyIds.push(row.additionalBodyId);
  if(!['left','middle','right'].includes(row.targetPosition))return err('op13_target_position_invalid');
  positionIds.push(row.targetPosition);
 }
 if(!unique(itemIds)||!unique(newBodyIds)||!unique(positionIds)||
    itemIds.includes(b.existingBottomId))
  return err('op13_duplicate_physical_assignment');
 if(!['left','middle','right'].includes(input.existingTargetPosition)||
    positionIds.includes(input.existingTargetPosition))
  return err('op13_existing_stack_position_required');
 const confirmedDiaphragms=A(input.confirmedDiaphragmIds);
 if(!unique(confirmedDiaphragms)||confirmedDiaphragms.length!==2||
    confirmedDiaphragms.some(id=>!b.diaphragmIds.includes(id)))
  return err('op13_exact_source_diaphragms_required');
 const familyPlans=[
  {familyId:b.familyWithTwo.id,sourceBodyIds:b.familyWithTwo.bodyIds,
   targetPosition:input.existingTargetPosition,bottomId:b.existingBottomId,
   additionalBodyId:null},
  ...rows.map(row=>({familyId:row.familyId,sourceBodyIds:[row.retainedBodyId],
   additionalBodyId:row.additionalBodyId,targetPosition:row.targetPosition,
   bottomId:row.bottomId,coverId:row.coverId,topRiserId:row.topRiserId}))
 ];
 return {ok:true,readOnly:true,preflightOnly:true,readyForPersistence:false,
  sourceRevisionId:b.sourceRevisionId,sourceMode:'ALTERNATIVE_WINTERING_COLUMN',
  requestedMode:'SIDE_BY_SIDE',purpose:input.purpose,
  familyPlans,changedBodyIds:newBodyIds,changedItemIds:itemIds,
  removedItemIds:b.diaphragmIds.slice(),
  requiresExactTargetOpenings:true,requiresTechnicalConnectionManifest:true,
  requiresIndependentArchiveVerification:true,
  requiresPersonalPhysicalOperationConfirmation:true};
}
function plan(state,input){
 const p=prepare(state,input);if(!p.ok)return p;
 if(input.userConfirmed!==true||input.actualSeparationConfirmed!==true)
  return err('op13_actual_separation_personal_confirmation_required');
 if(!Array.isArray(input.confirmedBodyIds)||!Array.isArray(input.confirmedItemIds)||
    input.confirmedBodyIds.length!==p.changedBodyIds.length||
    !unique(input.confirmedBodyIds)||p.changedBodyIds.some(id=>!input.confirmedBodyIds.includes(id))||
    input.confirmedItemIds.length!==p.changedItemIds.length||
    !unique(input.confirmedItemIds)||p.changedItemIds.some(id=>!input.confirmedItemIds.includes(id)))
  return err('op13_every_new_body_and_item_must_be_individually_confirmed');
 const storage=O(input.diaphragmStorage)?input.diaphragmStorage:{};
 if(Object.keys(storage).length!==p.removedItemIds.length||
    p.removedItemIds.some(id=>!S(storage[id])||storage[id].length>160))
  return err('op13_removed_diaphragm_storage_required');
 if(!S(input.occurredAt)||!Number.isFinite(Date.parse(input.occurredAt))||
    Date.parse(input.occurredAt)>Date.now())
  return err('op13_actual_date_required');
 // A preflight must NEVER claim a validated complete physical target.
 return {...p,ok:true,occurredAt:input.occurredAt,
  diaphragmStorage:Object.fromEntries(p.removedItemIds.map(id=>[id,storage[id]])),
  personallyConfirmedInventory:true,physicalLayoutValidated:false,
  operationCompleted:false,targetLayout:null};
}
function mount(host,getState,hiveId,controls){
 if(!host||typeof getState!=='function'||!S(hiveId))return err('op13_guide_host_missing');
 const state=getState();
 const audit=root.PasekaSectionalSeasonPhysicalManifestV2?.inspectSource?.(state,hiveId);
 if(!audit?.ok){host.textContent='OP-13: исходный инвентарь не подтверждён.';return err('op13_source_audit_failed');}
 const revision=audit.sourceRevisionId;
 const b=inspect(state,hiveId,revision);
 if(!b.ok){host.textContent='OP-13: '+b.error;return b;}
 const inv=b.inventory;
 const options=rows=>'<option value="">— Выберите фактически —</option>'+
  rows.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.id)+'</option>').join('');
 const itemsByKind=kind=>options(Object.values(inv.items).filter(x=>
  x?.kind===kind&&x?.condition==='good'&&x?.location?.type==='storage'));
 const bodyChoices=options(Object.values(inv.bodies).filter(x=>
  x?.kind==='brood'&&x.condition==='good'&&x.spec?.profileId===PROFILE&&
  x.spec?.framesPerBox===6&&S(x.storageLocation)&&!b.foreignBodies.has(x.id)));
 const positions=options(['left','middle','right'].map(id=>({id})));
 const field=(key,label,content)=>'<label>'+esc(label)+'<select data-op13-field="'+esc(key)+'">'+content+'</select></label>';
 const sourceFamily=b.singleFamilies.map((f,i)=>'<fieldset data-op13-single="'+esc(f.id)+'">'+
   '<legend>Семья '+esc(f.id)+' (исходный корпус '+esc(f.bodyId)+')</legend>'+
   field('position-'+f.id,'Позиция после разделения',positions)+
   field('body-'+f.id,'Дополнительный гнездовой корпус со склада',bodyChoices)+
   field('bottom-'+f.id,'Отдельное днище со склада',itemsByKind('bottom'))+
   field('cover-'+f.id,'Крышка со склада',itemsByKind('cover'))+
   field('riser-'+f.id,'Подкрышник со склада',itemsByKind('topRiser'))+
   '</fieldset>').join('');
 host.innerHTML='<fieldset data-op13-guide><legend>OP-13 · разделение после альтернативной зимовки</legend>'+
  '<p>Только вариант подготовки к раннему медосбору. Обычный вариант развития без немедленного добавления двух корпусов здесь не моделируется. Ревизия '+esc(revision)+'</p>'+
  '<p>Семья на двух корпусах: '+esc(b.familyWithTwo.id)+'; зарегистрированное днище: '+esc(b.existingBottomId)+'. Подтвердите новую позицию.</p>'+
  field('position-existing','Позиция двухкорпусной семьи',positions)+sourceFamily+
  '<p>Снятые сетчатые диафрагмы: '+b.diaphragmIds.map(esc).join(', ')+'</p>'+
  '<button type="button" data-op13-next>Проверить комплект 2+2+2</button>'+
  '<div data-op13-moves></div><div role="status" aria-live="polite" data-op13-result></div></fieldset>';
 const fieldValue=key=>host.querySelector('[data-op13-field="'+key+'"]')?.value||'';
 const selection=()=>({hiveId,sourceRevisionId:revision,purpose:'EARLY_HONEY_PREPARATION',
  strongestFamilyId:b.familyWithTwo.id,confirmedExistingBottomId:b.existingBottomId,
  existingTargetPosition:fieldValue('position-existing'),
  confirmedDiaphragmIds:b.diaphragmIds.slice(),
  separations:b.singleFamilies.map(f=>({familyId:f.id,retainedBodyId:f.bodyId,
   targetPosition:fieldValue('position-'+f.id),
   additionalBodyId:fieldValue('body-'+f.id),
   bottomId:fieldValue('bottom-'+f.id),
   coverId:fieldValue('cover-'+f.id),
   topRiserId:fieldValue('riser-'+f.id)}))});
 let prepared=null;
 const moves=()=>host.querySelector('[data-op13-moves]'),
       result=()=>host.querySelector('[data-op13-result]');
 for(const el of host.querySelectorAll('[data-op13-field]'))el.addEventListener('change',()=>{
  prepared=null;moves().textContent='';
  result().textContent='Выбор изменён: требуется заново подтвердить фактические ID.';
 });
 host.querySelector('[data-op13-next]').addEventListener('click',()=>{
  prepared=prepare(getState(),selection());
  if(!prepared.ok){moves().textContent='';result().textContent='Комплект отклонён: '+prepared.error;return;}
  const checkbox=(kind,id)=>'<label><input type="checkbox" data-op13-confirm-'+kind+'="'+esc(id)+'"> Подтверждаю фактическое перемещение '+esc(id)+'</label>';
  moves().innerHTML='<p>Проверьте отдельно каждый корпус и каждый предмет</p>'+
   prepared.changedBodyIds.map(id=>checkbox('body',id)).join('')+
   prepared.changedItemIds.map(id=>checkbox('item',id)).join('')+
   '<p>Фактические места хранения снятых диафрагм</p>'+
   prepared.removedItemIds.map(id=>'<label>Диафрагма '+esc(id)+
    '<input data-op13-storage="'+esc(id)+'" maxlength="160" placeholder="Фактическое место хранения"></label>').join('')+
   '<label><input type="checkbox" data-op13-separation> Лично подтверждаю физическое разделение семей</label>'+
   '<button type="button" data-op13-check>Сверить инвентарь без сохранения</button>';
  result().textContent='Комплект по ID подготовлен, но полная раскладка отверстий и соединений ещё не определена.';
  const checked=kind=>[...moves().querySelectorAll('[data-op13-confirm-'+kind+']')]
   .filter(el=>el.checked).map(el=>el.getAttribute('data-op13-confirm-'+kind));
  moves().querySelector('[data-op13-check]').addEventListener('click',()=>{
   const time=controls?.querySelector('[data-season-at]')?.value||'';
   let p;try{p=plan(getState(),{...selection(),
    confirmedBodyIds:checked('body'),confirmedItemIds:checked('item'),
    userConfirmed:controls?.querySelector('[data-season-confirm]')?.checked===true,
    actualSeparationConfirmed:moves().querySelector('[data-op13-separation]')?.checked===true,
    diaphragmStorage:Object.fromEntries([...moves().querySelectorAll('[data-op13-storage]')]
     .map(el=>[el.getAttribute('data-op13-storage'),el.value])),
    occurredAt:time?new Date(time).toISOString():''});}catch{p=err('op13_preflight_exception')}
   result().textContent=p.ok?
    'Инвентарь для раннего медосбора сверён: 2 новых корпуса, 2 днища и принадлежности. '+
    'Полная целевая геометрия технических отверстий и соединений НЕ подтверждена. '+
    'OP-13 не выполнена, база и история не изменены.':
    'Проверка отклонена: '+String(p.error||'неизвестная ошибка')+'. Данные не изменены.';
  });
 });
 return {ok:true,readOnly:true,sourceRevisionId:revision,variant:'EARLY_HONEY_PREPARATION'};
}
root.PasekaSectionalOP13InventoryGuideV2=Object.freeze({inspect,prepare,plan,mount});
})(typeof window!=='undefined'?window:globalThis);
