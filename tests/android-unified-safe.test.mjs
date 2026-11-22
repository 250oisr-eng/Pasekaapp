import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const runner=readFileSync('diagnostics/phone-all/runner.js','utf8');
const build=readFileSync('scripts/prepare-android-unified-safe.mjs','utf8');
const fixture=readFileSync('diagnostics/phone-all/synthetic-mp4.js','utf8');
const guard=readFileSync('diagnostics/phone-all/archive-guard.js','utf8');
const decoder=readFileSync('diagnostics/phone-all/frame-preparation.js','utf8');
test('exact isolated package and explicit build flag',()=>{
 assert.match(build,/PASEKA_UNIFIED_SAFE_BUILD/);
 assert.match(build,/config\.appId!=='ru\.paseka\.journal'/);
 assert.match(build,/ru\.paseka\.journal\.diagnostic\.allchecks/);
 assert.doesNotMatch(build,/web:prepare/);
});
test('source MP4 bytes pinned to known hash, no user footage',()=>{
 const m=fixture.match(/SYNTHETIC_MP4_BASE64='([^']+)'/);
 assert.ok(m); const bytes=Buffer.from(m[1],'base64');
 assert.equal(bytes.length,1720);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'29c801c7ffbeabc3796ffd265f8b8e465232c671eeeacfafd8e25e2fb105bd49');
});
test('pure synthetic ONNX generator contains Add operation',async()=>{
 const {SYNTHETIC_ONNX}=await import('../scripts/generate-synthetic-onnx.mjs');
 assert.ok(SYNTHETIC_ONNX.length>50&&SYNTHETIC_ONNX.length<500);
 assert.ok(SYNTHETIC_ONNX.includes(Buffer.from('paseka_synthetic_add_only')));
});
test('real transient decoder and archive guard, no model recognition or cleanup capability',()=>{
 assert.match(decoder,/recognitionSucceeded:false,cleanupAuthorized:false/);
 assert.match(guard,/cleanupAuthorized:false,restoreAuthorized:false/);
 assert.match(runner,/executionProviders:\['wasm'\]/);
 assert.match(runner,/extractTransientFrames\(/);
 assert.match(runner,/PasekaAndroidArchivePreflight/);
 assert.match(runner,/cleanupAuthorized:false,deleteAllowed:false,restoreAuthorized:false/);
});
test('all checks report individually and some FAIL always blocks overall',()=>{
 for(const id of ['storage','archiveMetadata','syntheticFrames','localOnnxWasm'])assert.match(runner,new RegExp('report.checks.'+id+'=await probe'));
 assert.match(runner,/every\(x=>x.status==='PASS'\)/);
 assert.match(runner,/realVideos:'NOT_TESTED'/);
 assert.match(runner,/beeRecognition:'NOT_TESTED'/);
 assert.match(runner,/networkTraffic:'NOT_MEASURED'/);
});
test('no accesses to product, camera, real media, deletion, upload or external service',()=>{
 for(const data of [runner,build]){
  for(const pattern of [/MediaStore/,/navigator\.mediaDevices/,/getUserMedia/,/\.delete\s*\(/,/deleteDatabase\s*\(/,/XMLHttpRequest/,/https:\/\/api\./,/entrance_media_store/,/PASEKA01/])
   assert.doesNotMatch(data,pattern);
 }
 assert.match(runner,/UNKNOWN_FIXTURE_BYTES_PRESERVE/);
 assert.match(runner,/\.add\(new Blob\(\[bytes\]/);
 assert.doesNotMatch(runner,/\.put\(/);
});
