import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';

// CI-only: no filesystem writes, Android access, real IndexedDB or production import.
runInThisContext(readFileSync(new URL('../js/paseka-archive.js', import.meta.url),'utf8'));
const archive=globalThis.PasekaArchive;
const host={};
new Function('window',readFileSync(new URL('./fixtures/android-two-mp4-proof-fixtures.js',import.meta.url),'utf8'))(host);
const fixtures=host.PasekaTwoMp4ProofFixtures;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const hive='isolated-restore-proof329-hive';
const state={meta:{schemaVersion:15},hives:[{id:hive}],records:[]};
const requiredHashes=[
  '794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f',
  'bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff'
];
function openDb(factory,name){
  return new Promise((resolve,reject)=>{
    const request=factory.open(name,1);
    request.onupgradeneeded=()=>{
      request.result.createObjectStore('main');
      request.result.createObjectStore('entrance_media',{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
function req(request){
  return new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
function completion(tx){
  return new Promise((resolve,reject)=>{
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>{}; // onabort is authoritative for aborted readwrite transactions
    tx.onabort=()=>reject(tx.error||new Error('ISOLATED_TRANSACTION_ABORTED'));
  });
}
async function records(db){
  const tx=db.transaction(['main','entrance_media'],'readonly');
  const result=await Promise.all([
    req(tx.objectStore('main').get('state')),
    req(tx.objectStore('entrance_media').getAll())
  ]);
  return {state:result[0],videos:result[1]};
}
async function makeArchive(){
  const factory=new IDBFactory();
  const src=await openDb(factory,'test-only-source');
  try{
    const tx=src.transaction(['main','entrance_media'],'readwrite');
    const done=completion(tx);
    tx.objectStore('main').put(state,'state');
    for(let i=0;i<2;i++){
      const fixture=fixtures[i],bytes=Buffer.from(fixture.base64,'base64');
      assert.equal(bytes.length,893);
      assert.equal(sha(bytes),requiredHashes[i]);
      tx.objectStore('entrance_media').add({
        id:fixture.id,hiveId:hive,capturedAt:'2026-11-21T12:00:00.000Z',
        durationSec:1,width:16,height:16,bytes:893,mimeType:'video/mp4',
        name:fixture.id+'.mp4',status:'waiting_for_server',
        blob:new Blob([bytes],{type:'video/mp4'})
      });
    }
    await done;
    const exported=await archive.exportArchiveFromDatabase(src,webcrypto,{
      backupId:'isolated-proof329-restore-commit-test',createdAt:'2026-11-21T12:15:00.000Z'
    });
    return Buffer.from(await exported.blob.arrayBuffer());
  }finally{src.close();}
}
async function preflight(bytes){
  const blob=new Blob([bytes],{type:'application/vnd.paseka.archive'});
  const result=await archive.validateArchiveForRestore(blob,webcrypto,
    data=>data.meta?.schemaVersion===15 &&
      data.hives?.length===1 && data.hives[0].id===hive);
  assert.equal(result.videoEntries.length,2);
  assert.deepEqual(result.orphanVideoIds,[]);
  for(let i=0;i<2;i++){
    const v=result.videoEntries[i];
    assert.equal(v.metadata.id,fixtures[i].id);
    assert.equal(v.metadata.hiveId,hive);
    assert.equal(v.size,893);
    assert.equal(v.metadata.mimeType,'video/mp4');
    assert.equal(sha(Buffer.from(await v.blob.arrayBuffer())),requiredHashes[i]);
  }
  return result;
}
async function isolatedCommit(db,proof,{abortAfterFirstVideo=false}={}){
  // This test-only transaction cannot target user databases and does not expose
  // any production restore API. Never clear() or replace existing records.
  if(!proof || proof.videoEntries.length!==2 || proof.orphanVideoIds.length){
    throw new Error('RESTORE_PROOF_REQUIRED');
  }
  const tx=db.transaction(['main','entrance_media'],'readwrite');
  const done=completion(tx);
  try{
    const existingState=await req(tx.objectStore('main').get('state'));
    const existingVideoCount=await req(tx.objectStore('entrance_media').count());
    if(existingState!==undefined || existingVideoCount!==0){
      tx.abort();
      await done.catch(()=>{});
      throw new Error('RESTORE_REQUIRES_EMPTY_DESTINATION');
    }
    tx.objectStore('main').add(proof.state,'state');
    for(let i=0;i<proof.videoEntries.length;i++){
      const entry=proof.videoEntries[i];
      tx.objectStore('entrance_media').add({...entry.metadata,blob:entry.blob});
      if(i===0 && abortAfterFirstVideo){
        tx.abort();
        await done.catch(()=>{});
        throw new Error('INJECTED_ABORT_AFTER_FIRST_VIDEO');
      }
    }
    await done;
  }catch(error){
    if(tx.readyState==='active'){
      try{tx.abort()}catch{}
    }
    await done.catch(()=>{});
    throw error;
  }
}
async function checkRestored(db){
  const result=await records(db);
  assert.deepEqual(result.state,state);
  assert.equal(result.videos.length,2);
  for(let i=0;i<2;i++){
    assert.equal(result.videos[i].id,fixtures[i].id);
    assert.equal(sha(Buffer.from(await result.videos[i].blob.arrayBuffer())),requiredHashes[i]);
  }
}
test('test-only restore: two synthetic MP4 and state commit atomically into empty IndexedDB, persist after reopen',async()=>{
  const original=await makeArchive(), pinned=sha(original);
  const proof=await preflight(original);
  const factory=new IDBFactory();
  let dest=await openDb(factory,'brand-new-isolated-destination');
  assert.deepEqual(await records(dest),{state:undefined,videos:[]});
  await isolatedCommit(dest,proof);
  dest.close();
  dest=await openDb(factory,'brand-new-isolated-destination');
  try{await checkRestored(dest);}
  finally{dest.close();}
  assert.equal(sha(original),pinned,'the source archive must remain unchanged');
});
test('test-only restore rejects nonempty destination without overwriting preexisting state or media',async()=>{
  const original=await makeArchive(), proof=await preflight(original);
  const factory=new IDBFactory();
  const db=await openDb(factory,'nonempty-isolated-destination');
  try{
    const tx=db.transaction('main','readwrite'),done=completion(tx);
    tx.objectStore('main').add({sentinel:'must-stay'},'state');
    await done;
    await assert.rejects(isolatedCommit(db,proof),/RESTORE_REQUIRES_EMPTY_DESTINATION/);
    assert.deepEqual(await records(db),{state:{sentinel:'must-stay'},videos:[]});
    assert.equal(sha(original),sha(Buffer.from(original)));
  }finally{db.close();}
});
test('test-only restore rolls back state and first video if transaction aborts before second',async()=>{
  const proof=await preflight(await makeArchive());
  const factory=new IDBFactory();
  let db=await openDb(factory,'abort-isolated-destination');
  await assert.rejects(isolatedCommit(db,proof,{abortAfterFirstVideo:true}),/INJECTED_ABORT_AFTER_FIRST_VIDEO/);
  db.close();
  db=await openDb(factory,'abort-isolated-destination');
  try{assert.deepEqual(await records(db),{state:undefined,videos:[]});}
  finally{db.close();}
});
test('tampered synthetic MP4 payload fails preflight before destination transaction',async()=>{
  const bytes=await makeArchive(), parsed=await archive.parseArchiveBlob(new Blob([bytes]));
  const first=parsed.entries.find(e=>e.kind==='entrance_video');
  const tampered=Buffer.from(bytes);
  tampered[first.offset+5]^=0x01;
  const factory=new IDBFactory();
  const db=await openDb(factory,'tampered-isolated-destination');
  try{
    await assert.rejects(preflight(tampered),e=>e.code==='CHECKSUM_MISMATCH');
    assert.deepEqual(await records(db),{state:undefined,videos:[]});
  }finally{db.close();}
  assert.notEqual(sha(tampered),sha(bytes));
});
