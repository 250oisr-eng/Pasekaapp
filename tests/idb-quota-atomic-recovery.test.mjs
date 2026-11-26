import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {IDBFactory} from 'fake-indexeddb';

// Exercise actual production transaction routines; no second backup implementation.
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
function production(name,deps){
 const begin=html.indexOf('function '+name+'(');
 const next=/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
 next.lastIndex=begin+('function '+name+'(').length;
 const match=next.exec(html),end=match?.index??-1;
 assert.ok(begin>=0&&end>begin,'production function missing: '+name);
 return new Function('deps','with(deps){return ('+html.slice(begin,end)+');}')(deps);
}
function rawOpen(factory,name,version,upgrade){
 return new Promise((resolve,reject)=>{
  const q=factory.open(name,version);
  q.onupgradeneeded=()=>upgrade?.(q.result);
  q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
 });
}
function txDone(tx){return new Promise((resolve,reject)=>{
 tx.oncomplete=resolve;
 tx.onabort=()=>reject(tx.error||Error('abort'));
 tx.onerror=()=>reject(tx.error||Error('error'));
});}
async function get(db,store,key){
 return new Promise((resolve,reject)=>{
  const req=db.transaction(store,'readonly').objectStore(store).get(key);
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
}
const bytes=[0,1,3,100,127,254,255];
const oldState={meta:{schemaVersion:15,revisionId:'original-revision'},
 records:[{id:'record-1',comment:'do not lose'}],
 hives:[{id:'hive-1'}],video:new Blob([new Uint8Array(bytes)],{type:'video/mp4'})};
const entranceBytes=[9,0,254,1,100,255];
const oldEntrance={id:'video-original',hiveId:'hive-1',status:'waiting_for_server',
 capturedAt:'2026-11-25T10:00:00Z',bytes:entranceBytes.length,
 blob:new Blob([new Uint8Array(entranceBytes)],{type:'video/mp4'})};
const oldBackup={at:'before',state:{meta:{schemaVersion:14,revisionId:'backup-revision'},
 records:[{id:'backup-record'}],video:new Blob([new Uint8Array([255,4,2])],{type:'video/mp4'})}};
async function prepare(name){
 const factory=new IDBFactory();
 const db=await rawOpen(factory,name,3,d=>{
  d.createObjectStore('main');d.createObjectStore('full_backup');
  d.createObjectStore('entrance_media',{keyPath:'id'});
 });
 const tx=db.transaction(['main','full_backup','entrance_media'],'readwrite'),done=txDone(tx);
 tx.objectStore('main').put(oldState,'state');
 tx.objectStore('full_backup').put(oldBackup,'previous');
 tx.objectStore('entrance_media').put(oldEntrance);
 await done;
 return {db,factory,name};
}
function quotaDb(db,failStore){
 let invoked=0;
 const proxy={
  transaction(names,mode){
   const tx=db.transaction(names,mode);
   return new Proxy(tx,{
    get(target,key){
     if(key==='objectStore')return name=>{
      const store=target.objectStore(name);
      return new Proxy(store,{
       get(obj,field){
        if(field==='put'&&name===failStore)return ()=>{
         invoked++;
         throw new DOMException('Synthetic quota exhaustion','QuotaExceededError');
        };
        const original=Reflect.get(obj,field,obj);
        return typeof original==='function'?original.bind(obj):original;
       }
      });
     };
     const original=Reflect.get(target,key,target);
     return typeof original==='function'?original.bind(target):original;
    },
    set(target,key,value){return Reflect.set(target,key,value,target);}
   });
  }
 };
 return {proxy,count:()=>invoked};
}
async function assertPreserved(factory,name){
 const reopened=await rawOpen(factory,name,3);
 try{
  const state=await get(reopened,'main','state');
  const backup=await get(reopened,'full_backup','previous');
  assert.equal(state.meta.revisionId,'original-revision');
  assert.deepEqual(state.records,oldState.records);
  assert.deepEqual([...new Uint8Array(await state.video.arrayBuffer())],bytes);
  assert.equal(backup.state.meta.revisionId,'backup-revision');
  assert.deepEqual(backup.state.records,oldBackup.state.records);
  assert.deepEqual([...new Uint8Array(await backup.state.video.arrayBuffer())],[255,4,2]);
  const video=await get(reopened,'entrance_media','video-original');
  assert.equal(video.id,'video-original');
  assert.equal(video.hiveId,'hive-1');
  assert.equal(video.status,'waiting_for_server');
  assert.equal(video.bytes,entranceBytes.length);
  assert.deepEqual([...new Uint8Array(await video.blob.arrayBuffer())],entranceBytes);
  assert.equal(await get(reopened,'entrance_media','not-there'),undefined);
 }finally{reopened.close();}
}
for(const [operation,failedStore] of [
 ['writeMainIfUnchanged','main'],
 ['writeMainWithBackup','main'],
 ['writeMainWithBackup','full_backup'],
 ['writeAutoBackup','full_backup']
]){
 test('B09 QuotaExceededError '+operation+' at '+failedStore+' leaves main, backup and original Blob unchanged',async()=>{
  const {db,factory,name}=await prepare('b09-quota-'+operation+'-'+failedStore);
  const injected=quotaDb(db,failedStore);
  const deps={db:injected.proxy,STORE:'main',BACKUP_STORE:'full_backup',
   assertBackupNotFromNewerSchema(backup){
    if(Number(backup?.state?.meta?.schemaVersion)>15)throw Error('future backup');
   }};
  const fn=production(operation,deps);
  let rejection;
  const proposed={...oldState,meta:{schemaVersion:15,revisionId:'bad-new-revision'},
   video:new Blob([new Uint8Array([9,9])],{type:'video/mp4'})};
  try{await fn(proposed,'original-revision');}
  catch(e){rejection=e;}
  assert.equal(rejection?.name,'QuotaExceededError','quota error must not be swallowed');
  assert.equal(injected.count(),1,'quota fault must really interrupt a put');
  db.close();
  await assertPreserved(factory,name);
 });
}


// A late abort after IDBRequest onsuccess is different from a synchronous put
// throw: a write has been staged but must not be reported durable before
// transaction.oncomplete. No production DB/phone is involved.
function abortAfterStagedPut(db,selectedStore){
 let aborts=0,staged=0;
 const proxy={
  transaction(names,mode){
   const tx=db.transaction(names,mode);
   return new Proxy(tx,{
    get(target,key){
     if(key==='objectStore')return name=>{
      const store=target.objectStore(name);
      if(name!==selectedStore)return store;
      return new Proxy(store,{
       get(obj,field){
        if(field==='put')return (...args)=>{
         const req=obj.put(...args);
         staged++;
         req.addEventListener('success',()=>{
          if(aborts===0){aborts++;tx.abort();}
         });
         return req;
        };
        const value=Reflect.get(obj,field,obj);
        return typeof value==='function'?value.bind(obj):value;
       }
      });
     };
     const value=Reflect.get(target,key,target);
     return typeof value==='function'?value.bind(target):value;
    },
    set(target,key,value){return Reflect.set(target,key,value,target);}
   });
  }
 };
 return {proxy,counts:()=>({staged,aborts})};
}
for(const [operation,failedStore] of [
 ['writeMainIfUnchanged','main'],
 ['writeMainWithBackup','main'],
 ['writeMainWithBackup','full_backup'],
 ['writeAutoBackup','full_backup']
]){
 test('B09 late transaction abort after a staged '+operation+' '+failedStore+' put never commits any source',async()=>{
  const {db,factory,name}=await prepare('b09-late-abort-'+operation+'-'+failedStore);
  const injected=abortAfterStagedPut(db,failedStore);
  const deps={db:injected.proxy,STORE:'main',BACKUP_STORE:'full_backup',
   assertBackupNotFromNewerSchema(backup){
    if(Number(backup?.state?.meta?.schemaVersion)>15)throw Error('future backup');
   }};
  const fn=production(operation,deps);
  const proposed={...oldState,meta:{schemaVersion:15,revisionId:'staged-new-revision'},
    records:[{id:'staged-record',comment:'must never commit'}],
    video:new Blob([new Uint8Array([37,38])],{type:'video/mp4'})};
  try{
   await assert.rejects(fn(proposed,'original-revision'),
    err=>err instanceof Error||typeof err?.message==='string','aborted write must reject');
   assert.deepEqual(injected.counts(),{staged:1,aborts:1},
    'request onsuccess occurred before injected transaction abort');
  }finally{db.close();}
  await assertPreserved(factory,name);
 });
}
