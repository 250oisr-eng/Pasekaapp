import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../js/offline-inference-benchmark.js',import.meta.url),'utf8');
const root={};new Function('window',source)(root);
const benchmark=root.PasekaOfflineInferenceBenchmark.benchmark;
const adapter={mode:'on_device',runSynthetic:async()=>({boxes:[{score:1}]})};
function clock(values){let index=0;return {now:()=>values[index++]}}
test('synthetic timing is deterministic and cannot verify a detector or permit deletion',async()=>{
 const result=await benchmark(adapter,{runs:4,clock:clock([0,10,10,30,30,60,60,100])});
 assert.equal(result.ok,true);assert.deepEqual([...result.samplesMs],[10,20,30,40]);
 assert.equal(result.minMs,10);assert.equal(result.medianMs,20);
 assert.equal(result.p95Ms,40);assert.equal(result.maxMs,40);
 assert.equal(result.modelReady,false);assert.equal(result.recognitionSucceeded,false);
 assert.equal(result.cleanupAuthorized,false);assert.equal(Object.isFrozen(result.samplesMs),true);
});
test('cloud adapter and malformed parameters fail closed',async()=>{
 for(const candidate of [null,{}, {mode:'cloud',runSynthetic:adapter.runSynthetic},
  {mode:'on_device',infer:()=>{}}]){
  assert.equal((await benchmark(candidate)).reason,'local_adapter_required');
 }
 for(const runs of [0,-1,21,1.2,NaN,Infinity]){
  assert.equal((await benchmark(adapter,{runs})).reason,'invalid_benchmark_options');
 }
 assert.equal((await benchmark(adapter,{clock:{}})).reason,'invalid_benchmark_options');
});
test('failed, backwards, stalled-in-wall-time, aborted benchmark fails closed',async()=>{
 assert.equal((await benchmark(adapter,{runs:1,clock:clock([5,4])})).reason,'invalid_clock');
 assert.equal((await benchmark(adapter,{runs:1,clock:clock([0,600001])})).reason,'invalid_clock');
 assert.equal((await benchmark({...adapter,runSynthetic:async()=>{throw Error('fail')}},{
  runs:1,clock:clock([0])})).reason,'synthetic_inference_failed');
 const ctrl=new AbortController();ctrl.abort();
 assert.equal((await benchmark(adapter,{signal:ctrl.signal,clock:clock([0,1])})).reason,'aborted');
});
test('no video, database, network, model bootstrap or UI activation',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/offline-inference-benchmark\.js/);
 assert.doesNotMatch(sw,/offline-inference-benchmark\.js/);
 assert.doesNotMatch(source,/\bfetch\s*\(|\bindexedDB\b|\.delete\s*\(|getUserMedia|MediaStore|\.transaction\s*\(|new Blob/);
});
