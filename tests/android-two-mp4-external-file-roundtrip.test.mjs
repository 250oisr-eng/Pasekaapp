import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, open, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';

// CI/Node only. This does NOT invoke Android MediaStore or touch a user's disk.
runInThisContext(readFileSync(new URL('../js/paseka-archive.js', import.meta.url),'utf8'));
const archive=globalThis.PasekaArchive;
const host={};
for(const file of ['android-two-mp4-proof-fixtures.js']) {
  new Function('window',readFileSync(new URL('./fixtures/'+file,import.meta.url),'utf8'))(host);
}
const sha=b=>createHash('sha256').update(b).digest('hex');
const sourceHashes=[
 '794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f',
 'bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff'
];
const label='synthetic-file-roundtrip-hive';
const state={meta:{schemaVersion:15},hives:[{id:label}],records:[]};
const fixtures=host.PasekaTwoMp4ProofFixtures;
function createDb(factory,name) {
  return new Promise((resolve,reject)=>{
    const req=factory.open(name,1);
    req.onupgradeneeded=()=>{
      req.result.createObjectStore('main');
      req.result.createObjectStore('entrance_media',{keyPath:'id'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
function commit(tx){return new Promise((resolve,reject)=>{
  tx.oncomplete=resolve;
  tx.onabort=tx.onerror=()=>reject(tx.error||new Error('TRANSACTION_FAILED'));
});}
function readReq(req){return new Promise((resolve,reject)=>{
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error);
});}
async function isolatedSource() {
  const factory=new IDBFactory();
  const db=await createDb(factory,'synthetic-source');
  const tx=db.transaction(['main','entrance_media'],'readwrite');
  const done=commit(tx);
  tx.objectStore('main').put(state,'state');
  for(let i=0;i<2;i++){
    const f=fixtures[i], bytes=Buffer.from(f.base64,'base64');
    assert.equal(bytes.length,893);
    assert.equal(sha(bytes),sourceHashes[i]);
    tx.objectStore('entrance_media').add({
      id:f.id,hiveId:label,capturedAt:new Date(Date.UTC(2026,10,21,10,0,i)).toISOString(),
      width:16,height:16,durationSec:1,bytes:893,mimeType:'video/mp4',
      name:f.id+'.mp4',status:'waiting_for_server',
      blob:new Blob([bytes],{type:'video/mp4'})
    });
  }
  await done;
  db.close();
  return createDb(factory,'synthetic-source');
}
async function buildArchive(){
  const db=await isolatedSource();
  try{
    const result=await archive.exportArchiveFromDatabase(db,webcrypto,{
      backupId:'file-roundtrip-test-2026-11-21',createdAt:'2026-11-21T16:00:00.000Z'
    });
    assert.equal(result.summary.videoCount,2);
    return {source:Buffer.from(await result.blob.arrayBuffer()),fileName:'synthetic-two-mp4.paseka'};
  }finally{db.close();}
}
async function verifyDiskBlob(buffer){
  const fileBlob=new Blob([buffer],{type:'application/vnd.paseka.archive'});
  const parsed=await archive.parseArchiveBlob(fileBlob);
  await archive.verifyArchive(fileBlob,parsed,webcrypto);
  const proof=await archive.validateArchiveForRestore(fileBlob,webcrypto,
    data=>data.meta?.schemaVersion===15 && data.hives?.length===1 && data.hives[0].id===label);
  assert.equal(proof.videoEntries.length,2);
  assert.deepEqual(proof.orphanVideoIds,[]);
  assert.deepEqual(proof.state,state);
  for(let i=0;i<2;i++){
    assert.equal(proof.videoEntries[i].metadata.id,fixtures[i].id);
    assert.equal(sha(Buffer.from(await proof.videoEntries[i].blob.arrayBuffer())),sourceHashes[i]);
  }
  // Preflight returns data, NOT permission to change an existing DB.
  return proof;
}
test('PASEKA01 external file: exclusive creation, fsync, disk reopen, source SHA and restore preflight',async(t)=>{
  const dir=await mkdtemp(join(tmpdir(),'paseka-two-mp4-file-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const {source,fileName}=await buildArchive();
  const path=join(dir,fileName);
  const expectedSha=sha(source);
  const handle=await open(path,'wx',0o600);
  try{await handle.writeFile(source);await handle.sync();}
  finally{await handle.close();}
  const st=await stat(path);
  assert.equal(st.size,source.length);
  // Read from the file system, not from the original JS export Blob.
  const disk=await readFile(path);
  assert.equal(sha(disk),expectedSha);
  assert.deepEqual(disk,source);
  await verifyDiskBlob(disk);
  // A pre-existing file may never be overwritten by the test writer.
  await assert.rejects(open(path,'wx',0o600),error=>error.code==='EEXIST');
  assert.equal(sha(await readFile(path)),expectedSha);
  // Re-open again after independent read and verify same file bytes.
  await verifyDiskBlob(await readFile(path));
});
test('PASEKA01 external file: corrupt video payload blocks restore preflight without modifying a source',async(t)=>{
  const dir=await mkdtemp(join(tmpdir(),'paseka-two-mp4-corrupt-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const {source}=await buildArchive();
  const clean=join(dir,'clean.paseka'),corrupt=join(dir,'corrupt.paseka');
  await writeFile(clean,source,{flag:'wx'});
  const blob=new Blob([source]);
  const parsed=await archive.parseArchiveBlob(blob);
  const video=parsed.entries.find(entry=>entry.kind==='entrance_video');
  const tampered=Buffer.from(source);
  tampered[video.offset+12] ^= 1;
  await writeFile(corrupt,tampered,{flag:'wx'});
  await assert.rejects(verifyDiskBlob(await readFile(corrupt)),e=>e.code==='CHECKSUM_MISMATCH');
  assert.equal(sha(await readFile(clean)),sha(source));
  await verifyDiskBlob(await readFile(clean));
});
test('PASEKA01 external file: incomplete write cannot pass archive verification',async(t)=>{
  const dir=await mkdtemp(join(tmpdir(),'paseka-two-mp4-short-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const {source}=await buildArchive();
  const path=join(dir,'truncated.paseka');
  await writeFile(path,source.subarray(0,source.length-1),{flag:'wx'});
  await assert.rejects(verifyDiskBlob(await readFile(path)),e=>
    e.code==='ARCHIVE_LENGTH_MISMATCH'||e.code==='INVALID_ARCHIVE');
});
test('PASEKA01 preflight has no restore commit; unrelated database remains untouched',async()=>{
  const factory=new IDBFactory();
  const existing=await createDb(factory,'protected-existing-data');
  const tx=existing.transaction(['main','entrance_media'],'readwrite');
  const done=commit(tx);
  tx.objectStore('main').put({userData:'untouched'},'state');
  await done;
  const {source}=await buildArchive();
  await verifyDiskBlob(source);
  const value=await readReq(existing.transaction('main','readonly').objectStore('main').get('state'));
  assert.deepEqual(value,{userData:'untouched'});
  const videoCount=await readReq(existing.transaction('entrance_media','readonly').objectStore('entrance_media').count());
  assert.equal(videoCount,0);
  existing.close();
});
