import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';
const source=new URL('./fixtures/android-two-mp4-fileproof329.js',import.meta.url);
function harness(options={}){
 const root={indexedDB:new IDBFactory(),crypto:webcrypto,Blob,TextEncoder,TextDecoder,atob,btoa,console,
   Uint8Array,ArrayBuffer,DataView,Date,Promise,Error,Set,Map,JSON,Math,Number,String};
 root.window=root;
 root.calls=[];
 root.PasekaFileproof329={
   saveAndReadBack(base64,sha){
     root.calls.push({base64,sha});
     if(options.nativeBlock)return 'BLOCKED';
     const bytes=Buffer.from(base64,'base64');
     assert.equal(bytes.subarray(0,8).toString(),'PASEKA01');
     assert.equal(createHash('sha256').update(bytes).digest('hex'),sha);
     root.lastSize=bytes.length;
     return 'PASS:'+bytes.length+':'+sha;
   },
   getSavedUri(){return 'content://media/external/downloads/12345';}
 };
 runInNewContext(readFileSync(new URL('../js/paseka-archive.js',import.meta.url),'utf8'),root);
 runInNewContext(readFileSync(new URL('./fixtures/android-two-mp4-proof-fixtures.js',import.meta.url),'utf8'),root);
 runInNewContext(readFileSync(source,'utf8'),root);
 return root;
}
const expected=['794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f',
'bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff'];
test('fileproof329: real archive of two verified MP4s reaches MediaStore bridge once',async()=>{
 const c=harness();const r=await c.PasekaFileproof329Run.run();
 assert.equal(r.status,'PASS');assert.equal(r.phase,'FILE_READBACK_PASS');
 assert.equal(r.videoCount,2);assert.deepEqual(Array.from(r.sourceSha256),expected);
 assert.equal(r.archiveBytes,c.lastSize);assert.equal(c.calls.length,1);
 assert.equal(r.cleanupAuthorized,false);
 assert.equal(r.recognitionSucceeded,false);
 await assert.rejects(c.PasekaFileproof329Run.run(),e=>e.code==='ISOLATED_DB_NOT_EMPTY_NO_OVERWRITE');
 assert.equal(c.calls.length,1);
});
test('fileproof329: corrupt fixture is blocked before IndexedDB creation or MediaStore write',async()=>{
 const c=harness();
 const old=c.PasekaTwoMp4ProofFixtures;
 c.PasekaTwoMp4ProofFixtures=[{...old[0],sha256:'0'.repeat(64)},old[1]];
 await assert.rejects(c.PasekaFileproof329Run.run(),e=>e.code==='SOURCE_PIN_MISMATCH');
 assert.equal(c.calls.length,0);
 // A known-good restart is permitted because no database write happened.
 c.PasekaTwoMp4ProofFixtures=old;
 const r=await c.PasekaFileproof329Run.run();
 assert.equal(r.status,'PASS');
 assert.equal(c.calls.length,1);
});
test('fileproof329: native blocked result never triggers retry or overwrite',async()=>{
 const c=harness({nativeBlock:true});
 await assert.rejects(c.PasekaFileproof329Run.run(),e=>e.code==='NATIVE_MEDIASTORE_BLOCKED');
 assert.equal(c.calls.length,1);
 await assert.rejects(c.PasekaFileproof329Run.run(),e=>e.code==='ISOLATED_DB_NOT_EMPTY_NO_OVERWRITE');
 assert.equal(c.calls.length,1);
});
