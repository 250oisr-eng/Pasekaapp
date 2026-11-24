import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {IDBFactory} from 'fake-indexeddb';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
function load(name,deps){
 const start=html.indexOf('function '+name+'(){');
 assert.ok(start>=0,'must exercise production '+name);
 const next=/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
 next.lastIndex=start+('function '+name+'(){').length;
 const end=next.exec(html);
 assert.ok(end,'must isolate production function from next declaration');
 return new Function('deps','with(deps){return ('+html.slice(start,end.index)+');}')(deps);
}
const rawOpen=(factory,name,version,upgrade)=>new Promise((resolve,reject)=>{
 const req=factory.open(name,version);
 req.onupgradeneeded=()=>upgrade?.(req.result);
 req.onsuccess=()=>resolve(req.result);
 req.onerror=()=>reject(req.error);
});
const transactionDone=tx=>new Promise((resolve,reject)=>{
 tx.oncomplete=resolve;
 tx.onabort=()=>reject(tx.error||Error('abort'));
 tx.onerror=()=>reject(tx.error||Error('error'));
});
const get=(db,store,key)=>new Promise((resolve,reject)=>{
 const q=db.transaction(store,'readonly').objectStore(store).get(key);
 q.onsuccess=()=>resolve(q.result);
 q.onerror=()=>reject(q.error);
});

for(const stores of [['main'],['main','full_backup']]){
 test('B09 malformed existing v3 '+stores.join('+')+' refuses open without modifying historical data',async()=>{
  const factory=new IDBFactory(),name='b09-malformed-'+stores.join('-');
  const existing=await rawOpen(factory,name,3,db=>{
   for(const store of stores)db.createObjectStore(store);
  });
  const originalBytes=[0,1,127,254,255];
  const record={meta:{revisionId:'KEEP-ORIGINAL',schemaVersion:1},
   hives:[{id:'h-legacy'}],records:[{id:'r-legacy',text:'Do not lose'}],
   originalVideo:new Blob([new Uint8Array(originalBytes)],{type:'video/mp4'})};
  const tx=existing.transaction(stores,'readwrite'),done=transactionDone(tx);
  tx.objectStore('main').put(record,'state');
  if(stores.includes('full_backup'))tx.objectStore('full_backup').put({state:{sentinel:'KEEP-BACKUP'}},'previous');
  await done;
  existing.close();

  const deps={indexedDB:factory,DB:name,STORE:'main',BACKUP_STORE:'full_backup',db:null,
   isFreshDatabaseUpgrade:oldVersion=>oldVersion===0};
  const appOpen=load('openDB',deps);
  await assert.rejects(appOpen(),/Неполная структура локальной базы/);
  assert.equal(deps.db,null,'failure must not leave an active app database handle');

  const reopened=await rawOpen(factory,name,3);
  assert.deepEqual(Array.from(reopened.objectStoreNames),stores.sort(),
   'existing broken v3 must not be silently recreated or upgraded');
  const original=await get(reopened,'main','state');
  assert.equal(original.meta.revisionId,'KEEP-ORIGINAL');
  assert.deepEqual(original.records,[{id:'r-legacy',text:'Do not lose'}]);
  assert.deepEqual([...new Uint8Array(await original.originalVideo.arrayBuffer())],originalBytes);
  if(stores.includes('full_backup'))
   assert.equal((await get(reopened,'full_backup','previous')).state.sentinel,'KEEP-BACKUP');
  reopened.close();
 });
}

function controlledRead(name){
 const request={result:null,error:null};
 const tx={error:null,objectStore(){return {get(){return request}};}};
 const deps={db:{transaction(){return tx}},STORE:'main',BACKUP_STORE:'full_backup',autoBackupInfo:'NOT_COMMITTED'};
 const fn=load(name,deps);
 return {request,tx,deps,read:fn};
}

for(const name of ['readMain','readAutoBackup']){
 test('B09 '+name+' does not accept request success if readonly transaction subsequently aborts',async()=>{
  const h=controlledRead(name),pending=h.read();
  let outcome='pending';
  pending.then(()=>{outcome='resolved'},()=>{outcome='rejected'});
  h.request.result={state:{sentinel:'UNCOMMITTED'}};
  h.request.onsuccess();
  await Promise.resolve();
  assert.equal(outcome,'pending','onsuccess is not a durable transaction boundary');
  h.tx.onabort();
  await assert.rejects(pending,/прерван/);
  assert.equal(h.deps.autoBackupInfo,'NOT_COMMITTED','aborted backup read must not publish metadata');
 });
 test('B09 '+name+' only resolves after transaction completion',async()=>{
  const h=controlledRead(name),pending=h.read();
  const value={state:{sentinel:'COMMITTED'}};
  h.request.result=value;
  h.request.onsuccess();
  h.tx.oncomplete();
  assert.deepEqual(await pending,value);
  if(name==='readAutoBackup')assert.equal(h.deps.autoBackupInfo,value);
 });
}
