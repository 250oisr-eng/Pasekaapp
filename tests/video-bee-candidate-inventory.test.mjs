import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const registry=JSON.parse(readFileSync(new URL('./fixtures/bee-detector-candidate-inventory.json',import.meta.url),'utf8'));
const gateSource=readFileSync(new URL('../js/video-detector-candidate-gate.js',import.meta.url),'utf8');
const root={};vm.runInNewContext(gateSource,root);
const gate=root.PasekaVideoDetectorCandidateGate;
test('every reviewed third-party candidate stays blocked, no inferred license from repo card',()=>{
 assert.equal(registry.schemaVersion,1);
 assert.equal(registry.reviewedOn,'2026-11-22');
 const ids=new Set();
 for(const c of registry.candidates){
  assert.ok(!ids.has(c.id));ids.add(c.id);
  assert.match(c.source,/^https:\/\/(?:github\.com|huggingface\.co)\//);
  assert.equal(c.status,'BLOCKED');
  assert.notEqual(c.weightsLicense,'VERIFIED');
  assert.notEqual(c.offlineAndroid,'VERIFIED');
  assert.notEqual(c.fieldBenchmark,'VERIFIED');
  const check=gate.evaluateCandidate({id:c.id,version:'v1',task:c.task,
   weightsLicenseVerified:false,baseWeightsLicenseVerified:false,datasetLicenseVerified:false,
   runtimeLicenseVerified:false,redistributionAllowed:false});
  assert.equal(check.ok,false);
  assert.equal(check.weightsApproved,false);
  assert.equal(check.canDownloadWeights,false);
  assert.equal(check.canRunInference,false);
  assert.equal(check.cleanupAuthorized,false);
 }
 assert.ok(registry.candidates.length>=5);
});
test('published code licenses are not falsely extended to weights or base training checkpoints',()=>{
 const ajay=registry.candidates.find(x=>x.id==='ajayjohnalex-bee-detection');
 const gratheon=registry.candidates.find(x=>x.id==='gratheon-models-gate-tracker');
 const apiarist=registry.candidates.find(x=>x.id==='apiarist-honey-bee-detector');
 assert.equal(ajay.codeLicense,'MIT_REPO_LICENSE');
 assert.equal(ajay.weightsLicense,'UNVERIFIED');
 assert.equal(gratheon.codeLicense,'GPL-3.0_REPO_LICENSE');
 assert.equal(gratheon.weightsLicense,'UNVERIFIED');
 assert.equal(apiarist.task,'honeycomb_frame_inspection');
 assert.equal(apiarist.status,'BLOCKED');
});

test('Grounding DINO Apache code and flatbug MIT code are not treated as validated checkpoint rights',()=>{
 const grounding=registry.candidates.find(x=>x.id==='idea-grounding-dino');
 const flatbug=registry.candidates.find(x=>x.id==='darsa-flatbug');
 assert.ok(grounding);assert.ok(flatbug);
 assert.equal(grounding.codeLicense,'APACHE-2.0_REPO_LICENSE');
 assert.equal(grounding.codeLicenseBlobSha,'f1460f5e6ad1e90abb720a1536a46e3d057686a9');
 assert.equal(grounding.weightsLicense,'CHECKPOINT_TERMS_UNVERIFIED');
 assert.equal(flatbug.codeLicense,'MIT_REPO_LICENSE');
 assert.equal(flatbug.codeLicenseBlobSha,'bee96279e49757f77280f9c8ddf0bf28983dda2d');
 assert.equal(flatbug.weightsLicense,'UPSTREAM_AGPL_NOTICE_IN_MODEL_METADATA');
 for(const c of [grounding,flatbug]){
  assert.equal(c.status,'BLOCKED');
  assert.notEqual(c.fieldBenchmark,'VERIFIED');
  assert.notEqual(c.offlineAndroid,'VERIFIED');
  const out=gate.evaluateCandidate({id:c.id,version:'v1',task:c.task});
  assert.equal(out.canRunInference,false);
  assert.equal(out.cleanupAuthorized,false);
 }
});
