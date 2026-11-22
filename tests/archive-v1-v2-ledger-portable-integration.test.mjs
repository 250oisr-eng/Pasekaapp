import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';

const root = {};
for (const path of [
  'js/paseka-sha256.js',
  'js/video-archive-v2-guard.js',
  'js/video-archive-v2-metadata-codec.js',
  'js/video-archive-v2-restore-gate.js',
  'js/paseka-archive.js'
]) new Function('window', readFileSync(path, 'utf8'))(root);
const codec = root.PasekaVideoArchiveV2MetadataCodec;
const guard = root.PasekaVideoArchiveV2Guard;
const gate = root.PasekaVideoArchiveV2RestoreGate;
const legacy = root.PasekaArchive;
const sha = root.PasekaSha256;
const state = () => ({meta:{schemaVersion:15,revisionId:'state-after-recognition'},
  hives:[],families:[],records:[{id:'inspection-1',media:[{
    kind:'video',videoId:'v-recognized',sourceSha256:'a'.repeat(64),
    sourceBytes:3,data:null
  }]}]});
const recognition = (cleanupState='deleted') => ({source:'record_media',
  videoId:'v-recognized',resultId:'r-1',recognizedAt:'2026-11-23T10:00:00Z',
  stateRevisionId:'state-after-recognition',sourceSha256:'a'.repeat(64),
  sourceBytes:3,sourceEvidenceVersion:1,sourceHashVerifiedAt:'2026-11-23T09:59:59Z',
  cleanupState,result:{observations:['synthetic-only']}});
const ledger = () => ({version:1,entries:[recognition()]});
async function open(factory,name) {
  return new Promise((resolve,reject)=>{
    const request=factory.open(name,1);
    request.onupgradeneeded=()=>{
      request.result.createObjectStore('main');
      request.result.createObjectStore('entrance_media',{keyPath:'id'});
      request.result.createObjectStore('archive_staging',{keyPath:'id'});
      request.result.createObjectStore('archive_history',{keyPath:'backupId'});
      request.result.createObjectStore('full_backup');
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
function put(db,key,value){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('main','readwrite');
    tx.objectStore('main').put(value,key);
    tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error);
  });
}
function read(db,key){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('main','readonly');
    const request=tx.objectStore('main').get(key);
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
test('real binary PASEKA02 metadata roundtrip retains durable tombstone across IndexedDB reopen, v1 export stays blocked',async()=>{
  const factory=new IDBFactory(),name='synthetic-portable-ledger-reopen';
  const db=await open(factory,name);
  const originalState=state(),originalLedger=ledger();
  await put(db,'state',originalState);
  await put(db,'video_recognition_ledger_v1',originalLedger);
  const binary=await codec.buildMetadataArchive({
    state:await read(db,'state'),ledger:await read(db,'video_recognition_ledger_v1'),
    backupId:'synthetic-portable-tombstone',createdAt:'2026-11-23T10:00:00Z'
  },webcrypto,guard,sha);
  assert.equal(binary.size>0,true);
  await assert.rejects(legacy.exportArchiveFromDatabase(db,webcrypto),
    {code:'VIDEO_LEDGER_NOT_ARCHIVED'});
  db.close();
  const reopened=await open(factory,name);
  try{
    assert.deepEqual(await read(reopened,'video_recognition_ledger_v1'),originalLedger);
    const incoming=await codec.inspectMetadataArchive(binary,webcrypto,guard,sha);
    assert.deepEqual(incoming.ledger,originalLedger);
    assert.equal(incoming.restoreAuthorized,false);
    const proof=gate.checkRestoreLedgerCandidate(
      await read(reopened,'video_recognition_ledger_v1'),incoming,guard);
    assert.equal(proof.historyPreserved,1);
    assert.equal(proof.archiveSafe,false);
    assert.equal(proof.restoreAuthorized,false);
    assert.deepEqual(await read(reopened,'state'),originalState);
  }finally{reopened.close();}
});
test('PASEKA02 missing deleted tombstone after offline reopen must not restore any state',async()=>{
  const factory=new IDBFactory(),name='synthetic-portable-missing-tombstone';
  const db=await open(factory,name);
  await put(db,'state',state());
  await put(db,'video_recognition_ledger_v1',ledger());
  db.close();
  const reopened=await open(factory,name);
  try{
    const incomplete=await codec.buildMetadataArchive({
      state:state(),ledger:{version:1,entries:[]},
      backupId:'missing-recognition',createdAt:'2026-11-23T10:00:00Z'
    },webcrypto,guard,sha);
    const incoming=await codec.inspectMetadataArchive(incomplete,webcrypto,guard,sha);
    assert.throws(()=>gate.checkRestoreLedgerCandidate(
      ledger(),incoming,guard),{code:'V2_RESTORE_LEDGER_HISTORY_LOST'});
    assert.deepEqual(await read(reopened,'video_recognition_ledger_v1'),ledger());
    assert.deepEqual(await read(reopened,'state'),state());
  }finally{reopened.close();}
});
