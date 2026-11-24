import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {IDBFactory} from 'fake-indexeddb';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('function openDB(){');
const end=html.indexOf('\nfunction readMain(){',start);
assert.ok(start>=0&&end>start,'real production openDB must be inspectable');
const source=html.slice(start,end);
const REQUIRED=['entrance_media','full_backup','main'];

function applicationOpen(factory,name){
 const deps={indexedDB:factory,DB:name,STORE:'main',BACKUP_STORE:'full_backup',
   db:null,isFreshDatabaseUpgrade:old=>old===0};
 const open=new Function('deps','with(deps){return ('+source+');}')(deps);
 return {open,deps};
}
function rawOpen(factory,name,version,upgrade){
 return new Promise((resolve,reject)=>{
  const request=factory.open(name,version);
  request.onupgradeneeded=()=>upgrade?.(request.result,request.transaction);
  request.onerror=()=>reject(request.error);
  request.onsuccess=()=>resolve(request.result);
 });
}
function settled(transaction){
 return new Promise((resolve,reject)=>{
  transaction.oncomplete=()=>resolve();
  transaction.onabort=()=>reject(transaction.error||new Error('transaction aborted'));
  transaction.onerror=()=>reject(transaction.error||new Error('transaction error'));
 });
}
function idbGet(db,store,key){
 return new Promise((resolve,reject)=>{
  const q=db.transaction(store,'readonly').objectStore(store).get(key);
  q.onsuccess=()=>resolve(q.result);
  q.onerror=()=>reject(q.error);
 });
}
async function seedLegacy(factory,name,version){
 const originalBytes=new Uint8Array([0,1,2,3,127,254,255]);
 const legacy=await rawOpen(factory,name,version,(db)=>{
  db.createObjectStore('main');
  if(version===2)db.createObjectStore('full_backup');
 });
 const record={meta:{schemaVersion:1,revisionId:'legacy-read-only'},hives:[{id:'h1',number:1}],
   families:[],records:[{id:'r1',date:'2026-01-01',text:'Legacy evidence'}],
   originalBytes:originalBytes.buffer,
   originalVideo:new Blob([originalBytes],{type:'video/mp4'})};
 const stores=version===2?['main','full_backup']:['main'];
 const tx=legacy.transaction(stores,'readwrite');
 const done=settled(tx);
 tx.objectStore('main').put(record,'state');
 if(version===2)tx.objectStore('full_backup').put({at:'2026-01-01',state:{meta:{schemaVersion:1,revisionId:'backup'}}},'2026-01-01');
 await done;
 legacy.close();
 return {originalBytes,record};
}
for(const version of [1,2]){
 test('B09 real IndexedDB v'+version+' upgrades to v3 without changing legacy state and media bytes',async()=>{
  const factory=new IDBFactory(),name='b09-legacy-'+version;
  const {originalBytes}=await seedLegacy(factory,name,version);
  const {open,deps}=applicationOpen(factory,name);
  assert.equal(await open(),false,'an existing old database must never be treated as new/empty');
  assert.equal(deps.db.version,3);
  assert.deepEqual(Array.from(deps.db.objectStoreNames),REQUIRED);
  const restored=await idbGet(deps.db,'main','state');
  assert.equal(restored.meta.revisionId,'legacy-read-only');
  assert.equal(restored.meta.schemaVersion,1,'opening IDB must not silently migrate app state');
  assert.deepEqual(restored.records,[{id:'r1',date:'2026-01-01',text:'Legacy evidence'}]);
  assert.deepEqual([...new Uint8Array(restored.originalBytes)],[...originalBytes]);
  assert.equal(restored.originalVideo.type,'video/mp4');
  assert.deepEqual([...new Uint8Array(await restored.originalVideo.arrayBuffer())],[...originalBytes]);
  if(version===2)assert.equal((await idbGet(deps.db,'full_backup','2026-01-01')).state.meta.revisionId,'backup');
  assert.equal((await idbGet(deps.db,'entrance_media','missing')),undefined);
  deps.db.close();
  const reopened=await rawOpen(factory,name,3);
  const reread=await idbGet(reopened,'main','state');
  assert.deepEqual([...new Uint8Array(await reread.originalVideo.arrayBuffer())],[...originalBytes]);
  assert.equal(reread.meta.revisionId,'legacy-read-only');
  reopened.close();
 });
}
test('B09 future IDB version is rejected without a downgrade or removal of its original data',async()=>{
 const factory=new IDBFactory(),name='b09-newer-than-app';
 const original=await rawOpen(factory,name,4,db=>db.createObjectStore('main'));
 const tx=original.transaction('main','readwrite'),done=settled(tx);
 tx.objectStore('main').put({meta:{schemaVersion:99},sentinel:'DO_NOT_TOUCH'},'state');
 await done;original.close();
 const {open,deps}=applicationOpen(factory,name);
 await assert.rejects(open(),error=>error?.name==='VersionError');
 assert.equal(deps.db,null);
 const untouched=await rawOpen(factory,name,4);
 assert.equal(untouched.version,4);
 assert.equal((await idbGet(untouched,'main','state')).sentinel,'DO_NOT_TOUCH');
 untouched.close();
});
