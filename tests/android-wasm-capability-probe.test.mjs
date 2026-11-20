import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../js/android-wasm-capability-probe.js',import.meta.url),'utf8');
const root={};new Function('window',code)(root);
const probe=root.PasekaAndroidWasmProbe.probe;
function env(extra={}){return {WebAssembly:{validate:()=>true,instantiate:async()=>({})},navigator:{deviceMemory:4,hardwareConcurrency:8},...extra}}
test('WASM prerequisite success is never equivalent to a licensed or working bee model',()=>{
 const result=probe(env({crossOriginIsolated:true,Worker:class {},SharedArrayBuffer:class {}}));
 assert.equal(result.ok,true);
 assert.equal(result.stage,'prerequisites_only');
 assert.equal(result.features.sharedMemoryCandidate,true);
 assert.equal(result.modelReady,false);
 assert.equal(result.recognitionSucceeded,false);
 assert.equal(result.cleanupAuthorized,false);
 assert.equal(Object.isFrozen(result),true);
});
test('missing, corrupt and throwing WASM APIs fail closed',()=>{
 for(const value of [undefined,{}, {validate:()=>false,instantiate:async()=>({})},
  {validate:()=>{throw Error('blocked')},instantiate:async()=>({})}]){
  const result=probe(env({WebAssembly:value}));
  assert.equal(result.ok,false);
  assert.equal(result.modelReady,false);
  assert.equal(result.cleanupAuthorized,false);
 }
});
test('browser privacy restrictions or unknown device metrics do not invent capacity',()=>{
 const result=probe(env({navigator:{hardwareConcurrency:0,deviceMemory:NaN},
  crossOriginIsolated:false,SharedArrayBuffer:class {}}));
 assert.equal(result.ok,true);
 assert.equal(result.features.deviceMemoryGiB,null);
 assert.equal(result.features.logicalCores,null);
 assert.equal(result.features.sharedMemoryCandidate,false);
 assert.equal(result.modelReady,false);
});
test('module remains inactive, network-free, no video source read or deletion paths',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/android-wasm-capability-probe\.js/);
 assert.doesNotMatch(sw,/android-wasm-capability-probe\.js/);
 assert.doesNotMatch(code,/\bfetch\s*\(|\bXMLHttpRequest\b|indexedDB|\.delete\s*\(|getUserMedia|MediaStore/);
});
