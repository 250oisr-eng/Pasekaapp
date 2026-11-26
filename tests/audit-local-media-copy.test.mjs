import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir,writeFile,readFile,rm,symlink,link} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {auditMediaCopy,parseExpectedFileCount} from '../scripts/audit-local-media-copy.mjs';
async function dirs(){
 const base=await mkdtemp(join(tmpdir(),'paseka-p0-media-only-'));
 const a=join(base,'source'),b=join(base,'external');
 await mkdir(a);await mkdir(b);
 return {base,a,b};
}
test('byte-identical external copies match without revealing private paths or claiming full recovery',async()=>{
 const {base,a,b}=await dirs();
 try{
  await mkdir(join(a,'серия 1'));await mkdir(join(b,'серия 1'));
  const bytes=Buffer.from([0,17,128,255,12,77]);
  await writeFile(join(a,'серия 1','видео.mp4'),bytes);
  await writeFile(join(b,'серия 1','видео.mp4'),bytes);
  const result=await auditMediaCopy(a,b,{expectedFiles:1});
  assert.equal(result.filesCompared,1);
  assert.equal(result.bytesCompared,bytes.length);
  assert.equal(result.exhaustiveDeviceInventoryVerified,false);
  assert.equal(result.independentRestoreVerified,false);
  assert.equal(result.originalVideoDeletionAuthorized,false);
  assert.doesNotMatch(JSON.stringify(result),/серия|видео|source|external|\.mp4|sha256/);
  assert.deepEqual(await readFile(join(a,'серия 1','видео.mp4')),bytes);
  assert.deepEqual(await readFile(join(b,'серия 1','видео.mp4')),bytes);
 }finally{await rm(base,{recursive:true,force:true});}
});
test('reject single-byte change, missing copied video, extra video and unexpected expected count',async()=>{
 const {base,a,b}=await dirs();
 try{
  await writeFile(join(a,'video.mp4'),Buffer.from([4,2,1]));
  await writeFile(join(b,'video.mp4'),Buffer.from([4,2,0]));
  await assert.rejects(auditMediaCopy(a,b),/MEDIA_COPY_AUDIT_BLOCKED/);
  await writeFile(join(b,'video.mp4'),Buffer.from([4,2,1]));
  await assert.rejects(auditMediaCopy(a,b,{expectedFiles:2}),/MEDIA_COPY_AUDIT_BLOCKED/);
  await writeFile(join(b,'extra.mp4'),'unknown');
  await assert.rejects(auditMediaCopy(a,b),/MEDIA_COPY_AUDIT_BLOCKED/);
  await rm(join(b,'extra.mp4'));
  await rm(join(b,'video.mp4'));
  await assert.rejects(auditMediaCopy(a,b),/MEDIA_COPY_AUDIT_BLOCKED/);
 }finally{await rm(base,{recursive:true,force:true});}
});
test('refuses source==destination, nested source/copy, symlinked file and empty folders',async()=>{
 const {base,a,b}=await dirs();
 try{
  await assert.rejects(auditMediaCopy(a,b),/MEDIA_COPY_AUDIT_BLOCKED/);
  await writeFile(join(a,'video.mp4'),'original');
  await writeFile(join(b,'video.mp4'),'original');
  await assert.rejects(auditMediaCopy(a,a),/MEDIA_COPY_AUDIT_BLOCKED/);
  const nested=join(a,'nested');await mkdir(nested);
  await assert.rejects(auditMediaCopy(a,nested),/MEDIA_COPY_AUDIT_BLOCKED/);
  await symlink(join(a,'video.mp4'),join(b,'link.mp4'));
  await assert.rejects(auditMediaCopy(a,b),/MEDIA_COPY_AUDIT_BLOCKED/);
 }finally{await rm(base,{recursive:true,force:true});}
});
test('fail closed for unsupported expectation, and do not write a report into either directory',async()=>{
 const {base,a,b}=await dirs();
 try{
  await writeFile(join(a,'x'),'x');await writeFile(join(b,'x'),'x');
  await assert.rejects(auditMediaCopy(a,b,{expectedFiles:0}),/MEDIA_COPY_AUDIT_BLOCKED/);
  await assert.rejects(auditMediaCopy(a,b,{expectedFiles:-1}),/MEDIA_COPY_AUDIT_BLOCKED/);
  await assert.rejects(auditMediaCopy(a,b,{expectedFiles:1.5}),/MEDIA_COPY_AUDIT_BLOCKED/);
  assert.equal((await auditMediaCopy(a,b)).filesCompared,1);
  assert.deepEqual(await readFile(join(a,'x')),Buffer.from('x'));
  assert.deepEqual(await readFile(join(b,'x')),Buffer.from('x'));
 }finally{await rm(base,{recursive:true,force:true});}
});

test('separate paths pointing to same hardlinked file are not independent media copies',async()=>{
 const {base,a,b}=await dirs();
 try{
  await writeFile(join(a,'video.mp4'),'synthetic');
  await link(join(a,'video.mp4'),join(b,'video.mp4'));
  await assert.rejects(auditMediaCopy(a,b),/MEDIA_COPY_AUDIT_BLOCKED/);
 }finally{await rm(base,{recursive:true,force:true});}
});

test('CLI expectations fail closed instead of silently allowing invalid or oversized values',()=>{
 assert.equal(parseExpectedFileCount(undefined),null);
 assert.equal(parseExpectedFileCount('1'),1);
 for(const value of ['0','01','-1','NaN','foo','100001','9007199254740999'])
  assert.throws(()=>parseExpectedFileCount(value),/MEDIA_COPY_AUDIT_BLOCKED/);
});
