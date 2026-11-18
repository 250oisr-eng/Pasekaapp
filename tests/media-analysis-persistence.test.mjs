import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { readFile } from 'node:fs/promises';
const [html,lifecycleSource,storeSource,resultSource]=await Promise.all([
 readFile(new URL('../index.html',import.meta.url),'utf8'),
 readFile(new URL('../js/media-lifecycle.js',import.meta.url),'utf8'),
 readFile(new URL('../js/media-job-store.js',import.meta.url),'utf8'),
 readFile(new URL('../js/media-analysis-results.js',import.meta.url),'utf8')
]);
function extract(name){
 const re=new RegExp('(?:async\\s+)?function\\s+'+name+'\\s*\\('),match=re.exec(html);
 assert.ok(match,'missing app function '+name);
 const next=/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;next.lastIndex=match.index+match[0].length;
 const end=next.exec(html);return html.slice(match.index,end?end.index:html.indexOf('</script>',match.index));
}
const scope={};new Function('window',lifecycleSource)(scope);new Function('window',storeSource)(scope);new Function('window',resultSource)(scope);
let dbSequence=0;
async function setup(){
 const factory=new IDBFactory(),request=factory.open('media-persist-'+(++dbSequence),1);
 const db=await new Promise((resolve,reject)=>{request.onupgradeneeded=()=>scope.PasekaMediaJobStore.ensureStore(request.result);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
 const repo=scope.PasekaMediaJobStore.createMediaJobStore({db,lifecycle:scope.PasekaMediaLifecycle,now:()=> '2026-11-18T10:00:00.000Z'});
 await repo.enqueue({id:'job-1',kind:'image',blob:new Blob(['original-frame'],{type:'image/jpeg'}),name:'frame.jpg',hiveId:'hive-1',familyId:'family-1',recordId:'record-1',capturedAt:'2026-11-18T09:55:00.000Z'});
 await repo.transition('job-1','analyzing');await repo.receiveResult('job-1',{observations:[{label:'bee',count:2}]});
 return {db,repo};
}
function makePersist(deps){return new Function('deps','with(deps){return ('+extract('persistMediaAnalysisResult')+');}')(deps)}
test('app persistence stores result in S before marking the media job persisted and retains the original Blob',async()=>{
 const env=await setup();try{
  let saves=0,durable=null;
  const deps={db:env.db,S:{meta:{},mediaAnalysisResults:[]},PasekaMediaJobStore:scope.PasekaMediaJobStore,PasekaMediaLifecycle:scope.PasekaMediaLifecycle,PasekaMediaAnalysisResults:scope.PasekaMediaAnalysisResults,save:async()=>{saves++;durable=structuredClone(deps.S);return true},render:()=>{}};
  const persist=makePersist(deps),job=await persist('job-1');
  assert.equal(job.status,'result_persisted');assert.equal(job.resultId,'media-result:job-1');
  assert.equal(deps.S.mediaAnalysisResults.length,1);assert.deepEqual(durable.mediaAnalysisResults,deps.S.mediaAnalysisResults);
  assert.equal(deps.S.mediaAnalysisResults[0].originalRef,'media-job:job-1');assert.equal(await (await env.repo.get('job-1')).blob.text(),'original-frame');
  await persist('job-1');assert.equal(deps.S.mediaAnalysisResults.length,1,'retry must not duplicate the result');assert.equal(saves,2);
 }finally{env.db.close()}
});
test('failed state persistence rolls back the result register and leaves the media job retryable',async()=>{
 const env=await setup();try{
  const original={meta:{},mediaAnalysisResults:[]};
  const deps={db:env.db,S:original,PasekaMediaJobStore:scope.PasekaMediaJobStore,PasekaMediaLifecycle:scope.PasekaMediaLifecycle,PasekaMediaAnalysisResults:scope.PasekaMediaAnalysisResults,save:async()=>false,render:()=>{}};
  await assert.rejects(makePersist(deps)('job-1'),/Не удалось сохранить результат анализа/);
  assert.deepEqual(deps.S.mediaAnalysisResults,[]);assert.equal((await env.repo.get('job-1')).status,'result_received');
 }finally{env.db.close()}
});
test('save exception rolls back in-memory result changes without changing the media job',async()=>{
 const env=await setup();try{
  const original={meta:{},mediaAnalysisResults:[]},failure=new Error('storage exception');
  const deps={db:env.db,S:original,PasekaMediaJobStore:scope.PasekaMediaJobStore,PasekaMediaLifecycle:scope.PasekaMediaLifecycle,PasekaMediaAnalysisResults:scope.PasekaMediaAnalysisResults,save:async()=>{throw failure},render:()=>{}};
  await assert.rejects(makePersist(deps)('job-1'),error=>error===failure);
  assert.deepEqual(deps.S.mediaAnalysisResults,[]);assert.equal((await env.repo.get('job-1')).status,'result_received');
 }finally{env.db.close()}
});
