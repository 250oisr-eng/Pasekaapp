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
 'video-archive-v2-entrance-atomic.js','video-archive-v2-entrance-quarantine-rollback.js'
])new Function('window',await readFile(new URL('../js/'+file,import.meta.url),'utf8'))(root);
const d=()=>({
 guard:root.PasekaVideoArchiveV2Guard,
 gate:root.PasekaVideoArchiveV2RestoreGate,
 codec:root.PasekaVideoArchiveV2MetadataCodec,
 recordAdapter:root.PasekaVideoArchiveV2RecordMedia,
 sha:root.PasekaSha256,verify:root.PasekaVideoArchiveV2StagingVerify,
 crypto:webcrypto
});
const stage=root.PasekaVideoArchiveV2PendingStage.stagePendingRestore;
const commit=root.PasekaVideoArchiveV2EntranceAtomic.commitEntranceOnlyIsolated;
const rollback=root.PasekaVideoArchiveV2QuarantineRollback.quarantineRollbackIsolated;
const inspect=root.PasekaVideoArchiveV2QuarantineRollback.inspectQuarantine;
const valid=x=>Array.isArray(x.records)&&Array.isArray(x.hives);
const state=(revision='base')=>({meta:{schemaVersion:15,revisionId:revision},
 records:[],hives:[{id:'hive-1'}],families:[]});
const rec=()=>({source:'entrance_media',videoId:'prior-processed',resultId:'result-1',
 sourceSha256:'a'.repeat(64),sourceBytes:3,sourceEvidenceVersion:1,
 recognizedAt:'2026-11-20T00:00:00Z',stateRevisionId:'synthetic-provenance',sourceHashVerifiedAt:'2026-11-20T00:00:00Z',cleanupState:'deleted',
 result:{observation:'recognized earlier'}});
const ledger=()=>({version:1,entries:[rec()]});
const stageOpts=()=>({backupId:'quarantine-test',expectedRevision:'base',
 createdAt:'2026-11-20T00:00:00Z'});
const commitOpts=()=>({backupId:'quarantine-test',expectedRevision:'base',
 newRevisionId:'imported',validateState:valid});
const rollbackOpts=(other={})=>({backupId:'quarantine-test',
 expectedRevision:'imported',rollbackRevisionId:'restored',
 validateState:valid,...other});
const sha=blob=>root.PasekaSha256.hashBlobHex(blob);
const rejects=(p,code)=>assert.rejects(p,e=>e.code===code);
const done=tx=>new Promise((ok,no)=>{
 tx.oncomplete=ok;tx.onabort=tx.onerror=()=>no(tx.error||Error('aborted'));
});
let serial=0;
async function setup(){
 const factory=new IDBFactory(),name='v2-quarantine-'+(++serial);
 const request=factory.open(name,1);
 request.onupgradeneeded=()=>{
  const db=request.result;db.createObjectStore('main');
  db.createObjectStore('entrance_media',{keyPath:'id'});
  const s=db.createObjectStore('archive_staging',{keyPath:'id'});
  s.createIndex('sessionId','sessionId',{unique:false});
  s.createIndex('backupId','backupId',{unique:true});
  s.createIndex('kind','kind',{unique:false});
  db.createObjectStore('archive_history',{keyPath:'backupId'});
  db.createObjectStore('full_backup');
 };
 const db=await new Promise((ok,no)=>{
  request.onsuccess=()=>ok(request.result);request.onerror=()=>no(request.error);
 });
 const tx=db.transaction('main','readwrite');
 tx.objectStore('main').put(state(),'state');
 tx.objectStore('main').put(ledger(),'video_recognition_ledger_v1');
 await done(tx);return {db,factory,name};
}
async function get(db,store,key){
 return new Promise((ok,no)=>{
  const req=db.transaction(store,'readonly').objectStore(store).get(key);
  req.onsuccess=()=>ok(req.result);req.onerror=()=>no(req.error);
 });
}
async function count(db,store){
 return new Promise((ok,no)=>{
  const req=db.transaction(store,'readonly').objectStore(store).count();
  req.onsuccess=()=>ok(req.result);req.onerror=()=>no(req.error);
 });
}
async function put(db,store,key,value){
 const tx=db.transaction(store,'readwrite'),s=tx.objectStore(store);
 if(['entrance_media','archive_history','archive_staging'].includes(store))s.put(value);
 else s.put(value,key);
 await done(tx);
}
async function seed(){
 const {db,factory,name}=await setup();
 const original=new Blob(['abc'],{type:'video/mp4'}),digest=await sha(original);
 const file=await d().codec.buildMetadataArchive({
  state:state('archive'),ledger:ledger(),
  backupId:'quarantine-test',createdAt:stageOpts().createdAt,
  pendingVideos:[{source:'entrance_media',videoId:'new-video',
   sourceSha256:digest,sourceBytes:3,mimeType:'video/mp4',blob:original}]
 },webcrypto,d().guard,d().sha,d().recordAdapter);
 await stage(db,file,stageOpts(),d());
 await commit(db,file,commitOpts(),d());
 return {db,factory,name,file,digest};
}
test('rollback atomically moves original video into protected quarantine and reverts state',async()=>{
 const {db,digest}=await seed();
 const result=await rollback(db,rollbackOpts(),d());
 assert.equal(result.reverted,true);
 assert.equal(result.quarantineOriginalCount,1);
 assert.equal(result.protectedCopiesRetained,true);
 assert.equal(result.byteIntegrityLocked,false);
 assert.equal(result.rollbackAuthorized,false);
 assert.equal(result.cleanupAuthorized,false);
 assert.equal(result.archiveSafe,false);
 assert.deepEqual(await get(db,'main','state'),state('restored'));
 assert.deepEqual(await get(db,'main','video_recognition_ledger_v1'),ledger());
 assert.equal(await count(db,'entrance_media'),0);
 assert.equal(await count(db,'archive_staging'),2);
 assert.equal(await count(db,'full_backup'),1);
 assert.equal(await count(db,'archive_history'),1);
 const snapshot=await get(db,'full_backup','v2entrance:quarantine-test');
 assert.equal(snapshot.kind,'v2_entrance_quarantine_rollback_snapshot');
 assert.equal(snapshot.quarantinedMedia.length,1);
 assert.equal(await sha(snapshot.quarantinedMedia[0].blob),digest);
 assert.equal((await get(db,'archive_history','quarantine-test')).status,
  'reverted_quarantined_unverified');
 const audit=await inspect(db,'quarantine-test',d());
 assert.equal(audit.status,'reverted_quarantine_unverified');
 assert.equal(audit.byteIntegrityVerified,false);
 db.close();
});
test('inspector after restart is readonly and cannot delete quarantined originals',async()=>{
 const {db,factory,name,digest}=await seed();
 await rollback(db,rollbackOpts(),d());db.close();
 const req=factory.open(name,1);
 const opened=await new Promise((ok,no)=>{
  req.onsuccess=()=>ok(req.result);req.onerror=()=>no(req.error);
 });
 const modes=[];
 const checked={objectStoreNames:opened.objectStoreNames,transaction(stores,mode){
  modes.push(mode);if(mode!=='readonly')throw Error('recovery used write');
  return opened.transaction(stores,mode);
 }};
 const result=await inspect(checked,'quarantine-test',d());
 assert.deepEqual(modes,['readonly']);
 assert.equal(result.status,'reverted_quarantine_unverified');
 assert.equal(result.cleanupAuthorized,false);
 assert.equal(await sha((await get(opened,'full_backup',
  'v2entrance:quarantine-test')).quarantinedMedia[0].blob),digest);
 opened.close();
});
test('second rollback is rejected; protected copies and restored state survive',async()=>{
 const {db}=await seed();
 await rollback(db,rollbackOpts(),d());
 await rejects(rollback(db,rollbackOpts(),d()),'V2_QUARANTINE_HISTORY_CHANGED');
 assert.equal(await count(db,'full_backup'),1);
 assert.equal(await count(db,'archive_staging'),2);
 assert.deepEqual(await get(db,'main','state'),state('restored'));
 db.close();
});
test('new recognition result blocks rollback and preserves live original',async()=>{
 const {db,digest}=await seed();
 const expanded=ledger();expanded.entries.push({
  source:'entrance_media',videoId:'new-video',resultId:'recognition-2',
  sourceSha256:digest,sourceBytes:3,sourceEvidenceVersion:1,
  recognizedAt:'2026-11-20T10:00:00Z',stateRevisionId:'synthetic-provenance',sourceHashVerifiedAt:'2026-11-20T10:00:00Z',cleanupState:'delete_required',
  result:{note:'new observation'}
 });
 await put(db,'main','video_recognition_ledger_v1',expanded);
 await rejects(rollback(db,rollbackOpts(),d()),'V2_QUARANTINE_LEDGER_CHANGED');
 assert.deepEqual(await get(db,'main','video_recognition_ledger_v1'),expanded);
 assert.equal(await count(db,'entrance_media'),1);
 assert.equal((await get(db,'archive_history','quarantine-test')).status,
  'committed_rollback_blocked');
 assert.equal(await count(db,'full_backup'),1);
 db.close();
});
test('new journal entry even without revision bump blocks rollback',async()=>{
 const {db}=await seed(),changed=state('imported');
 changed.records=[{id:'important',text:'do not erase'}];
 await put(db,'main','state',changed);
 await rejects(rollback(db,rollbackOpts(),d()),'V2_QUARANTINE_IMPORTED_STATE_CHANGED');
 assert.deepEqual(await get(db,'main','state'),changed);
 assert.equal(await count(db,'entrance_media'),1);
 db.close();
});
test('new revision blocks rollback before any media hash work',async()=>{
 const {db}=await seed(),changed=state('concurrent-revision');
 await put(db,'main','state',changed);
 let calls=0;const dep=d();dep.sha={hashBlobHex:async()=>{calls++;return 'a'.repeat(64);}};
 await rejects(rollback(db,rollbackOpts(),dep),'V2_QUARANTINE_IMPORTED_STATE_CHANGED');
 assert.equal(calls,0);
 assert.equal(await count(db,'entrance_media'),1);
 db.close();
});
test('tampered importedRevisionId blocks preflight before async SHA',async()=>{
 const {db}=await seed();
 const history=await get(db,'archive_history','quarantine-test');
 await put(db,'archive_history','quarantine-test',{
  ...history,importedRevisionId:'not-imported'
 });
 let calls=0,dep=d();dep.sha={hashBlobHex:async()=>{calls++;return '0'.repeat(64);}};
 await rejects(rollback(db,rollbackOpts(),dep),'V2_QUARANTINE_HISTORY_CHANGED');
 assert.equal(calls,0);
 assert.equal(await count(db,'full_backup'),1);
 db.close();
});
test('unexpected extra live video blocks rollback without deleting either',async()=>{
 const {db}=await seed();
 const tx=db.transaction('entrance_media','readwrite');
 tx.objectStore('entrance_media').add({
  id:'newer-video',blob:new Blob(['new original'],{type:'video/mp4'})
 });
 await done(tx);
 await rejects(rollback(db,rollbackOpts(),d()),'V2_QUARANTINE_VIDEO_SET_CHANGED');
 assert.equal(await count(db,'entrance_media'),2);
 assert.equal(await count(db,'full_backup'),1);
 db.close();
});
test('corrupted live video bytes with unchanged SHA metadata block rollback',async()=>{
 const {db}=await seed();
 const original=await get(db,'entrance_media','new-video');
 await put(db,'entrance_media','new-video',{
  ...original,blob:new Blob(['xyz'],{type:'video/mp4'})
 });
 await rejects(rollback(db,rollbackOpts(),d()),'V2_QUARANTINE_VIDEO_HASH_CHANGED');
 assert.equal((await get(db,'entrance_media','new-video')).blob.size,3);
 assert.equal(await count(db,'full_backup'),1);
 db.close();
});
test('change in ledger after preflight SHA blocks final transaction',async()=>{
 const {db}=await seed(),dep=d(),original=dep.sha.hashBlobHex;let updated=false;
 dep.sha={...dep.sha,hashBlobHex:async blob=>{
  const digest=await original(blob);
  if(!updated){
   updated=true;
   const entry=ledger();entry.entries.push({
    source:'entrance_media',videoId:'new-video',resultId:'r3',
    sourceSha256:digest,sourceBytes:3,sourceEvidenceVersion:1,
    recognizedAt:'2026-11-20T10:00:00Z',stateRevisionId:'synthetic-provenance',sourceHashVerifiedAt:'2026-11-20T10:00:00Z',cleanupState:'delete_required',
    result:{note:'recognized while hashing'}
   });
   await put(db,'main','video_recognition_ledger_v1',entry);
  }
  return digest;
 }};
 await rejects(rollback(db,rollbackOpts(),dep),'V2_QUARANTINE_LEDGER_CHANGED');
 assert.equal(await count(db,'entrance_media'),1);
 assert.equal(await count(db,'full_backup'),1);
 db.close();
});
test('same-size bytes swapped after preflight SHA are preserved in quarantine, never discarded',async()=>{
 const {db}=await seed(),dep=d(),original=dep.sha.hashBlobHex;let updated=false;
 dep.sha={...dep.sha,hashBlobHex:async blob=>{
  const digest=await original(blob);
  if(!updated){
   updated=true;
   const row=await get(db,'entrance_media','new-video');
   await put(db,'entrance_media','new-video',{
    ...row,blob:new Blob(['xyz'],{type:'video/mp4'})
   });
  }
  return digest;
 }};
 const result=await rollback(db,rollbackOpts(),dep);
 assert.equal(result.reverted,true);
 assert.equal(result.byteIntegrityLocked,false);
 const snapshot=await get(db,'full_backup','v2entrance:quarantine-test');
 assert.equal(await sha(snapshot.quarantinedMedia[0].blob),
  await sha(new Blob(['xyz'],{type:'video/mp4'})));
 assert.equal(await count(db,'entrance_media'),0);
 assert.equal(result.cleanupAuthorized,false);
 db.close();
});
test('injected failure after snapshot put aborts quarantine, history, state and live deletes',async()=>{
 const {db}=await seed();
 const wrapped={objectStoreNames:db.objectStoreNames,transaction(stores,mode){
  const tx=db.transaction(stores,mode);
  if(mode!=='readwrite')return tx;
  return new Proxy(tx,{
   get(target,key){
    if(key==='objectStore')return storeName=>{
     const store=target.objectStore(storeName);
     if(storeName!=='entrance_media')return store;
     return new Proxy(store,{
      get(source,method){
       if(method==='delete')return ()=>{throw Error('simulated delete failure');};
       const val=Reflect.get(source,method,source);
       return typeof val==='function'?val.bind(source):val;
      }
     });
    };
    const val=Reflect.get(target,key,target);
    return typeof val==='function'?val.bind(target):val;
   },
   set(target,key,value){return Reflect.set(target,key,value,target);}
  });
 }};
 await assert.rejects(rollback(wrapped,rollbackOpts(),d()),
  /simulated delete failure/);
 assert.deepEqual(await get(db,'main','state'),state('imported'));
 assert.equal(await count(db,'entrance_media'),1);
 assert.equal((await get(db,'archive_history','quarantine-test')).status,
  'committed_rollback_blocked');
 const snapshot=await get(db,'full_backup','v2entrance:quarantine-test');
 assert.equal(snapshot.kind,'v2_entrance_only_rollback_unverified');
 assert.equal(snapshot.quarantinedMedia,undefined);
 assert.equal(await count(db,'archive_staging'),2);
 db.close();
});
test('new state after quarantine forces recovery manual review without cleanup',async()=>{
 const {db}=await seed();
 await rollback(db,rollbackOpts(),d());
 const changed=state('restored');changed.records=[{id:'new-entry'}];
 await put(db,'main','state',changed);
 const report=await inspect(db,'quarantine-test',d());
 assert.equal(report.status,'manual_review_required');
 assert.equal(report.cleanupAuthorized,false);
 assert.equal(await count(db,'full_backup'),1);
 db.close();
});


for (const [storeName,methodName] of [
 ['full_backup','put'],
 ['archive_history','put'],
 ['main','put'],
 ['entrance_media','delete']
]) {
 test('rollback abort after '+storeName+'.'+methodName+' survives reopen and retry',async t=>{
  const {db,factory,name,digest}=await seed();
  let once=false;
  const wrapped={
   objectStoreNames:db.objectStoreNames,
   transaction(stores,mode){
    const tx=db.transaction(stores,mode);
    if(mode!=='readwrite')return tx;
    return new Proxy(tx,{
     get(target,key){
      if(key==='objectStore')return targetName=>{
       const store=target.objectStore(targetName);
       if(targetName!==storeName)return store;
       return new Proxy(store,{
        get(source,method){
         if(method===methodName)return (...args)=>{
          const request=source[method](...args);
          request.addEventListener('success',()=>{
           if(!once){once=true;tx.abort();}
          });
          return request;
         };
         const val=Reflect.get(source,method,source);
         return typeof val==='function'?val.bind(source):val;
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
  await assert.rejects(rollback(wrapped,rollbackOpts(),d()));
  assert.equal(once,true,'the request succeeded before forced rollback');
  db.close();
  const reopenedRequest=factory.open(name,1);
  const reopened=await new Promise((resolve,reject)=>{
   reopenedRequest.onsuccess=()=>resolve(reopenedRequest.result);
   reopenedRequest.onerror=()=>reject(reopenedRequest.error);
  });
  t.after(()=>reopened.close());
  assert.deepEqual(await get(reopened,'main','state'),state('imported'));
  assert.deepEqual(await get(reopened,'main','video_recognition_ledger_v1'),ledger());
  assert.equal(await count(reopened,'entrance_media'),1);
  assert.equal(await sha((await get(reopened,'entrance_media','new-video')).blob),digest);
  assert.equal(await count(reopened,'archive_staging'),2);
  assert.equal(await count(reopened,'full_backup'),1);
  assert.equal((await get(reopened,'archive_history','quarantine-test')).status,
   'committed_rollback_blocked');
  const originalSnapshot=await get(reopened,'full_backup','v2entrance:quarantine-test');
  assert.equal(originalSnapshot.kind,'v2_entrance_only_rollback_unverified');
  assert.equal(originalSnapshot.quarantinedMedia,undefined);
  assert.equal((await rollback(reopened,rollbackOpts(),d())).reverted,true);
  const quarantined=await get(reopened,'full_backup','v2entrance:quarantine-test');
  assert.equal(await sha(quarantined.quarantinedMedia[0].blob),digest);
  assert.equal(await count(reopened,'entrance_media'),0);
  assert.equal((await inspect(reopened,'quarantine-test',d())).status,
   'reverted_quarantine_unverified');
  assert.equal((await inspect(reopened,'quarantine-test',d())).cleanupAuthorized,false);
  await assert.rejects(rollback(reopened,rollbackOpts(),d()));
 });
}


function recognizedAfterQuarantine(sourceHash){
 return {
  source:'entrance_media',videoId:'new-video',resultId:'processed-after-quarantine',
  sourceSha256:sourceHash,sourceBytes:3,sourceEvidenceVersion:1,
  recognizedAt:'2026-11-21T12:00:00Z',stateRevisionId:'synthetic-provenance',sourceHashVerifiedAt:'2026-11-21T12:00:00Z',cleanupState:'deleted',
  result:{event:'synthetic-test-result'}
 };
}
async function quarantinedWithDurableTombstone(){
 const seeded=await seed();
 await rollback(seeded.db,rollbackOpts(),d());
 const saved=ledger();
 saved.entries.push(recognizedAfterQuarantine(seeded.digest));
 await put(seeded.db,'main','video_recognition_ledger_v1',saved);
 return {...seeded,saved};
}
test('old archive missing the post-quarantine tombstone is rejected before restoring media',async t=>{
 const {db,digest,saved}=await quarantinedWithDurableTombstone();
 t.after(()=>db.close());
 const old={
  state:state('before-recognition'),ledger:ledger(),
  pendingVideos:[{source:'entrance_media',videoId:'new-video',
   sourceSha256:digest,sourceBytes:3}]
 };
 assert.throws(()=>d().gate.checkRestoreLedgerCandidate(saved,old,d().guard),
  {code:'V2_RESTORE_LEDGER_HISTORY_LOST'});
 assert.deepEqual(await get(db,'main','video_recognition_ledger_v1'),saved);
 const quarantine=await get(db,'full_backup','v2entrance:quarantine-test');
 assert.equal(await sha(quarantine.quarantinedMedia[0].blob),digest);
 assert.equal(await count(db,'entrance_media'),0);
});
test('old archive with preserved tombstone but original payload still cannot restore it',async t=>{
 const {db,digest,saved}=await quarantinedWithDurableTombstone();
 t.after(()=>db.close());
 const old={
  state:state('before-recognition'),ledger:saved,
  pendingVideos:[{source:'entrance_media',videoId:'new-video',
   sourceSha256:digest,sourceBytes:3}]
 };
 assert.throws(()=>d().gate.checkRestoreLedgerCandidate(saved,old,d().guard),
  {code:'V2_RECOGNIZED_ORIGINAL_INCLUDED'});
 assert.equal(await count(db,'entrance_media'),0);
 assert.equal(await count(db,'full_backup'),1);
});
test('renaming a tombstoned original does not bypass its hash-based restore guard',async t=>{
 const {db,digest,saved}=await quarantinedWithDurableTombstone();
 t.after(()=>db.close());
 const old={
  state:state('before-recognition'),ledger:saved,
  pendingVideos:[{source:'entrance_media',videoId:'renamed-original',
   sourceSha256:digest,sourceBytes:3}]
 };
 assert.throws(()=>d().gate.checkRestoreLedgerCandidate(saved,old,d().guard),
  {code:'V2_RESTORE_RECOGNIZED_ORIGINAL'});
 assert.equal(await count(db,'entrance_media'),0);
 assert.deepEqual(await get(db,'main','video_recognition_ledger_v1'),saved);
 const quarantine=await get(db,'full_backup','v2entrance:quarantine-test');
 assert.equal(await sha(quarantine.quarantinedMedia[0].blob),digest);
});


for(const [field,corrupt] of [
 ['source',row=>({...row,source:'record_media'})],
 ['sha',row=>({...row,sourceSha256:'0'.repeat(64)})],
 ['size',row=>({...row,sourceBytes:row.sourceBytes+1})],
 ['identity',row=>({...row,videoId:'other-video'})]
]){
 test('quarantine inspector declines healthy status for altered staging child '+field,async t=>{
  const {db,digest}=await seed();t.after(()=>db.close());
  await rollback(db,rollbackOpts(),d());
  assert.equal((await inspect(db,'quarantine-test',d())).status,
   'reverted_quarantine_unverified');
  const key='v2pending:quarantine-test:entrance_media:new-video';
  const child=await get(db,'archive_staging',key);
  await put(db,'archive_staging',key,corrupt(child));
  const report=await inspect(db,'quarantine-test',d());
  assert.equal(report.status,'manual_review_required');
  assert.equal(report.cleanupAuthorized,false);
  assert.equal(report.restoreAuthorized,false);
  assert.equal(report.byteIntegrityVerified,false);
  const snapshot=await get(db,'full_backup','v2entrance:quarantine-test');
  assert.equal(await sha(snapshot.quarantinedMedia[0].blob),digest);
  assert.deepEqual(await get(db,'main','video_recognition_ledger_v1'),ledger());
  assert.equal(await count(db,'entrance_media'),0);
 });
}
test('quarantine inspector rejects orphaned staging child without removing its backup',async t=>{
 const {db,digest}=await seed();t.after(()=>db.close());
 await rollback(db,rollbackOpts(),d());
 const tx=db.transaction('archive_staging','readwrite');
 tx.objectStore('archive_staging').delete('v2pending:quarantine-test:entrance_media:new-video');
 await done(tx);
 const report=await inspect(db,'quarantine-test',d());
 assert.equal(report.status,'manual_review_required');
 assert.equal(report.cleanupAuthorized,false);
 const snapshot=await get(db,'full_backup','v2entrance:quarantine-test');
 assert.equal(await sha(snapshot.quarantinedMedia[0].blob),digest);
 assert.equal(await count(db,'full_backup'),1);
});
test('quarantine inspector rejects corrupted pending header without rewriting it',async t=>{
 const {db,digest}=await seed();t.after(()=>db.close());
 await rollback(db,rollbackOpts(),d());
 const key='v2pending:quarantine-test';
 const header=await get(db,'archive_staging',key);
 await put(db,'archive_staging',key,{...header,expectedEntries:2});
 const report=await inspect(db,'quarantine-test',d());
 assert.equal(report.status,'manual_review_required');
 assert.equal(report.cleanupAuthorized,false);
 assert.equal((await get(db,'archive_staging',key)).expectedEntries,2);
 const snapshot=await get(db,'full_backup','v2entrance:quarantine-test');
 assert.equal(await sha(snapshot.quarantinedMedia[0].blob),digest);
});


async function makeLegacyPaseka01Archive(videoId='new-video'){
 const legacy={};
 for(const file of ['paseka-sha256.js','paseka-archive.js','paseka-archive-restore.js']){
  const script=await readFile(new URL('../js/'+file,import.meta.url),'utf8');
  new Function('window',script)(legacy);
 }
 const Archive=legacy.PasekaArchive;
 const original=new Blob(['abc'],{type:'video/mp4'});
 const state={meta:{schemaVersion:12,revisionId:'old-revision'},
  hives:[{id:'hive-1',number:1}],families:[],records:[],snapshots:[]};
 const stateBlob=new Blob([JSON.stringify({app:'Paseka',state})],{type:'application/json'});
 const createdAt='2026-11-14T09:05:00.000Z';
 const metadata={id:videoId,hiveId:'hive-1',capturedAt:createdAt,durationSec:45,
  width:1280,height:720,bytes:original.size,mimeType:'video/mp4',name:'old.mp4',
  status:'waiting_for_server',queueCreatedAt:createdAt,retryCount:0};
 const manifest={format:Archive.FORMAT,version:Archive.VERSION,
  backupId:'old-paseka01-video',createdAt,schemaVersion:12,entries:[
   {path:'state.json',kind:'state',size:stateBlob.size,
    mimeType:'application/json',chunkSize:Archive.CHUNK_BYTES,
    chunkSha256:await Archive.hashBlobChunks(stateBlob,webcrypto)},
   {path:'entrance-media/000001.blob',kind:'entrance_video',
    size:original.size,mimeType:'video/mp4',chunkSize:Archive.CHUNK_BYTES,
    chunkSha256:await Archive.hashBlobChunks(original,webcrypto),
    metadata}
  ]};
 return {file:Archive.buildArchiveBlob(manifest,[stateBlob,original]),
  Archive,Restore:legacy.PasekaArchiveRestore};
}
test('actual PASEKA01 binary cannot revive a PASEKA02-quarantined recognized original after restart',async t=>{
 const old=await makeLegacyPaseka01Archive();
 // Use a single persistent database for real v2 commit->quarantine->v1 attempt.
 // seed() owns its factory; re-open that factory after closing the v2 connection.
 const prepared=await seed();
 let {db}=prepared;
 const expanded=ledger();expanded.entries.push({
  source:'entrance_media',videoId:'new-video',resultId:'recognition-legacy-block',
  sourceSha256:prepared.digest,sourceBytes:3,sourceEvidenceVersion:1,
  recognizedAt:'2026-11-21T12:00:00.000Z',stateRevisionId:'synthetic-provenance',sourceHashVerifiedAt:'2026-11-21T12:00:00.000Z',cleanupState:'deleted',
  result:{observation:'test-completed'}
 });
 await rollback(db,rollbackOpts(),d());
 await put(db,'main','video_recognition_ledger_v1',expanded);
 db.close();
 const request=prepared.factory.open(prepared.name,1);
 db=await new Promise((ok,no)=>{
  request.onsuccess=()=>ok(request.result);
  request.onerror=()=>no(request.error);
 });
 t.after(()=>db.close());
 const archiveParsed=await old.Archive.parseArchiveBlob(old.file);
 assert.equal(await old.Archive.verifyArchive(old.file,archiveParsed,webcrypto),true);
 const before=await get(db,'full_backup','v2entrance:quarantine-test');
 assert.equal(await sha(before.quarantinedMedia[0].blob),prepared.digest);
 const rollbackHistory=await get(db,'archive_history','quarantine-test');
 const originalStaging=await count(db,'archive_staging');
 await assert.rejects(
  old.Restore.stageArchiveForRestore(db,old.file,webcrypto,old.Archive,()=>true),
  {code:'VIDEO_LEDGER_NOT_PRESERVED'});
 assert.equal(await count(db,'entrance_media'),0);
 assert.equal(await count(db,'archive_staging'),originalStaging);
 assert.equal(await count(db,'archive_history'),1);
 assert.equal((await get(db,'archive_history','quarantine-test')).status,rollbackHistory.status);
 assert.deepEqual(await get(db,'main','video_recognition_ledger_v1'),expanded);
 assert.deepEqual(await get(db,'main','state'),state('restored'));
 const after=await get(db,'full_backup','v2entrance:quarantine-test');
 assert.equal(await sha(after.quarantinedMedia[0].blob),prepared.digest);
 assert.equal((await inspect(db,'quarantine-test',d())).cleanupAuthorized,false);
});
test('legacy PASEKA01 renamed original remains blocked after v2 quarantine with durable tombstone',async t=>{
 const old=await makeLegacyPaseka01Archive('new-name-same-bytes');
 const {db,digest}=await seed();
 t.after(()=>db.close());
 await rollback(db,rollbackOpts(),d());
 const prior=ledger();
 prior.entries.push({source:'entrance_media',videoId:'new-video',
  resultId:'recognition-renamed-legacy',sourceSha256:digest,
  sourceBytes:3,sourceEvidenceVersion:1,recognizedAt:'2026-11-21T12:00:00.000Z',stateRevisionId:'synthetic-provenance',sourceHashVerifiedAt:'2026-11-21T12:00:00.000Z',
  cleanupState:'deleted',result:{event:'test'}});
 await put(db,'main','video_recognition_ledger_v1',prior);
 await assert.rejects(
  old.Restore.stageArchiveForRestore(db,old.file,webcrypto,old.Archive,()=>true),
  {code:'VIDEO_LEDGER_NOT_PRESERVED'});
 assert.equal(await count(db,'entrance_media'),0);
 assert.deepEqual(await get(db,'main','video_recognition_ledger_v1'),prior);
 const backup=await get(db,'full_backup','v2entrance:quarantine-test');
 assert.equal(await sha(backup.quarantinedMedia[0].blob),digest);
});


test('missing recognition ledger must not allow PASEKA01 staging when v2 quarantine survives',async t=>{
 const old=await makeLegacyPaseka01Archive();
 const {db,digest}=await seed();
 t.after(()=>db.close());
 await rollback(db,rollbackOpts(),d());
 const tx=db.transaction('main','readwrite');
 tx.objectStore('main').delete('video_recognition_ledger_v1');
 await done(tx);
 // The original remains in the protected quarantine: ledger loss cannot
 // authorize importing an older backup, even for a once-valid legacy format.
 await assert.rejects(old.Restore.stageArchiveForRestore(db,old.file,webcrypto,old.Archive,()=>true),
  {code:'VIDEO_LEGACY_RESTORE_V2_PROTECTED'});
 assert.equal(await count(db,'entrance_media'),0);
 assert.equal(await count(db,'archive_staging'),2);
 assert.equal(await count(db,'archive_history'),1);
 const protectedBackup=await get(db,'full_backup','v2entrance:quarantine-test');
 assert.equal(await sha(protectedBackup.quarantinedMedia[0].blob),digest);
 assert.equal(await get(db,'main','video_recognition_ledger_v1'),undefined);
});
