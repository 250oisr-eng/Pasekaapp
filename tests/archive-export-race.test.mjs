import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';

new Function(readFileSync('js/paseka-archive.js','utf8'))();
const Archive=globalThis.PasekaArchive;
const now='2026-11-22T10:00:00.000Z';
function dbOpen(){
 const factory=new IDBFactory();
 return new Promise((resolve,reject)=>{
  const req=factory.open('archive-race-synthetic',1);
  req.onupgradeneeded=()=>{req.result.createObjectStore('main');req.result.createObjectStore('entrance_media',{keyPath:'id'});};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
}
function write(db,store,key,value){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(store,'readwrite');
  if(store==='main')tx.objectStore(store).put(value,key);
  else tx.objectStore(store).put(value);
  tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);
 });
}
function state(revision='original'){return {meta:{schemaVersion:15,revisionId:revision},hives:[{id:'h-1'}],records:[],families:[]};}
function video(contents='original-video'){
 const blob=new Blob([contents],{type:'video/mp4'});
 return {id:'v-1',hiveId:'h-1',capturedAt:now,durationSec:2,width:64,height:64,
   bytes:blob.size,mimeType:'video/mp4',name:'synthetic.mp4',status:'waiting_for_server',blob};
}
function delayedCrypto(digestIndex,mutate){
 let calls=0;
 return {
  subtle:{async digest(...args){
    calls++;
    if(calls===digestIndex)await mutate();
    return webcrypto.subtle.digest(...args);
  }},
  getRandomValues:x=>webcrypto.getRandomValues(x)
 };
}
async function seed(){const db=await dbOpen();await write(db,'main','state',state());await write(db,'entrance_media',null,video());return db;}
const opts={backupId:'race-synthetic',createdAt:now};
test('unchanged full archive retains state and exact original entrance-video bytes',async()=>{
 const db=await seed();
 const out=await Archive.exportArchiveFromDatabase(db,webcrypto,opts);
 const parsed=await Archive.parseArchiveBlob(out.blob);
 assert.equal(out.summary.videoCount,1);
 assert.equal(await Archive.verifyArchive(out.blob,parsed,webcrypto),true);
 const original=Archive.readArchiveEntry(out.blob,parsed.entries.find(x=>x.kind==='entrance_video'));
 assert.equal(await original.text(),'original-video');
 const persisted=await Archive.readConsistentDatabaseSnapshot(db);
 assert.equal(await persisted.videos[0].blob.text(),'original-video');
 db.close();
});
test('late recognized-video ledger during hashing blocks legacy export',async()=>{
 const db=await seed();
 const provider=delayedCrypto(1,()=>write(db,'main','video_recognition_ledger_v1',{
  version:1,entries:[{source:'entrance_media',videoId:'v-1',resultId:'synthetic-result',cleanupState:'blocked_archive_safety'}]
 }));
 await assert.rejects(Archive.exportArchiveFromDatabase(db,provider,opts),{code:'VIDEO_LEDGER_NOT_ARCHIVED'});
 const saved=await Archive.readConsistentDatabaseSnapshot(db).then(()=>null,e=>e.code);
 assert.equal(saved,'VIDEO_LEDGER_NOT_ARCHIVED');
 db.close();
});
test('malformed newly written ledger is fail-closed',async()=>{
 const db=await seed();
 const provider=delayedCrypto(1,()=>write(db,'main','video_recognition_ledger_v1',{version:99,entries:[]}));
 await assert.rejects(Archive.exportArchiveFromDatabase(db,provider,opts),{code:'VIDEO_LEDGER_UNVERIFIED'});
 db.close();
});
test('state revision changed during digest blocks export instead of issuing stale archive',async()=>{
 const db=await seed();
 const provider=delayedCrypto(1,()=>write(db,'main','state',state('newer-revision')));
 await assert.rejects(Archive.exportArchiveFromDatabase(db,provider,opts),{code:'EXPORT_SNAPSHOT_CHANGED'});
 const tx=db.transaction('main','readonly'),r=tx.objectStore('main').get('state');
 const current=await new Promise(resolve=>r.onsuccess=()=>resolve(r.result));
 assert.equal(current.meta.revisionId,'newer-revision');
 db.close();
});
test('same-size video replacement without stored hash during hashing blocks export',async()=>{
 const db=await seed();
 const provider=delayedCrypto(2,()=>write(db,'entrance_media',null,video('replaced-video')));
 await assert.rejects(Archive.exportArchiveFromDatabase(db,provider,opts),{code:'EXPORT_SNAPSHOT_CHANGED'});
 const tx=db.transaction('entrance_media','readonly'),r=tx.objectStore('entrance_media').get('v-1');
 const current=await new Promise(resolve=>r.onsuccess=()=>resolve(r.result));
 assert.equal(await current.blob.text(),'replaced-video');
 db.close();
});
test('late video addition before archive finalize blocks export without modifying originals',async()=>{
 const db=await seed();
 const provider=delayedCrypto(2,async()=>{
  const extra=video('second-video');extra.id='v-2';extra.name='second.mp4';
  await write(db,'entrance_media',null,extra);
 });
 await assert.rejects(Archive.exportArchiveFromDatabase(db,provider,opts),{code:'EXPORT_SNAPSHOT_CHANGED'});
 const snapshot=await Archive.readConsistentDatabaseSnapshot(db);
 assert.equal(snapshot.videos.length,2);
 db.close();
});
