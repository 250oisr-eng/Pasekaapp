import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// End-to-end *synthetic* PASEKA02 evidence across two independent IndexedDB
// instances. All modules are the real isolated V2 implementations; no product
// database, Android media, external requests, or cleanup code is ever invoked.
const root = {};
for (const filename of [
  'paseka-sha256.js',
  'video-archive-v2-guard.js',
  'video-archive-v2-snapshot.js',
  'video-archive-v2-record-media.js',
  'video-archive-v2-metadata-codec.js',
  'video-archive-v2-export-candidate.js',
  'video-archive-v2-restore-gate.js',
  'video-archive-v2-restore-db-preflight.js',
  'video-archive-v2-pending-stage.js',
  'video-archive-v2-staging-verify.js',
  'video-archive-v2-entrance-atomic.js',
  'video-archive-v2-entrance-quarantine-rollback.js'
]) {
  new Function('window', await readFile(new URL('../js/' + filename, import.meta.url), 'utf8'))(root);
}
const v2 = {
  sha: root.PasekaSha256,
  guard: root.PasekaVideoArchiveV2Guard,
  snapshot: root.PasekaVideoArchiveV2Snapshot,
  codec: root.PasekaVideoArchiveV2MetadataCodec,
  exportCandidate: root.PasekaVideoArchiveV2ExportCandidate,
  gate: root.PasekaVideoArchiveV2RestoreGate,
  preflight: root.PasekaVideoArchiveV2RestoreDatabasePreflight,
  stage: root.PasekaVideoArchiveV2PendingStage,
  verify: root.PasekaVideoArchiveV2StagingVerify,
  commit: root.PasekaVideoArchiveV2EntranceAtomic,
  rollback: root.PasekaVideoArchiveV2QuarantineRollback,
  recordAdapter: root.PasekaVideoArchiveV2RecordMedia,
  crypto: webcrypto
};
const deps = () => ({
  sha:v2.sha,guard:v2.guard,snapshot:v2.snapshot,codec:v2.codec,
  gate:v2.gate,verify:v2.verify,recordAdapter:v2.recordAdapter,crypto:webcrypto
});
const backupId = 'independent-full-cycle';
const createdAt = '2026-11-23T00:00:00Z';
const options = () => ({backupId,expectedRevision:'base',createdAt});
const commitOptions = () => ({backupId,expectedRevision:'base',
  newRevisionId:'imported',validateState:validState});
const rollbackOptions = () => ({backupId,expectedRevision:'imported',
  rollbackRevisionId:'restored',validateState:validState});
const validState = x => Array.isArray(x.records) && Array.isArray(x.hives);
const state = revision => ({meta:{schemaVersion:15,revisionId:revision},
  records:[],hives:[{id:'hive-synthetic'}],families:[]});
const prior = () => ({version:1,entries:[{
  source:'entrance_media',videoId:'older-processed',
  resultId:'prior-synthetic-result',recognizedAt:'2026-11-20T00:00:00Z',
  stateRevisionId:'older-synthetic-state',
  sourceHashVerifiedAt:'2026-11-20T00:00:00Z',
  sourceSha256:'a'.repeat(64),sourceBytes:3,sourceEvidenceVersion:1,
  cleanupState:'deleted',result:{observation:'synthetic precedent'}
}]});
const original = new Blob([new Uint8Array([19,91,42,0,255,8,17,44,73])],
  {type:'video/mp4'});
const videoId = 'fresh-original';

function open(factory,name) {
  return new Promise((resolve,reject) => {
    const request = factory.open(name,1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('main');
      db.createObjectStore('entrance_media',{keyPath:'id'});
      const staged = db.createObjectStore('archive_staging',{keyPath:'id'});
      staged.createIndex('backupId','backupId',{unique:true});
      staged.createIndex('sessionId','sessionId',{unique:false});
      staged.createIndex('kind','kind',{unique:false});
      db.createObjectStore('archive_history',{keyPath:'backupId'});
      db.createObjectStore('full_backup');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
const completed = tx => new Promise((resolve,reject) => {
  tx.oncomplete = resolve;
  tx.onerror = tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
});
async function seed(db,revision,hasVideo=false) {
  const digest = await v2.sha.hashBlobHex(original);
  const stores = hasVideo ? ['main','entrance_media'] : ['main'];
  const tx = db.transaction(stores,'readwrite');
  tx.objectStore('main').put(state(revision),'state');
  tx.objectStore('main').put(prior(),'video_recognition_ledger_v1');
  if (hasVideo) tx.objectStore('entrance_media').add({
    id:videoId,bytes:original.size,blobSha256:digest,
    mimeType:'video/mp4',blob:original
  });
  await completed(tx);
  return digest;
}
const get = (db,store,key) => new Promise((resolve,reject) => {
  const request = db.transaction(store,'readonly').objectStore(store).get(key);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const count = (db,store) => new Promise((resolve,reject) => {
  const request = db.transaction(store,'readonly').objectStore(store).count();
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function replaceStageBlob(db,blob) {
  const key = 'v2pending:' + backupId + ':entrance_media:' + videoId;
  const existing = await get(db,'archive_staging',key);
  assert.ok(existing,'protected stage must exist before corruption test');
  const tx = db.transaction('archive_staging','readwrite');
  tx.objectStore('archive_staging').put({...existing,blob});
  await completed(tx);
}
function denied(promise) {return assert.rejects(promise);}

test('P0: real V2 source export → independent preflight → staged SHA → atomic commit → restart → quarantine rollback',async t => {
  const factory = new IDBFactory();
  let source = await open(factory,'isolated-export-origin');
  let target = await open(factory,'isolated-restore-target');
  t.after(() => {try{source.close();}catch{} try{target.close();}catch{}});
  const digest = await seed(source,'archived',true);
  await seed(target,'base');
  const out = await v2.exportCandidate.buildV2ArchiveCandidateFromDatabase(
    source,{backupId,createdAt},deps());
  assert.equal(out.postHashRecheckPassed,true);
  assert.equal(out.requiresWriterFence,true);
  assert.equal(out.archiveSafe,false);
  assert.equal(out.restoreAuthorized,false);
  const incoming = await v2.codec.inspectMetadataArchive(
    out.file,webcrypto,v2.guard,v2.sha,v2.recordAdapter);
  assert.equal(incoming.pendingVideos.length,1);
  assert.equal(incoming.pendingVideos[0].sourceSha256,digest);
  assert.deepEqual(incoming.ledger,prior());

  const preflight = await v2.preflight.inspectRestoreCandidateAgainstDatabase(
    target,incoming,v2.guard,v2.gate);
  assert.equal(preflight.preflightPassed,true);
  assert.equal(preflight.restoreAuthorized,false);
  const stage = await v2.stage.stagePendingRestore(target,out.file,options(),deps());
  assert.equal(stage.staged,true);
  assert.equal(stage.cleanupAuthorized,false);
  assert.equal(await count(target,'entrance_media'),0);

  target.close();
  target = await open(factory,'isolated-restore-target');
  const staged = await get(target,'archive_staging',
    'v2pending:' + backupId + ':entrance_media:' + videoId);
  assert.equal(await v2.sha.hashBlobHex(staged.blob),digest);
  const checked = await v2.verify.verifyStagedPendingAgainstArchive(
    target,out.file,options(),deps());
  assert.equal(checked.verifiedAtSnapshot,true);
  assert.equal(checked.transactionAborted,true);
  assert.equal(checked.restoreAuthorized,false);

  const committed = await v2.commit.commitEntranceOnlyIsolated(
    target,out.file,commitOptions(),deps());
  assert.equal(committed.committed,true);
  assert.equal(committed.cleanupAuthorized,false);
  target.close();
  target = await open(factory,'isolated-restore-target');
  assert.deepEqual(await get(target,'main','state'),state('imported'));
  assert.deepEqual(await get(target,'main','video_recognition_ledger_v1'),prior());
  const live = await get(target,'entrance_media',videoId);
  assert.equal(await v2.sha.hashBlobHex(live.blob),digest);
  assert.equal(await count(target,'full_backup'),1);
  assert.equal(await count(target,'archive_history'),1);
  assert.equal((await v2.commit.inspectEntranceCommit(target,backupId,deps()))
    .cleanupAuthorized,false);

  const reverted = await v2.rollback.quarantineRollbackIsolated(
    target,rollbackOptions(),deps());
  assert.equal(reverted.reverted,true);
  assert.equal(reverted.protectedCopiesRetained,true);
  assert.equal(reverted.cleanupAuthorized,false);
  target.close();
  target = await open(factory,'isolated-restore-target');
  assert.deepEqual(await get(target,'main','state'),state('restored'));
  assert.deepEqual(await get(target,'main','video_recognition_ledger_v1'),prior());
  assert.equal(await count(target,'entrance_media'),0);
  const quarantine = await get(target,'full_backup','v2entrance:' + backupId);
  assert.equal(quarantine.kind,'v2_entrance_quarantine_rollback_snapshot');
  assert.equal(quarantine.quarantinedMedia.length,1);
  assert.equal(await v2.sha.hashBlobHex(quarantine.quarantinedMedia[0].blob),digest);
  assert.equal(await v2.sha.hashBlobHex((await get(target,'archive_staging',
    'v2pending:' + backupId + ':entrance_media:' + videoId)).blob),digest);
  const status = await v2.rollback.inspectQuarantine(target,backupId,deps());
  assert.equal(status.status,'reverted_quarantine_unverified');
  assert.equal(status.byteIntegrityVerified,false);
  assert.equal(status.restoreAuthorized,false);
  assert.equal(status.cleanupAuthorized,false);
  await denied(v2.preflight.inspectRestoreCandidateAgainstDatabase(
    target,incoming,v2.guard,v2.gate));
  // Cross-database isolation: the exporting original remains available,
  // unmodified and independently hash-verifiable.
  assert.equal(await v2.sha.hashBlobHex((await get(source,'entrance_media',videoId)).blob),
    digest);
  assert.equal(await count(source,'archive_staging'),0);
  assert.equal(await count(source,'full_backup'),0);
});

test('P0: altered staged Blob fails closed after restart; no live import or evidence deletion',async t => {
  const factory = new IDBFactory();
  let source = await open(factory,'isolated-corrupt-export');
  let target = await open(factory,'isolated-corrupt-target');
  t.after(() => {try{source.close();}catch{} try{target.close();}catch{}});
  const digest = await seed(source,'archived',true);
  await seed(target,'base');
  const out = await v2.exportCandidate.buildV2ArchiveCandidateFromDatabase(
    source,{backupId,createdAt},deps());
  await v2.stage.stagePendingRestore(target,out.file,options(),deps());
  // Same length/type tamper: validating size or MIME is insufficient.
  const changed = new Blob([new Uint8Array(original.size).fill(7)],
    {type:'video/mp4'});
  assert.notEqual(await v2.sha.hashBlobHex(changed),digest);
  await replaceStageBlob(target,changed);
  target.close();
  target = await open(factory,'isolated-corrupt-target');
  await assert.rejects(v2.verify.verifyStagedPendingAgainstArchive(
    target,out.file,options(),deps()),{code:'V2_VERIFY_STAGED_HASH_CHANGED'});
  await denied(v2.commit.commitEntranceOnlyIsolated(
    target,out.file,commitOptions(),deps()));
  assert.deepEqual(await get(target,'main','state'),state('base'));
  assert.deepEqual(await get(target,'main','video_recognition_ledger_v1'),prior());
  assert.equal(await count(target,'entrance_media'),0);
  assert.equal(await count(target,'archive_history'),1);
  assert.equal(await count(target,'archive_staging'),2);
  assert.equal(await count(target,'full_backup'),0);
  assert.equal(await v2.sha.hashBlobHex((await get(target,'archive_staging',
    'v2pending:' + backupId + ':entrance_media:' + videoId)).blob),
    await v2.sha.hashBlobHex(changed),'invalid evidence stays available for manual review');
  assert.equal(await v2.sha.hashBlobHex((await get(source,'entrance_media',videoId)).blob),
    digest);
});
