import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const root={};
for(const name of [
 'paseka-sha256.js','video-archive-v2-guard.js','video-archive-v2-record-media.js',
 'video-archive-v2-metadata-codec.js','video-archive-v2-restore-gate.js',
 'video-archive-v2-pending-stage.js','video-archive-v2-staging-verify.js',
 'video-archive-v2-entrance-atomic.js'
])new Function('window',await readFile(new URL('../js/'+name,import.meta.url),'utf8'))(root);
const deps=()=>({
 sha:root.PasekaSha256,guard:root.PasekaVideoArchiveV2Guard,
 gate:root.PasekaVideoArchiveV2RestoreGate,
 codec:root.PasekaVideoArchiveV2MetadataCodec,
 recordAdapter:root.PasekaVideoArchiveV2RecordMedia,
 verify:root.PasekaVideoArchiveV2StagingVerify,
 crypto:webcrypto
});
const api=root.PasekaVideoArchiveV2EntranceAtomic;
const stage=root.PasekaVideoArchiveV2PendingStage.stagePendingRestore;
const SHA=blob=>root.PasekaSha256.hashBlobHex(blob);
const validateState=s=>Array.isArray(s.records)&&Array.isArray(s.hives);
const state=(revision='base')=>({
 meta:{schemaVersion:15,revisionId:revision},
 records:[],hives:[{id:'hive-alpha',number:1}],families:[]
});
const recognized=()=>({
 source:'entrance_media',videoId:'already-processed',resultId:'recognition-1',
 sourceSha256:'a'.repeat(64),sourceBytes:3,sourceEvidenceVersion:1,
 recognizedAt:'2026-11-20T00:00:00Z',cleanupState:'deleted',
 result:{observation:'processed'}
});
const ledger=(hasRecognized=false)=>({version:1,entries:hasRecognized?[recognized()]:[]});
const options=(other={})=>({
 backupId:'atomic-video',expectedRevision:'base',
 newRevisionId:'imported',validateState,...other
});
const stageOptions=()=>({backupId:'atomic-video',expectedRevision:'base',
 createdAt:'2026-11-20T00:00:00Z'});
const done=tx=>new Promise((ok,no)=>{
 tx.oncomplete=()=>ok();
 tx.onabort=tx.onerror=()=>no(tx.error||new Error('transaction aborted'));
});
const rejects=(promise,code)=>assert.rejects(promise,error=>error.code===code);
let serial=0;
async function setup(hasRecognized=false){
 const factory=new IDBFactory(),name='v2-entrance-atomic-test-'+(++serial);
 const request=factory.open(name,1);
 request.onupgradeneeded=()=>{
  const db=request.result;db.createObjectStore('main');
  db.createObjectStore('entrance_media',{keyPath:'id'});
  const stageStore=db.createObjectStore('archive_staging',{keyPath:'id'});
  stageStore.createIndex('sessionId','sessionId',{unique:false});
  stageStore.createIndex('backupId','backupId',{unique:true});
  stageStore.createIndex('kind','kind',{unique:false});
  db.createObjectStore('archive_history',{keyPath:'backupId'});
  db.createObjectStore('full_backup');
 };
 const db=await new Promise((ok,no)=>{
  request.onsuccess=()=>ok(request.result);
  request.onerror=()=>no(request.error);
 });
 const tx=db.transaction('main','readwrite');
 tx.objectStore('main').put(state(),'state');
 tx.objectStore('main').put(ledger(hasRecognized),'video_recognition_ledger_v1');
 await done(tx);return {db,factory,name};
}
async function get(db,store,key){
 return new Promise((ok,no)=>{
  const q=db.transaction(store,'readonly').objectStore(store).get(key);
  q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);
 });
}
async function count(db,store){
 return new Promise((ok,no)=>{
  const q=db.transaction(store,'readonly').objectStore(store).count();
  q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);
 });
}
async function archive({videoId='new-video',recordVideo=false,
 archiveState=state('archived'),hasRecognized=false,secondVideo=false}={}){
 const blob=new Blob(['abc'],{type:'video/mp4'}),digest=await SHA(blob);
 let pendingVideos=[{
  source:'entrance_media',videoId,sourceSha256:digest,
  sourceBytes:3,mimeType:'video/mp4',blob
 }];
 if(secondVideo){
  const second=new Blob(['defg'],{type:'video/mp4'});
  pendingVideos.push({source:'entrance_media',videoId:'second-video',
   sourceSha256:await SHA(second),sourceBytes:second.size,mimeType:second.type,blob:second});
 }
 if(recordVideo){
  archiveState={...archiveState,records:[{id:'record-1',media:[{
   kind:'video',videoId:'journal-video',data:'data:video/mp4;base64,YWJj',
   sourceSha256:digest,sourceBytes:3
  }]}]};
  pendingVideos=[];
 }
 const file=await deps().codec.buildMetadataArchive({
  state:archiveState,ledger:ledger(hasRecognized),pendingVideos,
  backupId:'atomic-video',createdAt:stageOptions().createdAt
 },webcrypto,deps().guard,deps().sha,deps().recordAdapter);
 return {file,digest};
}
async function prepared({hasRecognized=false,...args}={}){
 const {db,factory,name}=await setup(hasRecognized);
 const {file,digest}=await archive({hasRecognized,...args});
 await stage(db,file,stageOptions(),deps());
 return {db,factory,name,file,digest};
}
async function put(db,store,key,value){
 const tx=db.transaction(store,'readwrite'),target=tx.objectStore(store);
 if(store==='archive_history'||store==='archive_staging'||store==='entrance_media')
  target.put(value);
 else target.put(value,key);
 await done(tx);
}
test('one transaction commits pinned entrance Blob and protected rollback snapshot but not cleanup',async()=>{
 const {db,file,digest}=await prepared();
 const result=await api.commitEntranceOnlyIsolated(db,file,options(),deps());
 assert.equal(result.committed,true);
 assert.equal(result.pendingVideoCount,1);
 assert.equal(result.rollbackSnapshotPreserved,true);
 assert.equal(result.rollbackAuthorized,false);
 assert.equal(result.restoreAuthorized,false);
 assert.equal(result.cleanupAuthorized,false);
 assert.equal(result.archiveSafe,false);
 assert.deepEqual(await get(db,'main','state'),state('imported'));
 assert.deepEqual(await get(db,'main','video_recognition_ledger_v1'),ledger());
 assert.equal(await count(db,'entrance_media'),1);
 assert.equal(await SHA((await get(db,'entrance_media','new-video')).blob),digest);
 assert.equal(await count(db,'archive_staging'),2);
 assert.equal(await count(db,'archive_history'),1);
 assert.equal((await get(db,'archive_history','atomic-video')).status,
  'committed_rollback_blocked');
 const snapshot=await get(db,'full_backup','v2entrance:atomic-video');
 assert.equal(snapshot.kind,'v2_entrance_only_rollback_unverified');
 assert.deepEqual(snapshot.beforeState,state());
 assert.deepEqual(snapshot.afterState,state('imported'));
 assert.deepEqual(snapshot.beforeLedger,ledger());
 assert.equal(snapshot.importedVideos[0].blobSha256,digest);
 const diagnosis=await api.inspectEntranceCommit(db,'atomic-video',deps());
 assert.equal(diagnosis.status,'committed_media_unverified');
 assert.equal(diagnosis.byteIntegrityVerified,false);
 assert.equal(diagnosis.rollbackAuthorized,false);
 db.close();
});
test('recognized tombstones remain byte-exact across commit',async()=>{
 const {db,file}=await prepared({hasRecognized:true});
 await api.commitEntranceOnlyIsolated(db,file,options(),deps());
 assert.deepEqual(await get(db,'main','video_recognition_ledger_v1'),ledger(true));
 assert.deepEqual((await get(db,'full_backup','v2entrance:atomic-video')).beforeLedger,ledger(true));
 db.close();
});
test('after reopening database, recovery is read only and never reports byte safety',async()=>{
 const {db,factory,name,file}=await prepared();
 await api.commitEntranceOnlyIsolated(db,file,options(),deps());
 db.close();
 const opened=factory.open(name,1);
 const again=await new Promise((ok,no)=>{opened.onsuccess=()=>ok(opened.result);opened.onerror=()=>no(opened.error);});
 const calls=[];
 const spy={objectStoreNames:again.objectStoreNames,transaction(stores,mode){
  calls.push(mode);
  if(mode!=='readonly')throw Error('recovery must not mutate DB');
  return again.transaction(stores,mode);
 }};
 const report=await api.inspectEntranceCommit(spy,'atomic-video',deps());
 assert.deepEqual(calls,['readonly']);
 assert.equal(report.status,'committed_media_unverified');
 assert.equal(report.archiveSafe,false);
 assert.equal(report.rollbackAuthorized,false);
 assert.equal(report.cleanupAuthorized,false);
 again.close();
});
test('silent journal update with same revision must not be lost during entrance-only commit',async()=>{
 const {db,file}=await prepared();
 const changed=state();changed.records=[{id:'new-inspection',note:'user data'}];
 await put(db,'main','state',changed);
 await rejects(api.commitEntranceOnlyIsolated(db,file,options(),deps()),
  'V2_ENTRANCE_STATE_CHANGE_FORBIDDEN');
 assert.deepEqual(await get(db,'main','state'),changed);
 assert.equal(await count(db,'entrance_media'),0);
 assert.equal(await count(db,'full_backup'),0);
 assert.equal((await get(db,'archive_history','atomic-video')).status,'staged');
 db.close();
});
test('incoming archive cannot silently replace existing non-video state fields',async()=>{
 const {db}=await setup();
 const {file}=await archive({
  archiveState:{...state('archived'),hives:[{id:'other-hive'}]}
 });
 await stage(db,file,stageOptions(),deps());
 await rejects(api.commitEntranceOnlyIsolated(db,file,options(),deps()),
  'V2_ENTRANCE_STATE_CHANGE_FORBIDDEN');
 assert.deepEqual(await get(db,'main','state'),state());
 assert.equal(await count(db,'full_backup'),0);
 db.close();
});
test('record-media archive remains blocked, without losing a staged video or recognition result',async()=>{
 const {db,file}=await prepared({recordVideo:true});
 await rejects(api.commitEntranceOnlyIsolated(db,file,options(),deps()),
  'V2_ENTRANCE_ARCHIVE_UNSUPPORTED');
 assert.equal(await count(db,'entrance_media'),0);
 assert.equal(await count(db,'archive_staging'),2);
 assert.equal((await get(db,'archive_history','atomic-video')).status,'staged');
 db.close();
});
test('same-size staging Blob swap after SHA audit cannot affect committed pinned archive bytes',async()=>{
 const {db,file,digest}=await prepared();
 const d=deps(),original=d.codec.inspectMetadataArchive;let decoded=0;
 d.codec={...d.codec,inspectMetadataArchive:async(...args)=>{
  const incoming=await original(...args);
  if(++decoded===2){
   const key='v2pending:atomic-video:entrance_media:new-video';
   const stageRow=await get(db,'archive_staging',key);
   await put(db,'archive_staging',key,{
    ...stageRow,blob:new Blob(['xyz'],{type:'video/mp4'})
   });
  }
  return incoming;
 }};
 const result=await api.commitEntranceOnlyIsolated(db,file,options(),d);
 assert.equal(result.committed,true);
 assert.equal(await SHA((await get(db,'entrance_media','new-video')).blob),digest);
 assert.notEqual(await SHA((await get(db,'archive_staging',
  'v2pending:atomic-video:entrance_media:new-video')).blob),digest);
 const report=await api.inspectEntranceCommit(db,'atomic-video',deps());
 assert.equal(report.byteIntegrityVerified,false);
 assert.equal(report.cleanupAuthorized,false);
 db.close();
});
test('new recognition during hash phase blocks commit and retains staged originals',async()=>{
 const {db,file,digest}=await prepared();
 const d=deps(),original=d.codec.inspectMetadataArchive;let decoded=0;
 d.codec={...d.codec,inspectMetadataArchive:async(...args)=>{
  const incoming=await original(...args);
  if(++decoded===2){
   const tx=db.transaction('main','readwrite');
   tx.objectStore('main').put({version:1,entries:[{
    source:'entrance_media',videoId:'new-video',resultId:'new-recognition',
    sourceSha256:digest,sourceBytes:3,sourceEvidenceVersion:1,
    recognizedAt:'2026-11-20T00:00:00Z',cleanupState:'deleted',
    result:{note:'recognized'}
   }]},'video_recognition_ledger_v1');
   await done(tx);
  }
  return incoming;
 }};
 await assert.rejects(api.commitEntranceOnlyIsolated(db,file,options(),d));
 assert.equal((await get(db,'main','video_recognition_ledger_v1')).entries.length,1);
 assert.equal(await count(db,'entrance_media'),0);
 assert.equal(await count(db,'full_backup'),0);
 assert.equal((await get(db,'archive_history','atomic-video')).status,'staged');
 db.close();
});
test('live entrance original appearing before commit prevents new import',async()=>{
 const {db,file}=await prepared();
 const tx=db.transaction('entrance_media','readwrite');
 tx.objectStore('entrance_media').add({id:'new-video',blob:new Blob(['existing'])});
 await done(tx);
 await assert.rejects(api.commitEntranceOnlyIsolated(db,file,options(),deps()));
 assert.equal((await get(db,'entrance_media','new-video')).blob.size,8);
 assert.equal(await count(db,'full_backup'),0);
 db.close();
});
test('full_backup created after staging cannot be destroyed or overwritten',async()=>{
 const {db,file}=await prepared();
 await put(db,'full_backup','existing',{snapshot:'important'});
 await rejects(api.commitEntranceOnlyIsolated(db,file,options(),deps()),
  'V2_VERIFY_PROTECTED_CONTEXT_INVALID');
 assert.deepEqual(await get(db,'full_backup','existing'),{snapshot:'important'});
 assert.equal((await get(db,'archive_history','atomic-video')).status,'staged');
 assert.equal(await count(db,'entrance_media'),0);
 db.close();
});
test('corrupt staged row set or archive SHA blocks transaction',async()=>{
 for(const mutation of ['missing-video','altered-sha']){
  const {db,file}=await prepared();
  if(mutation==='missing-video'){
   const tx=db.transaction('archive_staging','readwrite');
   tx.objectStore('archive_staging').delete('v2pending:atomic-video:entrance_media:new-video');
   await done(tx);
  }else{
   const h=await get(db,'archive_history','atomic-video');
   await put(db,'archive_history','atomic-video',{...h,archiveSha256:'0'.repeat(64)});
  }
  await assert.rejects(api.commitEntranceOnlyIsolated(db,file,options(),deps()));
  assert.equal(await count(db,'entrance_media'),0);
  assert.equal(await count(db,'full_backup'),0);
  db.close();
 }
});
test('repeat commit cannot alter protected snapshot or duplicate original',async()=>{
 const {db,file}=await prepared();
 await api.commitEntranceOnlyIsolated(db,file,options(),deps());
 await assert.rejects(api.commitEntranceOnlyIsolated(db,file,options(),deps()));
 assert.equal(await count(db,'entrance_media'),1);
 assert.equal(await count(db,'full_backup'),1);
 assert.equal((await get(db,'archive_history','atomic-video')).status,'committed_rollback_blocked');
 db.close();
});
test('induced failure of entrance_media.add aborts entire state/history/backup write set',async()=>{
 const {db,file}=await prepared(),modes=[];
 const tracked={
  objectStoreNames:db.objectStoreNames,
  transaction(stores,mode){
   modes.push(mode);
   const tx=db.transaction(stores,mode);
   if(mode!=='readwrite')return tx;
   return new Proxy(tx,{
    get(target,name){
     if(name==='objectStore')return storeName=>{
      const store=target.objectStore(storeName);
      if(storeName!=='entrance_media')return store;
      return new Proxy(store,{
       get(source,method){
        if(method==='add')return ()=>{throw Error('injected insert failure');};
        const val=Reflect.get(source,method,source);
        return typeof val==='function'?val.bind(source):val;
       }
      });
     };
     const val=Reflect.get(target,name,target);
     return typeof val==='function'?val.bind(target):val;
    },
    set(target,key,value){return Reflect.set(target,key,value,target);}
   });
  }
 };
 await assert.rejects(api.commitEntranceOnlyIsolated(tracked,file,options(),deps()),
  /injected insert failure/);
 assert.deepEqual(await get(db,'main','state'),state());
 assert.deepEqual(await get(db,'main','video_recognition_ledger_v1'),ledger());
 assert.equal(await count(db,'entrance_media'),0);
 assert.equal(await count(db,'full_backup'),0);
 assert.equal((await get(db,'archive_history','atomic-video')).status,'staged');
 assert.equal(await count(db,'archive_staging'),2);
 assert.ok(modes.includes('readwrite'));
 db.close();
});
test('an unexpected new ledger entry after commit makes restart inspector require manual review',async()=>{
 const {db,file}=await prepared();
 await api.commitEntranceOnlyIsolated(db,file,options(),deps());
 await put(db,'main','video_recognition_ledger_v1',ledger(true));
 const report=await api.inspectEntranceCommit(db,'atomic-video',deps());
 assert.equal(report.status,'manual_review_required');
 assert.equal(report.cleanupAuthorized,false);
 assert.equal((await get(db,'archive_history','atomic-video')).status,'committed_rollback_blocked');
 assert.equal(await count(db,'full_backup'),1);
 db.close();
});
test('unexpected live journal write after commit blocks automatic healthy recovery',async()=>{
 const {db,file}=await prepared();
 await api.commitEntranceOnlyIsolated(db,file,options(),deps());
 const changed=state('imported');
 changed.records=[{id:'new-inspection',note:'new record'}];
 await put(db,'main','state',changed);
 const result=await api.inspectEntranceCommit(db,'atomic-video',deps());
 assert.equal(result.status,'manual_review_required');
 assert.equal(result.rollbackAuthorized,false);
 assert.equal(await count(db,'full_backup'),1);
 assert.deepEqual(await get(db,'main','state'),changed);
 db.close();
});


test('positive staged Blob SHA diagnosis permits no shortcuts around atomic commit checks',async()=>{
 const {db,file,digest}=await prepared();
 const before=await root.PasekaVideoArchiveV2PendingStage.verifyPendingStagingBlobs(db,'atomic-video',deps().sha);
 assert.equal(before.snapshotHashesMatched,true);
 assert.equal(before.byteIntegrityVerified,false);
 assert.equal(before.restoreAuthorized,false);
 assert.equal(before.cleanupAuthorized,false);
 const result=await api.commitEntranceOnlyIsolated(db,file,options(),deps());
 assert.equal(result.committed,true);
 assert.equal(result.cleanupAuthorized,false);
 assert.equal(await SHA((await get(db,'entrance_media','new-video')).blob),digest);
 db.close();
});

test('a staged Blob swapped after positive SHA diagnosis cannot reach live entrance media',async()=>{
 const {db,file}=await prepared();
 const checked=await root.PasekaVideoArchiveV2PendingStage.verifyPendingStagingBlobs(db,'atomic-video',deps().sha);
 assert.equal(checked.snapshotHashesMatched,true);
 assert.equal(checked.byteIntegrityVerified,false);
 const key='v2pending:atomic-video:entrance_media:new-video';
 const stored=await get(db,'archive_staging',key);
 await put(db,'archive_staging',key,{
  ...stored,blob:new Blob(['xyz'],{type:'video/mp4'})
 });
 await assert.rejects(api.commitEntranceOnlyIsolated(db,file,options(),deps()));
 assert.equal(await count(db,'entrance_media'),0);
 assert.equal(await count(db,'full_backup'),0);
 assert.deepEqual(await get(db,'main','state'),state());
 assert.deepEqual(await get(db,'main','video_recognition_ledger_v1'),ledger());
 db.close();
});

for (const [storeName, method, ordinal] of [
 ['full_backup', 'add', 1], ['archive_history', 'put', 1], ['main', 'put', 1],
 ['entrance_media', 'add', 1], ['entrance_media', 'add', 2]
]) {
 test('abort after successful final ' + storeName + ' write ' + ordinal + ', reopen and retry', async t => {
  const {db, factory, name, file, digest} = await prepared({hasRecognized:true, secondVideo:true});
  t.after(() => db.close());
  const backupId = options().backupId;
  const historyBefore = await get(db, 'archive_history', backupId);
  const session = await get(db, 'archive_staging', historyBefore.sessionId);
  const expected = new Map([['new-video', digest], ['second-video', await SHA(new Blob(['defg']))]]);
  let interrupted = false;
  const interruptible = {
   objectStoreNames: db.objectStoreNames,
   transaction(stores, mode) {
    const tx = db.transaction(stores, mode);
    if (mode === 'readwrite') {
     const store = tx.objectStore(storeName);
     const write = store[method].bind(store);
     let writes = 0;
     store[method] = (...args) => {
      const request = write(...args);
      if (++writes === ordinal) request.addEventListener('success', () => {
       interrupted = true;
       tx.abort();
      });
      return request;
     };
    }
    return tx;
   }
  };
  await assert.rejects(api.commitEntranceOnlyIsolated(interruptible, file, options(), deps()));
  assert.equal(interrupted, true);
  db.close();
  const request = factory.open(name);
  const reopened = await new Promise((resolve, reject) => {
   request.onsuccess = () => resolve(request.result);
   request.onerror = () => reject(request.error);
  });
  t.after(() => reopened.close());
  assert.deepEqual(await get(reopened, 'main', 'state'), state());
  assert.deepEqual(await get(reopened, 'main', 'video_recognition_ledger_v1'), ledger(true));
  assert.deepEqual(await get(reopened, 'archive_history', backupId), historyBefore);
  assert.equal(await count(reopened, 'full_backup'), 0);
  assert.equal(await count(reopened, 'entrance_media'), 0);
  assert.deepEqual(await get(reopened, 'archive_staging', session.id), session);
  assert.equal(await count(reopened, 'archive_staging'), 3);
  for (const [id, sha] of expected) {
   const child = await get(reopened, 'archive_staging', session.id + ':entrance_media:' + id);
   assert.equal(await SHA(child.blob), sha);
  }

  const result = await api.commitEntranceOnlyIsolated(reopened, file, options(), deps());
  assert.equal(result.committed, true);
  assert.equal(result.cleanupAuthorized, false);
  const snapshot = await get(reopened, 'full_backup', 'v2entrance:' + backupId);
  assert.deepEqual(snapshot.beforeState, state());
  assert.deepEqual(snapshot.afterState, state('imported'));
  assert.deepEqual(snapshot.beforeLedger, ledger(true));
  assert.deepEqual(new Map(snapshot.importedVideos.map(v => [v.id, v.blobSha256])), expected);
  await assert.rejects(api.commitEntranceOnlyIsolated(reopened, file, options(), deps()));
  assert.deepEqual(await get(reopened, 'full_backup', 'v2entrance:' + backupId), snapshot);
  assert.equal(await count(reopened, 'full_backup'), 1);
  assert.equal(await count(reopened, 'entrance_media'), 2);
  for (const [id, sha] of expected) {
   assert.equal(await SHA((await get(reopened, 'entrance_media', id)).blob), sha);
  }
  assert.deepEqual(await get(reopened, 'main', 'video_recognition_ledger_v1'), ledger(true));
  assert.deepEqual(await get(reopened, 'main', 'state'), state('imported'));
  assert.equal((await get(reopened, 'archive_history', backupId)).status, 'committed_rollback_blocked');
 });
}
