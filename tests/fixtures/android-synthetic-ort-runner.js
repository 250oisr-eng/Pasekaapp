// Offline test-only WebView WASM math; this is not a bee model or recognition.
(function(root){
'use strict';
const PKG='ru.paseka.journal.diagnostic.ortsmoke';
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
 try {
  ort.env.wasm.numThreads=1;
  ort.env.wasm.wasmPaths='./';
  const model=new URL('./synthetic-add.onnx',root.location.href);
  // Browser loads only packaged app assets; no remote models or media.
  session=await ort.InferenceSession.create(model.href,{executionProviders:['wasm']});
  const input=new ort.Tensor('float32',Float32Array.from([3]),[1]);
  const results=await session.run({x:input});
  const y=results?.y;
  if(!y||y.type!=='float32'||y.dims?.length!==1||y.dims[0]!==1||
    y.data?.length!==1||Math.abs(y.data[0]-5)>1e-6)
    return status('BLOCKED','SYNTHETIC_OUTPUT_MISMATCH');
  return status('PASS','LOCAL_ONNX_WASM_ADD_2_EXACT',{input:3,output:5});
 }catch(error){
  return status('BLOCKED','ORT_ERROR_'+String(error?.message||'UNKNOWN').slice(0,80));
 }finally{try{await session?.release?.()}catch(_){}}
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
