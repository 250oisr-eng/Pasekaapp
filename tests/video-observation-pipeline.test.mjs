import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../js/video-observation-pipeline.js',import.meta.url),'utf8');
const evidenceCode=await readFile(new URL('../js/video-model-evidence.js',import.meta.url),'utf8');
const root={};new Function('window',code)(root);new Function('window',evidenceCode)(root);
const pipeline=root.PasekaVideoObservationPipeline;
const digest='a'.repeat(64),modelSha='b'.repeat(64);
function fixture(){
 const record={id:'v1',bytes:5,blobSha256:digest,blob:new Blob(['video'],{type:'video/mp4'})};
 const frames=[{atSec:1,width:640,height:360,mimeType:'image/jpeg',dataUrl:'data:image/jpeg;base64,AAAA'},
  {atSec:3,width:640,height:360,mimeType:'image/jpeg',dataUrl:'data:image/jpeg;base64,BBBB'}];
 const preparation={extractTransientFrames:async()=>({ok:true,source:{source:'entrance_media',videoId:'v1',sourceSha256:digest,sourceBytes:5},frames})};
 const evidence=root.PasekaVideoModelEvidence;
 const hasher={hashBlobHex:async()=>digest};
 const adapter={mode:'on_device',infer:async()=>({model:{id:'bee',version:'v1',weightsSha256:modelSha,execution:'on_device'},
  tracks:[{id:'track-1',className:'bee',direction:'in',confidence:0.9,startSec:1,endSec:2}]})};
 return {record,frames,preparation,evidence,hasher,adapter};
}
test('complete mocked local path returns only untrusted draft and clears transient frame references',async()=>{
 const f=fixture();
 const res=await pipeline.runObservationDraft(f.record,f.adapter,f);
 assert.equal(res.ok,true);assert.equal(res.stage,'untrusted_observation_draft');
 assert.equal(res.recognitionSucceeded,false);assert.equal(res.cleanupAuthorized,false);assert.equal(res.reviewRequired,true);
 assert.equal(res.observations.frames[0].dataUrl,undefined);
 assert.equal(f.frames.length,0);
 assert.equal(f.record.blob.size,5);
});
test('source tampering during async model step is rejected without persistence',async()=>{
 const f=fixture();
 f.adapter.infer=async()=>{f.record.blobSha256='f'.repeat(64);return {model:{id:'bee',version:'v1',weightsSha256:modelSha,execution:'on_device'},tracks:[]}};
 const res=await pipeline.runObservationDraft(f.record,f.adapter,f);
 assert.equal(res.reason,'source_changed_after_inference');assert.equal(res.cleanupAuthorized,false);
 assert.equal(f.frames.length,0);
});
test('fake offline/chat provider cannot supply a successful result',async()=>{
 const f=fixture();
 assert.equal((await pipeline.runObservationDraft(f.record,{mode:'cloud',infer:async()=>({answer:'ok'})},f)).reason,'offline_model_adapter_unavailable');
 f.adapter.infer=async()=>({answer:'Видео распознано'});
 assert.equal((await pipeline.runObservationDraft(f.record,f.adapter,f)).reason,'model_provenance_missing');
});
test('provider source ID mismatch and failed detection never mark recognized',async()=>{
 const f=fixture();
 f.adapter.infer=async()=>({source:{source:'entrance_media',videoId:'other',sourceSha256:digest,sourceBytes:5},
  model:{id:'bee',version:'v1',weightsSha256:modelSha,execution:'on_device'},tracks:[]});
 assert.equal((await pipeline.runObservationDraft(f.record,f.adapter,f)).reason,'model_source_disagreement');
});
test('abort, missing model, failed preparation and thrown inference fail closed',async()=>{
 const f=fixture();
 assert.equal((await pipeline.runObservationDraft(f.record,null,f)).reason,'offline_model_adapter_unavailable');
 const ctrl=new AbortController();ctrl.abort();
 assert.equal((await pipeline.runObservationDraft(f.record,f.adapter,{...f,signal:ctrl.signal})).reason,'aborted');
 f.preparation.extractTransientFrames=async()=>({ok:false,reason:'frame_decode_failed',frames:[]});
 assert.equal((await pipeline.runObservationDraft(f.record,f.adapter,f)).reason,'frame_decode_failed');
 f.preparation.extractTransientFrames=async()=>({ok:true,source:{source:'entrance_media',videoId:'v1',sourceSha256:digest,sourceBytes:5},
 frames:f.frames});
 f.adapter.infer=async()=>{throw Error('offline model failed')};
 assert.equal((await pipeline.runObservationDraft(f.record,f.adapter,f)).reason,'model_inference_failed');
});
test('model stage has no network, DB, deletion or automatic browser activation',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/script src="\.\/js\/video-observation-pipeline\.js"/);
 assert.doesNotMatch(sw,/video-observation-pipeline\.js/);
 assert.doesNotMatch(code,/\bfetch\s*\(|\bXMLHttpRequest\b|\.transaction\s*\(|\.objectStore\s*\(|\.delete\s*\(/);
});
