(function(root){
'use strict';
const SCOPES=Object.freeze(['selected_hives','whole_apiary','unknown']);
const MAX_MEDIA=3,MAX_MEDIA_DATA=3000000;
const text=(value,max)=>{const s=String(value??'').trim();if(s.length>max)throw new Error('Одно из текстовых полей превышает допустимую длину.');return s};
function validDateTime(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return false;
 const [date,time]=value.split('T'),[year,month,day]=date.split('-').map(Number),[hour,minute]=time.split(':').map(Number),d=new Date(Date.UTC(year,month-1,day));
 return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day&&hour>=0&&hour<=23&&minute>=0&&minute<=59;
}
function buildPesticideIncidentDraft(input,hives,media,makeId,now){
 if(!Array.isArray(hives))throw new Error('Не удалось прочитать список ульев.');
 const observedAt=String(input?.observedAt||'');
 if(!validDateTime(observedAt))throw new Error('Укажи корректные дату и время обнаружения.');
 const scope=String(input.scope||'unknown');
 if(!SCOPES.includes(scope))throw new Error('Выбери охват инцидента.');
 const allHives=hives.filter(h=>h&&h.id),requested=Array.isArray(input.hiveIds)?[...new Set(input.hiveIds.map(String))]:[];
 let affected=scope==='whole_apiary'?allHives:scope==='selected_hives'?requested.map(id=>allHives.find(h=>h.id===id)).filter(Boolean):[];
 if(scope==='selected_hives'&&(!requested.length||affected.length!==requested.length))throw new Error('Выбери существующие ульи, затронутые инцидентом.');
 const deadRaw=input.deadBeesCount==null?'':String(input.deadBeesCount).trim();
 let deadBeesCount=null;
 if(deadRaw!==''){if(!/^\d+$/.test(deadRaw)||Number(deadRaw)>10000000)throw new Error('Количество погибших пчёл должно быть целым числом от 0 до 10000000.');deadBeesCount=Number(deadRaw)}
 const sampleCollectedAt=String(input.sampleCollectedAt||'');if(sampleCollectedAt&&!validDateTime(sampleCollectedAt))throw new Error('Проверь дату и время отбора пробы.');
 const notes=text(input.notes,4000),symptoms=text(input.symptoms,2000),locationLabel=text(input.locationLabel,200),crop=text(input.suspectedCrop,160),substance=text(input.suspectedSubstance,200),area=text(input.suspectedArea,300),weather=text(input.weatherNotes,1000),reportedTo=text(input.reportedTo,200),reportReference=text(input.reportReference,160),sampleId=text(input.sampleId,160),sampleSeal=text(input.sampleSeal,160),sampleTransferredTo=text(input.sampleTransferredTo,200);
 const latRaw=input.latitude==null?'':String(input.latitude).trim(),lonRaw=input.longitude==null?'':String(input.longitude).trim();
 let latitude=null,longitude=null,locationAccuracyM=null;
 if((latRaw==='')!==(lonRaw===''))throw new Error('Для GPS нужны обе координаты.');
 if(latRaw!==''||lonRaw!==''){
  latitude=Number(latRaw);longitude=Number(lonRaw);
  if(!Number.isFinite(latitude)||latitude < -90||latitude>90||!Number.isFinite(longitude)||longitude < -180||longitude>180)throw new Error('Проверь GPS-координаты.');
  const accuracyRaw=input.locationAccuracyM==null?'':String(input.locationAccuracyM).trim();
  if(accuracyRaw!=='' ){if(!/^\d+$/.test(accuracyRaw)||Number(accuracyRaw)>100000)throw new Error('Проверь точность GPS.');locationAccuracyM=Number(accuracyRaw)}
 }
 const files=Array.isArray(media)?media:[];
 if(files.length>MAX_MEDIA)throw new Error('Можно прикрепить не более трёх фотографий.');
 for(const file of files){if(!file||file.kind!=='image'||typeof file.name!=='string'||file.name.length>180||!['image/jpeg','image/png','image/webp','image/heic'].includes(file.type)||typeof file.data!=='string'||!/^data:image\/(?:jpeg|png|webp|heic);base64,/i.test(file.data)||file.data.length>MAX_MEDIA_DATA)throw new Error('Фотография имеет неподдерживаемый формат или превышает лимит размера.')}
 const snapshots=affected.map(h=>({id:h.id,number:Number.isInteger(Number(h.number))?Number(h.number):null,label:Number.isInteger(Number(h.number))?'Улей №'+Number(h.number):'Улей'}));
 return {id:makeId(),observedAt,scope,affectedHiveIds:affected.map(h=>h.id),affectedHiveSnapshots:snapshots,deadBeesCount,symptoms,locationLabel,latitude,longitude,locationAccuracyM,gpsCapturedAt:latitude==null?null:String(input.gpsCapturedAt||''),suspectedCrop:crop,suspectedSubstance:substance,suspectedArea:area,weatherNotes:weather,reportedTo,reportReference,sampleId,sampleCollectedAt,sampleSeal,sampleTransferredTo,notes,media:files.map(x=>({kind:'image',name:x.name,type:x.type,data:x.data,sizeBytes:Number(x.sizeBytes)||0,capturedAt:x.capturedAt||null})),causationStatus:'unconfirmed',status:'open',source:'smartphone_manual',createdAt:now,updatedAt:now};
}
function inspectPesticideIncidentIntegrity(state){
 const errors=[],rows=Array.isArray(state?.pesticideIncidents)?state.pesticideIncidents:[],hives=new Set((Array.isArray(state?.hives)?state.hives:[]).map(h=>h?.id).filter(Boolean)),ids=new Set();
 const add=(code,details={})=>errors.push({code,details});
 if(state?.meta?.schemaVersion>=11&&!Array.isArray(state.pesticideIncidents))add('pesticide_incident_section_missing');
 const dateOk=value=>validDateTime(value);
 for(const row of rows){
  if(!row||typeof row!=='object'||!row.id){add('pesticide_incident_invalid_id');continue}
  if(ids.has(row.id)){add('pesticide_incident_duplicate_id',{id:row.id});continue}ids.add(row.id);
  if(!dateOk(row.observedAt))add('pesticide_incident_invalid_datetime',{id:row.id});
  if(!SCOPES.includes(row.scope))add('pesticide_incident_invalid_scope',{id:row.id});
  if(!Array.isArray(row.affectedHiveIds)||!Array.isArray(row.affectedHiveSnapshots))add('pesticide_incident_invalid_hive_links',{id:row.id});
  else{
   const snapshots=new Set(row.affectedHiveSnapshots.map(x=>x?.id).filter(Boolean));
   for(const hiveId of row.affectedHiveIds)if(!hives.has(hiveId)&&!snapshots.has(hiveId))add('pesticide_incident_hive_missing',{id:row.id,hiveId});
   if(row.scope==='selected_hives'&&!row.affectedHiveIds.length)add('pesticide_incident_selected_scope_empty',{id:row.id});
  }
  if(row.deadBeesCount!=null&&(!Number.isInteger(row.deadBeesCount)||row.deadBeesCount<0||row.deadBeesCount>10000000))add('pesticide_incident_invalid_dead_count',{id:row.id});
  if((row.latitude==null)!==(row.longitude==null)||row.latitude!=null&&(!Number.isFinite(Number(row.latitude))||row.latitude < -90||row.latitude>90||!Number.isFinite(Number(row.longitude))||row.longitude < -180||row.longitude>180))add('pesticide_incident_invalid_coordinates',{id:row.id});
  if(row.media!=null&&(!Array.isArray(row.media)||row.media.length>MAX_MEDIA||!row.media.every(x=>x&&x.kind==='image'&&typeof x.name==='string'&&x.name.length<=180&&['image/jpeg','image/png','image/webp','image/heic'].includes(x.type)&&typeof x.data==='string'&&/^data:image\/(?:jpeg|png|webp|heic);base64,/i.test(x.data)&&x.data.length<=MAX_MEDIA_DATA)))add('pesticide_incident_invalid_media',{id:row.id});
  if(row.causationStatus!=='unconfirmed')add('pesticide_incident_causation_overstated',{id:row.id});
 }
 return errors;
}
function summarizePesticideIncidents(rows){
 const items=(Array.isArray(rows)?rows:[]).filter(Boolean).slice().sort((a,b)=>String(b.observedAt).localeCompare(String(a.observedAt)));
 return {total:items.length,open:items.filter(x=>x.status==='open').length,withGps:items.filter(x=>x.latitude!=null&&x.longitude!=null).length,withSamples:items.filter(x=>!!x.sampleId).length,items};
}
root.PasekaIncident={VERSION:'pesticide-incident-v1',SCOPES,buildPesticideIncidentDraft,inspectPesticideIncidentIntegrity,summarizePesticideIncidents,validDateTime};
if(typeof module!=='undefined'&&module.exports)module.exports=root.PasekaIncident;
})(typeof window!=='undefined'?window:globalThis);
