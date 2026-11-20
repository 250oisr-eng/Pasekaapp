import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const root={};
const sourceFiles=[
 'paseka-sha256.js','video-archive-v2-guard.js',
 'video-archive-v2-record-media.js','video-archive-v2-metadata-codec.js',
 'video-archive-v2-restore-gate.js','video-archive-v2-restore-db-preflight.js',
 'video-archive-v2-commit-lock-guard.js','video-archive-v2-restore-dry-run.js'
];
for(const file of sourceFiles){
 new Function('window',await readFile(new URL('../js/'+file,import.meta.url),'utf8'))(root);
}
const deps=()=>({
 codec:root.PasekaVideoArchiveV2MetadataCodec,
 preflight:root.PasekaVideoArchiveV2RestoreDatabasePreflight,
 commitLock:root.PasekaVideoArchiveV2CommitLockGuard,
 sha:root.PasekaSha256,guard:root.PasekaVideoArchiveV2Guard,
 gate:root.PasekaVideoArchiveV2RestoreGate,
 recordAdapter:root.PasekaVideoArchiveV2RecordMedia,
 crypto:webcrypto
});
const done=tx=>new Promise((res,rej)=>{tx.oncomplete=res;tx.onabort=tx.onerror=()=>rej(tx.error||new Error('db aborted'));});
const fail=(promise,code)=>assert.rejects(promise,e=>e.code===code);
const emptyLedger=()=>({version:1,entries:[]});
const state=()=>({meta:{schemaVersion:15,revisionId:'old'},records:[],hives:[]});
const archiveInput=()=>({state:state(),ledger:emptyLedger(),backupId:'snapshot-dry-run',createdAt:'2026-11-20T00:00:00Z'});
const build=input=>root.PasekaVideoArchiveV2MetadataCodec.buildMetadataArchive(input,webcrypto,
 root.PasekaVideoArchiveV2Guard,root.PasekaSha256,root.PasekaVideoArchiveV2RecordMedia);
const inspect=(db,file,d=deps())=>root.PasekaVideoArchiveV2RestoreDryRun.inspectRestoreDryRun(db,file,d);
async function setup(){
 const req=new IDBFactory().open('v2-dry-run-test',1);
 req.onupgradeneeded=()=>{
  const db=req.result;
  db.createObjectStore('main');
  db.createObjectStore('entrance_media',{keyPath:'id'});
  db.createObjectStore('archive_staging',{keyPath:'id'});
  db.createObjectStore('archive_history',{keyPath:'backupId'});
  db.createObjectStore('full_backup');
 };
 const db=await new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);});
 const tx=db.transaction('main','readwrite');
 tx.objectStore('main').put(state(),'state');
 tx.objectStore('main').put(emptyLedger(),'video_recognition_ledger_v1');
 await done(tx);
 return db;
}
const journalSha='039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81';
test('real PASEKA02 file validates through both live gates without writing state or permitting restore',async()=>{
 const db=await setup(),file=await build(archiveInput()),modes=[];
 const tracked={objectStoreNames:db.objectStoreNames,transaction(...args){
  modes.push(args[1]);return db.transaction(...args);
 }};
 const result=await inspect(tracked,file);
 assert.deepEqual(modes,['readonly','readwrite']);
 assert.equal(result.fileSha256,await root.PasekaSha256.hashBlobHex(file));
 assert.equal(result.incomingSchemaVersion,15);
 assert.equal(result.lockedInspectionPassed,true);
 assert.equal(result.restoreAuthorized,false);
 assert.equal(result.archiveSafe,false);
 assert.equal(result.requiresAtomicCommitCheck,true);
 assert.equal(result.requiresRecoveryPlan,true);
 const tx=db.transaction('main','readonly');
 const saved=await new Promise((res,rej)=>{
  const q=tx.objectStore('main').get('state');q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);
 });
 assert.deepEqual(saved,state());db.close();
});
test('mixed verified entrance and journal originals are counted without admitting a restore',async()=>{
 const db=await setup(),args=archiveInput();
 const b=new Blob([new Uint8Array([7,8,9])],{type:'video/mp4'});
 args.pendingVideos=[{source:'entrance_media',videoId:'entrance',sourceSha256:await root.PasekaSha256.hashBlobHex(b),
  sourceBytes:b.size,mimeType:'video/mp4',blob:b}];
 args.state.records=[{id:'inspection',media:[{kind:'photo',id:'photo',data:'data:image/jpeg;base64,AA=='},
  {kind:'video',videoId:'journal',sourceSha256:journalSha,sourceBytes:3,
   data:'data:video/mp4;base64,AQID'}]}];
 const result=await inspect(db,await build(args));
 assert.equal(result.pendingEntranceCount,1);
 assert.equal(result.pendingRecordCount,1);
 assert.equal(result.restoreAuthorized,false);
 db.close();
});
test('v1 file is rejected before opening a DB transaction',async()=>{
 const db=await setup();
 const file=await build(archiveInput()),bytes=new Uint8Array(await file.arrayBuffer());
 bytes.set(new TextEncoder().encode('PASEKA01'));
 let transactions=0;
 const tracked={objectStoreNames:db.objectStoreNames,transaction(...args){transactions++;return db.transaction(...args);}};
 await fail(inspect(tracked,new Blob([bytes])),'V2_MAGIC_MISMATCH');
 assert.equal(transactions,0);db.close();
});
test('tampered v2 payload cannot reach live database preflight',async()=>{
 const db=await setup();
 const file=await build(archiveInput()),bytes=new Uint8Array(await file.arrayBuffer());
 bytes[bytes.length-1]^=1;
 let transactions=0;
 const tracked={objectStoreNames:db.objectStoreNames,transaction(...args){transactions++;return db.transaction(...args);}};
 await fail(inspect(tracked,new Blob([bytes])),'V2_PAYLOAD_HASH_MISMATCH');
 assert.equal(transactions,0);db.close();
});
test('recognition occurring after first readonly preflight is caught under final aborted write lock',async()=>{
 const db=await setup(),file=await build(archiveInput()),d=deps();
 d.preflight={async inspectRestoreCandidateAgainstDatabase(...args){
  const initial=await root.PasekaVideoArchiveV2RestoreDatabasePreflight.inspectRestoreCandidateAgainstDatabase(...args);
  const tx=db.transaction('main','readwrite');
  tx.objectStore('main').put({version:1,entries:[{
   source:'entrance_media',videoId:'recognized',resultId:'result',recognizedAt:'2026-11-20T00:00:00Z',
   sourceSha256:'a'.repeat(64),sourceBytes:3,sourceEvidenceVersion:1,
   cleanupState:'deleted',result:{observation:'seen'}
  }]},'video_recognition_ledger_v1');
  await done(tx);
  return initial;
 }};
 await fail(inspect(db,file,d),'V2_RESTORE_LEDGER_HISTORY_LOST');
 db.close();
});
test('existing rollback/staging record blocks dry run and remains untouched',async()=>{
 const db=await setup(),file=await build(archiveInput());
 const tx=db.transaction('archive_staging','readwrite');
 tx.objectStore('archive_staging').put({id:'old-copy',blob:new Blob(['protected'])});
 await done(tx);
 await fail(inspect(db,file),'V2_RESTORE_EXISTING_ARCHIVE_HISTORY');
 const rd=db.transaction('archive_staging','readonly');
 const saved=await new Promise((res,rej)=>{
  const q=rd.objectStore('archive_staging').get('old-copy');
  q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);
 });
 assert.equal(saved.blob.size,9);db.close();
});
test('existing live recognition results cannot be erased by archive with empty ledger',async()=>{
 const db=await setup(),file=await build(archiveInput());
 const tx=db.transaction('main','readwrite');
 tx.objectStore('main').put({version:1,entries:[{
  source:'entrance_media',videoId:'v',resultId:'r',sourceSha256:'a'.repeat(64),
  sourceBytes:3,sourceEvidenceVersion:1,recognizedAt:'2026-11-20T00:00:00Z',
  cleanupState:'deleted',result:{observation:'yes'}
 }]},'video_recognition_ledger_v1');
 await done(tx);
 await fail(inspect(db,file),'V2_RESTORE_LEDGER_HISTORY_LOST');
 db.close();
});
test('unsupported incoming schema is rejected, not interpreted as current schema',async()=>{
 const db=await setup(),args=archiveInput();args.state.meta.schemaVersion=999;
 await fail(inspect(db,await build(args)),'V2_DRY_RUN_SCHEMA_UNSUPPORTED');
 db.close();
});
test('missing codec, write-lock gate or signature never produces an import approval',async()=>{
 const db=await setup(),file=await build(archiveInput());
 let d=deps();delete d.commitLock;
 await fail(inspect(db,file,d),'V2_DRY_RUN_DEPENDENCIES_MISSING');
 d=deps();d.commitLock={async checkRestoreUnderAbortedWriteLock(){
  return {restoreAuthorized:true,archiveSafe:true,lockValidated:true,transactionAborted:false};
 }};
 await fail(inspect(db,file,d),'V2_DRY_RUN_LOCK_CONTRACT_INVALID');
 db.close();
});
