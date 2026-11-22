import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';

const root={};
for(const path of ['js/video-archive-v2-guard.js','js/video-archive-v2-restore-gate.js',
  'js/video-archive-v2-restore-db-preflight.js','js/video-archive-v2-commit-lock-guard.js']){
 new Function('window',readFileSync(path,'utf8'))(root);
}
const guard=root.PasekaVideoArchiveV2Guard;
const gate=root.PasekaVideoArchiveV2RestoreGate;
const preflight=root.PasekaVideoArchiveV2RestoreDatabasePreflight.inspectRestoreCandidateAgainstDatabase;
const lock=root.PasekaVideoArchiveV2CommitLockGuard.checkRestoreUnderAbortedWriteLock;
const state=()=>({meta:{schemaVersion:15,revisionId:'live-r1'},records:[],hives:[]});
const ledger=()=>({version:1,entries:[{
 source:'entrance_media',videoId:'recognized-source',resultId:'recognition-r1',
 recognizedAt:'2026-11-23T10:00:00Z',stateRevisionId:'live-r1',
 sourceHashVerifiedAt:'2026-11-23T09:59:59Z',sourceSha256:'a'.repeat(64),
 sourceBytes:3,sourceEvidenceVersion:1,cleanupState:'deleted',
 result:{observation:'synthetic video recognized'}
}]});
const candidate=()=>({state:state(),ledger:ledger(),pendingVideos:[]});
function open(factory,name){
 return new Promise((resolve,reject)=>{
  const req=factory.open(name,1);
  req.onupgradeneeded=()=>{
   const db=req.result;
   db.createObjectStore('main');db.createObjectStore('entrance_media',{keyPath:'id'});
   db.createObjectStore('archive_staging',{keyPath:'id'});
   db.createObjectStore('archive_history',{keyPath:'backupId'});
   db.createObjectStore('full_backup');
  };
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
}
function put(db,store,key,value){return new Promise((resolve,reject)=>{
 const tx=db.transaction(store,'readwrite');
 if(['archive_staging','archive_history'].includes(store))tx.objectStore(store).put(value);
 else tx.objectStore(store).put(value,key);
 tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error);
});}
function get(db,store,key){return new Promise((resolve,reject)=>{
 const tx=db.transaction(store,'readonly'),req=tx.objectStore(store).get(key);
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});}
test('five-store preflight and aborted write gate preserve tombstone after database reboot',async()=>{
 const factory=new IDBFactory(),name='synthetic-five-store-reboot';
 let db=await open(factory,name);
 await put(db,'main','state',state());
 await put(db,'main','video_recognition_ledger_v1',ledger());
 const before=await preflight(db,candidate(),guard,gate);
 assert.equal(before.restoreAuthorized,false);
 const verified=await lock(db,candidate(),guard,gate);
 assert.equal(verified.transactionAborted,true);
 assert.equal(verified.restoreAuthorized,false);
 db.close();
 db=await open(factory,name);
 try {
  assert.deepEqual(await get(db,'main','video_recognition_ledger_v1'),ledger());
  assert.deepEqual(await get(db,'main','state'),state());
  const again=await preflight(db,candidate(),guard,gate);
  assert.equal(again.historyPreserved,1);
  const checked=await lock(db,candidate(),guard,gate);
  assert.equal(checked.transactionAborted,true);
  assert.equal(checked.archiveSafe,false);
  assert.deepEqual(await get(db,'main','state'),state());
 }finally{db.close();}
});
test('late protected quarantine after clean preflight refuses writer gate and survives reboot',async()=>{
 const factory=new IDBFactory(),name='synthetic-five-store-late-quarantine';
 let db=await open(factory,name);
 await put(db,'main','state',state());
 await put(db,'main','video_recognition_ledger_v1',ledger());
 assert.equal((await preflight(db,candidate(),guard,gate)).preflightPassed,true);
 const protectedCopy={kind:'v2_entrance_quarantine_rollback_snapshot',
  quarantinedMedia:[{id:'recognized-source',blob:new Blob(['protected-original'])}]};
 await put(db,'full_backup','v2entrance:protected',protectedCopy);
 await assert.rejects(lock(db,candidate(),guard,gate),
  {code:'V2_COMMIT_EXISTING_ARCHIVE_HISTORY'});
 assert.deepEqual(await get(db,'full_backup','v2entrance:protected'),protectedCopy);
 db.close();
 db=await open(factory,name);
 try{
  await assert.rejects(preflight(db,candidate(),guard,gate),
   {code:'V2_RESTORE_EXISTING_ARCHIVE_HISTORY'});
  assert.deepEqual(await get(db,'full_backup','v2entrance:protected'),protectedCopy);
  assert.deepEqual(await get(db,'main','video_recognition_ledger_v1'),ledger());
 }finally{db.close();}
});
