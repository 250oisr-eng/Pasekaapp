import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../js/entrance-frame-preparation.js',import.meta.url),'utf8');
const root={};
new Function('window',source)(root);
const api=root.PasekaEntranceFramePreparation;
const sha='a'.repeat(64),original={id:'v-1',bytes:5,blobSha256:sha,
 blob:new Blob(['video'],{type:'video/mp4'}),mimeType:'video/mp4'};
function browser({error=null,invalidFrame=false}={}){
 let revoked=0,paused=0,cleared=0,drawn=0;
 const events=new Map();
 const video={
  videoWidth:1280,videoHeight:720,duration:60,
  addEventListener(name,fn){if(!events.has(name))events.set(name,new Set());events.get(name).add(fn)},
  removeEventListener(name,fn){events.get(name)?.delete(fn)},
  dispatch(name){for(const fn of [...(events.get(name)||[])])fn()},
  load(){if(this.src&&this.src.length)queueMicrotask(()=>this.dispatch(error==='metadata'?'error':'loadedmetadata'))},
  pause(){paused++},removeAttribute(name){if(name==='src')this.src=''},
  set currentTime(v){this._currentTime=v;queueMicrotask(()=>this.dispatch(error==='seek'?'error':'seeked'))},
  get currentTime(){return this._currentTime||0}
 };
 const ctx={drawImage(){drawn++},clearRect(){cleared++}};
 const canvas={getContext(){return ctx},toDataURL(){return invalidFrame?'not-jpeg':'data:image/jpeg;base64,AAAA'},width:0,height:0};
 const document={createElement(tag){return tag==='video'?video:tag==='canvas'?canvas:null}};
 const URL={createObjectURL(){return 'blob:local-test'},revokeObjectURL(){revoked++}};
 return {document,URL,video,stats:()=>({revoked,paused,cleared,drawn}),hasher:{hashBlobHex:async()=>sha}};
}
test('sampling plan uses bounded inside-video timestamps and rejects invalid inputs',()=>{
 assert.deepEqual(api.sampleTimes(60,3),[15,30,45]);
 assert.equal(api.sampleTimes(60,5),null);
 assert.equal(api.sampleTimes(NaN,3),null);
 assert.equal(api.sampleTimes(0.5,2),null);
});
test('verified local frames are transient JPG snapshots, no recognition or cleanup is authorized',async()=>{
 const b=browser();
 const out=await api.extractTransientFrames(original,{...b,count:3});
 assert.equal(out.ok,true);
 assert.equal(out.frames.length,3);
 assert.deepEqual(out.frames.map(f=>f.atSec),[15,30,45]);
 assert.deepEqual(out.frames.map(f=>[f.width,f.height]),[[640,360],[640,360],[640,360]]);
 assert.equal(out.source.sourceSha256,sha);
 assert.equal(out.source.sourceBytes,5);
 assert.equal(out.recognitionSucceeded,false);
 assert.equal(out.cleanupAuthorized,false);
 assert.equal(b.stats().drawn,3);
 assert.equal(b.stats().revoked,1);
 assert.ok(b.stats().paused>0);
 assert.equal(b.stats().cleared,1);
});
test('missing source hash, changed Blob and absent decoder fail before any generated preview',async()=>{
 const b=browser();
 const tampered=await api.extractTransientFrames({...original,blobSha256:'b'.repeat(64)},b);
 assert.equal(tampered.reason,'source_sha_mismatch');
 assert.equal(b.stats().revoked,0);
 assert.equal((await api.extractTransientFrames({...original,bytes:8},b)).reason,'invalid_source_evidence');
 assert.equal((await api.extractTransientFrames({...original,id:''},b)).reason,'invalid_source_evidence');
 assert.equal((await api.extractTransientFrames(original,{hasher:b.hasher,document:null,URL:null})).reason,'browser_decoder_unavailable');
});
test('decoder errors and malformed JPEGs never yield partial success and always revoke blob URL',async()=>{
 for(const config of [{error:'metadata'},{error:'seek'},{invalidFrame:true}]){
  const b=browser(config);
  const out=await api.extractTransientFrames(original,b);
  assert.equal(out.ok,false);
  assert.equal(out.frames.length,0);
  assert.equal(out.cleanupAuthorized,false);
  assert.equal(b.stats().revoked,1);
  assert.ok(b.stats().paused>=1);
 }
});
test('abort never reports recognition and leaves Blob untouched',async()=>{
 const b=browser();
 const ctrl=new AbortController();ctrl.abort();
 const out=await api.extractTransientFrames(original,{...b,signal:ctrl.signal});
 assert.equal(out.reason,'aborted');
 assert.equal(out.sourceEvidenceVerified,false);
 assert.equal(b.stats().revoked,0);
 assert.equal(original.blob.size,5);
});
test('staging module is neither loaded into production UI nor allowed to perform network or storage calls',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/script src="\.\/js\/entrance-frame-preparation\.js"/);
 assert.doesNotMatch(sw,/entrance-frame-preparation\.js/);
 assert.doesNotMatch(source,/\bfetch\s*\(|\.transaction\s*\(|\.delete\s*\(|\.put\s*\(|\.add\s*\(/);
 assert.doesNotMatch(source,/localStorage|sessionStorage|navigator\.sendBeacon/);
});
