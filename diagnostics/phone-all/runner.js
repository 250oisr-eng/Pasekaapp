import {SYNTHETIC_MP4_BASE64,SYNTHETIC_MP4_SHA256} from './synthetic-mp4.js';
const PKG='ru.paseka.journal.diagnostic.allchecks';
const DB='paseka-unified-diagnostic-synthetic-v1';
const REF='d9f56955f6abce25e3e877c089a0b22b8b777e2f405263f1847370698d1f07c2';
const $=id=>document.getElementById(id);
let latest='';
const hex=bytes=>Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
async function sha(value){return hex(await crypto.subtle.digest('SHA-256',value instanceof Blob?await value.arrayBuffer():value));}
function openDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>request.result.createObjectStore('synthetic');request.onerror=()=>reject(Error('DB_OPEN'));request.onsuccess=()=>resolve(request.result);});}
function txDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(Error('IDB_TX_ERROR'));tx.onabort=()=>reject(Error('IDB_TX_ABORT'));});}
function get(db){return new Promise((resolve,reject)=>{const r=db.transaction('synthetic','readonly').objectStore('synthetic').get('fixture');r.onerror=()=>reject(Error('IDB_GET'));r.onsuccess=()=>resolve(r.result);});}
async function storage(){
 let db;
 try{
  const bytes=new TextEncoder().encode('paseka-phonechecks-synthetic-v1');
  if(bytes.length!==31||await sha(bytes)!==REF)throw Error('SYNTHETIC_REFERENCE_MISMATCH');
  db=await openDb();
  const existing=await get(db);
  const previousFixture=existing===undefined?'ABSENT_CREATED':'PRESENT_VERIFIED';
  if(existing!==undefined){
   if(!(existing instanceof Blob))throw Error('UNKNOWN_FIXTURE_TYPE_PRESERVE');
   if(existing.size!==31||await sha(existing)!==REF)throw Error('UNKNOWN_FIXTURE_BYTES_PRESERVE');
  }else{
   const tx=db.transaction('synthetic','readwrite');
   tx.objectStore('synthetic').add(new Blob([bytes],{type:'application/octet-stream'}),'fixture');
   await txDone(tx);
  }
  db.close();db=await openDb();
  const actual=await get(db);
  if(!(actual instanceof Blob)||actual.size!==31||await sha(actual)!==REF)throw Error('REOPEN_HASH_MISMATCH_PRESERVE');
  return {status:'PASS',sha256:REF,bytes:31,previousFixture};
 }finally{db?.close();}
}
function archive(){
 const g=window.PasekaAndroidArchivePreflight;
 if(!g?.inspect)throw Error('ARCHIVE_GUARD_MISSING');
 const base={source:'entrance_media',videoId:'synthetic-a',sourceSha256:'a'.repeat(64),sourceBytes:40,resultId:'syn-result-a',sourceEvidenceVersion:1,recognizedAt:'2026-11-22T00:00:00Z',result:{synthetic:true}};
 const other={...base,videoId:'synthetic-b',resultId:'syn-result-b'};
 const check=(records,issue)=>{
  const x=g.inspect(records);
  if(x.ok!==false||x.requiresManualReview!==true||!x.issues.includes(issue)||x.cleanupAuthorized!==false||x.restoreAuthorized!==false)throw Error('ARCHIVE_FALSE_ACCEPT_'+issue);
 };
 const ok=g.inspect([base,other]);
 if(ok.ok!==true||ok.cleanupAuthorized!==false||ok.restoreAuthorized!==false||ok.archiveSafe!==false)throw Error('ARCHIVE_SAFE_FLAGS_INVALID');
 check([{...base,sourceSha256:'invalid'}],'SOURCE_EVIDENCE_INVALID');
 check([base,{...base,sourceSha256:'b'.repeat(64),resultId:'other'}],'SOURCE_COPY_CONFLICT');
 check([base,{...other,resultId:base.resultId}],'RESULT_ID_DUPLICATE');
 return {status:'PASS',syntheticMetadataCases:4,cleanupAuthorized:false,restoreAuthorized:false};
}
async function frames(){
 const decoder=window.PasekaEntranceFramePreparation;
 if(!decoder?.extractTransientFrames)throw Error('FRAME_MODULE_MISSING');
 const bytes=Uint8Array.from(atob(SYNTHETIC_MP4_BASE64),c=>c.charCodeAt(0));
 if(bytes.length!==1720)throw Error('FRAME_SOURCE_LENGTH');
 const blob=new Blob([bytes],{type:'video/mp4'});
 if(await sha(blob)!==SYNTHETIC_MP4_SHA256)throw Error('FRAME_SOURCE_HASH');
 const result=await decoder.extractTransientFrames({id:'synthetic-black-64',blob,bytes:1720,blobSha256:SYNTHETIC_MP4_SHA256,mimeType:'video/mp4'},{
  count:3,hasher:{hashBlobHex:sha},document,URL
 });
 if(!result.ok)throw Error('FRAME_'+String(result.reason||'UNKNOWN'));
 if(!result.sourceEvidenceVerified||result.recognitionSucceeded!==false||result.cleanupAuthorized!==false||result.frames?.length!==3)throw Error('FRAME_EVIDENCE');
 let prev=-1;
 for(const frame of result.frames){
  if(frame.width!==64||frame.height!==64||frame.atSec<=prev||frame.atSec>=1.6||frame.mimeType!=='image/jpeg'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(frame.dataUrl)||frame.dataUrl.length<150)throw Error('FRAME_MISMATCH');
  prev=frame.atSec;
 }
 if(await sha(blob)!==SYNTHETIC_MP4_SHA256)throw Error('FRAME_SOURCE_CHANGED');
 result.frames.length=0;
 return {status:'PASS',frames:3,width:64,height:64,sourceSha256:SYNTHETIC_MP4_SHA256,realVideos:'NOT_ACCESSED'};
}
async function onnx(){
 const ort=window.ort;
 if(!ort?.InferenceSession||!ort.Tensor)throw Error('ORT_NOT_AVAILABLE');
 ort.env.wasm.numThreads=1;
 let session,scriptUrl;
 try{
  const mjs=new URL('./ort-wasm-simd-threaded.mjs',location.href);
  const wasm=new URL('./ort-wasm-simd-threaded.wasm',location.href);
  const response=await fetch(mjs.href,{cache:'no-store'});
  if(!response.ok)throw Error('LOCAL_ORT_MODULE_HTTP_'+response.status);
  const js=await response.text();
  if(js.length<1000||/^\s*<!doctype html/i.test(js))throw Error('LOCAL_ORT_MODULE_INVALID');
  scriptUrl=URL.createObjectURL(new Blob([js],{type:'text/javascript'}));
  ort.env.wasm.wasmPaths={mjs:scriptUrl,wasm:wasm.href};
  session=await ort.InferenceSession.create(new URL('./synthetic-add.onnx',location.href).href,{executionProviders:['wasm']});
  const output=await session.run({x:new ort.Tensor('float32',Float32Array.from([3]),[1])});
  if(output?.y?.type!=='float32'||output.y.dims?.length!==1||output.y.dims[0]!==1||output.y.data?.length!==1||output.y.data[0]!==5)throw Error('ONNX_SYNTHETIC_RESULT_INVALID');
  return {status:'PASS',code:'LOCAL_ONNX_WASM_ADD_2_EXACT',input:3,output:5,beeRecognition:'NOT_TESTED'};
 }finally{
  try{await session?.release?.()}catch{}
  if(scriptUrl)URL.revokeObjectURL(scriptUrl);
 }
}
async function probe(fn){
 try{return await fn();}
 catch(error){return {status:'BLOCKED',code:String(error?.message||'UNKNOWN').slice(0,110)};}
}
async function run(){
 const report={suite:'PHONE_UNIFIED_SYNTHETIC_V2',packageId:PKG,status:'BLOCKED',code:'ONE_OR_MORE_CHECKS_BLOCKED',
  checks:{},scope:{syntheticOnly:true,realVideos:'NOT_TESTED',beeRecognition:'NOT_TESTED',realBackupRestore:'NOT_TESTED',productPermissions:'NOT_TESTED',androidForceStop:'NOT_TESTED',realVideoDeletion:'NOT_TESTED',networkTraffic:'NOT_MEASURED'},
  cleanupAuthorized:false,deleteAllowed:false,restoreAuthorized:false,externalRequests:'NOT_MEASURED'};
 report.checks.storage=await probe(storage);
 report.checks.archiveMetadata=await probe(archive);
 report.checks.syntheticFrames=await probe(frames);
 report.checks.localOnnxWasm=await probe(onnx);
 if(Object.values(report.checks).every(x=>x.status==='PASS')){report.status='PASS';report.code='SYNTHETIC_SUITE_ONLY';}
 return report;
}
$('run').addEventListener('click',async()=>{
 $('run').disabled=true;$('copy').disabled=true;latest='';$('result').textContent='Проверка локальных синтетических модулей…';
 try{latest=JSON.stringify(await run(),null,2);}
 catch{latest=JSON.stringify({suite:'PHONE_UNIFIED_SYNTHETIC_V2',packageId:PKG,status:'BLOCKED',code:'RUNNER_UNEXPECTED_FAILURE',cleanupAuthorized:false,deleteAllowed:false});}
 $('result').textContent=latest;$('run').disabled=false;$('copy').disabled=false;
});
$('copy').addEventListener('click',async()=>{
 if(!latest)return;
 try{
  const report=JSON.parse(latest);
  if(report.packageId!==PKG||report.cleanupAuthorized!==false||report.deleteAllowed!==false||!['PASS','BLOCKED'].includes(report.status))throw Error('UNSAFE_REPORT');
  const clip=window.Capacitor?.Plugins?.Clipboard;
  if(!clip?.write)throw Error('CLIPBOARD_MISSING');
  await clip.write({string:latest});
  $('copy').textContent='Скопировано — вставьте JSON в чат';
 }catch{$('copy').textContent='Не удалось скопировать — JSON доступен ниже';}
});
