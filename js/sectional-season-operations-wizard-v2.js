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
 honey:[['honeyBodyIds','2 или 4 медовых корпуса','honeyBodies'],['excluderIds','Две большие разделительные решётки','excluders'],['leftExcluderId','Решётка слева (полная левая и половина средней секции)','excluder'],['rightExcluderId','Решётка справа (половина средней и полная правая секция)','excluder'],['honeyPurpose','Назначение медового яруса','honeyPurpose'],['timingMode','Подтверждённый вариант срока','timing'],['storageLabel','Место хранения снятых крышек и подкрышников','storage'],['actualCoversRemoved','Три крышки и три подкрышника физически сняты','check'],['actualExcludersInstalled','Обе большие решётки физически установлены','check'],['actualHoneyBodiesInstalled','Медовые корпуса физически установлены парами','check']],
 sealed:[['sealedFrameIds','Фактически запечатанные рамки','frames'],['sealingObserved','Запечатанность лично проверена','check'],['actualExtraction','Мёд фактически откачан','check'],['actualHoneyBodyReturn','Медовые корпуса с этими рамками фактически возвращены','check']],
 entrances:[['phase','Проверяемая фаза','phase'],['allSectionsObserved','Летки всех трёх секций осмотрены','check']],
 removeHoney:[['honeyBodyIds','Снятые медовые корпуса','honeyBodies'],['excluderIds','Две снятые разделительные решётки','excluders'],['storageLabel','Фактическое место хранения','storage'],['actualHoneyStored','Все медовые корпуса фактически сняты и отправлены на склад','check'],['actualExcludersStored','Обе разделительные решётки фактически сняты и хранятся на складе','check'],['coversReinstalled','Крышки и подкрышники возвращены','check']],
 merge:[['upperBodyIds','Три фактически сохранённых верхних гнездовых корпуса','broodMany'],['actualMerge','Пчёлы фактически объединены; матка не назначена','check']],
 winter:[['diaphragmIds','Две сетчатые диафрагмы','diaphragms'],['winterBodyIds','Четыре гнездовых корпуса (2+1+1)','winterBodies'],['strongestFamilyId','Самая сильная семья (личное наблюдение)','family'],['actualIsolation','Три семьи изолированы по подтверждённой раскладке','check']],
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
  if(type==='honeyPurpose'&&!['early','main'].includes(value))add('honey_purpose_invalid','Выберите назначение медового яруса');
  if(type==='excluder'&&(!S(value)||!candidates(state,draft.hiveId,'honeyQueenExcluder').some(x=>x.id===value)))add('excluder_identity_invalid','Решётка должна быть зарегистрирована в своем улье');
 }
 if(draft.operationId==='OP-07'){
  const values=draft.values||{},ids=selected(values.excluderIds);
  if(values.leftExcluderId===values.rightExcluderId||ids.length!==2||!ids.includes(values.leftExcluderId)||!ids.includes(values.rightExcluderId))
   add('honey_excluder_side_mapping_invalid','Две выбранные решётки должны быть назначены по одной слева и справа');
  if(values.honeyPurpose==='early'&&selected(values.honeyBodyIds).length!==2)
   add('early_honey_requires_two_bodies','Для раннего медового яруса допускается только одна пара корпусов');
 }
 if(draft.operationId==='OP-03'&&draft.values?.topBodyId===draft.values?.bottomBodyId)add('same_body','Верхний и нижний корпуса должны быть разными');
 if(draft.operationId==='OP-03'){
  const layout=A(state.sectionalLayouts).find(l=>l.hiveId===draft.hiveId);
  const seq=A(layout?.sections?.[0]?.broodBodyIds);
  if(layout?.mode!=='SINGLE_FAMILY'||seq.length!==3||draft.values?.bottomBodyId!==seq[0]||draft.values?.topBodyId!==seq[2])add('swap_actual_position_mismatch','Верхний и нижний корпуса должны совпадать с текущим порядком физического реестра');
 }

 if(['OP-11','OP-12'].includes(draft.operationId)){
  const physical=A(state.sectionalLayouts).filter(l=>l.hiveId===draft.hiveId);
  const row=physical[0];
  if(physical.length!==1||row.mode!=='SIDE_BY_SIDE'||A(row.sections).length!==3||
     row.honeyStack!=null||A(row.sections).some(s=>A(s.broodBodyIds).length!==2))
   add('winter_source_layout_not_ready','Для зимовки нужны три отдельные двухкорпусные секции без установленного медового яруса');
  if(draft.operationId==='OP-12'&&row){
   const selectedBodies=selected(draft.values?.winterBodyIds);
   const distribution=A(row.sections).map(s=>A(s.broodBodyIds).filter(id=>selectedBodies.includes(id)).length);
   const exact=new Set(A(row.sections).flatMap(s=>A(s.broodBodyIds)));
   if(selectedBodies.some(id=>!exact.has(id))||
      JSON.stringify(distribution.slice().sort())!=='[1,1,2]')
    add('op12_physical_2_1_1_not_proven','Оставьте обе рамочные секции самой сильной семьи (2 корпуса) и по одному действующему корпусу двух других семей');
   const leader=A(row.sections).find((s,i)=>distribution[i]===2);
   if(!leader||leader.familyId!==draft.values?.strongestFamilyId)
    add('op12_strongest_family_not_confirmed','Укажите фактически самую сильную семью, которой оставлены два корпуса');
   const items=state.equipmentInventory?.items||{};
   if(selected(draft.values?.diaphragmIds).some(id=>items[id]?.location?.type!=='storage'||items[id]?.condition!=='good'))
    add('op12_diaphragms_not_from_storage','Обе сетчатые диафрагмы должны быть исправными и находиться на подтверждённом складе');
  }
 }
 if(draft.operationId==='OP-13'){
  const rows=A(state.sectionalLayouts).filter(l=>l.hiveId===draft.hiveId),physical=rows[0];
  const byFamily=A(physical?.sections);
  const counts=byFamily.map(s=>A(s.broodBodyIds).length).sort();
  if(rows.length!==1||physical.mode!=='ALTERNATIVE_WINTERING_COLUMN'||
     JSON.stringify(counts)!=='[1,1,2]'||byFamily.length!==3)
   add('op13_source_wintering_layout_invalid','Весенняя разборка возможна только после фактической альтернативной зимовки с размещением 2+1+1');
  const selectedBottoms=selected(draft.values?.bottomIds),selectedBodies=selected(draft.values?.additionalBodyIds),
        items=state.equipmentInventory?.items||{},bodies=state.equipmentInventory?.bodies||{};
  const installed=new Set(A(physical?.sections).flatMap(s=>A(s.broodBodyIds)));
  if(selectedBottoms.some(id=>items[id]?.condition!=='good'||items[id]?.location?.type!=='storage'))
   add('op13_bottoms_not_in_storage','Для двух отделяемых семей требуются два исправных днища, зарегистрированных на складе');
  if(selectedBodies.some(id=>installed.has(id)||bodies[id]?.condition!=='good'||
     !S(bodies[id]?.storageLocation)))
   add('op13_added_bodies_not_in_storage','Оба дополнительных гнездовых корпуса должны быть свободными и учтёнными на складе');
 }
 if(draft.operationId==='OP-14'){
  const rows=A(state.sectionalLayouts).filter(l=>l.hiveId===draft.hiveId),physical=rows[0];
  const currentHoney=A(physical?.honeyStack?.bodyIds);
  const actualExcluders=A(physical?.honeyStack?.excluders).map(x=>x.itemId);
  if(rows.length!==1||physical.mode!=='SIDE_BY_SIDE'||
     A(physical.sections).length!==3||A(physical.sections).some(s=>A(s.broodBodyIds).length!==2||!A(s.broodBodyIds).includes(s.upperBroodBodyId))||
     physical.honeyStack?.purpose!=='early'||
     currentHoney.length!==2||actualExcluders.length!==2||
     selected(draft.values?.honeyBodyIds).length!==2||
     currentHoney.some(id=>!selected(draft.values?.honeyBodyIds).includes(id))||
     actualExcluders.some(id=>!selected(draft.values?.excluderIds).includes(id)))
   add('op14_original_early_honey_layout_mismatch','Для раннего объединения нужно подтвердить именно два установленных корпуса раннего мёда и обе действующие решётки');
 }
 if(draft.operationId==='OP-09'){
  const layout=A(state.sectionalLayouts).find(l=>l.hiveId===draft.hiveId);
  const expected=draft.values?.phase==='SUMMER_FULL'?{roundEntrances:'all_open',flatEntrance:'fully_open'}:
    draft.values?.phase==='AUTUMN_REDUCED'?{roundEntrances:'one_open',flatEntrance:'one_bee_width'}:null;
  const actual=A(draft.values?.sectionEntrances),sections=A(layout?.sections).map(s=>s.id);
  if(layout?.mode!=='SIDE_BY_SIDE'||sections.length!==3||actual.length!==3||
     new Set(sections).size!==3||new Set(actual.map(s=>s?.sectionId)).size!==3||
     actual.some(s=>!sections.includes(s?.sectionId)||s?.personallyObserved!==true||
      !expected||s?.roundEntrances!==expected.roundEntrances||s?.flatEntrance!==expected.flatEntrance))
   add('op09_actual_sections_not_verified','Для каждой секции отдельно укажите фактически наблюдаемые состояния круглых и плоского летков');
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
 if(type==='honeyPurpose')return '<label>'+esc(title)+'<select '+base+'><option value="">— Выберите —</option><option value="early">Ранний взяток</option><option value="main">Основной взяток</option></select></label>';
 if(type==='excluder')return '<label>'+esc(title)+'<select '+base+'><option value="">— Выберите —</option>'+candidates(state,hive,'honeyQueenExcluder').filter(x=>state.equipmentInventory?.items?.[x.id]?.location?.type==='storage').map(x=>'<option value="'+esc(x.id)+'">'+esc(x.label)+'</option>').join('')+'</select></label>';
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
 if(op==='OP-09'){
  const layout=A(state.sectionalLayouts).find(l=>l.hiveId===hive);
  values.sectionEntrances=A(layout?.sections).map(section=>{
   const sid=section.id;
   const round=Array.from(form.querySelectorAll('[data-season-op09-round]')).find(el=>el.getAttribute('data-season-op09-round')===sid);
   const flat=Array.from(form.querySelectorAll('[data-season-op09-flat]')).find(el=>el.getAttribute('data-season-op09-flat')===sid);
   const proof=Array.from(form.querySelectorAll('[data-season-op09-observed]')).find(el=>el.getAttribute('data-season-op09-observed')===sid);
   return {sectionId:sid,roundEntrances:round?.value||'',flatEntrance:flat?.value||'',personallyObserved:proof?.checked===true};
  });
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
function previewOP07(state,draft,deps={}){
 const errors=validate(state,draft);
 if(errors.length)return {ok:false,error:'op07_wizard_validation_failed',details:errors};
 if(draft.operationId!=='OP-07'||typeof deps.manifest?.plan!=='function')return {ok:false,error:'op07_manifest_capability_missing'};
 const active=A(state.sectionalSeasonCycles).filter(c=>c.hiveId===draft.hiveId&&c.status==='ACTIVE');
 if(active.length!==1)return {ok:false,error:'op07_active_season_missing'};
 const v=draft.values;
 return deps.manifest.plan(state,{
  hiveId:draft.hiveId,cycleId:active[0].id,userConfirmed:draft.userConfirmed,
  occurredAt:new Date(draft.occurredAt).toISOString(),honeyBodyIds:selected(v.honeyBodyIds),
  leftExcluderId:v.leftExcluderId,rightExcluderId:v.rightExcluderId,honeyPurpose:v.honeyPurpose,
  timingMode:v.timingMode,storageLabel:v.storageLabel,actualCoversRemoved:v.actualCoversRemoved,
  actualExcludersInstalled:v.actualExcludersInstalled,actualHoneyBodiesInstalled:v.actualHoneyBodiesInstalled
 });
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

function previewOP08(state,draft,deps={}){
 const errors=validate(state,draft);
 if(errors.length)return {ok:false,error:'op08_wizard_validation_failed',details:errors};
 if(draft.operationId!=='OP-08'||typeof deps.extractor?.stage!=='function'||typeof deps.makeId!=='function')
  return {ok:false,error:'op08_stage_capability_missing'};
 const extracted=deps.extractor.stage(state,{
  hiveId:draft.hiveId,operationId:'OP-08',occurredAt:new Date(draft.occurredAt).toISOString(),
  extractionId:deps.makeId(),userConfirmed:true,
  honeySealedPersonallyObserved:draft.values.sealingObserved,
  honeyExtractionActuallyDone:draft.values.actualExtraction,
  honeyBodiesActuallyReturned:draft.values.actualHoneyBodyReturn,
  frameIds:selected(draft.values.sealedFrameIds)
 },{makeId:deps.makeId,now:deps.now});
 if(!extracted.ok)return extracted;
 return {...extracted,readOnly:true,operationCompleted:false};
}
function previewOP09(state,draft,deps={}){
 const errors=validate(state,draft);
 if(errors.length)return {ok:false,error:'op09_wizard_validation_failed',details:errors};
 if(draft.operationId!=='OP-09'||typeof deps.recorder?.record!=='function'||typeof deps.makeId!=='function')
  return {ok:false,error:'op09_stage_capability_missing'};
 const observation=deps.recorder.record(state,{
  hiveId:draft.hiveId,occurredAt:new Date(draft.occurredAt).toISOString(),
  phase:draft.values.phase,userConfirmed:true,
  sections:A(draft.values.sectionEntrances).map(s=>({
   sectionId:s.sectionId,roundEntrances:s.roundEntrances,flatEntrance:s.flatEntrance
  })),notes:''
 },deps.makeId,deps.now);
 if(!observation.ok)return observation;
 const draftState=structuredClone(state);
 draftState.sectionalSeasonalEntranceObservations=observation.stagedHistory;
 return {ok:true,readOnly:true,operationCompleted:false,draft:draftState,event:observation.event};
}

function op06RecoveryHTML(state,hiveId){
 const layout=A(state.sectionalLayouts).find(l=>l.hiveId===hiveId&&l.mode==='SIDE_BY_SIDE');
 const lineage=root.PasekaFamilyLineage;
 const recovery=root.PasekaOP06TwoQueenRecovery;
 if(!layout||typeof lineage?.getQueenPresenceStatus!=='function'||typeof recovery?.planFromState!=='function')
  return '<p>Восстановление OP-06 недоступно: отсутствует проверенная физическая модель либо данные о матках.</p>';
 const states=A(layout.sections).map(s=>({section:s,status:lineage.getQueenPresenceStatus(state,s.familyId)}));
 const absent=states.filter(s=>s.status==='confirmed_absent'),present=states.filter(s=>s.status==='confirmed_present');
 if(absent.length!==1||present.length!==2||states.length!==3)
  return '<p>Сначала подтвердите отсутствие матки в одной секции и наличие маток в двух других через журнал наблюдений. По дате отсутствие не определяется.</p>';
 const receiver=absent[0].section, bodies=state.equipmentInventory?.bodies||{};
 const targetChoices=A(receiver.broodBodyIds).map(id=>'<option value="'+esc(id)+'">'+esc(id)+'</option>').join('');
 const donors=present.flatMap(x=>A(x.section.broodBodyIds).flatMap(bodyId=>
  A(bodies[bodyId]?.frames).map(frame=>({sectionId:x.section.id,bodyId,frameId:frame.frameId}))))
  .filter(x=>S(x.frameId));
 const displacedOptions='<option value="">— Рамка, фактически переставленная из безматочного корпуса —</option>'+
 A(receiver.broodBodyIds).flatMap(bodyId=>A(bodies[bodyId]?.frames).map(frame=>
 '<option value="'+esc(frame.frameId)+'" data-body-id="'+esc(bodyId)+'">'+esc(frame.frameId+' · '+bodyId)+'</option>')).join('');
 const donorOptions='<option value="">— Выберите фактическую рамку —</option>'+donors.map(x=>
   '<option value="'+esc(x.frameId)+'" data-from-body="'+esc(x.bodyId)+'" data-from-section="'+esc(x.sectionId)+'">'+esc(x.frameId+' · '+x.bodyId)+'</option>').join('');
 if(!targetChoices||donors.length<2)return '<p>Нет подтверждённых идентификаторов корпусов и рамок для проверки восстановления.</p>';
 return '<fieldset data-op06-recovery><legend>OP-06: восстановление безматочной секции (только проверка)</legend>'+
 '<p>Безматочная секция: <b>'+esc(receiver.position)+'</b>. По прямому решению пчеловода в неё переносят две рамки с расплодом; матку переносить нельзя. Снятие сеток и завершение OP-06 здесь недоступны.</p>'+
 '<label>Корпус-получатель<select data-op06-target>'+targetChoices+'</select></label>'+
 [0,1].map(i=>'<fieldset><legend>Рамка '+(i+1)+'</legend><label>Источник (фактический ID)<select data-op06-donor="'+i+'">'+donorOptions+'</select></label>'+
 '<label><input type="checkbox" data-op06-brood="'+i+'"> На рамке лично проверен расплод</label>'+
 '<label><input type="checkbox" data-op06-eggs="'+i+'"> На этой рамке лично проверены свежие яйца (DOCX P31–33)</label>'+
 '<label><input type="checkbox" data-op06-queen-safe="'+i+'"> Матка на рамке отсутствует (лично проверено)</label>'+
 '<label>Рамка, фактически освобождающая место в корпусе-получателе<select data-op06-replacement="'+i+'">'+displacedOptions+'</select></label></fieldset>').join('')+
 '<label><input type="checkbox" data-op06-confirm> Подтверждаю достоверность осмотра; это не отметка о выполненном переносе</label>'+
 '<button type="button" data-op06-check>Проверить восстановление (без записи)</button>'+
 '<fieldset><legend>Только после фактической перестановки четырёх рамок</legend>'+
 '<p>Для полного заполненного корпуса необходимо отметить ID двух переставляемых из него рамок и их новые места в корпусах-донорах. Никакое перемещение не угадывается.</p>'+
 '<label><input type="checkbox" data-op06-work> Лично выполнил описанный обмен рамок</label>'+
 '<label><input type="checkbox" data-op06-mesh> Фактически сверил сетки по схеме край/центр</label>'+
 '<button type="button" data-op06-stage>Проверить запись физических изменений (без сохранения)</button>'+
 '<p role="status" aria-live="polite" data-op06-stage-result>Изменения в базу не записывались.</p></fieldset>'+
 '<p role="status" aria-live="polite" data-op06-result>Операция не выполнялась и не записывалась.</p></fieldset>';
}
function checkOP06Recovery(state,hiveId,panel){
 const choices=[0,1].map(i=>{
  const element=panel.querySelector('[data-op06-donor="'+i+'"]'),option=element?.selectedOptions?.[0];
  return {frameId:element?.value||'',fromBodyId:option?.getAttribute('data-from-body')||'',
   fromSectionId:option?.getAttribute('data-from-section')||'',
   broodObserved:panel.querySelector('[data-op06-brood="'+i+'"]')?.checked===true,
   freshEggsObserved:panel.querySelector('[data-op06-eggs="'+i+'"]')?.checked===true,
   replacementFrameId:panel.querySelector('[data-op06-replacement="'+i+'"]')?.value||'',
   queenAbsentOnTransferredFrameConfirmed:panel.querySelector('[data-op06-queen-safe="'+i+'"]')?.checked===true};
 });
 const layout=A(state.sectionalLayouts).find(l=>l.hiveId===hiveId&&l.mode==='SIDE_BY_SIDE');
 const lineage=root.PasekaFamilyLineage;
 const receiver=A(layout?.sections).find(s=>lineage?.getQueenPresenceStatus(state,s.familyId)==='confirmed_absent');
 return root.PasekaOP06TwoQueenRecovery.planFromState(state,{
  hiveId,queenlessSectionId:receiver?.id,toBodyId:panel.querySelector('[data-op06-target]')?.value,
  userConfirmed:panel.querySelector('[data-op06-confirm]')?.checked===true,
  transfers:choices}, {lineage});
}


function preflightOP06RescueStage(state,hiveId,panel,options={}){
 if(typeof root.PasekaSectionalOP06BroodRescueV2?.stage!=='function')
  return {ok:false,error:'op06_rescue_physical_stage_unavailable'};
 const preflight=checkOP06Recovery(state,hiveId,panel);
 if(!preflight.ok)return {ok:false,error:'op06_rescue_source_preflight_invalid',details:preflight.errors};
 const active=A(state.sectionalSeasonCycles).filter(c=>c.hiveId===hiveId&&c.status==='ACTIVE');
 if(active.length!==1)return {ok:false,error:'op06_rescue_active_season_missing'};
 const bodyId=panel.querySelector('[data-op06-target]')?.value||'';
 const selects=[0,1].map(i=>panel.querySelector('[data-op06-donor="'+i+'"]'));
 const transfers=selects.map((el,i)=>({
  frameId:el?.value||'',fromBodyId:el?.selectedOptions?.[0]?.getAttribute('data-from-body')||'',
  fromSectionId:el?.selectedOptions?.[0]?.getAttribute('data-from-section')||'',
  toSectionId:preflight.queenlessSectionId,
  broodObserved:panel.querySelector('[data-op06-brood="'+i+'"]')?.checked===true,
  freshEggsObserved:panel.querySelector('[data-op06-eggs="'+i+'"]')?.checked===true,
  queenAbsentOnTransferredFrameConfirmed:panel.querySelector('[data-op06-queen-safe="'+i+'"]')?.checked===true,
  replacementFrameId:panel.querySelector('[data-op06-replacement="'+i+'"]')?.value||''
 }));
 const occurredAt=options.occurredAt,now=options.now;
 if(!S(occurredAt)||!S(now)||!Number.isFinite(Date.parse(occurredAt))||!Number.isFinite(Date.parse(now)))
  return {ok:false,error:'op06_rescue_actual_time_missing'};
 const request={operationId:'OP-06-RESCUE',hiveId,cycleId:active[0].id,
  occurredAt,userConfirmed:panel.querySelector('[data-op06-confirm]')?.checked===true,
  actualWorkConfirmed:panel.querySelector('[data-op06-work]')?.checked===true,
  actualFrameExchangeConfirmed:panel.querySelector('[data-op06-work]')?.checked===true,
  meshConfigurationPersonallyVerified:panel.querySelector('[data-op06-mesh]')?.checked===true,
  queenlessSectionId:preflight.queenlessSectionId,toBodyId:bodyId,transfers};
 const inspector=options.inspectState||((s)=>{
  const checks=[
   root.PasekaSectionalPhysicalLayout?.inspect?.(s),
   root.PasekaFamilyLineage?.inspect?.(s),
   root.PasekaLabels?.inspectLabelIntegrity?.(s),
   root.PasekaInventory?.inspect?.(s,root.PasekaLabels),
   root.PasekaEquipmentItems?.inspect?.(s)
  ];
  if(checks.some(x=>!Array.isArray(x)))return [{code:'op06_required_integrity_inspector_missing'}];
  return checks.flat();
 });
 const result=root.PasekaSectionalOP06BroodRescueV2.stage(state,request,{
  now,makeId:options.makeId||(()=>root.crypto?.randomUUID?.()),
  recovery:root.PasekaOP06TwoQueenRecovery,lineage:root.PasekaFamilyLineage,
  inspectState:inspector
 });
 if(!result.ok)return result;
 return {ok:true,stagedOnly:true,operationCompleted:false,
  changedBodyIds:result.changedBodyIds,beforeFrameOrder:result.beforeFrameOrder,
  afterFrameOrder:result.afterFrameOrder};
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
  if(op==='OP-06'){
   const fields=host.querySelector('[data-season-fields]');
   fields.insertAdjacentHTML('beforeend',op06RecoveryHTML(getState(),hive));
   const panel=fields.querySelector('[data-op06-recovery]');
   panel?.querySelector('[data-op06-stage]')?.addEventListener('click',()=>{
    const result=panel.querySelector('[data-op06-stage-result]');
    let staged;
    try{
     const actual=host.querySelector('[data-season-at]')?.value||'';
     staged=preflightOP06RescueStage(getState(),hive,panel,{
      now:new Date().toISOString(),
      occurredAt:actual?new Date(actual).toISOString():'',
      makeId:()=>root.crypto?.randomUUID?.()
     });
    }catch(error){staged={ok:false,error:'op06_stage_preview_failed'}}
    result.textContent=staged.ok?
     'Предварительная физическая запись проверена на временной копии: '+staged.changedBodyIds.join(', ')+
     '. Ничего не записано в IndexedDB, OP-06 не завершена. Для окончательного сохранения необходим подтверждённый внешний архив и атомарная транзакция.':
     'Перестановка не допущена: '+String(staged.error||'ошибка данных')+'. Не записано.';
   });
   panel?.querySelector('[data-op06-check]')?.addEventListener('click',()=>{
    let outcome;try{outcome=checkOP06Recovery(getState(),hive,panel)}
    catch(error){outcome={ok:false,errors:['recovery_validation_unavailable']}}
    const output=panel.querySelector('[data-op06-result]');
    output.textContent=outcome.ok?
     'Рамки и граница проверены: '+outcome.transfers.map(x=>x.frameId+' ('+x.fromBodyId+' → '+x.toBodyId+')').join(', ')+
     '. Сетки: '+(outcome.meshRule==='KEEP_EXISTING_MESH'?'оставить без изменения':'применить правило первоначального разделения только между крайней и центральной секциями')+
     '. '+(outcome.requiresFrameSlotReconciliation?'Нужно подтвердить освобождение двух мест в корпусе-получателе. ':'')+
     'Это только план: рамки не перемещены в учёте, OP-06 НЕ завершена.':
     'План отклонён: '+A(outcome.errors).map(String).join(', ')+'. Данные не изменены.';
   });
  }
  const layout=A(getState().sectionalLayouts).find(l=>l.hiveId===hive);
  if(['OP-11','OP-12','OP-13','OP-14'].includes(op)){
   const fields=host.querySelector('[data-season-fields]');
   fields.insertAdjacentHTML('beforeend','<fieldset data-season-physical-source>'+
     '<legend>Физический инвентарь перед операцией</legend>'+
     '<p>Проверьте зарегистрированные корпуса и оборудование. Целевые позиции и склад не назначаются автоматически.</p>'+
     '<button type="button" data-season-physical-audit>Показать текущие ID и позиции</button>'+
     '<div role="status" aria-live="polite" data-season-physical-audit-result>Никакая операция не выполнялась.</div>'+
     '</fieldset>');
   fields.querySelector('[data-season-physical-audit]')?.addEventListener('click',()=>{
    const output=fields.querySelector('[data-season-physical-audit-result]');
    const audit=root.PasekaSectionalSeasonPhysicalManifestV2?.inspectSource?.(getState(),hive);
    if(!audit?.ok){
     output.textContent='Физический инвентарь не подтверждён: '+String(audit?.error||'нет обязательного модуля')+
      '. Данные не изменены.';
     return;
    }
    const inventory=[...audit.bodyEntries.map(b=>'Корпус '+b.id+' · '+b.location.bodyRole+
       ' · '+b.location.position+' · рамок '+b.frameIds.length),
     ...audit.itemEntries.map(item=>'Предмет '+item.id+' · '+item.kind+
       ' · '+(item.actual?.type==='storage'?'склад':item.actual?.stackId||item.actual?.positionLabel||'место неизвестно'))];
    output.textContent='Ревизия '+audit.sourceRevisionId+'. '+inventory.join('; ')+
     '. Для физической записи дополнительно требуется точная целевая раскладка, новые места каждого предмета и независимый архив. Ничего не сохранено.';
   });
  }
  if(op==='OP-14'){
   const fields=host.querySelector('[data-season-fields]');
   fields.insertAdjacentHTML('beforeend','<div data-op14-guided></div>');
   const guided=root.PasekaSectionalOP14GuidedV2?.mount?.(
    fields.querySelector('[data-op14-guided]'),getState,hive,host);
   if(!guided?.ok)fields.querySelector('[data-op14-guided]').textContent=
    'OP-14: исходная раскладка не подтверждена. Физическая запись заблокирована.';
  }
  if(op==='OP-11'){
   const fields=host.querySelector('[data-season-fields]');
   fields.insertAdjacentHTML('beforeend','<div data-op11-guided></div>');
   const guided=root.PasekaSectionalOP11GuidedV2?.mount?.(
    fields.querySelector('[data-op11-guided]'),getState,hive,host);
   if(!guided?.ok)fields.querySelector('[data-op11-guided]').textContent=
    'OP-11: пошаговый предварительный план недоступен. Физическая запись заблокирована.';
  }
  if(op==='OP-12'){
   const fields=host.querySelector('[data-season-fields]');
   fields.insertAdjacentHTML('beforeend','<div data-op12-guided></div>');
   const outcome=root.PasekaSectionalOP12GuidedV2?.mount?.(
    fields.querySelector('[data-op12-guided]'),getState,()=>hive,host);
   if(!outcome?.ok)fields.querySelector('[data-op12-guided]').textContent=
    'OP-12: пошаговый план временно недоступен. Сохранение по-прежнему заблокировано.';
  }
  if(op==='OP-09'){
   const opts=(items)=>items.map(([id,title])=>'<option value="'+esc(id)+'">'+esc(title)+'</option>').join('');
   const layout=A(getState().sectionalLayouts).find(l=>l.hiveId===hive&&l.mode==='SIDE_BY_SIDE');
   const extra=A(layout?.sections).map(section=>'<fieldset><legend>Секция '+esc(section.position||section.id)+'</legend>'+
     '<label>Круглые летки<select data-season-op09-round="'+esc(section.id)+'">'+opts([['','— Выберите наблюдавшееся —'],['all_open','Все открыты'],['one_open','Один открыт']])+'</select></label>'+
     '<label>Плоский леток<select data-season-op09-flat="'+esc(section.id)+'">'+opts([['','— Выберите наблюдавшееся —'],['fully_open','Полностью открыт'],['one_bee_width','На ширину одной пчелы']])+'</select></label>'+
     '<label><input type="checkbox" data-season-op09-observed="'+esc(section.id)+'"> Подтверждаю личное наблюдение летков секции</label></fieldset>').join('');
   host.querySelector('[data-season-fields]').insertAdjacentHTML('beforeend',extra);
  }
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
  if(d.operationId==='OP-08'){
   const p=previewOP08(getState(),d,{extractor:root.PasekaSectionalOP08Honey,
    makeId:()=>root.crypto?.randomUUID?.(),now:new Date().toISOString()});
   result.textContent=p.ok?'Проверен предварительный журнал откачки '+p.extraction.frameIds.length+
    ' запечатанных рамок с сохранением ID и истории. ТОЛЬКО ПРОСМОТР, в базу ничего не записано.':
    'OP-08 не допущена: '+String(p.error||'ошибка')+'.';
   return;
  }
  if(d.operationId==='OP-09'){
   const p=previewOP09(getState(),d,{recorder:root.PasekaSectionalOP09Entrances,
    makeId:()=>root.crypto?.randomUUID?.(),now:new Date().toISOString()});
   result.textContent=p.ok?'Проверена запись наблюдений летков всех трёх секций. ТОЛЬКО ПРОСМОТР, нет изменений летков или базы.':
    'OP-09 не допущена: '+String(p.error||'ошибка')+'.';
   return;
  }
  if(d.operationId==='OP-07'){
   const candidate=previewOP07(getState(),d,{manifest:root.PasekaSectionalOP07ManifestV2});
   result.textContent=candidate.ok?'План OP-07 проверен по зарегистрированной раскладке: '+candidate.request.layout.honeyStack.bodyIds.length+' медовых корпуса, 2 решётки с конкретной геометрией и снятие 6 крышек/подкрышников. Это ТОЛЬКО ПРОСМОТР, не DONE и не запись в базу.':'OP-07 не допущена: '+String(candidate.error)+'. Проверьте инвентарь, компоновку и активный сезон.';
   return;
  }
  if(d.operationId==='OP-10'){
   const op10=root.PasekaSectionalOP10HoneyRemoval,equipment=root.PasekaEquipmentItems;
   const stage=previewOP10(getState(),d,{executor:op10,equipment,now:new Date().toISOString(),makeId:()=>root.crypto?.randomUUID?.()});
   result.textContent=stage.ok?'Физический план OP-10 проверен на временной копии: '+stage.removedBodyIds.length+' корпуса, '+stage.storedExcluderIds.length+' решётки. НЕ записано в базу. Второе устройство и восстановление полного архива ещё требуют проверки.':'OP-10 не допущена: '+String(stage.error||'неизвестная ошибка')+'. '+String(stage.details?.message||'Проверьте раскладку и комплектность.');
   return;
  }
  if(['OP-11','OP-12','OP-13','OP-14'].includes(d.operationId)){
   const audit=root.PasekaSectionalSeasonPhysicalManifestV2?.inspectSource?.(getState(),d.hiveId);
   result.textContent=audit?.ok?
    'Подтверждено только исходное размещение '+audit.bodyEntries.length+
    ' корпусов и '+audit.itemEntries.length+' предметов. Для каждого перемещения нужны целевая компоновка, место хранения и отдельная сверка ID. OP не завершена, IndexedDB не изменена.':
    'Исходная физическая раскладка недоступна: '+String(audit?.error||'нет проверяющего модуля')+
    '. Операция заблокирована, ничего не записано.';
   return;
  }
  result.textContent='Фактические поля проверены. Это локальная заявка, а не завершённая операция. Физический переход и сохранение в базе заблокированы до подтверждённого восстановления полного архива и отдельной проверки раскладки.';
 });
 update();return {ok:true,readOnly:true,operations:descriptors.length};
}
root.PasekaSeasonOperationsWizardV2=Object.freeze({descriptors,fieldSpecs,candidates,validate,createDraft,previewOP07,previewOP08,previewOP09,previewOP10,op06RecoveryHTML,checkOP06Recovery,preflightOP06RescueStage,mount});
})(typeof window!=='undefined'?window:globalThis);
