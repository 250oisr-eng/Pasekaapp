import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {webcrypto} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';
import {findFullExport,runOneClick,safeError} from '../scripts/run-b01-oneclick.mjs';

async function workspace(){
 const base=await mkdtemp(join(tmpdir(),'b01-oneclick-only-'));
 const bundle=join(base,'bundle'),downloads=join(base,'Downloads'),desktop=join(base,'Desktop');
 await Promise.all([bundle,downloads,desktop].map(p=>mkdir(p)));
 return {base,bundle,downloads,desktop};
}

async function fullArchive(){
 const code=await readFile(new URL('../js/disaster-archive.js',import.meta.url),'utf8');
 const target={crypto:webcrypto};
 new Function('window','TextEncoder','Blob','File','atob','btoa',code)(
   target,TextEncoder,Blob,typeof File==='undefined'?undefined:File,atob,btoa);
 const factory=new IDBFactory();
 const request=factory.open('b01-single-click-fixture',3);
 request.onupgradeneeded=()=>{
  request.result.createObjectStore('main');
  request.result.createObjectStore('full_backup');
  request.result.createObjectStore('entrance_media',{keyPath:'id'});
 };
 const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
 try{
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(['main','full_backup','entrance_media'],'readwrite');
   tx.objectStore('main').put({meta:{revisionId:'synthetic'},hives:[],families:[],records:[]},'state');
   tx.objectStore('full_backup').put({state:{test:1}},'previous');
   tx.objectStore('entrance_media').put({id:'synthetic-video',blob:new Blob([Uint8Array.from([1,0,255,5])],{type:'video/mp4'})});
   tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error);
  });
  return target.PasekaDisasterArchive.exportArchive(db);
 }finally{db.close()}
}
test('B01 one-click finds exactly one genuine full-export filename and makes no network or device request',async()=>{
 const w=await workspace();
 try{
  const src=join(w.downloads,'paseka-full-idb-2026-11-25.json'),raw=await fullArchive();
  await writeFile(src,raw);
  assert.equal(await findFullExport({root:w.bundle,downloads:w.downloads,desktop:w.desktop}),src);
  const result=await runOneClick({bundleRoot:w.bundle,downloads:w.downloads,desktop:w.desktop});
  assert.equal(result.output.status,'EPHEMERAL_ARCHIVE_RESTORE_REOPEN_BYTES_PASS_NOT_DEVICE_PROOF');
  assert.equal(result.output.requiredStoreCounts.entrance_media,1);
  assert.equal(result.output.userArchiveUploaded,false);
  assert.equal(result.output.realAndroidRestore,'NOT_TESTED');
  assert.equal(await readFile(src,'utf8'),raw);
  assert.doesNotMatch(JSON.stringify(result.output),/synthetic-video|synthetic|paseka-full-idb-2026/);
  await assert.rejects(runOneClick({bundleRoot:w.bundle,downloads:w.downloads,desktop:w.desktop}),/B01_BLOCKED_PREVIOUS_REPORT_PRESERVED/);
 }finally{await rm(w.base,{recursive:true,force:true})}
});

test('B01 one-click stops on missing, ambiguous or wrong archive without modifying inputs',async()=>{
 const w=await workspace();
 try{
  const missing=await runOneClick({bundleRoot:w.bundle,downloads:w.downloads,desktop:w.desktop});
  assert.equal(missing.output.code,'B01_BLOCKED_FULL_EXPORT_NOT_FOUND');
  const w2=await workspace();
  try{
   const a=join(w2.downloads,'paseka-full-idb-2026-11-25.json');
   const b=join(w2.desktop,'paseka-full-idb-2026-11-24 (1).json');
   await writeFile(a,'original a');
   await writeFile(b,'original b');
   const result=await runOneClick({bundleRoot:w2.bundle,downloads:w2.downloads,desktop:w2.desktop});
   assert.equal(result.output.code,'B01_BLOCKED_MULTIPLE_FULL_EXPORTS');
   assert.equal(await readFile(a,'utf8'),'original a');
   assert.equal(await readFile(b,'utf8'),'original b');
  }finally{await rm(w2.base,{recursive:true,force:true})}
 }finally{await rm(w.base,{recursive:true,force:true})}
});

test('B01 one-click refuses symlink, unrelated JSON and does not echo private error strings',async()=>{
 const w=await workspace();
 try{
  const target=join(w.base,'target.json');await writeFile(target,'private data');
  const link=join(w.downloads,'paseka-full-idb-2026-11-25.json');
  await symlink(target,link);
  const outcome=await runOneClick({bundleRoot:w.bundle,downloads:w.downloads,desktop:w.desktop});
  assert.equal(outcome.output.code,'B01_BLOCKED_UNSAFE_OR_OVERSIZE_FULL_EXPORT');
  assert.equal(safeError(Error('secret private filename /home/alice')),'B01_BLOCKED_ARCHIVE_RECOVERY_FAILED_REDACTED');
  await assert.rejects(findFullExport({explicitPath:target}),/B01_BLOCKED_NOT_FULL_INDEXEDDB_EXPORT_NAME/);
 }finally{await rm(w.base,{recursive:true,force:true})}
});
