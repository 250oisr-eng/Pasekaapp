import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { inspectExportedArchiveText, inspectExportedArchiveFile } from '../scripts/verify-exported-archive.mjs';

const src = await readFile(new URL('../js/disaster-archive.js', import.meta.url), 'utf8');
const root = { crypto: webcrypto };
new Function('window', 'TextEncoder', 'Blob', 'File', 'atob', 'btoa', src)(
 root, TextEncoder, Blob, typeof File === 'undefined' ? undefined : File, atob, btoa
);

async function syntheticArchive({ extraStore=false }={}) {
 const idb = new IDBFactory();
 const db = await new Promise((ok,no)=>{
  const req=idb.open('test-file-proof',3);
  req.onupgradeneeded=()=>{
   req.result.createObjectStore('main');
   req.result.createObjectStore('full_backup');
   req.result.createObjectStore('entrance_media',{keyPath:'id'});
   if(extraStore)req.result.createObjectStore('historical_custom');
  };
  req.onsuccess=()=>ok(req.result);req.onerror=()=>no(req.error);
 });
 try {
  await new Promise((ok,no)=>{
   const names=Array.from(db.objectStoreNames),tx=db.transaction(names,'readwrite');
   tx.objectStore('main').put({meta:{revisionId:'synthetic'},hives:[],families:[],records:[]},'state');
   tx.objectStore('full_backup').put({state:{test:'only'}},'previous');
   tx.objectStore('entrance_media').put({id:'synthetic-video',blob:new Blob([new Uint8Array([0,17,255])],{type:'video/mp4'})});
   if(extraStore)tx.objectStore('historical_custom').put({unknown:'preserve'},'legacy-key');
   tx.oncomplete=ok;tx.onerror=()=>no(tx.error);tx.onabort=()=>no(tx.error);
  });
  return root.PasekaDisasterArchive.exportArchive(db);
 } finally {db.close();}
}

test('B01 independent exported-file check validates actual app format, binary and extra legacy stores without writes',async()=>{
 const raw=await syntheticArchive({extraStore:true});
 const verified=await inspectExportedArchiveText(raw);
 assert.equal(verified.status,'EXPORTED_FILE_STRUCTURALLY_VERIFIED_RESTORE_NOT_TESTED');
 assert.equal(verified.independentRestoreVerified,false);
 assert.equal(verified.userDataReadFromDevice,false);
 assert.equal(verified.counts.entrance_media,1);
 assert.equal(verified.counts.historical_custom,1);
 assert.match(verified.manifestSha256,/^[a-f0-9]{64}$/);
 assert.doesNotMatch(JSON.stringify(verified),/synthetic-video|legacy-key/);
});

test('B01 independent file verifier rejects modified byte content despite unchanged record counts',async()=>{
 const raw=await syntheticArchive(),env=JSON.parse(raw);
 const store=env.payload.stores.find(x=>x.name==='entrance_media');
 const encoded=JSON.stringify(store);
 assert.match(encoded,/ABH\//,'expected real packaged byte fixture');
 store.entries[0][1].v.find(pair=>pair[0]==='blob')[1].b64='AAEA';
 await assert.rejects(inspectExportedArchiveText(JSON.stringify(env)),/SHA-256 mismatch/);
});

test('B01 independent verifier refuses missing required store and malformed manifest without touching storage',async()=>{
 const raw=JSON.parse(await syntheticArchive());
 raw.payload.stores=raw.payload.stores.filter(s=>s.name!=='entrance_media');
 await assert.rejects(inspectExportedArchiveText(JSON.stringify(raw)),/Missing required/);
 const dup=JSON.parse(await syntheticArchive());
 dup.payload.stores.push({...dup.payload.stores[0]});
 await assert.rejects(inspectExportedArchiveText(JSON.stringify(dup)),/Invalid archive store manifest/);
 const old=JSON.parse(await syntheticArchive());
 old.payload.version=2;
 await assert.rejects(inspectExportedArchiveText(JSON.stringify(old)),/Unsupported archive/);
});

test('B01 readback of synthetic local file does not modify its bytes or claim independent recovery',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'paseka-b01-file-proof-'));
 try{
  const path=join(dir,'synthetic-only.json'),raw=await syntheticArchive();
  await writeFile(path,raw);
  const before=await readFile(path);
  const verified=await inspectExportedArchiveFile(path);
  assert.equal(verified.independentRestoreVerified,false);
  assert.deepEqual(await readFile(path),before);
  await assert.rejects(inspectExportedArchiveFile(path,{maxBytes:before.length-1}),/memory safety limit/);
  assert.deepEqual(await readFile(path),before);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('B01 verifier refuses a symlink to a valid archive instead of silently following it',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'paseka-b01-symlink-proof-'));
 try {
  const original=join(dir,'original.json'),link=join(dir,'link.json');
  await writeFile(original,await syntheticArchive());
  await symlink(original,link);
  await assert.rejects(inspectExportedArchiveFile(link),/non-symlink/);
  const checked=await inspectExportedArchiveFile(original);
  assert.equal(checked.independentRestoreVerified,false);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('B01 verifier rejects malformed UTF-8 without leaking private file contents',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'paseka-b01-utf8-proof-'));
 try {
  const path=join(dir,'malformed.json');
  await writeFile(path,Buffer.from([0xff,0xfe,0x7b,0x7d]));
  await assert.rejects(inspectExportedArchiveFile(path));
  assert.deepEqual(await readFile(path),Buffer.from([0xff,0xfe,0x7b,0x7d]));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('B01 byte cap rejects short invalid payload before parser and does not modify it',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'paseka-b01-cap-proof-'));
 try {
  const path=join(dir,'invalid.json'),data=Buffer.from('x'.repeat(4096));
  await writeFile(path,data);
  await assert.rejects(inspectExportedArchiveFile(path,{maxBytes:1024}),/memory safety limit/);
  assert.deepEqual(await readFile(path),data);
 }finally{await rm(dir,{recursive:true,force:true});}
});
