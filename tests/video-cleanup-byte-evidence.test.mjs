import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const root={};
for(const filename of ['paseka-sha256.js','video-cleanup-byte-evidence.js']){
 const source=await readFile(new URL('../js/'+filename,import.meta.url),'utf8');
 new Function('window',source)(root);
}
const audit=root.PasekaVideoCleanupByteEvidence.auditEntranceBlob;
const hash=value=>createHash('sha256').update(value).digest('hex');
let id=0;
async function setup(){
 const factory=new IDBFactory();
 const req=factory.open('byte-audit-'+(++id),1);
 req.onupgradeneeded=()=>req.result.createObjectStore('entrance_media',{keyPath:'id'});
 const db=await new Promise((resolve,reject)=>{
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
 return db;
}
async function put(db,row){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('entrance_media','readwrite');
  tx.objectStore('entrance_media').put(row);
  tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error('write failed'));
 });
}
async function get(db,key){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('entrance_media','readonly');
  const r=tx.objectStore('entrance_media').get(key);
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
 });
}
const make=(value='original')=>({
 id:'video-1',blob:new Blob([value],{type:'video/mp4'}),
 bytes:Buffer.byteLength(value),blobSha256:hash(value),
 captureProvenance:{source:'file_input_or_external_camera',externalCopyState:'unknown'}
});
const blocked=result=>{
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.cleanupAuthorized,false);
 assert.equal(result.deleteAllowed,false);
 assert.equal(result.allCopiesVerified,false);
 assert.equal(result.externalCopiesVerified,false);
 assert.equal(result.dataModified,false);
};
test('two read-only byte hashes match but still never authorize original deletion',async()=>{
 const db=await setup(),original=make();
 await put(db,original);
 const modes=[];
 const readonly={objectStoreNames:db.objectStoreNames,transaction(store,mode){
  modes.push(mode);if(mode!=='readonly')throw Error('readwrite_not_allowed');
  return db.transaction(store,mode);
 }};
 const r=await audit(readonly,'video-1');
 blocked(r);assert.equal(r.candidateBytesVerified,true);
 assert.equal(r.reason,'all_copies_and_external_ownership_unverified');
 assert.equal(r.byteCount,8);
 assert.equal(r.sourceProvenance,'UNKNOWN_OR_EXTERNAL');
 assert.deepEqual(modes,['readonly','readonly']);
 assert.equal((await get(db,'video-1')).blobSha256,hash('original'));
 db.close();
});
test('forged metadata with altered Blob bytes is rejected without writes',async()=>{
 const db=await setup();
 await put(db,{...make(),blob:new Blob(['tampered'])});
 const r=await audit(db,'video-1');
 blocked(r);assert.equal(r.candidateBytesVerified,false);
 assert.equal(r.reason,'source_bytes_hash_mismatch');
 assert.equal((await get(db,'video-1')).blobSha256,hash('original'));
 db.close();
});
test('missing, invalid id and contradictory metadata block before any cleanup',async()=>{
 const db=await setup();
 blocked(await audit(db,'../bad'));
 assert.equal((await audit(db,'video-1')).reason,'original_missing');
 await put(db,{...make(),sourceSha256:'f'.repeat(64)});
 assert.equal((await audit(db,'video-1')).reason,'source_metadata_conflict');
 db.close();
});
test('source rewritten between snapshots is blocked despite valid replacement hash',async()=>{
 const db=await setup();await put(db,make());
 const originalHash=root.PasekaSha256;
 let runs=0;
 root.PasekaSha256={hashBlobHex:async(blob)=>{
  const h=await originalHash.hashBlobHex(blob);
  if(++runs===1)await put(db,make('replaced'));
  return h;
 }};
 try{
  const r=await audit(db,'video-1');
  blocked(r);assert.equal(r.reason,'source_changed_between_reads');
  assert.equal(r.candidateBytesVerified,false);
  assert.equal((await get(db,'video-1')).blobSha256,hash('replaced'));
 }finally{root.PasekaSha256=originalHash;db.close()}
});
test('unavailable store, hash module and read failure never expose originals',async()=>{
 const db=await setup();await put(db,make('private-synthetic-video'));
 const originalHash=root.PasekaSha256;
 root.PasekaSha256=null;
 try{assert.equal((await audit(db,'video-1')).reason,'hash_module_unavailable')}
 finally{root.PasekaSha256=originalHash}
 const denied={objectStoreNames:db.objectStoreNames,transaction(){throw Error('PRIVATE_SECRET')}};
 const result=await audit(denied,'video-1');
 blocked(result);assert.equal(result.reason,'readonly_unavailable');
 assert.equal(JSON.stringify(result).includes('PRIVATE_SECRET'),false);
 assert.equal(JSON.stringify(result).includes('private-synthetic-video'),false);
 db.close();
});
