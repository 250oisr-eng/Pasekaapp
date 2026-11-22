import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Deliberately tiny synthetic IndexedDB request adapter: tests the guard
// for corrupted/non-conforming enumeration without touching user storage.
new Function(readFileSync('js/paseka-archive.js','utf8'))();
const Archive=globalThis.PasekaArchive;
function mockDb(getAllValue) {
 const events=[];
 let aborted=false;
 const db={
  objectStoreNames:{contains:key=>key==='main'||key==='entrance_media'},
  transaction(stores,mode){
   assert.deepEqual(Array.from(stores),['main','entrance_media']);
   assert.equal(mode,'readonly');
   const tx={
    objectStore(name){
     assert.ok(stores.includes(name));
     return {
      get(key){
       assert.equal(name,'main');
       return request(key==='state'?{meta:{schemaVersion:15},hives:[]}:undefined);
      },
      getAll(){
       assert.equal(name,'entrance_media');
       return request(getAllValue);
      }
     };
    },
    abort(){aborted=true;},
   };
   function request(value){const r={result:value};events.push(r);return r;}
   queueMicrotask(()=>{
    for(const r of events)r.onsuccess?.();
    if(aborted)tx.onabort?.();
    else tx.oncomplete?.();
   });
   return tx;
  }
 };
 return db;
}
test('native-conforming empty media list remains a valid explicit empty result',async()=>{
 const result=await Archive.readConsistentDatabaseSnapshot(mockDb([]));
 assert.deepEqual(result.videos,[]);
 assert.equal(result.state.meta.schemaVersion,15);
});
for(const value of [undefined,null,{},'unexpected',0,false]){
 test('invalid getAll result is fail-closed, never interpreted as zero videos: '+String(value),async()=>{
  await assert.rejects(
   Archive.readConsistentDatabaseSnapshot(mockDb(value)),
   {code:'VIDEO_SNAPSHOT_UNVERIFIED'}
  );
 });
}
test('archive exporter fails before issuing a media-free archive on malformed media enumeration',async()=>{
 const {webcrypto}=await import('node:crypto');
 await assert.rejects(
  Archive.exportArchiveFromDatabase(mockDb(null),webcrypto),
  {code:'VIDEO_SNAPSHOT_UNVERIFIED'}
 );
});
