import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {indexedDB as factory} from 'fake-indexeddb';
const source=await readFile(new URL('../js/video-recognition-ledger.js',import.meta.url),'utf8');
const root={};
new Function('window',source)(root);
const ledger=root.PasekaVideoRecognitionLedger;
let counter=0;
async function openFixture(){
 const name='paseka-video-ledger-fixture-'+(++counter);
 return new Promise((resolve,reject)=>{
  const request=factory.open(name,3);
  request.onupgradeneeded=()=>{
   request.result.createObjectStore('main');
   request.result.createObjectStore('entrance_media',{keyPath:'id'});
  };
  request.onerror=()=>reject(request.error);
  request.onsuccess=()=>resolve(request.result);
 });
}
function put(db,store,key,value){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(store,'readwrite');
  if(store==='main')tx.objectStore(store).put(value,key);
  else tx.objectStore(store).put(value);
  tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
 });
}
function get(db,store,key){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(store,'readonly'),req=tx.objectStore(store).get(key);
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
}
const base={videoId:'v1',source:'entrance_media',resultId:'result-1',
 expectedStateRevisionId:'rev1',recognizedAt:'2026-11-20T08:00:00.000Z',
 recognitionStatus:'completed',recognitionSucceeded:true,
 result:{counts:{incoming:5},analysisNote:'Observations require beekeeper verification'}};
async function fixture(){
 const db=await openFixture();
 const state={meta:{revisionId:'rev1'},records:[{id:'r',media:[{kind:'image',data:'photo'}]}],
 snapshots:[],families:[{id:'family1'}]};
 await put(db,'main','state',state);
 await put(db,'entrance_media',null,{id:'v1',status:'analyzing',blob:new Blob(['video'],{type:'video/mp4'})});
 return {db,state};
}
test('atomic durable recognition result persists without removing entrance original or state',async()=>{
 const {db,state}=await fixture();
 const out=await ledger.recordRecognitionResult(db,base);
 assert.equal(out.ok,true);assert.equal(out.resultPersisted,true);
 assert.equal(out.cleanupState,'blocked_archive_safety');
 assert.deepEqual(await get(db,'main','state'),state);
 assert.equal((await get(db,'entrance_media','v1')).id,'v1');
 const stored=await ledger.readRecognitionLedger(db);
 assert.equal(stored.ok,true);assert.equal(stored.entries.length,1);
 assert.equal(stored.entries[0].result.counts.incoming,5);db.close();
});
test('duplicate submission is idempotent but conflicting result is rejected',async()=>{
 const {db}=await fixture();
 assert.equal((await ledger.recordRecognitionResult(db,base)).ok,true);
 const same=await ledger.recordRecognitionResult(db,base);
 assert.equal(same.ok,true);assert.equal(same.idempotent,true);
 const different=await ledger.recordRecognitionResult(db,{...base,resultId:'other'});
 assert.equal(different.ok,false);assert.equal(different.reason,'conflicting_recognition_result');
 assert.equal((await ledger.readRecognitionLedger(db)).entries.length,1);db.close();
});
test('failed, incomplete, offline and binary-bearing results never persist',async()=>{
 const {db}=await fixture();
 const invalid=[
 {recognitionStatus:'uploading'}, {recognitionSucceeded:false},
 {expectedStateRevisionId:'stale'}, {result:{data:'video'}},
 {result:{nested:{blob:'raw'}}}, {result:{video:'data:video/mp4;base64,AAAA'}},
 {result:{counts:[Infinity]}},{resultId:''},{videoId:'missing'}
 ];
 for(const patch of invalid){
  const result=await ledger.recordRecognitionResult(db,{...base,...patch});
  assert.equal(result.ok,false,JSON.stringify(patch));
 }
 assert.deepEqual((await ledger.readRecognitionLedger(db)).entries,[]);
 assert.ok((await get(db,'entrance_media','v1')).blob);db.close();
});
test('journal video needs uniquely identified stored media; old unidentified video stays untouched',async()=>{
 const {db,state}=await fixture();
 const record={...base,source:'record_media',videoId:'j1',resultId:'journal-result'};
 const rejected=await ledger.recordRecognitionResult(db,record);
 assert.equal(rejected.reason,'journal_video_missing_or_ambiguous');
 state.records.push({id:'r2',media:[{kind:'video',videoId:'j1',data:'data:video/mp4;base64,AAAA'}]});
 await put(db,'main','state',state);
 assert.equal((await ledger.recordRecognitionResult(db,record)).ok,true);
 assert.equal((await get(db,'main','state')).records[1].media[0].data,'data:video/mp4;base64,AAAA');
 assert.equal((await ledger.readRecognitionLedger(db)).entries[0].source,'record_media');db.close();
});
test('revision mismatch prevents durable result commit even for existing source',async()=>{
 const {db}=await fixture();
 const result=await ledger.recordRecognitionResult(db,{...base,expectedStateRevisionId:'old'});
 assert.equal(result.reason,'state_revision_changed');
 assert.deepEqual((await ledger.readRecognitionLedger(db)).entries,[]);db.close();
});
test('broken ledger fails closed rather than rewriting evidence',async()=>{
 const {db}=await fixture();
 await put(db,'main',ledger.KEY,{version:99,entries:[]});
 const result=await ledger.recordRecognitionResult(db,base);
 assert.equal(result.reason,'ledger_corrupt');
 assert.equal((await get(db,'main',ledger.KEY)).version,99);db.close();
});
test('read-only reopen preserves durable result after simulated app restart',async()=>{
 const {db}=await fixture();
 const out=await ledger.recordRecognitionResult(db,base);
 assert.equal(out.ok,true);
 const name=db.name;db.close();
 const reopened=await new Promise((resolve,reject)=>{
  const req=factory.open(name,3);
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
 const stored=await ledger.readRecognitionLedger(reopened);
 assert.equal(stored.entries.length,1);assert.equal(stored.entries[0].videoId,'v1');
 assert.ok((await get(reopened,'entrance_media','v1')).blob);reopened.close();
});
