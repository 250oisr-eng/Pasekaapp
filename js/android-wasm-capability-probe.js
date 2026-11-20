(function(root){
'use strict';
// Isolated, read-only WASM prerequisites probe. NOT an inference benchmark or model approval.
const failure=(reason,features={})=>Object.freeze({ok:false,reason,features,
 modelReady:false,recognitionSucceeded:false,cleanupAuthorized:false});
function probe(env=root){
 try{
  const wasm=env&&env.WebAssembly;
  if(!wasm||typeof wasm.validate!=='function'||typeof wasm.instantiate!=='function')
   return failure('wasm_unavailable');
  // Known minimal valid WebAssembly module: magic + version; no model weights, I/O or network.
  const header=new Uint8Array([0,97,115,109,1,0,0,0]);
  if(wasm.validate(header)!==true)return failure('wasm_validation_failed');
  const nav=env.navigator;
  const memory=nav&&typeof nav.deviceMemory==='number'&&Number.isFinite(nav.deviceMemory)&&nav.deviceMemory>0
    ?nav.deviceMemory:null;
  const cores=nav&&Number.isSafeInteger(nav.hardwareConcurrency)&&nav.hardwareConcurrency>0
    ?nav.hardwareConcurrency:null;
  const features=Object.freeze({wasm:true,deviceMemoryGiB:memory,logicalCores:cores,
   crossOriginIsolated:env.crossOriginIsolated===true,
   workerAvailable:typeof env.Worker==='function',
   // SharedArrayBuffer presence alone does not establish multi-threaded ORT viability.
   sharedMemoryCandidate:env.crossOriginIsolated===true&&typeof env.SharedArrayBuffer==='function'});
  return Object.freeze({ok:true,stage:'prerequisites_only',features,
   modelReady:false,recognitionSucceeded:false,cleanupAuthorized:false});
 }catch(_error){return failure('wasm_probe_failed')}
}
root.PasekaAndroidWasmProbe=Object.freeze({probe});
})(typeof window!=='undefined'?window:globalThis);
