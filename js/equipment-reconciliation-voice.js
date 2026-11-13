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
 const prepared=raw.toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\bр\s*-\s*/giu,' ');
 const segments=prepared.split(/[;,\n.!?]+|\s+и\s+/u).map(x=>x.trim()).filter(Boolean);
 for(const segment of segments){
  const tokens=segment.split(/[\s-]+/u).filter(Boolean),chars=[];let issue=null;
  for(const token of tokens){
   const direct=token.toLocaleUpperCase('ru-RU');
   if(direct.length===3&&[...direct].every(char=>ALPHABET.includes(char))){chars.push(...direct);continue}
   if(/^[245679]$/.test(token)){chars.push(token);continue}
   if(DIGITS[token]){chars.push(DIGITS[token]);continue}
   if(SPOKEN[token]){chars.push(SPOKEN[token]);continue}
   if(AMBIGUOUS.has(token)){issue={type:'ambiguous',text:token};break}
   issue={type:'unrecognized',text:token};break;
  }
  if(issue){issues.push({...issue,segment});continue}
  if(chars.length===0)continue;
  if(chars.length%3!==0){issues.push({type:'incomplete',segment,characters:chars.length});continue}
  for(let i=0;i<chars.length;i+=3)codes.push(chars.slice(i,i+3).join(''));
 }
 return {raw,codes,issues,canNormalize:codes.length>0&&issues.length===0,preview:codes.join(', ')};
}
window.PasekaReconciliationVoice={parseReconciliationVoiceCommand,appendRecognizedCodes,normalizeSpokenFrameCodes};
})();