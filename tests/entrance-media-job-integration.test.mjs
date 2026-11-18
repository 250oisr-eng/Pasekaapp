import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { readFile } from 'node:fs/promises';

const [html,lifecycleSource,storeSource]=await Promise.all([
 readFile(new URL('../index.html',import.meta.url),'utf8'),
 readFile(new URL('../js/media-lifecycle.js',import.meta.url),'utf8'),
 readFile(new URL('../js/media-job-store.js',import.meta.url),'utf8')
]);
function extract(name){
 const re=new RegExp('(?:async\\s+)?function\\s+'+name+'\\s*\\('),match=re.exec(html);
 assert.ok(match,'missing app function '+name);
 const next=/\\n(?:async\\s+)?function\\s+[A-Za-z_$][\\w$]*\\s*\\(/g;next.lastIndex=match.index+match[0].length;
 const end=next.exec(html);return html.slice(match.index,end?end.index:html.indexOf('</script>',match.index));
}
const scope={};new Function('window',lifecycleSource)(scope);new Function('window',storeSource)(scope);
function loadFunction(name,deps={}){deps.PasekaMediaJobStore||=scope.PasekaMediaJobStore;deps.PasekaMediaLifecycle||=scope.PasekaMediaLifecycle;return new Function('deps','with(deps){return ('+extract(name)+');}')(deps)}
let seq=0;
async function setup(){
 const request=new IDBFactory().open('entrance-media-'+(++seq),4);
 const db=await new Promise((resolve,reject)=>{
  request.onupgradeneeded=()=>{const d=request.result;d.createObjectStore('main');d.createObjectStore('full_backup');d.createObjectStore('entrance_media',{keyPath:'id'});scope.PasekaMediaJobStore.ensureStore(d)};
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
 const tx=db.transaction('entrance_media','readwrite');
 tx.objectStore('entrance_media').put({id:'legacy-video',hiveId:'hive-1',capturedAt:'2026-11-17T10:00:00.000Z',durationSec:45,width:1280,height:720,bytes:12,status:'waiting_for_server',blob:new Blob(['legacy'])});
 await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
 const repo=scope.PasekaMediaJobStore.createMediaJobStore({db,lifecycle:scope.PasekaMediaLifecycle,now:()=> '2026-11-18T10:00:00.000Z'});
 await repo.enqueue({id:'new-video',kind:'video',blob:new Blob(['new-original'],{type:'video/mp4'}),hiveId:'hive-1',capturedAt:'2026-11-18T09:00:00.000Z',metadata:{durationSec:61,width:1920,height:1080,frameQualityCheck:{status:'good'}}});
 return {db,repo};
}
test('entrance video screen lists and previews legacy and new media_jobs videos without moving old records',async()=>{
 const {db,repo}=await setup();
 try{
  const deps={db},list=loadFunction('listEntranceVideos',deps),get=loadFunction('getEntranceVideo',deps);
  const rows=await list();
  assert.deepEqual(rows.map(x=>x.id),['new-video','legacy-video']);
  assert.equal(rows[0].sourceStore,'media_jobs');assert.equal(rows[0].durationSec,61);assert.equal(rows[0].width,1920);
  assert.equal(rows[1].sourceStore,'entrance_media');
  const fresh=await get('new-video');assert.equal(fresh.sourceStore,'media_jobs');assert.equal(await fresh.blob.text(),'new-original');
  const legacy=await get('legacy-video');assert.equal(legacy.sourceStore,'entrance_media');assert.equal(await legacy.blob.text(),'legacy');
  assert.equal((await repo.list()).length,1,'legacy records must not be migrated or rewritten');
 }finally{db.close()}
});
test('entrance screen refuses legacy delete action for a media_jobs original',async()=>{
 const {db}=await setup();
 try{
  let message='';const deps={db,confirm:()=>true,alert:value=>{message=value},refreshEntranceVideos:async()=>{}};
  await loadFunction('removeEntranceVideo',deps)('new-video');
  assert.match(message,/защищённой временной очереди/);
  assert.equal(await (await loadFunction('getEntranceVideo',{db})('new-video')).blob.text(),'new-original');
 }finally{db.close()}
});
