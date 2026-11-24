import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {IDBFactory} from 'fake-indexeddb';
const code=await readFile(new URL('../js/p0-source-inventory.js',import.meta.url),'utf8');
const window={};
new Function('window',code)(window);
const api=window.PasekaP0SourceInventory;
async function open(extra=false,missing=false){
 const idb=new IDBFactory();
 const name='paseka-v1';
 return new Promise((resolve,reject)=>{
  const q=idb.open(name,3);
  q.onupgradeneeded=()=>{
   q.result.createObjectStore('main');
   if(!missing){
    q.result.createObjectStore('full_backup');
    q.result.createObjectStore('entrance_media',{keyPath:'id'});
   }
   if(extra)q.result.createObjectStore('archive_staging');
  };
  q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
 });
}
async function seed(db,withExtra=false){
 return new Promise((resolve,reject)=>{
  const stores=['main','full_backup','entrance_media',...(withExtra?['archive_staging']:[])];
  const tx=db.transaction(stores,'readwrite');
  tx.objectStore('main').put({
    meta:{revisionId:'PRIVATE-REVISION-ID'},hives:[{id:'SECRET-HIVE'}],
    records:[{id:'SECRET-RECORD',media:[
      {kind:'video',name:'SECRET-FILE-NAME.mp4',data:'data:video/mp4;base64,AQIDBA=='},
      {kind:'image',data:'data:image/png;base64,YWJj'}
    ]},{id:'SECRET-OPAQUE',media:[{kind:'video',name:'SECRET-OPAQUE',data:'file:///storage/private.mp4'}]}]
  },'state');
  tx.objectStore('full_backup').put({at:'PRIVATE-TIME',state:{records:[{media:[{kind:'video',data:'data:video/mp4;base64,AQIDBA=='}]}]}},'previous');
  tx.objectStore('entrance_media').put({id:'PRIVATE-VIDEO-ID',bytes:11,blob:new Blob([new Uint8Array([1,2,3,4])],{type:'video/mp4'})});
  if(withExtra)tx.objectStore('archive_staging').put({opaque:'PRIVATE-STAGED-BLOB'},'SECRET-STAGING-KEY');
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
}
test('G0 inventory is redacted and read-only: main embedded URLs, entrance Blob, full backup, unknown store',async()=>{
 const db=await open(true);
 await seed(db,true);
 // Refuse any Blob byte reads, even accidentally.
 const old=Blob.prototype.arrayBuffer;
 Blob.prototype.arrayBuffer=function(){throw Error('G0 must never read original video bytes');};
 let report;
 try{report=await api.readOnlyInventory(db);}finally{Blob.prototype.arrayBuffer=old;}
 assert.equal(report.schema,'paseka-g0-readonly-v1');
 assert.equal(report.status,'PARTIAL_READONLY');
 assert.equal(report.database,'paseka-v1');
 assert.equal(report.version,3);
 assert.deepEqual(Object.fromEntries(report.stores.map(s=>[s.name,s.count])),{archive_staging:1,entrance_media:1,full_backup:1,main:1});
 assert.equal(report.main.records,2);
 assert.equal(report.main.journalMediaItems,3);
 assert.equal(report.main.stats.videoDataUrls,1);
 assert.equal(report.main.stats.imageDataUrls,1);
 assert.equal(report.main.stats.opaqueMedia,1);
 assert.equal(report.fullBackup.entries,1);
 assert.equal(report.fullBackup.stats.videoDataUrls,1);
 assert.equal(report.entranceMedia.entries,1);
 assert.equal(report.entranceMedia.withBlob,1);
 assert.equal(report.entranceMedia.blobBytes,4);
 assert.equal(report.entranceMedia.declaredSizeMismatch,1);
 assert(report.issues.includes('UNINSPECTED_STORE_archive_staging'));
 assert(report.issues.includes('OPAQUE_EMBEDDED_MEDIA'));
 assert(report.issues.includes('ENTRANCE_BLOB_SIZE_MISMATCH'));
 assert.equal(report.stores.find(s=>s.name==='archive_staging').valuesInspected,false);
 assert.equal(report.originalByteHashesVerified,false);
 assert.equal(report.cleanupAuthorized,false);
 assert.equal(report.restoreVerified,false);
 assert.equal(report.osMediaStore,'NOT_ACCESSED');
 const redacted=JSON.stringify(report);
 for(const privateText of ['PRIVATE-REVISION-ID','SECRET-HIVE','SECRET-RECORD','SECRET-FILE-NAME','PRIVATE-STAGED-BLOB','PRIVATE-VIDEO-ID'])assert(!redacted.includes(privateText),privateText);
 const restored=await new Promise((resolve,reject)=>{const tx=db.transaction('entrance_media','readonly'),q=tx.objectStore('entrance_media').get('PRIVATE-VIDEO-ID');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 assert.equal(restored.blob.size,4);
 db.close();
});
test('G0 inventory fails closed on incomplete schema, without creating missing stores',async()=>{
 const db=await open(false,true);
 const result=await api.readOnlyInventory(db);
 assert.equal(result.main.present,false);
 assert(result.issues.includes('MISSING_REQUIRED_STORE_full_backup'));
 assert(result.issues.includes('MISSING_REQUIRED_STORE_entrance_media'));
 assert(result.issues.includes('MAIN_STATE_MISSING'));
 assert.deepEqual(Array.from(db.objectStoreNames),['main']);
 assert.equal(result.cleanupAuthorized,false);
 db.close();
});
test('G0 catches missing entrance original while never attempting restore or deletion',async()=>{
 const db=await open();
 await new Promise((resolve,reject)=>{
  const tx=db.transaction(['entrance_media','main'],'readwrite');
  tx.objectStore('main').put({records:[],meta:{}},'state');
  tx.objectStore('entrance_media').put({id:'MISSING-PRIVATE',bytes:20});
  tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
 });
 const report=await api.readOnlyInventory(db);
 assert.equal(report.entranceMedia.missingBlob,1);
 assert(report.issues.includes('ENTRANCE_ORIGINAL_BLOB_MISSING'));
 assert(!JSON.stringify(report).includes('MISSING-PRIVATE'));
 db.close();
});
