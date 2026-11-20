import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {validateManifest,prepareDataset} from '../tools/prepare-bee-coco.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const item=(id,split,source,content)=>({id,split,sourceVideoId:source,sourceVideoSha256:sha(source),
 imageSha256:sha(content),path:'images/'+id+'.jpg',width:100,height:80,
 boxes:[[0.5,0.5,0.2,0.25]]});
const manifest=()=>({schemaVersion:1,datasetId:'bee',datasetVersion:'v1',
 datasetLicenseReviewed:true,images:[item('a','train','src-a','A'),item('b','validation','src-b','B'),
 item('c','test','src-c','C')]});
test('converts normalized YOLO center boxes into COCO pixel boxes',()=>{
 const r=validateManifest(manifest());
 assert.deepEqual(r.counts,{train:1,validation:1,test:1});
 assert.deepEqual(r.output.test.annotations[0].bbox,[40,30,20,20]);
 assert.equal(r.output.train.categories[0].name,'bee');
});
test('no same source video in train and test, including renamed source hashes',()=>{
 let m=manifest();m.images[2].sourceVideoId=m.images[0].sourceVideoId;
 assert.throws(()=>validateManifest(m),/source_video_split_leakage/);
 m=manifest();m.images[2].sourceVideoSha256=m.images[0].sourceVideoSha256;
 assert.throws(()=>validateManifest(m),/source_video_hash_split_leakage/);
});
test('invalid and out-of-image boxes fail closed',()=>{
 for(const box of [[0,0,0.2,0.2],[0.95,0.5,0.2,0.2],[0.5,0.5,0,0.2],[0.5,0.5,NaN,0.2]]){
  const m=manifest();m.images[0].boxes=[box];
  assert.throws(()=>validateManifest(m),/image_or_bbox_invalid/);
 }
});
test('missing license review, traversal, duplicates and absent holdout fail closed',()=>{
 const changes=[m=>{m.datasetLicenseReviewed=false},
  m=>{m.images[0].path='images/../secret.jpg'},
  m=>{m.images[2].imageSha256=m.images[0].imageSha256},
  m=>{m.images[2].split='train'}];
 for(const change of changes){const m=manifest();change(m);assert.throws(()=>validateManifest(m))}
});
test('offline preparation checks actual file hashes and creates separate COCO JSON',async()=>{
 const tmp=await mkdtemp(join(tmpdir(),'bee-coco-'));
 try{
  const root=join(tmp,'dataset');await mkdir(join(root,'images'),{recursive:true});
  const m=manifest();
  for(const [i,x] of m.images.entries())await writeFile(join(root,x.path),'ABC'[i]);
  const mp=join(tmp,'manifest.json');await writeFile(mp,JSON.stringify(m));
  const out=join(tmp,'out');await prepareDataset({manifestPath:mp,datasetRoot:root,outputDir:out});
  const train=JSON.parse(await readFile(join(out,'train.json'),'utf8'));
  assert.equal(train.annotations.length,1);assert.equal(train.images.length,1);
  await assert.rejects(prepareDataset({manifestPath:mp,datasetRoot:root,outputDir:out}));
 }finally{await rm(tmp,{recursive:true,force:true})}
});
test('file digest mismatch blocks output',async()=>{
 const tmp=await mkdtemp(join(tmpdir(),'bee-coco-'));
 try{
  const root=join(tmp,'dataset');await mkdir(join(root,'images'),{recursive:true});
  const m=manifest();for(const x of m.images)await writeFile(join(root,x.path),'WRONG');
  const mp=join(tmp,'manifest.json');await writeFile(mp,JSON.stringify(m));
  await assert.rejects(prepareDataset({manifestPath:mp,datasetRoot:root,
   outputDir:join(tmp,'out')}),/image_digest_mismatch/);
 }finally{await rm(tmp,{recursive:true,force:true})}
});
