import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../js/video-detector-candidate-gate.js',import.meta.url),'utf8');
const root={};vm.runInNewContext(source,root);
const gate=root.PasekaVideoDetectorCandidateGate;
const complete=()=>({id:'sample',version:'v1',task:'hive_entrance_bee_detection',
 weightsLicenseVerified:true,baseWeightsLicenseVerified:true,datasetLicenseVerified:true,
 runtimeLicenseVerified:true,redistributionAllowed:true,
 weightsSha256:'a'.repeat(64),weightsBytes:1000,artifactHashIndependentlyVerified:true,
 androidOfflineExecutionVerified:true,independentEntranceBenchmarkVerified:true,
 trackingDirectionVerified:true});
test('a model card and a file hash cannot approve third-party inference or video deletion',()=>{
 const values=[
  {id:'apiarist',version:'main',task:'hive_frame_inspection',weightsLicenseVerified:true},
  {id:'mattnudi',version:'main',task:'hive_entrance_bee_detection',weightsSha256:'a'.repeat(64)},
  {...complete(),weightsLicenseVerified:false},
  {...complete(),baseWeightsLicenseVerified:false},
  {...complete(),datasetLicenseVerified:false},
  {...complete(),runtimeLicenseVerified:false},
  {...complete(),redistributionAllowed:false},
  {...complete(),artifactHashIndependentlyVerified:false},
  {...complete(),androidOfflineExecutionVerified:false},
  {...complete(),independentEntranceBenchmarkVerified:false},
  {...complete(),trackingDirectionVerified:false},
  {...complete(),weightsSha256:'unknown'},
  {...complete(),weightsBytes:101*1024*1024}
 ];
 for(const value of values){
  const out=gate.evaluateCandidate(value);
  assert.equal(out.ok,false);
  assert.equal(out.canDownloadWeights,false);
  assert.equal(out.canRunInference,false);
  assert.equal(out.recognitionSucceeded,false);
  assert.equal(out.cleanupAuthorized,false);
 }
});
test('even a wholly self-asserted positive manifest never approves weights or inference',()=>{
 const out=gate.evaluateCandidate(complete());
 assert.equal(out.ok,true);
 assert.equal(out.stage,'evidence_submission_ready_only');
 assert.equal(out.weightsApproved,false);
 assert.equal(out.canDownloadWeights,false);
 assert.equal(out.canRunInference,false);
 assert.equal(out.recognitionSucceeded,false);
 assert.equal(out.cleanupAuthorized,false);
});
test('no live API, storage, weight execution or destructive code',()=>{
 for(const pattern of [/fetch\s*\(/,/XMLHttpRequest/,/indexedDB/,/localStorage/,/\.delete\s*\(/,/onnxruntime/,/import\s*\(/,/eval\s*\(/,/new\s+Function/])
  assert.doesNotMatch(source,pattern);
 const result=gate.evaluateCandidate(null);
 assert.equal(result.reason,'INVALID_CANDIDATE');
});
