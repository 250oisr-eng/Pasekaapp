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
function buildDeadoutReviewDraft(input,hives,media,makeId,now,families=[]){
 const hiveId=String(input?.hiveId||''),observedAt=String(input?.observedAt||''),lastAliveDate=String(input?.lastAliveDate||'');
 if(!hiveId||!Array.isArray(hives)||hives.filter(x=>x?.id===hiveId).length!==1)throw new Error('Выбери существующий улей с однозначным ID.');
 if(!validDate(observedAt))throw new Error('Укажи корректную дату обнаружения погибшей семьи.');
 if(lastAliveDate&&(!validDate(lastAliveDate)||lastAliveDate>observedAt))throw new Error('Дата последнего подтверждённого осмотра должна быть корректной и не позже обнаружения.');
 for(const [key,values] of Object.entries(ENUMS))if(!values.includes(input?.[key]||'unknown'))throw new Error('Проверь одно из полей чек-листа.');
 if(media!=null&&!Array.isArray(media))throw new Error('Список фотографий повреждён; сведения не сохранены.');
 const notes=text(input?.notes,4000),seasonContext=text(input?.seasonContext,1000),photos=media||[];
 if(photos.length>3)throw new Error('Можно прикрепить не более трёх фотографий.');
 for(const photo of photos)if(!photo||photo.kind!=='image'||typeof photo.name!=='string'||photo.name.length>160||typeof photo.data!=='string'||!/^data:image\/(?:jpeg|png|webp|heic);base64,/i.test(photo.data)||photo.data.length>4500000)throw new Error('Фотография имеет неподдерживаемый формат или слишком большой размер.');
 const hive=hives.find(x=>x.id===hiveId),number=Number(hive.number);
 const hiveNumberAtTime=Number.isSafeInteger(number)&&number>0?number:null;
 const familyId=input.familyId||null;
 let familySnapshotAtTime=null;
 if(familyId!==null){
  const matches=(Array.isArray(families)?families:[]).filter(f=>f?.id===familyId);
  if(typeof familyId!=='string'||matches.length!==1||matches[0].hive!==hiveId)throw new Error('Выбранная семья недоступна или относится к другому улью.');
  familySnapshotAtTime={id:familyId,hiveId,name:text(matches[0].name||matches[0].code,200)};
 }
 return {id:makeId(),hiveId,hiveNumberAtTime,hiveSnapshotAtTime:{id:hiveId,number:hiveNumberAtTime},familyId,familySnapshotAtTime,observedAt,lastAliveDate:lastAliveDate||null,...Object.fromEntries(Object.keys(ENUMS).map(key=>[key,input[key]||'unknown'])),seasonContext,notes,media:photos.map(photo=>({...photo})),createdAt:now,updatedAt:now,assessmentType:'observational_differential',diagnosis:null};
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
 if(!Array.isArray(items))return Number(state?.meta?.schemaVersion||1)<12?[]:[{code:'deadout_section_missing',details:{}}];
 const ids=new Set(),validHives=Array.isArray(state?.hives);
 if(!validHives)errors.push({code:'deadout_invalid_hive_registry',details:{}});
 const hiveIds=new Set((validHives?state.hives:[]).filter(x=>x&&typeof x.id==='string'&&x.id.trim()).map(x=>x.id));
 for(const item of items){
  if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.id!=='string'||!item.id.trim()||ids.has(item.id)){errors.push({code:'deadout_invalid_or_duplicate_id',details:{id:item?.id||null}});continue}
  ids.add(item.id);
  const snapshot=item.hiveSnapshotAtTime;
  const snapshotValid=snapshot&&typeof snapshot==='object'&&snapshot.id===item.hiveId&&(snapshot.number===null||Number.isSafeInteger(snapshot.number)&&snapshot.number>0)&&snapshot.number===item.hiveNumberAtTime;
  if(snapshot!=null&&!snapshotValid)errors.push({code:'deadout_invalid_hive_snapshot',details:{id:item.id}});
  if(typeof item.hiveId!=='string'||!item.hiveId.trim()||!hiveIds.has(item.hiveId)&&!snapshotValid&&(!Number.isInteger(item.hiveNumberAtTime)||item.hiveNumberAtTime<1))errors.push({code:'deadout_hive_reference_missing',details:{id:item.id,hiveId:item.hiveId}});
  if(item.familyId!=null||item.familySnapshotAtTime!=null){
   const f=item.familySnapshotAtTime;
   if(typeof item.familyId!=='string'||!item.familyId.trim()||!f||f.id!==item.familyId||f.hiveId!==item.hiveId||typeof f.name!=='string')errors.push({code:'deadout_invalid_family_snapshot',details:{id:item.id}});
  }

  if(!validDate(item.observedAt))errors.push({code:'deadout_invalid_date',details:{id:item.id}});if(item.lastAliveDate!=null&&(!validDate(item.lastAliveDate)||item.lastAliveDate>item.observedAt))errors.push({code:'deadout_invalid_last_alive_date',details:{id:item.id}});if(typeof item.notes!=='string'||item.notes.length>4000||typeof item.seasonContext!=='string'||item.seasonContext.length>1000)errors.push({code:'deadout_invalid_text',details:{id:item.id}});
  for(const [key,values] of Object.entries(ENUMS))if(!values.includes(item[key]))errors.push({code:'deadout_invalid_'+key,details:{id:item.id}});
  if(item.diagnosis!==null)errors.push({code:'deadout_diagnosis_must_remain_unset',details:{id:item.id}});
  if(item.media!=null&&(!Array.isArray(item.media)||item.media.length>3||!item.media.every(photo=>photo&&photo.kind==='image'&&typeof photo.name==='string'&&photo.name.length<=160&&typeof photo.data==='string'&&/^data:image\/(?:jpeg|png|webp|heic);base64,/i.test(photo.data)&&photo.data.length<=4500000)))errors.push({code:'deadout_invalid_media',details:{id:item.id}});
 }
 return errors;
}
function summarizeDeadoutReviews(items){const list=Array.isArray(items)?items.filter(item=>item&&typeof item==='object'&&!Array.isArray(item)):[];return {total:list.length,items:list.slice().sort((a,b)=>String(b.observedAt).localeCompare(String(a.observedAt)))}}
root.PasekaDeadout=Object.freeze({ENUMS,validDate,buildDeadoutReviewDraft,suggestPossibleFactors,inspectDeadoutIntegrity,summarizeDeadoutReviews});
})(typeof window!=='undefined'?window:globalThis);
