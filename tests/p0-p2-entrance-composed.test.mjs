import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {IDBFactory} from 'fake-indexeddb';
import {createHash} from 'node:crypto';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function load(name,deps){
 const pattern=new RegExp('(?:async\\s+)?function\\s+'+name+'\\s*\\(');
 const m=pattern.exec(html);
 assert.ok(m,'missing '+name);
 const next=/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
 next.lastIndex=m.index+m[0].length;
 const stop=next.exec(html);
 const end=name==='deleteAllData' ? html.indexOf("\ndocument.querySelectorAll(",m.index) : (stop?stop.index:html.indexOf('</script>',m.index));
 assert.ok(end>m.index,'missing function boundary');
 return new Function('deps','with(deps){return ('+html.slice(m.index,end)+');}')(deps);
}
async function create(){
 const factory=new IDBFactory();
 const request=factory.open('combined-p0-p2-test',1);
 request.onupgradeneeded=()=>{request.result.createObjectStore('entrance_media',{keyPath:'id'});};
 return await new Promise((yes,no)=>{request.onsuccess=()=>yes(request.result);request.onerror=()=>no(request.error)});
}
async function record(db,id){
 return await new Promise((yes,no)=>{
  const req=db.transaction('entrance_media','readonly').objectStore('entrance_media').get(id);
  req.onsuccess=()=>yes(req.result);req.onerror=()=>no(req.error);
 });
}
test('P0+P2 composed: metadata cursor is read-only; delete helper and whole-db reset cannot remove original',async()=>{
 const db=await create();
 try{
  const blob=new Blob([Uint8Array.from([0,1,2,3,248,255])],{type:'video/mp4'});
  const before=createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');
  const tx=db.transaction('entrance_media','readwrite');
  tx.objectStore('entrance_media').add({id:'protected',hiveId:'h1',capturedAt:'2026-11-25',status:'waiting_for_server',blob});
  await new Promise((yes,no)=>{tx.oncomplete=yes;tx.onerror=()=>no(tx.error);tx.onabort=()=>no(tx.error)});
  const deps={db,rejectWhileStartupNotReady:()=>null};
  const listed=await load('listEntranceVideos',deps)();
  assert.deepEqual(listed.map(item=>item.id),['protected']);
  assert.equal(Object.hasOwn(listed[0],'blob'),false);
  assert.equal(listed[0].status,'waiting_for_server');
  await assert.rejects(load('deleteEntranceVideoBlob',deps)('protected'),{code:'ENTRANCE_VIDEO_DELETE_BLOCKED'});
  const messages=[];
  const reset=load('deleteAllData',{
   db,rejectWhileStartupNotReady:()=>null,alert:m=>messages.push(m),
   indexedDB:{deleteDatabase(){throw Error('DB_RESET_MUST_NOT_RUN')}},
   confirm(){throw Error('CONFIRM_IS_NOT_RECOVERY')},prompt(){throw Error('PROMPT_IS_NOT_RECOVERY')}
  });
  assert.equal(await reset(),false);
  assert.match(messages.join(' '),/заблокирована/);
  const original=await record(db,'protected');
  const after=createHash('sha256').update(Buffer.from(await original.blob.arrayBuffer())).digest('hex');
  assert.equal(after,before);
  assert.equal(original.id,'protected');
 } finally {db.close();}
});

test('composed media insert rejects duplicate id and preserves original Blob hash',async()=>{
 const db=await create();
 try{
  const put=load('putEntranceVideo',{db,rejectWhileStartupNotReady:()=>null});
  const blob=new Blob([Uint8Array.from([0,255,18,5])],{type:'video/mp4'});
  const checksum=createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');
  await put({id:'collision-original',blob,hiveId:'h1'});
  await assert.rejects(put({id:'collision-original',blob:new Blob(['different'])}));
  const preserved=await record(db,'collision-original');
  const after=createHash('sha256').update(Buffer.from(await preserved.blob.arrayBuffer())).digest('hex');
  assert.equal(after,checksum,'original Blob remains byte-identical after failed duplicate insert');
 }finally{db.close();}
});
