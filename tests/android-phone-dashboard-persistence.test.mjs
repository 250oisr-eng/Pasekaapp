import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';

const runner=readFileSync('diagnostics/phone-dashboard/runner.js','utf8');
function start(factory){
 const controls=new Map();
 for(const id of ['run','copy','result'])controls.set(id,{id,disabled:false,textContent:'',handlers:{},addEventListener(name,handler){this.handlers[name]=handler;}});
 const sandbox={indexedDB:factory,crypto:webcrypto,Blob,TextEncoder,Uint8Array,document:{getElementById:id=>controls.get(id)},window:{Capacitor:{Plugins:{Clipboard:{write:async()=>{}}}}}};
 runInNewContext(runner,sandbox,{timeout:1000});
 return {controls,async execute(){await controls.get('run').handlers.click();return JSON.parse(controls.get('result').textContent);}};
}
function open(factory){return new Promise((resolve,reject)=>{const r=factory.open('paseka-phonechecks-synthetic-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function tamper(factory,value){
 const db=await open(factory);
 await new Promise((resolve,reject)=>{
  const tx=db.transaction('fixtures','readwrite');
  tx.objectStore('fixtures').put(value,'single-synthetic-blob');
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
 db.close();
}
async function read(factory){
 const db=await open(factory);
 const out=await new Promise((resolve,reject)=>{
  const tx=db.transaction('fixtures','readonly');
  const r=tx.objectStore('fixtures').get('single-synthetic-blob');
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
 });
 db.close();return out;
}
test('first run creates only local synthetic fixture; next app load verifies existing bytes',async()=>{
 const f=new IDBFactory();
 const first=await start(f).execute();
 assert.equal(first.status,'PASS');
 assert.equal(first.checks.syntheticIndexedDbReopen.previousFixture,'ABSENT_CREATED');
 assert.equal(first.cleanupAuthorized,false);
 const second=await start(f).execute();
 assert.equal(second.status,'PASS');
 assert.equal(second.checks.syntheticIndexedDbReopen.previousFixture,'PRESENT_VERIFIED');
 assert.equal(second.scope.beeRecognition,'NOT_TESTED');
 assert.equal(second.externalRequests,'NOT_MEASURED');
});
test('tampered synthetic fixture blocks and is never replaced',async()=>{
 const f=new IDBFactory();
 assert.equal((await start(f).execute()).status,'PASS');
 const wrong=new Blob(['tampered-existing-fixture'],{type:'application/octet-stream'});
 await tamper(f,wrong);
 const result=await start(f).execute();
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.code,'PREVIOUS_FIXTURE_MISMATCH_PRESERVE');
 assert.equal(result.cleanupAuthorized,false);
 assert.equal(result.deleteAllowed,false);
 const preserved=await read(f);
 assert.equal(await preserved.text(),'tampered-existing-fixture');
});
test('unknown pre-existing non-Blob also blocks without overwriting',async()=>{
 const f=new IDBFactory();
 assert.equal((await start(f).execute()).status,'PASS');
 await tamper(f,'opaque-user-value');
 const result=await start(f).execute();
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.code,'PREVIOUS_FIXTURE_NOT_BLOB_PRESERVE');
 assert.equal(await read(f),'opaque-user-value');
});
