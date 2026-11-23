import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {extractAtomicWriterForDiagnostic} from '../scripts/extract-android-idb-atomic-writer.mjs';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const writerSource=extractAtomicWriterForDiagnostic(html);
const runnerSource=await readFile(new URL('../diagnostics/phone-idb-atomic/runner.js',import.meta.url),'utf8');
const screenSource=await readFile(new URL('../diagnostics/phone-idb-atomic/index.html',import.meta.url),'utf8');

const makeRunner=()=>{
 const factory=new IDBFactory();
 const elements=Object.fromEntries(['run','copy','result'].map(id=>[id,{
   disabled:false,textContent:'',handler:null,addEventListener(name,handler){
     assert.equal(name,'click');this.handler=handler;
   }
 }]));
 let clipboard='';
 const window={Capacitor:{Plugins:{Clipboard:{write:async({string})=>{clipboard=string;}}}}};
 const context={window,
  indexedDB:factory,IDBObjectStore,
  document:{getElementById:id=>elements[id]},
  DOMException,JSON,Error,Number,Object,Array,Date,String,
 };
 runInNewContext(writerSource,context);
 runInNewContext(runnerSource,context);
 return {factory,elements,window,clipboard:()=>clipboard,
   async click(){await elements.run.handler();return JSON.parse(elements.result.textContent);}
 };
};
const open=(factory)=>new Promise((resolve,reject)=>{
 const r=factory.open('paseka-p1-atomic-diagnostic-synthetic-v1',1);
 r.onsuccess=()=>resolve(r.result);
 r.onerror=()=>reject(r.error);
});
const put=(db,value,key)=>new Promise((resolve,reject)=>{
 const tx=db.transaction(['main'],'readwrite');
 tx.objectStore('main').put(value,key);
 tx.oncomplete=resolve;
 tx.onerror=()=>reject(tx.error);
});
const read=(db,key)=>new Promise((resolve,reject)=>{
 const q=db.transaction('main','readonly').objectStore('main').get(key);
 q.onsuccess=()=>resolve(q.result);
 q.onerror=()=>reject(q.error);
});

test('P1 Android diagnostic uses verbatim production atomic writer and refuses unsafe or missing contract',()=>{
 assert.match(writerSource,/function writeMainWithBackup\(/);
 assert.match(writerSource,/mainStore\.put\(state,'state'\)/);
 assert.match(writerSource,/tx\.abort\(\)/);
 assert.match(runnerSource,/QuotaExceededError/);
 assert.match(runnerSource,/P1_ATOMIC_ABORT_MUTATED_FIXTURE_PRESERVE/);
 assert.match(screenSource,/Проверить атомарность/);
 assert.match(screenSource,/Копировать результат/);
 for(const source of [writerSource,runnerSource,screenSource]){
  assert.doesNotMatch(source,/indexedDB\.deleteDatabase\s*\(/);
  assert.doesNotMatch(source,/MediaStore|navigator\.mediaDevices|XMLHttpRequest/);
 }
 assert.throws(()=>extractAtomicWriterForDiagnostic('<html></html>'),
  /P1_WRITER_SOURCE_ANCHOR_INVALID/);
});

test('P1 synthetic quota abort preserves both stores, stale revision fails, retry succeeds twice',async()=>{
 const t=makeRunner();
 for(const expectedCounter of [0,1]){
  const report=await t.click();
  assert.equal(report.status,'PASS',JSON.stringify(report));
  assert.equal(report.code,'SYNTHETIC_QUOTA_ABORT_ATOMIC_RETRY_ONLY');
  assert.equal(report.checks.syntheticFixture.previousCounter,expectedCounter);
  assert.equal(report.checks.syntheticQuotaAfterMainWrite.name,'QuotaExceededError');
  assert.equal(report.checks.abortPreservedMainAndBackup.status,'PASS');
  assert.equal(report.checks.staleRevisionRejected.status,'PASS');
  assert.equal(report.checks.retryAndBackup.nextCounter,expectedCounter+1);
  assert.equal(report.scope.actualAndroidQuota,'NOT_TESTED');
  assert.equal(report.scope.productionDb,'NOT_ACCESSED');
  assert.equal(report.cleanupAuthorized,false);
  assert.equal(report.deleteAllowed,false);
  assert.equal(report.restoreAuthorized,false);
  assert.equal(report.userDataModified,false);
 }
 await t.elements.copy.handler();
 assert.equal(JSON.parse(t.clipboard()).status,'PASS');
 const db=await open(t.factory);
 const main=await read(db,'state');
 assert.equal(main.counter,2);
 db.close();
});

test('P1 Android synthetic test preserves unknown/corrupted fixture instead of silently replacing',async()=>{
 const t=makeRunner();
 assert.equal((await t.click()).status,'PASS');
 const db=await open(t.factory);
 const outsider={diagnosticTag:'UNRECOGNIZED',counter:99,meta:{revisionId:'other'}};
 await put(db,outsider,'state');
 db.close();
 const report=await t.click();
 assert.equal(report.status,'BLOCKED');
 assert.equal(report.code,'P1_UNKNOWN_LOCAL_FIXTURE_PRESERVE');
 assert.equal(report.cleanupAuthorized,false);
 const reopened=await open(t.factory);
 assert.deepEqual(JSON.parse(JSON.stringify(await read(reopened,'state'))),outsider);
 reopened.close();
});
