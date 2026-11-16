import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../js/bee-detector.js',import.meta.url),'utf8');
const api={}; new Function('window',source)(api);
const detector=api.PasekaBeeDetector;
const manifest={id:'paseka-bee-detector',version:'0.1.0',task:'bee_detection',format:'tflite',sha256:'a'.repeat(64),license:'Apache-2.0',labels:['bee','wasp','drone'],validatedOnHiveVideo:true};
test('detector stays unavailable without validated model and runtime',()=>{const a=detector.createBeeDetectorAdapter({});assert.equal(a.status,'unavailable');assert.equal(a.reason,'model_not_validated_or_manifest_invalid');});
test('manifest requires checksum, license, bee label and hive-video validation',()=>{assert.equal(detector.validateModelManifest(manifest).ok,true);const r=detector.validateModelManifest({...manifest,sha256:'bad',license:'',labels:['wasp'],validatedOnHiveVideo:false});assert.equal(r.ok,false);for(const e of ['model_checksum_missing_or_invalid','model_license_missing','bee_label_missing','hive_video_validation_missing'])assert.ok(r.errors.includes(e));});
test('normalizer rejects malformed boxes, unsupported classes and low confidence',()=>{const r=detector.normalizeDetections([{label:'bee',confidence:.9,box:{x:.1,y:.2,width:.2,height:.2}},{label:'bee',confidence:.2,box:{x:0,y:0,width:.2,height:.2}},{label:'bee',confidence:.9,box:{x:.9,y:.9,width:.2,height:.2}},{label:'bird',confidence:.99,box:{x:0,y:0,width:.2,height:.2}}]);assert.equal(r.ok,true);assert.equal(r.detections.length,1);assert.equal(r.detections[0].className,'bee');});
test('adapter normalizes detections and contains runtime errors',async()=>{const a=detector.createBeeDetectorAdapter({manifest,runtime:{async detect(){return [{label:'bee',confidence:.91,box:{x:.2,y:.3,width:.1,height:.1}}]}}});assert.equal(a.status,'ready');const r=await a.detectFrame({timestampMs:100});assert.equal(r.ok,true);assert.equal(r.detections.length,1);const b=detector.createBeeDetectorAdapter({manifest,runtime:{async detect(){throw new Error('native bridge unavailable')}}});const fail=await b.detectFrame({});assert.equal(fail.status,'inference_error');assert.equal(fail.reason,'runtime_failure');});

test('Capacitor runtime passes only local frame paths and preserves unavailable status',async()=>{
 const calls=[];
 const runtime=detector.createCapacitorRuntime({async detectFrame(options){calls.push(options);return {status:'unavailable',reason:'model_not_installed'};}});
 assert.deepEqual(await runtime.detect({path:'/app/cache/frame-001.jpg'}),{status:'unavailable',reason:'model_not_installed'});
 assert.deepEqual(calls,[{framePath:'/app/cache/frame-001.jpg'}]);
 await assert.rejects(()=>runtime.detect({}),/local frame path is required/i);
});
test('adapter propagates native unavailable state without reporting zero bee activity',async()=>{
 const adapter=detector.createBeeDetectorAdapter({manifest,runtime:detector.createCapacitorRuntime({async detectFrame(){return {status:'unavailable',reason:'model_not_installed'};}})});
 const result=await adapter.detectFrame({path:'/app/cache/frame.jpg'});
 assert.equal(result.ok,false);
 assert.equal(result.status,'unavailable');
 assert.equal(result.reason,'model_not_installed');
 assert.deepEqual(result.detections,[]);
});

test('native Capacitor plugin registration is optional on web and named consistently on Android',()=>{
 let registeredName=null;
 const plugin={async detectFrame(){return {status:'unavailable',reason:'model_not_installed'};}};
 assert.equal(detector.registerNativePlugin(null),null);
 assert.equal(detector.registerNativePlugin({registerPlugin(name){registeredName=name;return plugin;}}),plugin);
 assert.equal(registeredName,'BeeDetector');
});

test('Capacitor runtime treats malformed native responses as unavailable, not zero detections',async()=>{
 for (const malformed of [null,undefined,{}, {status:'ok'}, {detections:null}]) {
  const runtime=detector.createCapacitorRuntime({async detectFrame(){return malformed;}});
  assert.deepEqual(await runtime.detect({path:'/app/cache/frame.jpg'}),{status:'unavailable',reason:'native_response_invalid'});
 }
});
