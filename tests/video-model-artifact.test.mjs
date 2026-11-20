import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const raw=await readFile(new URL('../js/video-model-artifact.js',import.meta.url),'utf8');
const root={};new Function('window',raw)(root);
const verify=root.PasekaVideoModelArtifact.verifyModelArtifact;
const content='synthetic model, never executable',file=new Blob([content]);
const digest=createHash('sha256').update(content).digest('hex');
const hash={hashBlobHex:async b=>createHash('sha256').update(Buffer.from(await b.arrayBuffer())).digest('hex')};
const manifest={id:'bee-detector',version:'v1',sha256:digest,bytes:file.size};
test('real SHA digest of local synthetic model verifies identity but never approves licensing or inference',async()=>{
 const result=await verify(file,{...manifest,approved:true,licenseVerified:true,canRunInference:true},hash);
 assert.equal(result.ok,true);
 assert.equal(result.stage,'artifact_identity_only');
 assert.equal(result.artifactMatches,true);
 assert.equal(result.model.sha256,digest);
 assert.equal(result.licenseVerified,false);
 assert.equal(result.canRunInference,false);
 assert.equal(result.modelApproved,false);
 assert.equal(result.cleanupAuthorized,false);
});
test('digest mismatch, byte mismatch, missing hash and untrusted file fail closed',async()=>{
 for(const m of [{...manifest,sha256:'f'.repeat(64)},{...manifest,bytes:file.size+1},
  {...manifest,id:'../model'},{...manifest,sha256:'not-a-sha'},null]){
  assert.equal((await verify(file,m,hash)).ok,false);
 }
 assert.equal((await verify(file,manifest,null)).reason,'sha256_unavailable');
 assert.equal((await verify(null,manifest,hash)).ok,false);
 assert.equal((await verify(new Blob(['different']),manifest,hash)).ok,false);
});
test('hashing errors never mark a model available',async()=>{
 const fail=await verify(file,manifest,{hashBlobHex:async()=>{throw Error('memory')}});
 assert.equal(fail.reason,'model_hash_failed');assert.equal(fail.canRunInference,false);
});
test('preflight never imports model runtime, downloads artifacts or makes storage changes',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/src="\.\/js\/video-model-artifact\.js"/);
 assert.doesNotMatch(sw,/video-model-artifact\.js/);
 assert.doesNotMatch(raw,/\bfetch\s*\(|\bXMLHttpRequest\b|\bindexedDB\b|\blocalStorage\b|\.transaction\s*\(/);
});
