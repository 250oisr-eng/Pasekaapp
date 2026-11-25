import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {IDBFactory} from 'fake-indexeddb';

// Exercise the production openDB rather than a second implementation of its upgrade rules.
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const begin=html.indexOf('function openDB(){');
const end=html.indexOf('\nfunction ',begin+1);
assert.ok(begin>=0&&end>begin,'production openDB must be available');
const source=html.slice(begin,end);
const makeOpen=deps=>new Function('deps','with(deps){'+source+';return openDB;}')(deps);
const STORE='main',BACKUP_STORE='full_backup';
const get=(db,store,key)=>new Promise((resolve,reject)=>{
 const req=db.transaction(store,'readonly').objectStore(store).get(key);
 req.onsuccess=()=>resolve(req.result);
 req.onerror=()=>reject(req.error);
});
const open=(factory,name,version,upgrade)=>new Promise((resolve,reject)=>{
 const q=factory.open(name,version);
 q.onupgradeneeded=()=>upgrade?.(q.result);
 q.onsuccess=()=>resolve(q.result);
 q.onerror=()=>reject(q.error);
});
const done=tx=>new Promise((resolve,reject)=>{
 tx.oncomplete=resolve;
 tx.onabort=()=>reject(tx.error||new Error('abort'));
 tx.onerror=()=>reject(tx.error||new Error('error'));
});

test('B09 blocked legacy v2 upgrade: no data loss, then safe retry and reopen',async()=>{
 const factory=new IDBFactory(),name='b09-blocked-legacy-v2';
 const legacy=await open(factory,name,2,db=>{
  db.createObjectStore(STORE);
  db.createObjectStore(BACKUP_STORE);
 });
 const bytes=[0,37,255,99,8];
 const state={meta:{schemaVersion:12,revisionId:'legacy-r1'},hives:[{id:'legacy-hive'}],
  records:[{id:'old-entry',text:'preserve'}],originalVideo:new Blob([new Uint8Array(bytes)],{type:'video/mp4'})};
 const backup={at:'original',state:{meta:{revisionId:'backup-r1'},records:[{id:'archived-entry'}]}};
 const tx=legacy.transaction([STORE,BACKUP_STORE],'readwrite'),txDone=done(tx);
 tx.objectStore(STORE).put(state,'state');
 tx.objectStore(BACKUP_STORE).put(backup,'previous');
 await txDone;
 // Keep the v2 connection open; it must prevent a version-3 upgrade.
 legacy.onversionchange=()=>{}; // intentionally uncooperative older tab
 const deps={indexedDB:factory,DB:name,STORE,BACKUP_STORE,db:null,
  isFreshDatabaseUpgrade:old=>old===0};
 await assert.rejects(makeOpen(deps)(),/занята другой вкладкой/);
 assert.equal(deps.db,null,'blocked open must never become active');
 assert.equal(legacy.version,2);
 assert.equal((await get(legacy,STORE,'state')).meta.revisionId,'legacy-r1');
 assert.equal((await get(legacy,BACKUP_STORE,'previous')).state.records[0].id,'archived-entry');

 // Releasing the blocker may allow the already-rejected request to finish.
 // Production openDB must close its late success; a NEW request is the only valid handle.
 legacy.close();
 const reopened=makeOpen(deps);
 assert.equal(await reopened(),false,'old data is not a fresh database');
 assert.equal(deps.db.version,3);
 assert.deepEqual(Array.from(deps.db.objectStoreNames),[BACKUP_STORE,'entrance_media',STORE].sort());
 const recovered=await get(deps.db,STORE,'state');
 assert.equal(recovered.meta.schemaVersion,12,'IDB upgrade must not rewrite application schema');
 assert.deepEqual(recovered.records,state.records);
 assert.deepEqual([...new Uint8Array(await recovered.originalVideo.arrayBuffer())],bytes);
 assert.deepEqual(await get(deps.db,BACKUP_STORE,'previous'),backup);
 assert.equal(await get(deps.db,'entrance_media','no-record'),undefined);
 deps.db.close();

 const final=await open(factory,name,3);
 assert.equal((await get(final,STORE,'state')).meta.revisionId,'legacy-r1');
 assert.deepEqual([...new Uint8Array(await (await get(final,STORE,'state')).originalVideo.arrayBuffer())],bytes);
 final.close();
});
