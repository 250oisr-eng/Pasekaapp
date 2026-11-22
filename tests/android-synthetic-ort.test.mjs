import test from 'node:test';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SYNTHETIC_ONNX} from '../scripts/generate-synthetic-onnx.mjs';
const builder=readFileSync(new URL('../scripts/prepare-android-synthetic-ort-apk.mjs',import.meta.url),'utf8');
const runner=readFileSync(new URL('./fixtures/android-synthetic-ort-runner.js',import.meta.url),'utf8');
test('tiny self-authored ONNX has fixed source, no learned weights or external blobs',()=>{
 assert.ok(SYNTHETIC_ONNX.length>50&&SYNTHETIC_ONNX.length<500);
 assert.equal(SYNTHETIC_ONNX.includes(Buffer.from('paseka_synthetic_add_only')),true);
 assert.equal(SYNTHETIC_ONNX.includes(Buffer.from('Add')),true);
 assert.equal(SYNTHETIC_ONNX.includes(Buffer.from('bias')),true);
});
test('isolated Android build never targets real app, test user storage or remote weights',()=>{
 assert.match(builder,/PASEKA_SYNTHETIC_ORT_BUILD/);
 assert.match(builder,/ORIGINAL_APP_ID_REQUIRED/);
 for(const source of [builder,runner]){
  assert.ok(source.includes("'ru.paseka.journal.diagnostic.ortmodule'"));
  assert.ok(!source.includes("'ru.paseka.journal.diagnostic.ortsmoke'"));
 }
 assert.match(builder,/writeFileSync\('www\/synthetic-add.onnx',SYNTHETIC_ONNX\)/);
 assert.match(runner,/executionProviders:\['wasm'\]/);
 assert.match(runner,/ONE_SHOT_ALREADY_ATTEMPTED/);
 assert.match(runner,/beeRecognition:'NOT_TESTED'/);
 assert.match(runner,/cleanup:'NOT_TESTED'/);
 for(const text of [builder,runner]){
  for(const unsafe of [/MediaStore/,/getUserMedia/,/indexedDB/,/deleteDatabase/,/XMLHttpRequest/,/localStorage/,/\.delete\(/,/FileOutputStream/,/https:\/\//])
   assert.doesNotMatch(text,unsafe);
 }
});
test('real ONNX Runtime Web WASM performs math with bundled local runtime bytes',async(t)=>{
 if(process.env.PASEKA_SYNTHETIC_ORT_CI!=='1'){
  t.skip('Only isolated pinned ONNX workflow executes the runtime; generic CI covers safety assertions');return;
 }
 const ort=await import('onnxruntime-web/wasm');
 const runtimeDir=new URL('../node_modules/onnxruntime-web/dist/',import.meta.url);
 const wasmBytes=readFileSync(new URL('ort-wasm-simd-threaded.wasm',runtimeDir));
 ort.env.wasm.numThreads=1;
 // No HTTP/CDN: Node loads JS by local file: URL and WASM via built-in data: URL.
 ort.env.wasm.wasmPaths={
  'ort-wasm-simd-threaded.mjs':new URL('ort-wasm-simd-threaded.mjs',runtimeDir).href,
  'ort-wasm-simd-threaded.wasm':'data:application/wasm;base64,'+wasmBytes.toString('base64')
 };
 const session=await ort.InferenceSession.create(SYNTHETIC_ONNX,{executionProviders:['wasm']});
 try{
  const result=await session.run({x:new ort.Tensor('float32',Float32Array.of(3),[1])});
  assert.equal(result.y.type,'float32');
  assert.equal(result.y.data.length,1);
  assert.equal(result.y.data[0],5);
 }finally{await session.release()}
});

test('Android WebView runtime uses packaged local module via JavaScript Blob and absolute WASM URL',()=>{
 assert.match(runner,/fetch\(mjsUrl\.href,\{cache:'no-store'\}\)/);
 assert.match(runner,/LOCAL_MJS_HTTP_/);
 assert.match(runner,/LOCAL_MJS_NOT_JAVASCRIPT/);
 assert.match(runner,/createObjectURL\(new root\.Blob\(\[js\],\{type:'text\/javascript'\}\)\)/);
 assert.match(runner,/wasmPaths=\{mjs:moduleUrl,wasm:wasmUrl\.href\}/);
 assert.match(runner,/revokeObjectURL\(moduleUrl\)/);
 assert.doesNotMatch(runner,/wasmPaths='\.\/'/);
});

test('synthetic WebView reports PASS only for the exact expected float', async () => {
 for (const output of [5, NaN, Infinity, 5.000000476837158]) {
  const window = {
   location: {href: 'https://localhost/'}, URL, Blob,
   fetch: async () => ({ok:true, text:async () => ' '.repeat(1024)})
  };
  runInNewContext(runner, {window, URL});
  const ort = {
   env: {wasm:{}}, Tensor: class {},
   InferenceSession: {create: async () => ({
    run: async () => ({y:{type:'float32', dims:[1], data:Float32Array.of(output)}}),
    release: async () => {}
   })}
  };
  const report = await window.PasekaSyntheticOrtDiagnostic.run(ort);
  assert.equal(report.code, output === 5 ? 'LOCAL_ONNX_WASM_ADD_2_EXACT' : 'SYNTHETIC_OUTPUT_MISMATCH');
 }
});
