import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,symlink,link,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyLocalSourceRecordings,RecordingFileRejected} from '../tools/verify-local-source-recordings.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
const entry=(bytes,path='video.mp4')=>({sha256:hash(bytes),relativePath:path,byteLength:bytes.length});
const record=(digest,split='train')=>({split,sourceRecordingSha256:digest});
const manifest=(...records)=>({records});
const rejects=async(p,code)=>await assert.rejects(p,e=>e instanceof RecordingFileRejected&&e.message===code);
async function fixture(fn){
 const root=await mkdtemp(join(tmpdir(),'paseka-video-source-test-'));
 try{return await fn(root);}finally{await rm(root,{recursive:true,force:true});}
}
test('real local source byte hash matches without granting training or deletion',async()=>fixture(async(root)=>{
 const bytes=Buffer.from('synthetic recording A, no private videos');
 await writeFile(join(root,'video.mp4'),bytes);
 const r=await verifyLocalSourceRecordings(manifest(record(hash(bytes))),root,[entry(bytes)]);
 assert.equal(r.localBytesMatchDeclarations,true);assert.equal(r.checkedBytes,bytes.length);
 for(const k of ['sourceIdentityVerified','independentHoldoutVerified','licenseVerified','trainingAuthorized','modelApproved','recognitionSucceeded','cleanupAuthorized'])assert.equal(r[k],false);
 assert.deepEqual(await readFile(join(root,'video.mp4')),bytes);
}));
test('multiple recordings are all checked and originals remain intact',async()=>fixture(async(root)=>{
 await mkdir(join(root,'a'));const a=Buffer.from('video one'),b=Buffer.from('video two');
 await writeFile(join(root,'a','one.mp4'),a);await writeFile(join(root,'two.mp4'),b);
 const r=await verifyLocalSourceRecordings(manifest(record(hash(a)),record(hash(b),'test')),root,[entry(a,'a/one.mp4'),entry(b,'two.mp4')]);
 assert.equal(r.checkedRecordings,2);assert.equal(r.localBytesMatchDeclarations,true);
 assert.deepEqual(await readFile(join(root,'two.mp4')),b);
}));
test('rejects tampered video bytes',async()=>fixture(async(root)=>{
 const a=Buffer.from('original'),b=Buffer.from('modified-with-extra-bytes');
 await writeFile(join(root,'video.mp4'),b);
 await rejects(verifyLocalSourceRecordings(manifest(record(hash(a))),root,[entry(a)]),'source_size_invalid');
}));
test('rejects equal length byte substitution with different SHA',async()=>fixture(async(root)=>{
 const a=Buffer.from('123456'),b=Buffer.from('ABCDEF');
 await writeFile(join(root,'video.mp4'),b);
 await rejects(verifyLocalSourceRecordings(manifest(record(hash(a))),root,[entry(a)]),'source_hash_mismatch');
}));
test('rejects missing declared recording',async()=>fixture(async(root)=>{
 const a=Buffer.from('a'),b=Buffer.from('b');await writeFile(join(root,'video.mp4'),a);
 await rejects(verifyLocalSourceRecordings(manifest(record(hash(a)),record(hash(b))),root,[entry(a)]),'source_file_coverage_mismatch');
}));
test('rejects unknown SHA in files',async()=>fixture(async(root)=>{
 const a=Buffer.from('a'),b=Buffer.from('b');await writeFile(join(root,'video.mp4'),a);
 await rejects(verifyLocalSourceRecordings(manifest(record(hash(a))),root,[entry(b)]),'source_file_hash_not_expected_or_duplicate');
}));
test('rejects traversal paths',async()=>fixture(async(root)=>{
 const a=Buffer.from('a');
 await rejects(verifyLocalSourceRecordings(manifest(record(hash(a))),root,[entry(a,'../outside.mp4')]),'source_path_invalid_or_duplicate');
}));
test('rejects absolute paths',async()=>fixture(async(root)=>{
 const a=Buffer.from('a');
 await rejects(verifyLocalSourceRecordings(manifest(record(hash(a))),root,[entry(a,join(root,'video.mp4'))]),'source_path_invalid_or_duplicate');
}));
test('rejects symlink file without reading external bytes',async()=>fixture(async(root)=>{
 const a=Buffer.from('synthetic');await writeFile(join(root,'real.mp4'),a);await symlink('real.mp4',join(root,'video.mp4'));
 await rejects(verifyLocalSourceRecordings(manifest(record(hash(a))),root,[entry(a)]),'symlink_forbidden');
}));
test('rejects symlink directory',async()=>fixture(async(root)=>{
 const a=Buffer.from('synthetic');await mkdir(join(root,'real'));await writeFile(join(root,'real','video.mp4'),a);
 await symlink('real',join(root,'link'));
 await rejects(verifyLocalSourceRecordings(manifest(record(hash(a))),root,[entry(a,'link/video.mp4')]),'symlink_forbidden');
}));
test('rejects zero byte file',async()=>fixture(async(root)=>{
 await writeFile(join(root,'video.mp4'),Buffer.alloc(0));
 const d=hash(Buffer.alloc(0));
 await rejects(verifyLocalSourceRecordings(manifest(record(d)),root,[{sha256:d,relativePath:'video.mp4',byteLength:0}]),'source_size_invalid');
}));
test('rejects duplicate source file paths even for different hashes',async()=>fixture(async(root)=>{
 const a=Buffer.from('a'),b=Buffer.from('b');await writeFile(join(root,'video.mp4'),a);
 await rejects(verifyLocalSourceRecordings(manifest(record(hash(a)),record(hash(b))),root,[entry(a),entry(b)]),'source_path_invalid_or_duplicate');
}));
test('refuses unassigned-only manifest without reading user files',async()=>fixture(async(root)=>{
 const a=Buffer.from('synthetic');
 await rejects(verifyLocalSourceRecordings(manifest({split:'unassigned',sourceRecordingSha256:null}),root,[entry(a)]),'source_file_coverage_mismatch');
}));

test('rejects symlinked source root, even if it points to a valid staging directory',async()=>fixture(async outer=>{
 const real=join(outer,'real');await mkdir(real);
 const bytes=Buffer.from('staging source');await writeFile(join(real,'video.mp4'),bytes);
 await symlink(real,join(outer,'linked-root'));
 await rejects(verifyLocalSourceRecordings(manifest(record(hash(bytes))),join(outer,'linked-root'),[entry(bytes)]),'root_symlink_or_invalid');
}));
test('rejects hardlink to a file outside source root even with matching SHA',async()=>fixture(async outer=>{
 const root=join(outer,'staging');await mkdir(root);
 const bytes=Buffer.from('outside originally');const outside=join(outer,'outside.mp4');
 await writeFile(outside,bytes);await link(outside,join(root,'video.mp4'));
 await rejects(verifyLocalSourceRecordings(manifest(record(hash(bytes))),root,[entry(bytes)]),'source_not_exclusive_regular_file');
 assert.deepEqual(await readFile(outside),bytes);
}));
test('rejects NUL in explicitly supplied relative path before filesystem lookup',async()=>fixture(async root=>{
 const bytes=Buffer.from('source');
 await rejects(verifyLocalSourceRecordings(manifest(record(hash(bytes))),root,[entry(bytes,'video'+String.fromCharCode(0)+'.mp4')]),'source_path_invalid_or_duplicate');
}));
test('regular nested source path remains supported after link defenses',async()=>fixture(async root=>{
 const bytes=Buffer.from('regular file');await mkdir(join(root,'nested'));
 await writeFile(join(root,'nested','recording.mp4'),bytes);
 const r=await verifyLocalSourceRecordings(manifest(record(hash(bytes))),root,[entry(bytes,'nested/recording.mp4')]);
 assert.equal(r.localBytesMatchDeclarations,true);assert.equal(r.cleanupAuthorized,false);
}));

test('verifier does not activate runtime or perform network/deletion',async()=>{
 const raw=await readFile(new URL('../tools/verify-local-source-recordings.mjs',import.meta.url),'utf8');
 const index=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(index,/verify-local-source-recordings/);
 assert.doesNotMatch(sw,/verify-local-source-recordings/);
 assert.doesNotMatch(raw,/fetch\s*\(|XMLHttpRequest|\.unlink\s*\(|\.rm\s*\(|indexedDB|MediaStore/);
});
