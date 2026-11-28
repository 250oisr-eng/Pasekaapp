import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {IDBFactory} from 'fake-indexeddb';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('function openDB(){');
const end=html.indexOf('\nfunction readMain(){',start);
assert.ok(start>=0&&end>start,'real production openDB must be inspectable');
const source=html.slice(start,end);
const REQUIRED=['entrance_media','full_backup','main'];

function applicationOpen(factory,name){
 const deps={indexedDB:factory,DB:name,STORE:'main',BACKUP_STORE:'full_backup',
   db:null,isFreshDatabaseUpgrade:old=>old===0};
 const open=new Function('deps','with(deps){return ('+source+');}')(deps);
 return {open,deps};
}
function rawOpen(factory,name,version,upgrade){
 return new Promise((resolve,reject)=>{
  const request=factory.open(name,version);
  request.onupgradeneeded=()=>upgrade?.(request.result,request.transaction);
  request.onerror=()=>reject(request.error);
  request.onsuccess=()=>resolve(request.result);
 });
}
function settled(transaction){
 return new Promise((resolve,reject)=>{
  transaction.oncomplete=()=>resolve();
  transaction.onabort=()=>reject(transaction.error||new Error('transaction aborted'));
  transaction.onerror=()=>reject(transaction.error||new Error('transaction error'));
 });
}
function idbGet(db,store,key){
 return new Promise((resolve,reject)=>{
  const q=db.transaction(store,'readonly').objectStore(store).get(key);
  q.onsuccess=()=>resolve(q.result);
  q.onerror=()=>reject(q.error);
 });
}
async function seedLegacy(factory,name,version){
 const originalBytes=new Uint8Array([0,1,2,3,127,254,255]);
 const legacy=await rawOpen(factory,name,version,(db)=>{
  db.createObjectStore('main');
  if(version===2)db.createObjectStore('full_backup');
 });
 const record={meta:{schemaVersion:1,revisionId:'legacy-read-only'},hives:[{id:'h1',number:1}],
   families:[],records:[{id:'r1',date:'2026-01-01',text:'Legacy evidence'}],
   originalBytes:originalBytes.buffer,
   originalVideo:new Blob([originalBytes],{type:'video/mp4'})};
 const stores=version===2?['main','full_backup']:['main'];
 const tx=legacy.transaction(stores,'readwrite');
 const done=settled(tx);
 tx.objectStore('main').put(record,'state');
 if(version===2)tx.objectStore('full_backup').put({at:'2026-01-01',state:{meta:{schemaVersion:1,revisionId:'backup'}}},'2026-01-01');
 await done;
 legacy.close();
 return {originalBytes,record};
}
for(const version of [1,2]){
 test('B09 real IndexedDB v'+version+' upgrades to v3 without changing legacy state and media bytes',async()=>{
  const factory=new IDBFactory(),name='b09-legacy-'+version;
  const {originalBytes}=await seedLegacy(factory,name,version);
  const {open,deps}=applicationOpen(factory,name);
  assert.equal(await open(),false,'an existing old database must never be treated as new/empty');
  assert.equal(deps.db.version,3);
  assert.deepEqual(Array.from(deps.db.objectStoreNames),REQUIRED);
  const restored=await idbGet(deps.db,'main','state');
  assert.equal(restored.meta.revisionId,'legacy-read-only');
  assert.equal(restored.meta.schemaVersion,1,'opening IDB must not silently migrate app state');
  assert.deepEqual(restored.records,[{id:'r1',date:'2026-01-01',text:'Legacy evidence'}]);
  assert.deepEqual([...new Uint8Array(restored.originalBytes)],[...originalBytes]);
  assert.equal(restored.originalVideo.type,'video/mp4');
  assert.deepEqual([...new Uint8Array(await restored.originalVideo.arrayBuffer())],[...originalBytes]);
  if(version===2)assert.equal((await idbGet(deps.db,'full_backup','2026-01-01')).state.meta.revisionId,'backup');
  assert.equal((await idbGet(deps.db,'entrance_media','missing')),undefined);
  deps.db.close();
  const reopened=await rawOpen(factory,name,3);
  const reread=await idbGet(reopened,'main','state');
  assert.deepEqual([...new Uint8Array(await reread.originalVideo.arrayBuffer())],[...originalBytes]);
  assert.equal(reread.meta.revisionId,'legacy-read-only');
  reopened.close();
 });
}
test('B09 future IDB version is rejected without a downgrade or removal of its original data',async()=>{
 const factory=new IDBFactory(),name='b09-newer-than-app';
 const original=await rawOpen(factory,name,4,db=>db.createObjectStore('main'));
 const tx=original.transaction('main','readwrite'),done=settled(tx);
 tx.objectStore('main').put({meta:{schemaVersion:99},sentinel:'DO_NOT_TOUCH'},'state');
 await done;original.close();
 const {open,deps}=applicationOpen(factory,name);
 await assert.rejects(open(),error=>error?.name==='VersionError');
 assert.equal(deps.db,null);
 const untouched=await rawOpen(factory,name,4);
 assert.equal(untouched.version,4);
 assert.equal((await idbGet(untouched,'main','state')).sentinel,'DO_NOT_TOUCH');
 untouched.close();
});

function extractProductionFunction(name){
 const start=html.indexOf('function '+name+'(');
 assert.ok(start>=0,'production '+name+' must exist');
 const next=html.indexOf('\nfunction ',start+1);
 assert.ok(next>start,'production '+name+' must have a following function');
 return html.slice(start,next);
}
function productionWriteMainWithBackup(db,assertBackupNotFromNewerSchema){
 const deps={db,STORE:'main',BACKUP_STORE:'full_backup',assertBackupNotFromNewerSchema};
 return new Function('deps','with(deps){return ('+extractProductionFunction('writeMainWithBackup')+');}')(deps);
}
function makeData(revision,bytes){
 return {meta:{schemaVersion:15,revisionId:revision},hives:[{id:'preserved-hive'}],
   records:[{id:'preserved-event',text:'DO_NOT_LOSE'}],
   video:new Blob([new Uint8Array(bytes)],{type:'video/mp4'})};
}
async function writeSeed(db,main,backup){
 const tx=db.transaction(['main','full_backup'],'readwrite'),done=settled(tx);
 tx.objectStore('main').put(main,'state');
 if(backup)tx.objectStore('full_backup').put(backup,'previous');
 await done;
}
async function readBoth(db){
 const [main,backup]=await Promise.all([idbGet(db,'main','state'),idbGet(db,'full_backup','previous')]);
 return {main,backup};
}
async function originalBytes(state){return [...new Uint8Array(await state.video.arrayBuffer())]}
function schemaGuard(backup){
 const version=Number(backup?.state?.meta?.schemaVersion);
 if(Number.isFinite(version)&&version>15){
  const e=new Error('Autobackup newer schema');e.code='UNSUPPORTED_SCHEMA_VERSION_BACKUP';throw e;
 }
}
async function readyDb(name){
 const factory=new IDBFactory(),{open,deps}=applicationOpen(factory,name);
 assert.equal(await open(),true,'brand-new synthetic DB is the only fresh database');
 return {factory,db:deps.db};
}

test('B09 stale revision aborts both-store restoration and keeps original video bytes',async()=>{
 const {factory,db}=await readyDb('b09-stale-revision-atomic');
 const bytes=[1,2,5,10,80,255],old=makeData('fresh-user-revision',bytes);
 const oldBackup={at:'prior',state:makeData('prior-backup',[9,8,7])};
 await writeSeed(db,old,oldBackup);
 const write=productionWriteMainWithBackup(db,schemaGuard);
 await assert.rejects(write(makeData('attempted-overwrite',[4,4,4]),'stale-expected'),
   error=>error?.name==='PasekaConflictError');
 db.close();
 const reopened=await rawOpen(factory,'b09-stale-revision-atomic',3);
 const result=await readBoth(reopened);
 assert.equal(result.main.meta.revisionId,'fresh-user-revision');
 assert.deepEqual(await originalBytes(result.main),bytes);
 assert.equal(result.backup.state.meta.revisionId,'prior-backup');
 assert.deepEqual(await originalBytes(result.backup.state),[9,8,7]);
 reopened.close();
});

test('B09 newer-schema autobackup blocks atomic write without modifying either store',async()=>{
 const {factory,db}=await readyDb('b09-newer-backup-atomic');
 const old=makeData('live-revision',[0,255,127]);
 const backup={at:'newer',state:makeData('future-backup',[6,6,6])};
 backup.state.meta.schemaVersion=16;
 await writeSeed(db,old,backup);
 const write=productionWriteMainWithBackup(db,schemaGuard);
 await assert.rejects(write(makeData('restore-revision',[3,3,3]),'live-revision'),
   error=>error?.code==='UNSUPPORTED_SCHEMA_VERSION_BACKUP');
 db.close();
 const reopened=await rawOpen(factory,'b09-newer-backup-atomic',3);
 const result=await readBoth(reopened);
 assert.equal(result.main.meta.revisionId,'live-revision');
 assert.deepEqual(await originalBytes(result.main),[0,255,127]);
 assert.equal(result.backup.state.meta.schemaVersion,16);
 assert.deepEqual(await originalBytes(result.backup.state),[6,6,6]);
 reopened.close();
});

test('B09 explicit failure after second put rolls back both stores and preserved Blob bytes',async()=>{
 const {factory,db}=await readyDb('b09-abort-after-two-puts');
 const old=makeData('live-before-abort',[1,0,255,100]);
 const backup={at:'old',state:makeData('backup-before-abort',[2,3,4])};
 await writeSeed(db,old,backup);
 let injected=false;
 // Fault injection is scoped to this disposable DB. Abort after both writes are queued,
 // before commit, so the actual IDB transaction is responsible for full rollback.
 const failingDb={transaction(stores,mode){
   const tx=db.transaction(stores,mode);
   return new Proxy(tx,{
    get(target,key){
     if(key==='objectStore')return name=>{
      const store=target.objectStore(name);
      if(name!=='full_backup')return store;
      return new Proxy(store,{get(st,k){
       if(k==='put')return (...args)=>{
        const result=st.put(...args);
        injected=true;
        tx.abort();
        return result;
       };
       const v=Reflect.get(st,k,st);
       return typeof v==='function'?v.bind(st):v;
      }});
     };
     const v=Reflect.get(target,key,target);
     return typeof v==='function'?v.bind(target):v;
    },
    set(target,key,value){return Reflect.set(target,key,value,target)}
   });
 }};
 const write=productionWriteMainWithBackup(failingDb,schemaGuard);
 await assert.rejects(write(makeData('attempt-to-write',[99,98]),'live-before-abort'));
 assert.equal(injected,true,'fault must be reached after second write was queued');
 db.close();
 const reopened=await rawOpen(factory,'b09-abort-after-two-puts',3);
 const result=await readBoth(reopened);
 assert.equal(result.main.meta.revisionId,'live-before-abort');
 assert.deepEqual(await originalBytes(result.main),[1,0,255,100]);
 assert.equal(result.backup.state.meta.revisionId,'backup-before-abort');
 assert.deepEqual(await originalBytes(result.backup.state),[2,3,4]);
 reopened.close();
});
