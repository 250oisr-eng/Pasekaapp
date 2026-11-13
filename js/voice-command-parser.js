function parseApiaryVoiceCommand(value,armed=false){
 const raw=String(value??'').trim();
 const normalized=raw.toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[.,!?;:]/g,' ').replace(/\s+/g,' ').trim();
 if(!normalized)return {type:'ignore'};
 if(/^(заверши голосовой режим|останови голосовой режим|стоп пасека)$/.test(normalized))return {type:'stop'};
 const wake=normalized.match(/^(?:пасека\s+)?слушай(?:\s+|$)/);
 if(!wake&&!armed)return {type:'ignore'};
 const command=wake?normalized.slice(wake[0].length).trim():normalized;
 if(!command)return {type:'wake'};
 const inspectionFields=command.match(/^(?:заполни\s+поля\s+осмотра|внеси\s+показатели\s+осмотра|запиши\s+показатели\s+осмотра)\s*[:,-]?\s*(.+)$/);
 if(inspectionFields?.[1]?.trim())return {type:'inspection_fields',text:inspectionFields[1].trim()};
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
