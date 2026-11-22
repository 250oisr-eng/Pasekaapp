import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root={},base=new URL('../js/',import.meta.url);
for(const file of ['video-archive-v2-guard.js','video-archive-v2-snapshot.js']){
 new Function('window',await readFile(new URL(file,base),'utf8'))(root);
}
const guard=root.PasekaVideoArchiveV2Guard,snapshot=root.PasekaVideoArchiveV2Snapshot.snapshotForV2;
const initial=()=>({meta:{schemaVersion:15,revisionId:'old'},records:[],hives:[]});
const ledger=()=>({version:1,entries:[]});
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(){
 const req=new IDBFactory().open('v2snapshot',1);
 req.onupgradeneeded=()=>{req.result.createObjectStore('main');req.result.createObjectStore('entrance_media',{keyPath:'id'});};
 const db=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
 const bytes=new Uint8Array([1,2,3]);
 const tx=db.transaction(['main','entrance_media'],'readwrite');
 tx.objectStore('main').put(initial(),'state');
 tx.objectStore('main').put(ledger(),'video_recognition_ledger_v1');
 tx.objectStore('entrance_media').put({id:'vid',bytes:3,blobSha256:sha(bytes),mimeType:'video/mp4',
  blob:new Blob([bytes],{type:'video/mp4'})});
 await done(tx);
 return db;
}
const done=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||new Error('transaction failed'));});
const rejected=(p,code)=>assert.rejects(p,error=>error.code===code);
test('v2 reads state, ledger and entrance Blob from a single readonly transaction',async()=>{
 const db=await fixture(),modes=[];
 const tracked={objectStoreNames:db.objectStoreNames,transaction(...args){
  modes.push({stores:args[0],mode:args[1]});return db.transaction(...args);
 }};
 const out=await snapshot(tracked,guard);
 assert.deepEqual(modes,[{stores:['main','entrance_media'],mode:'readonly'}]);
 assert.deepEqual(out.state,initial());
 assert.deepEqual(out.ledger,ledger());
 assert.equal(out.pendingVideos.length,1);
 assert.equal(out.pendingVideos[0].sourceSha256,sha(new Uint8Array([1,2,3])));
 assert.equal(out.archiveSafe,false);
 assert.equal(out.restoreAuthorized,false);
 assert.equal(out.needsPostHashRecheck,true);
 db.close();
});
test('writer queued after snapshot cannot affect the returned transactionally consistent state',async()=>{
 const db=await fixture();
 const pending=snapshot(db,guard);
 const tx=db.transaction(['main','entrance_media'],'readwrite');
 tx.objectStore('main').put({...initial(),meta:{schemaVersion:15,revisionId:'new'}},'state');
 tx.objectStore('entrance_media').put({id:'vid2',bytes:1,blobSha256:sha(new Uint8Array([4])),
  mimeType:'video/mp4',blob:new Blob([new Uint8Array([4])],{type:'video/mp4'})});
 await done(tx);
 const before=await pending;
 assert.equal(before.state.meta.revisionId,'old');
 assert.equal(before.pendingVideos.length,1);
 const after=await snapshot(db,guard);
 assert.equal(after.state.meta.revisionId,'new');
 assert.equal(after.pendingVideos.length,2);
 db.close();
});
test('missing and damaged ledger fail closed rather than interpreted as empty',async()=>{
 const db=await fixture();
 const tx=db.transaction('main','readwrite');
 tx.objectStore('main').delete('video_recognition_ledger_v1');
 await done(tx);
 await rejected(snapshot(db,guard),'V2_SNAPSHOT_LEDGER_MISSING');
 const t2=db.transaction('main','readwrite');
 t2.objectStore('main').put({version:500,entries:[]},'video_recognition_ledger_v1');
 await done(t2);
 await rejected(snapshot(db,guard),'V2_LEDGER_INVALID');
 db.close();
});
test('entrance source without SHA evidence is rejected, no inferred safe originals',async()=>{
 const db=await fixture();
 const tx=db.transaction('entrance_media','readwrite');
 tx.objectStore('entrance_media').put({id:'vid',bytes:3,mimeType:'video/mp4',
  blob:new Blob([new Uint8Array([1,2,3])],{type:'video/mp4'})});
 await done(tx);
 await rejected(snapshot(db,guard),'V2_SNAPSHOT_SOURCE_EVIDENCE_MISSING');
 db.close();
});
test('recognized original still stored is not eligible for v2 export',async()=>{
 const db=await fixture(),tx=db.transaction('main','readwrite');
 tx.objectStore('main').put({version:1,entries:[{source:'entrance_media',videoId:'vid',
  resultId:'res1',recognizedAt:'2026-11-20T00:00:00Z',stateRevisionId:'old',
  sourceHashVerifiedAt:'2026-11-20T00:00:00Z',result:{observation:'ok'},
  sourceSha256:sha(new Uint8Array([1,2,3])),sourceBytes:3,
  sourceEvidenceVersion:1,cleanupState:'deleted'}]},'video_recognition_ledger_v1');
 await done(tx);
 await rejected(snapshot(db,guard),'V2_RECOGNIZED_ORIGINAL_INCLUDED');
 db.close();
});
test('missing stores and malformed state reject without writing',async()=>{
 const db=await fixture(),wrong={objectStoreNames:{contains:name=>name==='main'},transaction(){throw Error('called');}};
 await rejected(snapshot(wrong,guard),'V2_SNAPSHOT_STORES_MISSING');
 const tx=db.transaction('main','readwrite');tx.objectStore('main').put({meta:{}},'state');await done(tx);
 await rejected(snapshot(db,guard),'V2_SNAPSHOT_STATE_INVALID');
 db.close();
});
