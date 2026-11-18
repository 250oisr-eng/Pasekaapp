import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { readFile } from 'node:fs/promises';

const lifecycleSource=await readFile(new URL('../js/media-lifecycle.js',import.meta.url),'utf8');
const storeSource=await readFile(new URL('../js/media-job-store.js',import.meta.url),'utf8');
const resultsSource=await readFile(new URL('../js/media-analysis-results.js',import.meta.url),'utf8');
const scope={};
new Function('window',lifecycleSource)(scope);
new Function('window',storeSource)(scope);
new Function('window',resultsSource)(scope);
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
 const db=await openDatabase(factory,name,1,database=>{database.createObjectStore('full_backup');Media.ensureStore(database)});
 return {factory,name,db,repo:Media.createMediaJobStore({db,lifecycle:scope.PasekaMediaLifecycle,now:fixedNow})};
}
const blob=()=>new Blob(['bees-at-entrance'],{type:'image/jpeg'});
const queued=()=>({id:'job-1',kind:'image',blob:blob(),name:'frame.jpg',hiveId:'hive-1',familyId:'family-1',recordId:'record-1',capturedAt:'2026-11-18T09:55:00.000Z'});

test('upgrade creates a dedicated media_jobs store and indexes without touching existing stores',async()=>{
 const factory=new IDBFactory(),name='media-upgrade-'+(++sequence);
 const v3=await openDatabase(factory,name,3,d=>{d.createObjectStore('main');d.createObjectStore('full_backup');d.createObjectStore('entrance_media',{keyPath:'id'});});
 await new Promise((resolve,reject)=>{const tx=v3.transaction(['main','full_backup','entrance_media'],'readwrite');tx.objectStore('main').put({value:'kept'},'state');tx.objectStore('entrance_media').put({id:'legacy-video',blob:new Blob(['legacy-video']),status:'waiting_for_server'});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
 v3.close();
 const v4=await openDatabase(factory,name,4,d=>Media.ensureStore(d));
 assert.deepEqual([...v4.objectStoreNames].sort(),['entrance_media','full_backup','main','media_jobs']);
 const tx=v4.transaction(['main','media_jobs','entrance_media'],'readonly');
 const existing=await new Promise((resolve,reject)=>{const q=tx.objectStore('main').get('state');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
 assert.deepEqual(existing,{value:'kept'});
 const legacyRequest=tx.objectStore('entrance_media').get('legacy-video');
 const legacy=await new Promise((resolve,reject)=>{legacyRequest.onsuccess=()=>resolve(legacyRequest.result);legacyRequest.onerror=()=>reject(legacyRequest.error)});
 assert.equal(await legacy.blob.text(),'legacy-video','v3 entrance media must remain byte-for-byte available after upgrade');
 assert.deepEqual([...tx.objectStore('media_jobs').indexNames].sort(),['capturedAt','hiveId','recordId','status']);
 v4.close();
});

test('enqueue stores original Blob and metadata durably across database reopen',async()=>{
 const env=await createDb();
 try{
  const job=await env.repo.enqueue(queued());
  assert.equal(job.status,'queued');assert.equal(job.bytes,blob().size);assert.equal(job.hiveId,'hive-1');assert.equal(job.retainOriginal,true,'originals are retained unless the user explicitly opts out');
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
   resultId:'result-1',validateResult:()=>false
  }));
  const saved=await env.repo.persistResult('job-1',{
   resultId:'result-1',validateResult:value=>Array.isArray(value?.observations)&&value.observations.length===1
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
  await env.repo.enqueue({...queued(),retainOriginal:false});
  await env.repo.transition('job-1','analyzing');
  await env.repo.receiveResult('job-1',{observations:[{label:'bee'}]});
  await env.repo.persistResult('job-1',{resultId:'result-1',validateResult:value=>value?.observations?.length===1});
  await assert.rejects(env.repo.scheduleCleanup('job-1'));
  const backupRecord={state:{meta:{revisionId:'backup-revision-1'},mediaAnalysisResults:[{
   id:'result-1',jobId:'job-1',result:{observations:[{label:'bee'}]}
  }]}};
  const seed=env.db.transaction('full_backup','readwrite');seed.objectStore('full_backup').put(backupRecord,'previous');
  await new Promise((resolve,reject)=>{seed.oncomplete=resolve;seed.onerror=()=>reject(seed.error);seed.onabort=()=>reject(seed.error)});
  await assert.rejects(env.repo.confirmResultBackup('job-1',{
   backupRevisionId:'backup-revision-1',verifyBackup:async()=>false
  }),/не подтверждён/);
  const proof=await env.repo.confirmResultBackup('job-1',{
   backupRevisionId:'backup-revision-1',
   verifyBackup:({job,backupRecord:archive})=>job.resultId==='result-1'&&
    archive.state.mediaAnalysisResults.some(row=>row.jobId===job.id&&row.id===job.resultId&&
     JSON.stringify(row.result)===JSON.stringify(job.result))
  });
  assert.equal(proof.resultBackupRevisionId,'backup-revision-1');
  assert.ok(proof.resultBackupVerifiedAt);
  await env.repo.scheduleCleanup('job-1');
  const overwrite=env.db.transaction('full_backup','readwrite');
  overwrite.objectStore('full_backup').put({state:{meta:{revisionId:'newer-backup'}}},'previous');
  await new Promise((resolve,reject)=>{overwrite.oncomplete=resolve;overwrite.onerror=()=>reject(overwrite.error);overwrite.onabort=()=>reject(overwrite.error)});
  await assert.rejects(env.repo.cleanup('job-1',{verifyBackup:()=>true}),/больше не доступна/);
  assert.ok(await (await env.repo.get('job-1')).blob,'the original must survive if the verified backup was replaced');
  const restore=env.db.transaction('full_backup','readwrite');restore.objectStore('full_backup').put(backupRecord,'previous');
  await new Promise((resolve,reject)=>{restore.oncomplete=resolve;restore.onerror=()=>reject(restore.error);restore.onabort=()=>reject(restore.error)});
  const verifyBackup=({job,backupRecord:archive})=>archive.state.mediaAnalysisResults.some(row=>
   row.jobId===job.id&&row.id===job.resultId&&JSON.stringify(row.result)===JSON.stringify(job.result));
  const completed=await env.repo.cleanup('job-1',{verifyBackup});
  assert.equal(completed.status,'completed_deleted');
  assert.equal(Object.hasOwn(completed,'blob'),false);
  assert.deepEqual(completed.result,{observations:[{label:'bee'}]});
  assert.equal(completed.originalDeleted,true);
  assert.equal((await env.repo.cleanup('job-1')).status,'completed_deleted');
 }finally{env.db.close()}
});

test('backup result is reverified in the final IndexedDB transaction even if revision ID is unchanged',async()=>{
 const env=await createDb();
 const put=async value=>{
  const tx=env.db.transaction('full_backup','readwrite');
  tx.objectStore('full_backup').put(value,'previous');
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});
 };
 try{
  await env.repo.enqueue({...queued(),retainOriginal:false});
  await env.repo.transition('job-1','analyzing');
  await env.repo.receiveResult('job-1',{observations:[{label:'bee'}]});
  await env.repo.persistResult('job-1',{resultId:'result-1',validateResult:value=>Array.isArray(value?.observations)});
  const valid={state:{meta:{revisionId:'stable-revision'},mediaAnalysisResults:[{
   id:'result-1',jobId:'job-1',kind:'image',hiveId:'hive-1',familyId:'family-1',recordId:'record-1',
   capturedAt:'2026-11-18T09:55:00.000Z',originalRef:'media-job:job-1',
   result:{observations:[{label:'bee'}]},createdAt:'2026-11-18T10:00:00.000Z'
  }]}};
  await put(valid);
  const replaceWithMissingResult=async()=>{
   await put({state:{meta:{revisionId:'stable-revision'},mediaAnalysisResults:[]}});
   return true;
  };
  await assert.rejects(env.repo.confirmResultBackup('job-1',{
   backupRevisionId:'stable-revision',verifyBackup:replaceWithMissingResult
  }));
  assert.ok((await env.repo.get('job-1')).blob,'confirmation race must not alter original');
  await put(valid);
  await env.repo.confirmResultBackup('job-1',{
   backupRevisionId:'stable-revision',
   verifyBackup:({job,backupRecord})=>scope.PasekaMediaAnalysisResults.verifyBackup({
    job,backupRecord,backupRevisionId:'stable-revision'
   })
  });
  await env.repo.scheduleCleanup('job-1');
  await assert.rejects(env.repo.cleanup('job-1',{verifyBackup:replaceWithMissingResult}));
  assert.ok((await env.repo.get('job-1')).blob,'cleanup race must not delete original');
  await put(valid);
  const cleaned=await env.repo.cleanup('job-1',{verifyBackup:({job,backupRecord})=>
   backupRecord.state.mediaAnalysisResults.some(row=>row.id===job.resultId&&row.jobId===job.id&&
    JSON.stringify(row.result)===JSON.stringify(job.result))});
  assert.equal(cleaned.status,'completed_deleted');
  assert.equal(Object.hasOwn(cleaned,'blob'),false);
 }finally{env.db.close()}
});

test('user retention choice prevents original cleanup',async()=>{
 const env=await createDb();
 try{
  await env.repo.enqueue({...queued(),retainOriginal:true});
  await env.repo.transition('job-1','analyzing');
  await env.repo.receiveResult('job-1',{observations:[]});
  await env.repo.persistResult('job-1',{resultId:'result-1',validateResult:value=>Array.isArray(value?.observations)});
  const retained=await env.repo.transition('job-1','completed_retained',{retainOriginal:true});
  assert.equal(retained.status,'completed_retained');
  assert.ok(await retained.blob.text());
  await assert.rejects(env.repo.cleanup('job-1'));
 }finally{env.db.close()}
});

test('cleanup pending jobs can be resumed after reopening the database',async()=>{
 const env=await createDb();
 try{
  await env.repo.enqueue({...queued(),retainOriginal:false});
  await env.repo.transition('job-1','analyzing');
  await env.repo.receiveResult('job-1',{observations:[]});
  await env.repo.persistResult('job-1',{resultId:'result-1',validateResult:value=>Array.isArray(value?.observations)});
  const backupRecord={state:{meta:{revisionId:'backup-revision-1'},mediaAnalysisResults:[{
   id:'result-1',jobId:'job-1',result:{observations:[]}
  }]}};
  const seed=env.db.transaction('full_backup','readwrite');seed.objectStore('full_backup').put(backupRecord,'previous');
  await new Promise((resolve,reject)=>{seed.oncomplete=resolve;seed.onerror=()=>reject(seed.error);seed.onabort=()=>reject(seed.error)});
  await env.repo.confirmResultBackup('job-1',{backupRevisionId:'backup-revision-1',verifyBackup:()=>true});
  await env.repo.scheduleCleanup('job-1');
  env.db.close();
  env.db=await openDatabase(env.factory,env.name,1);
  env.repo=Media.createMediaJobStore({db:env.db,lifecycle:scope.PasekaMediaLifecycle,now:fixedNow});
  const resumed=await env.repo.resumeCleanup({verifyBackup:({job,backupRecord:archive})=>
   archive.state.mediaAnalysisResults.some(row=>row.jobId===job.id&&row.id===job.resultId&&
    JSON.stringify(row.result)===JSON.stringify(job.result))});
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
 assert.match(sw,/paseka-shell-v315/);
 assert.match(sw,/\.\/js\/media-lifecycle\.js/);
 assert.match(sw,/\.\/js\/media-job-store\.js/);
});


test('public status transitions cannot overwrite or clear original Blob references',async()=>{
 const env=await createDb();
 try{
  await env.repo.enqueue(queued());
  await env.repo.transition('job-1','analyzing',{blob:null,originalRef:null,kind:'video',bytes:0});
  const current=await env.repo.get('job-1');
  assert.equal(current.kind,'image');
  assert.equal(current.bytes,blob().size);
  assert.equal(current.originalRef,'media-job:job-1');
  assert.equal(await current.blob.text(),'bees-at-entrance');
 }finally{env.db.close()}
});

test('media job preserves JSON metadata used by the local capture screen',async()=>{
 const env=await createDb();
 try{
  const metadata={durationSec:61.5,width:1920,height:1080,frameQualityCheck:{status:'good',sampleCount:5}};
  const job=await env.repo.enqueue({...queued(),kind:'video',metadata});
  assert.deepEqual(job.metadata,metadata);
  const loaded=await env.repo.get('job-1');assert.deepEqual(loaded.metadata,metadata);
  assert.equal(await loaded.blob.text(),'bees-at-entrance');
  await assert.rejects(env.repo.enqueue({...queued(),id:'bad-metadata',metadata:[]}),/Метаданные медиа должны быть объектом/);
 }finally{env.db.close()}
});

test('original retention defaults to true and opting out after persistence requires verified backup evidence',async()=>{
 const env=await createDb();
 try{
  const job=await env.repo.enqueue(queued());assert.equal(job.retainOriginal,true);
  await env.repo.transition('job-1','analyzing');await env.repo.receiveResult('job-1',{observations:[]});
  await env.repo.persistResult('job-1',{resultId:'result-1',validateResult:value=>Array.isArray(value?.observations)});
  await assert.rejects(env.repo.setRetainOriginal('job-1',false),/подтверждения резервной копии/);
  const backup={state:{meta:{revisionId:'backup-revision-1'}}},tx=env.db.transaction('full_backup','readwrite');tx.objectStore('full_backup').put(backup,'previous');
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
  await env.repo.confirmResultBackup('job-1',{backupRevisionId:'backup-revision-1',verifyBackup:()=>true});
  const optedOut=await env.repo.setRetainOriginal('job-1',false);assert.equal(optedOut.retainOriginal,false);
  const pending=await env.repo.scheduleCleanup('job-1');assert.equal(pending.status,'cleanup_pending');
 }finally{env.db.close()}
});
