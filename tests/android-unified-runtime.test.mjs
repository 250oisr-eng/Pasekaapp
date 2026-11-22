import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';

const source=readFileSync('diagnostics/phone-all/runner.js','utf8');
const fixture=readFileSync('diagnostics/phone-all/synthetic-mp4.js','utf8');
const b64=fixture.match(/SYNTHETIC_MP4_BASE64='([^']+)'/)?.[1];
const sha=fixture.match(/SYNTHETIC_MP4_SHA256='([^']+)'/)?.[1];
assert.ok(b64&&sha);
const stripped=source.replace(/^import .*?;\r?\n/,'');
const injectable=stripped.slice(0,stripped.indexOf("$('run').addEventListener"))+'\nglobalThis.__test={storage,run};';
function makeEnvironment(factory,{badArchive=false,badFrames=false,badOnnx=false}={}){
 const archive={inspect(rows){
   if(badArchive)return {ok:false,issues:['FAILED'],cleanupAuthorized:false,restoreAuthorized:false};
   const duplicate=rows.length===2&&rows[0].resultId===rows[1].resultId;
   const bad=rows.some(x=>x.sourceSha256==='invalid');
   const conflict=rows.length===2&&rows[0].videoId===rows[1].videoId&&rows[0].sourceSha256!==rows[1].sourceSha256;
   const issues=bad?['SOURCE_EVIDENCE_INVALID']:duplicate?['RESULT_ID_DUPLICATE']:conflict?['SOURCE_COPY_CONFLICT']:[];
   return {ok:issues.length===0,issues,requiresManualReview:issues.length>0,cleanupAuthorized:false,restoreAuthorized:false,archiveSafe:false};
 }};
 const frames={async extractTransientFrames(){
  if(badFrames)return {ok:false,reason:'SYNTHETIC_NEGATIVE'};
  return {ok:true,sourceEvidenceVerified:true,recognitionSucceeded:false,cleanupAuthorized:false,
   frames:[0.4,0.8,1.2].map(atSec=>({atSec,width:64,height:64,mimeType:'image/jpeg',dataUrl:'data:image/jpeg;base64,'+'A'.repeat(160)}))};
 }};
 const ort={env:{wasm:{}},Tensor:class{},InferenceSession:{async create(){return {async run(){return {y:{type:'float32',dims:[1],data:[badOnnx?7:5]}};},async release(){}};}}};
 const window={PasekaAndroidArchivePreflight:archive,PasekaEntranceFramePreparation:frames,ort};
 const sandbox={indexedDB:factory,crypto:webcrypto,Blob,TextEncoder,Uint8Array,Float32Array,window,
  URL:class extends URL{static createObjectURL(){return 'blob:local-synthetic'}static revokeObjectURL(){}},
  location:{href:'https://localhost/'},fetch:async()=>({ok:true,text:async()=>' '.repeat(1024)}),
  atob:s=>Buffer.from(s,'base64').toString('binary'),document:{getElementById(){return null}},
  SYNTHETIC_MP4_BASE64:b64,SYNTHETIC_MP4_SHA256:sha};
 runInNewContext('const SYNTHETIC_MP4_BASE64=globalThis.SYNTHETIC_MP4_BASE64; const SYNTHETIC_MP4_SHA256=globalThis.SYNTHETIC_MP4_SHA256;\n'+injectable,sandbox,{timeout:1500});
 return sandbox.__test;
}
function open(factory){return new Promise((resolve,reject)=>{const r=factory.open('paseka-unified-diagnostic-synthetic-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function stored(factory){const db=await open(factory);try{return await new Promise((resolve,reject)=>{const r=db.transaction('synthetic','readonly').objectStore('synthetic').get('fixture');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}}
async function replace(factory,data){const db=await open(factory);try{await new Promise((resolve,reject)=>{const tx=db.transaction('synthetic','readwrite');tx.objectStore('synthetic').put(data,'fixture');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
test('synthetic persistence across separate runner environments, not only same open DB',async()=>{
 const f=new IDBFactory();
 const first=await makeEnvironment(f).storage();
 assert.equal(first.status,'PASS');assert.equal(first.previousFixture,'ABSENT_CREATED');
 const second=await makeEnvironment(f).storage();
 assert.equal(second.status,'PASS');assert.equal(second.previousFixture,'PRESENT_VERIFIED');
});
test('tampered bytes block and persist unchanged (no silent repair)',async()=>{
 const f=new IDBFactory();await makeEnvironment(f).storage();
 await replace(f,new Blob(['tampered-bytes']));
 await assert.rejects(()=>makeEnvironment(f).storage(),/UNKNOWN_FIXTURE_BYTES_PRESERVE/);
 assert.equal(await (await stored(f)).text(),'tampered-bytes');
});
test('unknown type blocks and preserves exact value',async()=>{
 const f=new IDBFactory();await makeEnvironment(f).storage();
 await replace(f,'unknown-string');
 await assert.rejects(()=>makeEnvironment(f).storage(),/UNKNOWN_FIXTURE_TYPE_PRESERVE/);
 assert.equal(await stored(f),'unknown-string');
});
test('overall suite retains independent statuses and denies cleanup if frame check blocks',async()=>{
 const report=await makeEnvironment(new IDBFactory(),{badFrames:true}).run();
 assert.equal(report.status,'BLOCKED');
 assert.equal(report.checks.storage.status,'PASS');
 assert.equal(report.checks.archiveMetadata.status,'PASS');
 assert.equal(report.checks.syntheticFrames.status,'BLOCKED');
 assert.equal(report.checks.localOnnxWasm.status,'PASS');
 assert.equal(report.cleanupAuthorized,false);assert.equal(report.deleteAllowed,false);
 assert.equal(report.restoreAuthorized,false);
});
test('overall suite denies cleanup if fake ONNX returns wrong answer',async()=>{
 const report=await makeEnvironment(new IDBFactory(),{badOnnx:true}).run();
 assert.equal(report.status,'BLOCKED');
 assert.equal(report.checks.localOnnxWasm.status,'BLOCKED');
 assert.equal(report.scope.beeRecognition,'NOT_TESTED');
 assert.equal(report.cleanupAuthorized,false);
});
