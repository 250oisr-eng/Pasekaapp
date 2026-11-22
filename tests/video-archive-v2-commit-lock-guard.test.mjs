import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {readFile} from 'node:fs/promises';
const root={};
for(const file of ['video-archive-v2-guard.js','video-archive-v2-restore-gate.js','video-archive-v2-commit-lock-guard.js'])
 new Function('window',await readFile(new URL('../js/'+file,import.meta.url),'utf8'))(root);
const guard=root.PasekaVideoArchiveV2Guard,gate=root.PasekaVideoArchiveV2RestoreGate,
 check=root.PasekaVideoArchiveV2CommitLockGuard.checkRestoreUnderAbortedWriteLock;
const H='a'.repeat(64);
const item=()=>({source:'entrance_media',videoId:'v1',resultId:'r1',
 sourceSha256:H,sourceBytes:3,sourceEvidenceVersion:1,
 recognizedAt:'2026-11-20T00:00:00Z',stateRevisionId:'verified-state',
 sourceHashVerifiedAt:'2026-11-20T00:00:00Z',cleanupState:'deleted',result:{observations:['осмотр']}});
const ledger=()=>({version:1,entries:[item()]});
const incoming=()=>({state:{meta:{schemaVersion:15},records:[]},ledger:ledger(),pendingVideos:[]});
const transactionDone=tx=>new Promise((resolve,reject)=>{
 tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||new Error('transaction failed'));
});
async function setup(){
 const req=new IDBFactory().open('v2-commit-lock',1);
 req.onupgradeneeded=()=>{
  req.result.createObjectStore('main');
  req.result.createObjectStore('entrance_media',{keyPath:'id'});
  req.result.createObjectStore('archive_staging',{keyPath:'id'});
  req.result.createObjectStore('archive_history',{keyPath:'backupId'});
  req.result.createObjectStore('full_backup');
 };
 const db=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
 const tx=db.transaction(['main','entrance_media'],'readwrite');
 tx.objectStore('main').put({meta:{schemaVersion:15,revisionId:'current'},records:[]},'state');
 tx.objectStore('main').put(ledger(),'video_recognition_ledger_v1');
 tx.objectStore('entrance_media').put({id:'v2',blob:new Blob(['abc'])});
 await transactionDone(tx);return db;
}
const call=(db,c=incoming())=>check(db,c,guard,gate);
const rejects=(p,code)=>assert.rejects(p,e=>e.code===code);
test('gate uses one readwrite transaction across all protected stores, always aborts and never authorizes restore',async()=>{
 const db=await setup(),calls=[];
 const tracked={objectStoreNames:db.objectStoreNames,transaction(...args){
  const tx=db.transaction(...args);
  calls.push({stores:args[0],mode:args[1],tx});
  return tx;
 }};
 const result=await call(tracked);
 assert.equal(calls.length,1);
 assert.deepEqual(calls[0].stores,['main','entrance_media','archive_staging','archive_history','full_backup']);
 assert.equal(calls[0].mode,'readwrite');
 assert.equal(result.lockValidated,true);
 assert.equal(result.transactionAborted,true);
 assert.equal(result.archiveSafe,false);
 assert.equal(result.restoreAuthorized,false);
 assert.equal(result.requiresAtomicCommitCheck,true);
 const tx=db.transaction('main','readonly');
 const stored=await new Promise((resolve,reject)=>{
  const req=tx.objectStore('main').get('video_recognition_ledger_v1');
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
 assert.deepEqual(stored,ledger());db.close();
});
test('changed ledger is detected when queued writer completes before the guarded transaction',async()=>{
 const db=await setup();
 const writer=db.transaction('main','readwrite');
 writer.objectStore('main').put({version:1,entries:[{...item(),cleanupState:'blocked_archive_safety'}]},'video_recognition_ledger_v1');
 const guarded=call(db);
 await transactionDone(writer);
 await rejects(guarded,'V2_RESTORE_LEDGER_HISTORY_CONFLICT');
 db.close();
});
test('a writer queued behind guarded transaction cannot modify the inspected snapshot',async()=>{
 const db=await setup();
 const guarded=call(db);
 const writer=db.transaction('main','readwrite');
 writer.objectStore('main').put({meta:{schemaVersion:15,revisionId:'after'}},'state');
 const result=await guarded;
 await transactionDone(writer);
 assert.equal(result.liveSchemaVersion,15);
 assert.equal(result.transactionAborted,true);
 const read=db.transaction('main','readonly');
 const next=await new Promise((resolve,reject)=>{
  const req=read.objectStore('main').get('state');
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
 assert.equal(next.meta.revisionId,'after');
 db.close();
});
test('staged original and prior archive history block gate without destroying data',async()=>{
 for(const store of ['archive_staging','archive_history']){
  const db=await setup();
  const tx=db.transaction(store,'readwrite');
  if(store==='archive_staging')tx.objectStore(store).put({id:'protected',blob:new Blob(['protected'])});
  else tx.objectStore(store).put({backupId:'protected',status:'committed'});
  await transactionDone(tx);
  await rejects(call(db),'V2_COMMIT_EXISTING_ARCHIVE_HISTORY');
  const verify=db.transaction(store,'readonly');
  const key='protected';
  const existing=await new Promise((resolve,reject)=>{
   const q=verify.objectStore(store).get(key);
   q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
  });
  assert.ok(existing);
  db.close();
 }
});
test('missing protected store or absent live ledger fails closed',async()=>{
 const db=await setup();
 const wrapped={objectStoreNames:{contains:n=>n!=='archive_history'},transaction(){throw Error('unexpected transaction');}};
 await rejects(call(wrapped),'V2_COMMIT_PROTECTED_STORES_MISSING');
 const tx=db.transaction('main','readwrite');
 tx.objectStore('main').delete('video_recognition_ledger_v1');
 await transactionDone(tx);
 await rejects(call(db),'V2_COMMIT_LIVE_LEDGER_MISSING');
 db.close();
});
test('incoming missing current recognized result fails before exposing a write authorization',async()=>{
 const db=await setup();
 const changed=incoming();changed.ledger={version:1,entries:[]};
 await rejects(call(db,changed),'V2_RESTORE_LEDGER_HISTORY_LOST');
 db.close();
});

test('full_backup is protected by same readwrite lock and survives abort',async()=>{
 const db=await setup(),tx=db.transaction('full_backup','readwrite');
 tx.objectStore('full_backup').put({blob:new Blob(['old saved original'])},'previous');
 await transactionDone(tx);
 await rejects(call(db),'V2_COMMIT_EXISTING_ARCHIVE_HISTORY');
 const verify=db.transaction('full_backup','readonly');
 const saved=await new Promise((resolve,reject)=>{
  const r=verify.objectStore('full_backup').get('previous');
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
 });
 assert.equal(saved.blob.size,18);db.close();
});


test('pending video collision introduced by a queued writer is rejected under aborted write lock',async()=>{
 const db=await setup();
 const writer=db.transaction('entrance_media','readwrite');
 writer.objectStore('entrance_media').put({id:'new-import',blob:new Blob(['must survive'])});
 const incomingCandidate={...incoming(),pendingVideos:[
  {source:'entrance_media',videoId:'new-import',sourceSha256:'b'.repeat(64),sourceBytes:3}
 ]};
 const promise=call(db,incomingCandidate);
 await transactionDone(writer);
 await rejects(promise,'V2_RESTORE_LIVE_ENTRANCE_ID_COLLISION');
 const get=db.transaction('entrance_media','readonly').objectStore('entrance_media').get('new-import');
 const saved=await new Promise((res,rej)=>{get.onsuccess=()=>res(get.result);get.onerror=()=>rej(get.error);});
 assert.equal(saved.blob.size,12);
 db.close();
});
test('lock gate rejects journal ID collision without writing archive or history',async()=>{
 const db=await setup();
 const tx=db.transaction('main','readwrite');
 tx.objectStore('main').put({meta:{schemaVersion:15,revisionId:'current'},records:[{id:'visit',
  media:[{kind:'video',videoId:'journal-id',data:null}]}]},'state');
 await transactionDone(tx);
 const archive={...incoming(),state:{...incoming().state,records:[{id:'copy',
  media:[{kind:'video',videoId:'journal-id',data:'data:video/mp4;base64,YWJj',
   sourceSha256:'b'.repeat(64),sourceBytes:3}]}]},pendingVideos:[
  {source:'record_media',videoId:'journal-id',sourceSha256:'b'.repeat(64),sourceBytes:3}
 ]};
 await rejects(call(db,archive),'V2_RESTORE_LIVE_RECORD_ID_COLLISION');
 const q=db.transaction('archive_history','readonly').objectStore('archive_history').count();
 const count=await new Promise((res,rej)=>{q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});
 assert.equal(count,0);db.close();
});
test('no pending video retains prior aborted writer-lock diagnostic behavior',async()=>{
 const db=await setup();
 const result=await call(db);
 assert.equal(result.pendingIdentityChecked,0);
 assert.equal(result.restoreAuthorized,false);
 assert.equal(result.transactionAborted,true);
 db.close();
});

test('queued journal writer cannot hide record_media ID collision before final lock',async()=>{
 const db=await setup();
 const live={meta:{schemaVersion:15,revisionId:'journal-updated'},
  records:[{id:'inspection',media:[{kind:'video',videoId:'future-record',data:'data:video/mp4;base64,YWJj'}]}]};
 const writer=db.transaction('main','readwrite');
 writer.objectStore('main').put(live,'state');
 const future={...incoming(),
  state:{meta:{schemaVersion:15},records:[{id:'imported',
   media:[{kind:'video',videoId:'future-record',data:'data:video/mp4;base64,YWJj',
    sourceSha256:'b'.repeat(64),sourceBytes:3}]}]},
  pendingVideos:[{source:'record_media',videoId:'future-record',
   sourceSha256:'b'.repeat(64),sourceBytes:3}]
 };
 const checked=call(db,future);
 await transactionDone(writer);
 await rejects(checked,'V2_RESTORE_LIVE_RECORD_ID_COLLISION');
 const request=db.transaction('main','readonly').objectStore('main').get('state');
 const saved=await new Promise((res,rej)=>{request.onsuccess=()=>res(request.result);request.onerror=()=>rej(request.error);});
 assert.deepEqual(saved,live);
 db.close();
});
