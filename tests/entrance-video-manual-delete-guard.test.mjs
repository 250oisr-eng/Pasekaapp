import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const extract=(name,next)=>{
 const start=html.indexOf('function '+name+'(');
 const end=html.indexOf(next,start);
 assert.ok(start>=0&&end>start,'function '+name+' must exist');
 return html.slice(start,end);
};
const writer=extract('deleteEntranceVideoBlob','function entranceBytes(');
const callerStart=html.indexOf('async function removeEntranceVideo(');
const callerEnd=html.indexOf('function toggleVarroaFields(',callerStart);
assert.ok(callerStart>=0&&callerEnd>callerStart);
const caller=html.slice(callerStart,callerEnd);
const readOnlyModule=(db)=>{
 const fn=new Function('db','Promise',writer+';return deleteEntranceVideoBlob;');
 return fn(db,Promise);
};
test('direct original deletion is denied before opening any write transaction',async()=>{
 const transactions=[];
 const db={transaction(...args){transactions.push(args);throw Error('must never open IndexedDB');}};
 const attempt=readOnlyModule(db);
 await assert.rejects(attempt('pending-original'),e=>
  e.code==='ENTRANCE_VIDEO_DELETE_BLOCKED'&&
  /распознавания/.test(e.message));
 assert.deepEqual(transactions,[]);
 assert.doesNotMatch(writer,/\.delete\(|\.clear\(|\.put\(|\.add\(/);
});
test('a supposedly completed or arbitrary ID cannot override the unconditional guard',async()=>{
 const transactions=[];
 const attempt=readOnlyModule({transaction(...args){transactions.push(args);throw Error('unexpected');}});
 for(const id of ['completed-video','legacy-video','','unknown']){
  await assert.rejects(attempt(id),e=>e.code==='ENTRANCE_VIDEO_DELETE_BLOCKED');
 }
 assert.equal(transactions.length,0);
});
test('live UI shows an explicitly disabled removal action, not a callable delete button',()=>{
 assert.match(html,/<button type="button" disabled title="Оригинал защищён до подтверждённого распознавания и очистки всех копий">Удаление заблокировано<\/button>/);
 assert.doesNotMatch(html,/onclick="removeEntranceVideo\(/);
 assert.doesNotMatch(html,/Удалить оригинал видео с этого устройства/);
});
test('old programmatic removal caller cannot execute a delete even with user confirmation',async()=>{
 const transactions=[];
 const db={transaction(...args){transactions.push(args);throw Error('unexpected');}};
 const messages=[];
 const run=new Function('db','Promise','$','alert',writer+caller+
  ';return removeEntranceVideo;')(db,Promise,()=>({set textContent(v){messages.push(v)}}),m=>messages.push(m));
 await run('any-video');
 assert.deepEqual(transactions,[]);
 assert.equal(messages.length,2);
 assert.ok(messages.every(m=>/заблокировано/.test(m)));
});
test('existing video capture and preview workflows remain wired',()=>{
 assert.match(html,/async function putEntranceVideo\(record\)/);
 assert.match(html,/hashBlobHex\(record\.blob\)/);
 assert.match(html,/async function handleEntranceVideoFile\(files\)/);
 assert.match(html,/async function viewEntranceVideo\(id\)/);
 assert.match(html,/function listEntranceVideos\(\)/);
 assert.match(html,/async function refreshEntranceVideos\(\)/);
});
