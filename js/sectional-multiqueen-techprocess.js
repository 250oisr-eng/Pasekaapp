(() => {
'use strict';
const SPEC=Object.freeze({
 id:'sectional-multiqueen-v1',version:'1.0.0',language:'ru',
 sectionsAtDivision:3,nestFrames:6,honeyFrames:10,honeyBodiesDefault:2,honeyBodiesMax:4,
 meshPlugInstallDays:[8,11],meshPlugRemoveDays:[20,21],honeySealCheckDay:15,honeySealRetryDays:7,alternativeWinteringSpringDays:[40,50],
 phases:['WINTER','POST_WINTER','SPRING_DEVELOPMENT','PRE_DIVISION','DIVIDED_3_SECTIONS','HONEY_BODIES_INSTALLED','HONEY_COLLECTION','END_OF_SEASON','AUTUMN_PREP','WINTER_ASSEMBLY','ALT_WINTERING','ALT_WINTERING_SPRING'],
 operations:[
 {id:'OP-01',title:'Весеннее открытие летков',optional:false},
 {id:'OP-02',title:'Весенняя подкормка',optional:false,durationDays:[12,15]},
 {id:'OP-03',title:'Перестановка корпусов (верх ↔ низ)',optional:true,recommended:true,offsetFrom:'OP-04',offsetDays:[-7,-5]},
 {id:'OP-04',title:'Разделение улья на 3 секции',optional:false},
 {id:'OP-05',title:'Установка металлических сетчатых заглушек',optional:false,offsetFrom:'OP-04',offsetDays:[8,11]},
 {id:'OP-06',title:'Снятие металлических сетчатых заглушек',optional:false,offsetFrom:'OP-04',offsetDays:[20,21]},
 {id:'OP-07',title:'Постановка медовых корпусов',optional:false},
 {id:'OP-08',title:'Отбор мёда',optional:false,offsetFrom:'HONEY_FLOW_MAIN_START',offsetDays:[15,15],retryDays:7},
 {id:'OP-09',title:'Сокращение летков',optional:false,period:'Вторая половина августа'},
 {id:'OP-10',title:'Осенняя подготовка',optional:false,period:'Середина–конец сентября'},
 {id:'OP-11',title:'Сборка гнезда на зиму: объединение',optional:false,exclusiveGroup:'wintering'},
 {id:'OP-12',title:'Альтернативная зимовка: сохранение 3 семей',optional:true,exclusiveGroup:'wintering'},
 {id:'OP-13',title:'Весеннее развитие после альтернативной зимовки',optional:true,offsetFrom:'FIRST_FLIGHT',offsetDays:[40,50]},
 {id:'OP-14',title:'Получение раннего мёда после альтернативной зимовки',optional:true,exclusiveGroup:'altSpring'}],
 entranceAssignment:[
 {sectionIndex:1,openEntrance:'FLAT_BOTTOM',state:'HALF_OPEN'},
 {sectionIndex:2,openEntrance:'ROUND_TOP',state:'OPEN'},
 {sectionIndex:3,openEntrance:'ROUND_BOTTOM',state:'OPEN'}],
 unresolved:[
 'queenExcludersCount=2 расходится с OP-07/OP-14 (одна решётка на каждую из трёх секций для медовых корпусов); возможно, это разные типы решёток — межсекционные и над гнездом.',
 'OP-06 допускает открытие всех летков, что конфликтует с R1 (один уникальный открытый тип на секцию). Не применять автоматически до уточнения.',
 'OP-03 задан как 5–7 дней до OP-04; нормализованный интервал дат [-7,-5].',
 'OP-01 задаёт весенние летки до разделения; R1 применяется после разделения.']
});
const DAY=86400000,DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
function parseDate(v){if(typeof v!=='string'||!DATE_RE.test(v))return null;const p=v.split('-').map(Number),d=new Date(Date.UTC(p[0],p[1]-1,p[2]));return d.getUTCFullYear()===p[0]&&d.getUTCMonth()===p[1]-1&&d.getUTCDate()===p[2]?d:null;}
function fmt(d){return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');}
function shiftDate(v,n){const d=parseDate(v);if(!d||!Number.isInteger(n))throw new Error('Укажи корректную дату и целое число дней.');return fmt(new Date(d.getTime()+n*DAY));}
function buildOperationSchedule(a){const out=[];const add=(id,date,range,extra)=>{if(date)out.push(Object.assign({operationId:id,from:shiftDate(fmt(date),range[0]),to:shiftDate(fmt(date),range[1])},extra||{}));};const d=parseDate(a&&a['OP-04']);add('OP-03',d,[-7,-5],{optional:true});add('OP-05',d,[8,11]);add('OP-06',d,[20,21]);add('OP-08',parseDate(a&&a.HONEY_FLOW_MAIN_START),[15,15],{retryAfterDays:7});add('OP-13',parseDate(a&&a.FIRST_FLIGHT),[40,50],{optional:true});return out;}
function validateHiveState(s){
 const errors=[],warnings=[],add=(code,message,level)=> (level==='warning'?warnings:errors).push({code,message});
 if(!s||typeof s!=='object'||Array.isArray(s))return {valid:false,errors:[{code:'STATE_INVALID',message:'Состояние улья должно быть объектом.'}],warnings};
 const c=s.config||{};
 if(c.honeyBodiesCount!==undefined&&![2,4].includes(c.honeyBodiesCount))add('HONEY_BODIES_COUNT','Допустимо 2 или 4 медовых корпуса.');
 if(c.additionalBottoms!==undefined&&(!Number.isInteger(c.additionalBottoms)||c.additionalBottoms<0||c.additionalBottoms>2))add('ADDITIONAL_BOTTOMS','Дополнительных доньев должно быть от 0 до 2.');
 if(s.phase&&!SPEC.phases.includes(s.phase))add('PHASE_UNKNOWN','Неизвестная сезонная фаза.');
 const divided=['DIVIDED_3_SECTIONS','HONEY_BODIES_INSTALLED','HONEY_COLLECTION'].includes(s.phase),sections=Array.isArray(s.sections)?s.sections:[];
 if(divided&&sections.length!==3)add('SECTION_COUNT','В разделённом состоянии должно быть ровно три секции.');
 if(divided&&sections.length===3){
  const ids=sections.map(x=>x&&x.index);if(new Set(ids).size!==3||ids.some(x=>![1,2,3].includes(x)))add('SECTION_INDEX','Индексы секций должны быть уникальными: 1, 2 и 3.');
  SPEC.entranceAssignment.forEach(e=>{const x=sections.find(y=>y&&y.index===e.sectionIndex);if(!x)return;if(x.openEntrance!==e.openEntrance)add('R1_ENTRANCE_TYPE','Для секции '+e.sectionIndex+' предусмотрен леток '+e.openEntrance+'.');if(x.entranceState&&x.entranceState!==e.state)add('R1_ENTRANCE_STATE','Для летка '+e.openEntrance+' секции '+e.sectionIndex+' ожидается '+e.state+'.');});
  const types=sections.map(x=>x&&x.openEntrance).filter(Boolean);if(new Set(types).size!==3)add('R1_DUPLICATE_ENTRANCE','В трёх секциях не могут быть открыты одинаковые типы летков.');
 }
 const queens=Array.isArray(s.queens)?s.queens:sections.flatMap(x=>x&&x.queen?[x.queen]:[]),unfert=queens.filter(x=>x&&x.status==='UNFERTILIZED');
 if(s.isolation==='CONNECTED'&&unfert.length)add('R2_UNFERTILIZED_CONNECTED','Нельзя снимать полную изоляцию, пока остаётся хотя бы одна неплодная матка.');
 if(s.isolation==='MESH_ISOLATED'){const plugs=Array.isArray(s.meshPlugs)?s.meshPlugs:[];['LEFT','RIGHT'].forEach(side=>{if(!plugs.some(p=>p&&p.side===side&&p.installed===true&&p.position==='OVER_QUEEN_EXCLUDER'))add('R2_MESH_PLUG_MISSING','Нет металлической сетчатой заглушки поверх геннеманской решётки со стороны '+side+'.');});if(!unfert.length)add('R2_ISOLATION_REVIEW','Все зарегистрированные матки плодные, но секции изолированы.','warning');}
 const done=new Set((Array.isArray(s.operations)?s.operations:[]).filter(x=>x&&x.status==='DONE').map(x=>x.operationId));
 if(done.has('OP-11')&&done.has('OP-12'))add('R6_WINTERING_EXCLUSIVE','OP-11 и OP-12 взаимоисключающие.');
 if(done.has('OP-13')&&done.has('OP-14'))add('R6_ALT_SPRING_EXCLUSIVE','OP-13 и OP-14 отмечены взаимоисключающими в графе зависимостей; выберите сценарий.');
 if(done.has('OP-06')&&unfert.length)add('OP06_QUEEN_STATUS','OP-06 нельзя считать выполненной, пока все три матки не отмечены как плодные.');
 if(['HONEY_BODIES_INSTALLED','HONEY_COLLECTION'].includes(s.phase)&&s.queenExcluderBetweenNestAndHoney!==true)add('R4_QUEEN_EXCLUDER','Перед медовыми корпусами должна быть установлена геннеманская решётка.');
 if(s.operationActions&&s.operationActions.includes('OPTIONAL_OPEN_ALL_ENTRANCES')&&divided)add('R1_OPEN_ALL_CONFLICT','Открытие всех летков конфликтует с R1; действие требует уточнения.','warning');
 if(s.winteringMode==='ALTERNATIVE_DIAPHRAGMS'&&s.phase==='ALT_WINTERING'&&(!Array.isArray(s.diaphragms)||s.diaphragms.length!==2||s.diaphragms.some(x=>!x||x.hasMesh!==true)))add('R7_DIAPHRAGMS','Для альтернативной зимовки нужны две диафрагмы с металлической сеткой.');
 if(s.winteringMode&&!['COMBINED','ALTERNATIVE_DIAPHRAGMS'].includes(s.winteringMode))add('WINTERING_MODE','Неизвестный способ зимовки.');
 return {valid:errors.length===0,errors,warnings};
}
function getOperation(id){return SPEC.operations.find(x=>x.id===id)||null;}
window.PasekaSectionalTechProcess=Object.freeze({SPEC,parseDate,shiftDate,buildOperationSchedule,validateHiveState,getOperation});
})();