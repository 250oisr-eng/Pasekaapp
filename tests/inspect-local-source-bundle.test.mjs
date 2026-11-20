import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectLocalSourceBundle} from '../tools/inspect-local-source-bundle.mjs';
import {SourceManifestRejected} from '../tools/inspect-source-session-manifest.mjs';
import {RecordingFileRejected} from '../tools/verify-local-source-recordings.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
const ih=n=>n.toString(16).padStart(64,'0');
const make=(source,split='train',group='video-a')=>{
 const digest=hash(source);
 return {
  coco:{info:{split:'unassigned',trainingAuthorized:false},images:[{id:1,sha256:ih(1)}]},
  manifest:{schemaVersion:1,records:[{imageSha256:ih(1),split,sourceSessionId:group,
    sourceRecordingSha256:digest,evidence:{uri:'https://example.org/source-proof',
      description:'Synthetic declaration, not independently verified'}}]},
  files:[{sha256:digest,relativePath:'source.mp4',byteLength:source.length}]
 };
};
async function fixture(fn){
 const root=await mkdtemp(join(tmpdir(),'paseka-joined-source-'));
 try{return await fn(root);}finally{await rm(root,{recursive:true,force:true});}
}
test('joins valid COCO mapping and real local file SHA; never approves rights or deletion',()=>fixture(async root=>{
 const original=Buffer.from('Synthetic bee recording; not a real video');
 const {coco,manifest,files}=make(original);
 await writeFile(join(root,'source.mp4'),original);
 const report=await inspectLocalSourceBundle(coco,manifest,root,files);
 assert.equal(report.status,'structure_and_local_bytes_match_declarations');
 assert.equal(report.localBytesMatchDeclarations,true);
 assert.equal(report.checkedRecordings,1);
 for(const k of ['sourceIdentityVerified','independentHoldoutVerified','licenseVerified','trainingAuthorized','modelApproved','recognitionSucceeded','cleanupAuthorized'])assert.equal(report[k],false);
 assert.deepEqual(await readFile(join(root,'source.mp4')),original);
}));
test('rejects image SHA unknown before touching the filesystem',async()=>{
 const {coco,manifest,files}=make(Buffer.from('video'));
 manifest.records[0].imageSha256=ih(999);
 await assert.rejects(inspectLocalSourceBundle(coco,manifest,'/definitely/not/a/source',files),
  e=>e instanceof SourceManifestRejected&&e.message==='record_sha_unknown_or_duplicate');
});
test('rejects manifest with fabricated training authorization before accessing source',async()=>{
 const {coco,manifest,files}=make(Buffer.from('video'));
 coco.info.trainingAuthorized=true;
 await assert.rejects(inspectLocalSourceBundle(coco,manifest,'/definitely/not/a/source',files),
  e=>e instanceof SourceManifestRejected&&e.message==='coco_must_remain_unassigned');
});
test('rejects declared video SHA mismatch with local bytes',()=>fixture(async root=>{
 const {coco,manifest,files}=make(Buffer.from('expected'));
 await writeFile(join(root,'source.mp4'),Buffer.from('different'));
 await assert.rejects(inspectLocalSourceBundle(coco,manifest,root,files),
  e=>e instanceof RecordingFileRejected&&e.message==='source_hash_mismatch');
}));
test('rejects missing source video',()=>fixture(async root=>{
 const {coco,manifest,files}=make(Buffer.from('expected'));
 await assert.rejects(inspectLocalSourceBundle(coco,manifest,root,files),e=>e.code==='ENOENT');
}));
test('rejects duplicate source SHA under different splits before filesystem access',async()=>{
 const video=Buffer.from('test');
 const {coco,manifest,files}=make(video);
 coco.images.push({id:2,sha256:ih(2)});
 manifest.records.push({...manifest.records[0],imageSha256:ih(2),
  sourceSessionId:'renamed',split:'test'});
 await assert.rejects(inspectLocalSourceBundle(coco,manifest,'/definitely/not/a/source',files),
  e=>e instanceof SourceManifestRejected&&e.message==='same_recording_across_splits');
});
test('unassigned manifest returns blocked result, no media traversal even when root invalid',async()=>{
 const source=Buffer.from('x');const {coco,manifest}=make(source);
 manifest.records=[{imageSha256:ih(1),split:'unassigned',sourceSessionId:null,
   sourceRecordingSha256:null,evidence:null}];
 const result=await inspectLocalSourceBundle(coco,manifest,'/definitely/not/a/source',[]);
 assert.equal(result.status,'unassigned_no_recordings');
 assert.equal(result.localBytesMatchDeclarations,false);
 assert.equal(result.trainingAuthorized,false);assert.equal(result.cleanupAuthorized,false);
});
test('no hidden wiring to production, network or media deletion',async()=>{
 const source=await readFile(new URL('../tools/inspect-local-source-bundle.mjs',import.meta.url),'utf8');
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/inspect-local-source-bundle/);
 assert.doesNotMatch(sw,/inspect-local-source-bundle/);
 assert.doesNotMatch(source,/fetch\s*\(|XMLHttpRequest|\.unlink\s*\(|\.rm\s*\(|indexedDB|MediaStore/);
});
