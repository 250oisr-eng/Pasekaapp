import test from 'node:test';
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
 assert.match(builder,/ru\.paseka\.journal\.diagnostic\.ortsmoke/);
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
test('real onnxruntime web wasm executes simple local numeric ONNX model',async(t)=>{
 let ort;
 try{ort=await import('onnxruntime-web/wasm')}catch{t.skip('ORT_WEB_NOT_INSTALLED');return}
 const session=await ort.InferenceSession.create(SYNTHETIC_ONNX,{executionProviders:['wasm']});
 try{
  const result=await session.run({x:new ort.Tensor('float32',Float32Array.of(3),[1])});
  assert.equal(result.y.type,'float32');
  assert.equal(result.y.data.length,1);
  assert.equal(result.y.data[0],5);
 }finally{await session.release()}
});
