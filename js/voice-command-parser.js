function parseApiaryVoiceCommand(value,armed=false){
 const raw=String(value??'').trim();
 const normalized=raw.toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[.,!?;:]/g,' ').replace(/\s+/g,' ').trim();
 if(!normalized)return {type:'ignore'};
 if(/^(заверши голосовой режим|останови голосовой режим|стоп пасека)$/.test(normalized))return {type:'stop'};
 const wake=normalized.match(/^(?:пасека\s+)?слушай(?:\s+|$)/);
 if(!wake&&!armed)return {type:'ignore'};
 const command=wake?normalized.slice(wake[0].length).trim():normalized;
 if(!command)return {type:'wake'};
 if(/^(подтверждаю|подтвердить)$/.test(command))return {type:'confirm'};
 if(/^(отмена|отмени)$/.test(command))return {type:'cancel'};
 if(/^(повтори|прочитай ответ)$/.test(command))return {type:'repeat'};
 if(/^(заверши голосовой режим|останови голосовой режим|стоп)$/.test(command))return {type:'stop'};
 return {type:'question',text:command};
}
