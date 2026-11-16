(() => {
'use strict';
const SPEC=Object.freeze({
 id:'sectional-multiqueen-v1',version:'1.7.0',language:'ru',
 sectionsAtDivision:3,nestFrames:6,honeyFrames:10,frameHeightMm:180,honeyBodiesDefault:2,honeyBodiesMax:4,
 geometry:Object.freeze({
  nestBodiesPerSectionAtDivision:2,additionalBottomsAtDivision:2,frameHeightMm:180,bodyHeightMm:'PROFILE_DEFINED_SEPARATELY',technicalOpeningDiameterMm:50,
  permanentQueenExcludersInTechnicalOpenings:true,queenExcluderLayersPerConnection:2,
  technicalOpeningBufferCorridorRequired:true,metalMeshPlugsPerTechnicalOpeningPerBody:1,
  honeyQueenExcluders:'TWO_FULL_OUTER_AND_TWO_HALF_SHARED_CENTER',
  honeyBodiesCountScope:'WHOLE_HIVE',honeyBodiesExpansion:[2,4],
  syrupSugarParts:2,syrupWaterParts:1,syrupDailyGrams:[100,200],
  proteinFeedRule:'REFILL_AS_CONSUMED'
 }),
 phases:['WINTER','POST_WINTER','SPRING_DEVELOPMENT','PRE_DIVISION','DIVIDED_3_SECTIONS','HONEY_BODIES_INSTALLED','HONEY_COLLECTION','END_OF_SEASON','AUTUMN_PREP','WINTER_ASSEMBLY','ALT_WINTERING','ALT_WINTERING_SPRING'],
 operations:[
 {id:'OP-01',title:'Весеннее открытие летков',optional:false},
 {id:'OP-02',title:'Весенняя подкормка',optional:false,durationDays:[12,15],syrupDailyGrams:[100,200],syrupRatio:{sugar:2,water:1},proteinFeed:'AS_CONSUMED'},
 {id:'OP-03',title:'Перестановка корпусов (верх ↔ низ)',optional:true,recommended:true,offsetFrom:'OP-04',offsetDays:[-7,-5]},
 {id:'OP-04',title:'Разделение улья на 3 секции',optional:false,nestBodiesPerSection:2,additionalBottomsRequired:2},
 {id:'OP-05',title:'Установка металлических сетчатых заглушек',optional:false,offsetFrom:'OP-04',offsetDays:[8,11],openingDiameterMm:50,scope:'EVERY_TECHNICAL_OPENING_IN_EVERY_BODY'},
 {id:'OP-06',title:'Снятие металлических сетчатых заглушек',optional:false,offsetFrom:'OP-04',offsetDays:[20,21],condition:'ALL_THREE_QUEENS_FERTILIZED_AND_LAYING_OBSERVED',afterRemoval:'OPTIONAL_ENTRANCE_ADJUSTMENT'},
 {id:'OP-07',title:'Постановка медовых корпусов',optional:false,honeyQueenExcluderLayout:'UNCONFIRMED',honeyBodiesScope:'WHOLE_HIVE'},
 {id:'OP-08',title:'Отбор мёда',optional:false,offsetFrom:'HONEY_FLOW_MAIN_START',offsetDays:[15,15],retryDays:7},
 {id:'OP-09',title:'Сокращение летков',optional:false,period:'Вторая половина августа',openEntrance:'ROUND_BOTTOM',entrancePosition:'LOWER_NEST_BODY'},
 {id:'OP-10',title:'Осенняя подготовка',optional:false,period:'Середина–конец сентября'},
 {id:'OP-11',title:'Сборка гнезда на зиму: объединение',optional:false,exclusiveGroup:'wintering',winterNestBodies:3},
 {id:'OP-12',title:'Альтернативная зимовка: сохранение 3 семей',optional:true,exclusiveGroup:'wintering',diaphragms:2,sectionBodies:[2,1,1]},
 {id:'OP-13',title:'Весеннее развитие после альтернативной зимовки',optional:true,offsetFrom:'FIRST_FLIGHT',offsetDays:[40,50]},
 {id:'OP-14',title:'Ранний медосбор и возврат к летнему циклу',optional:true,honeyBodiesCount:2,postHarvestNestBodies:[3,4],postHarvestCombineDelayDays:[3,5],afterCompletion:'REMOVE_HONEY_BODIES_AND_QUEEN_EXCLUDERS; REDUCE_NEST_TO_3_OR_4_BODIES; COMBINE_FAMILIES; AFTER_3_TO_5_DAYS_REPEAT_DIVISION'}
 ],
 entranceAssignment:[
 {sectionIndex:1,openEntrance:'FLAT_BOTTOM',state:'HALF_OPEN'},
 {sectionIndex:2,openEntrance:'ROUND_TOP',state:'OPEN'},
 {sectionIndex:3,openEntrance:'ROUND_BOTTOM',state:'OPEN'}
 ],
 unresolved:[
 'Точное число отверстий 50 мм на каждом корпусе определяется фактической конструкцией; заглушка требуется на каждое такое отверстие в каждом корпусе на время OP-05.',
 'OP-11 сохраняет прежний алгоритм выбора и установки корпусов; модель не должна заменять его произвольным выбором конкретных корпусов.',
 'В OP-09 открывается круглый леток именно в нижнем гнездовом корпусе каждой секции; это сезонное правило не меняет весеннее/после-разделительное назначение летков R1.',
 'Нельзя создавать карточку sectional-multiqueen-v1 на профиле Farrar. Отдельный профиль технологии включать только после перевода инвентаря, зимней сборки и учёта медовых корпусов на профильные правила; требуется поддержка 2 или 4 медовых корпусов.'
 ]
});
const DAY=86400000,DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
function parseDate(v){if(typeof v!=='string'||!DATE_RE.test(v))return null;const p=v.split('-').map(Number),d=new Date(Date.UTC(p[0],p[1]-1,p[2]));return d.getUTCFullYear()===p[0]&&d.getUTCMonth()===p[1]-1&&d.getUTCDate()===p[2]?d:null;}
function fmt(d){return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');}
function shiftDate(v,n){const d=parseDate(v);if(!d||!Number.isInteger(n))throw new Error('Укажи корректную дату и целое число дней.');return fmt(new Date(d.getTime()+n*DAY));}
function buildOperationSchedule(a){const out=[];const add=(id,date,range,extra)=>{if(date)out.push(Object.assign({operationId:id,from:shiftDate(fmt(date),range[0]),to:shiftDate(fmt(date),range[1])},extra||{}));};const d=parseDate(a&&a['OP-04']);add('OP-03',d,[-7,-5],{optional:true});add('OP-05',d,[8,11],{scope:'EVERY_TECHNICAL_OPENING_IN_EVERY_BODY'});add('OP-06',d,[20,21],{condition:'ALL_THREE_QUEENS_FERTILIZED_AND_LAYING_OBSERVED'});add('OP-08',parseDate(a&&a.HONEY_FLOW_MAIN_START),[15,15],{retryAfterDays:7});add('OP-13',parseDate(a&&a.FIRST_FLIGHT),[40,50],{optional:true});return out;}
function validateHiveState(s,options={}){
 const errors=[],warnings=[],add=(code,message,level)=> (level==='warning'?warnings:errors).push({code,message});
 if(!s||typeof s!=='object'||Array.isArray(s))return {valid:false,errors:[{code:'STATE_INVALID',message:'Состояние улья должно быть объектом.'}],warnings};
 if(s.config!==undefined&&(!s.config||typeof s.config!=='object'||Array.isArray(s.config)))add('CONFIG_INVALID','Конфигурация техпроцесса должна быть объектом.');
 const c=s.config&&typeof s.config==='object'&&!Array.isArray(s.config)?s.config:{};
 if(c.frameHeightMm!==undefined&&c.frameHeightMm!==180)add('FRAME_HEIGHT','Для этой технологии высота рамок должна быть 180 мм.');
 if(c.winteringMode!==undefined&&!['COMBINED','ALTERNATIVE_DIAPHRAGMS'].includes(c.winteringMode))add('WINTERING_MODE','Неизвестный способ зимовки в конфигурации.');
 if(c.hasRemovableFeeder!==undefined&&typeof c.hasRemovableFeeder!=='boolean')add('FEEDER_CONFIG','Признак съёмной кормушки должен быть логическим значением.');
 if(c.honeyBodiesCount!==undefined&&![2,4].includes(c.honeyBodiesCount))add('HONEY_BODIES_COUNT','Допустимо 2 или 4 медовых корпуса на весь улей.');
 if(c.additionalBottoms!==undefined&&(!Number.isInteger(c.additionalBottoms)||c.additionalBottoms<0||c.additionalBottoms>2))add('ADDITIONAL_BOTTOMS','Дополнительных доньев должно быть от 0 до 2.');
 if(s.phase&&!SPEC.phases.includes(s.phase))add('PHASE_UNKNOWN','Неизвестная сезонная фаза.');
 const sections=Array.isArray(s.sections)?s.sections:[],queens=Array.isArray(s.queens)?s.queens:sections.flatMap(x=>x&&x.queen?[x.queen]:[]),queenById=new Map(queens.filter(q=>q&&typeof q.id==='string'&&q.id.trim()).map(q=>[q.id,q]));
 const divided=['DIVIDED_3_SECTIONS','HONEY_BODIES_INSTALLED','HONEY_COLLECTION','END_OF_SEASON','AUTUMN_PREP','ALT_WINTERING','ALT_WINTERING_SPRING'].includes(s.phase);
 if(divided&&sections.length!==3)add('SECTION_COUNT','В разделённом состоянии должно быть ровно три секции.');
 if(divided&&sections.length===3){
  const seenBodyIds=new Set(),seenQueenIds=new Set();
  if(queens.length!==3)add('SECTION_QUEEN_COUNT','После разделения должны быть зарегистрированы ровно три матки.');
  if(queenById.size!==queens.length)add('SECTION_QUEEN_ID_DUPLICATE','Идентификаторы маток должны быть уникальными.');
  queens.forEach(q=>{if(!q||!['UNFERTILIZED','FERTILIZED'].includes(q.status))add('SECTION_QUEEN_STATUS','Статус каждой матки должен быть UNFERTILIZED или FERTILIZED.');if(q?.layingObserved!==undefined&&typeof q.layingObserved!=='boolean')add('SECTION_QUEEN_LAYING_OBSERVATION_INVALID','Признак наблюдения яйцекладки должен быть логическим значением.');});
  sections.forEach((section,index)=>{
   if(!section||typeof section!=='object'||Array.isArray(section)){add('SECTION_INVALID','Секция '+(index+1)+' имеет неверный формат.');return;}
   if(!Array.isArray(section.bodyIds))add('SECTION_BODY_IDS','Для секции '+(index+1)+' не указан список физических корпусов.');
   else{
    if(!section.bodyIds.length)add('SECTION_BODY_IDS_EMPTY','Секция '+(index+1)+' не содержит корпусов.');
    if(section.bodyIds.some(id=>typeof id!=='string'||!id.trim()))add('SECTION_BODY_ID_INVALID','Каждый корпус секции должен иметь непустой идентификатор.');
    section.bodyIds.forEach(id=>{if(typeof id==='string'&&id.trim()){if(seenBodyIds.has(id))add('SECTION_BODY_DUPLICATE','Физический корпус '+id+' назначен более чем одной секции.');seenBodyIds.add(id);}});
    if(s.phase!=='ALT_WINTERING'&&s.phase!=='ALT_WINTERING_SPRING'&&section.bodyIds.length!==2)add('OP04_BODY_COUNT','После OP-04 в каждой секции должно быть ровно два шестирамочных корпуса.');
   }
   if(typeof section.queenId!=='string'||!section.queenId.trim())add('SECTION_QUEEN_ID','Для секции '+(index+1)+' не указана матка.');
   else{
    if(seenQueenIds.has(section.queenId))add('SECTION_QUEEN_DUPLICATE','Одна матка не может быть назначена нескольким секциям.');
    seenQueenIds.add(section.queenId);
    if(!queenById.has(section.queenId))add('SECTION_QUEEN_REFERENCE','Матка секции '+(index+1)+' отсутствует в реестре маток.');
   }
   const isolation=section.isolation??s.isolation;
   if(!['CONNECTED','MESH_ISOLATED'].includes(isolation))add('SECTION_ISOLATION','Для секции '+(index+1)+' укажи CONNECTED или MESH_ISOLATED.');
   
  });
  const sectionIndexes=sections.map(x=>x&&x.index);if(new Set(sectionIndexes).size!==3||sectionIndexes.some(x=>![1,2,3].includes(x)))add('SECTION_INDEX','Индексы секций должны быть уникальными: 1, 2 и 3.');
  const completedOps=new Set((Array.isArray(s.operations)?s.operations:[]).filter(x=>x&&x.status==='DONE').map(x=>x.operationId));
  if(completedOps.has('OP-04')){
   const expectedConnections=[[1,2],[2,3]];
   const connections=Array.isArray(s.technicalConnections)?s.technicalConnections:[];
   if(connections.length!==2)add('R3_CONNECTION_COUNT','Для трёх секций должны быть описаны два межсекционных соединения.');
   expectedConnections.forEach(([from,to])=>{
    const connection=connections.find(x=>x&&x.fromSectionIndex===from&&x.toSectionIndex===to);
    if(!connection){add('R3_CONNECTION_MISSING','Не описано техническое соединение секций '+from+' и '+to+'.');return;}
    if(connection.queenExcluderLayers!==2)add('R3_QUEEN_EXCLUDER_LAYERS','Между секциями '+from+' и '+to+' должны быть две геннемановские решётки.');
    if(connection.bufferCorridorPresent!==true)add('R3_BUFFER_CORRIDOR_MISSING','Между двумя геннемановскими решётками секций '+from+' и '+to+' должен быть подтверждён буферный коридор.');
   });
   const keys=connections.map(x=>x&&x.fromSectionIndex+'-'+x.toSectionIndex);
   if(new Set(keys).size!==keys.length)add('R3_CONNECTION_DUPLICATE','Межсекционные соединения не должны повторяться.');
  }
  const lateSummer=completedOps.has('OP-09');
  if(!completedOps.has('OP-06')&&!lateSummer){
  SPEC.entranceAssignment.forEach(e=>{const x=sections.find(y=>y&&y.index===e.sectionIndex);if(!x)return;if(x.openEntrance!==e.openEntrance)add('R1_ENTRANCE_TYPE','Для секции '+e.sectionIndex+' предусмотрен леток '+e.openEntrance+'.');if(x.entranceState!==e.state)add('R1_ENTRANCE_STATE','Для летка '+e.openEntrance+' секции '+e.sectionIndex+' ожидается '+e.state+'.');});
  const types=sections.map(x=>x&&x.openEntrance).filter(Boolean);if(new Set(types).size!==3)add('R1_DUPLICATE_ENTRANCE','В трёх секциях не могут быть открыты одинаковые типы летков.');
  }
  if(lateSummer)sections.forEach(x=>{if(x&&x.openEntrance!=='ROUND_BOTTOM')add('OP09_ENTRANCE','После OP-09 в каждой секции должен быть открыт круглый леток.');if(x&&x.openEntrancePosition!=='LOWER_NEST_BODY')add('OP09_ENTRANCE_POSITION','Леток OP-09 должен находиться в нижнем гнездовом корпусе.');});
 }
 const unfert=queens.filter(x=>x&&x.status==='UNFERTILIZED');
 if(s.isolation==='MESH_ISOLATED'||sections.some(x=>(x?.isolation??s.isolation)==='MESH_ISOLATED')){
  const plugs=Array.isArray(s.meshPlugs)?s.meshPlugs:[];
  const required=Number.isInteger(s.requiredMeshPlugCount)&&s.requiredMeshPlugCount>=0?s.requiredMeshPlugCount:null;
  const installed=plugs.filter(p=>p&&p.installed===true&&p.position==='OVER_QUEEN_EXCLUDER'&&p.openingDiameterMm===50);
  const plugIds=installed.map(p=>p.id).filter(Boolean);
  if(new Set(plugIds).size!==plugIds.length)add('R2_MESH_PLUG_DUPLICATE','Обнаружены повторяющиеся идентификаторы сетчатых заглушек.');
  if(required===null)add('R2_PLUG_COUNT_UNDEFINED','Для проверки заглушек укажи requiredMeshPlugCount: количество отверстий 50 мм во всех корпусах секций.');
  else if(installed.length<required)add('R2_MESH_PLUG_MISSING','Установлено заглушек '+installed.length+' из необходимых '+required+' для отверстий 50 мм.');
  else if(installed.length>required)add('R2_MESH_PLUG_EXTRA','Установлено заглушек больше, чем отверстий 50 мм: '+installed.length+' вместо '+required+'.');
  if(!unfert.length)add('R2_ISOLATION_REVIEW','Все зарегистрированные матки плодные, но секции изолированы.','warning');
 }
 const operationRows=Array.isArray(s.operations)?s.operations:[];
 const done=new Set(operationRows.filter(x=>x&&x.status==='DONE').map(x=>x.operationId));
 const sectionIsolation=sections.map(x=>(x?.isolation??s.isolation));
 const installedMeshPlugCount=(Array.isArray(s.meshPlugs)?s.meshPlugs:[]).filter(p=>p&&p.installed===true&&p.position==='OVER_QUEEN_EXCLUDER'&&p.openingDiameterMm===50).length;
 const dividedPhases=['DIVIDED_3_SECTIONS','HONEY_BODIES_INSTALLED','HONEY_COLLECTION','END_OF_SEASON','AUTUMN_PREP','ALT_WINTERING','ALT_WINTERING_SPRING'];
 const allowedPhases={
  'OP-04':dividedPhases,
  'OP-05':dividedPhases,
  'OP-06':dividedPhases,
  'OP-07':['HONEY_BODIES_INSTALLED','HONEY_COLLECTION'],
  'OP-08':['HONEY_COLLECTION'],
  'OP-09':['END_OF_SEASON','AUTUMN_PREP'],
  'OP-10':['AUTUMN_PREP'],
  'OP-11':['WINTER_ASSEMBLY'],
  'OP-12':['ALT_WINTERING'],
  'OP-13':['ALT_WINTERING_SPRING']
 };
 Object.entries(allowedPhases).forEach(([operationId,phases])=>{
  if(done.has(operationId)&&!phases.includes(s.phase))add('OPERATION_PHASE_MISMATCH',operationId+' нельзя отметить выполненной в фазе '+String(s.phase||'не указана')+'. Допустимые фазы: '+phases.join(', ')+'.');
 });
 if(done.has('OP-05')&&!done.has('OP-04'))add('OP05_PREREQUISITE','OP-05 нельзя выполнить до разделения OP-04.');
 if(done.has('OP-05')&&!done.has('OP-06')&&sectionIsolation.some(x=>x!=='MESH_ISOLATED'))add('OP05_ISOLATION_STATE','После OP-05 все три секции должны быть изолированы металлическими сетчатыми заглушками.');
 if(done.has('OP-06')){
  if(!done.has('OP-05'))add('OP06_PREREQUISITE','OP-06 нельзя выполнить до OP-05.');
  if(queens.length!==3||unfert.length)add('OP06_QUEEN_STATUS','OP-06 допустима только при наличии трёх зарегистрированных плодных маток.');
  if(options.requireLayingObservation===true&&queens.some(q=>q?.layingObserved!==true))add('OP06_EGG_LAYING_NOT_OBSERVED','OP-06 нельзя завершить, пока для каждой из трёх маток не подтверждено фактическое начало яйцекладки.');
  if(sectionIsolation.some(x=>x!=='CONNECTED'))add('OP06_ISOLATION_STATE','После OP-06 все три секции должны быть возвращены в состояние CONNECTED.');
  if(installedMeshPlugCount>0)add('OP06_MESH_PLUGS_REMAIN','После OP-06 все металлические сетчатые заглушки должны быть сняты.');
 }
 if(done.has('OP-07')&&!done.has('OP-06'))add('OP07_PREREQUISITE','Медовые корпуса нельзя устанавливать до завершения OP-06.');
 if(done.has('OP-08')&&!done.has('OP-07'))add('OP08_PREREQUISITE','Отбор мёда OP-08 возможен только после постановки медовых корпусов OP-07.');
 if(done.has('OP-11')&&done.has('OP-12'))add('R6_WINTERING_EXCLUSIVE','OP-11 и OP-12 взаимоисключающие.');
 if(done.has('OP-14')&&c.honeyBodiesCount!==2)add('OP14_EARLY_HONEY_BODY_COUNT','В сценарии раннего медосбора по источнику устанавливаются только два медовых корпуса.');
 
 if(['HONEY_BODIES_INSTALLED','HONEY_COLLECTION'].includes(s.phase)||done.has('OP-07')){
  if(![2,4].includes(c.honeyBodiesCount))add('R4_HONEY_BODY_COUNT','Для постановки медовых корпусов укажи подтверждённое общее количество: 2 или 4.');
  const grids=Array.isArray(s.honeyQueenExcluders)?s.honeyQueenExcluders:[];
  if(grids.length!==2)add('R4_QUEEN_EXCLUDER_COUNT','Для этой конструкции нужны ровно две большие разделительные решётки.');
  const upperBodyIds=new Set();
  sections.forEach((section,index)=>{
   if(!section||typeof section.upperBodyId!=='string'||!section.upperBodyId.trim()||!Array.isArray(section.bodyIds)||!section.bodyIds.includes(section.upperBodyId)){
    add('R4_UPPER_NEST_BODY_REFERENCE','Для секции '+(index+1)+' укажи upperBodyId — ID верхнего шестирамочного корпуса из bodyIds.');
   }else upperBodyIds.add(section.upperBodyId);
  });
  if(sections.length===3&&upperBodyIds.size!==3)add('R4_UPPER_NEST_BODY_DUPLICATE','Верхние шестирамочные корпуса трёх секций должны иметь разные ID.');
  const gridIds=new Set(),fullBodies=[],halfBodies=[];
  grids.forEach((grid,index)=>{
   if(!grid||typeof grid!=='object'||Array.isArray(grid)){add('R4_EXCLUDER_INVALID','Большая решётка '+(index+1)+' имеет неверный формат.');return;}
   if(typeof grid.id!=='string'||!grid.id.trim()||gridIds.has(grid.id))add('R4_EXCLUDER_ID','У каждой большой решётки должен быть уникальный непустой ID.');
   else gridIds.add(grid.id);
   const coverage=Array.isArray(grid.coverage)?grid.coverage:[];
   if(coverage.length!==2||coverage.some(x=>!x||typeof x.bodyId!=='string'||!['FULL','HALF'].includes(x.coverage))||coverage.filter(x=>x.coverage==='FULL').length!==1||coverage.filter(x=>x.coverage==='HALF').length!==1||new Set(coverage.map(x=>x.bodyId)).size!==2){
    add('R4_EXCLUDER_FOOTPRINT','Каждая большая решётка должна перекрывать ровно два разных верхних корпуса: один FULL и один HALF.');
    return;
   }
   const full=coverage.find(x=>x.coverage==='FULL').bodyId,half=coverage.find(x=>x.coverage==='HALF').bodyId;
   if(!upperBodyIds.has(full)||!upperBodyIds.has(half))add('R4_EXCLUDER_BODY_REFERENCE','Решётка должна ссылаться только на верхние шестирамочные корпуса трёх секций.');
   fullBodies.push(full);halfBodies.push(half);
  });
  if(grids.length===2&&fullBodies.length===2&&halfBodies.length===2){
   if(new Set(fullBodies).size!==2)add('R4_EXCLUDER_FULL_OVERLAP','Две решётки должны полностью перекрывать разные крайние верхние корпуса.');
   if(halfBodies[0]!==halfBodies[1])add('R4_EXCLUDER_SHARED_CENTER','Половины двух решёток должны приходиться на один и тот же средний верхний корпус.');
   const firstUpper=sections.find(section=>section?.index===1)?.upperBodyId;
   const middleUpper=sections.find(section=>section?.index===2)?.upperBodyId;
   const thirdUpper=sections.find(section=>section?.index===3)?.upperBodyId;
   if(!new Set(fullBodies).has(firstUpper)||!new Set(fullBodies).has(thirdUpper)||halfBodies[0]!==middleUpper)add('R4_EXCLUDER_SECTION_ALIGNMENT','Полные части решёток должны приходиться на верхние корпуса секций 1 и 3, а обе половины — на верхний корпус секции 2.');
   if(new Set([...fullBodies,...halfBodies]).size!==3)add('R4_EXCLUDER_THREE_BODY_FOOTPRINT','Две решётки вместе должны покрывать ровно три верхних шестирамочных корпуса.');
  }
 }

 const winteringMode=c.winteringMode??s.winteringMode;
 if(c.winteringMode!==undefined&&s.winteringMode!==undefined&&c.winteringMode!==s.winteringMode)add('WINTERING_MODE_CONFLICT','Режим зимовки в config и корне состояния не совпадает.');
 if(winteringMode&&!['COMBINED','ALTERNATIVE_DIAPHRAGMS'].includes(winteringMode))add('WINTERING_MODE','Неизвестный способ зимовки.');
 if(s.phase==='WINTER_ASSEMBLY'||done.has('OP-11')){
  if(s.winterNestBodies!==3)add('R5_WINTER_NEST_BODIES','Для основной зимовки требуется фактическая сборка одного гнезда на трёх корпусах.');
  if(winteringMode!=='COMBINED')add('R5_WINTERING_MODE','Основная зимняя сборка требует выбранного режима COMBINED.');
 }
 if(s.phase==='ALT_WINTERING'||done.has('OP-12')){
  if(winteringMode!=='ALTERNATIVE_DIAPHRAGMS')add('R7_WINTERING_MODE','Для альтернативной зимовки должен быть выбран режим ALTERNATIVE_DIAPHRAGMS.');
  if(!Array.isArray(s.diaphragms)||s.diaphragms.length!==2||s.diaphragms.some(x=>!x||x.hasMesh!==true))add('R7_DIAPHRAGMS','Для альтернативной зимовки нужны две сетчатые диафрагмы.');
  if(!Array.isArray(s.sections)||s.sections.length!==3){add('R7_SECTION_COUNT','Для альтернативной зимовки нужны три семьи.');}
  else{
   const counts=s.sections.map(x=>Array.isArray(x?.bodyIds)?x.bodyIds.length:0).sort((a,b)=>a-b);
   if(counts.join(',')!=='1,1,2')add('ALT_WINTER_BODY_LAYOUT','При альтернативной зимовке одна семья занимает два корпуса, две другие — по одному.');
  }
 }
 return {valid:errors.length===0,errors,warnings};
}
function validatePhysicalR4(record,apiaryState,add){
 const state=record?.state;
 const operations=Array.isArray(state?.operations)?state.operations:[];
 const needsR4=['HONEY_BODIES_INSTALLED','HONEY_COLLECTION'].includes(state?.phase)||operations.some(x=>x?.operationId==='OP-07'&&x.status==='DONE');
 if(!needsR4)return;
 if(!apiaryState||typeof apiaryState!=='object'||Array.isArray(apiaryState)){
  add('TECH_R4_PHYSICAL_CONTEXT_REQUIRED',{id:record.id});
  return;
 }
 const layout=apiaryState.layouts?.[record.hiveId];
 const layoutBodyIds=new Set(Object.values(layout?.corpusIds||{}));
 const bodyInventory=apiaryState.equipmentInventory?.bodies;
 const bodies=bodyInventory&&typeof bodyInventory==='object'&&!Array.isArray(bodyInventory)?bodyInventory:{};
 for(const section of Array.isArray(state.sections)?state.sections:[]){
  for(const bodyId of Array.isArray(section?.bodyIds)?section.bodyIds:[]){
   if(!layoutBodyIds.has(bodyId))add('TECH_R4_SECTION_BODY_LAYOUT_MISSING',{id:record.id,bodyId});
   if(!Object.prototype.hasOwnProperty.call(bodies,bodyId)||!bodies[bodyId]||bodies[bodyId].id!==bodyId)add('TECH_R4_SECTION_BODY_INVENTORY_MISSING',{id:record.id,bodyId});
  }
 }
 const items=apiaryState.equipmentInventory?.items;
 const itemMap=items&&typeof items==='object'&&!Array.isArray(items)?items:{};
 const grids=Array.isArray(state.honeyQueenExcluders)?state.honeyQueenExcluders:[];
 const usedItemIds=new Set();
 const footprintKey=value=>Array.isArray(value)?value.map(x=>x&&typeof x.bodyId==='string'&&typeof x.coverage==='string'?x.bodyId+'|'+x.coverage:'INVALID').sort().join(';'):'';
 grids.forEach((grid,index)=>{
  const itemId=typeof grid?.itemId==='string'?grid.itemId.trim():'';
  if(!itemId){add('TECH_R4_ITEM_ID_REQUIRED',{id:record.id,index});return;}
  if(usedItemIds.has(itemId)){add('TECH_R4_ITEM_DUPLICATE',{id:record.id,itemId});return;}
  usedItemIds.add(itemId);
  const item=itemMap[itemId];
  if(!item||item.id!==itemId){add('TECH_R4_ITEM_MISSING',{id:record.id,itemId});return;}
  if(item.kind!=='honeyQueenExcluder')add('TECH_R4_ITEM_KIND',{id:record.id,itemId,kind:item.kind??null});
  if(item.condition!=='good')add('TECH_R4_ITEM_CONDITION',{id:record.id,itemId,condition:item.condition??null});
  if(item.location?.type!=='hive')add('TECH_R4_ITEM_NOT_INSTALLED',{id:record.id,itemId});
  else if(item.location.hiveId!==record.hiveId)add('TECH_R4_ITEM_HIVE_MISMATCH',{id:record.id,itemId,hiveId:item.location.hiveId??null});
  if(footprintKey(item.location?.footprint)!==footprintKey(grid.coverage))add('TECH_R4_ITEM_FOOTPRINT_MISMATCH',{id:record.id,itemId});
 });
}
function validateStoredRecords(records,hives,apiaryState){
 const errors=[],add=(code,details)=>errors.push({code,details});
 if(!Array.isArray(records))return {valid:false,errors:[{code:'TECH_RECORDS_NOT_ARRAY',details:null}]};
 if(!Array.isArray(hives))return {valid:false,errors:[{code:'TECH_HIVE_LIST_NOT_ARRAY',details:null}]};
 const hiveIds=new Set(hives.filter(h=>h&&typeof h.id==='string'&&h.id.trim()).map(h=>h.id));
 const seenIds=new Set(),seenHives=new Set();
 const operationDay=value=>typeof value==='string'?parseDate(value.slice(0,10)):null;
 const dayDifference=(from,to)=>Math.round((to.getTime()-from.getTime())/DAY);
 records.forEach((record,index)=>{
  if(!record||typeof record!=='object'||Array.isArray(record)){add('TECH_RECORD_INVALID',{index});return;}
  if(typeof record.id!=='string'||!record.id.trim()){add('TECH_RECORD_ID_INVALID',{index});return;}
  if(seenIds.has(record.id))add('TECH_RECORD_ID_DUPLICATE',{id:record.id,index});
  seenIds.add(record.id);
  if(typeof record.hiveId!=='string'||!record.hiveId.trim()){add('TECH_RECORD_HIVE_INVALID',{id:record.id});return;}
  if(!hiveIds.has(record.hiveId))add('TECH_RECORD_HIVE_MISSING',{id:record.id,hiveId:record.hiveId});
  const linkedHive=hives.find(h=>h&&h.id===record.hiveId);
  const linkedProfileId=linkedHive?.profile?.id||linkedHive?.profileId||null;
  if(record.hiveProfileId!==SPEC.id||linkedProfileId!==SPEC.id)add('TECH_HIVE_PROFILE_MISMATCH',{id:record.id,hiveProfileId:record.hiveProfileId??null,linkedProfileId});
  if(seenHives.has(record.hiveId))add('TECH_RECORD_HIVE_DUPLICATE',{hiveId:record.hiveId});
  seenHives.add(record.hiveId);
  if(![SPEC.version,'1.6.0','1.5.0','1.4.0','1.3.0','1.2.0'].includes(record.specVersion))add('TECH_RECORD_SPEC_VERSION',{id:record.id,specVersion:record.specVersion??null});
  if(typeof record.createdAt!=='string'||!Number.isFinite(Date.parse(record.createdAt)))add('TECH_RECORD_CREATED_AT_INVALID',{id:record.id});
  if(typeof record.updatedAt!=='string'||!Number.isFinite(Date.parse(record.updatedAt)))add('TECH_RECORD_UPDATED_AT_INVALID',{id:record.id});
  if(!record.state||typeof record.state!=='object'||Array.isArray(record.state)){add('TECH_RECORD_STATE_INVALID',{id:record.id});return;}
  if(!SPEC.phases.includes(record.state.phase))add('TECH_RECORD_PHASE_INVALID',{id:record.id,phase:record.state.phase??null});
  if(record.state.operations!==undefined){
   if(!Array.isArray(record.state.operations))add('TECH_OPERATIONS_NOT_ARRAY',{id:record.id});
   else{
    const seenOperations=new Set(),operationById=new Map();
    record.state.operations.forEach((operation,operationIndex)=>{
     if(!operation||typeof operation!=='object'||Array.isArray(operation)){add('TECH_OPERATION_INVALID',{id:record.id,index:operationIndex});return;}
     if(!SPEC.operations.some(item=>item.id===operation.operationId))add('TECH_OPERATION_UNKNOWN',{id:record.id,operationId:operation.operationId??null});
     if(seenOperations.has(operation.operationId))add('TECH_OPERATION_DUPLICATE',{id:record.id,operationId:operation.operationId});
     seenOperations.add(operation.operationId);operationById.set(operation.operationId,operation);
     if(!['PENDING','SCHEDULED','DONE','SKIPPED','FAILED'].includes(operation.status))add('TECH_OPERATION_STATUS_INVALID',{id:record.id,operationId:operation.operationId,status:operation.status??null});
     const definition=SPEC.operations.find(item=>item.id===operation.operationId);
     const note=typeof operation.note==='string'?operation.note.trim():'';
     if(operation.note!==undefined&&operation.note!==null&&typeof operation.note!=='string')add('TECH_OPERATION_NOTE_INVALID',{id:record.id,operationId:operation.operationId});
     if(note.length>1000)add('TECH_OPERATION_NOTE_TOO_LONG',{id:record.id,operationId:operation.operationId});
     if(operation.status==='SCHEDULED'&&!parseDate(operation.plannedAt))add('TECH_OPERATION_PLANNED_DATE_REQUIRED',{id:record.id,operationId:operation.operationId});
     if(operation.status==='DONE'&&!operationDay(operation.completedAt))add('TECH_OPERATION_COMPLETION_DATE_REQUIRED',{id:record.id,operationId:operation.operationId});
     if(operation.status==='SKIPPED'&&definition&&!definition.optional)add('TECH_OPERATION_SKIP_REQUIRED',{id:record.id,operationId:operation.operationId});
     if((operation.status==='SKIPPED'||operation.status==='FAILED')&&!note)add('TECH_OPERATION_REASON_REQUIRED',{id:record.id,operationId:operation.operationId});
     if(operation.plannedAt!==undefined&&operation.plannedAt!==null&&!parseDate(operation.plannedAt))add('TECH_OPERATION_DATE_INVALID',{id:record.id,operationId:operation.operationId,field:'plannedAt'});
     if(operation.completedAt!==undefined&&operation.completedAt!==null&&!operationDay(operation.completedAt))add('TECH_OPERATION_DATE_INVALID',{id:record.id,operationId:operation.operationId,field:'completedAt'});
    });
    const op04=operationById.get('OP-04'),op05=operationById.get('OP-05'),op06=operationById.get('OP-06');
     if(op04?.status==='DONE'&&record.specVersion===SPEC.version&&op04.additionalBottomsInstalled!==true)add('TECH_OP04_BOTTOMS_CONFIRMATION_REQUIRED',{id:record.id});
    if(op05?.status==='DONE'){
     const start=operationDay(op04?.completedAt),finish=operationDay(op05.completedAt);
     if(op04?.status!=='DONE'||!start||!finish)add('TECH_OP05_COMPLETION_DATE_REQUIRED',{id:record.id});
     else{const days=dayDifference(start,finish);if(days<8||days>11)add('TECH_OP05_DATE_WINDOW',{id:record.id,days,expected:[8,11]});}
    }
    if(op06?.status==='DONE'){
     const start=operationDay(op04?.completedAt),finish=operationDay(op06.completedAt);
     if(op04?.status!=='DONE'||!start||!finish)add('TECH_OP06_COMPLETION_DATE_REQUIRED',{id:record.id});
     else{const days=dayDifference(start,finish);if(days<20||days>21)add('TECH_OP06_DATE_WINDOW',{id:record.id,days,expected:[20,21]});}
    }
    const op02=operationById.get('OP-02');
    if(op02?.status==='DONE'){
     const feeding=op02.feeding&&typeof op02.feeding==='object'&&!Array.isArray(op02.feeding)?op02.feeding:null;
     const feedStart=parseDate(feeding?.startDate),feedEnd=parseDate(feeding?.endDate);
     if(!feedStart||!feedEnd)add('TECH_OP02_FEEDING_DATES_REQUIRED',{id:record.id});
     else{
      const duration=dayDifference(feedStart,feedEnd)+1;
      if(feedEnd<feedStart||duration<12||duration>15)add('TECH_OP02_DURATION',{id:record.id,duration,expected:[12,15]});
      if(op02.completedAt!==feeding.endDate)add('TECH_OP02_COMPLETION_DATE_MISMATCH',{id:record.id});
     }
     const feedingAmount=feeding?.gramsPerColonyPerDay??feeding?.portionGrams;
     if(!Number.isFinite(feedingAmount)||feedingAmount<100||feedingAmount>200)add('TECH_OP02_SYRUP_AMOUNT',{id:record.id,expected:[100,200],field:'gramsPerColonyPerDay'});
     if(feeding?.sugarParts!==2||feeding?.waterParts!==1)add('TECH_OP02_SYRUP_RATIO',{id:record.id,expected:{sugar:2,water:1}});
    }
   }
  }
  const result=validateHiveState(record.state,{requireLayingObservation:record.specVersion===SPEC.version||record.state.validationRulesVersion===SPEC.version});
  result.errors.forEach(error=>add('TECH_RECORD_STATE_'+error.code,{id:record.id,message:error.message}));
  validatePhysicalR4(record,apiaryState,add);
 });
 return {valid:errors.length===0,errors};
}
function getOperation(id){return SPEC.operations.find(x=>x.id===id)||null;}
function transitionOperation(record,operationId,draft,records,hives,apiaryState){
 const errors=[],add=(code,message)=>errors.push({code,message});
 if(!record||typeof record!=='object'||Array.isArray(record)){add('OPERATION_RECORD_INVALID','Карточка техпроцесса не найдена или повреждена.');return {valid:false,errors};}
 const definition=getOperation(operationId);
 if(!definition){add('OPERATION_UNKNOWN','Неизвестная операция.');return {valid:false,errors};}
 if(!draft||typeof draft!=='object'||Array.isArray(draft)){add('OPERATION_DRAFT_INVALID','Нет данных изменения операции.');return {valid:false,errors};}
 const statuses=['PENDING','SCHEDULED','DONE','SKIPPED','FAILED'];
 if(!statuses.includes(draft.status)){add('OPERATION_STATUS_INVALID','Недопустимый статус операции.');return {valid:false,errors};}
 if(draft.status==='SKIPPED'&&!definition.optional){add('OPERATION_SKIP_REQUIRED','Обязательную операцию нельзя отметить как пропущенную.');return {valid:false,errors};}
 const note=typeof draft.note==='string'?draft.note.trim():'';
 if(note.length>1000){add('OPERATION_NOTE_TOO_LONG','Комментарий не должен превышать 1000 символов.');return {valid:false,errors};}
 if((draft.status==='SKIPPED'||draft.status==='FAILED')&&!note){add('OPERATION_REASON_REQUIRED','Для пропущенной или невыполненной операции укажи причину.');return {valid:false,errors};}
 const plannedAt=draft.plannedAt===''||draft.plannedAt==null?null:draft.plannedAt;
 const completedAt=draft.completedAt===''||draft.completedAt==null?null:draft.completedAt;
 if(plannedAt!==null&&!parseDate(plannedAt)){add('OPERATION_PLANNED_DATE_INVALID','Укажи существующую дату планирования.');return {valid:false,errors};}
 if(draft.status==='SCHEDULED'&&!plannedAt){add('OPERATION_PLANNED_DATE_REQUIRED','Для запланированной операции укажи дату.');return {valid:false,errors};}
 if(draft.status==='DONE'&&!parseDate(completedAt)){add('OPERATION_COMPLETION_DATE_REQUIRED','Для выполненной операции укажи фактическую дату выполнения.');return {valid:false,errors};}
  if(operationId==='OP-04'&&draft.status==='DONE'&&draft.additionalBottomsInstalled!==true){add('OP04_ADDITIONAL_BOTTOMS_CONFIRMATION_REQUIRED','Подтверди фактическую установку двух дополнительных доньев (всего три).');return {valid:false,errors};}
 const updatedAt=typeof draft.updatedAt==='string'&&Number.isFinite(Date.parse(draft.updatedAt))?draft.updatedAt:null;
 if(!updatedAt){add('OPERATION_UPDATED_AT_INVALID','Не удалось подтвердить время изменения операции.');return {valid:false,errors};}
 if(!Array.isArray(records)||!Array.isArray(hives)){add('OPERATION_CONTEXT_INVALID','Не удалось проверить связанные карточки и ульи.');return {valid:false,errors};}
 const matches=records.filter(item=>item&&item.id===record.id);
 if(matches.length!==1){add('OPERATION_RECORD_REFERENCE','Карточка должна однозначно присутствовать в реестре техпроцессов.');return {valid:false,errors};}
 const operations=record.state&&Array.isArray(record.state.operations)?record.state.operations:null;
 if(!operations){add('OPERATION_LIST_MISSING','Список операций не инициализирован.');return {valid:false,errors};}
 const operationMatches=operations.filter(item=>item&&item.operationId===operationId);
 if(operationMatches.length!==1){add('OPERATION_REFERENCE_INVALID','Операция должна присутствовать в списке ровно один раз.');return {valid:false,errors};}
 const nextRecord=JSON.parse(JSON.stringify(record));
 const target=nextRecord.state.operations.find(item=>item&&item.operationId===operationId);
 if(operationId==='OP-06'&&draft.status==='DONE')nextRecord.state.validationRulesVersion=SPEC.version;
 target.status=draft.status;
 target.plannedAt=plannedAt;
 target.completedAt=draft.status==='DONE'?completedAt:null;
 target.note=note||null;
  if(operationId==='OP-04'){
   target.additionalBottomsInstalled=draft.status==='DONE'?true:false;
   if(draft.status==='DONE')nextRecord.specVersion=SPEC.version;
  }
 if(operationId==='OP-02'&&draft.status==='DONE'){
  const feeding=draft.feeding&&typeof draft.feeding==='object'&&!Array.isArray(draft.feeding)?draft.feeding:{};
  
  target.feeding={startDate:feeding.startDate||null,endDate:feeding.endDate||null,gramsPerColonyPerDay:Number(feeding.gramsPerColonyPerDay??feeding.portionGrams),sugarParts:Number(feeding.sugarParts),waterParts:Number(feeding.waterParts)};
 }else if(operationId==='OP-02')target.feeding=null;
 target.updatedAt=updatedAt;
 nextRecord.updatedAt=updatedAt;
 const nextRecords=records.map(item=>item&&item.id===record.id?nextRecord:item);
 const validation=validateStoredRecords(nextRecords,hives,apiaryState);
 if(!validation.valid)return {valid:false,errors:validation.errors.map(item=>({code:item.code,message:item.details?.message||'Изменение нарушает правила технологического процесса.',details:item.details||null}))};
 return {valid:true,errors:[],warnings:validateHiveState(nextRecord.state).warnings,record:nextRecord,records:nextRecords};
}
window.PasekaSectionalTechProcess=Object.freeze({SPEC,parseDate,shiftDate,buildOperationSchedule,validateHiveState,validateStoredRecords,transitionOperation,getOperation});
})();