(function(root){
'use strict';
const ENUMS={
 foodStatus:['absent','very_low','some','adequate','unknown'],
 clusterPosition:['near_food','far_from_food','bottom','unknown'],
 moisture:['condensation','mold','dry','unknown'],
 brood:['abnormal','dead_brood','normal','no_brood','unknown'],
 deadBeesInCells:['heads_protruding','scattered','none','unknown'],
 varroaEvidence:['high_test','mites_seen','recent_low_test','not_tested','unknown'],
 queenStatus:['queen_seen','queen_dead','not_found','unknown'],
 rodentEvidence:['nest_or_droppings','gnawing','none','unknown']
};
const validDate=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const [y,m,d]=value.split('-').map(Number),x=new Date(Date.UTC(y,m-1,d));return x.getUTCFullYear()===y&&x.getUTCMonth()===m-1&&x.getUTCDate()===d};
function text(value,max){const result=String(value??'').trim();if(result.length>max)throw new Error('Одно из текстовых полей превышает допустимую длину.');return result}
function buildDeadoutReviewDraft(input,hives,media,makeId,now){
 const hiveId=String(input?.hiveId||''),observedAt=String(input?.observedAt||''),lastAliveDate=String(input?.lastAliveDate||'');
 if(!Array.isArray(hives)||!hives.some(x=>x?.id===hiveId))throw new Error('Выбери существующий улей.');
 if(!validDate(observedAt))throw new Error('Укажи корректную дату обнаружения погибшей семьи.');
 if(lastAliveDate&&(!validDate(lastAliveDate)||lastAliveDate>observedAt))throw new Error('Дата последнего подтверждённого осмотра должна быть корректной и не позже обнаружения.');
 for(const [key,values] of Object.entries(ENUMS))if(!values.includes(input?.[key]||'unknown'))throw new Error('Проверь одно из полей чек-листа.');
 const notes=text(input?.notes,4000),seasonContext=text(input?.seasonContext,1000),photos=Array.isArray(media)?media:[];
 if(photos.length>3)throw new Error('Можно прикрепить не более трёх фотографий.');
 for(const photo of photos)if(!photo||photo.kind!=='image'||typeof photo.name!=='string'||photo.name.length>160||typeof photo.data!=='string'||!/^data:image\/(?:jpeg|png|webp|heic);base64,/i.test(photo.data)||photo.data.length>4500000)throw new Error('Фотография имеет неподдерживаемый формат или слишком большой размер.');
 const hive=hives.find(x=>x.id===hiveId);
 return {id:makeId(),hiveId,hiveNumberAtTime:Number(hive.number),observedAt,lastAliveDate:lastAliveDate||null,...Object.fromEntries(Object.keys(ENUMS).map(key=>[key,input[key]||'unknown'])),seasonContext,notes,media:photos,createdAt:now,updatedAt:now,assessmentType:'observational_differential',diagnosis:null};
}
function suggestPossibleFactors(review){
 const candidates=[],checks=[];
 const add=(code,label,reason)=>candidates.push({code,label,reason,certainty:'possible'});
 if(review.foodStatus==='absent'||review.foodStatus==='very_low'||review.clusterPosition==='far_from_food')add('food_access','Голодание или недоступность кормов','Проверить фактические остатки корма, положение клуба и возможность доступа к корму. Отдельный признак не доказывает голодание.');
 if(review.moisture==='condensation'||review.moisture==='mold')add('moisture','Избыточная влага','Проверить вентиляцию, утепление, протечки и расположение конденсата. Плесень может быть следствием длительной сырости, но не устанавливает первичную причину гибели.');
 if(review.varroaEvidence==='high_test'||review.varroaEvidence==='mites_seen')add('varroa','Высокая нагрузка Varroa или связанные вирусы','Сопоставить результаты количественных проб до зимовки и историю обработок. Видимые клещи или единичный тест не доказывают, что именно это стало причиной гибели.');
 if(review.queenStatus==='queen_dead'||review.queenStatus==='not_found')add('queen','Проблема с маткой или отсутствие подтверждения её наличия','Проверить историю матки, поздний расплод и записи осмотров. Ненайденная матка в погибшей семье не доказывает, что она отсутствовала до гибели.');
 if(review.brood==='abnormal'||review.brood==='dead_brood')add('brood_health','Проблемы с расплодом или заболевание','Сохранить фото и при необходимости обратиться к ветеринарному специалисту/лаборатории. По внешнему виду нельзя надёжно различить все болезни расплода.');
 if(review.rodentEvidence==='nest_or_droppings'||review.rodentEvidence==='gnawing')add('rodents','Проникновение грызунов','Проверить леток, донья, следы грызунов и повреждения сотов.');
 if(review.deadBeesInCells==='heads_protruding')add('dead_at_emergence','Погибшие пчёлы при выходе из ячеек','Это неспецифичный признак. Проверить доступность кормов, состояние клуба, численность пчёл и условия зимовки; не считать его самостоятельным доказательством голода.');
 if(review.varroaEvidence==='not_tested'||review.varroaEvidence==='unknown')checks.push('Нет подтверждённого количественного контроля Varroa перед зимовкой или его результат не указан.');
 if(review.foodStatus==='unknown')checks.push('Не зафиксировано количество и доступность кормов.');
 if(review.lastAliveDate==null)checks.push('Не указана дата последнего подтверждённого осмотра живой семьи.');
 if(!candidates.length)checks.push('По заполненным полям нет достаточных признаков для выделения направления проверки. Нужны фото, записи осмотров и подробный осмотр остатков.');
 return {candidates,checks,diagnosis:null,disclaimer:'Это список возможных направлений проверки, а не диагноз и не установление причины гибели. Для инфекционных заболеваний, отравления и спорных случаев нужны профильный специалист и/или лабораторное исследование.'};
}
function inspectDeadoutIntegrity(state){
 const errors=[],items=state?.deadoutReviews;
 if(!Array.isArray(items))return [{code:'deadout_section_missing',details:{}}];
 const ids=new Set(),hiveIds=new Set((state.hives||[]).map(x=>x.id));
 for(const item of items){
  if(!item||typeof item!=='object'||typeof item.id!=='string'||!item.id||ids.has(item.id)){errors.push({code:'deadout_invalid_or_duplicate_id',details:{id:item?.id||null}});continue}
  ids.add(item.id);
  if(!hiveIds.has(item.hiveId)&&(!Number.isInteger(item.hiveNumberAtTime)||item.hiveNumberAtTime<1))errors.push({code:'deadout_hive_reference_missing',details:{id:item.id,hiveId:item.hiveId}});
  if(!validDate(item.observedAt))errors.push({code:'deadout_invalid_date',details:{id:item.id}});
  for(const [key,values] of Object.entries(ENUMS))if(!values.includes(item[key]))errors.push({code:'deadout_invalid_'+key,details:{id:item.id}});
  if(item.diagnosis!==null)errors.push({code:'deadout_diagnosis_must_remain_unset',details:{id:item.id}});
  if(item.media!=null&&(!Array.isArray(item.media)||item.media.length>3||!item.media.every(photo=>photo&&photo.kind==='image'&&typeof photo.name==='string'&&photo.name.length<=160&&typeof photo.data==='string'&&/^data:image\/(?:jpeg|png|webp|heic);base64,/i.test(photo.data)&&photo.data.length<=4500000)))errors.push({code:'deadout_invalid_media',details:{id:item.id}});
 }
 return errors;
}
function summarizeDeadoutReviews(items){const list=Array.isArray(items)?items:[];return {total:list.length,items:list.slice().sort((a,b)=>String(b.observedAt).localeCompare(String(a.observedAt)))}}
root.PasekaDeadout=Object.freeze({ENUMS,validDate,buildDeadoutReviewDraft,suggestPossibleFactors,inspectDeadoutIntegrity,summarizeDeadoutReviews});
})(typeof window!=='undefined'?window:globalThis);
