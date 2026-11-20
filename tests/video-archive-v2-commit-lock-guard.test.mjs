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
 recognizedAt:'2026-11-20T00:00:00Z',cleanupState:'deleted',result:{observations:['осмотр']}});
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
 assert.deepEqual(calls[0].stores,['main','entrance_media','archive_staging','archive_history']);
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
