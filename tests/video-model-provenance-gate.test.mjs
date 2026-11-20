import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const raw=await readFile(new URL('../js/video-model-provenance-gate.js',import.meta.url),'utf8');
const root={};new Function('window',raw)(root);
const inspect=root.PasekaVideoModelProvenanceGate.inspect;
const candidate={id:'candidate-1',version:'v1',weightsSha256:'a'.repeat(64),weightsBytes:42,
 weightsSourceUrl:'https://example.org/model.onnx',weightsLicenseSpdx:'Apache-2.0',
 weightsLicenseEvidenceUrl:'https://example.org/LICENSE',baseWeightsSourceUrl:'https://example.org/base',
 baseWeightsLicenseSpdx:'Apache-2.0',baseWeightsLicenseEvidenceUrl:'https://example.org/base-license',
 trainingDatasetSourceUrl:'https://example.org/dataset',trainingDatasetLicenseSpdx:'CC-BY-4.0',
 trainingDatasetLicenseEvidenceUrl:'https://example.org/dataset-license',
 task:'honeybee_object_detection',format:'onnx'};
test('complete evidence never authorizes licensing, inference or deletion',()=>{
 const r=inspect({...candidate,approved:true,licenseVerified:true,cleanupAuthorized:true});
 assert.equal(r.ok,true);assert.equal(r.stage,'provenance_review_required');
 for(const key of ['licenseVerified','modelApproved','canRunInference','recognitionSucceeded','cleanupAuthorized'])assert.equal(r[key],false);
 assert.equal(Object.isFrozen(r.evidence),true);assert.equal(r.evidence.approved,undefined);
});
test('all required provenance fields are fail-closed',()=>{
 for(const key of ['weightsSha256','weightsBytes','weightsSourceUrl','weightsLicenseSpdx','weightsLicenseEvidenceUrl',
 'baseWeightsSourceUrl','baseWeightsLicenseSpdx','baseWeightsLicenseEvidenceUrl','trainingDatasetSourceUrl',
 'trainingDatasetLicenseSpdx','trainingDatasetLicenseEvidenceUrl','task','format']){
  const invalid={...candidate};delete invalid[key];const r=inspect(invalid);
  assert.equal(r.ok,false,key);assert.equal(r.reason,'incomplete_provenance');assert.ok(r.missing.includes(key));
  assert.equal(r.cleanupAuthorized,false);
 }
});
test('unsafe URLs, non-ONNX formats, invalid SHA and IDs are rejected',()=>{
 for(const changes of [{weightsSourceUrl:'http://example.org/m'},{trainingDatasetSourceUrl:'javascript:alert(1)'},
 {weightsLicenseEvidenceUrl:'https://user:pass@example.org/license'},{baseWeightsSourceUrl:'not url'},
 {weightsSha256:'invalid'},{id:'../path'},{weightsBytes:-1},{weightsBytes:101*1024*1024},
 {task:'image_classification'},{format:'pt'}]){
  const r=inspect({...candidate,...changes});assert.equal(r.ok,false);
  assert.equal(r.licenseVerified,false);assert.equal(r.canRunInference,false);
 }
});
test('invalid candidates are rejected',()=>{
 for(const v of [null,[],undefined,'model',42]){const r=inspect(v);assert.equal(r.ok,false);assert.equal(r.cleanupAuthorized,false)}
});
test('module remains inactive and has no I/O or cleanup',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/video-model-provenance-gate\.js/);
 assert.doesNotMatch(sw,/video-model-provenance-gate\.js/);
 assert.doesNotMatch(raw,/\bfetch\s*\(|\bXMLHttpRequest\b|indexedDB|\.delete\s*\(|getUserMedia|MediaStore|\.transaction\s*\(/);
});
