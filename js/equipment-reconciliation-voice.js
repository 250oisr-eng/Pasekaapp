(()=>{'use strict';
const ALPHABET='АБГДЕЖКЛМНПРСТУФХЦЧШЩЭЮЯ245679';
const SPOKEN={
 'бэ':'Б','гэ':'Г','дэ':'Д','жэ':'Ж','ка':'К','эль':'Л','эм':'М','эн':'Н','пэ':'П','эр':'Р','эс':'С','тэ':'Т','эф':'Ф','ха':'Х','цэ':'Ц','че':'Ч','ша':'Ш','ща':'Щ'
};
const DIGITS={'два':'2','четыре':'4','пять':'5','шесть':'6','семь':'7','девять':'9'};
const digitSymbol=/^[245679]$/u;
const AMBIGUOUS=new Set(['а','е','у','э','ю','я','же','и']);
function parseReconciliationVoiceCommand(value){const text=String(value??'').trim().replace(/[.,!?;:]+$/g,'').replace(/\s+/g,' ');const match=text.match(/^(?:добавь|добавить|запиши|внеси)\s+(?:рамки|рамку|коды\s+рамок|код\s+рамки)\s+(.+)$/iu);return match?{type:'append_codes',codes:match[1].trim()}:{type:'ignore'}}
function appendRecognizedCodes(current,recognized,maxLength=12000){const before=String(current??'').trim(),addition=String(recognized??'').trim();if(!addition)return {ok:false,error:'empty_transcript'};const next=before?before+'\n'+addition:addition;if(next.length>maxLength)return {ok:false,error:'too_long'};return {ok:true,value:next,added:addition}}
function normalizeLegacyFrameCodes(value){
 const raw=String(value??'').trim(),codes=[],issues=[];
 if(!raw)return {raw,codes,issues:[{type:'empty',text:''}],canNormalize:false,preview:''};
 // Speech engines may insert commas between spoken symbols, not only between frame codes.
 const prepared=raw.toLocaleLowerCase('ru-RU').replace(/(^|[\s,;])р\s*-\s*/giu,'$1');
 const tokens=prepared.match(/[^\s,;.!?]+/gu)||[];
 let characters=[];
 const flushBeforeIssue=()=>{const completeLength=characters.length-characters.length%3;for(let i=0;i<completeLength;i+=3)codes.push(characters.slice(i,i+3).join(''));characters=[];};
 const flush=()=>{
  const completeLength=characters.length-characters.length%3;
  for(let i=0;i<completeLength;i+=3)codes.push(characters.slice(i,i+3).join(''));
  if(characters.length!==completeLength)issues.push({type:'incomplete',characters:characters.length-completeLength});
  characters=[];
 };
 for(let i=0;i<tokens.length;i++){
  const token=tokens[i],direct=token.toLocaleUpperCase('ru-RU');
  // Consume the conjunction here so a preceding qualifier can still reject «буква И».
  if(token==='и' && i>0 && i+1<tokens.length)continue;
  if(direct.length>=3&&direct.length%3===0&&[...direct].every(char=>ALPHABET.includes(char))){characters.push(...direct);continue}
  if(token==='буква'){
   const next=tokens[++i];
   const letter=next?.toLocaleUpperCase('ru-RU');
   if(letter?.length===1 && ALPHABET.includes(letter) && !digitSymbol.test(letter)){characters.push(letter);continue}
   if(Object.hasOwn(SPOKEN,next)){characters.push(SPOKEN[next]);continue}
   issues.push({type:'ambiguous',text:next||token});flushBeforeIssue();continue;
  }
  if(token==='цифра'){
   const next=tokens[++i];
   if(digitSymbol.test(next)){characters.push(next);continue}
   if(Object.hasOwn(DIGITS,next)){characters.push(DIGITS[next]);continue}
   issues.push({type:'ambiguous',text:next||token});flushBeforeIssue();continue;
  }
  if(digitSymbol.test(token)){characters.push(token);continue}
  if(Object.hasOwn(DIGITS,token)){characters.push(DIGITS[token]);continue}
  if(Object.hasOwn(SPOKEN,token)){characters.push(SPOKEN[token]);continue}
  if(AMBIGUOUS.has(token)){issues.push({type:'ambiguous',text:token});flushBeforeIssue();continue}
  issues.push({type:'unrecognized',text:token});flushBeforeIssue();
 }
 if(characters.length)flush();
 return {raw,codes,issues,canNormalize:codes.length>0&&issues.length===0,preview:codes.join(', ')};
}


// Decimal input is explicit: whole numbers, not groups of three symbols.
// Legacy letter dictation remains a separate path. No guessing a list boundary
// within a spoken compound number; use a pause/comma/«и» between numbers.
const ONES=['','один','два','три','четыре','пять','шесть','семь','восемь','девять'];
const TEENS=['десять','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать','шестнадцать','семнадцать','восемнадцать','девятнадцать'];
const TENS=['','','двадцать','тридцать','сорок','пятьдесят','шестьдесят','семьдесят','восемьдесят','девяносто'];
const HUNDREDS=['','сто','двести','триста','четыреста','пятьсот','шестьсот','семьсот','восемьсот','девятьсот'];
function numberBelowThousand(words){
 let i=0,n=0;const h=HUNDREDS.indexOf(words[i]);if(h>0){n=h*100;i++;}
 const teen=TEENS.indexOf(words[i]);if(teen>=0){n+=10+teen;i++;}
 else {const t=TENS.indexOf(words[i]);if(t>1){n+=t*10;i++;}
  const one=ONES.indexOf(words[i]==='одна'?'один':words[i]==='две'?'два':words[i]);if(one>0){n+=one;i++;}}
 return i===words.length&&i>0?n:null;
}
function parseSpokenNumber(value){
 const s=String(value??'').trim().toLocaleLowerCase('ru-RU').replace(/^р[\s\u2010-\u2015\u2212-]+/u,'').trim();
 if(/^[1-9][0-9]{0,5}$/.test(s))return s;
 const words=s.split(/\s+/u),k=words.findIndex(x=>/^тысяч(?:а|и)?$/.test(x));
 if(k<0){const n=numberBelowThousand(words);return n?String(n):null;}
 if(k===0&&words[0]!=='тысяча')return null;
 if(words.slice(k+1).some(x=>/^тысяч(?:а|и)?$/.test(x)))return null;
 const n=k===0?1:numberBelowThousand(words.slice(0,k)),r=k===words.length-1?0:numberBelowThousand(words.slice(k+1));
 return n&&r!==null?String(n*1000+r):null;
}
function normalizeSpokenFrameCodes(value){
 const raw=String(value??'').trim();if(!raw)return normalizeLegacyFrameCodes(raw);
 const chunks=raw.split(/[,;\n]+|\s+и\s+/u).map(x=>x.trim()).filter(Boolean);
 const isDecimal=s=>/^(?:Р[\s\u2010-\u2015\u2212-]+)?[1-9][0-9]{0,5}$/iu.test(s);
 const directList=s=>s.split(/\s+/u).every(isDecimal);
 const numericOnly=chunks.length>0&&chunks.every(s=>parseSpokenNumber(s)||directList(s));
 if(numericOnly){
  const codes=chunks.flatMap(s=>{const n=parseSpokenNumber(s);return n?[n]:s.split(/\s+/u).map(parseSpokenNumber);});
  return {raw,codes,issues:[],canNormalize:true,preview:codes.join(', ')};
 }
 // A valid historical letter stream must retain its old interpretation,
 // including punctuation inserted between individual spoken symbols.
 const legacy=normalizeLegacyFrameCodes(raw);
 if(legacy.canNormalize)return legacy;
 // If the historical reading is incomplete, accept explicitly separated
 // whole decimal numbers alongside complete historical codes, not fragments.
 if(chunks.length>1&&chunks.some(s=>parseSpokenNumber(s)||directList(s))){
  const codes=[],issues=[];
  for(const chunk of chunks){
   const n=parseSpokenNumber(chunk);
   if(n){codes.push(n);continue;}
   if(directList(chunk)){codes.push(...chunk.split(/\s+/u).map(parseSpokenNumber));continue;}
   const l=normalizeLegacyFrameCodes(chunk);codes.push(...l.codes);issues.push(...l.issues);
  }
  if(!issues.length&&codes.length)return {raw,codes,issues,canNormalize:true,preview:codes.join(', ')};
 }
 return legacy;
}


function parseMarkingLookup(raw){
 const value=String(raw??'').trim().toLocaleLowerCase('ru-RU').replace(/[.!?]+$/,'').trim();
 const request=value.match(/^(?:(?:где(?: находится)?|найди|покажи местоположение)\s+)?(улей|улья|улье|семья|семью|семьи|матка|матку|матки|корпус|корпуса|рамка|рамку|рамки)\s+(?:номер\s+)?(.+)$/u);
 const prefix=value.match(/^([рксм])[\u2010-\u2015\u2212-]([1-9]\d{0,5}|[а-я0-9]{3})$/u);
 if(!request&&!prefix)return null;
 const kind=prefix?({р:'frame',к:'body',с:'family',м:'queen'})[prefix[1]]:request[1].startsWith('ул')?'hive':request[1].startsWith('сем')?'family':request[1].startsWith('мат')?'queen':request[1].startsWith('кор')?'body':'frame';
 let tail=prefix?prefix[2]:request[2].trim();
 const own=({frame:'р',body:'к',family:'с',queen:'м'})[kind];
 if(own)tail=tail.replace(new RegExp('^'+own+'[\\s\\u2010-\\u2015\\u2212-]+','u'),'');
 let code=parseSpokenNumber(tail);
 if(!code&&['frame','body'].includes(kind)&&/^[а-я0-9]{3}$/u.test(tail)&&[...tail.toUpperCase()].every(c=>ALPHABET.includes(c)))code=tail.toUpperCase();
 if(!code&&!/^(?:где(?: находится)?|найди|покажи местоположение)\s/u.test(value))return null;
 return {kind,code};
}

function validateEditedFrameCodes(codes){
 const errors=[];
 if(!Array.isArray(codes)||!codes.length)return {ok:false,errors:[{index:-1,reason:'empty'}]};
 codes.forEach((raw,index)=>{
  const code=String(raw??'').toLocaleUpperCase('ru-RU');
  if(/^[1-9][0-9]{0,5}$/.test(code))return;
  if(code.length!==3){errors.push({index,reason:'length'});return}
  for(let position=0;position<3;position++)if(!ALPHABET.includes(code[position]))errors.push({index,position,reason:'character',value:code[position]});
 });
 return {ok:errors.length===0,errors};
}

window.PasekaReconciliationVoice={parseReconciliationVoiceCommand,appendRecognizedCodes,normalizeSpokenFrameCodes,parseSpokenNumber,parseMarkingLookup,validateEditedFrameCodes};
})();