(()=>{'use strict';
const ALPHABET='АБГДЕЖКЛМНПРСТУФХЦЧШЩЭЮЯ245679';
const SPOKEN={
 'бэ':'Б','гэ':'Г','дэ':'Д','жэ':'Ж','ка':'К','эль':'Л','эм':'М','эн':'Н','пэ':'П','эр':'Р','эс':'С','тэ':'Т','эф':'Ф','ха':'Х','цэ':'Ц','че':'Ч','ша':'Ш','ща':'Щ'
};
const DIGITS={'два':'2','четыре':'4','пять':'5','шесть':'6','семь':'7','девять':'9'};
const digitSymbol=/^[245679]$/u;
const AMBIGUOUS=new Set(['а','е','у','э','ю','я','же','и']);
function parseReconciliationVoiceCommand(value){const text=String(value??'').trim().replace(/[.,!?;:]+$/g,'').replace(/\s+/g,' ');const match=text.match(/^(?:добавь|добавить|запиши|внеси)\s+(?:рамки|коды\s+рамок)\s+(.+)$/iu);return match?{type:'append_codes',codes:match[1].trim()}:{type:'ignore'}}
function appendRecognizedCodes(current,recognized,maxLength=12000){const before=String(current??'').trim(),addition=String(recognized??'').trim();if(!addition)return {ok:false,error:'empty_transcript'};const next=before?before+'\n'+addition:addition;if(next.length>maxLength)return {ok:false,error:'too_long'};return {ok:true,value:next,added:addition}}
function normalizeSpokenFrameCodes(value){
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

function validateEditedFrameCodes(codes){
 const errors=[];
 if(!Array.isArray(codes)||!codes.length)return {ok:false,errors:[{index:-1,reason:'empty'}]};
 codes.forEach((raw,index)=>{
  const code=String(raw??'').toLocaleUpperCase('ru-RU');
  if(code.length!==3){errors.push({index,reason:'length'});return}
  for(let position=0;position<3;position++)if(!ALPHABET.includes(code[position]))errors.push({index,position,reason:'character',value:code[position]});
 });
 return {ok:errors.length===0,errors};
}

window.PasekaReconciliationVoice={parseReconciliationVoiceCommand,appendRecognizedCodes,normalizeSpokenFrameCodes,validateEditedFrameCodes};
})();