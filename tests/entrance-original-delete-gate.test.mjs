import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function load(name,deps={}){
 const begin=html.indexOf('function '+name+'(');
 assert.ok(begin>=0,name+' source not found');
 const next=/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
 next.lastIndex=begin+name.length+10;
 const found=next.exec(html);
 const start=html.slice(Math.max(0,begin-6),begin)==='async '?begin-6:begin;
 const source=html.slice(start,found?found.index:html.indexOf('</script>',begin));
 return new Function('deps','with(deps){return ('+source+');}')(deps);
}
test('direct original-video delete always fails closed without a readwrite transaction',async()=>{
 let transactions=0, deletes=0;
 const db={transaction(){transactions++;return {objectStore(){return {delete(){deletes++;}}}}}};
 const fn=load('deleteEntranceVideoBlob',{db});
 for(const id of ['original-01','','..','legacy']){
  await assert.rejects(fn(id),error=>error?.code==='ENTRANCE_VIDEO_DELETE_BLOCKED' && /заблокировано/.test(error.message));
 }
 assert.equal(transactions,0);
 assert.equal(deletes,0);
});
test('UI no longer offers direct original-video deletion',()=>{
 const start=html.indexOf('async function refreshEntranceVideos(){');
 const end=html.indexOf('\nasync function inspectEntranceVideoFile(',start);
 const source=html.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.doesNotMatch(source,/onclick="removeEntranceVideo\(/);
 assert.match(source,/Оригинал защищён от удаления/);
 assert.match(source,/viewEntranceVideo/,'original video remains accessible for viewing');
});
test('legacy UI removal handler cannot reach storage mutation or claim deletion',async()=>{
 const messages=[];
 const denied=load('deleteEntranceVideoBlob',{db:{transaction(){throw new Error('Storage must not be accessed')}}});
 const remove=load('removeEntranceVideo',{deleteEntranceVideoBlob:denied,alert:message=>messages.push(message),confirm(){throw new Error('Confirmation alone is not a recovery gate')}});
 assert.equal(await remove('protected-01'),false);
 assert.equal(messages.length,1);
 assert.match(messages[0],/заблокировано/);
});
test('video copy-protection regressions do not change normal read path',()=>{
 const start=html.indexOf('function getEntranceVideo(id){');
 const end=html.indexOf('\nfunction deleteEntranceVideoBlob(',start);
 const code=html.slice(start,end);
 assert.match(code,/transaction\('entrance_media','readonly'\)/);
 assert.match(code,/\.get\(id\)/);
 assert.doesNotMatch(code,/\.delete\(|\.clear\(/);
});

test('full database reset refuses confirmations and cannot delete original video stores',async()=>{
 const start=html.indexOf('async function deleteAllData(){');
 const end=html.indexOf("\ndocument.querySelectorAll('nav button')",start);
 assert.ok(start>=0&&end>start);
 const code=html.slice(start,end);
 assert.doesNotMatch(code,/indexedDB\\.deleteDatabase\\(|\\.clear\\(/);
 const messages=[];
 const deps={
  rejectWhileStartupNotReady:()=>null,
  alert:message=>messages.push(message),
  confirm(){throw new Error('USER_CONFIRMATION_IS_NOT_FULL_RECOVERY')},
  prompt(){throw new Error('TYPED_CONFIRMATION_IS_NOT_FULL_RECOVERY')},
  indexedDB:{deleteDatabase(){throw new Error('DATABASE_DELETE_MUST_NOT_RUN')}},
  db:{close(){throw new Error('DATABASE_CLOSE_MUST_NOT_RUN')}}
 };
 const fn=new Function('deps','with(deps){return ('+code+');}')(deps);
 assert.equal(await fn(),false);
 assert.equal(messages.length,1);
 assert.match(messages[0],/Без отдельно проверенного полного архива и независимого восстановления/);
});
