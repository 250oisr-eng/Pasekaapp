import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base=await readFile(new URL('../js/video-model-provenance-gate.js',import.meta.url),'utf8');
const code=await readFile(new URL('../js/video-license-risk-screen.js',import.meta.url),'utf8');
const root={};new Function('window',base)(root);new Function('window',code)(root);
const evaluate=root.PasekaVideoModelLicenseRisk.inspect;
const sample={id:'m',version:'v1',weightsSha256:'a'.repeat(64),weightsBytes:1024,
 weightsSourceUrl:'https://example.org/a',weightsLicenseSpdx:'Apache-2.0',weightsLicenseEvidenceUrl:'https://example.org/b',
 baseWeightsSourceUrl:'https://example.org/c',baseWeightsLicenseSpdx:'Apache-2.0',baseWeightsLicenseEvidenceUrl:'https://example.org/d',
 trainingDatasetSourceUrl:'https://example.org/e',trainingDatasetLicenseSpdx:'CC-BY-4.0',trainingDatasetLicenseEvidenceUrl:'https://example.org/f',
 task:'honeybee_object_detection',format:'onnx'};
test('Ultralytics-derived apparently Apache checkpoint is not considered license-cleared',()=>{
 const r=evaluate({...sample,baseModelFamily:'ultralytics-yolov8',exportMethod:'onnx-export',licenseVerified:true});
 assert.ok(r.risks.includes('ultralytics_upstream_rights_review'));
 assert.equal(r.licenseVerified,false);assert.equal(r.canRunInference,false);assert.equal(r.cleanupAuthorized,false);
});
test('unresolved, restrictive and unknown licenses never permit inference',()=>{
 for(const license of ['AGPL-3.0','GPL-3.0-only','CC-BY-NC-4.0','CC-BY-ND-4.0','LicenseRef-custom','UNKNOWN']){
  const r=evaluate({...sample,baseWeightsLicenseSpdx:license});
  assert.equal(r.ok,false);assert.ok(r.risks.length);assert.equal(r.modelApproved,false);
 }
});
test('permissive SPDX label is insufficient proof even with declared provenance',()=>{
 const r=evaluate({...sample,baseModelFamily:'other',exportMethod:'onnx-export'});
 assert.equal(r.reason,'independent_license_review_required');
 assert.ok(r.risks.includes('rights_not_independently_verified'));
 assert.equal(r.recognitionSucceeded,false);assert.equal(r.cleanupAuthorized,false);
});
test('missing provenance or dependency fails closed',()=>{
 assert.equal(evaluate({}).reason,'provenance_incomplete');
 assert.equal(evaluate(null).reason,'invalid_license_record');
 const isolated={};new Function('window',code)(isolated);
 assert.equal(isolated.PasekaVideoModelLicenseRisk.inspect(sample).reason,'provenance_gate_missing');
});
test('license risk screen remains isolated from user data and network',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/video-license-risk-screen\.js/);assert.doesNotMatch(sw,/video-license-risk-screen\.js/);
 assert.doesNotMatch(code,/\bfetch\s*\(|XMLHttpRequest|indexedDB|\.delete\s*\(|MediaStore|\.transaction\s*\(/);
});
