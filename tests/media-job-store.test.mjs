import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { readFile } from 'node:fs/promises';

const lifecycleSource=await readFile(new URL('../js/media-lifecycle.js',import.meta.url),'utf8');
const storeSource=await readFile(new URL('../js/media-job-store.js',import.meta.url),'utf8');
const scope={};
new Function('window',lifecycleSource)(scope);
new Function('window',storeSource)(scope);
const Media=scope.PasekaMediaJobStore;
const fixedNow=()=> '2026-11-18T10:00:00.000Z';
let sequence=0;

function openDatabase(factory,name,version,onUpgrade){
 return new Promise((resolve,reject)=>{
  const request=factory.open(name,version);
  request.onupgradeneeded=event=>{try{onUpgrade?.(request.result,event)}catch(error){request.transaction.abort();reject(error)}};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
  request.onblocked=()=>reject(new Error('database upgrade blocked'));
 });
}
async function createDb(){
 const factory=new IDBFactory(),name='media-job-test-'+(++sequence);
 const db=await openDatabase(factory,name,1,database=>Media.ensureStore(database));
 return {factory,name,db,repo:Media.createMediaJobStore({db,lifecycle:scope.PasekaMediaLifecycle,now:fixedNow})};
}
const blob=()=>new Blob(['bees-at-entrance'],{type:'image/jpeg'});
const queued=()=>({id:'job-1',kind:'image',blob:blob(),name:'frame.jpg',hiveId:'hive-1',familyId:'family-1',recordId:'record-1',capturedAt:'2026-11-18T09:55:00.000Z'});

test('upgrade creates a dedicated media_jobs store and indexes without touching existing stores',async()=>{
 const factory=new IDBFactory(),name='media-upgrade-'+(++sequence);
 const v3=await openDatabase(factory,name,3,d=>{d.createObjectStore('main');d.createObjectStore('full_backup');d.createObjectStore('entrance_media',{keyPath:'id'});});
 await new Promise((resolve,reject)=>{const tx=v3.transaction(['main','full_backup','entrance_media'],'readwrite');tx.objectStore('main').put({value:'kept'},'state');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
 v3.close();
 const v4=await openDatabase(factory,name,4,d=>Media.ensureStore(d));
 assert.deepEqual([...v4.objectStoreNames].sort(),['entrance_media','full_backup','main','media_jobs']);
 const tx=v4.transaction(['main','media_jobs'],'readonly');
 const existing=await new Promise((resolve,reject)=>{const q=tx.objectStore('main').get('state');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
 assert.deepEqual(existing,{value:'kept'});
 assert.deepEqual([...tx.objectStore('media_jobs').indexNames].sort(),['capturedAt','hiveId','recordId','status']);
 v4.close();
});

test('enqueue stores original Blob and metadata durably across database reopen',async()=>{
 const env=await createDb();
 try{
  const job=await env.repo.enqueue(queued());
  assert.equal(job.status,'queued');assert.equal(job.bytes,blob().size);assert.equal(job.hiveId,'hive-1');
  const before=await env.repo.get('job-1');assert.equal(await before.blob.text(),'bees-at-entrance');
  env.db.close();
  env.db=await openDatabase(env.factory,env.name,1);
  env.repo=Media.createMediaJobStore({db:env.db,lifecycle:scope.PasekaMediaLifecycle,now:fixedNow});
  const after=await env.repo.get('job-1');
  assert.equal(await after.blob.text(),'bees-at-entrance');
  assert.equal(after.status,'queued');
 }finally{env.db.close()}
});

test('enqueue rejects invalid media and duplicate identifiers without overwriting the original',async()=>{
 const env=await createDb();
 try{
  await assert.rejects(env.repo.enqueue({id:'bad',kind:'image',blob:{size:2}}),/Некорректный исходный файл/);
  await env.repo.enqueue(queued());
  await assert.rejects(env.repo.enqueue({...queued(),name:'replacement.jpg'}));
  assert.equal((await env.repo.get('job-1')).name,'frame.jpg');
 }finally{env.db.close()}
});

test('queue status and retry transitions persist without removing the Blob',async()=>{
 const env=await createDb();
 try{
  await env.repo.enqueue(queued());
  await env.repo.transition('job-1','analyzing');
  await env.repo.transition('job-1','failed_retryable',{lastError:'offline'});
  const failed=await env.repo.get('job-1');
  assert.equal(failed.status,'failed_retryable');assert.equal(failed.retryCount,1);
  assert.equal(await failed.blob.text(),'bees-at-entrance');
  await env.repo.transition('job-1','analyzing');
  await env.repo.receiveResult('job-1',{observations:[{label:'bee'}]});
  assert.equal((await env.repo.get('job-1')).status,'result_received');
 }finally{env.db.close()}
});

test('result is persisted only when the caller validator accepts it',async()=>{
 const env=await createDb();
 try{
  await env.repo.enqueue(queued());
  await env.repo.transition('job-1','analyzing');
  await env.repo.receiveResult('job-1',{observations:[{label:'bee'}]});
  await assert.rejects(env.repo.persistResult('job-1',{
   resultId:'result-1',resultValidated:true,validateResult:()=>false
  }));
  const saved=await env.repo.persistResult('job-1',{
   resultId:'result-1',resultValidated:true,validateResult:value=>Array.isArray(value?.observations)&&value.observations.length===1
  });
  assert.equal(saved.status,'result_persisted');
  assert.equal(saved.resultValidated,true);
  assert.equal(saved.resultId,'result-1');
  assert.equal(saved.result.observations[0].label,'bee');
  assert.equal(await saved.blob.text(),'bees-at-entrance');
 }finally{env.db.close()}
});

test('original cannot be removed before result persistence and explicit cleanup scheduling',async()=>{
 const env=await createDb();
 try{
  await env.repo.enqueue(queued());
  await assert.rejects(env.repo.cleanup('job-1'));
  assert.ok(await (await env.repo.get('job-1')).blob);
  await env.repo.transition('job-1','analyzing');
  await env.repo.receiveResult('job-1',{observations:[]});
  await assert.rejects(env.repo.scheduleCleanup('job-1'));
  assert.ok(await (await env.repo.get('job-1')).blob);
 }finally{env.db.close()}
});

test('cleanup removes only the original Blob and keeps the persisted analysis result',async()=>{
 const env=await createDb();
 try{
  await env.repo.enqueue(queued());
  await env.repo.transition('job-1','analyzing');
  await env.repo.receiveResult('job-1',{observations:[{label:'bee'}]});
  await env.repo.persistResult('job-1',{resultId:'result-1',resultValidated:true,validateResult:value=>value?.observations?.length===1});
  await env.repo.scheduleCleanup('job-1');
  const completed=await env.repo.cleanup('job-1');
  assert.equal(completed.status,'completed_deleted');
  assert.equal(Object.hasOwn(completed,'blob'),false);
  assert.deepEqual(completed.result,{observations:[{label:'bee'}]});
  assert.equal(completed.originalDeleted,true);
  assert.equal((await env.repo.cleanup('job-1')).status,'completed_deleted');
 }finally{env.db.close()}
});

test('user retention choice prevents original cleanup',async()=>{
 const env=await createDb();
 try{
  await env.repo.enqueue({...queued(),retainOriginal:true});
  await env.repo.transition('job-1','analyzing');
  await env.repo.receiveResult('job-1',{observations:[]});
  await env.repo.persistResult('job-1',{resultId:'result-1',resultValidated:true,validateResult:value=>Array.isArray(value?.observations)});
  const retained=await env.repo.transition('job-1','completed_retained',{retainOriginal:true});
  assert.equal(retained.status,'completed_retained');
  assert.ok(await retained.blob.text());
  await assert.rejects(env.repo.cleanup('job-1'));
 }finally{env.db.close()}
});

test('cleanup pending jobs can be resumed after reopening the database',async()=>{
 const env=await createDb();
 try{
  await env.repo.enqueue(queued());
  await env.repo.transition('job-1','analyzing');
  await env.repo.receiveResult('job-1',{observations:[]});
  await env.repo.persistResult('job-1',{resultId:'result-1',resultValidated:true,validateResult:value=>Array.isArray(value?.observations)});
  await env.repo.scheduleCleanup('job-1');
  env.db.close();
  env.db=await openDatabase(env.factory,env.name,1);
  env.repo=Media.createMediaJobStore({db:env.db,lifecycle:scope.PasekaMediaLifecycle,now:fixedNow});
  const resumed=await env.repo.resumeCleanup();
  assert.equal(resumed.length,1);
  assert.equal(resumed[0].status,'completed_deleted');
  assert.equal(Object.hasOwn(resumed[0],'blob'),false);
 }finally{env.db.close()}
});

test('list filters by status, hive and journal record',async()=>{
 const env=await createDb();
 try{
  await env.repo.enqueue(queued());
  await env.repo.enqueue({...queued(),id:'job-2',hiveId:'hive-2',recordId:'record-2',capturedAt:'2026-11-18T09:59:00.000Z'});
  assert.equal((await env.repo.list({hiveId:'hive-1'})).length,1);
  assert.equal((await env.repo.list({recordId:'record-2'}))[0].id,'job-2');
  assert.equal((await env.repo.list({status:'queued'})).length,2);
 }finally{env.db.close()}
});


test('application upgrades to IndexedDB v4 and loads lifecycle modules before startup',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.match(html,/indexedDB\.open\(DB,4\)/);
 assert.match(html,/PasekaMediaJobStore\.ensureStore\(d\)/);
 assert.ok(html.indexOf('media-lifecycle.js')<html.indexOf('media-job-store.js'));
 assert.ok(html.indexOf('media-job-store.js')<html.indexOf('entrance-analysis.js'));
 assert.match(sw,/paseka-shell-v314/);
 assert.match(sw,/\.\/js\/media-lifecycle\.js/);
 assert.match(sw,/\.\/js\/media-job-store\.js/);
});
