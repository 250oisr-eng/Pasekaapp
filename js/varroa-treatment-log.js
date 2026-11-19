(function(root){
'use strict';
const METHOD='oxalic_acid_sublimator';
const MAX_NOTES=2000;
function validTimestamp(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))return false;
 const time=Date.parse(value);
 return Number.isFinite(time)&&new Date(time).toISOString()===value;
}
function buildTreatmentEvent(input,hives,makeId,now){
 if(input?.userConfirmed!==true)throw new Error('Подтверди, что обработка действительно выполнена.');
 const hiveId=String(input?.hiveId||'');
 if(!Array.isArray(hives)||!hives.some(h=>h?.id===hiveId))throw new Error('Выбери существующий улей.');
 const occurredAt=String(input?.occurredAt||'');
 if(!validTimestamp(occurredAt))throw new Error('Укажи корректные дату и время фактически выполненной обработки.');
 if(!validTimestamp(now))throw new Error('Не удалось проверить текущее время устройства.');
 if(Date.parse(occurredAt)>Date.parse(now))throw new Error('Дата и время обработки не могут быть в будущем.');
 const notes=String(input?.notes||'').trim();
 if(notes.length>MAX_NOTES)throw new Error('Примечание не должно превышать 2000 символов.');
 const hive=hives.find(item=>item?.id===hiveId);
 const hiveNumber=Number.isInteger(Number(hive?.number))&&Number(hive.number)>0?Number(hive.number):null;
 return {
  id:makeId(),
  method:METHOD,
  hiveId,
  hiveNumberAtTime:hiveNumber,
  hiveLabelAtTime:hiveNumber?'Улей №'+hiveNumber:'Улей',
  occurredAt,
  notes,
  userConfirmed:true,
  source:'manual',
  createdAt:now
 };
}
function inspectTreatmentIntegrity(state){
 const errors=[],rows=Array.isArray(state?.varroaTreatments)?state.varroaTreatments:[],hives=new Set((Array.isArray(state?.hives)?state.hives:[]).map(h=>h?.id).filter(Boolean)),ids=new Set();
 const add=(code,details={})=>errors.push({code,details});
 if(Number(state?.meta?.schemaVersion)>=16&&!Array.isArray(state.varroaTreatments))add('varroa_treatments_section_missing');
 for(const row of rows){
  if(!row||typeof row!=='object'||typeof row.id!=='string'||!row.id.trim()){add('varroa_treatment_invalid_id');continue;}
  if(ids.has(row.id)){add('varroa_treatment_duplicate_id',{id:row.id});continue;}
  ids.add(row.id);
  if(row.method!==METHOD)add('varroa_treatment_invalid_method',{id:row.id,method:row.method??null});
  if(!hives.has(row.hiveId)&&!(typeof row.hiveLabelAtTime==='string'&&row.hiveLabelAtTime.trim()))add('varroa_treatment_hive_missing',{id:row.id,hiveId:row.hiveId??null});
  if(!validTimestamp(row.occurredAt))add('varroa_treatment_invalid_occurred_at',{id:row.id,occurredAt:row.occurredAt??null});
  if(typeof row.notes!=='string'||row.notes.length>MAX_NOTES)add('varroa_treatment_invalid_notes',{id:row.id});
  if(row.userConfirmed!==true)add('varroa_treatment_unconfirmed',{id:row.id});
  if(row.source!=='manual')add('varroa_treatment_invalid_source',{id:row.id,source:row.source??null});
  if(!validTimestamp(row.createdAt))add('varroa_treatment_invalid_created_at',{id:row.id});
  if(validTimestamp(row.occurredAt)&&validTimestamp(row.createdAt)&&Date.parse(row.occurredAt)>Date.parse(row.createdAt))add('varroa_treatment_future_at_creation',{id:row.id});
 }
 return errors;
}
function summarizeTreatments(rows,hiveId){
 const selected=(Array.isArray(rows)?rows:[]).filter(row=>row&&(!hiveId||row.hiveId===hiveId)).slice().sort((a,b)=>String(b.occurredAt).localeCompare(String(a.occurredAt))||String(b.createdAt).localeCompare(String(a.createdAt)));
 return {total:selected.length,events:selected};
}
const api={VERSION:'varroa-treatment-log-v1',METHOD,METHOD_LABEL:'Сублиматор щавелевой кислоты',buildTreatmentEvent,inspectTreatmentIntegrity,summarizeTreatments,validTimestamp};
root.PasekaVarroaTreatmentLog=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
