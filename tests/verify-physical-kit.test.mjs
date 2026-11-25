import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile,symlink,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {REQUIRED,MANIFEST_FILE,MANIFEST_SCHEMA,verifyPhysicalKit,validateKitManifest}
 from '../scripts/verify-physical-kit.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'paseka-physical-kit-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const files=[];
 for(const path of REQUIRED){
   const bytes=Buffer.from('SAFE SYNTHETIC KIT FILE '+path+'\n','utf8');
   const dest=join(root,...path.split('/'));
   await mkdir(dirname(dest),{recursive:true});
   await writeFile(dest,bytes);
   files.push({path,sha256:digest(bytes),size:bytes.length});
 }
 const manifest={schema:MANIFEST_SCHEMA,sourceSha:'a'.repeat(40),files};
 await writeFile(join(root,MANIFEST_FILE),JSON.stringify(manifest,null,2));
 return {root,manifest};
}
test('physical kit verifies every original file byte before any ADB action',async t=>{
 const {root,manifest}=await fixture(t);
 assert.equal(validateKitManifest(manifest),true);
 const result=await verifyPhysicalKit(root);
 assert.equal(result.status,'PASS');
 assert.equal(result.fileCount,REQUIRED.length);
 assert.equal(result.deviceDataRead,false);
 assert.equal(result.signatureVerified,false,'hash manifest is not a publisher signature');
 assert.equal(result.sourceSha,'a'.repeat(40));
});
test('truncated or substituted binary blocks checks before OnePlus probe',async t=>{
 const {root}=await fixture(t);
 const path=join(root,'node.exe');
 await writeFile(path,'NOT THE PINNED WINDOWS BINARY');
 await assert.rejects(verifyPhysicalKit(root),/PHYSICAL_KIT_FILE_CHANGED/);
});
test('changing a script or command file blocks execution even if its size is unchanged',async t=>{
 const {root}=await fixture(t);
 const path=join(root,'scripts/paseka-check-hub.mjs');
 const original=await readFile(path);
 const changed=Buffer.from(original);
 changed[0]^=1;
 await writeFile(path,changed);
 await assert.rejects(verifyPhysicalKit(root),/PHYSICAL_KIT_FILE_CHANGED/);
});
test('manifest refuses relative traversal, missing critical files, duplicate paths and forged SHA',async t=>{
 const {root,manifest}=await fixture(t);
 for(const mutate of [
   value=>{value.files[0].path='../private.mp4';},
   value=>{value.files=value.files.filter(x=>x.path!=='scripts/paseka-check-hub.mjs');},
   value=>{value.files.push({...value.files[0]});},
   value=>{value.sourceSha='NOT_A_GIT_SHA';},
   value=>{value.files[0].size=500*1024*1024;}
 ]){
  const copy=structuredClone(manifest);mutate(copy);
  await writeFile(join(root,MANIFEST_FILE),JSON.stringify(copy));
  await assert.rejects(verifyPhysicalKit(root),/INVALID_PHYSICAL_KIT_MANIFEST|INCOMPLETE_PHYSICAL_KIT_MANIFEST/);
 }
});
test('symlinked bundle member cannot be used as original code even when bytes match',async t=>{
 const {root}=await fixture(t);
 const file=join(root,'README-RU.txt');
 const original=await readFile(file);
 const shadow=join(root,'PASEKA-SYNTHETIC-READ-ONLY-SHADOW.txt');
 await writeFile(shadow,original);
 await unlink(file);
 try{await symlink(shadow,file,'file');}
 catch(error){if(error.code==='EPERM'||error.code==='EACCES'){t.skip('symlink creation not permitted on Windows runner');return;}throw error;}
 await assert.rejects(verifyPhysicalKit(root),/PHYSICAL_KIT_FILE_CHANGED/);
});
