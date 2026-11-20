import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const raw=await readFile(new URL('../js/android-inference-evidence.js',import.meta.url),'utf8');
const root={};new Function('window',raw)(root);const inspect=root.PasekaAndroidInferenceEvidence.inspect;
const good={kind:'physical_android_inference',synthetic:false,execution:'on_device',backend:'wasm_cpu',
 deviceModel:'test-phone',androidVersion:'15',webViewVersion:'123',
 modelId:'model',modelVersion:'v1',modelSha256:'a'.repeat(64),
 testDatasetId:'ground-truth',testDatasetSha256:'b'.repeat(64),
 networkDisconnected:true,offlineReloadConfirmed:true,samplesMs:[10,20,30],
 coldStartMs:100,labeledImages:5,groundTruthObjects:8,
 truePositives:6,falsePositives:2,falseNegatives:2};
test('well-formed report remains unverified and cannot complete recognition or cleanup',()=>{
 const r=inspect({...good,physicalTestVerified:true,licenseVerified:true,recognitionSucceeded:true,cleanupAuthorized:true});
 assert.equal(r.ok,true);assert.equal(r.stage,'android_report_review_required');
 assert.equal(r.reportSummary.precision,0.75);assert.equal(r.reportSummary.recall,0.75);
 assert.equal(r.reportSummary.p95Ms,30);
 for(const k of ['physicalTestVerified','licenseVerified','modelApproved','recognitionSucceeded','cleanupAuthorized'])assert.equal(r[k],false);
});
test('synthetic and cloud report cannot masquerade as physical Android',()=>{
 for(const change of [{synthetic:true},{kind:'synthetic'},{execution:'cloud'},{backend:'webgpu'},
  {networkDisconnected:false},{offlineReloadConfirmed:false}]){
  const r=inspect({...good,...change});assert.equal(r.ok,false);assert.equal(r.cleanupAuthorized,false);
 }
});
test('source hashes, device metadata and samples must be meaningful',()=>{
 for(const change of [{modelSha256:'abc'},{testDatasetSha256:'xyz'},{deviceModel:''},
  {samplesMs:[]},{samplesMs:[1,NaN,3]},{samplesMs:[-1,0,3]},
  {coldStartMs:Infinity},{labeledImages:0},{groundTruthObjects:0},
  {truePositives:9},{falseNegatives:1},{falsePositives:-1}]){
  const r=inspect({...good,...change});assert.equal(r.ok,false,JSON.stringify(change));
 }
});
test('empty positive counts may be valid evidence but not success',()=>{
 const r=inspect({...good,truePositives:0,falseNegatives:8,falsePositives:0});
 assert.equal(r.ok,true);assert.equal(r.reportSummary.precision,0);
 assert.equal(r.reportSummary.recall,0);assert.equal(r.recognitionSucceeded,false);
});
test('report schema remains staging only without network, storage or video deletion',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/android-inference-evidence\.js/);assert.doesNotMatch(sw,/android-inference-evidence\.js/);
 assert.doesNotMatch(raw,/\bfetch\s*\(|XMLHttpRequest|indexedDB|\.delete\s*\(|MediaStore|\.transaction\s*\(/);
});
