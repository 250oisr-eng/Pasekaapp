(function(root){
'use strict';
// Staging only. Measures injected local adapter timing; never examines video, loads models,
// persists results, grants trust or invokes cleanup. This is NOT real Android model validation.
const fail=(reason)=>Object.freeze({ok:false,reason,modelReady:false,recognitionSucceeded:false,cleanupAuthorized:false});
function percentile(sorted,p){return sorted[Math.ceil(p*sorted.length)-1]}
async function benchmark(adapter,options={}){
 if(!adapter||adapter.mode!=='on_device'||typeof adapter.runSynthetic!=='function')
   return fail('local_adapter_required');
 const runs=options.runs===undefined?5:options.runs;
 const clock=options.clock||root.performance;
 if(!Number.isSafeInteger(runs)||runs<1||runs>20||!clock||typeof clock.now!=='function')
   return fail('invalid_benchmark_options');
 if(options.signal?.aborted)return fail('aborted');
 const samples=[];
 try{
  for(let i=0;i<runs;i++){
   if(options.signal?.aborted)return fail('aborted');
   const before=clock.now();
   if(!Number.isFinite(before))return fail('invalid_clock');
   // Synthetic adapter MUST generate its own dummy tensors; neither a video nor actual frames
   // are accepted by this interface. Adapter's output is deliberately ignored.
   await adapter.runSynthetic({signal:options.signal});
   if(options.signal?.aborted)return fail('aborted');
   const after=clock.now();
   const ms=after-before;
   if(!Number.isFinite(ms)||ms<0||ms>600000)return fail('invalid_clock');
   samples.push(ms);
  }
 }catch(_){return fail(options.signal?.aborted?'aborted':'synthetic_inference_failed')}
 const sorted=samples.slice().sort((a,b)=>a-b);
 return Object.freeze({ok:true,stage:'synthetic_timing_only',
  samplesMs:Object.freeze(samples),minMs:sorted[0],medianMs:percentile(sorted,0.5),
  p95Ms:percentile(sorted,0.95),maxMs:sorted[sorted.length-1],
  modelReady:false,recognitionSucceeded:false,cleanupAuthorized:false});
}
root.PasekaOfflineInferenceBenchmark=Object.freeze({benchmark});
})(typeof window!=='undefined'?window:globalThis);
