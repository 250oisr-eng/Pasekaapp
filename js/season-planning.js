(function(root){
'use strict';
const DAY=86400000;
function parseDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const [y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));
 return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?date:null;
}
function formatDate(date){
 return date.getUTCFullYear()+'-'+String(date.getUTCMonth()+1).padStart(2,'0')+'-'+String(date.getUTCDate()).padStart(2,'0');
}
function shiftDate(value,days){
 const date=parseDate(value);
 if(!date||!Number.isInteger(days))throw new Error('Укажи корректную дату и целое число дней.');
 return formatDate(new Date(date.getTime()+days*DAY));
}
function buildNectarBackwardPlan(input){
 const floweringDate=String(input?.floweringDate||''),date=parseDate(floweringDate);
 if(!date)throw new Error('Укажи корректную ожидаемую дату начала цветения.');
 const plantName=String(input?.plantName||'').trim().slice(0,120);
 const minLeadDays=Number(input?.minLeadDays??35),maxLeadDays=Number(input?.maxLeadDays??49),targetLeadDays=Number(input?.targetLeadDays??42);
 if(!Number.isInteger(minLeadDays)||!Number.isInteger(maxLeadDays)||!Number.isInteger(targetLeadDays)||minLeadDays<21||maxLeadDays>70||minLeadDays>targetLeadDays||targetLeadDays>maxLeadDays)throw new Error('Проверь диапазон сроков: от 21 до 70 дней, целые числа.');
 return Object.freeze({plantName,floweringDate,eggLayingWindow:{from:shiftDate(floweringDate,-maxLeadDays),to:shiftDate(floweringDate,-minLeadDays)},targetEggLayingDate:shiftDate(floweringDate,-targetLeadDays),leadDays:{min:minLeadDays,target:targetLeadDays,max:maxLeadDays},basis:'Ориентир: около 21 дня развития рабочей пчелы в ячейке и примерно 2–3 недели до начала лётной работы после выхода. Реальные сроки меняются с возрастной структурой семьи, погодой, кормлением и силой взятка.',warning:'Это обратный биологический ориентир, а не гарантия даты появления сборщиц. Не стимулируй семью автоматически: оцени корма, погоду, силу и риск переохлаждения расплода.'});
}
function buildQueenRearingTimeline(input){
 const graftDate=String(input?.graftDate||''),date=parseDate(graftDate);
 if(!date)throw new Error('Укажи корректную дату прививки.');
 const larvaAgeHours=Number(input?.larvaAgeHours??24);
 if(!Number.isFinite(larvaAgeHours)||larvaAgeHours<0||larvaAgeHours>48)throw new Error('Возраст личинки при прививке должен быть от 0 до 48 часов после выхода из яйца.');
 const daysToEmergence=Math.round(13-larvaAgeHours/24);
 const emergence=shiftDate(graftDate,daysToEmergence);
 return Object.freeze({graftDate,larvaAgeHours,estimatedEmergence:{from:shiftDate(emergence,-1),target:emergence,to:shiftDate(emergence,1)},milestones:[
  {key:'acceptance',label:'Проверить приём личинок',from:shiftDate(graftDate,1),to:shiftDate(graftDate,2)},
  {key:'cell_transfer',label:'Окно планирования переноса зрелых маточников в нуклеусы',from:shiftDate(emergence,-5),to:shiftDate(emergence,-2)},
  {key:'emergence',label:'Ожидаемый выход матки',from:shiftDate(emergence,-1),to:shiftDate(emergence,1)},
  {key:'mating',label:'Возможное окно облёта — только при подходящей погоде',from:shiftDate(emergence,4),to:shiftDate(emergence,12)},
  {key:'eggs',label:'Проверить наличие яиц и качество засева',from:shiftDate(emergence,10),to:shiftDate(emergence,21)}
 ],basis:'Расчёт ориентирован на развитие матки около 16 дней от яйца. Для прививки личинки примерно суточного возраста ориентир — около 12 дней от прививки до выхода.',warning:'Это планировочное окно, а не прогноз выхода, облёта или оплодотворения. Фактический результат зависит от возраста личинки, температуры маточника, приёма, погоды и наличия трутней.'});
}
function buildInspectionReminder(input){
 const lastInspection=String(input?.lastInspection||''),intervalDays=Number(input?.intervalDays??7);
 if(!parseDate(lastInspection))throw new Error('Укажи корректную дату последнего осмотра.');
 if(!Number.isInteger(intervalDays)||intervalDays<1||intervalDays>30)throw new Error('Интервал должен быть от 1 до 30 дней.');
 return Object.freeze({lastInspection,intervalDays,dueDate:shiftDate(lastInspection,intervalDays),warning:'Интервал — напоминание, а не гарантия предотвращения роения. При признаках подготовки к роению осмотр и действия определяются фактическим состоянием семьи.'});
}
function rankColonyStrength(items){
 if(!Array.isArray(items))throw new Error('Ожидается список оценок семей.');
 const valid=items.filter(x=>x&&typeof x.hiveId==='string'&&Number.isFinite(Number(x.occupiedStreets))&&Number(x.occupiedStreets)>=0);
 if(valid.length<4)return {status:'insufficient_sample',sampleSize:valid.length,items:valid.map(x=>({hiveId:x.hiveId,occupiedStreets:Number(x.occupiedStreets),relativeRank:null,label:'Недостаточно семей для сравнительной оценки'}))};
 const sorted=valid.slice().sort((a,b)=>Number(a.occupiedStreets)-Number(b.occupiedStreets));
 return {status:'relative_only',sampleSize:valid.length,items:valid.map(item=>{
  const rank=sorted.filter(x=>Number(x.occupiedStreets)<Number(item.occupiedStreets)).length;
  const percentile=Math.round(rank/(valid.length-1)*100);
  return {hiveId:item.hiveId,occupiedStreets:Number(item.occupiedStreets),percentile,label:percentile<25?'Нижняя часть распределения пасеки':percentile>75?'Верхняя часть распределения пасеки':'Средняя часть распределения пасеки'};
 })};
}
function summarizeTraitScores(observations){
 if(!Array.isArray(observations))throw new Error('Ожидается список оценок.');
 const traits=['gentleness','calmness','swarming','honeyYield','wintering','hygiene'];
 return traits.map(trait=>{
  const values=observations.filter(x=>x&&Number.isInteger(x[trait])&&x[trait]>=1&&x[trait]<=4).map(x=>x[trait]);
  const average=values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length*100)/100:null;
  return {trait,count:values.length,average,status:values.length>=4?'repeated_observations':values.length?'preliminary':'not_assessed'};
 });
}
root.PasekaSeasonPlanning=Object.freeze({parseDate,formatDate,shiftDate,buildNectarBackwardPlan,buildQueenRearingTimeline,buildInspectionReminder,rankColonyStrength,summarizeTraitScores});
})(typeof window!=='undefined'?window:globalThis);
