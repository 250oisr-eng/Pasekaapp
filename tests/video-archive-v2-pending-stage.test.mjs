import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const root={};
for(const file of [
 'paseka-sha256.js','video-archive-v2-guard.js','video-archive-v2-record-media.js',
 'video-archive-v2-metadata-codec.js','video-archive-v2-restore-gate.js',
 'video-archive-v2-pending-stage.js'
])new Function('window',await readFile(new URL('../js/'+file,import.meta.url),'utf8'))(root);
const deps=()=>({
 codec:root.PasekaVideoArchiveV2MetadataCodec,
 guard:root.PasekaVideoArchiveV2Guard,
 gate:root.PasekaVideoArchiveV2RestoreGate,
 sha:root.PasekaSha256,recordAdapter:root.PasekaVideoArchiveV2RecordMedia,
 crypto:webcrypto
});
const stage=root.PasekaVideoArchiveV2PendingStage.stagePendingRestore;
const inspect=root.PasekaVideoArchiveV2PendingStage.inspectPendingStaging;
const ledger=()=>({version:1,entries:[]});
const state=(revision='original')=>({meta:{schemaVersion:15,revisionId:revision},
 records:[],hives:[{id:'h1',number:1}]});
const cfg=()=>({backupId:'pending-snapshot',expectedRevision:'original',
 createdAt:'2026-11-20T00:00:00Z'});
const sha=blob=>root.PasekaSha256.hashBlobHex(blob);
const rejects=(p,code)=>assert.rejects(p,e=>e.code===code);
const done=tx=>new Promise((resolve,reject)=>{
 tx.oncomplete=resolve;
 tx.onerror=tx.onabort=()=>reject(tx.error||new Error('aborted'));
});
let sequence=0;
async function setup(factory=new IDBFactory()){
 const req=factory.open('v2-pending-stage-'+(++sequence),1);
 req.onupgradeneeded=()=>{
  const db=req.result;
  db.createObjectStore('main');
  db.createObjectStore('entrance_media',{keyPath:'id'});
  const staging=db.createObjectStore('archive_staging',{keyPath:'id'});
  staging.createIndex('backupId','backupId',{unique:true});
  staging.createIndex('sessionId','sessionId',{unique:false});
  staging.createIndex('kind','kind',{unique:false});
  db.createObjectStore('archive_history',{keyPath:'backupId'});
  db.createObjectStore('full_backup');
 };
 const db=await new Promise((resolve,reject)=>{
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
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
async function archive({videoId='new-entrance',record=false,archiveState=state('imported')}={}){
 const blob=new Blob([Uint8Array.of(97,98,99)],{type:'video/mp4'});
 const digest=await sha(blob);
 let pendingVideos=[{source:'entrance_media',videoId,sourceSha256:digest,
  sourceBytes:blob.size,mimeType:'video/mp4',blob}];
 if(record){
  archiveState={...archiveState,records:[{id:'note',media:[{
   kind:'video',videoId:'record-one',data:'data:video/mp4;base64,YWJj',
   sourceSha256:digest,sourceBytes:3
  }]}]};
  pendingVideos=[];
 }
 const file=await deps().codec.buildMetadataArchive({
  state:archiveState,ledger:ledger(),pendingVideos,
  backupId:cfg().backupId,createdAt:cfg().createdAt
 },webcrypto,deps().guard,deps().sha,deps().recordAdapter);
 return {file,blob,digest};
}
test('atomically stages PASEKA02 original while leaving live state and ledger untouched',async()=>{
 const db=await setup(),{file,digest}=await archive();
 const result=await stage(db,file,cfg(),deps());
 assert.equal(result.staged,true);
 assert.equal(result.pendingCount,1);
 assert.equal(result.archiveSafe,false);
 assert.equal(result.restoreAuthorized,false);
 assert.equal(result.cleanupAuthorized,false);
 assert.equal(result.requiresFullBlobReverification,true);
 assert.deepEqual(await get(db,'main','state'),state());
 assert.deepEqual(await get(db,'main','video_recognition_ledger_v1'),ledger());
 assert.equal(await count(db,'entrance_media'),0);
 assert.equal(await count(db,'full_backup'),0);
 assert.equal(await count(db,'archive_staging'),2);
 assert.equal(await count(db,'archive_history'),1);
 const header=await get(db,'archive_staging','v2pending:pending-snapshot');
 const child=await get(db,'archive_staging','v2pending:pending-snapshot:entrance_media:new-entrance');
 assert.equal(header.kind,'v2_pending_session');
 assert.equal(header.backupId,'pending-snapshot');
 assert.equal(header.expectedEntries,1);
 assert.equal(child.backupId,undefined,'unique backupId index is owned only by header');
 assert.equal(child.sourceSha256,digest);
 assert.equal(await sha(child.blob),digest);
 assert.equal((await get(db,'archive_history','pending-snapshot')).status,'staged');
 const report=await inspect(db,'pending-snapshot');
 assert.equal(report.status,'protected_unverified');
 assert.equal(report.byteIntegrityVerified,false);
 assert.equal(report.cleanupAuthorized,false);
 db.close();
});
test('verified journal video stores only one protected Blob with source-qualified identity',async()=>{
 const db=await setup(),{file,digest}=await archive({record:true});
 const result=await stage(db,file,cfg(),deps());
 assert.equal(result.pendingCount,1);
 const child=await get(db,'archive_staging',
  'v2pending:pending-snapshot:record_media:record-one');
 assert.equal(child.kind,'v2_pending_original');
 assert.equal(child.source,'record_media');
 assert.equal(await sha(child.blob),digest);
 assert.equal(child.backupId,undefined);
 assert.deepEqual(await get(db,'main','state'),state());
 db.close();
});
test('preexisting protected backup, staging or history blocks staging without deleting them',async()=>{
 for(const store of ['full_backup','archive_staging','archive_history']){
  const db=await setup(),{file}=await archive(),tx=db.transaction(store,'readwrite');
  const key=store==='archive_history'?'old-backup':'protected';
  if(store==='full_backup')tx.objectStore(store).put({blob:new Blob(['protected'])},key);
  else if(store==='archive_staging')tx.objectStore(store).put({id:key,blob:new Blob(['protected'])});
  else tx.objectStore(store).put({backupId:key,status:'protected'});
  await done(tx);
  await rejects(stage(db,file,cfg(),deps()),'V2_STAGE_EXISTING_PROTECTED_RECORDS');
  assert.equal(await count(db,store),1);
  assert.ok(await get(db,store,key));
  assert.equal(await get(db,'archive_staging','v2pending:pending-snapshot'),undefined);
  db.close();
 }
});
test('an existing pending entrance original with same ID survives and blocks stage',async()=>{
 const db=await setup(),{file}=await archive({videoId:'live-video'});
 const tx=db.transaction('entrance_media','readwrite');
 tx.objectStore('entrance_media').put({id:'live-video',blob:new Blob(['existing original'])});
 await done(tx);
 await rejects(stage(db,file,cfg(),deps()),'V2_RESTORE_LIVE_ENTRANCE_ID_COLLISION');
 assert.equal((await get(db,'entrance_media','live-video')).blob.size,17);
 assert.equal(await count(db,'archive_staging'),0);
 assert.equal(await count(db,'archive_history'),0);
 db.close();
});
test('a writer queued before stage may not sneak a colliding live video into storage',async()=>{
 const db=await setup(),{file}=await archive({videoId:'racing'});
 const writer=db.transaction('entrance_media','readwrite');
 writer.objectStore('entrance_media').put({id:'racing',blob:new Blob(['do not replace'])});
 const attempt=stage(db,file,cfg(),deps());
 await done(writer);
 await rejects(attempt,'V2_RESTORE_LIVE_ENTRANCE_ID_COLLISION');
 assert.ok(await get(db,'entrance_media','racing'));
 assert.equal(await count(db,'archive_staging'),0);
 db.close();
});
test('recognition recorded while hashing archive blocks staged copy and preserves ledger',async()=>{
 const db=await setup(),{file,digest}=await archive();
 const modified=deps();
 const original=modified.codec.inspectMetadataArchive;
 modified.codec={...modified.codec,inspectMetadataArchive:async(...args)=>{
  const incoming=await original(...args);
  const tx=db.transaction('main','readwrite');
  tx.objectStore('main').put({version:1,entries:[{
   source:'entrance_media',videoId:'new-entrance',resultId:'r1',
   sourceSha256:digest,sourceBytes:3,sourceEvidenceVersion:1,
   recognizedAt:'2026-11-20T00:00:00Z',cleanupState:'deleted',
   result:{observation:'recognized'}
  }]},'video_recognition_ledger_v1');
  await done(tx);
  return incoming;
 }};
 await assert.rejects(stage(db,file,cfg(),modified));
 assert.equal(await count(db,'archive_staging'),0);
 assert.equal((await get(db,'main','video_recognition_ledger_v1')).entries.length,1);
 db.close();
});
test('duplicate stage is rejected without overwriting prior protected copies',async()=>{
 const db=await setup(),{file,digest}=await archive();
 await stage(db,file,cfg(),deps());
 await rejects(stage(db,file,cfg(),deps()),'V2_STAGE_EXISTING_PROTECTED_RECORDS');
 assert.equal(await count(db,'archive_staging'),2);
 const child=await get(db,'archive_staging','v2pending:pending-snapshot:entrance_media:new-entrance');
 assert.equal(await sha(child.blob),digest);
 db.close();
});
test('read-only recovery inspector treats orphan protected copies as manual review, never delete',async()=>{
 const db=await setup();
 const initial=await inspect(db,'pending-snapshot');
 assert.equal(initial.status,'not_staged');
 const {file}=await archive();await stage(db,file,cfg(),deps());
 const tx=db.transaction('archive_staging','readwrite');
 tx.objectStore('archive_staging').delete('v2pending:pending-snapshot');
 await done(tx);
 const report=await inspect(db,'pending-snapshot');
 assert.equal(report.status,'manual_review_required');
 assert.equal(report.cleanupAuthorized,false);
 assert.equal(await count(db,'archive_staging'),1);
 assert.equal(await count(db,'archive_history'),1);
 db.close();
});
test('recovery inspector uses a single read-only transaction',async()=>{
 const db=await setup(),calls=[];
 const tracked={
  objectStoreNames:db.objectStoreNames,
  transaction(stores,mode){
   calls.push({stores,mode});
   if(mode!=='readonly')throw new Error('recovery attempted a write');
   return db.transaction(stores,mode);
  }
 };
 const report=await inspect(tracked,'pending-snapshot');
 assert.equal(report.status,'not_staged');
 assert.equal(calls.length,1);
 assert.deepEqual(calls[0].stores,['main','entrance_media','archive_staging','archive_history','full_backup']);
 db.close();
});
test('corrupted archive fails before any write transaction or staging copy',async()=>{
 const db=await setup();
 await assert.rejects(stage(db,new Blob(['not a PASEKA02 archive']),cfg(),deps()));
 assert.equal(await count(db,'archive_staging'),0);
 assert.equal(await count(db,'archive_history'),0);
 db.close();
});

for (const abortAfter of ['v2_pending_session', 'v2_pending_original', 'v2_pending_stage_only']) {
 test('reopen and retry after an IndexedDB abort at ' + abortAfter, async t => {
  const factory = new IDBFactory();
  let db = await setup(factory);
  t.after(() => db.close());
  const name = db.name;
  const {file, digest} = await archive();
  const original = new Blob(['other original']);
  const seed = db.transaction('entrance_media', 'readwrite');
  seed.objectStore('entrance_media').add({id: 'unrelated', blob: original});
  await done(seed);
  let interrupted = false;
  const interruptible = {
   objectStoreNames: db.objectStoreNames,
   transaction(stores, mode) {
    const tx = db.transaction(stores, mode);
    if (mode === 'readwrite') {
     for (const name of ['archive_staging', 'archive_history']) {
      const store = tx.objectStore(name);
      const add = store.add.bind(store);
      store.add = row => {
       const request = add(row);
       if (row.kind === abortAfter) request.addEventListener('success', () => {
        interrupted = true;
        tx.abort();
       });
       return request;
      };
     }
    }
    return tx;
   }
  };
  await assert.rejects(stage(interruptible, file, cfg(), deps()));
  assert.equal(interrupted, true);
  db.close();
  const open = factory.open(name);
  db = await new Promise((resolve, reject) => {
   open.onsuccess = () => resolve(open.result);
   open.onerror = () => reject(open.error);
  });
  assert.equal((await inspect(db, cfg().backupId)).status, 'not_staged');
  assert.equal(await count(db, 'archive_history'), 0);
  assert.equal(await count(db, 'archive_staging'), 0);
  assert.equal((await stage(db, file, cfg(), deps())).staged, true);
  await rejects(stage(db, file, cfg(), deps()), 'V2_STAGE_EXISTING_PROTECTED_RECORDS');
  assert.equal((await inspect(db, cfg().backupId)).status, 'protected_unverified');
  const child = await get(db, 'archive_staging', 'v2pending:pending-snapshot:entrance_media:new-entrance');
  assert.equal(await sha(child.blob), digest);
  assert.equal(await count(db, 'archive_staging'), 2);
  assert.equal(await count(db, 'archive_history'), 1);
  assert.deepEqual(await get(db, 'main', 'state'), state());
  assert.deepEqual(await get(db, 'main', 'video_recognition_ledger_v1'), ledger());
  assert.equal(await count(db, 'full_backup'), 0);
  assert.equal(await count(db, 'entrance_media'), 1);
  assert.equal(await sha((await get(db, 'entrance_media', 'unrelated')).blob), await sha(original));
 });
}

test('recovery rejects a header naming itself as the only staged video', async t => {
 const db = await setup();
 t.after(() => db.close());
 const {file} = await archive();
 const {sessionId} = await stage(db, file, cfg(), deps());
 const header = await get(db, 'archive_staging', sessionId);
 header.entryIds = [sessionId];
 const tx = db.transaction('archive_staging', 'readwrite');
 tx.objectStore('archive_staging').put(header);
 await done(tx);
 const report = await inspect(db, cfg().backupId);
 assert.equal(report.status, 'manual_review_required');
 assert.equal(report.cleanupAuthorized, false);
 assert.equal(await count(db, 'archive_staging'), 2);
});

test('a staged child associated with another session requires manual review', async t => {
 const db = await setup();
 t.after(() => db.close());
 const {file, digest} = await archive();
 const {sessionId} = await stage(db, file, cfg(), deps());
 const header = await get(db, 'archive_staging', sessionId);
 const child = await get(db, 'archive_staging', header.entryIds[0]);
 const tx = db.transaction('archive_staging', 'readwrite');
 tx.objectStore('archive_staging').put({...child, sessionId: 'another-session'});
 await done(tx);
 assert.equal((await inspect(db, cfg().backupId)).status, 'manual_review_required');
 assert.equal(await sha((await get(db, 'archive_staging', child.id)).blob), digest);
});


for (const [field, corrupt] of [
 ['source', row=>({...row,source:'record_media'})],
 ['videoId', row=>({...row,videoId:'different-video'})],
 ['sourceSha256', row=>({...row,sourceSha256:'not-a-hash'})],
 ['sourceBytes', row=>({...row,sourceBytes:row.sourceBytes+1})],
 ['mimeType', row=>({...row,mimeType:'text/plain'})],
 ['kind', row=>({...row,kind:'not-a-video'})]
]) {
 test('read-only recovery requires manual review for corrupted child '+field,async t=>{
  const db=await setup();
  t.after(()=>db.close());
  const {file,digest}=await archive();
  const {sessionId}=await stage(db,file,cfg(),deps());
  const header=await get(db,'archive_staging',sessionId);
  const entry=await get(db,'archive_staging',header.entryIds[0]);
  const writer=db.transaction('archive_staging','readwrite');
  writer.objectStore('archive_staging').put(corrupt(entry));
  await done(writer);
  const report=await inspect(db,cfg().backupId);
  assert.equal(report.status,'manual_review_required');
  assert.equal(report.byteIntegrityVerified,false);
  assert.equal(report.cleanupAuthorized,false);
  assert.equal(await count(db,'archive_staging'),2);
  assert.equal(await sha((await get(db,'archive_staging',entry.id)).blob),digest);
  assert.deepEqual(await get(db,'main','state'),state());
 });
}
