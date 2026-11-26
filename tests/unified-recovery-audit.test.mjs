import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {webcrypto} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';
import {parseUnifiedArguments,runUnifiedRecoveryAudit} from '../scripts/run-unified-recovery-audit.mjs';
import {readExportedArchiveFileText,inspectExportedArchiveFile} from '../scripts/verify-exported-archive.mjs';
const js=await readFile(new URL('../js/disaster-archive.js',import.meta.url),'utf8');
const globals={crypto:webcrypto};
new Function('window','TextEncoder','Blob','File','atob','btoa',js)(
  globals,TextEncoder,Blob,typeof File==='undefined'?undefined:File,atob,btoa);
const api=globals.PasekaDisasterArchive;
async function fixtureArchive(){
 const f=new IDBFactory();
 const db=await new Promise((resolve,reject)=>{
  const q=f.open('fixture-unified',3);
  q.onupgradeneeded=()=>{
   q.result.createObjectStore('main');
   q.result.createObjectStore('full_backup');
   q.result.createObjectStore('entrance_media',{keyPath:'id'});
   q.result.createObjectStore('legacy_extra');
  };
  q.onsuccess=()=>resolve(q.result);
  q.onerror=()=>reject(q.error);
 });
 try{
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(Array.from(db.objectStoreNames),'readwrite');
   tx.objectStore('main').put({meta:{revisionId:'fixture'},hives:[],families:[],records:[]},'state');
   tx.objectStore('full_backup').put({some:'older data'},'previous');
   tx.objectStore('entrance_media').put({id:'private-video-filename.mp4',
    blob:new Blob([new Uint8Array([0,55,255,17])],{type:'video/mp4'})});
   tx.objectStore('legacy_extra').put({payload:'private legacy'},'other');
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
  return api.exportArchive(db);
 }finally{db.close();}
}
async function localFixture(){
 const root=await mkdtemp(join(tmpdir(),'unified-paseka-only-'));
 const source=join(root,'source'),backup=join(root,'backup');
 await mkdir(source);await mkdir(backup);
 const bytes=Buffer.from([0,21,255,64]);
 await writeFile(join(source,'secret_video.mp4'),bytes);
 await writeFile(join(backup,'secret_video.mp4'),bytes);
 const archivePath=join(root,'full-private.json');
 await writeFile(archivePath,await fixtureArchive());
 return {root,source,backup,archivePath};
}
test('single command safely unifies archive, reopened empty fake-IDB and exact file-copy checks',async()=>{
 const f=await localFixture();
 try{
  const options=parseUnifiedArguments(['--archive',f.archivePath,'--media-source',f.source,
   '--media-copy',f.backup,'--expected-files','1']);
  const before=await readFile(f.archivePath);
  const result=await runUnifiedRecoveryAudit(options);
  assert.equal(result.overall,'LOCAL_CHECKS_VERIFIED_PHYSICAL_GATES_OPEN');
  assert.equal(result.archive.entranceMediaRecords,1);
  assert.equal(result.archive.storesChecked,4);
  assert.equal(result.isolatedMemoryReopen.archiveSha256Matched,true);
  assert.equal(result.externalMediaCopies.filesCompared,1);
  assert.equal(result.deviceOriginalsInventory.status,'NOT_VERIFIED');
  assert.equal(result.independentPhysicalRestore.status,'NOT_VERIFIED');
  assert.equal(result.androidInstalledSigning.status,'NOT_VERIFIED_IN_THIS_TEST');
  assert.equal(result.originalVideoDeletionAuthorized,false);
  assert.equal(result.installationAuthorized,false);
  assert.equal(result.userDataModified,false);
  assert.deepEqual(await readFile(f.archivePath),before);
  assert.doesNotMatch(JSON.stringify(result),
   /private|secret|\.mp4|\/tmp|\\\\|manifestSha256|originalSha/);
 }finally{await rm(f.root,{recursive:true,force:true});}
});
test('missing inputs are not success and isolated proof is never promoted to physical pass',async()=>{
 const result=await runUnifiedRecoveryAudit();
 assert.equal(result.overall,'BLOCKED_MISSING_LOCAL_EVIDENCE');
 assert.equal(result.archive.status,'NOT_PROVIDED');
 assert.equal(result.isolatedMemoryReopen.status,'NOT_TESTED');
 assert.equal(result.originalVideoDeletionAuthorized,false);
});
test('changed copy and malformed archive fail individually, do not suppress remaining check',async()=>{
 const f=await localFixture();
 try{
  await writeFile(join(f.backup,'secret_video.mp4'),Buffer.from([0,21,255,65]));
  let r=await runUnifiedRecoveryAudit({archivePath:f.archivePath,mediaSource:f.source,mediaCopy:f.backup});
  assert.equal(r.overall,'BLOCKED_LOCAL_CHECK');
  assert.equal(r.externalMediaCopies.status,'BLOCKED');
  assert.equal(r.isolatedMemoryReopen.status,'ISOLATED_MEMORY_REPLAY_AND_REOPEN_VERIFIED');
  await writeFile(f.archivePath,'{"private":"malformed"}');
  r=await runUnifiedRecoveryAudit({archivePath:f.archivePath,mediaSource:f.source,mediaCopy:f.backup});
  assert.equal(r.overall,'BLOCKED_LOCAL_CHECK');
  assert.equal(r.archive.status,'BLOCKED');
  assert.equal(r.isolatedMemoryReopen.status,'NOT_TESTED');
  assert.doesNotMatch(JSON.stringify(r),/private|secret/);
 }finally{await rm(f.root,{recursive:true,force:true});}
});
test('bounded archive reader retains strict size and exported structural compatibility',async()=>{
 const f=await localFixture();
 try{
  const raw=await readExportedArchiveFileText(f.archivePath);
  assert.ok(raw.includes('paseka-idb-full-v1'));
  assert.equal((await inspectExportedArchiveFile(f.archivePath)).counts.entrance_media,1);
  await assert.rejects(readExportedArchiveFileText(f.archivePath,{maxBytes:8}),/limit/);
 }finally{await rm(f.root,{recursive:true,force:true});}
});
test('one CLI rejects duplicate options, unknown flags, malformed expected count and unpaired media paths',()=>{
 for(const input of [
  ['--archive','x','--archive','y'],
  ['--archive'],['--unknown','x'],
  ['--media-source','x'],['--media-copy','y'],
  ['--expected-files','1'],['--media-source','x','--media-copy','y','--expected-files','0'],
  ['--archive','--media-copy'],['--media-source','x','--media-copy','y','--expected-files','NaN']
 ])assert.throws(()=>parseUnifiedArguments(input));
});
