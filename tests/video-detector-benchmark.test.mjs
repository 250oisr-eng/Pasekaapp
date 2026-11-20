import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const raw=await readFile(new URL('../js/video-detector-benchmark.js',import.meta.url),'utf8');
const root={};new Function('window',raw)(root);
const api=root.PasekaVideoDetectorBenchmark;
const bb=[0.1,0.1,0.2,0.2],gt={className:'bee',box:bb},pred={...gt,confidence:0.9};
test('synthetic perfect IoU gives exact precision and recall but never approves a model',()=>{
 const result=api.evaluateDetector([{id:'f1',groundTruth:[gt],predicted:[pred]}]);
 assert.equal(result.ok,true);assert.equal(result.overall.tp,1);
 assert.equal(result.overall.precision,1);assert.equal(result.overall.recall,1);
 assert.equal(result.modelValidated,false);assert.equal(result.trackingValidated,false);
 assert.equal(result.cleanupAuthorized,false);
});
test('one ground-truth cannot match multiple detections and class mismatch yields FP and FN',()=>{
 const r=api.evaluateDetector([{id:'f1',groundTruth:[gt],predicted:[pred,pred,{...pred,className:'wasp'}]}]);
 assert.deepEqual([r.overall.tp,r.overall.fp,r.overall.fn],[1,2,0]);
 const mismatch=api.evaluateDetector([{id:'f1',groundTruth:[gt],predicted:[{...pred,className:'wasp'}]}]);
 assert.deepEqual([mismatch.overall.tp,mismatch.overall.fp,mismatch.overall.fn],[0,1,1]);
});
test('low confidence and no matches yield zero recall and non-invented precision',()=>{
 const r=api.evaluateDetector([{id:'f1',groundTruth:[gt],predicted:[{...pred,confidence:0.2}]}]);
 assert.equal(r.overall.precision,null);assert.equal(r.overall.recall,0);
 const empty=api.evaluateDetector([{id:'none',groundTruth:[],predicted:[]}]);
 assert.equal(empty.overall.precision,null);assert.equal(empty.overall.recall,null);
});
test('malformed boxes, extra frames, duplicate frames or unverified confidences fail closed',()=>{
 for(const bad of [
  [{id:'f1',groundTruth:[{...gt,box:[0.9,0.9,0.2,0.2]}],predicted:[pred]}],
  [{id:'f1',groundTruth:[gt],predicted:[{...pred,confidence:NaN}]}],
  [{id:'f1',groundTruth:[gt],predicted:[pred]},{id:'f1',groundTruth:[],predicted:[]}],
  Array.from({length:101},(_,i)=>({id:'f'+i,groundTruth:[],predicted:[]}))
 ]){const r=api.evaluateDetector(bad);assert.equal(r.ok,false);assert.equal(r.modelValidated,false)}
 assert.equal(api.evaluateDetector([],{}).ok,false);
 assert.equal(api.evaluateDetector([{id:'f',groundTruth:[],predicted:[]}],{iou:0}).ok,false);
});
test('static test-only benchmark does not load in UI and cannot send frames',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/src="\.\/js\/video-detector-benchmark\.js"/);
 assert.doesNotMatch(sw,/video-detector-benchmark\.js/);
 assert.doesNotMatch(raw,/\bfetch\s*\(|\bXMLHttpRequest\b|\bindexedDB\b|\.transaction\s*\(/);
});
