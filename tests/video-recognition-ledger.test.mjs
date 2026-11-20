import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {indexedDB as factory} from 'fake-indexeddb';
import {createHash} from 'node:crypto';
const source=await readFile(new URL('../js/video-recognition-ledger.js',import.meta.url),'utf8');
const root={};
const shaSource=await readFile(new URL('../js/paseka-sha256.js',import.meta.url),'utf8');
new Function('window',shaSource)(root);
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
const sourceHash=createHash('sha256').update('video').digest('hex');
const journalHash=createHash('sha256').update(Buffer.from([0,0,0])).digest('hex');
const base={videoId:'v1',source:'entrance_media',resultId:'result-1',
 processedSourceSha256:sourceHash,processedSourceBytes:5,
 expectedStateRevisionId:'rev1',recognizedAt:'2026-11-20T08:00:00.000Z',
 recognitionStatus:'completed',recognitionSucceeded:true,
 result:{counts:{incoming:5},analysisNote:'Observations require beekeeper verification'}};
async function fixture(){
 const db=await openFixture();
 const state={meta:{revisionId:'rev1'},records:[{id:'r',media:[{kind:'image',data:'photo'}]}],
 snapshots:[],families:[{id:'family1'}]};
 await put(db,'main','state',state);
 await put(db,'entrance_media',null,{id:'v1',status:'analyzing',bytes:5,blobSha256:sourceHash,blob:new Blob(['video'],{type:'video/mp4'})});
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
 assert.equal(stored.entries[0].result.counts.incoming,5);
 assert.equal(stored.entries[0].sourceSha256,sourceHash);
 assert.equal(stored.entries[0].sourceBytes,5);
 assert.equal(stored.entries[0].sourceEvidenceVersion,1);
 db.close();
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
 const record={...base,source:'record_media',videoId:'j1',resultId:'journal-result',
  processedSourceSha256:journalHash,processedSourceBytes:3};
 const rejected=await ledger.recordRecognitionResult(db,record);
 assert.equal(rejected.reason,'journal_video_missing_or_ambiguous');
 state.records.push({id:'r2',media:[{kind:'video',videoId:'j1',sourceSha256:journalHash,sourceBytes:3,data:'data:video/mp4;base64,AAAA'}]});
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

test('a recognition result without the exact processed-original digest is rejected',async()=>{
 const {db}=await fixture();
 const mismatch=await ledger.recordRecognitionResult(db,{...base,processedSourceSha256:'0'.repeat(64)});
 assert.equal(mismatch.ok,false);assert.equal(mismatch.reason,'source_hash_metadata_mismatch');
 const invalid=await ledger.recordRecognitionResult(db,{...base,processedSourceSha256:'bad'});
 assert.equal(invalid.reason,'invalid_recognition_evidence');
 assert.deepEqual((await ledger.readRecognitionLedger(db)).entries,[]);
 db.close();
});
test('tampered Blob bytes are detected even if stale digest and size metadata match',async()=>{
 const {db}=await fixture();
 await put(db,'entrance_media',null,{id:'v1',status:'analyzing',bytes:5,
  blobSha256:sourceHash,blob:new Blob(['other'],{type:'video/mp4'})});
 const out=await ledger.recordRecognitionResult(db,base);
 assert.equal(out.reason,'source_bytes_hash_mismatch');
 assert.equal((await ledger.readRecognitionLedger(db)).entries.length,0);
 db.close();
});
test('tampered journal Data URL bytes are detected even with same metadata',async()=>{
 const {db,state}=await fixture();
 state.records.push({id:'r2',media:[{kind:'video',videoId:'j1',sourceSha256:journalHash,
  sourceBytes:3,data:'data:video/mp4;base64,AQID'}]});
 await put(db,'main','state',state);
 const out=await ledger.recordRecognitionResult(db,{...base,source:'record_media',
  videoId:'j1',resultId:'j-result',processedSourceSha256:journalHash,processedSourceBytes:3});
 assert.equal(out.reason,'source_bytes_hash_mismatch');
 assert.equal((await ledger.readRecognitionLedger(db)).entries.length,0);
 db.close();
});
test('old un-hashed videos are not silently treated as verified recognition sources',async()=>{
 const {db}=await fixture();
 const old=await get(db,'entrance_media','v1');
 delete old.blobSha256;
 await put(db,'entrance_media',null,old);
 const out=await ledger.recordRecognitionResult(db,base);
 assert.equal(out.reason,'source_hash_metadata_mismatch');
 assert.equal((await ledger.readRecognitionLedger(db)).entries.length,0);
 db.close();
});
test('a changed entrance record between hashing and commit cancels evidence persistence',async()=>{
 const {db}=await fixture();
 const prior=root.PasekaSha256;
 let changed=false;
 root.PasekaSha256={...prior,hashBlobHex:async(blob)=>{
  const digest=await prior.hashBlobHex(blob);
  await put(db,'entrance_media',null,{id:'v1',status:'analyzing',bytes:5,
   blobSha256:'f'.repeat(64),blob:new Blob(['other'],{type:'video/mp4'})});
  changed=true;
  return digest;
 }};
 try{
  const out=await ledger.recordRecognitionResult(db,base);
  assert.equal(changed,true);
  assert.equal(out.reason,'source_changed_after_hash');
  assert.equal((await ledger.readRecognitionLedger(db)).entries.length,0);
 }finally{root.PasekaSha256=prior;db.close()}
});
test('a changed journal data URL between hashing and commit cancels evidence persistence',async()=>{
 const {db,state}=await fixture();
 state.records.push({id:'r2',media:[{kind:'video',videoId:'j1',sourceSha256:journalHash,
  sourceBytes:3,data:'data:video/mp4;base64,AAAA'}]});
 await put(db,'main','state',state);
 const prior=root.PasekaSha256;
 root.PasekaSha256={...prior,hashVideoDataUrlHex:async(data)=>{
  const digest=await prior.hashVideoDataUrlHex(data);
  const next=await get(db,'main','state');
  next.records[1].media[0].data='data:video/mp4;base64,AQID';
  await put(db,'main','state',next);
  return digest;
 }};
 try{
  const out=await ledger.recordRecognitionResult(db,{...base,source:'record_media',
   videoId:'j1',resultId:'j-result',processedSourceSha256:journalHash,processedSourceBytes:3});
  assert.equal(out.reason,'source_changed_after_hash');
  assert.equal((await ledger.readRecognitionLedger(db)).entries.length,0);
 }finally{root.PasekaSha256=prior;db.close()}
});

test('entrance capture rejects an ID collision instead of overwriting hashed original bytes',async()=>{
 const {db}=await fixture();
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const begin=html.indexOf('async function putEntranceVideo(record){');
 const end=html.indexOf('function listEntranceVideos(){',begin);
 assert.ok(begin>=0&&end>begin);
 const putEntranceVideo=new Function('db','window',html.slice(begin,end)+';return putEntranceVideo;')(db,root);
 const original=await get(db,'entrance_media','v1');
 await assert.rejects(putEntranceVideo({...original,blob:new Blob(['other'],{type:'video/mp4'})}));
 const preserved=await get(db,'entrance_media','v1');
 assert.equal(preserved.blobSha256,sourceHash);
 assert.equal(await root.PasekaSha256.hashBlobHex(preserved.blob),sourceHash);
 db.close();
});

test('missing ledger is explicitly blocked rather than reported as verified empty history',async()=>{
 const {db}=await fixture();
 const status=await ledger.readRecognitionLedger(db);
 assert.equal(status.ok,false);
 assert.equal(status.reason,'ledger_missing');
 assert.deepEqual(status.entries,[]);
 assert.ok((await get(db,'entrance_media','v1')).blob);
 db.close();
});

test('persisted recognition history rejects tampered entries and duplicated source identities',async()=>{
 const {db}=await fixture();
 const recorded=await ledger.recordRecognitionResult(db,base);
 assert.equal(recorded.ok,true);
 const clean=await get(db,'main',ledger.KEY),entry=clean.entries[0];
 const invalid=[
  {...entry,sourceSha256:'f'.repeat(64).slice(1)},
  {...entry,sourceBytes:0},
  {...entry,result:{data:'data:video/mp4;base64,AAAA'}},
  {...entry,cleanupState:'deleted'},
  {...entry,sourceEvidenceVersion:0},
  {...entry,recognizedAt:'invalid-time'},
  {...entry,stateRevisionId:''}
 ];
 for(const altered of invalid){
  await put(db,'main',ledger.KEY,{version:1,entries:[altered]});
  const reader=await ledger.readRecognitionLedger(db);
  assert.equal(reader.ok,false,JSON.stringify(altered).slice(0,100));
  assert.equal(reader.reason,'ledger_corrupt');
  const write=await ledger.recordRecognitionResult(db,{...base,videoId:'v1',resultId:'other-result'});
  assert.equal(write.ok,false);
  assert.equal(write.reason,'ledger_corrupt');
 }
 await put(db,'main',ledger.KEY,{version:1,entries:[entry,{...entry,resultId:'duplicate'}]});
 assert.equal((await ledger.readRecognitionLedger(db)).reason,'ledger_corrupt');
 await put(db,'main',ledger.KEY,clean);
 assert.equal((await ledger.readRecognitionLedger(db)).ok,true);
 assert.ok((await get(db,'entrance_media','v1')).blob);
 db.close();
});
