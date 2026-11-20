import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const raw=await readFile(new URL('../js/video-model-evidence.js',import.meta.url),'utf8');
const root={};new Function('window',raw)(root);const api=root.PasekaVideoModelEvidence;
const a='a'.repeat(64),b='b'.repeat(64);
const good={source:{source:'entrance_media',videoId:'v1',sourceSha256:a,sourceBytes:123},
 model:{id:'bee-local',version:'v1',weightsSha256:b,execution:'on_device'},
 frames:[{atSec:1,width:640,height:360,mimeType:'image/jpeg'},
 {atSec:3,width:640,height:360,mimeType:'image/jpeg'}],
 tracks:[{id:'t1',className:'bee',direction:'in',confidence:0.8,startSec:1,endSec:2,pollen:false}]};
test('well-shaped observational data never authorizes recognition or video deletion',()=>{
 const r=api.validateDraft(good);
 assert.equal(r.ok,true);
 assert.equal(r.stage,'untrusted_observation_draft');
 assert.equal(r.reviewRequired,true);assert.equal(r.recognitionSucceeded,false);assert.equal(r.cleanupAuthorized,false);
 assert.equal(r.observations.model.weightsSha256,b);
 assert.deepEqual(r.observations.tracks,[good.tracks[0]]);
});
test('fake text chat reply, missing model provenance and invalid SHA are rejected',()=>{
 for(const v of [{answer:'Пчёлы распознаны'},{...good,model:{id:'bee-local',version:'v1',execution:'on_device'}},
 {...good,source:{...good.source,sourceSha256:'bad'}},
 {...good,model:{...good.model,execution:'cloud'}},
 {...good,source:{...good.source,sourceBytes:0}}]){
  const out=api.validateDraft(v);assert.equal(out.ok,false);
  assert.equal(out.recognitionSucceeded,false);assert.equal(out.cleanupAuthorized,false);
 }
});
test('frame evidence is ordered, bounded and cannot contain images or raw frames',()=>{
 for(const frames of [
  [{...good.frames[0]}],Array.from({length:5},(_,i)=>({...good.frames[0],atSec:i+1})),
  [...good.frames].reverse(),[{...good.frames[0],dataUrl:'data:image/jpeg;base64,AAAA'},good.frames[1]],
  [{...good.frames[0],width:800},good.frames[1]], [{...good.frames[0],mimeType:'video/mp4'},good.frames[1]]]){
  assert.equal(api.validateDraft({...good,frames}).ok,false);
 }
});
test('tracks are unique bounded and cannot overclaim invalid classifications',()=>{
 for(const tracks of [
  [...good.tracks,good.tracks[0]],
  [{...good.tracks[0],confidence:1.01}],
  [{...good.tracks[0],className:'queen' }],
  [{...good.tracks[0],endSec:4 }],
  [{...good.tracks[0],pollenConfidence:NaN }],
  [{...good.tracks[0],direction:'teleport' }]
 ])assert.equal(api.validateDraft({...good,tracks}).reason,'track_evidence_invalid');
 assert.equal(api.validateDraft({...good,tracks:[]}).ok,true);
});
test('module is isolated: no UI load, Worker access, network, database or original cleanup',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/script src="\.\/js\/video-model-evidence\.js"/);
 assert.doesNotMatch(sw,/video-model-evidence\.js/);
 assert.doesNotMatch(raw,/\bfetch\s*\(|\.transaction\s*\(|\.delete\s*\(|\.put\s*\(|\.add\s*\(/);
});
