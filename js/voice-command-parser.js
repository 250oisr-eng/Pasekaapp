function extractJournalOperationFields(input,kind){
 const source=String(input??'').trim();
 const normalized=source.toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
 const maps={
  treatment:{product:['название препарата','препарат'],active:['действующее вещество','активное вещество'],method:['способ применения','способ'],dose:['доза по инструкции','доза','дозировка','концентрация'],check:['дата контроля','контроль','проверка']},
  feeding:{type:['вид корма','тип корма','корм'],substance:['состав корма','состав'],amount:['количество','объем','объём'],concentration:['концентрация','соотношение','пропорция'],method:['способ подачи','способ','кормушка']}
 };
 const aliases=maps[kind];
 if(!aliases)return {fields:{},evidence:{},ambiguous:[],fieldCount:0};
 const aliasToField=new Map();
 for(const [field,names] of Object.entries(aliases))for(const name of names)aliasToField.set(name,field);
 const escapeRe=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const labelAlternatives=[...aliasToField.keys()].sort((a,b)=>b.length-a.length).map(escapeRe).join('|');
 const labelRe=new RegExp('(?:^|[;,\\n])\\s*('+labelAlternatives+')\\s*[:=—-]\\s*','giu');
 const matches=[...normalized.matchAll(labelRe)],found={};
 for(let i=0;i<matches.length;i++){
  const match=matches[i],field=aliasToField.get(match[1].trim());
  const start=match.index+match[0].length,end=i+1<matches.length?matches[i+1].index:normalized.length;
  const value=source.slice(start,end).trim().replace(/[;,\s]+$/u,'').trim();
  if(value)(found[field] ||= []).push(value);
 }
 const fields={},evidence={},ambiguous=[];
 for(const [field,values] of Object.entries(found)){
  const distinct=[...new Set(values.map(v=>v.toLocaleLowerCase('ru-RU')))];
  if(distinct.length!==1){ambiguous.push(field);continue}
  let value=values[0];
  if(kind==='treatment'&&field==='check'){
   let dateMatch=value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
   if(!dateMatch){const local=value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);if(local)dateMatch=[value,local[3],local[2],local[1]]}
   if(!dateMatch){ambiguous.push(field);continue}
   const [,y,m,d]=dateMatch,dt=new Date(Date.UTC(Number(y),Number(m)-1,Number(d)));
   if(dt.getUTCFullYear()!==Number(y)||dt.getUTCMonth()!==Number(m)-1||dt.getUTCDate()!==Number(d)){ambiguous.push(field);continue}
   value=y+'-'+m+'-'+d;
  }
  fields[field]=value;evidence[field]=values[0];
 }
 return {fields,evidence,ambiguous,fieldCount:Object.keys(fields).length};
}
function parseApiaryVoiceCommand(value,armed=false){
 const raw=String(value??'').trim();
 const normalized=raw.toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[.,!?;:]/g,' ').replace(/\s+/g,' ').trim();
 if(!normalized)return {type:'ignore'};
 if(/^(заверши голосовой режим|останови голосовой режим|стоп пасека)$/.test(normalized))return {type:'stop'};
 const wake=normalized.match(/^(?:пасека\s+)?слушай(?:\s+|$)/);
 if(!wake&&!armed)return {type:'ignore'};
 const command=wake?normalized.slice(wake[0].length).trim():normalized;
 if(!command)return {type:'wake'};
 const treatmentFields=command.match(/^(?:заполни\s+поля\s+обработки|внеси\s+данные\s+обработки|запиши\s+данные\s+обработки)\s*[:,-]?\s*(.+)$/);
 if(treatmentFields?.[1]?.trim()){
  const rawCommand=raw.replace(/^(?:пасека[\s,.:;!?-]+)?слушай[\s,.:;!?-]*/iu,'').trim();
  const rawValue=rawCommand.match(/^(?:заполни\s+поля\s+обработки|внеси\s+данные\s+обработки|запиши\s+данные\s+обработки)\s*[:,-]?\s*([\s\S]+)$/iu);
  return {type:'treatment_fields',text:(rawValue?.[1]||treatmentFields[1]).trim()};
 }
 const feedingFields=command.match(/^(?:заполни\s+поля\s+подкормки|внеси\s+данные\s+подкормки|запиши\s+данные\s+подкормки)\s*[:,-]?\s*(.+)$/);
 if(feedingFields?.[1]?.trim()){
  const rawCommand=raw.replace(/^(?:пасека[\s,.:;!?-]+)?слушай[\s,.:;!?-]*/iu,'').trim();
  const rawValue=rawCommand.match(/^(?:заполни\s+поля\s+подкормки|внеси\s+данные\s+подкормки|запиши\s+данные\s+подкормки)\s*[:,-]?\s*([\s\S]+)$/iu);
  return {type:'feeding_fields',text:(rawValue?.[1]||feedingFields[1]).trim()};
 }
 const inspectionFields=command.match(/^(?:заполни\s+поля\s+осмотра|внеси\s+показатели\s+осмотра|запиши\s+показатели\s+осмотра)\s*[:,-]?\s*(.+)$/);
 if(inspectionFields?.[1]?.trim()){
  const rawCommand=raw.replace(/^(?:пасека[\s,.:;!?-]+)?слушай[\s,.:;!?-]*/iu,'').trim();
  const rawInspection=rawCommand.match(/^(?:заполни\s+поля\s+осмотра|внеси\s+показатели\s+осмотра|запиши\s+показатели\s+осмотра)\s*[:,-]?\s*([\s\S]+)$/iu);
  return {type:'inspection_fields',text:(rawInspection?.[1]||inspectionFields[1]).trim()};
 }
 const journalDraft=command.match(/^(?:запиши\s+в\s+журнал|создай\s+черновик\s+записи|добавь\s+запись\s+в\s+журнал)\s*[:,-]?\s*(.+)$/);
 if(journalDraft?.[1]?.trim()){
  const rawCommand=raw.replace(/^(?:пасека[\s,.:;!?-]+)?слушай[\s,.:;!?-]*/iu,'').trim();
  const rawDraft=rawCommand.match(/^(?:запиши\s+в\s+журнал|создай\s+черновик\s+записи|добавь\s+запись\s+в\s+журнал)\s*[:,-]?\s*([\s\S]+)$/iu);
  return {type:'journal_draft',text:(rawDraft?.[1]||journalDraft[1]).trim()};
 }
 if(/^(подтверждаю|подтвердить)$/.test(command))return {type:'confirm'};
 if(/^(отмена|отмени)$/.test(command))return {type:'cancel'};
 if(/^(повтори|прочитай ответ)$/.test(command))return {type:'repeat'};
 if(/^(заверши голосовой режим|останови голосовой режим|стоп)$/.test(command))return {type:'stop'};
 return {type:'question',text:command};
}
