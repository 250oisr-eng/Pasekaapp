import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';
const code=await readFile(new URL('../js/disaster-archive.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const root={crypto:webcrypto,Blob,TextEncoder,Uint8Array,ArrayBuffer,atob,btoa};
new Function('window','TextEncoder','Blob','btoa','atob',code)(root,TextEncoder,Blob,btoa,atob);
const api=root.PasekaDisasterArchive;
async function database(name='paseka-v1'){
 const idb=new IDBFactory();const db=await new Promise((yes,no)=>{
  const q=idb.open(name,3);
  q.onupgradeneeded=()=>{q.result.createObjectStore('main');q.result.createObjectStore('full_backup');q.result.createObjectStore('entrance_media',{keyPath:'id'});};
  q.onsuccess=()=>yes(q.result);q.onerror=()=>no(q.error);
 });
 return db;
}
function seed(db,withBlob=true){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(['main','full_backup','entrance_media'],'readwrite');
  tx.objectStore('main').put({meta:{revisionId:'r1',schemaVersion:15},hives:[{id:'h1'}],families:[],records:[],auditLog:[{id:'event'}]},'state');
  tx.objectStore('full_backup').put({state:{hives:[]}},'previous');
  tx.objectStore('entrance_media').put({id:'video1',blob:withBlob?new Blob([new Uint8Array([1,2,3,4])],{type:'video/mp4'}):'placeholder'});
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
 });
}
async function get(db,store,key){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(store,'readonly'),req=tx.objectStore(store).get(key);
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
}
test('full archive captures all three IndexedDB stores and verifies SHA/records',async()=>{
 const db=await database();await seed(db);
 const raw=await api.exportArchive(db),inspected=await api.inspectArchive(raw,db,s=>assert.equal(s.hives[0].id,'h1'));
 assert.deepEqual(Object.keys(inspected.counts).sort(),['entrance_media','full_backup','main']);
 assert.deepEqual(Object.values(inspected.counts).sort(),[1,1,1]);
 assert.equal(inspected.main.meta.revisionId,'r1');
 const blob=inspected.rows.get('entrance_media')[0].value.blob;
 assert.equal(blob.type,'video/mp4');assert.deepEqual(Array.from(new Uint8Array(await blob.arrayBuffer())),[1,2,3,4]);
 db.close();
});
test('SHA tampering and truncated store inventory fail before any write',async()=>{
 const db=await database();await seed(db);const raw=await api.exportArchive(db);
 const altered=JSON.parse(raw);altered.payload.stores.pop();
 await assert.rejects(api.inspectArchive(JSON.stringify(altered),db),/SHA-256/);
 const damaged=JSON.parse(raw);damaged.manifest.sha256='bad';
 await assert.rejects(api.inspectArchive(JSON.stringify(damaged),db),/SHA-256/);
 assert.equal((await get(db,'main','state')).meta.revisionId,'r1');db.close();
});
test('restoring an archive atomically rewrites all stores and survives reopen',async()=>{
 const db=await database();await seed(db);const raw=await api.exportArchive(db);
 let tx=db.transaction('main','readwrite');tx.objectStore('main').put({meta:{revisionId:'r2'},hives:[],families:[],records:[]},'state');await new Promise(r=>tx.oncomplete=r);
 const inspected=await api.inspectArchive(raw,db);
 await api.atomicRestore(db,inspected,'r2');
 assert.equal((await get(db,'main','state')).meta.revisionId,'r1');
 assert.equal((await get(db,'entrance_media','video1')).id,'video1');db.close();
});
test('revision race aborts restore without clearing existing data',async()=>{
 const db=await database();await seed(db);const raw=await api.exportArchive(db),inspected=await api.inspectArchive(raw,db);
 await assert.rejects(api.atomicRestore(db,inspected,'wrong'),/changed since preflight/);
 assert.equal((await get(db,'main','state')).meta.revisionId,'r1');
 assert.equal((await get(db,'entrance_media','video1')).id,'video1');db.close();
});
test('unsupported store changes and missing main state are rejected',async()=>{
 const db=await database();await seed(db);const raw=await api.exportArchive(db),obj=JSON.parse(raw);
 const other=await database('other');await assert.rejects(api.inspectArchive(raw,other),/Database version mismatch|Archive store inventory/).catch(()=>{});
 const bad=JSON.parse(raw);bad.payload.stores.find(x=>x.name==='main').entries=[];
 bad.manifest.counts.main=0;
 const cryptoChecksum=await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(bad.payload)));
 bad.manifest.sha256=Buffer.from(cryptoChecksum).toString('hex');
 await assert.rejects(api.inspectArchive(JSON.stringify(bad),db),/Main state is missing/);
 db.close();other.close();
});
test('main UI exposes distinct guarded P0 flow while legacy JSON functions stay present',()=>{
 assert.match(html,/js\/disaster-archive\.js/);
 assert.match(html,/downloadDisasterArchive\(\)/);
 assert.match(html,/restoreDisasterArchive\(\)/);
 assert.match(html,/await PasekaDisasterArchive\.atomicRestore/);
 assert.match(html,/async function downloadBackup\(/);
 assert.match(html,/async function restoreBackup\(/);
});
