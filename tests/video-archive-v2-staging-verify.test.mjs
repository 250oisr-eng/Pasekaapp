import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const root={};
for(const file of [
 'paseka-sha256.js','video-archive-v2-guard.js','video-archive-v2-record-media.js',
 'video-archive-v2-metadata-codec.js','video-archive-v2-restore-gate.js',
 'video-archive-v2-pending-stage.js','video-archive-v2-staging-verify.js'
])new Function('window',await readFile(new URL('../js/'+file,import.meta.url),'utf8'))(root);
const deps=()=>({
 codec:root.PasekaVideoArchiveV2MetadataCodec,
 guard:root.PasekaVideoArchiveV2Guard,
 gate:root.PasekaVideoArchiveV2RestoreGate,
 sha:root.PasekaSha256,recordAdapter:root.PasekaVideoArchiveV2RecordMedia,
 crypto:webcrypto
});
const stage=root.PasekaVideoArchiveV2PendingStage.stagePendingRestore;
const verify=root.PasekaVideoArchiveV2StagingVerify.verifyStagedPendingAgainstArchive;
const ledger=()=>({version:1,entries:[]});
const state=(revision='local')=>({meta:{schemaVersion:15,revisionId:revision},records:[],hives:[]});
const opts=()=>({backupId:'v2-recheck',expectedRevision:'local',
 createdAt:'2026-11-20T00:00:00Z'});
const done=tx=>new Promise((resolve,reject)=>{
 tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||new Error('aborted'));
});
const rejects=(p,code)=>assert.rejects(p,e=>e.code===code);
let unique=0;
async function setup(){
 const request=new IDBFactory().open('v2-verify-'+(++unique),1);
 request.onupgradeneeded=()=>{
  const db=request.result;db.createObjectStore('main');
  db.createObjectStore('entrance_media',{keyPath:'id'});
  const staging=db.createObjectStore('archive_staging',{keyPath:'id'});
  staging.createIndex('backupId','backupId',{unique:true});
  staging.createIndex('sessionId','sessionId',{unique:false});
  staging.createIndex('kind','kind',{unique:false});
  db.createObjectStore('archive_history',{keyPath:'backupId'});
  db.createObjectStore('full_backup');
 };
 const db=await new Promise((res,rej)=>{
  request.onsuccess=()=>res(request.result);request.onerror=()=>rej(request.error);
 });
 const tx=db.transaction('main','readwrite');
 tx.objectStore('main').put(state(),'state');
 tx.objectStore('main').put(ledger(),'video_recognition_ledger_v1');
 await done(tx);return db;
}
async function get(db,store,key){
 return new Promise((resolve,reject)=>{
  const q=db.transaction(store,'readonly').objectStore(store).get(key);
  q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
 });
}
async function count(db,store){
 return new Promise((resolve,reject)=>{
  const q=db.transaction(store,'readonly').objectStore(store).count();
  q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
 });
}
async function archive({record=false,id='video-one',content='abc'}={}){
 const blob=new Blob([content],{type:'video/mp4'});
 const hash=await root.PasekaSha256.hashBlobHex(blob);
 let archiveState=state('imported'),pendingVideos=[{
  source:'entrance_media',videoId:id,sourceSha256:hash,sourceBytes:blob.size,
  mimeType:'video/mp4',blob
 }];
 if(record){
  archiveState={...archiveState,records:[{id:'record',media:[{
   kind:'video',videoId:'journal-one',sourceSha256:hash,sourceBytes:3,
   data:'data:video/mp4;base64,YWJj'
  }]}]};
  pendingVideos=[];
 }
 return deps().codec.buildMetadataArchive({
  state:archiveState,ledger:ledger(),pendingVideos,
  backupId:opts().backupId,createdAt:opts().createdAt
 },webcrypto,deps().guard,deps().sha,deps().recordAdapter);
}
async function staged(record=false){
 const db=await setup(),file=await archive({record});
 await stage(db,file,opts(),deps());return {db,file};
}
test('verifies each saved entrance Blob SHA and repeats metadata under aborted writer lock',async()=>{
 const {db,file}=await staged(),modes=[];
 const tracked={objectStoreNames:db.objectStoreNames,transaction(names,mode){
  modes.push(mode);return db.transaction(names,mode);
 }};
 const result=await verify(tracked,file,opts(),deps());
 assert.deepEqual(modes,['readonly','readwrite']);
 assert.equal(result.verifiedAtSnapshot,true);
 assert.equal(result.stagedVideosRehashed,1);
 assert.equal(result.metadataStableUnderAbortedLock,true);
 assert.equal(result.transactionAborted,true);
 assert.equal(result.byteIntegrityLocked,false);
 assert.equal(result.archiveSafe,false);
 assert.equal(result.restoreAuthorized,false);
 assert.equal(result.cleanupAuthorized,false);
 assert.deepEqual(await get(db,'main','state'),state());
 assert.equal(await count(db,'entrance_media'),0);
 assert.equal(await count(db,'archive_staging'),2);
 assert.equal((await get(db,'archive_history','v2-recheck')).status,'staged');
 db.close();
});
test('verified journal original is rehashed from actual staged Blob, not only metadata',async()=>{
 const {db,file}=await staged(true);
 const report=await verify(db,file,opts(),deps());
 assert.equal(report.stagedVideosRehashed,1);
 assert.equal(report.restoreAuthorized,false);
 assert.equal((await get(db,'archive_staging',
  'v2pending:v2-recheck:record_media:journal-one')).source,'record_media');
 db.close();
});
test('same-size corruption of staged video is detected and protected copy retained',async()=>{
 const {db,file}=await staged();
 const key='v2pending:v2-recheck:entrance_media:video-one';
 const row=await get(db,'archive_staging',key);
 const tx=db.transaction('archive_staging','readwrite');
 tx.objectStore('archive_staging').put({...row,blob:new Blob(['xyz'],{type:'video/mp4'})});
 await done(tx);
 await rejects(verify(db,file,opts(),deps()),'V2_VERIFY_STAGED_HASH_CHANGED');
 assert.equal((await get(db,'archive_staging',key)).blob.size,3);
 assert.equal(await count(db,'archive_history'),1);
 db.close();
});
test('different PASEKA02 file for same backup ID cannot validate existing staged video',async()=>{
 const {db}=await staged();
 await rejects(verify(db,await archive({id:'other-video'}),opts(),deps()),
  'V2_VERIFY_SESSION_CHANGED');
 assert.equal(await count(db,'archive_staging'),2);
 db.close();
});
test('missing staged copy and orphan history block verification without deletion',async()=>{
 const {db,file}=await staged();
 const tx=db.transaction('archive_staging','readwrite');
 tx.objectStore('archive_staging').delete('v2pending:v2-recheck:entrance_media:video-one');
 await done(tx);
 await rejects(verify(db,file,opts(),deps()),'V2_VERIFY_STAGED_SET_CHANGED');
 assert.equal(await count(db,'archive_staging'),1);
 assert.equal((await get(db,'archive_history','v2-recheck')).status,'staged');
 db.close();
});
test('new recognition result after staging blocks verifier, keeping protected original',async()=>{
 const {db,file}=await staged();
 const pendingSha=(await get(db,'archive_staging',
  'v2pending:v2-recheck:entrance_media:video-one')).sourceSha256;
 const tx=db.transaction('main','readwrite');
 tx.objectStore('main').put({version:1,entries:[{
  source:'entrance_media',videoId:'video-one',resultId:'recognized-1',
  sourceSha256:pendingSha,sourceBytes:3,sourceEvidenceVersion:1,
  recognizedAt:'2026-11-20T00:00:00Z',cleanupState:'delete_required',
  result:{note:'recognition complete'}
 }]},'video_recognition_ledger_v1');
 await done(tx);
 await assert.rejects(verify(db,file,opts(),deps()));
 assert.equal(await count(db,'archive_staging'),2);
 assert.equal((await get(db,'main','video_recognition_ledger_v1')).entries.length,1);
 db.close();
});
test('writer changes staged metadata during async digest and final gate rejects',async()=>{
 const {db,file}=await staged();
 const d=deps(),hashOriginal=d.sha.hashBlobHex;let calls=0;
 d.sha={...d.sha,hashBlobHex:async blob=>{
  const digest=await hashOriginal(blob);
  if(++calls===3){
   const history=await get(db,'archive_history','v2-recheck');
   const tx=db.transaction('archive_history','readwrite');
   tx.objectStore('archive_history').put({...history,status:'changed-during-hash'});
   await done(tx);
  }
  return digest;
 }};
 await rejects(verify(db,file,opts(),d),'V2_VERIFY_SESSION_CHANGED');
 assert.equal((await get(db,'archive_history','v2-recheck')).status,'changed-during-hash');
 assert.equal(await count(db,'archive_staging'),2);
 db.close();
});
test('same-revision journal mutation while staged SHA is hashing is detected',async()=>{
 const {db,file}=await staged();
 const d=deps(),hashOriginal=d.sha.hashBlobHex;let calls=0;
 d.sha={...d.sha,hashBlobHex:async blob=>{
  const digest=await hashOriginal(blob);
  if(++calls===3){
   const tx=db.transaction('main','readwrite');
   tx.objectStore('main').put({...state(),records:[{id:'new-visit'}]},'state');
   await done(tx);
  }
  return digest;
 }};
 await rejects(verify(db,file,opts(),d),'V2_VERIFY_SNAPSHOT_CHANGED_DURING_HASH');
 assert.equal((await get(db,'main','state')).records[0].id,'new-visit');
 db.close();
});
test('protected full backup appearing after staging blocks verification',async()=>{
 const {db,file}=await staged();
 const tx=db.transaction('full_backup','readwrite');
 tx.objectStore('full_backup').put({important:'prior backup'},'older');
 await done(tx);
 await rejects(verify(db,file,opts(),deps()),'V2_VERIFY_PROTECTED_CONTEXT_INVALID');
 assert.ok(await get(db,'full_backup','older'));
 assert.equal(await count(db,'archive_staging'),2);
 db.close();
});
test('missing protected IndexedDB store is rejected before checking archive',async()=>{
 const {db,file}=await staged();
 const fake={objectStoreNames:{contains:n=>n!=='full_backup'},transaction(){throw Error('not allowed');}};
 await rejects(verify(fake,file,opts(),deps()),'V2_VERIFY_STORES_MISSING');
 db.close();
});
