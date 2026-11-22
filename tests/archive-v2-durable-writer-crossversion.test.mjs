import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';

const root={};
for(const p of ['js/paseka-sha256.js','js/video-recognition-ledger.js',
 'js/video-archive-v2-guard.js','js/video-archive-v2-metadata-codec.js','js/video-archive-v2-restore-gate.js',
 'js/paseka-archive.js']){
 new Function('window',readFileSync(p,'utf8'))(root);
}
const writer=root.PasekaVideoRecognitionLedger,codec=root.PasekaVideoArchiveV2MetadataCodec;
const guard=root.PasekaVideoArchiveV2Guard,gate=root.PasekaVideoArchiveV2RestoreGate;
const digest=createHash('sha256').update('synthetic-original').digest('hex');
const state=()=>({meta:{schemaVersion:15,revisionId:'pre-recognition'},hives:[],records:[],families:[]});
const request=()=>({source:'entrance_media',videoId:'video-id',resultId:'recognized-id',
 processedSourceSha256:digest,processedSourceBytes:18,
 expectedStateRevisionId:'pre-recognition',recognizedAt:'2026-11-23T10:00:00Z',
 recognitionStatus:'completed',recognitionSucceeded:true,result:{observation:'synthetic result only'}});
function open(factory,name){return new Promise((resolve,reject)=>{
 const req=factory.open(name,1);
 req.onupgradeneeded=()=>{
  const d=req.result;
  d.createObjectStore('main');d.createObjectStore('entrance_media',{keyPath:'id'});
  d.createObjectStore('archive_staging',{keyPath:'id'});
  d.createObjectStore('archive_history',{keyPath:'backupId'});
  d.createObjectStore('full_backup');
 };
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});}
function put(db,store,key,value){return new Promise((resolve,reject)=>{
 const tx=db.transaction(store,'readwrite');
 if(store==='main'||store==='full_backup')tx.objectStore(store).put(value,key);
 else tx.objectStore(store).put(value);
 tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error);
});}
function get(db,store,key){return new Promise((resolve,reject)=>{
 const request=db.transaction(store,'readonly').objectStore(store).get(key);
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});}
test('SHA-verified recognition writer persists result, v2 transports it after reboot, v1 refuses omission',async()=>{
 const factory=new IDBFactory(),name='synthetic-writer-archive-boundary';
 let db=await open(factory,name);
 await put(db,'main','state',state());
 await put(db,'entrance_media',null,{id:'video-id',bytes:18,blobSha256:digest,
  blob:new Blob(['synthetic-original'],{type:'video/mp4'}),capturedAt:'2026-11-23T09:00:00Z'});
 const saved=await writer.recordRecognitionResult(db,request());
 assert.equal(saved.ok,true);
 assert.equal(saved.cleanupState,'blocked_archive_safety');
 const original=await get(db,'entrance_media','video-id');
 assert.equal(await original.blob.text(),'synthetic-original');
 const ledger=await writer.readRecognitionLedger(db);
 assert.equal(ledger.ok,true);
 assert.equal(ledger.entries.length,1);
 assert.equal(ledger.entries[0].sourceSha256,digest);
 guard.validateRecognitionLedgerForV2({version:1,entries:ledger.entries});
 const binary=await codec.buildMetadataArchive({
  state:await get(db,'main','state'),ledger:{version:1,entries:ledger.entries},
  backupId:'synthetic-ledger-archive',createdAt:'2026-11-23T10:01:00Z'
 },webcrypto,guard,root.PasekaSha256);
 await assert.rejects(root.PasekaArchive.exportArchiveFromDatabase(db,webcrypto),
  {code:'VIDEO_LEDGER_NOT_ARCHIVED'});
 db.close();
 db=await open(factory,name);
 try{
  const reopened=await writer.readRecognitionLedger(db);
  assert.equal(reopened.ok,true);
  assert.deepEqual(reopened.entries,ledger.entries);
  const incoming=await codec.inspectMetadataArchive(binary,webcrypto,guard,root.PasekaSha256);
  const checked=gate.checkRestoreLedgerCandidate({version:1,entries:reopened.entries},incoming,guard);
  assert.equal(checked.historyPreserved,1);
  assert.equal(checked.restoreAuthorized,false);
  assert.equal(incoming.archiveSafe,false);
  assert.equal((await get(db,'entrance_media','video-id')).blob.size,18);
 }finally{db.close();}
});
test('old PASEKA02 cannot erase newly persisted recognition result after reopen',async()=>{
 const factory=new IDBFactory(),name='synthetic-ledger-omission-reboot';
 let db=await open(factory,name);
 await put(db,'main','state',state());
 await put(db,'entrance_media',null,{id:'video-id',bytes:18,blobSha256:digest,
  blob:new Blob(['synthetic-original'],{type:'video/mp4'})});
 const oldBinary=await codec.buildMetadataArchive({
  state:state(),ledger:{version:1,entries:[]},
  backupId:'old-synthetic-archive',createdAt:'2026-11-23T09:00:00Z'
 },webcrypto,guard,root.PasekaSha256);
 assert.equal((await writer.recordRecognitionResult(db,request())).ok,true);
 db.close();
 db=await open(factory,name);
 try{
  const incoming=await codec.inspectMetadataArchive(oldBinary,webcrypto,guard,root.PasekaSha256);
  const persisted=await writer.readRecognitionLedger(db);
  assert.throws(()=>gate.checkRestoreLedgerCandidate(
   {version:1,entries:persisted.entries},incoming,guard),
   {code:'V2_RESTORE_LEDGER_HISTORY_LOST'});
  assert.equal((await writer.readRecognitionLedger(db)).entries.length,1);
  assert.equal((await get(db,'entrance_media','video-id')).blob.size,18);
 }finally{db.close();}
});
