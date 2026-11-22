import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';

new Function(readFileSync('js/paseka-sha256.js','utf8'))();
new Function(readFileSync('js/paseka-archive.js','utf8'))();
new Function(readFileSync('js/paseka-archive-restore.js','utf8'))();
const Archive=globalThis.PasekaArchive;
const Restore=globalThis.PasekaArchiveRestore;
const LIVE={meta:{schemaVersion:12,revisionId:'live-before-import'},hives:[],families:[],records:[]};

function openDb(){
 const factory=new IDBFactory();
 return new Promise((resolve,reject)=>{
  const req=factory.open('paseka-enumeration-negative-fixtures',1);
  req.onupgradeneeded=()=>{
   const db=req.result;
   db.createObjectStore('main');
   db.createObjectStore('full_backup');
   db.createObjectStore('entrance_media',{keyPath:'id'});
   const stage=db.createObjectStore('archive_staging',{keyPath:'id'});
   stage.createIndex('sessionId','sessionId');
   stage.createIndex('kind','kind');
   stage.createIndex('backupId','backupId',{unique:true});
   db.createObjectStore('archive_history',{keyPath:'backupId'});
  };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error);
 });
}
function put(db,store,value,key){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(store,'readwrite');
  const s=tx.objectStore(store);
  if(key===undefined)s.put(value);else s.put(value,key);
  tx.oncomplete=resolve;
  tx.onabort=tx.onerror=()=>reject(tx.error);
 });
}
function get(db,store,key){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(store,'readonly');
  const req=tx.objectStore(store).get(key);
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error);
 });
}
function rows(db,store){
 return new Promise((resolve,reject)=>{
  const req=db.transaction(store,'readonly').objectStore(store).getAll();
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error);
 });
}
// Synthetic adapter: the real IndexedDB request executes normally but the
// caller sees an unexpected result. This tests fail-closed consumers without
// touching device data, replacing the DB, or falsifying the browser API.
function corruptGetAll(db, storeName, replacement, modeFilter=null){
 return {
  objectStoreNames:db.objectStoreNames,
  transaction(...args){
   const tx=db.transaction(...args);
   if(modeFilter && (args[1]||'readonly')!==modeFilter)return tx;
   return new Proxy(tx,{get(target,prop){
    if(prop!=='objectStore')return Reflect.get(target,prop,target);
    return name=>{
     const objectStore=target.objectStore(name);
     if(name!==storeName)return objectStore;
     return new Proxy(objectStore,{get(store,field){
      if(field!=='getAll')return Reflect.get(store,field,store);
      return (...requestArgs)=>{
       const actual=store.getAll(...requestArgs);
       return new Proxy(actual,{
        get(req,key){
         if(key==='result')return replacement;
         return Reflect.get(req,key,req);
        },
        set(req,key,value){return Reflect.set(req,key,value,req);}
       });
      };
     }});
    };
   }});
  }
 };
}
async function fixtureArchive(){
 const archived={meta:{schemaVersion:12,revisionId:'archive-revision'},hives:[],families:[],records:[]};
 const blob=new Blob([JSON.stringify({app:'Paseka',state:archived})],{type:'application/json'});
 const manifest={
  format:Archive.FORMAT,version:Archive.VERSION,backupId:'synthetic-media-integrity-1',
  createdAt:'2026-11-22T10:00:00Z',schemaVersion:12,
  entries:[{path:'state.json',kind:'state',size:blob.size,mimeType:'application/json',
   chunkSize:Archive.CHUNK_BYTES,chunkSha256:await Archive.hashBlobChunks(blob,webcrypto)}]
 };
 return Archive.buildArchiveBlob(manifest,[blob]);
}
async function seeded(){
 const db=await openDb();
 await put(db,'main',structuredClone(LIVE),'state');
 return db;
}
async function stage(db,archive=undefined){
 return Restore.stageArchiveForRestore(db,archive||await fixtureArchive(),webcrypto,Archive,()=>true);
}

test('normal empty video store supports verified staging without real media',async()=>{
 const db=await seeded();
 try{
  const result=await stage(db);
  assert.equal(result.session.status,'ready');
  assert.deepEqual(await rows(db,'entrance_media'),[]);
  assert.equal((await get(db,'main','state')).meta.revisionId,LIVE.meta.revisionId);
 }finally{db.close();}
});
for(const bad of [undefined,null,{},false]){
 test('unverified read-only media listing blocks archive staging: '+String(bad),async()=>{
  const db=await seeded();
  try{
   await assert.rejects(stage(corruptGetAll(db,'entrance_media',bad,'readonly')),
    {code:'RESTORE_MEDIA_ENUMERATION_UNVERIFIED'});
   assert.equal((await rows(db,'archive_staging')).length,0);
   assert.equal((await get(db,'main','state')).meta.revisionId,LIVE.meta.revisionId);
  }finally{db.close();}
 });
}
test('unverified media listing within staging write lock blocks creation',async()=>{
 const db=await seeded();
 try{
  await assert.rejects(stage(corruptGetAll(db,'entrance_media',null,'readwrite')),
   {code:'RESTORE_MEDIA_ENUMERATION_UNVERIFIED'});
  assert.equal((await rows(db,'archive_staging')).length,0);
 }finally{db.close();}
});
test('unverified media baseline blocks archive commit without overwriting live state',async()=>{
 const db=await seeded();
 try{
  const result=await stage(db);
  await assert.rejects(
   Restore.commitStagedArchive(corruptGetAll(db,'entrance_media',null,'readonly'),
    result.session.sessionId,LIVE.meta.revisionId,webcrypto,Archive,()=>true),
   {code:'RESTORE_MEDIA_ENUMERATION_UNVERIFIED'});
  assert.equal((await get(db,'main','state')).meta.revisionId,LIVE.meta.revisionId);
  assert.equal((await rows(db,'archive_history')).length,0);
 }finally{db.close();}
});
test('unverified media listing inside final write lock aborts archive commit',async()=>{
 const db=await seeded();
 try{
  const result=await stage(db);
  await assert.rejects(
   Restore.commitStagedArchive(corruptGetAll(db,'entrance_media',null,'readwrite'),
    result.session.sessionId,LIVE.meta.revisionId,webcrypto,Archive,()=>true),
   {code:'RESTORE_MEDIA_ENUMERATION_UNVERIFIED'});
  assert.equal((await get(db,'main','state')).meta.revisionId,LIVE.meta.revisionId);
  assert.equal((await rows(db,'archive_history')).length,0);
 }finally{db.close();}
});
test('unverified history listing forbids deletion of referenced staged files',async()=>{
 const db=await seeded();
 try{
  const result=await stage(db);
  const sid=result.session.sessionId;
  await put(db,'archive_history',{backupId:'protection-evidence',
   status:'committed',importSessionId:sid});
  const before=await rows(db,'archive_staging');
  await assert.rejects(Restore.discardArchiveRestoreSession(
   corruptGetAll(db,'archive_history',null),sid),
   {code:'ARCHIVE_HISTORY_ENUMERATION_UNVERIFIED'});
  assert.deepEqual((await rows(db,'archive_staging')).map(x=>x.id).sort(),before.map(x=>x.id).sort());
  assert.equal((await rows(db,'archive_history')).length,1);
 }finally{db.close();}
});

for(const mode of ['readonly','readwrite']){
 test('unverified media enumeration blocks rollback in '+mode+' phase, preserving imported state',async()=>{
  const db=await seeded();
  try{
   const staged=await stage(db);
   const committed=await Restore.commitStagedArchive(db,staged.session.sessionId,
    LIVE.meta.revisionId,webcrypto,Archive,()=>true);
   const before=await get(db,'main','state');
   const history=await get(db,'archive_history','synthetic-media-integrity-1');
   assert.equal(history.status,'committed');
   await assert.rejects(
    Restore.rollbackCommittedArchive(corruptGetAll(db,'entrance_media',null,mode),
     'synthetic-media-integrity-1',before.meta.revisionId,webcrypto,()=>true),
    {code:'RESTORE_MEDIA_ENUMERATION_UNVERIFIED'});
   assert.deepEqual(await get(db,'main','state'),before);
   assert.equal((await get(db,'archive_history','synthetic-media-integrity-1')).status,'committed');
   assert.ok(await get(db,'archive_staging',committed.rollbackSessionId));
  }finally{db.close();}
 });
}
