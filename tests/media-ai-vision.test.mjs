import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMediaInput } from '../cloudflare/media-validation.mjs';

await import('../js/media-ai-client.js');
const MediaAI=globalThis.PasekaMediaAIClient;
const context=()=>({
 modelIntegrity:{status:'ok',errorCount:0,warningCount:0},
 selectedHive:{id:'hive-1',constructionProfile:{id:'farrar-6x6-v1',status:'ready'}}
});
const jpeg='data:image/jpeg;base64,AAAA';
const image=()=>({kind:'image',frames:[{timeSec:null,dataUrl:jpeg}]});
const video=()=>({kind:'video',durationSec:60,frames:[
 {timeSec:10,dataUrl:jpeg},{timeSec:20,dataUrl:jpeg},{timeSec:30,dataUrl:jpeg}
]});

test('vision media validator accepts one JPEG image with a ready supported hive profile',()=>{
 const result=validateMediaInput(image(),context());
 assert.equal(result.ok,true);
 assert.equal(result.frames.length,1);
});

test('vision media validator accepts a bounded video sample with increasing timestamps',()=>{
 const result=validateMediaInput(video(),context());
 assert.equal(result.ok,true);
 assert.deepEqual(result.frames.map(frame=>frame.timeSec),[10,20,30]);
});

test('vision media validator rejects unsupported hive profiles instead of mixing technologies',()=>{
 const data=context();data.selectedHive.constructionProfile={id:'sectional-multi-queen-v1',status:'ready'};
 const result=validateMediaInput(image(),data);
 assert.equal(result.ok,false);
 assert.equal(result.status,409);
});

test('vision media validator requires a confirmed model-integrity status',()=>{
 const data=context();data.modelIntegrity.status='errors';
 assert.equal(validateMediaInput(image(),data).ok,false);
 assert.equal(validateMediaInput(image(),{selectedHive:data.selectedHive}).ok,false);
});

test('vision media validator rejects remote URLs, non-JPEG data and malformed base64',()=>{
 for(const dataUrl of ['https://example.com/image.jpg','data:image/png;base64,AAAA','data:image/jpeg;base64,!!!']){
  assert.equal(validateMediaInput({kind:'image',frames:[{dataUrl}]},context()).ok,false);
 }
});

test('vision media validator enforces frame count, frame size and video timestamps',()=>{
 assert.equal(validateMediaInput({kind:'image',frames:[]},context()).ok,false);
 assert.equal(validateMediaInput({kind:'video',durationSec:60,frames:[{timeSec:1,dataUrl:jpeg}]},context()).ok,false);
 const tooLarge='data:image/jpeg;base64,'+'A'.repeat(470001);
 assert.equal(validateMediaInput({kind:'image',frames:[{dataUrl:tooLarge}]},context()).ok,false);
 const duplicateTimes={...video(),frames:[{timeSec:10,dataUrl:jpeg},{timeSec:10,dataUrl:jpeg},{timeSec:30,dataUrl:jpeg}]};
 assert.equal(validateMediaInput(duplicateTimes,context()).ok,false);
 const outOfRange={...video(),durationSec:19};
 assert.equal(validateMediaInput(outOfRange,context()).ok,false);
});

test('browser media client samples video at evenly spaced interior timestamps',()=>{
 assert.deepEqual(MediaAI.sampleTimes(60,5),[10,20,30,40,50]);
 assert.deepEqual(MediaAI.sampleTimes(30,3),[7.5,15,22.5]);
});

test('browser media client rejects invalid sample parameters and exposes bounded payload limits',()=>{
 assert.throws(()=>MediaAI.sampleTimes(0,5),/Некорректные параметры/);
 assert.throws(()=>MediaAI.sampleTimes(60,2),/Некорректные параметры/);
 assert.ok(MediaAI.limits.maxImageBytes<350*1024);
 assert.ok(MediaAI.limits.maxVideoFrameBytes<300*1024);
 assert.equal(MediaAI.limits.videoFrameCount,5);
});
