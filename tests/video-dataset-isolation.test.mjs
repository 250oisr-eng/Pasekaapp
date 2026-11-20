import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const code=await readFile(new URL('../js/video-dataset-isolation.js',import.meta.url),'utf8');
const root={};new Function('window',code)(root);const inspect=root.PasekaVideoDatasetIsolation.inspect;
const item=(id,split,digit)=>({id,split,imageSha256:digit.repeat(64),annotationSha256:'f'.repeat(64)});
const fixture=()=>({datasetId:'bee-entrance',datasetVersion:'v1',items:[item('a','train','a'),item('b','validation','b'),item('c','test','c')]});
test('distinct declared splits pass hygiene but never constitute independent validation',()=>{
 const r=inspect(fixture());assert.equal(r.ok,true);
 assert.deepEqual(r.counts,{train:1,validation:1,test:1});
 assert.equal(r.independentEvaluationVerified,false);assert.equal(r.nearDuplicateReviewRequired,true);
 assert.equal(r.sourceVideoLeakageReviewRequired,true);
 assert.equal(r.modelValidated,false);assert.equal(r.recognitionSucceeded,false);
 assert.equal(r.cleanupAuthorized,false);
});
test('same image bytes across splits rejected, even with different IDs and annotations',()=>{
 const f=fixture();f.items[2].imageSha256=f.items[0].imageSha256;
 f.items[2].annotationSha256='e'.repeat(64);
 assert.equal(inspect(f).reason,'cross_split_image_leakage');
});
test('duplicate image bytes inside split and duplicate IDs rejected',()=>{
 let f=fixture();f.items.push(item('d','train','a'));
 assert.equal(inspect(f).reason,'duplicate_image_content');
 f=fixture();f.items[2].id='a';assert.equal(inspect(f).reason,'duplicate_image_id');
});
test('incomplete/invalid manifests and absent partitions rejected',()=>{
 for(const f of [null,{},[],{...fixture(),items:[]},
 {...fixture(),items:[item('a','train','a'),item('b','validation','b')]},
 {...fixture(),items:[item('a','train','a'),item('b','validation','b'),item('c','other','c')]},
 {...fixture(),items:[item('a','train','a'),item('b','validation','b'),{...item('c','test','c'),imageSha256:'bad'}]}]){
  const r=inspect(f);assert.equal(r.ok,false);assert.equal(r.cleanupAuthorized,false);
 }
});
test('module has no media reads, network, persistence, deletion or runtime activation',async()=>{
 assert.doesNotMatch(code,/\bfetch\s*\(|XMLHttpRequest|indexedDB|\.delete\s*\(|getUserMedia|MediaStore|\.transaction\s*\(/);
});
