(function(root){
'use strict';
// UI for observed OP-01–OP-14 facts, independent of database and confirmation.
// The draft is volatile: never marks DONE and never creates physical equipment.
const A=x=>Array.isArray(x)?x:[],O=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const S=x=>typeof x==='string'&&x.trim().length>0;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\u0027':'&#39;'}[c]));
const PROFILE='sectional-multiqueen-v1';
const descriptors=[
 ['OP-01','Летки после весеннего облёта','Личный осмотр после первого облёта. Нижний плоский слегка открыт, нижний круглый открыт, два верхних закрыты.','flight'],
 ['OP-02','Весенняя подкормка','Сироп 2:1; 100–200 г в сутки на одну семью в зависимости от силы; белковая подкормка ежедневно. 12–15 дней — ориентир, не автоматическое завершение.','feeding'],
 ['OP-03','Перестановка корпусов (необязательно)','Поменять местами только нижний и верхний гнездовые корпуса; средний остаётся.','swap'],
 ['OP-04','Разделение на три секции','Проверить соответствие рамок и технических отверстий. Матка после разделения не определяется автоматически; второй ряд можно установить позже.','split'],
 ['OP-05','Временные сетчатые заглушки','Ориентир: 8–11-й день от разделения; проверить ровность подставки и физическое расположение всех 8 заглушек.','plugs'],
 ['OP-06','Снятие временных сеток','Допускается только после фактического подтверждения яйцекладки всех трёх плодных маток. При двух матках снятие сеток заблокировано.','queen'],
 ['OP-07','Медовый ярус','Два больших разделителя и 2 либо 4 медовых корпуса. Срок установки зависит от выбранного подтверждённого варианта.','honey'],
 ['OP-08','Отбор запечатанного мёда','Не выбирать рамки без фактического осмотра запечатанности; записать конкретные ID рамок.','sealed'],
 ['OP-09','Летние и осенние летки','Записывать фактическое положение летков в каждой из трёх секций.','entrances'],
 ['OP-10','Снятие медового яруса','Фактически снять все медовые корпуса и 2 разделителя, указать склад и вернуть подкрышники с крышками.','removeHoney'],
 ['OP-11','Основная осенняя зимовка','Три семьи объединяются, сохраняются три верхних гнездовых корпуса; выжившая матка остаётся неизвестной.','merge'],
 ['OP-12','Альтернативная зимовка','Три семьи остаются отдельно, две сетчатые диафрагмы и распределение гнездовых корпусов 2+1+1.','winter'],
 ['OP-13','Весенняя разборка альтернативной зимовки','Две однокорпусные семьи получают собственные днища и вторые корпуса.','spring'],
 ['OP-14','Ранний медосбор и новый цикл','Отбор раннего мёда, снятие решёток, сохранение 3–4 корпусов и фактическое объединение. Повторное разделение — новый цикл.','early']
];
const fieldSpecs={
 flight:[['flightObserved','Первый облёт лично наблюдался','check'],['entrancesObserved','Положение четырёх летков осмотрено','check']],
 feeding:[['familyId','Семья','family'],['gramsPerColonyPerDay','Граммов сиропа на семью в сутки','grams'],['proteinGivenToday','Белковая подкормка сегодня фактически дана','check']],
 swap:[['topBodyId','Верхний гнездовой корпус','brood'],['bottomBodyId','Нижний гнездовой корпус','brood'],['middleStayed','Средний корпус не перемещался','check']],
 split:[['sourceFamilyId','Исходная семья','family'],['threeSectionsObserved','Три секции и их технические связи проверены','check'],['secondRowObserved','Второй ряд установлен фактически (необязательно)','optionalCheck']],
 plugs:[['standLevelConfirmed','Подставка ровная','check'],['plugIds','8 установленных сетчатых заглушек','plugs']],
 queen:[['queenIds','Три индивидуально подтверждённые плодные матки','queenIds'],['layingObserved','Яйцекладка каждой из трёх маток подтверждена','check'],['twoQueenOutcome','Наблюдалось только две матки','optionalCheck']],
 honey:[['honeyBodyIds','2 или 4 медовых корпуса','honeyBodies'],['excluderIds','Две большие разделительные решётки','excluders'],['timingMode','Подтверждённый вариант срока','timing']],
 sealed:[['sealedFrameIds','Фактически запечатанные рамки','frames'],['sealingObserved','Запечатанность лично проверена','check']],
 entrances:[['phase','Проверяемая фаза','phase'],['allSectionsObserved','Летки всех трёх секций осмотрены','check']],
 removeHoney:[['honeyBodyIds','Снятые медовые корпуса','honeyBodies'],['excluderIds','Две снятые разделительные решётки','excluders'],['storageLabel','Фактическое место хранения','storage'],['actualHoneyStored','Все медовые корпуса фактически сняты и отправлены на склад','check'],['actualExcludersStored','Обе разделительные решётки фактически сняты и хранятся на складе','check'],['coversReinstalled','Крышки и подкрышники возвращены','check']],
 merge:[['upperBodyIds','Три фактически сохранённых верхних гнездовых корпуса','broodMany'],['actualMerge','Пчёлы фактически объединены; матка не назначена','check']],
 winter:[['diaphragmIds','Две сетчатые диафрагмы','diaphragms'],['winterBodyIds','Четыре гнездовых корпуса (2+1+1)','winterBodies'],['actualIsolation','Три семьи изолированы по подтверждённой раскладке','check']],
 spring:[['bottomIds','Два отдельных днища','bottoms'],['additionalBodyIds','Два дополнительных гнездовых корпуса','broodPair'],['actualSeparation','Семьи фактически разделены','check']],
 early:[['honeyBodyIds','Снятые корпуса с ранним мёдом','honeyBodies'],['excluderIds','Снятые большие разделительные решётки','excluders'],['nestBodiesAfterHarvest','Корпусов в объединённом гнезде','nestBodies'],['actualMerge','После медосбора семьи действительно объединены','check']]
};
const multiKinds={plugs:['metalMeshPlug'],honeyBodies:['body:honey'],excluders:['honeyQueenExcluder'],frames:['frame'],broodMany:['body:brood'],winterBodies:['body:brood'],diaphragms:['meshDiaphragm'],bottoms:['bottom'],broodPair:['body:brood'],queenIds:['queen']};
const limits={plugs:[8,8],honeyBodies:[2,4],excluders:[2,2],frames:[1,200],broodMany:[3,3],winterBodies:[4,4],diaphragms:[2,2],bottoms:[2,2],broodPair:[2,2],queenIds:[3,3]};
function candidates(state,hive,kind){
 const inventory=state.equipmentInventory||{},layouts=A(state.sectionalLayouts);
 const layout=layouts.find(x=>x.hiveId===hive),owned=new Set([
  ...A(layout?.sections).flatMap(s=>A(s?.broodBodyIds)),...A(layout?.honeyStack?.bodyIds)
 ]);
 const other=new Set(layouts.filter(x=>x.hiveId!==hive).flatMap(l=>[
  ...A(l?.sections).flatMap(s=>A(s?.broodBodyIds)),...A(l?.honeyStack?.bodyIds)
 ]));
 const bodies=Object.values(inventory.bodies||{}).filter(b=>b?.spec?.profileId===PROFILE&&!other.has(b.id)&&(owned.has(b.id)||S(b.storageLocation)));
 if(kind==='family')return A(state.families).filter(x=>x.hive===hive&&x.recordStatus!=='historical').map(x=>({id:x.id,label:x.name||x.id}));
 if(kind==='queen')return A(state.queens).filter(q=>q.status==='current'&&A(state.families).some(f=>f.id===q.familyId&&f.hive===hive&&f.recordStatus!=='historical')).map(q=>({id:q.id,label:q.code||q.id}));
 if(kind==='frame')return A(layout?.honeyStack?.bodyIds).flatMap(id=>A(inventory.bodies?.[id]?.frames).map(f=>({id:f.frameId,label:f.frameId+' · '+id})));
 if(kind.startsWith('body:'))return bodies.filter(x=>x.kind===kind.split(':')[1]).map(x=>({id:x.id,label:x.label||x.id}));
 return Object.values(inventory.items||{}).filter(x=>x.kind===kind&&(x.location?.type==='storage'||x.location?.type==='hive'&&x.location.hiveId===hive)).map(x=>({id:x.id,label:x.label?x.label+' · '+x.id:x.id}));
}
function selected(value){return A(value).map(String).filter(S)}
function validate(state,draft){
 const problems=[];
 const add=(code,message)=>problems.push({code,message});
 if(!O(draft)||!descriptors.some(d=>d[0]===draft.operationId))return [{code:'invalid_operation',message:'Неизвестная операция'}];
 const hive=A(state?.hives).find(h=>h?.id===draft.hiveId&&h.profileId===PROFILE);
 if(!hive)add('hive_invalid','Выберите действительный трёхсекционный улей');
 if(!S(draft.occurredAt)||!Number.isFinite(Date.parse(draft.occurredAt))||Date.parse(draft.occurredAt)>Date.now())add('date_invalid','Укажите фактическую дату, не из будущего');
 if(draft.userConfirmed!==true)add('beekeeper_not_confirmed','Нужно личное подтверждение фактического действия');
 if(draft.operationId==='OP-06'&&draft.values?.twoQueenOutcome===true)add('op06_two_queen_blocked','Двухматочный вариант: сетки не снимать, OP-06 не завершать');
 const schema=fieldSpecs[descriptors.find(d=>d[0]===draft.operationId)[3]];
 for(const [name,,type] of schema){
  const value=draft.values?.[name];
  if(type==='check'&&value!==true)add('confirmation_missing','Не подтверждено: '+name);
  if(type==='storage'&&(!S(value)||value.length>160))add('storage_missing','Фактическое место хранения обязательно');
  if(type==='grams'&&(!Number.isInteger(Number(value))||Number(value)<100||Number(value)>200))add('grams_invalid','Суточная норма должна быть 100–200 г на семью');
  if(type==='nestBodies'&&![3,4].includes(Number(value)))add('nest_invalid','Для раннего объединения допустимо 3 или 4 гнездовых корпуса');
  if(type==='family'&&(!S(value)||!candidates(state,draft.hiveId,'family').some(x=>x.id===value)))add('family_missing','Семья отсутствует в текущем улье');
  if(type==='brood'&&(!S(value)||!candidates(state,draft.hiveId,'body:brood').some(x=>x.id===value)))add('body_missing','Нужен действительный гнездовой корпус');
  if(Object.hasOwn(multiKinds,type)){
   const ids=selected(value),allowed=new Set(candidates(state,draft.hiveId,multiKinds[type][0]).map(x=>x.id)),[min,max]=limits[type];
   if(ids.length<min||ids.length>max||new Set(ids).size!==ids.length||ids.some(x=>!allowed.has(x)))add('physical_ids_invalid','Проверьте количество и действительные ID: '+name);
   if(type==='honeyBodies'&&![2,4].includes(ids.length))add('honey_pair_invalid','Медовые корпуса устанавливаются и снимаются только парами');
  }
  if(type==='phase'&&!['SUMMER_FULL','AUTUMN_REDUCED'].includes(value))add('phase_invalid','Выберите сезонную фазу');
  if(type==='timing'&&!['AFTER_OP06','WITH_SECOND_ROW','APPROX_12_DAYS_AFTER_SECOND_ROW'].includes(value))add('timing_invalid','Выберите подтверждённый вариант срока');
 }
 if(draft.operationId==='OP-03'&&draft.values?.topBodyId===draft.values?.bottomBodyId)add('same_body','Верхний и нижний корпуса должны быть разными');
 if(draft.operationId==='OP-03'){
  const layout=A(state.sectionalLayouts).find(l=>l.hiveId===draft.hiveId);
  const seq=A(layout?.sections?.[0]?.broodBodyIds);
  if(layout?.mode!=='SINGLE_FAMILY'||seq.length!==3||draft.values?.bottomBodyId!==seq[0]||draft.values?.topBodyId!==seq[2])add('swap_actual_position_mismatch','Верхний и нижний корпуса должны совпадать с текущим порядком физического реестра');
 }
 if(draft.operationId==='OP-11'){
  const layout=A(state.sectionalLayouts).find(l=>l.hiveId===draft.hiveId);
  const exact=A(layout?.sections).map(s=>s.upperBroodBodyId);
  const chosen=selected(draft.values?.upperBodyIds);
  if(exact.length!==3||!exact.every(id=>chosen.includes(id)))add('winter_upper_bodies_mismatch','Нужно сохранить три действительных верхних корпуса, не произвольные');
 }
 if(draft.operationId==='OP-10'){
  const layout=A(state.sectionalLayouts).find(l=>l.hiveId===draft.hiveId);
  const stacks=A(layout?.stacks),chosen=draft.values?.stackAccessories,items=state.equipmentInventory?.items||{};
  if(stacks.length!==3||!O(chosen)||Object.keys(chosen).length!==3)add('stack_accessory_plan_required','Для трёх секций требуются три пары крышки и подкрышника');
  else {
   const seen=new Set();
   for(const stack of stacks){
    const pair=chosen[stack.id];
    for(const [key,kind]of [['coverItemId','cover'],['topRiserItemId','topRiser']]){
     const id=pair?.[key],item=items[id];
     if(!S(id)||!item||item.kind!==kind||item.condition!=='good'||item.location?.type!=='storage'||seen.has(id))
      add('stack_accessory_not_available','Оборудование крышки и подкрышника не подтверждено на складе для секции '+stack.id);
     seen.add(id);
    }
   }
  }
 }
 if(draft.operationId==='OP-07'||draft.operationId==='OP-10'){
  const ids=selected(draft.values?.honeyBodyIds),map=state.equipmentInventory?.bodies||{},pairs=new Map();
  for(const id of ids){const pairId=map[id]?.pairId;if(!S(pairId))add('honey_missing_pair_id','Медовый корпус без идентификатора пары');else pairs.set(pairId,(pairs.get(pairId)||0)+1);}
  if([...pairs.values()].some(n=>n!==2))add('honey_incomplete_pair','Все выбранные пары медовых корпусов должны быть полными');
  const installed=A(A(state.sectionalLayouts).find(l=>l.hiveId===draft.hiveId)?.honeyStack?.bodyIds);
  if(draft.operationId==='OP-10'&&(installed.length!==ids.length||installed.some(id=>!ids.includes(id))))add('honey_remove_not_current','Снимать можно только все корпуса фактически установленного медового яруса');
 }

 if(draft.operationId==='OP-06'&&draft.values?.layingObserved!==true)add('no_laying_proof','Без подтверждённой яйцекладки всех трёх маток снятие сеток запрещено');
 return problems;
}
function optionsFor(state,hive,type){
 let kind=multiKinds[type]?.[0]||((type==='brood')?'body:brood':type);
 return candidates(state,hive,kind);
}
function inputHTML(state,hive,field){
 const [name,title,type]=field,base='data-season-field="'+esc(name)+'"';
 if(type==='check'||type==='optionalCheck')return '<label><input type="checkbox" '+base+'> '+esc(title)+(type==='optionalCheck'?' (необязательно)':'')+'</label>';
 if(Object.hasOwn(multiKinds,type)){
  const entries=optionsFor(state,hive,type);
  return '<fieldset><legend>'+esc(title)+'</legend>'+(entries.length?entries.map(item=>'<label><input type="checkbox" '+base+' value="'+esc(item.id)+'"> '+esc(item.label)+'</label>').join(''):'<p>Нет зарегистрированных подходящих предметов. Сначала выполните сверку инвентаря.</p>')+'</fieldset>';
 }
 if(type==='family'||type==='brood'){
  return '<label>'+esc(title)+'<select '+base+'><option value="">— Выберите —</option>'+optionsFor(state,hive,type).map(e=>'<option value="'+esc(e.id)+'">'+esc(e.label)+'</option>').join('')+'</select></label>';
 }
 if(type==='phase'||type==='timing'){
  const vals=type==='phase'?[['','— Выберите —'],['SUMMER_FULL','Летние летки открыты'],['AUTUMN_REDUCED','Осеннее сокращение']]:
   [['','— Выберите —'],['AFTER_OP06','После подтверждённой OP-06'],['WITH_SECOND_ROW','Вместе со вторым рядом'],['APPROX_12_DAYS_AFTER_SECOND_ROW','Через 12–15 дней после второго ряда (пользовательское уточнение)']];
  return '<label>'+esc(title)+'<select '+base+'>'+vals.map(e=>'<option value="'+esc(e[0])+'">'+esc(e[1])+'</option>').join('')+'</select></label>';
 }
 return '<label>'+esc(title)+'<input '+base+' type="'+(type==='grams'||type==='nestBodies'?'number':'text')+'"'+(type==='grams'?' min="100" max="200" step="1"':'')+' maxlength="160"></label>';
}
function createDraft(state,form){
 const op=form.querySelector('[data-season-op]')?.value,hive=form.querySelector('[data-season-hive]')?.value;
 const schema=fieldSpecs[descriptors.find(x=>x[0]===op)?.[3]]||[];
 const values={};
 for(const [name,,type]of schema){
  const fields=A(Array.from(form.querySelectorAll('[data-season-field="'+name+'"]')));
  values[name]=Object.hasOwn(multiKinds,type)?fields.filter(e=>e.checked).map(e=>e.value):type==='check'||type==='optionalCheck'?fields.some(e=>e.checked):fields[0]?.value??'';
 }
 if(op==='OP-10'){
  values.stackAccessories={};
  const layout=A(state.sectionalLayouts).find(l=>l.hiveId===hive);
  for(const stack of A(layout?.stacks)){
   values.stackAccessories[stack.id]={
    coverItemId:Array.from(form.querySelectorAll('[data-season-accessory]')).find(el=>el.getAttribute('data-season-accessory')===stack.id+':cover')?.value||'',
    topRiserItemId:Array.from(form.querySelectorAll('[data-season-accessory]')).find(el=>el.getAttribute('data-season-accessory')===stack.id+':topRiser')?.value||''
   };
  }
 }
 return {operationId:op,hiveId:hive,occurredAt:form.querySelector('[data-season-at]')?.value||'',userConfirmed:form.querySelector('[data-season-confirm]')?.checked===true,values};
}
function previewOP10(state,draft,deps={}){
 const errors=validate(state,draft);
 if(errors.length)return {ok:false,error:'op10_wizard_validation_failed',details:errors};
 if(draft.operationId!=='OP-10'||typeof deps.executor?.stage!=='function'||typeof deps.equipment?.place!=='function'||typeof deps.makeId!=='function')
  return {ok:false,error:'op10_stage_capability_missing'};
 const values=draft.values,storage=values.storageLabel,bodyIds=selected(values.honeyBodyIds),excluderIds=selected(values.excluderIds);
 const request={
  operationId:'OP-10',hiveId:draft.hiveId,occurredAt:new Date(draft.occurredAt).toISOString(),userConfirmed:true,
  honeyBodiesStoredConfirmed:values.actualHoneyStored,excludersStoredConfirmed:values.actualExcludersStored,
  coversActuallyReinstalled:values.coversReinstalled,
  bodyStorageLocations:Object.fromEntries(bodyIds.map(id=>[id,storage])),
  excluderStorageLocations:Object.fromEntries(excluderIds.map(id=>[id,storage])),
  stackAccessories:structuredClone(values.stackAccessories)
 };
 return deps.executor.stage(state,request,{now:deps.now,makeId:deps.makeId,PasekaEquipmentItems:deps.equipment});
}
function mount(host,getState){
 if(!host||typeof host.innerHTML!=='string'||typeof getState!=='function')return {ok:false,error:'season_wizard_host_or_state_missing'};
 const selectedHive=()=>host.querySelector('[data-season-hive]')?.value||'';
 const selectedOp=()=>host.querySelector('[data-season-op]')?.value||'OP-04';
 const hives=A(getState()?.hives).filter(h=>h.profileId===PROFILE);
 host.innerHTML='<div class="card"><b>Фактические технологические операции OP-01–OP-14</b><p>Ввод наблюдений и подготовка проверяемого протокола. Этот экран НЕ выполняет физическую операцию и НЕ сохраняет DONE без проверенного внешнего архива и полного транзакционного конвейера.</p>'+
 '<label>Улей<select data-season-hive>'+hives.map(h=>'<option value="'+esc(h.id)+'">'+esc(h.name||h.id)+'</option>').join('')+'</select></label>'+
 '<label>Технологический этап<select data-season-op>'+descriptors.map(d=>'<option value="'+d[0]+'">'+d[0]+' — '+esc(d[1])+'</option>').join('')+'</select></label>'+
 '<p data-season-source></p><label>Фактическая дата и время<input type="datetime-local" data-season-at></label><div data-season-fields></div>'+
 '<label><input type="checkbox" data-season-confirm> Лично подтверждаю фактически выполненное или наблюдавшееся</label>'+
 '<button type="button" data-season-preview>Проверить введённые сведения</button>'+
 '<div role="status" aria-live="polite" data-season-result></div></div>';
 const update=()=>{
  const op=selectedOp(),hive=selectedHive(),desc=descriptors.find(x=>x[0]===op);
  host.querySelector('[data-season-source]').textContent=desc?.[2]||'';
  host.querySelector('[data-season-fields]').innerHTML=(fieldSpecs[desc[3]]||[]).map(f=>inputHTML(getState(),hive,f)).join('');
  const layout=A(getState().sectionalLayouts).find(l=>l.hiveId===hive);
  if(op==='OP-10'){
   const items=getState().equipmentInventory?.items||{},accessories=['cover','topRiser'];
   const labels={cover:'Крышка',topRiser:'Подкрышник'};
   const extra=A(layout?.stacks).map(stack=>'<fieldset><legend>Секция '+esc(stack.id)+'</legend>'+
    accessories.map(kind=>'<label>'+labels[kind]+'<select data-season-accessory="'+esc(stack.id)+':'+kind+'"><option value="">— Выберите с подтверждённого склада —</option>'+
     Object.values(items).filter(item=>item.kind===kind&&item.condition==='good'&&item.location?.type==='storage')
      .map(item=>'<option value="'+esc(item.id)+'">'+esc(item.label||item.id)+'</option>').join('')+'</select></label>').join('')+
    '</fieldset>').join('');
   host.querySelector('[data-season-fields]').insertAdjacentHTML('beforeend',extra);
  }
  host.querySelector('[data-season-confirm]').checked=false;
  host.querySelector('[data-season-result]').textContent='';
 };
 host.querySelector('[data-season-op]').addEventListener('change',update);
 host.querySelector('[data-season-hive]').addEventListener('change',update);
 host.querySelector('[data-season-preview]').addEventListener('click',()=>{
  const d=createDraft(getState(),host),errs=validate(getState(),d),result=host.querySelector('[data-season-result]');
  if(errs.length){result.textContent='Не подтверждено: '+errs.map(e=>e.message).join('; ');return;}
  if(d.operationId==='OP-10'){
   const op10=root.PasekaSectionalOP10HoneyRemoval,equipment=root.PasekaEquipmentItems;
   const stage=previewOP10(getState(),d,{executor:op10,equipment,now:new Date().toISOString(),makeId:()=>root.crypto?.randomUUID?.()});
   result.textContent=stage.ok?'Физический план OP-10 проверен на временной копии: '+stage.removedBodyIds.length+' корпуса, '+stage.storedExcluderIds.length+' решётки. НЕ записано в базу. Второе устройство и восстановление полного архива ещё требуют проверки.':'OP-10 не допущена: '+String(stage.error||'неизвестная ошибка')+'. '+String(stage.details?.message||'Проверьте раскладку и комплектность.');
   return;
  }
  result.textContent='Фактические поля проверены. Это локальная заявка, а не завершённая операция. Физический переход и сохранение в базе заблокированы до подтверждённого восстановления полного архива и отдельной проверки раскладки.';
 });
 update();return {ok:true,readOnly:true,operations:descriptors.length};
}
root.PasekaSeasonOperationsWizardV2=Object.freeze({descriptors,fieldSpecs,candidates,validate,createDraft,previewOP10,mount});
})(typeof window!=='undefined'?window:globalThis);
