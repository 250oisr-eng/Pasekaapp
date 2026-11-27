(function(){
'use strict';
// Isolated DOM review for synthetic QA. No production attachment or writes.
function render(host,model,labels){
 if(!host||typeof host.replaceChildren!=='function')throw Error('review_host_required');
 host.replaceChildren();
 if(!model?.visible)return;
 const doc=host.ownerDocument,add=(tag,text,parent=host)=>{const e=doc.createElement(tag);e.textContent=text;parent.append(e);return e;};
 add('h3','Медовые корпуса');
 add('p','Установлено: '+model.bodyCount+' · по 10 рамок в корпусе');
 const name=id=>String(labels?.[id]||id);
 for(const p of model.installedPairs||[])add('p','Пара: '+p.bodyIds.map(name).join(' / '));
 for(const p of model.offers||[])add('p','Доступна дополнительная пара: '+p.bodyIds.map(name).join(' / '));
 for(const p of model.pending||[])add('p','Ожидает возврата: '+p.bodyIds.map(name).join(' / '));
 if(model.canReviewExtraction){add('p','Готово к откачке: '+model.readyFrames+' из '+model.requiredFrames+' рамок.');add('p','Откачка только при полной готовности: снять все '+model.bodyCount+' корпуса и обе решётки, установить 3 подкрышника и 3 крышки.');}
 if(model.canReviewInstallation)add('p','Новая установка: выбрать 2 или 4 корпуса и две решётки независимо от предыдущего количества.');
 const status=add('p','Предварительный просмотр. Сохранение физической операции пока заблокировано B07.');
 status.setAttribute('role','status');
}
// Interactive screen component, mounted only by an explicitly enabled host
// with an exclusive commit bridge. It never writes directly to the database.
function mount(host,bridge){
 if(!host||typeof host.replaceChildren!=='function'||typeof bridge?.getState!=='function'||typeof bridge?.commit!=='function'||typeof bridge?.getContext!=='function'||typeof bridge?.isEnabled!=='function')throw Error('sectional_ui_bridge_required');
 let busy=false;
 const doc=host.ownerDocument,el=(tag,text,parent=host)=>{const e=doc.createElement(tag);if(text!=null)e.textContent=text;parent.append(e);return e;};
 const field=(label,type,parent)=>{const l=el('label',label,parent),i=el('input',null,l);i.type=type;return i;};
 function refresh(){
  host.replaceChildren();if(!bridge.isEnabled())return;
  const state=bridge.getState(),context=bridge.getContext(),deps=context?.deps;
  const layout=state?.sectionalLayouts?.find(l=>l.hiveId===context?.hiveId);
  if(!layout||!deps)return;
  const model=window.PasekaSectionalHoneyReview.viewModel(state,context,deps);
  if(!model.visible){el('p','Конструкция или история требуют проверки.');return;}
  render(host,model,state.equipmentLabels?.bodies);
  const form=el('form',null),status=el('p','',form);status.setAttribute('role','status');
  const isExtract=model.bodyCount>0,free=window.PasekaSectionalStockPairs.available(state,deps.inventory);
  const choose=(label,items,parent=form)=>{const l=el('label',label,parent),s=el('select',null,l);const none=el('option','Выбрать',s);none.value='';for(const item of items){const o=el('option',item.label||item.id,s);o.value=item.id;}s.required=true;return s;};
  const inv=state.equipmentInventory,availableItems=kind=>Object.values(inv.items||{}).filter(x=>x.kind===kind&&x.condition==='good'&&x.location?.type==='storage').map(x=>({id:x.id,label:x.labelCode||x.id}));
  const storage=field('Место хранения снятого оборудования','text',form);storage.required=true;storage.maxLength=120;
  const selection=[],coverFields=[],excluderFields=[];
  let kg,count,purpose;
  if(isExtract){
   kg=field('Масса откачанного мёда, кг','number',form);kg.min='0.1';kg.step='0.1';kg.required=true;
   for(const stack of layout.stacks)coverFields.push({stackId:stack.id,cover:choose('Крышка · '+stack.position,availableItems('cover')),riser:choose('Подкрышник · '+stack.position,availableItems('topRiser'))});
  }else{
   count=choose('Количество корпусов',[{id:'2',label:'2 корпуса'},{id:'4',label:'4 корпуса'}]);count.value='2';
   purpose=choose('Медосбор',[{id:'early',label:'Ранний'},{id:'main',label:'Главный'}]);
   for(let i=0;i<4;i++)selection.push(choose('Корпус '+(i+1),free));
   const adjust=()=>selection.forEach((s,i)=>{s.required=i<Number(count.value);s.disabled=!s.required;s.parentElement.hidden=!s.required;});
   count.addEventListener('change',adjust);adjust();
   for(const side of ['left','right'])excluderFields.push({side,field:choose('Решётка · '+(side==='left'?'левая':'правая'),availableItems('honeyQueenExcluder'))});
  }
  const confirmed=field(isExtract?'Подтверждаю снятие всех корпусов, обеих решёток и закрытие трёх секций':'Подтверждаю установку выбранных корпусов и двух решёток','checkbox',form);confirmed.required=true;
  const button=el('button',isExtract?'Записать откачку':'Записать установку',form);button.type='submit';button.disabled=busy||(isExtract&&model.readyFrames!==model.requiredFrames);
  form.addEventListener('submit',async e=>{
   e.preventDefault();if(busy||!confirmed.checked||!bridge.isEnabled())return;
   busy=true;button.disabled=true;status.textContent='Проверка операции…';
   try{
    const base=structuredClone(bridge.getState());
    if(base.meta?.revisionId!==state.meta?.revisionId){status.textContent='Данные изменились. Откройте экран заново.';return;}
    const target=structuredClone(layout),at=new Date().toISOString(),location={type:'storage',label:storage.value.trim()},itemMoves=[],bodyStorageMoves=[];
    const request={hiveId:context.hiveId,techProcessId:context.techProcessId,expectedRevisionId:base.meta.revisionId,userConfirmed:true,occurredAt:at,kind:isExtract?'extract':'install'};
    let prepared=base;
    if(isExtract){
     request.kilograms=Number(kg.value);
     for(const id of target.honeyStack.bodyIds)bodyStorageMoves.push({bodyId:id,storageLocation:location.label});
     for(const row of target.honeyStack.excluders)itemMoves.push({itemId:row.itemId,location});
     delete target.honeyStack;
     for(const s of target.stacks){const pick=coverFields.find(x=>x.stackId===s.id);s.coverItemId=pick.cover.value;s.topRiserItemId=pick.riser.value;for(const id of [s.coverItemId,s.topRiserItemId])itemMoves.push({itemId:id,location:{type:'hive',hiveId:context.hiveId,stackId:s.id}});}
    }else{
     const ids=selection.slice(0,Number(count.value)).map(s=>s.value);
     const regroup=window.PasekaSectionalStockPairs.prepare(base,{...request,bodyIds:ids},deps.operationDependencies);
     if(!regroup.ok){status.textContent='Комплектование невозможно: '+regroup.error;return;}
     prepared=regroup.draft;
     const upper=side=>target.sections.find(s=>s.position===side).upperBroodBodyId;
     const footprint={left:[{bodyId:upper('left'),coverage:'FULL'},{bodyId:upper('middle'),coverage:'HALF'}],right:[{bodyId:upper('middle'),coverage:'HALF'},{bodyId:upper('right'),coverage:'FULL'}]};
     for(const s of target.stacks){for(const id of [s.coverItemId,s.topRiserItemId])itemMoves.push({itemId:id,location});delete s.coverItemId;delete s.topRiserItemId;}
     const excluders=excluderFields.map(p=>({side:p.side,itemId:p.field.value}));
     for(const row of excluders)itemMoves.push({itemId:row.itemId,location:{type:'hive',hiveId:context.hiveId,footprint:footprint[row.side]}});
     target.honeyStack={purpose:purpose.value,bodyIds:ids,excluders};
    }
    const candidate=deps.coordinator.prepareFullHoneyPhysicalTransition(prepared,{...request,layout:target,itemMoves,bodyStorageMoves},deps.operationDependencies);
    if(!candidate.ok){status.textContent='Операция отклонена: '+candidate.error;return;}
    const result=await bridge.commit(candidate,base);
    if(!result?.ok){status.textContent='Не сохранено: '+(result?.error||'неизвестная ошибка');return;}
    refresh();const notice=el('p',result.warnings?.length?'Операция сохранена. Проверьте резервную копию/обновление экрана.':'Операция сохранена.');notice.setAttribute('role','status');
   }catch(error){status.textContent='Операция не подтверждена: '+String(error?.message||error);}
   finally{busy=false;if(button.isConnected)button.disabled=false;}
  });
 }
 refresh();return Object.freeze({refresh});
}
window.PasekaSectionalHoneyReviewUI=Object.freeze({render,mount});
})();
