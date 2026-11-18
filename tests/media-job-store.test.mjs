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

test('video capture metadata is validated and survives database reopen',async()=>{
 const env=await createDb();
 try{
  const job=await env.repo.enqueue({...queued(),id:'video-1',kind:'video',name:'entrance.mp4',
   blob:new Blob(['entrance-video'],{type:'video/mp4'}),mimeType:'video/mp4',
   captureMetadata:{durationSec:60,width:1920,height:1080,frameQualityStatus:'good'}});
  assert.deepEqual(job.captureMetadata,{durationSec:60,width:1920,height:1080,frameQualityStatus:'good'});
  env.db.close();env.db=await openDatabase(env.factory,env.name,1);
  env.repo=Media.createMediaJobStore({db:env.db,lifecycle:scope.PasekaMediaLifecycle,now:fixedNow});
  const restored=await env.repo.get('video-1');
  assert.deepEqual(restored.captureMetadata,job.captureMetadata);
  assert.equal(await restored.blob.text(),'entrance-video');
 }finally{env.db.close()}
});
test('capture metadata rejects invalid dimensions, duration and quality status',async()=>{
 const env=await createDb();
 try{
  await assert.rejects(env.repo.enqueue({...queued(),captureMetadata:{width:0,height:1080}}),/разрешение/);
  await assert.rejects(env.repo.enqueue({...queued(),id:'bad-duration',captureMetadata:{durationSec:0}}),/длительность/);
  await assert.rejects(env.repo.enqueue({...queued(),id:'bad-quality',captureMetadata:{frameQualityStatus:'excellent'}}),/качества/);
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
 assert.ok(html.indexOf('media-job-store.js')<html.indexOf('media-ai-client.js'));
 assert.ok(html.indexOf('media-ai-client.js')<html.indexOf('entrance-analysis.js'));
 assert.match(sw,/\.\/js\/media-ai-client\.js/);
 assert.match(sw,/paseka-shell-v320/);
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


test('analysis lease is atomic across tabs and blocks a second concurrent claimant',async()=>{
 const env=await createDb();
 env.repo=Media.createMediaJobStore({db:env.db,lifecycle:scope.PasekaMediaLifecycle,now:()=>new Date().toISOString()});
 try{
  await env.repo.enqueue(queued());
  const claimed=await env.repo.claimForAnalysis('job-1',{ownerId:'tab-a',leaseMs:300000});
  assert.equal(claimed.status,'analyzing');
  assert.equal(claimed.analysisOwner,'tab-a');
  assert.ok(Date.parse(claimed.analysisLeaseUntil)>Date.now());
  await assert.rejects(env.repo.claimForAnalysis('job-1',{ownerId:'tab-b',leaseMs:300000}),/другой вкладке/);
  const current=await env.repo.get('job-1');
  assert.equal(current.analysisOwner,'tab-a');
  assert.equal(await current.blob.text(),'bees-at-entrance');
 }finally{env.db.close()}
});

test('expired analysis leases recover to retryable and can be claimed again',async()=>{
 const env=await createDb();
 env.repo=Media.createMediaJobStore({db:env.db,lifecycle:scope.PasekaMediaLifecycle,now:()=>new Date().toISOString()});
 try{
  await env.repo.enqueue(queued());
  const tx=env.db.transaction('media_jobs','readwrite'),store=tx.objectStore('media_jobs'),request=store.get('job-1');
  request.onsuccess=()=>store.put({...request.result,status:'analyzing',analysisOwner:'old-tab',analysisLeaseUntil:new Date(Date.now()-1000).toISOString()});
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});
  assert.deepEqual(await env.repo.recoverExpiredAnalyses(),['job-1']);
  const recovered=await env.repo.get('job-1');
  assert.equal(recovered.status,'failed_retryable');
  assert.equal(recovered.analysisOwner,undefined);
  assert.equal(recovered.analysisLeaseUntil,undefined);
  const claimed=await env.repo.claimForAnalysis('job-1',{ownerId:'new-tab',leaseMs:300000});
  assert.equal(claimed.status,'analyzing');
  assert.equal(claimed.analysisOwner,'new-tab');
 }finally{env.db.close()}
});

test('legacy entrance videos move atomically into media_jobs with Blob and provenance preserved',async()=>{
 const factory=new IDBFactory(),name='legacy-media-migration-'+(++sequence);
 const db=await openDatabase(factory,name,4,database=>{
  database.createObjectStore('full_backup');
  database.createObjectStore('entrance_media',{keyPath:'id'});
  Media.ensureStore(database);
 });
 const sourceBlob=new Blob(['legacy-entrance-video-bytes'],{type:'video/mp4'});
 const source={
  id:'legacy-1',hiveId:'hive-1',capturedAt:'2026-11-17T08:30:00.000Z',
  queueCreatedAt:'2026-11-17T08:31:00.000Z',durationSec:42,width:1280,height:720,
  bytes:sourceBlob.size,mimeType:'video/mp4',name:'entrance.mp4',status:'waiting_for_server',
  retryCount:2,metadataCheck:{ok:true,warnings:[]},frameQualityCheck:{status:'good',score:0.91},blob:sourceBlob
 };
 await new Promise((resolve,reject)=>{
  const tx=db.transaction('entrance_media','readwrite');tx.objectStore('entrance_media').add(source);
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('seed aborted'));
 });
 const repo=Media.createMediaJobStore({db,lifecycle:scope.PasekaMediaLifecycle,now:fixedNow});
 const result=await repo.migrateLegacyEntranceVideos();
 assert.equal(result.migrated,1);assert.equal(result.skippedCount,0);
 const job=await repo.get('legacy-entrance-legacy-1');
 assert.equal(job.kind,'video');assert.equal(job.status,'queued');assert.equal(job.retainOriginal,true);
 assert.equal(job.hiveId,'hive-1');assert.equal(job.capturedAt,source.capturedAt);
 assert.equal(job.captureMetadata.durationSec,42);assert.equal(job.captureMetadata.width,1280);
 assert.equal(job.captureMetadata.height,720);assert.equal(job.captureMetadata.frameQualityStatus,'good');
 assert.equal(job.legacySourceId,'legacy-1');assert.equal(job.legacyMetadata.metadataCheck.ok,true);
 assert.deepEqual([...new Uint8Array(await job.blob.arrayBuffer())],[...new Uint8Array(await sourceBlob.arrayBuffer())]);
 const remaining=await new Promise((resolve,reject)=>{
  const tx=db.transaction('entrance_media','readonly'),q=tx.objectStore('entrance_media').getAll();
  q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
 });
 assert.equal(remaining.length,0);
 const repeated=await repo.migrateLegacyEntranceVideos();
 assert.equal(repeated.migrated,0);assert.equal(repeated.skippedCount,0);
 db.close();
});

test('legacy media migration leaves malformed records and colliding jobs untouched',async()=>{
 const factory=new IDBFactory(),name='legacy-media-safety-'+(++sequence);
 const db=await openDatabase(factory,name,4,database=>{
  database.createObjectStore('full_backup');
  database.createObjectStore('entrance_media',{keyPath:'id'});
  Media.ensureStore(database);
 });
 const goodBlob=new Blob(['legacy'],{type:'video/mp4'});
 await new Promise((resolve,reject)=>{
  const tx=db.transaction(['entrance_media','media_jobs'],'readwrite');
  tx.objectStore('entrance_media').add({id:'bad-date',hiveId:'hive-1',capturedAt:'not-a-date',blob:goodBlob});
  tx.objectStore('entrance_media').add({id:'collision',hiveId:'hive-1',capturedAt:'2026-11-17T08:30:00.000Z',blob:goodBlob});
  tx.objectStore('media_jobs').add({id:'legacy-entrance-collision',kind:'video',status:'queued',blob:goodBlob});
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
 });
 const repo=Media.createMediaJobStore({db,lifecycle:scope.PasekaMediaLifecycle,now:fixedNow});
 const result=await repo.migrateLegacyEntranceVideos();
 assert.equal(result.migrated,0);assert.equal(result.skippedCount,2);
 const remaining=await new Promise((resolve,reject)=>{
  const tx=db.transaction('entrance_media','readonly'),q=tx.objectStore('entrance_media').getAll();
  q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
 });
 assert.deepEqual(remaining.map(row=>row.id).sort(),['bad-date','collision']);
 db.close();
});
