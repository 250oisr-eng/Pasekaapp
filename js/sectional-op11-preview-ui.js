(function(root){'use strict';
// B07 OP11: a browser-only, read-only guided projection. Never calls save(),
// IndexedDB, localStorage, physical completion APIs or other mutation tools.
const nonEmpty=x=>typeof x==='string'&&x.trim().length>0;
const arr=x=>Array.isArray(x)?x:[];
const errorText=Object.freeze({
 op11_stale_revision:'Состояние улья изменилось. Откройте предварительный просмотр заново.',
 op11_invalid_source_layout:'Текущая физическая схема не прошла локальную проверку.',
 op11_three_two_body_sections_without_honey_required:'Для этой схемы нужны три секции по два корпуса без медовых корпусов.',
 op11_three_original_upper_bodies_in_selected_order_required:'Выберите три разных исходных верхних корпуса.',
 op11_one_stored_plastic_plug_per_upper_opening_required:'Для каждого отверстия нужна отдельная пригодная пластиковая заглушка со склада.',
 op11_accessory_reused:'Один предмет инвентаря нельзя использовать дважды.',
 op11_registered_bottom_cover_riser_and_ceiling_feeder_required:'Нужны зарегистрированные дно, крышка, подкрышник и потолочная кормушка.'
});
function el(doc,tag,text,className){
 const node=doc.createElement(tag);
 if(text!=null)node.textContent=String(text);
 if(className)node.className=className;
 return node;
}
function addLine(parent,doc,label,value){
 const row=el(doc,'p');
 row.append(el(doc,'b',label+': '),el(doc,'span',value));
 parent.append(row);return row;
}
function mount(host,options={}){
 if(!host||typeof options.getState!=='function'||!nonEmpty(options.hiveId))
  return {ok:false,error:'op11_ui_host_hive_state_required'};
 const doc=host.ownerDocument||root.document;
 if(!doc||typeof doc.createElement!=='function')
  return {ok:false,error:'op11_ui_document_unavailable'};
 host.replaceChildren();
 const card=el(doc,'details',null,'card');
 card.setAttribute('data-op11-preview','');
 const title=el(doc,'summary','OP11 · предварительная зимняя сборка (только просмотр)');
 card.append(title);
 card.append(el(doc,'p','Подготовка схемы без записи. Корпуса и заглушки выбираются вручную; объединение семей, работа с матками и зимняя вентиляция НЕ подтверждены.','muted'));
 host.append(card);
 const api=root.PasekaSectionalOP11Preview;
 const state=options.getState(),revision=state?.meta?.revisionId;
 const inspected=api?.inspect?.(state,{hiveId:options.hiveId,expectedRevisionId:revision});
 if(!inspected?.ok){
  const reason=inspected?.error||'op11_preview_unavailable';
  const notice=el(doc,'p','Предварительный просмотр недоступен: '+(errorText[reason]||reason),'muted');
  notice.setAttribute('role','status');
  card.append(notice);
  return {ok:false,error:reason};
 }
 const form=el(doc,'form');
 form.setAttribute('data-op11-form','');
 form.setAttribute('autocomplete','off');
 const controls={},plugControls={};
 function field(key,label,choices,attr='data-op11-field'){
  const wrap=el(doc,'label',label);
  const select=el(doc,'select');
  select.setAttribute(attr,key);select.setAttribute('aria-label',label);
  select.required=true;
  const empty=el(doc,'option','— Выберите вручную —');
  empty.value='';select.append(empty);
  for(const [id,caption] of choices){
   const option=el(doc,'option',caption);option.value=id;select.append(option);
  }
  wrap.append(select);form.append(wrap);return select;
 }
 const bodyChoices=inspected.kept.map(id=>[id,'Гнездовой корпус '+id]);
 controls.lowerBodyId=field('lowerBodyId','Нижний корпус из прежних верхних',bodyChoices);
 controls.middleBodyId=field('middleBodyId','Средний корпус из прежних верхних',bodyChoices);
 controls.upperBodyId=field('upperBodyId','Верхний корпус из прежних верхних',bodyChoices);
 const items=inspected.items;
 function candidates(kind,storageOnly=false){
  return Object.values(items).filter(item=>item&&item.kind===kind&&item.condition==='good'&&
   (item.location?.type==='storage'||(!storageOnly&&item.location?.type==='hive'&&item.location.hiveId===options.hiveId)))
   .map(item=>[item.id,item.id+(item.location?.type==='storage'?' · склад':' · улей')]);
 }
 controls.bottomItemId=field('bottomItemId','Оставляемое дно',inspected.stacks.map(stack=>[stack.bottomItemId,stack.bottomItemId]));
 controls.coverItemId=field('coverItemId','Крышка',candidates('cover'));
 controls.topRiserItemId=field('topRiserItemId','Подкрышник',candidates('topRiser'));
 controls.feederItemId=field('feederItemId','Потолочная кормушка',candidates('feeder'));
 card.append(el(doc,'p','На каждое зарегистрированное боковое отверстие остающегося корпуса — отдельная пластиковая заглушка со склада.','muted'));
 for(const opening of inspected.openings){
  plugControls[opening.openingId]=field(opening.openingId,
   'Заглушка: корпус '+opening.bodyId+', отверстие '+opening.openingId,
   candidates('plasticPlug',true),'data-op11-plug');
 }
 const ventilation=field('ventilationOption','Планируемая вентиляция (не подтверждает фактическую установку)',[
  ['upper_only','Верхний леток — авторский способ'],
  ['lower_round_plus_ceiling','Нижний круглый леток + потолочная вентиляция — альтернативный способ']
 ]);
 const button=el(doc,'button','Проверить схему без записи','primary');
 button.type='submit';form.append(button);
 const status=el(doc,'p','Данные не изменены. Выберите корпуса, предметы и вентиляцию, затем проверьте схему.','muted');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const resultHost=el(doc,'div');resultHost.setAttribute('data-op11-result','');
 form.append(status,resultHost);card.append(form);
 form.addEventListener('change',()=>{
  resultHost.replaceChildren();
  status.textContent='Выбор изменён. Проверка предыдущей схемы сброшена. Ничего не сохранено.';
 });
 form.addEventListener('submit',event=>{
  event?.preventDefault?.();
  resultHost.replaceChildren();
  const selected=Object.fromEntries(Object.entries(controls).map(([key,node])=>[key,node.value]));
  const plugs=Object.fromEntries(Object.entries(plugControls).map(([key,node])=>[key,node.value]));
  if(!Object.values(selected).every(nonEmpty)||!Object.values(plugs).every(nonEmpty)){
   status.textContent='Укажите все корпуса, предметы, заглушки и вариант вентиляции. Ничего не записано.';
   return;
  }
  // The revision is captured when the form mounts. Never take a fresh revision
  // from a concurrently updated state to bypass stale-form protection.
  let preview;
  try{preview=api.preview(options.getState(),{
   hiveId:options.hiveId,expectedRevisionId:revision,
   ...selected,plugAssignments:plugs
  });}
  catch{preview={ok:false,error:'op11_preview_validation_failed'};}
  if(!preview?.ok){
   status.textContent='Проверка отклонена: '+(errorText[preview?.error]||preview?.error||'неизвестная ошибка')+
    '. Ничего не записано.';
   return;
  }
  if(preview.readOnly!==true||preview.readyForPersistence!==false||preview.completionRecorded!==false){
   status.textContent='Проверка результата неполная. Операция НЕ сохранена.';
   return;
  }
  status.textContent='Предварительная схема проверена. НЕ выполнено и НЕ сохранено.';
  addLine(resultHost,doc,'Корпуса снизу вверх',preview.retainedBodyIds.join(' → '));
  addLine(resultHost,doc,'Снимаемые нижние корпуса',preview.removedBodyIds.join(', '));
  addLine(resultHost,doc,'Снимаемые дополнительные донья',preview.removedBottomItemIds.join(', '));
  addLine(resultHost,doc,'Оставляемое дно',preview.retainedBottomItemId);
  addLine(resultHost,doc,'Крышка и подкрышник',preview.retainedCoverItemId+' + '+preview.retainedTopRiserItemId);
  addLine(resultHost,doc,'Потолочная кормушка',preview.ceilingFeederItemId);
  addLine(resultHost,doc,'Снимаемые технические решётки',arr(preview.removeTechnicalExcluderItemIds).join(', ')||'Нет');
  addLine(resultHost,doc,'Пластиковые заглушки',
   arr(preview.closureAssignments).map(row=>row.openingId+' → '+row.plasticPlugItemId).join('; '));
  addLine(resultHost,doc,'Планируемая вентиляция',
   selected.ventilationOption==='upper_only'?'Верхний леток':'Нижний круглый леток + потолочная вентиляция');
  addLine(resultHost,doc,'Матка после объединения','Неизвестна — не назначена приложением');
  resultHost.append(el(doc,'p',
   'До физической операции необходимо лично подтвердить почти полное отсутствие расплода, перемещение всех пчёл, закрытие отверстий, положение летков, судьбу снятых рамок и инвентаря. Действия не отмечены выполненными.','muted'));
 });
 return {ok:true,readOnly:true,revisionId:revision};
}
root.PasekaSectionalOP11PreviewUI=Object.freeze({mount});
})(typeof window!=='undefined'?window:globalThis);
