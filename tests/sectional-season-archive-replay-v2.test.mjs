import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';
const root={crypto:webcrypto,Blob,TextEncoder,Uint8Array,ArrayBuffer,atob,btoa};
for(const name of ['disaster-archive.js','sectional-season-archive-replay-v2.js']){
 const src=await readFile(new URL('../js/'+name,import.meta.url),'utf8');
 new Function('window','TextEncoder','Blob','btoa','atob',src)(root,TextEncoder,Blob,btoa,atob);
}
const inspect=state=>assert.equal(state.hives[0].id,'h1');
async function fixture(){
 const factory=new IDBFactory();
 const q=factory.open('paseka-v1',3);
 q.onupgradeneeded=()=>{q.result.createObjectStore('main');q.result.createObjectStore('full_backup');q.result.createObjectStore('entrance_media',{keyPath:'id'});};
 const db=await new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
 const tx=db.transaction(['main','full_backup','entrance_media'],'readwrite');
 tx.objectStore('main').put({meta:{revisionId:'rev1',schemaVersion:15},hives:[{id:'h1'}],families:[],records:[]},'state');
 tx.objectStore('full_backup').put({state:{meta:{revisionId:'old'}}},'previous');
 tx.objectStore('entrance_media').put({id:'video1',blob:new Blob([Uint8Array.from([0,1,255,7])],{type:'video/mp4'})});
 await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
 const raw=await root.PasekaDisasterArchive.exportArchive(db);
 return {factory,db,file:{text:async()=>raw},raw};
}
test('saved full archive replay verifies original Blob bytes and state in separate temporary IDB',async()=>{
 const f=await fixture();
 const result=await root.PasekaSeasonArchiveReplayV2.verifySavedFileAndReplay(f.file,f.db,{indexedDB:f.factory,crypto:webcrypto,validateMain:inspect,expectedRevisionId:'rev1'});
 assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.mediaRecordCount,1);assert.equal(result.originalRevisionId,'rev1');assert.equal(result.externalCopyConfirmed,false);
 assert.equal(result.verificationScope,'LOCAL_INDEPENDENT_INDEXEDDB_REPLAY');
 const source=await root.PasekaDisasterArchive.inspectArchive(await root.PasekaDisasterArchive.exportArchive(f.db),f.db,inspect);
 assert.equal(source.main.meta.revisionId,'rev1');assert.equal(source.rows.get('entrance_media').length,1);f.db.close();
});
test('revision mismatch refuses replay without changing live database',async()=>{
 const f=await fixture();
 const result=await root.PasekaSeasonArchiveReplayV2.verifySavedFileAndReplay(f.file,f.db,{indexedDB:f.factory,crypto:webcrypto,validateMain:inspect,expectedRevisionId:'other'});
 assert.equal(result.ok,false);
 const s=await root.PasekaDisasterArchive.inspectArchive(await root.PasekaDisasterArchive.exportArchive(f.db),f.db,inspect);
 assert.equal(s.main.meta.revisionId,'rev1');f.db.close();
});
test('truncated file is rejected before temporary restore',async()=>{
 const f=await fixture(),bad={text:async()=>f.raw.slice(0,-30)};
 const r=await root.PasekaSeasonArchiveReplayV2.verifySavedFileAndReplay(bad,f.db,{indexedDB:f.factory,crypto:webcrypto,validateMain:inspect});
 assert.equal(r.ok,false);f.db.close();
});
test('missing strong main inspector prevents replay',async()=>{
 const f=await fixture();const r=await root.PasekaSeasonArchiveReplayV2.verifySavedFileAndReplay(f.file,f.db,{indexedDB:f.factory,crypto:webcrypto});
 assert.equal(r.ok,false);f.db.close();
});
