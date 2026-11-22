import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const root={};
for(const file of ['paseka-sha256.js','video-archive-v2-guard.js',
 'video-archive-v2-metadata-codec.js','video-archive-v2-restore-gate.js',
 'video-archive-v2-metadata-atomic.js'])
 new Function('window',await readFile(new URL('../js/'+file,import.meta.url),'utf8'))(root);
const deps={codec:root.PasekaVideoArchiveV2MetadataCodec,guard:root.PasekaVideoArchiveV2Guard,
 gate:root.PasekaVideoArchiveV2RestoreGate,sha:root.PasekaSha256,crypto:webcrypto};
const api=root.PasekaVideoArchiveV2MetadataAtomic;
const ledger=()=>({version:1,entries:[]});
const recognized=()=>({source:'entrance_media',videoId:'processed',resultId:'result',
 sourceSha256:'a'.repeat(64),sourceBytes:3,sourceEvidenceVersion:1,
 recognizedAt:'2026-11-20T00:00:00Z',stateRevisionId:'synthetic-state',sourceHashVerifiedAt:'2026-11-20T00:00:00Z',cleanupState:'deleted',result:{observation:'seen'}});
const state=(revision='initial')=>({meta:{schemaVersion:15,revisionId:revision},
 records:[],hives:[{id:'h1',number:1}],families:[]});
const validator=v=>Array.isArray(v.hives)&&Array.isArray(v.records);
const options=(more={})=>({expectedRevision:'initial',newRevisionId:'imported',
 rollbackRevisionId:'restored',backupId:'test-backup',validateState:validator,...more});
const archive=(source=state('archive'),log=ledger(),pendingVideos=[])=>
 root.PasekaVideoArchiveV2MetadataCodec.buildMetadataArchive({
 state:source,ledger:log,pendingVideos,backupId:'test-backup',
 createdAt:'2026-11-20T00:00:00Z'
 },webcrypto,deps.guard,deps.sha);
const fail=(p,code)=>assert.rejects(p,e=>e.code===code);
const done=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||new Error('aborted'));});
let unique=0;
async function setup(customLedger=ledger()){
 const request=new IDBFactory().open('paseka-v2-atomic-'+(++unique),1);
 request.onupgradeneeded=()=>{
  const d=request.result;
  d.createObjectStore('main');d.createObjectStore('entrance_media',{keyPath:'id'});
  d.createObjectStore('archive_staging',{keyPath:'id'});
  d.createObjectStore('archive_history',{keyPath:'backupId'});
  d.createObjectStore('full_backup');
 };
 const db=await new Promise((res,rej)=>{request.onsuccess=()=>res(request.result);request.onerror=()=>rej(request.error);});
 const tx=db.transaction('main','readwrite');
 tx.objectStore('main').put(state(),'state');
 tx.objectStore('main').put(customLedger,'video_recognition_ledger_v1');
 await done(tx);return db;
}
async function read(db,store,key){
 return new Promise((resolve,reject)=>{
  const req=db.transaction(store,'readonly').objectStore(store).get(key);
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
}
const commit=(db,blob,config=options())=>api.commitMetadataOnly(db,blob,config,deps);
const rollback=(db,config=options({expectedRevision:'imported'}))=>api.rollbackMetadataOnly(db,config,deps);

test('real PASEKA02 metadata imports and reverts atomically; audit and ledger survive rollback',async()=>{
 const db=await setup(),file=await archive();
 const result=await commit(db,file);
 assert.equal(result.committed,true);
 assert.equal(result.archiveSafe,false);
 assert.equal(result.cleanupAuthorized,false);
 assert.equal(result.rollbackRecorded,true);
 const applied=await read(db,'main','state');
 assert.equal(applied.meta.revisionId,'imported');
 assert.equal((await read(db,'archive_history','test-backup')).status,'committed');
 assert.equal((await read(db,'full_backup','v2:test-backup')).beforeState.meta.revisionId,'initial');
 assert.deepEqual(await read(db,'main','video_recognition_ledger_v1'),ledger());
 const back=await rollback(db);
 assert.equal(back.reverted,true);
 assert.equal(back.originalSnapshotPreserved,true);
 assert.equal((await read(db,'main','state')).meta.revisionId,'restored');
 assert.equal((await read(db,'archive_history','test-backup')).status,'reverted');
 assert.ok(await read(db,'full_backup','v2:test-backup'));
 await fail(rollback(db),'V2_ATOMIC_ROLLBACK_HISTORY_CHANGED');
 db.close();
});
test('recognition ledger is preserved unchanged through commit and rollback',async()=>{
 const old= {version:1,entries:[recognized()]};
 const db=await setup(old);
 const result=await commit(db,await archive(state('archive'),old));
 assert.equal(result.committed,true);
 assert.deepEqual(await read(db,'main','video_recognition_ledger_v1'),old);
 await rollback(db);
 assert.deepEqual(await read(db,'main','video_recognition_ledger_v1'),old);
 db.close();
});
test('reject archives which add, remove or alter recognition history',async()=>{
 const old={version:1,entries:[recognized()]};
 for(const next of [ledger(),{version:1,entries:[{...recognized(),cleanupState:'delete_required'}]}]){
  const db=await setup(old);
  await assert.rejects(commit(db,await archive(state('archive'),next)));
  assert.deepEqual(await read(db,'main','state'),state());
  assert.equal(await read(db,'archive_history','test-backup'),undefined);
  db.close();
 }
});
test('serialized writer before commit changes revision; no partial backup or import',async()=>{
 const db=await setup(),file=await archive();
 const tx=db.transaction('main','readwrite');
 tx.objectStore('main').put(state('new-data'),'state');
 const attempt=commit(db,file);
 await done(tx);
 await fail(attempt,'V2_ATOMIC_REVISION_CHANGED');
 assert.equal((await read(db,'main','state')).meta.revisionId,'new-data');
 assert.equal(await read(db,'full_backup','v2:test-backup'),undefined);
 assert.equal(await read(db,'archive_history','test-backup'),undefined);
 db.close();
});
test('after import new journal write blocks rollback and keeps all protected records',async()=>{
 const db=await setup(),file=await archive();
 await commit(db,file);
 const tx=db.transaction('main','readwrite');
 const changed=state('new-observation');
 changed.records=[{id:'visit',title:'fresh inspection'}];
 tx.objectStore('main').put(changed,'state');
 await done(tx);
 await fail(rollback(db),'V2_ATOMIC_ROLLBACK_REVISION_CHANGED');
 assert.deepEqual(await read(db,'main','state'),changed);
 assert.equal((await read(db,'archive_history','test-backup')).status,'committed');
 assert.ok(await read(db,'full_backup','v2:test-backup'));db.close();
});
test('ledger update after import blocks rollback even if revision unchanged',async()=>{
 const db=await setup(),file=await archive();
 await commit(db,file);
 const tx=db.transaction('main','readwrite');
 tx.objectStore('main').put({version:1,entries:[recognized()]},'video_recognition_ledger_v1');
 await done(tx);
 await fail(rollback(db),'V2_ATOMIC_ROLLBACK_LEDGER_CHANGED');
 assert.equal((await read(db,'archive_history','test-backup')).status,'committed');
 assert.equal((await read(db,'main','state')).meta.revisionId,'imported');db.close();
});
test('silent state mutation without revision bump also blocks rollback',async()=>{
 const db=await setup(),file=await archive();
 await commit(db,file);
 const tx=db.transaction('main','readwrite');
 const changed=state('imported');changed.hives=[{id:'h-new',number:99}];
 tx.objectStore('main').put(changed,'state');
 await done(tx);
 await fail(rollback(db),'V2_ATOMIC_ROLLBACK_REVISION_CHANGED');
 assert.deepEqual(await read(db,'main','state'),changed);db.close();
});
test('any live media Blob or archived snapshot blocks metadata-only commit without destruction',async()=>{
 for(const store of ['entrance_media','archive_staging','archive_history','full_backup']){
  const db=await setup(),file=await archive();
  const tx=db.transaction(store,'readwrite'),obj=tx.objectStore(store);
  if(store==='entrance_media')obj.put({id:'pending',blob:new Blob(['important'])});
  else if(store==='archive_staging')obj.put({id:'session',blob:new Blob(['important'])});
  else if(store==='archive_history')obj.put({backupId:'older',status:'committed'});
  else obj.put({blob:new Blob(['important'])},'previous');
  await done(tx);
  await fail(commit(db,file),'V2_ATOMIC_PROTECTED_DATA_PRESENT');
  assert.deepEqual(await read(db,'main','state'),state());
  assert.equal(await read(db,'archive_history','test-backup'),undefined);
  assert.ok(await read(db,store,{entrance_media:'pending',archive_staging:'session',archive_history:'older',full_backup:'previous'}[store]));
  db.close();
 }
});
test('archive carrying a verified pending entrance Blob cannot enter metadata-only path',async()=>{
 const db=await setup(),blob=new Blob([Uint8Array.of(1,2,3)],{type:'video/mp4'});
 const sha=await root.PasekaSha256.hashBlobHex(blob);
 const file=await archive(state('archive'),ledger(),[
  {source:'entrance_media',videoId:'pending',sourceSha256:sha,sourceBytes:3,mimeType:'video/mp4',blob}
 ]);
 await fail(commit(db,file),'V2_ATOMIC_VIDEO_PAYLOAD_FORBIDDEN');
 assert.equal(await read(db,'archive_history','test-backup'),undefined);db.close();
});
test('invalid archive schema, old live schema and hidden video URL all reject without writes',async()=>{
 const db=await setup();
 await fail(commit(db,await archive(state('archive').meta?{...state('archive'),meta:{schemaVersion:16,revisionId:'archive'}}:state('archive'))),'V2_ATOMIC_SCHEMA_UNSUPPORTED');
 const tx=db.transaction('main','readwrite');
 tx.objectStore('main').put({...state(),meta:{schemaVersion:14,revisionId:'initial'}},'state');
 await done(tx);
 await fail(commit(db,await archive()),'V2_ATOMIC_SCHEMA_UNSUPPORTED');
 db.close();
 const bad=await setup();const t=bad.transaction('main','readwrite');
 const s=state();s.records=[{id:'old',media:[{kind:'video',data:'data:video/mp4;base64,AQID'}]}];
 t.objectStore('main').put(s,'state');await done(t);
 await fail(commit(bad,await archive()),'V2_ATOMIC_UNVERIFIED_ORIGINAL');bad.close();
});
test('missing protected store, duplicate backup and invalid validator fail closed',async()=>{
 const db=await setup(),file=await archive();
 await fail(commit({objectStoreNames:{contains:name=>name!=='full_backup'}},file),'V2_ATOMIC_STORES_MISSING');
 await fail(commit(db,file,options({validateState:()=>Promise.resolve(true)})),'V2_ATOMIC_STATE_INVALID');
 assert.equal((await read(db,'main','state')).meta.revisionId,'initial');
 await commit(db,file);
 await fail(commit(db,file,options({expectedRevision:'imported',newRevisionId:'imported-again'})),'V2_ATOMIC_PROTECTED_DATA_PRESENT');
 db.close();
});
test('post-import new pending media or other backup blocks rollback, preserving snapshot',async()=>{
 const db=await setup();await commit(db,await archive());
 const tx=db.transaction('entrance_media','readwrite');
 tx.objectStore('entrance_media').put({id:'newPending',blob:new Blob(['pending'])});
 await done(tx);
 await fail(rollback(db),'V2_ATOMIC_ROLLBACK_PROTECTED_CHANGED');
 assert.equal((await read(db,'main','state')).meta.revisionId,'imported');
 assert.ok(await read(db,'full_backup','v2:test-backup'));
 db.close();
});

test('restart inspector classifies clean, committed and reverted metadata-only restore',async()=>{
 const db=await setup(),file=await archive();
 const probe=()=>api.inspectMetadataRecovery(db,'test-backup',deps);
 const initial=await probe();
 assert.equal(initial.status,'not_imported');
 assert.equal(initial.restoreAuthorized,false);
 await commit(db,file);
 const applied=await probe();
 assert.equal(applied.status,'committed');
 assert.equal(applied.cleanupAuthorized,false);
 await rollback(db);
 const reverted=await probe();
 assert.equal(reverted.status,'reverted');
 assert.equal(reverted.liveDataModified,false);
 db.close();
});
test('restart inspector demands manual review if history, snapshot or live state changed',async()=>{
 const db=await setup(),file=await archive();
 await commit(db,file);
 const write=db.transaction('main','readwrite');
 const mutated=state('imported');mutated.hives=[{id:'untracked',number:3}];
 write.objectStore('main').put(mutated,'state');
 await done(write);
 const found=await api.inspectMetadataRecovery(db,'test-backup',deps);
 assert.equal(found.status,'manual_review_required');
 assert.equal(found.requiresManualReview,true);
 assert.deepEqual(await read(db,'main','state'),mutated);
 assert.equal((await read(db,'archive_history','test-backup')).status,'committed');
 db.close();
});
test('restart inspector refuses to auto-fix archive history with missing backup',async()=>{
 const db=await setup(),file=await archive();
 await commit(db,file);
 const tx=db.transaction('full_backup','readwrite');
 tx.objectStore('full_backup').delete('v2:test-backup');
 await done(tx);
 const found=await api.inspectMetadataRecovery(db,'test-backup',deps);
 assert.equal(found.status,'manual_review_required');
 assert.equal(found.cleanupAuthorized,false);
 assert.equal((await read(db,'main','state')).meta.revisionId,'imported');
 db.close();
});
test('rollback never deletes archive history or backup even if extra protected copy appears',async()=>{
 const db=await setup();await commit(db,await archive());
 const tx=db.transaction('full_backup','readwrite');
 tx.objectStore('full_backup').put({blob:new Blob(['another protected copy'])},'older');
 await done(tx);
 await fail(rollback(db),'V2_ATOMIC_ROLLBACK_PROTECTED_CHANGED');
 assert.equal((await read(db,'archive_history','test-backup')).status,'committed');
 assert.ok(await read(db,'full_backup','v2:test-backup'));
 assert.ok(await read(db,'full_backup','older'));
 db.close();
});

test('state validator must not mutate incoming state or a rollback snapshot',async()=>{
 const db=await setup(),file=await archive();
 const dirty=options({validateState:v=>{v.hives.push({id:'mutated'});return true;}});
 await fail(commit(db,file,dirty),'V2_ATOMIC_STATE_INVALID');
 assert.deepEqual(await read(db,'main','state'),state());
 assert.equal(await read(db,'full_backup','v2:test-backup'),undefined);
 db.close();
});
test('hidden video source URI in journal note is rejected even when not at start',async()=>{
 const db=await setup(),file=await archive();
 const tx=db.transaction('main','readwrite');
 const current=state();
 current.records=[{id:'r',notes:'unknown binary data:video/mp4;base64,AA=='}];
 tx.objectStore('main').put(current,'state');await done(tx);
 await fail(commit(db,file),'V2_ATOMIC_UNVERIFIED_ORIGINAL');
 assert.equal((await read(db,'main','state')).records.length,1);
 assert.equal(await read(db,'full_backup','v2:test-backup'),undefined);
 db.close();
});

test('recovery inspector takes a readonly transaction and cannot acquire a write lock',async()=>{
 const db=await setup();
 const observed=[];
 const proxy={
  objectStoreNames:db.objectStoreNames,
  transaction(names,mode){
   observed.push({names:[...names],mode});
   if(mode!=='readonly')throw new Error('recovery must never request write access');
   return db.transaction(names,mode);
  }
 };
 const initial=await api.inspectMetadataRecovery(proxy,'test-backup',deps);
 assert.equal(initial.status,'not_imported');
 assert.equal(observed.length,1);
 assert.equal(observed[0].mode,'readonly');
 assert.deepEqual(observed[0].names,
  ['main','entrance_media','archive_staging','archive_history','full_backup']);
 assert.deepEqual(await read(db,'main','state'),state());
 assert.equal(await read(db,'archive_history','test-backup'),undefined);
 db.close();
});

test('restart inspector fails closed on altered imported revision, previous revision or backup identity',async()=>{
 for(const field of ['importedRevisionId','previousRevisionId','backupId','archiveSha256']){
  const db=await setup();
  await commit(db,await archive());
  const tx=db.transaction('archive_history','readwrite');
  const history=await new Promise((resolve,reject)=>{
   const req=tx.objectStore('archive_history').get('test-backup');
   req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  history[field]=field==='archiveSha256'?'not-a-digest':'tampered';
  if(field==='backupId')tx.objectStore('archive_history').delete('test-backup');
  tx.objectStore('archive_history').put(history);
  await done(tx);
  const finding=await api.inspectMetadataRecovery(db,'test-backup',deps);
  assert.equal(finding.status,'manual_review_required',field);
  assert.equal(finding.cleanupAuthorized,false,field);
  assert.equal((await read(db,'main','state')).meta.revisionId,'imported');
  db.close();
 }
});
test('restart inspector rejects altered snapshot revision without changing or removing recovery data',async()=>{
 const db=await setup();
 await commit(db,await archive());
 const tx=db.transaction('full_backup','readwrite');
 const store=tx.objectStore('full_backup');
 const record=await new Promise((resolve,reject)=>{
  const req=store.get('v2:test-backup');
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
 record.afterState.meta.revisionId='other-import';
 store.put(record,'v2:test-backup');
 await done(tx);
 const finding=await api.inspectMetadataRecovery(db,'test-backup',deps);
 assert.equal(finding.status,'manual_review_required');
 assert.equal(finding.restoreAuthorized,false);
 assert.ok(await read(db,'full_backup','v2:test-backup'));
 assert.equal((await read(db,'archive_history','test-backup')).status,'committed');
 db.close();
});

test('rollback rejects corrupted previous revision and archive hash without touching live state',async()=>{
 for(const [field,bad] of [
  ['previousRevisionId','unrelated-previous'],
  ['importedRevisionId','unrelated-import'],
  ['archiveSha256','not-a-valid-sha']
 ]){
  const db=await setup();
  await commit(db,await archive());
  const tx=db.transaction('archive_history','readwrite');
  const store=tx.objectStore('archive_history');
  const h=await new Promise((resolve,reject)=>{
   const request=store.get('test-backup');
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error);
  });
  h[field]=bad;
  store.put(h);
  await done(tx);
  await fail(rollback(db),'V2_ATOMIC_ROLLBACK_HISTORY_CHANGED');
  assert.equal((await read(db,'main','state')).meta.revisionId,'imported',field);
  assert.ok(await read(db,'full_backup','v2:test-backup'),field);
  db.close();
 }
});
test('recovery without history is not trusted when local schema or revision is damaged',async()=>{
 for(const damaged of [
  {...state(),meta:{schemaVersion:14,revisionId:'initial'}},
  {...state(),meta:{schemaVersion:15,revisionId:''}}
 ]){
  const db=await setup();
  const tx=db.transaction('main','readwrite');
  tx.objectStore('main').put(damaged,'state');
  await done(tx);
  const result=await api.inspectMetadataRecovery(db,'test-backup',deps);
  assert.equal(result.status,'manual_review_required');
  assert.equal(result.restoreAuthorized,false);
  assert.equal(result.cleanupAuthorized,false);
  assert.deepEqual(await read(db,'main','state'),damaged);
  db.close();
 }
});

test('recovery inspector rejects embedded video originals and missing records without touching data',async()=>{
 for(const modified of [
  {...state(),records:[{id:'unprocessed',notes:'data:video/mp4;base64,AQID'}]},
  {...state(),records:[{id:'unprocessed',media:[{kind:'video',data:'data:application/octet-stream;base64,AQID'}]}]},
  {...state(),records:null}
 ]){
  const db=await setup();
  const tx=db.transaction('main','readwrite');
  tx.objectStore('main').put(modified,'state');
  await done(tx);
  const finding=await api.inspectMetadataRecovery(db,'test-backup',deps);
  assert.equal(finding.status,'manual_review_required');
  assert.equal(finding.cleanupAuthorized,false);
  assert.deepEqual(await read(db,'main','state'),modified);
  assert.equal(await read(db,'full_backup','v2:test-backup'),undefined);
  db.close();
 }
});

test('recovery refuses a corrupted inactive snapshot, including hidden original media',async()=>{
 for(const variant of ['hidden-before','hidden-after','missing-before-records']){
  const db=await setup();
  await commit(db,await archive());
  await rollback(db);
  const tx=db.transaction('full_backup','readwrite');
  const store=tx.objectStore('full_backup');
  const snapshot=await new Promise((resolve,reject)=>{
   const req=store.get('v2:test-backup');
   req.onsuccess=()=>resolve(req.result);
   req.onerror=()=>reject(req.error);
  });
  if(variant==='hidden-before')
   snapshot.beforeState.records=[{id:'video',notes:'blob:local-original'}];
  if(variant==='hidden-after')
   snapshot.afterState.records=[{id:'video',data:'data:video/mp4;base64,AQID'}];
  if(variant==='missing-before-records')snapshot.beforeState.records=undefined;
  store.put(snapshot,'v2:test-backup');
  await done(tx);
  const result=await api.inspectMetadataRecovery(db,'test-backup',deps);
  assert.equal(result.status,'manual_review_required',variant);
  assert.equal(result.cleanupAuthorized,false);
  assert.equal((await read(db,'archive_history','test-backup')).status,'reverted');
  assert.ok(await read(db,'full_backup','v2:test-backup'));
  db.close();
 }
});
test('recovery refuses a reused or malformed rollback revision without mutating history',async()=>{
 for(const revision of ['initial','imported','invalid revision']){
  const db=await setup();
  await commit(db,await archive());
  await rollback(db);
  const tx=db.transaction(['main','archive_history'],'readwrite');
  const request=tx.objectStore('archive_history').get('test-backup');
  const h=await new Promise((resolve,reject)=>{
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error);
  });
  h.revertedRevisionId=revision;
  tx.objectStore('archive_history').put(h);
  const current=state(revision);
  tx.objectStore('main').put(current,'state');
  await done(tx);
  const result=await api.inspectMetadataRecovery(db,'test-backup',deps);
  assert.equal(result.status,'manual_review_required',revision);
  assert.deepEqual(await read(db,'main','state'),current);
  assert.ok(await read(db,'full_backup','v2:test-backup'));
  db.close();
 }
});
