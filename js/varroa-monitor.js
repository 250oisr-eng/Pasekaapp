(function(root){
'use strict';
const TYPES=Object.freeze(['adult_bee_sample','sticky_board']);
const METHODS=Object.freeze(['alcohol_wash','sugar_roll','other']);
const finiteInt=(value,min,max)=>value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isInteger(Number(value))&&Number(value)>=min&&Number(value)<=max;
function validDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const [y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));
 return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d;
}
function buildVarroaObservation(input,hives,makeId,now){
 const type=String(input?.type||''),hiveId=String(input?.hiveId||''),date=String(input?.date||'');
 if(!TYPES.includes(type))throw new Error('Выбери тип наблюдения.');
 if(!Array.isArray(hives)||!hives.some(h=>h?.id===hiveId))throw new Error('Выбери существующий улей.');
 if(!validDate(date))throw new Error('Укажи корректную дату наблюдения.');
 const notes=String(input.notes||'').trim();
 if(notes.length>2000)throw new Error('Примечание не должно превышать 2000 символов.');
 const hive=hives.find(item=>item?.id===hiveId),hiveNumber=Number.isInteger(Number(hive?.number))&&Number(hive.number)>0?Number(hive.number):null;
 const base={id:makeId(),type,hiveId,hiveNumberAtTime:hiveNumber,hiveLabelAtTime:hiveNumber?'Улей №'+hiveNumber:'Улей',date,notes,createdAt:now,updatedAt:now,source:'manual'};
 if(type==='adult_bee_sample'){
  const method=String(input.method||'');
  if(!METHODS.includes(method))throw new Error('Выбери способ отбора пробы.');
  if(!finiteInt(input.beesCount,10,1000))throw new Error('Количество пчёл должно быть целым числом от 10 до 1000.');
  if(!finiteInt(input.mitesCount,0,100000))throw new Error('Количество клещей должно быть целым числом от 0 до 100000.');
  const beesCount=Number(input.beesCount),mitesCount=Number(input.mitesCount);
  return {...base,method,beesCount,mitesCount,mitesPer100Bees:Number((mitesCount/beesCount*100).toFixed(2))};
 }
 if(!finiteInt(input.mitesCount,0,100000))throw new Error('Количество клещей должно быть целым числом от 0 до 100000.');
 if(!finiteInt(input.exposureHours,1,720))throw new Error('Период наблюдения должен быть от 1 до 720 часов.');
 const mitesCount=Number(input.mitesCount),exposureHours=Number(input.exposureHours);
 return {...base,method:'sticky_board',mitesCount,exposureHours,mitesPer24h:Number((mitesCount/exposureHours*24).toFixed(2))};
}
function inspectVarroaIntegrity(state){
 const errors=[],rows=Array.isArray(state?.varroaObservations)?state.varroaObservations:[],hives=new Set((Array.isArray(state?.hives)?state.hives:[]).map(h=>h?.id).filter(Boolean)),ids=new Set();
 const add=(code,details={})=>errors.push({code,details});
 if(state?.meta?.schemaVersion>=10&&!Array.isArray(state.varroaObservations))add('varroa_section_missing');
 for(const row of rows){
  if(!row||typeof row!=='object'||!row.id){add('varroa_invalid_id');continue}
  if(ids.has(row.id)){add('varroa_duplicate_id',{id:row.id});continue}ids.add(row.id);
  if(!TYPES.includes(row.type))add('varroa_invalid_type',{id:row.id,type:row.type??null});
  if(!hives.has(row.hiveId)&&!(typeof row.hiveLabelAtTime==='string'&&row.hiveLabelAtTime.trim()))add('varroa_hive_missing',{id:row.id,hiveId:row.hiveId??null});
  if(!validDate(row.date))add('varroa_invalid_date',{id:row.id,date:row.date??null});
  if(typeof row.notes!=='string'||row.notes.length>2000)add('varroa_invalid_notes',{id:row.id});
  if(row.type==='adult_bee_sample'){
   if(!METHODS.includes(row.method))add('varroa_invalid_method',{id:row.id,method:row.method??null});
   if(!finiteInt(row.beesCount,10,1000))add('varroa_invalid_bee_count',{id:row.id});
   if(!finiteInt(row.mitesCount,0,100000))add('varroa_invalid_mite_count',{id:row.id});
   if(finiteInt(row.beesCount,10,1000)&&finiteInt(row.mitesCount,0,100000)){
    const expected=Number((Number(row.mitesCount)/Number(row.beesCount)*100).toFixed(2));
    if(row.mitesPer100Bees!==expected)add('varroa_rate_mismatch',{id:row.id,expected,actual:row.mitesPer100Bees??null});
   }
  }else if(row.type==='sticky_board'){
   if(row.method!=='sticky_board')add('varroa_invalid_method',{id:row.id,method:row.method??null});
   if(!finiteInt(row.mitesCount,0,100000))add('varroa_invalid_mite_count',{id:row.id});
   if(!finiteInt(row.exposureHours,1,720))add('varroa_invalid_exposure',{id:row.id});
   if(finiteInt(row.mitesCount,0,100000)&&finiteInt(row.exposureHours,1,720)){
    const expected=Number((Number(row.mitesCount)/Number(row.exposureHours)*24).toFixed(2));
    if(row.mitesPer24h!==expected)add('varroa_board_rate_mismatch',{id:row.id,expected,actual:row.mitesPer24h??null});
   }
  }
 }
 return errors;
}
function summarizeVarroaObservations(rows,hiveId){
 const selected=(Array.isArray(rows)?rows:[]).filter(x=>x&&(!hiveId||x.hiveId===hiveId)).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
 const adult=selected.filter(x=>x.type==='adult_bee_sample'),boards=selected.filter(x=>x.type==='sticky_board');
 const latest=arr=>arr.length?arr[arr.length-1]:null;
 return {total:selected.length,adultBeeSamples:adult.length,stickyBoardObservations:boards.length,latestAdultBeeSample:latest(adult),latestStickyBoardObservation:latest(boards),observations:selected};
}
const api={VERSION:'varroa-monitor-v1',TYPES,METHODS,buildVarroaObservation,inspectVarroaIntegrity,summarizeVarroaObservations,validDate};
root.PasekaVarroa=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
