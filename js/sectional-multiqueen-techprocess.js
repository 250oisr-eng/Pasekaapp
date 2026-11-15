(() => {
'use strict';
const SPEC=Object.freeze({
 id:'sectional-multiqueen-v1',version:'1.2.0',language:'ru',
 sectionsAtDivision:3,nestFrames:6,honeyFrames:10,frameHeightMm:180,honeyBodiesDefault:2,honeyBodiesMax:4,
 geometry:Object.freeze({
  nestBodiesPerSectionAtDivision:2,frameHeightMm:180,bodyHeightMm:'PROFILE_DEFINED_SEPARATELY',technicalOpeningDiameterMm:50,
  permanentQueenExcludersInTechnicalOpenings:true,queenExcluderLayersPerConnection:2,
  technicalOpeningBufferCorridorRequired:true,metalMeshPlugsPerTechnicalOpeningPerBody:1,
  honeyQueenExcluders:'ONE_PER_SECTION_WHEN_HONEY_BODIES_INSTALLED',
  honeyBodiesCountScope:'WHOLE_HIVE',honeyBodiesExpansion:[2,4],
  syrupSugarParts:2,syrupWaterParts:1,syrupGramsPerDayPerColony:[100,200],
  proteinFeedRule:'REFILL_AS_CONSUMED'
 }),
 phases:['WINTER','POST_WINTER','SPRING_DEVELOPMENT','PRE_DIVISION','DIVIDED_3_SECTIONS','HONEY_BODIES_INSTALLED','HONEY_COLLECTION','END_OF_SEASON','AUTUMN_PREP','WINTER_ASSEMBLY','ALT_WINTERING','ALT_WINTERING_SPRING'],
 operations:[
 {id:'OP-01',title:'Весеннее открытие летков',optional:false},
 {id:'OP-02',title:'Весенняя подкормка',optional:false,durationDays:[12,15],syrupGramsPerDayPerColony:[100,200],syrupRatio:{sugar:2,water:1},proteinFeed:'AS_CONSUMED'},
 {id:'OP-03',title:'Перестановка корпусов (верх ↔ низ)',optional:true,recommended:true,offsetFrom:'OP-04',offsetDays:[-7,-5]},
 {id:'OP-04',title:'Разделение улья на 3 секции',optional:false,nestBodiesPerSection:2},
 {id:'OP-05',title:'Установка металлических сетчатых заглушек',optional:false,offsetFrom:'OP-04',offsetDays:[8,11],openingDiameterMm:50,scope:'EVERY_TECHNICAL_OPENING_IN_EVERY_BODY'},
 {id:'OP-06',title:'Снятие металлических сетчатых заглушек',optional:false,offsetFrom:'OP-04',offsetDays:[20,21],condition:'ALL_THREE_QUEENS_FERTILIZED',afterRemoval:'OPEN_ALL_ENTRANCES'},
 {id:'OP-07',title:'Постановка медовых корпусов',optional:false,queenExcludersPerSection:1,honeyBodiesScope:'WHOLE_HIVE'},
 {id:'OP-08',title:'Отбор мёда',optional:false,offsetFrom:'HONEY_FLOW_MAIN_START',offsetDays:[15,15],retryDays:7},
 {id:'OP-09',title:'Сокращение летков',optional:false,period:'Вторая половина августа',openEntrance:'ROUND_BOTTOM',entrancePosition:'LOWER_NEST_BODY'},
 {id:'OP-10',title:'Осенняя подготовка',optional:false,period:'Середина–конец сентября'},
 {id:'OP-11',title:'Сборка гнезда на зиму: объединение',optional:false,exclusiveGroup:'wintering',winterNestBodies:3},
 {id:'OP-12',title:'Альтернативная зимовка: сохранение 3 семей',optional:true,exclusiveGroup:'wintering',diaphragms:2,sectionBodies:[2,1,1]},
 {id:'OP-13',title:'Весеннее развитие после альтернативной зимовки',optional:true,offsetFrom:'FIRST_FLIGHT',offsetDays:[40,50]},
 {id:'OP-14',title:'Получение раннего мёда',optional:true,exclusiveGroup:'altSpring',afterCompletion:'WINTER_ASSEMBLY_THEN_STANDARD_DIVISION'}
 ],
 entranceAssignment:[
 {sectionIndex:1,openEntrance:'FLAT_BOTTOM',state:'HALF_OPEN'},
 {sectionIndex:2,openEntrance:'ROUND_TOP',state:'OPEN'},
 {sectionIndex:3,openEntrance:'ROUND_BOTTOM',state:'OPEN'}
 ],
 unresolved:[
 'Точное число отверстий 50 мм на каждом корпусе определяется фактической конструкцией; заглушка требуется на каждое такое отверстие в каждом корпусе на время OP-05.',
 'OP-11 сохраняет прежний алгоритм выбора и установки корпусов; модель не должна заменять его произвольным выбором конкретных корпусов.',
 'В OP-09 открывается круглый леток именно в нижнем гнездовом корпусе каждой секции; это сезонное правило не меняет весеннее/после-разделительное назначение летков R1.'
 ]
});
const DAY=86400000,DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
function parseDate(v){if(typeof v!=='string'||!DATE_RE.test(v))return null;const p=v.split('-').map(Number),d=new Date(Date.UTC(p[0],p[1]-1,p[2]));return d.getUTCFullYear()===p[0]&&d.getUTCMonth()===p[1]-1&&d.getUTCDate()===p[2]?d:null;}
function fmt(d){return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');}
function shiftDate(v,n){const d=parseDate(v);if(!d||!Number.isInteger(n))throw new Error('Укажи корректную дату и целое число дней.');return fmt(new Date(d.getTime()+n*DAY));}
function buildOperationSchedule(a){const out=[];const add=(id,date,range,extra)=>{if(date)out.push(Object.assign({operationId:id,from:shiftDate(fmt(date),range[0]),to:shiftDate(fmt(date),range[1])},extra||{}));};const d=parseDate(a&&a['OP-04']);add('OP-03',d,[-7,-5],{optional:true});add('OP-05',d,[8,11],{scope:'EVERY_TECHNICAL_OPENING_IN_EVERY_BODY'});add('OP-06',d,[20,21],{condition:'ALL_THREE_QUEENS_FERTILIZED'});add('OP-08',parseDate(a&&a.HONEY_FLOW_MAIN_START),[15,15],{retryAfterDays:7});add('OP-13',parseDate(a&&a.FIRST_FLIGHT),[40,50],{optional:true});return out;}
function validateHiveState(s){
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
  queens.forEach(q=>{if(!q||!['UNFERTILIZED','FERTILIZED'].includes(q.status))add('SECTION_QUEEN_STATUS','Статус каждой матки должен быть UNFERTILIZED или FERTILIZED.');});
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
  const lateSummer=completedOps.has('OP-09');
  if(!completedOps.has('OP-06')&&!lateSummer){
  SPEC.entranceAssignment.forEach(e=>{const x=sections.find(y=>y&&y.index===e.sectionIndex);if(!x)return;if(x.openEntrance!==e.openEntrance)add('R1_ENTRANCE_TYPE','Для секции '+e.sectionIndex+' предусмотрен леток '+e.openEntrance+'.');if(x.entranceState&&x.entranceState!==e.state)add('R1_ENTRANCE_STATE','Для летка '+e.openEntrance+' секции '+e.sectionIndex+' ожидается '+e.state+'.');});
  const types=sections.map(x=>x&&x.openEntrance).filter(Boolean);if(new Set(types).size!==3)add('R1_DUPLICATE_ENTRANCE','В трёх секциях не могут быть открыты одинаковые типы летков.');
  }
  if(lateSummer)sections.forEach(x=>{if(x&&x.openEntrance!=='ROUND_BOTTOM')add('OP09_ENTRANCE','После OP-09 в каждой секции должен быть открыт круглый леток.');if(x&&x.openEntrancePosition!=='LOWER_NEST_BODY')add('OP09_ENTRANCE_POSITION','Леток OP-09 должен находиться в нижнем гнездовом корпусе.');});
 }
 const unfert=queens.filter(x=>x&&x.status==='UNFERTILIZED');
 const hasConnectedSection=sections.some(x=>(x?.isolation??s.isolation)==='CONNECTED');
 if((s.isolation==='CONNECTED'||hasConnectedSection)&&(queens.length!==3||unfert.length))add('R2_UNFERTILIZED_CONNECTED','Нельзя снимать изоляцию: должны быть зарегистрированы все три плодные матки.');
 if(s.isolation==='MESH_ISOLATED'||sections.some(x=>(x?.isolation??s.isolation)==='MESH_ISOLATED')){
  const plugs=Array.isArray(s.meshPlugs)?s.meshPlugs:[];
  const required=Number.isInteger(s.requiredMeshPlugCount)&&s.requiredMeshPlugCount>=0?s.requiredMeshPlugCount:null;
  const installed=plugs.filter(p=>p&&p.installed===true&&p.position==='OVER_QUEEN_EXCLUDER'&&p.openingDiameterMm===50);
  const plugIds=installed.map(p=>p.id).filter(Boolean);
  if(new Set(plugIds).size!==plugIds.length)add('R2_MESH_PLUG_DUPLICATE','Обнаружены повторяющиеся идентификаторы сетчатых заглушек.');
  if(required===null)add('R2_PLUG_COUNT_UNDEFINED','Для проверки заглушек укажи requiredMeshPlugCount: количество отверстий 50 мм во всех корпусах секций.');
  else if(installed.length<required)add('R2_MESH_PLUG_MISSING','Установлено заглушек '+installed.length+' из необходимых '+required+' для отверстий 50 мм.');
  if(!unfert.length)add('R2_ISOLATION_REVIEW','Все зарегистрированные матки плодные, но секции изолированы.','warning');
 }
 const done=new Set((Array.isArray(s.operations)?s.operations:[]).filter(x=>x&&x.status==='DONE').map(x=>x.operationId));
 if(done.has('OP-11')&&done.has('OP-12'))add('R6_WINTERING_EXCLUSIVE','OP-11 и OP-12 взаимоисключающие.');
 if(done.has('OP-13')&&done.has('OP-14'))add('R6_ALT_SPRING_EXCLUSIVE','OP-13 и OP-14 — разные сценарии после альтернативной зимовки; одновременно выбирать их нельзя.');
 if(done.has('OP-06')&&(unfert.length||queens.length!==3))add('OP06_QUEEN_STATUS','OP-06 допустима только при наличии трёх зарегистрированных плодных маток.');
 if(['HONEY_BODIES_INSTALLED','HONEY_COLLECTION'].includes(s.phase)){
  if(s.queenExcluderBetweenNestAndHoney!==true)add('R4_QUEEN_EXCLUDER','Перед медовыми корпусами нужна геннеманская решётка над гнездом каждой секции.');
  if(s.honeyQueenExcluderCount!==undefined&&s.honeyQueenExcluderCount!==3)add('R4_QUEEN_EXCLUDER_COUNT','Над гнездом требуется по одной большой решётке на каждую из трёх секций (всего 3).');
 }

 if(s.winteringMode==='ALTERNATIVE_DIAPHRAGMS'&&s.phase==='ALT_WINTERING'&&(!Array.isArray(s.diaphragms)||s.diaphragms.length!==2||s.diaphragms.some(x=>!x||x.hasMesh!==true)))add('R7_DIAPHRAGMS','Для альтернативной зимовки нужны две сетчатые диафрагмы.');
 if(s.winteringMode&&!['COMBINED','ALTERNATIVE_DIAPHRAGMS'].includes(s.winteringMode))add('WINTERING_MODE','Неизвестный способ зимовки.');
 if(s.phase==='ALT_WINTERING'&&Array.isArray(s.sections)&&s.sections.length===3){const counts=s.sections.map(x=>x&&x.bodyIds&&x.bodyIds.length);if(counts.some(x=>![1,2].includes(x))||counts.filter(x=>x===2).length!==1)add('ALT_WINTER_BODY_LAYOUT','При альтернативной зимовке одна семья занимает два корпуса, две другие — по одному.','warning');}
 return {valid:errors.length===0,errors,warnings};
}
function validateStoredRecords(records,hives){
 const errors=[],add=(code,details)=>errors.push({code,details});
 if(!Array.isArray(records))return {valid:false,errors:[{code:'TECH_RECORDS_NOT_ARRAY',details:null}]};
 if(!Array.isArray(hives))return {valid:false,errors:[{code:'TECH_HIVE_LIST_NOT_ARRAY',details:null}]};
 const hiveIds=new Set(hives.filter(h=>h&&typeof h.id==='string'&&h.id.trim()).map(h=>h.id));
 const seenIds=new Set(),seenHives=new Set();
 records.forEach((record,index)=>{
  if(!record||typeof record!=='object'||Array.isArray(record)){add('TECH_RECORD_INVALID',{index});return;}
  if(typeof record.id!=='string'||!record.id.trim()){add('TECH_RECORD_ID_INVALID',{index});return;}
  if(seenIds.has(record.id))add('TECH_RECORD_ID_DUPLICATE',{id:record.id,index});
  seenIds.add(record.id);
  if(typeof record.hiveId!=='string'||!record.hiveId.trim()){add('TECH_RECORD_HIVE_INVALID',{id:record.id});return;}
  if(!hiveIds.has(record.hiveId))add('TECH_RECORD_HIVE_MISSING',{id:record.id,hiveId:record.hiveId});
  if(seenHives.has(record.hiveId))add('TECH_RECORD_HIVE_DUPLICATE',{hiveId:record.hiveId});
  seenHives.add(record.hiveId);
  if(record.specVersion!==SPEC.version)add('TECH_RECORD_SPEC_VERSION',{id:record.id,specVersion:record.specVersion??null});
  if(typeof record.createdAt!=='string'||!Number.isFinite(Date.parse(record.createdAt)))add('TECH_RECORD_CREATED_AT_INVALID',{id:record.id});
  if(typeof record.updatedAt!=='string'||!Number.isFinite(Date.parse(record.updatedAt)))add('TECH_RECORD_UPDATED_AT_INVALID',{id:record.id});
  if(!record.state||typeof record.state!=='object'||Array.isArray(record.state)){add('TECH_RECORD_STATE_INVALID',{id:record.id});return;}
  if(!SPEC.phases.includes(record.state.phase))add('TECH_RECORD_PHASE_INVALID',{id:record.id,phase:record.state.phase??null});
  const result=validateHiveState(record.state);
  result.errors.forEach(error=>add('TECH_RECORD_STATE_'+error.code,{id:record.id,message:error.message}));
 });
 return {valid:errors.length===0,errors};
}
function getOperation(id){return SPEC.operations.find(x=>x.id===id)||null;}
window.PasekaSectionalTechProcess=Object.freeze({SPEC,parseDate,shiftDate,buildOperationSchedule,validateHiveState,validateStoredRecords,getOperation});
})();