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

function corruptIndexRead(db,storeName,indexName,requestMethod,replacement){
 return {
  objectStoreNames:db.objectStoreNames,
  transaction(...args){
   const tx=db.transaction(...args);
   return new Proxy(tx,{get(target,field){
    if(field!=='objectStore')return Reflect.get(target,field,target);
    return name=>{
     const store=target.objectStore(name);
     if(name!==storeName)return store;
     return new Proxy(store,{get(targetStore,storeField){
      if(storeField!=='index')return Reflect.get(targetStore,storeField,targetStore);
      return key=>{
       const index=targetStore.index(key);
       if(key!==indexName)return index;
       return new Proxy(index,{get(targetIndex,indexField){
        if(indexField!==requestMethod)return Reflect.get(targetIndex,indexField,targetIndex);
        return (...requestArgs)=>{
         const request=targetIndex[requestMethod](...requestArgs);
         return new Proxy(request,{
          get(targetRequest,requestField){
           if(requestField==='result')return replacement;
           return Reflect.get(targetRequest,requestField,targetRequest);
          },
          set(targetRequest,requestField,value){
           return Reflect.set(targetRequest,requestField,value,targetRequest);
          }
         });
        };
       }});
      };
     }});
    };
   }});
  }
 };
}
test('read-only staging copy audit reports empty indexes only when all lists are valid',async()=>{
 const db=await seeded();
 try{
  const report=await Restore.inspectStagingRecognitionCopies(db);
  assert.equal(report.ok,true);
  assert.equal(report.status,'no_recognition_history');
  assert.equal(report.matchedCopies,0);
 }finally{db.close();}
});
test('read-only staging copy audit refuses unverifiable history even when ledger is absent',async()=>{
 const db=await seeded();
 try{
  await assert.rejects(
   Restore.inspectStagingRecognitionCopies(corruptGetAll(db,'archive_history',null)),
   {code:'ARCHIVE_HISTORY_ENUMERATION_UNVERIFIED'});
 }finally{db.close();}
});
test('read-only staging copy audit refuses unverifiable session headers',async()=>{
 const db=await seeded();
 try{
  await assert.rejects(
   Restore.inspectStagingRecognitionCopies(corruptIndexRead(
    db,'archive_staging','kind','getAll',null)),
   {code:'STAGING_SESSIONS_ENUMERATION_UNVERIFIED'});
 }finally{db.close();}
});
test('read-only staging copy audit refuses unverifiable video-copy keys',async()=>{
 const db=await seeded();
 try{
  await assert.rejects(
   Restore.inspectStagingRecognitionCopies(corruptIndexRead(
    db,'archive_staging','kind','getAllKeys',null)),
   {code:'STAGING_VIDEO_KEYS_ENUMERATION_UNVERIFIED'});
 }finally{db.close();}
});

test('normal cleanup still removes a verified unreferenced synthetic session',async()=>{
 const db=await seeded();
 try{
  const staged=await stage(db);
  const sid=staged.session.sessionId;
  assert.equal(await Restore.discardArchiveRestoreSession(db,sid),true);
  assert.equal((await rows(db,'archive_staging')).length,0);
  assert.equal(await Restore.discardArchiveRestoreSession(db,sid),false);
  assert.equal((await get(db,'main','state')).meta.revisionId,LIVE.meta.revisionId);
 }finally{db.close();}
});
for(const value of [null,undefined,{}]){
 test('cleanup never treats unverified staged keys as an empty index: '+String(value),async()=>{
  const db=await seeded();
  try{
   const staged=await stage(db);
   const sid=staged.session.sessionId;
   const before=(await rows(db,'archive_staging')).map(x=>x.id).sort();
   assert.ok(before.length>0);
   await assert.rejects(
    Restore.discardArchiveRestoreSession(corruptIndexRead(
     db,'archive_staging','sessionId','getAllKeys',value),sid),
    {code:'STAGING_CLEANUP_KEYS_UNVERIFIED'});
   assert.deepEqual((await rows(db,'archive_staging')).map(x=>x.id).sort(),before);
   assert.equal((await get(db,'main','state')).meta.revisionId,LIVE.meta.revisionId);
  }finally{db.close();}
 });
}
for(const value of [null,undefined]){
 test('cleanup aborts without deletion when record-kind index is unverified: '+String(value),async()=>{
  const db=await seeded();
  try{
   const staged=await stage(db);
   const sid=staged.session.sessionId;
   const before=(await rows(db,'archive_staging')).map(x=>x.id).sort();
   await assert.rejects(
    Restore.discardArchiveRestoreSession(corruptIndexRead(
     db,'archive_staging','kind','getAllKeys',value),sid),
    {code:'STAGING_CLEANUP_KINDS_UNVERIFIED'});
   assert.deepEqual((await rows(db,'archive_staging')).map(x=>x.id).sort(),before);
   assert.equal((await get(db,'main','state')).meta.revisionId,LIVE.meta.revisionId);
  }finally{db.close();}
 });
}


for (const bad of [undefined, null, {}]) {
 test('commit never accepts unverifiable staging rows: '+String(bad), async()=>{
  const db=await seeded();
  try {
   const staged=await stage(db);
   const before=await rows(db,'archive_staging');
   await assert.rejects(
    Restore.commitStagedArchive(
     corruptIndexRead(db,'archive_staging','sessionId','getAll',bad),
     staged.session.sessionId,LIVE.meta.revisionId,webcrypto,Archive,()=>true),
    {code:'STAGING_RECORDS_ENUMERATION_UNVERIFIED'});
   assert.deepEqual(await rows(db,'archive_staging'),before);
   assert.equal((await get(db,'main','state')).meta.revisionId,LIVE.meta.revisionId);
   assert.equal((await rows(db,'archive_history')).length,0);
  } finally { db.close(); }
 });
}
test('staging finalization rejects malformed row enumeration without claiming ready',async()=>{
 const db=await seeded();
 try {
  await assert.rejects(
   stage(corruptIndexRead(db,'archive_staging','sessionId','getAll',null)),
   {code:'STAGING_FINALIZE_RECORDS_ENUMERATION_UNVERIFIED'});
  assert.equal((await get(db,'main','state')).meta.revisionId,LIVE.meta.revisionId);
  assert.equal((await rows(db,'archive_history')).length,0);
 } finally { db.close(); }
});
for (const mode of ['readonly','readwrite']) {
 test('rollback refuses unverifiable snapshot rows in '+mode+' transaction',async()=>{
  const db=await seeded();
  try {
   const staged=await stage(db);
   const committed=await Restore.commitStagedArchive(
    db,staged.session.sessionId,LIVE.meta.revisionId,webcrypto,Archive,()=>true);
   const before=await get(db,'main','state');
   const history=await get(db,'archive_history','synthetic-media-integrity-1');
   assert.equal(history.status,'committed');
   const wrapped=corruptIndexRead(db,'archive_staging','sessionId','getAll',null);
   // Restrict synthetic corruption to the selected IDB transaction mode.
   const adapter={
    objectStoreNames:wrapped.objectStoreNames,
    transaction(...args){
     if((args[1]||'readonly')!==mode)return db.transaction(...args);
     return wrapped.transaction(...args);
    }
   };
   await assert.rejects(
    Restore.rollbackCommittedArchive(adapter,'synthetic-media-integrity-1',
     before.meta.revisionId,webcrypto,()=>true),
    {code:'ROLLBACK_RECORDS_ENUMERATION_UNVERIFIED'});
   assert.deepEqual(await get(db,'main','state'),before);
   assert.equal((await get(db,'archive_history','synthetic-media-integrity-1')).status,'committed');
   assert.ok(await get(db,'archive_staging',committed.rollbackSessionId));
  } finally { db.close(); }
 });
}
