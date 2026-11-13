(()=>{'use strict';
const ALPHABET='АБГДЕЖКЛМНПРСТУФХЦЧШЩЭЮЯ245679';
const SPOKEN={
 'бэ':'Б','гэ':'Г','дэ':'Д','жэ':'Ж','ка':'К','эль':'Л','эм':'М','эн':'Н','пэ':'П','эр':'Р','эс':'С','тэ':'Т','эф':'Ф','ха':'Х','цэ':'Ц','че':'Ч','ша':'Ш','ща':'Щ'
};
const DIGITS={'два':'2','четыре':'4','пять':'5','шесть':'6','семь':'7','девять':'9'};
const AMBIGUOUS=new Set(['а','е','у','э','ю','я','же','и']);
function parseReconciliationVoiceCommand(value){const text=String(value??'').trim().replace(/[.,!?;:]+$/g,'').replace(/\s+/g,' ');const match=text.match(/^(?:добавь|добавить|запиши|внеси)\s+(?:рамки|коды\s+рамок)\s+(.+)$/iu);return match?{type:'append_codes',codes:match[1].trim()}:{type:'ignore'}}
function appendRecognizedCodes(current,recognized,maxLength=12000){const before=String(current??'').trim(),addition=String(recognized??'').trim();if(!addition)return {ok:false,error:'empty_transcript'};const next=before?before+'\n'+addition:addition;if(next.length>maxLength)return {ok:false,error:'too_long'};return {ok:true,value:next,added:addition}}
function normalizeSpokenFrameCodes(value){
 const raw=String(value??'').trim(),codes=[],issues=[];
 if(!raw)return {raw,codes,issues:[{type:'empty',text:''}],canNormalize:false,preview:''};
 // Speech engines may insert commas between spoken symbols, not only between frame codes.
 const prepared=raw.toLocaleLowerCase('ru-RU').replace(/(^|[\s,;])р\s*-\s*/giu,'$1');
 const tokens=prepared.match(/[^\s,;.!?]+/gu)||[];
 const explicitLetters={а:'А',е:'Е',у:'У',э:'Э',ю:'Ю',я:'Я'};
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
  if(direct.length>=3&&direct.length%3===0&&[...direct].every(char=>ALPHABET.includes(char))){characters.push(...direct);continue}
  if(token==='буква'){
   const next=tokens[++i];
   if(next&&explicitLetters[next]){characters.push(explicitLetters[next]);continue}
   if(next&&SPOKEN[next]){characters.push(SPOKEN[next]);continue}
   issues.push({type:'ambiguous',text:next||token});flushBeforeIssue();continue;
  }
  if(token==='цифра'){
   const next=tokens[++i];
   if(next&&DIGITS[next]){characters.push(DIGITS[next]);continue}
   issues.push({type:'ambiguous',text:next||token});flushBeforeIssue();continue;
  }
  if(/^[245679]$/.test(token)){characters.push(token);continue}
  if(DIGITS[token]){characters.push(DIGITS[token]);continue}
  if(SPOKEN[token]){characters.push(SPOKEN[token]);continue}
  if(AMBIGUOUS.has(token)){issues.push({type:'ambiguous',text:token});flushBeforeIssue();continue}
  issues.push({type:'unrecognized',text:token});flushBeforeIssue();
 }
 if(characters.length)flush();
 return {raw,codes,issues,canNormalize:codes.length>0&&issues.length===0,preview:codes.join(', ')};
}
window.PasekaReconciliationVoice={parseReconciliationVoiceCommand,appendRecognizedCodes,normalizeSpokenFrameCodes};
})();