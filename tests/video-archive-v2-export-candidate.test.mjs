import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {webcrypto,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const root={},base=new URL('../js/',import.meta.url);
for(const file of ['paseka-sha256.js','video-archive-v2-guard.js','video-archive-v2-snapshot.js',
 'video-archive-v2-metadata-codec.js','video-archive-v2-export-candidate.js']){
 new Function('window',await readFile(new URL(file,base),'utf8'))(root);
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const finish=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||new Error('transaction failed'));});
async function setup(){
 const req=new IDBFactory().open('export-candidate',1);
 req.onupgradeneeded=()=>{req.result.createObjectStore('main');req.result.createObjectStore('entrance_media',{keyPath:'id'});};
 const db=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
 const tx=db.transaction(['main','entrance_media'],'readwrite');
 tx.objectStore('main').put({meta:{schemaVersion:15,revisionId:'r1'},records:[],hives:[]},'state');
 tx.objectStore('main').put({version:1,entries:[]},'video_recognition_ledger_v1');
 tx.objectStore('entrance_media').put({id:'pending',bytes:3,blobSha256:hash(new Uint8Array([1,2,3])),
  mimeType:'video/mp4',blob:new Blob([new Uint8Array([1,2,3])],{type:'video/mp4'})});
 await finish(tx);
 return db;
}
function deps(sha=root.PasekaSha256){return {snapshot:root.PasekaVideoArchiveV2Snapshot,
 codec:root.PasekaVideoArchiveV2MetadataCodec,guard:root.PasekaVideoArchiveV2Guard,
 sha,crypto:webcrypto};}
const params={backupId:'opt-recheck',createdAt:'2026-11-20T00:00:00Z'};
const build=(db,sha)=>root.PasekaVideoArchiveV2ExportCandidate.buildV2ArchiveCandidateFromDatabase(db,params,deps(sha));
const rejected=(promise,code)=>assert.rejects(promise,error=>error.code===code);
function shaWithMutation(mutate){
 let used=false;
 return {...root.PasekaSha256,async hashBlobHex(blob){
  const digest=await root.PasekaSha256.hashBlobHex(blob);
  if(!used){used=true;await mutate();}
  return digest;
 }};
}
test('v2 candidate export rechecks original source and never authorizes deletion or restore',async()=>{
 const db=await setup(),out=await build(db);
 assert.equal(out.file instanceof Blob,true);
 assert.equal(out.postHashRecheckPassed,true);
 assert.equal(out.requiresWriterFence,true);
 assert.equal(out.archiveSafe,false);
 assert.equal(out.restoreAuthorized,false);
 const parsed=await root.PasekaVideoArchiveV2MetadataCodec.inspectMetadataArchive(
  out.file,webcrypto,root.PasekaVideoArchiveV2Guard,root.PasekaSha256);
 assert.equal(parsed.pendingVideos.length,1);
 db.close();
});
test('recognition arriving while hashing blocks stale export, without losing original',async()=>{
 const db=await setup();
 const sha=shaWithMutation(async()=>{
  const tx=db.transaction('main','readwrite');
  tx.objectStore('main').put({version:1,entries:[{source:'entrance_media',videoId:'pending',
   sourceSha256:hash(new Uint8Array([1,2,3])),sourceBytes:3,sourceEvidenceVersion:1,
   resultId:'recognized',recognizedAt:'2026-11-20T00:00:00Z',stateRevisionId:'synthetic-state',sourceHashVerifiedAt:'2026-11-20T00:00:00Z',
   result:{observation:'yes'},cleanupState:'blocked_archive_safety'}]},'video_recognition_ledger_v1');
  await finish(tx);
 });
 await rejected(build(db,sha),'V2_RECOGNIZED_ORIGINAL_INCLUDED');
 const tx=db.transaction('entrance_media','readonly');
 const item=await new Promise((resolve,reject)=>{const r=tx.objectStore('entrance_media').get('pending');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 assert.equal(item.blob.size,3);db.close();
});
test('concurrent state revision change blocks stale candidate',async()=>{
 const db=await setup();
 const sha=shaWithMutation(async()=>{
  const tx=db.transaction('main','readwrite');
  tx.objectStore('main').put({meta:{schemaVersion:15,revisionId:'r2'},records:[],hives:[]},'state');
  await finish(tx);
 });
 await rejected(build(db,sha),'V2_SNAPSHOT_CHANGED_DURING_EXPORT');
 db.close();
});
test('source bytes changed with spoofed prior digest metadata cannot pass second hash',async()=>{
 const db=await setup();
 const sha=shaWithMutation(async()=>{
  const tx=db.transaction('entrance_media','readwrite');
  tx.objectStore('entrance_media').put({id:'pending',bytes:3,
   blobSha256:hash(new Uint8Array([1,2,3])),mimeType:'video/mp4',
   blob:new Blob([new Uint8Array([9,9,9])],{type:'video/mp4'})});
  await finish(tx);
 });
 await rejected(build(db,sha),'V2_SNAPSHOT_SOURCE_CHANGED');
 db.close();
});
test('a second entrance video written during SHA changes pending identities and blocks export',async()=>{
 const db=await setup();
 const sha=shaWithMutation(async()=>{
  const tx=db.transaction('entrance_media','readwrite');
  tx.objectStore('entrance_media').put({id:'new',bytes:1,blobSha256:hash(new Uint8Array([5])),
   mimeType:'video/mp4',blob:new Blob([new Uint8Array([5])],{type:'video/mp4'})});
  await finish(tx);
 });
 await rejected(build(db,sha),'V2_SNAPSHOT_CHANGED_DURING_EXPORT');
 db.close();
});
