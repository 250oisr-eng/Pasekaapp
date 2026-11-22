import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
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
test('real ONNX Runtime Web WASM performs math with locally served runtime assets',async()=>{
 const ort=await import('onnxruntime-web/wasm');
 let requests=0;
 const server=createServer((req,res)=>{
  const filename=String(req.url||'').replace(/^\//,'');
  if(!/^ort-wasm-simd-threaded(?:\.jsep)?\.(?:wasm|mjs)$/.test(filename)){
   res.writeHead(404);res.end();return;
  }
  requests++;
  try{
   const file=readFileSync(resolve('node_modules/onnxruntime-web/dist',filename));
   res.writeHead(200,{'content-type':filename.endsWith('.wasm')?'application/wasm':'text/javascript'});
   res.end(file);
  }catch{res.writeHead(404);res.end()}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 let session;
 try{
  const addr=server.address();
  ort.env.wasm.numThreads=1;
  ort.env.wasm.wasmPaths='http://127.0.0.1:'+addr.port+'/';
  session=await ort.InferenceSession.create(SYNTHETIC_ONNX,{executionProviders:['wasm']});
  const result=await session.run({x:new ort.Tensor('float32',Float32Array.of(3),[1])});
  assert.equal(result.y.type,'float32');
  assert.equal(result.y.data.length,1);
  assert.equal(result.y.data[0],5);
  assert.ok(requests>0,'WASM bytes must be loaded from loopback, not public CDN');
 }finally{
  if(session)await session.release();
  await new Promise(resolve=>server.close(resolve));
 }
});
