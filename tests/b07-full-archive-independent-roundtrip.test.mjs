import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';
const root={crypto:webcrypto,Blob,TextEncoder,Uint8Array,ArrayBuffer,atob,btoa};
for(const name of ['disaster-archive.js','sectional-physical-layout.js']){
 const code=await readFile(new URL('../js/'+name,import.meta.url),'utf8');
 new Function('window',code)(root);
}
const Archive=root.PasekaDisasterArchive,Layout=root.PasekaSectionalPhysicalLayout;
const original=await readFile(new URL('./sectional-physical-layout.test.mjs',import.meta.url),'utf8');
const prefix=original.slice(original.indexOf("const PROFILE='"),original.indexOf("test('does not require a stored body"));
const {sideBySide}=new Function('Layout','Equipment',prefix+'\nreturn {sideBySide}')(
 Layout,{});
function sectionalState(){
 const {state,layout}=sideBySide();
 state.meta={schemaVersion:15,revisionId:'r1'};
 state.records=[{id:'note-1',familyId:'f1',action:'inspection',text:'QA synthetic only'}];
 state.auditLog=[{id:'audit-1',type:'mock',at:'2026-11-28T10:00:00.000Z'}];
 state.queenEvents=[];state.familyEvents=[];
 state.sectionalTechProcesses=[];
 state.equipmentInventory.events=[];
 state.equipmentInventory.bodies.b1.frames[0].history=[
  {id:'frame-action-1',type:'inspection_observed',at:'2026-11-28T10:00:00.000Z'}
 ];
 assert.deepEqual(Layout.validate(layout,state),{valid:true,errors:[]});
 return state;
}
async function db(idb,name){
 return await new Promise((resolve,reject)=>{
  const request=idb.open(name,3);
  request.onupgradeneeded=()=>{
   request.result.createObjectStore('main');
   request.result.createObjectStore('full_backup');
   request.result.createObjectStore('entrance_media',{keyPath:'id'});
  };
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
}
async function put(database,records){
 await new Promise((resolve,reject)=>{
  const tx=database.transaction(['main','full_backup','entrance_media'],'readwrite');
  if(records.main)tx.objectStore('main').put(records.main,'state');
  if(records.backup)tx.objectStore('full_backup').put({at:'2026-11-27T00:00:00Z',state:records.backup},'previous');
  if(records.video)tx.objectStore('entrance_media').put({id:'original-video',blob:records.video});
  tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error);
 });
}
async function read(database,store,key){
 return await new Promise((resolve,reject)=>{
  const q=database.transaction(store,'readonly').objectStore(store).get(key);
  q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
 });
}
function validateSource(main){
 if(!main||main.meta?.schemaVersion!==15)throw new Error('sectional schema 15 required');
 if(!Array.isArray(main.familyEvents)||!Array.isArray(main.sectionalTechProcesses))
  throw new Error('sectional history sections required');
 const inspected=Layout.inspect(main);
 if(inspected.length)throw new Error('sectional layout invalid: '+inspected.map(x=>x.code).join(','));
 const bodies=main.equipmentInventory?.bodies||{};
 for(const body of Object.values(bodies)){
  if(!Array.isArray(body.frames)||body.frames.some(f=>!f.frameId||!Array.isArray(f.history)))
   throw new Error('sectional original frame history missing');
 }
}
test('B07 independent full-IDB restore preserves physical 3-family layout, 36 frame IDs and original media',async()=>{
 const idb=new IDBFactory(),source=await db(idb,'source-b07'),dest=await db(idb,'dest-b07');
 const main=sectionalState(),backup=structuredClone(main);
 backup.meta.revisionId='r0';backup.records[0].text='previous independent record';
 const video=new Blob([Uint8Array.of(0,255,1,7,42)],{type:'video/mp4'});
 await put(source,{main,backup,video});
 const raw=await Archive.exportArchive(source);
 const proof=await Archive.inspectArchive(raw,dest,validateSource);
 assert.deepEqual(proof.counts,{entrance_media:1,full_backup:1,main:1});
 assert.equal((await read(dest,'main','state')),undefined);
 await Archive.atomicRestore(dest,proof,null);
 const verified=await Archive.verifyRestoredArchive(dest,proof);
 assert.equal(verified.verified,true);
 assert.equal(verified.sha256,JSON.parse(raw).manifest.sha256);
 source.close();dest.close();
 const reopened=await db(idb,'dest-b07');
 const restored=await read(reopened,'main','state');
 validateSource(restored);
 assert.deepEqual(restored.sectionalLayouts,main.sectionalLayouts);
 assert.deepEqual(restored.families,main.families);
 assert.deepEqual(restored.queens,main.queens);
 assert.deepEqual(restored.familyEvents,main.familyEvents);
 assert.deepEqual(restored.equipmentInventory.bodies,main.equipmentInventory.bodies);
 assert.equal(restored.records[0].id,'note-1');
 assert.equal((await read(reopened,'full_backup','previous')).state.records[0].text,'previous independent record');
 const b=await read(reopened,'entrance_media','original-video');
 assert.deepEqual([...new Uint8Array(await b.blob.arrayBuffer())],[0,255,1,7,42]);
 reopened.close();
});
test('B07 valid-checksum archive with damaged physical layout fails preflight and cannot replace current main',async()=>{
 const idb=new IDBFactory(),source=await db(idb,'source-corrupt'),target=await db(idb,'target-protected');
 const bad=sectionalState();bad.sectionalLayouts[0].sections[0].broodBodyIds.pop();
 await put(source,{main:bad});
 const original=sectionalState();original.meta.revisionId='live';
 await put(target,{main:original});
 const before=structuredClone(await read(target,'main','state'));
 const raw=await Archive.exportArchive(source);
 await assert.rejects(Archive.inspectArchive(raw,target,validateSource),/sectional layout invalid/);
 assert.deepEqual(await read(target,'main','state'),before);
 source.close();target.close();
});
test('B07 stale or same-revision changes after preflight abort restore, preserving original media',async()=>{
 const idb=new IDBFactory(),source=await db(idb,'source-race'),target=await db(idb,'target-race');
 const originalVideo=new Blob([Uint8Array.of(4,3,2,1)],{type:'video/mp4'});
 await put(source,{main:sectionalState(),video:originalVideo});
 const live=sectionalState();live.meta.revisionId='live';
 await put(target,{main:live,video:originalVideo});
 const proof=await Archive.inspectArchive(await Archive.exportArchive(source),target,validateSource);
 const edit=structuredClone(live);edit.records[0].text='Edited in competing tab';
 await put(target,{main:edit});
 await assert.rejects(Archive.atomicRestore(target,proof,'live',{preserveIdenticalLiveBinary:true}),/Store values changed since preflight: main/);
 assert.equal((await read(target,'main','state')).records[0].text,'Edited in competing tab');
 assert.deepEqual([...new Uint8Array(await (await read(target,'entrance_media','original-video')).blob.arrayBuffer())],[4,3,2,1]);
 source.close();target.close();
});
test('B07 absent latest backup cannot be treated as evidence of independent recovery',async()=>{
 const idb=new IDBFactory(),source=await db(idb,'source-no-backup'),target=await db(idb,'target-no-backup');
 await put(source,{main:sectionalState()});
 const raw=await Archive.exportArchive(source);
 const proof=await Archive.inspectArchive(raw,target,validateSource);
 assert.equal(proof.counts.full_backup,0);
 assert.equal(proof.counts.entrance_media,0);
 assert.equal(proof.main.meta.revisionId,'r1');
 assert.equal(await read(target,'main','state'),undefined);
 source.close();target.close();
});
