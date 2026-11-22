import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';

new Function(readFileSync('js/paseka-archive.js', 'utf8'))();
const Archive = globalThis.PasekaArchive;
let serial = 0;
const options = { backupId:'synthetic-cross-version-export', createdAt:'2026-11-23T10:00:00Z' };
const markers = [
  { name:'PASEKA02 pending staging', store:'archive_staging', key:'v2pending:synthetic', value:{id:'v2pending:synthetic',kind:'v2_pending_original',blob:new Blob(['protected-original'])} },
  { name:'PASEKA02 history', store:'archive_history', key:'v2-history', value:{backupId:'v2-history',kind:'v2_entrance_import',status:'committed'} },
  { name:'PASEKA02 quarantine backup', store:'full_backup', key:'v2entrance:synthetic', value:{kind:'v2_entrance_quarantine_rollback_snapshot',quarantinedMedia:[{id:'v',blob:new Blob(['protected-original'])}]} }
];
const state = () => ({meta:{schemaVersion:15,revisionId:'synthetic-live'},hives:[],families:[],records:[]});
const open = (factory,name,partial=false) => new Promise((resolve,reject)=>{
  const req=factory.open(name,1);
  req.onupgradeneeded=()=>{
    const db=req.result;
    db.createObjectStore('main');
    db.createObjectStore('entrance_media',{keyPath:'id'});
    db.createObjectStore('archive_staging',{keyPath:'id'});
    if(!partial){
      db.createObjectStore('archive_history',{keyPath:'backupId'});
      db.createObjectStore('full_backup');
    }
  };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error);
});
const put=(db,store,key,value)=>new Promise((resolve,reject)=>{
  const tx=db.transaction(store,'readwrite');
  if(store==='archive_staging'||store==='archive_history')tx.objectStore(store).put(value);
  else tx.objectStore(store).put(value,key);
  tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error);
});
const get=(db,store,key)=>new Promise((resolve,reject)=>{
  const tx=db.transaction(store,'readonly'),req=tx.objectStore(store).get(key);
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});
async function setup(partial=false){
  const factory=new IDBFactory(),name='paseka-v1-export-v2-'+(++serial);
  const db=await open(factory,name,partial);
  await put(db,'main','state',state());
  return {factory,name,db};
}
for(const marker of markers){
  test('PASEKA01 export refuses '+marker.name+' when recognition ledger is absent',async()=>{
    const {db}=await setup();
    try{
      await put(db,marker.store,marker.key,marker.value);
      await assert.rejects(Archive.exportArchiveFromDatabase(db,webcrypto,options),
        {code:'VIDEO_LEGACY_EXPORT_V2_PROTECTED'});
      assert.deepEqual(await get(db,marker.store,marker.key),marker.value);
      assert.deepEqual(await get(db,'main','state'),state());
    }finally{db.close();}
  });
  test('PASEKA01 export refuses '+marker.name+' inserted while archive SHA is pending',async()=>{
    const {db}=await setup();
    let invoked=false;
    const crypto={
      getRandomValues:x=>webcrypto.getRandomValues(x),
      subtle:{async digest(...args){
        if(!invoked){invoked=true;await put(db,marker.store,marker.key,marker.value);}
        return webcrypto.subtle.digest(...args);
      }}
    };
    try{
      await assert.rejects(Archive.exportArchiveFromDatabase(db,crypto,options),
        {code:'VIDEO_LEGACY_EXPORT_V2_PROTECTED'});
      assert.equal(invoked,true);
      assert.deepEqual(await get(db,marker.store,marker.key),marker.value);
    }finally{db.close();}
  });
  test('PASEKA01 export still refuses '+marker.name+' after IndexedDB reopen',async()=>{
    const {factory,name,db}=await setup();
    await put(db,marker.store,marker.key,marker.value);
    db.close();
    const reopened=await open(factory,name);
    try{
      await assert.rejects(Archive.exportArchiveFromDatabase(reopened,webcrypto,options),
        {code:'VIDEO_LEGACY_EXPORT_V2_PROTECTED'});
      assert.deepEqual(await get(reopened,marker.store,marker.key),marker.value);
    }finally{reopened.close();}
  });
}
test('PASEKA01 export keeps historic empty ledger/empty protected stores compatible',async()=>{
  const {db}=await setup();
  try{
    await put(db,'main','video_recognition_ledger_v1',{version:1,entries:[]});
    const archived=await Archive.exportArchiveFromDatabase(db,webcrypto,options);
    const parsed=await Archive.parseArchiveBlob(archived.blob);
    assert.equal(parsed.manifest.version,1);
    assert.deepEqual(await get(db,'main','state'),state());
  }finally{db.close();}
});
test('PASEKA01 export fails closed on partially missing archive stores',async()=>{
  const {db}=await setup(true);
  try{
    await assert.rejects(Archive.exportArchiveFromDatabase(db,webcrypto,options),
      {code:'VIDEO_LEGACY_EXPORT_STORES_MISSING'});
    assert.deepEqual(await get(db,'main','state'),state());
  }finally{db.close();}
});
