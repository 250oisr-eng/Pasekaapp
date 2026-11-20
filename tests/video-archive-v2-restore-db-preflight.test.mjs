import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {readFile} from 'node:fs/promises';
const root={};
for(const file of ['video-archive-v2-guard.js','video-archive-v2-restore-gate.js',
 'video-archive-v2-restore-db-preflight.js']){
 new Function('window',await readFile(new URL('../js/'+file,import.meta.url),'utf8'))(root);
}
const guard=root.PasekaVideoArchiveV2Guard,gate=root.PasekaVideoArchiveV2RestoreGate,
 api=root.PasekaVideoArchiveV2RestoreDatabasePreflight.inspectRestoreCandidateAgainstDatabase;
const hash='a'.repeat(64);
const entry=()=>({source:'entrance_media',videoId:'recognized',resultId:'result',
 sourceSha256:hash,sourceBytes:3,sourceEvidenceVersion:1,
 recognizedAt:'2026-11-20T00:00:00Z',cleanupState:'deleted',result:{observations:['осмотр']}});
const ledger=()=>({version:1,entries:[entry()]});
const candidate=()=>({state:{meta:{schemaVersion:15},records:[]},
 ledger:ledger(),pendingVideos:[]});
const done=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||new Error('database error'));});
async function setup(){
 const req=new IDBFactory().open('v2restore-preflight',1);
 req.onupgradeneeded=()=>{
  const db=req.result;db.createObjectStore('main');
  db.createObjectStore('entrance_media',{keyPath:'id'});
  db.createObjectStore('archive_staging',{keyPath:'id'});
  db.createObjectStore('archive_history',{keyPath:'backupId'});
  db.createObjectStore('full_backup');
 };
 const db=await new Promise((resolve,reject)=>{
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
 const tx=db.transaction(['main','entrance_media'],'readwrite');
 tx.objectStore('main').put({meta:{schemaVersion:15,revisionId:'new'},records:[]},'state');
 tx.objectStore('main').put(ledger(),'video_recognition_ledger_v1');
 tx.objectStore('entrance_media').put({id:'unrecognized',bytes:3,blob:new Blob(['abc'])});
 await done(tx);return db;
}
const inspect=(db,archive=candidate())=>api(db,archive,guard,gate);
const rejects=(p,code)=>assert.rejects(p,error=>error.code===code);

test('live preflight uses one readonly transaction across all protected stores without reading blobs',async()=>{
 const db=await setup(),calls=[];
 const tracked={objectStoreNames:db.objectStoreNames,transaction(...args){
  calls.push(args);return db.transaction(...args);
 }};
 const outcome=await inspect(tracked);
 assert.deepEqual(calls,[[['main','entrance_media','archive_staging','archive_history','full_backup'],'readonly']]);
 assert.equal(outcome.historyPreserved,1);
 assert.equal(outcome.liveEntranceKeyCount,1);
 assert.equal(outcome.preflightPassed,true);
 assert.equal(outcome.restoreAuthorized,false);
 assert.equal(outcome.archiveSafe,false);
 assert.equal(outcome.requiresAtomicCommitCheck,true);
 db.close();
});
test('stored staging Blob blocks preflight; no staging data is deleted',async()=>{
 const db=await setup();
 const tx=db.transaction('archive_staging','readwrite');
 tx.objectStore('archive_staging').put({id:'staged-original',blob:new Blob(['protected'])});
 await done(tx);
 await rejects(inspect(db),'V2_RESTORE_EXISTING_ARCHIVE_HISTORY');
 const read=db.transaction('archive_staging','readonly');
 const item=await new Promise((resolve,reject)=>{
  const q=read.objectStore('archive_staging').get('staged-original');
  q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
 });
 assert.equal(item.blob.size,9);db.close();
});
test('archive history with rollback reference blocks preflight without rewriting it',async()=>{
 const db=await setup();
 const tx=db.transaction('archive_history','readwrite');
 tx.objectStore('archive_history').put({backupId:'previous',status:'committed'});
 await done(tx);
 await rejects(inspect(db),'V2_RESTORE_EXISTING_ARCHIVE_HISTORY');
 db.close();
});
test('live ledger cannot silently disappear or lose recognized tombstones',async()=>{
 const db=await setup();
 await rejects(inspect(db,{...candidate(),ledger:{version:1,entries:[]}}),'V2_RESTORE_LEDGER_HISTORY_LOST');
 const tx=db.transaction('main','readwrite');
 tx.objectStore('main').delete('video_recognition_ledger_v1');
 await done(tx);
 await rejects(inspect(db),'V2_RESTORE_LIVE_LEDGER_MISSING');
 db.close();
});
test('missing required protected store rejects without any transaction',async()=>{
 const db=await setup();
 const tracked={objectStoreNames:{contains:name=>name!=='archive_history'},
  transaction(){throw Error('must not open');}};
 await rejects(inspect(tracked),'V2_RESTORE_PROTECTED_STORES_MISSING');
 db.close();
});
test('live state must exist and be schema-aware',async()=>{
 const db=await setup();const tx=db.transaction('main','readwrite');
 tx.objectStore('main').put({meta:{schemaVersion:'unknown'}},'state');await done(tx);
 await rejects(inspect(db),'V2_RESTORE_LIVE_STATE_INVALID');
 db.close();
});
