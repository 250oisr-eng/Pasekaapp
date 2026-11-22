// Offline test-only WebView WASM math; this is not a bee model or recognition.
(function(root){
'use strict';
const PKG='ru.paseka.journal.diagnostic.ortmodule';
let attempted=false;
const status=(result,code,extra={})=>({status:result,code,packageId:PKG,
 model:'SELF_AUTHORED_SYNTHETIC_ADD_2_ONLY',
 runtime:result==='PASS'?'PASS':'BLOCKED',
 beeRecognition:'NOT_TESTED',videoAccess:'NOT_ATTEMPTED',
 cleanup:'NOT_TESTED',externalRequests:'NOT_ATTEMPTED',...extra});
async function run(ort=root.ort){
 if(attempted)return status('BLOCKED','ONE_SHOT_ALREADY_ATTEMPTED');
 attempted=true;
 if(!ort||!ort.InferenceSession||!ort.Tensor)return status('BLOCKED','ORT_UNAVAILABLE');
 let session;
 let moduleUrl;
 try {
  ort.env.wasm.numThreads=1;
  // Android WebView may not serve .mjs with an importable MIME type.
  // Read only the APK-bundled script and import it through a local JS Blob URL.
  // WASM stays at its packaged absolute URL; no CDN or user storage is used.
  const mjsUrl=new URL('./ort-wasm-simd-threaded.mjs',root.location.href);
  const wasmUrl=new URL('./ort-wasm-simd-threaded.wasm',root.location.href);
  const response=await root.fetch(mjsUrl.href,{cache:'no-store'});
  if(!response.ok)throw Error('LOCAL_MJS_HTTP_'+response.status);
  const js=await response.text();
  if(js.length<1000||/^\s*<!doctype html/i.test(js)||/^\s*<html/i.test(js))
    throw Error('LOCAL_MJS_NOT_JAVASCRIPT');
  moduleUrl=root.URL.createObjectURL(new root.Blob([js],{type:'text/javascript'}));
  ort.env.wasm.wasmPaths={mjs:moduleUrl,wasm:wasmUrl.href};
  const model=new URL('./synthetic-add.onnx',root.location.href);
  // Browser loads only packaged app assets; no remote models or media.
  session=await ort.InferenceSession.create(model.href,{executionProviders:['wasm']});
  const input=new ort.Tensor('float32',Float32Array.from([3]),[1]);
  const results=await session.run({x:input});
  const y=results?.y;
  if(!y||y.type!=='float32'||y.dims?.length!==1||y.dims[0]!==1||
    y.data?.length!==1||y.data[0]!==5)
    return status('BLOCKED','SYNTHETIC_OUTPUT_MISMATCH');
  return status('PASS','LOCAL_ONNX_WASM_ADD_2_EXACT',{input:3,output:5});
 }catch(error){
  return status('BLOCKED','ORT_ERROR_'+String(error?.message||'UNKNOWN').slice(0,80));
 }finally{try{await session?.release?.()}catch(_){} try{if(moduleUrl)root.URL.revokeObjectURL(moduleUrl)}catch(_){}}
}
function attach(){
 const button=root.document.getElementById('run-ort-diagnostic');
 const result=root.document.getElementById('diagnostic-result');
 if(!button||!result)throw Error('DIAGNOSTIC_UI_MISSING');
 button.addEventListener('click',async()=>{
  button.disabled=true;result.textContent='Проверка локального ONNX WASM…';
  result.textContent=JSON.stringify(await run(),null,2);
 },{once:true});
}
root.PasekaSyntheticOrtDiagnostic=Object.freeze({run,attach});
if(root.document)root.document.addEventListener('DOMContentLoaded',attach);
})(typeof window!=='undefined'?window:globalThis);
