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

test('matpalm BNN cannot become Android detector from MIT source code alone',()=>{
 const c=registry.candidates.find(x=>x.id==='matpalm-bnn');
 assert.ok(c,'candidate entry is required');
 assert.equal(c.codeLicense,'MIT_REPO_LICENSE');
 assert.equal(c.weightsArtifact,'NO_PUBLISHED_CHECKPOINT_VERIFIED');
 assert.equal(c.weightsLicense,'UNVERIFIED');
 assert.equal(c.status,'BLOCKED');
 assert.equal(c.offlineAndroid,'UNVERIFIED');
 assert.equal(c.fieldBenchmark,'UNVERIFIED');
 assert.ok(c.evidence.some(x=>x.includes('gitignore')));
 const result=gate.evaluateCandidate({id:c.id,version:'v1',
   task:'hive_entrance_bee_detection',weightsLicenseVerified:false,
   baseWeightsLicenseVerified:false,datasetLicenseVerified:false,
   runtimeLicenseVerified:false,redistributionAllowed:false});
 assert.equal(result.reason,'LICENSE_CHAIN_UNVERIFIED');
 assert.equal(result.canRunInference,false);
 assert.equal(result.cleanupAuthorized,false);
});
