import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const root={};
for(const file of [
 'paseka-sha256.js','video-archive-v2-guard.js','video-archive-v2-record-media.js',
 'video-archive-v2-metadata-codec.js','video-archive-v2-restore-gate.js',
 'video-archive-v2-pending-stage.js','video-archive-v2-staging-verify.js',
 'video-archive-v2-pinned-source.js'
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
  recognizedAt:'2026-11-20T00:00:00Z',stateRevisionId:'synthetic-provenance',sourceHashVerifiedAt:'2026-11-20T00:00:00Z',cleanupState:'delete_required',
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

const rehearsePinned=root.PasekaVideoArchiveV2PinnedSource.rehearsePinnedSources;
const pinnedDeps=()=>({...deps(),verify:root.PasekaVideoArchiveV2StagingVerify});
test('pinned-source rehearsal verifies immutable archive byte handles without writing anything',async()=>{
 const {db,file}=await staged(),modes=[];
 const tracked={objectStoreNames:db.objectStoreNames,transaction(stores,mode){
  modes.push(mode);return db.transaction(stores,mode);
 }};
 const report=await rehearsePinned(tracked,file,opts(),pinnedDeps());
 assert.deepEqual(modes,['readonly','readwrite','readwrite']);
 assert.equal(report.pinnedArchiveByteSourceVerified,true);
 assert.equal(report.pinnedSourceCount,1);
 assert.equal(report.pinnedSourceBytes,3);
 assert.equal(report.stagedBytesLocked,false);
 assert.equal(report.finalTransactionAborted,true);
 assert.equal(report.requiresAtomicCommitCheck,true);
 assert.equal(report.archiveSafe,false);
 assert.equal(report.restoreAuthorized,false);
 assert.equal(report.cleanupAuthorized,false);
 assert.equal('blob' in report,false,'no frozen byte handles may escape the rehearsal');
 assert.deepEqual(await get(db,'main','state'),state());
 assert.deepEqual(await get(db,'main','video_recognition_ledger_v1'),ledger());
 assert.equal(await count(db,'entrance_media'),0);
 assert.equal(await count(db,'full_backup'),0);
 assert.equal(await count(db,'archive_staging'),2);
 db.close();
});
test('pinned-source rehearsal supports archive-verified journal pending originals',async()=>{
 const {db,file}=await staged(true);
 const report=await rehearsePinned(db,file,opts(),pinnedDeps());
 assert.equal(report.pinnedSourceCount,1);
 assert.equal(report.pinnedSourceBytes,3);
 assert.equal(report.restoreAuthorized,false);
 assert.equal((await get(db,'archive_staging',
  'v2pending:v2-recheck:record_media:journal-one')).kind,'v2_pending_original');
 db.close();
});
test('same-size staged Blob swap after the stage audit cannot replace pinned archive source',async()=>{
 const {db,file}=await staged();
 const d=pinnedDeps();
 let calls=0;
 const original=d.codec.inspectMetadataArchive;
 d.codec={...d.codec,inspectMetadataArchive:async(...args)=>{
  const decoded=await original(...args);
  if(++calls===2){
   const key='v2pending:v2-recheck:entrance_media:video-one';
   const old=await get(db,'archive_staging',key);
   const tx=db.transaction('archive_staging','readwrite');
   tx.objectStore('archive_staging').put({...old,
    blob:new Blob(['xyz'],{type:'video/mp4'})});
   await done(tx);
  }
  return decoded;
 }};
 const report=await rehearsePinned(db,file,opts(),d);
 assert.equal(calls,2);
 assert.equal(report.pinnedArchiveByteSourceVerified,true);
 // The staged record HAS changed. A metadata-only lock does not prove otherwise.
 assert.equal(report.stagedBytesLocked,false);
 assert.equal(report.restoreAuthorized,false);
 assert.equal(report.cleanupAuthorized,false);
 const changed=await get(db,'archive_staging',
  'v2pending:v2-recheck:entrance_media:video-one');
 assert.equal(await root.PasekaSha256.hashBlobHex(changed.blob),
  await root.PasekaSha256.hashBlobHex(new Blob(['xyz'])));
 assert.notEqual(await root.PasekaSha256.hashBlobHex(changed.blob),
  (await d.codec.inspectMetadataArchive(file,d.crypto,d.guard,d.sha,d.recordAdapter)).pendingVideos[0].sourceSha256);
 // A second fresh audit DOES reject the changed original; previous success
 // is intentionally not an authorization to restore or delete anything.
 await rejects(rehearsePinned(db,file,opts(),pinnedDeps()),'V2_VERIFY_STAGED_HASH_CHANGED');
 db.close();
});
test('new recognition during frozen source verification blocks final aborted lock',async()=>{
 const {db,file}=await staged(),d=pinnedDeps();
 const original=d.sha.hashBlobHex;let hashed=0;
 d.sha={...d.sha,hashBlobHex:async blob=>{
  const digest=await original(blob);
  if(++hashed===6){
   const tx=db.transaction('main','readwrite');
   tx.objectStore('main').put({version:1,entries:[{
    source:'entrance_media',videoId:'video-one',resultId:'new-result',
    sourceSha256:digest,sourceBytes:3,sourceEvidenceVersion:1,
    recognizedAt:'2026-11-20T00:00:00Z',stateRevisionId:'synthetic-provenance',sourceHashVerifiedAt:'2026-11-20T00:00:00Z',cleanupState:'delete_required',
    result:{observation:'recognized while hashing'}
   }]},'video_recognition_ledger_v1');
   await done(tx);
  }
  return digest;
 }};
 await assert.rejects(rehearsePinned(db,file,opts(),d));
 assert.equal(await count(db,'entrance_media'),0);
 assert.equal(await count(db,'archive_staging'),2);
 assert.equal((await get(db,'main','video_recognition_ledger_v1')).entries.length,1);
 db.close();
});
test('staged history mutation during frozen source verification fails closed',async()=>{
 const {db,file}=await staged(),d=pinnedDeps();
 const original=d.sha.hashBlobHex;let hashed=0;
 d.sha={...d.sha,hashBlobHex:async blob=>{
  const digest=await original(blob);
  if(++hashed===6){
   const saved=await get(db,'archive_history','v2-recheck');
   const tx=db.transaction('archive_history','readwrite');
   tx.objectStore('archive_history').put({...saved,status:'manual-review'});
   await done(tx);
  }
  return digest;
 }};
 await rejects(rehearsePinned(db,file,opts(),d),'V2_PIN_SESSION_CHANGED');
 assert.equal((await get(db,'archive_history','v2-recheck')).status,'manual-review');
 assert.equal(await count(db,'archive_staging'),2);
 db.close();
});
test('pinned-source rehearsal refuses any verifier that claims permission to restore',async()=>{
 const {db,file}=await staged();
 const d=pinnedDeps();
 d.verify={verifyStagedPendingAgainstArchive:async()=>({
  verifiedAtSnapshot:true,transactionAborted:true,byteIntegrityLocked:false,
  restoreAuthorized:true,cleanupAuthorized:false
 })};
 await rejects(rehearsePinned(db,file,opts(),d),'V2_PIN_AUDIT_CONTRACT_INVALID');
 assert.equal(await count(db,'entrance_media'),0);
 db.close();
});

const rehearsePinnedAdds=root.PasekaVideoArchiveV2PinnedSource.rehearsePinnedEntranceAddsAbort;
test('real entrance-media add requests succeed inside a transaction that always aborts',async()=>{
 const {db,file}=await staged();
 const report=await rehearsePinnedAdds(db,file,opts(),pinnedDeps());
 assert.equal(report.abortedAddRequestCount,1);
 assert.equal(report.finalTransactionAborted,true);
 assert.equal(report.pinnedArchiveByteSourceVerified,true);
 assert.equal(report.restoreAuthorized,false);
 assert.equal(report.cleanupAuthorized,false);
 assert.equal(report.stagedBytesLocked,false);
 assert.equal(await count(db,'entrance_media'),0,'no inserted video may persist after abort');
 assert.equal(await count(db,'archive_staging'),2);
 assert.equal(await count(db,'archive_history'),1);
 assert.deepEqual(await get(db,'main','state'),state());
 db.close();
});
test('aborted add uses verified archive Blob, not same-size replaced staging Blob',async()=>{
 const {db,file}=await staged(),captured=[];
 const d=pinnedDeps();
 const realCodec=d.codec.inspectMetadataArchive;
 let passes=0;
 d.codec={...d.codec,inspectMetadataArchive:async(...args)=>{
  const result=await realCodec(...args);
  if(++passes===2){
   const key='v2pending:v2-recheck:entrance_media:video-one';
   const saved=await get(db,'archive_staging',key);
   const tx=db.transaction('archive_staging','readwrite');
   tx.objectStore('archive_staging').put({...saved,
    blob:new Blob(['xyz'],{type:'video/mp4'})});
   await done(tx);
  }
  return result;
 }};
 const tracked={
  objectStoreNames:db.objectStoreNames,
  transaction(names,mode){
   const tx=db.transaction(names,mode);
   if(mode!=='readwrite')return tx;
   return new Proxy(tx,{
    get(target,key){
     if(key==='objectStore')return name=>{
      const store=target.objectStore(name);
      if(name!=='entrance_media')return store;
      return new Proxy(store,{
       get(source,method){
        if(method==='add')return row=>{
         captured.push(row);return source.add(row);
        };
        const original=Reflect.get(source,method,source);
        return typeof original==='function'?original.bind(source):original;
       }
      });
     };
     const original=Reflect.get(target,key,target);
     return typeof original==='function'?original.bind(target):original;
    },
    set(target,key,value){return Reflect.set(target,key,value,target);}
   });
  }
 };
 const result=await rehearsePinnedAdds(tracked,file,opts(),d);
 assert.equal(result.abortedAddRequestCount,1);
 assert.equal(captured.length,1,'a real IndexedDB add request must be issued');
 assert.equal(captured[0].id,'video-one');
 const verified=await root.PasekaSha256.hashBlobHex(new Blob(['abc'],{type:'video/mp4'}));
 assert.equal(await root.PasekaSha256.hashBlobHex(captured[0].blob),verified);
 const persisted=await get(db,'archive_staging',
  'v2pending:v2-recheck:entrance_media:video-one');
 assert.notEqual(await root.PasekaSha256.hashBlobHex(persisted.blob),verified);
 assert.equal(await count(db,'entrance_media'),0);
 assert.equal(result.cleanupAuthorized,false);
 db.close();
});
test('journal videos cannot be written into entrance_media by abort-only rehearsal',async()=>{
 const {db,file}=await staged(true);
 await rejects(rehearsePinnedAdds(db,file,opts(),pinnedDeps()),
  'V2_PIN_WRITE_ENTRANCE_ONLY');
 assert.equal(await count(db,'entrance_media'),0);
 assert.equal(await count(db,'archive_staging'),2);
 db.close();
});
test('new entrance ID race before lock prevents even tentative add',async()=>{
 const {db,file}=await staged();
 const d=pinnedDeps(),original=d.sha.hashBlobHex;let hashes=0;
 d.sha={...d.sha,hashBlobHex:async blob=>{
  const digest=await original(blob);
  if(++hashes===6){
   const tx=db.transaction('entrance_media','readwrite');
   tx.objectStore('entrance_media').add({
    id:'video-one',blob:new Blob(['new independent original'])
   });
   await done(tx);
  }
  return digest;
 }};
 await rejects(rehearsePinnedAdds(db,file,opts(),d),
  'V2_RESTORE_LIVE_ENTRANCE_ID_COLLISION');
 assert.equal((await get(db,'entrance_media','video-one')).blob.size,24);
 assert.equal(await count(db,'archive_staging'),2);
 assert.equal(await count(db,'archive_history'),1);
 db.close();
});
test('unexpected IDB add failure never commits any verified video',async()=>{
 const {db,file}=await staged();
 const tracked={
  objectStoreNames:db.objectStoreNames,
  transaction(stores,mode){
   const tx=db.transaction(stores,mode);
   if(mode!=='readwrite')return tx;
   return new Proxy(tx,{
    get(target,key){
     if(key==='objectStore')return name=>{
      const store=target.objectStore(name);
      if(name!=='entrance_media')return store;
      return new Proxy(store,{
       get(source,method){
        if(method==='add')return ()=>{throw new Error('simulated write failure');};
        const value=Reflect.get(source,method,source);
        return typeof value==='function'?value.bind(source):value;
       }
      });
     };
     const val=Reflect.get(target,key,target);
     return typeof val==='function'?val.bind(target):val;
    },
    set(target,key,value){return Reflect.set(target,key,value,target);}
   });
  }
 };
 await assert.rejects(rehearsePinnedAdds(tracked,file,opts(),pinnedDeps()),
  /simulated write failure/);
 assert.equal(await count(db,'entrance_media'),0);
 assert.equal(await count(db,'archive_staging'),2);
 db.close();
});
