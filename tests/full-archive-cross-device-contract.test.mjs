import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';
const root={crypto:webcrypto,Blob,TextEncoder,Uint8Array,ArrayBuffer,atob,btoa};
new Function('window','TextEncoder','Blob','btoa','atob',readFileSync(new URL('../js/disaster-archive.js',import.meta.url),'utf8'))(root,TextEncoder,Blob,btoa,atob);
const archive=root.PasekaDisasterArchive;
async function open(factory){
 return new Promise((resolve,reject)=>{
  const q=factory.open('paseka-v1',3);
  q.onupgradeneeded=()=>{q.result.createObjectStore('main');q.result.createObjectStore('full_backup');q.result.createObjectStore('entrance_media',{keyPath:'id'})};
  q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
 });
}
async function seed(db,revision,payload){
 const transaction=db.transaction(['main','full_backup','entrance_media'],'readwrite');
 transaction.objectStore('main').put({meta:{revisionId:revision,schemaVersion:15},hives:[{id:'demo'}],families:[],records:[],sectionalSeasonCycles:[{id:'cycle',status:'CLOSED',events:[]}]},'state');
 transaction.objectStore('full_backup').put({state:{meta:{revisionId:'backup:'+revision}}},'previous');
 transaction.objectStore('entrance_media').put({id:'original-video',blob:new Blob([Uint8Array.from(payload)],{type:'video/mp4'})});
 await new Promise((resolve,reject)=>{transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error)});
}
async function get(db,store,key){
 const q=db.transaction([store],'readonly').objectStore(store).get(key);
 return new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
}
test('full original media archive can migrate between independent IndexedDB factories without altering source',async()=>{
 // Two wholly separate IDBFactory instances represent different origins/devices in this isolated contract test.
 const sourceFactory=new IDBFactory(),targetFactory=new IDBFactory();
 const source=await open(sourceFactory),target=await open(targetFactory);
 const bytes=[0,0,0,24,102,116,121,112,105,115,111,109,222,255,0,91];
 await seed(source,'from-device',bytes);await seed(target,'old-other-device',[13,12,11]);
 const raw=await archive.exportArchive(source);
 const inspected=await archive.inspectArchive(raw,target,s=>assert.equal(s.meta.revisionId,'from-device'));
 assert.equal(inspected.rows.get('entrance_media').length,1);
 await archive.atomicRestore(target,inspected,'old-other-device');
 target.close();
 const reopened=await open(targetFactory);
 const restored=await get(reopened,'entrance_media','original-video');
 assert.deepEqual(Array.from(new Uint8Array(await restored.blob.arrayBuffer())),bytes);
 assert.equal((await get(reopened,'main','state')).meta.revisionId,'from-device');
 const exported=await archive.exportArchive(reopened);
 const checked=await archive.inspectArchive(exported,reopened);
 const sourceChecked=await archive.inspectArchive(raw,source);
 assert.equal(checked.sha256,sourceChecked.sha256);
 assert.deepEqual(checked.counts,sourceChecked.counts);
 assert.equal((await get(source,'main','state')).meta.revisionId,'from-device');
 source.close();reopened.close();
});
test('foreign destination revision race rejects multi-store restore and preserves original media',async()=>{
 const source=await open(new IDBFactory()),dest=await open(new IDBFactory());
 await seed(source,'source',[1,255,2]);await seed(dest,'destination',[3,4,5]);
 const raw=await archive.exportArchive(source),plan=await archive.inspectArchive(raw,dest);
 await assert.rejects(archive.atomicRestore(dest,plan,'stale'),/Database changed/);
 const original=await get(dest,'entrance_media','original-video');
 assert.deepEqual(Array.from(new Uint8Array(await original.blob.arrayBuffer())),[3,4,5]);
 assert.equal((await get(dest,'main','state')).meta.revisionId,'destination');
 source.close();dest.close();
});
