// Offline, read-only, staging-only SHA verification of explicitly supplied source files.
// Does not prove annotations, session ownership, licensing, inference or cleanup.
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {lstat,open,realpath} from 'node:fs/promises';
import {isAbsolute,relative,resolve,sep} from 'node:path';

const HEX=/^[a-f0-9]{64}$/;
const MAX_RECORDINGS=128;
const MAX_BYTES=2*1024*1024*1024;
export class RecordingFileRejected extends Error {
 constructor(reason){super(reason);this.name='RecordingFileRejected';}
}
function guard(condition,reason){if(condition)throw new RecordingFileRejected(reason);}
function object(x){return !!x&&typeof x==='object'&&!Array.isArray(x);}
function safePath(p){
 return typeof p==='string'&&p.length>0&&p.length<=500&&!p.includes('\\')&&
 !p.includes('\\0')&&!isAbsolute(p)&&p.split('/').every(x=>x!==''&&x!=='.'&&x!=='..');
}
async function hashSource(root,record){
 const parts=record.relativePath.split('/');
 let cursor=root;
 for(const part of parts){
  cursor=resolve(cursor,part);
  const st=await lstat(cursor);
  guard(st.isSymbolicLink(),'symlink_forbidden');
 }
 const actual=await realpath(cursor);
 const rel=relative(root,actual);
 guard(rel===''||rel==='..'||rel.startsWith('..'+sep)||isAbsolute(rel),'path_escape');
 const f=await open(actual,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
 try{
  const before=await f.stat();
  guard(!before.isFile()||before.size===0||before.size>MAX_BYTES||before.size!==record.byteLength,'source_size_invalid');
  const h=createHash('sha256');
  const buf=Buffer.allocUnsafe(65536);
  let offset=0;
  while(offset<before.size){
   const n=Math.min(buf.length,before.size-offset);
   const {bytesRead}=await f.read(buf,0,n,offset);
   guard(bytesRead<=0,'source_changed_while_reading');
   h.update(buf.subarray(0,bytesRead));offset+=bytesRead;
  }
  const after=await f.stat();
  guard(before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ino!==after.ino,'source_changed_while_reading');
  return h.digest('hex');
 }finally{await f.close();}
}
export async function verifyLocalSourceRecordings(manifest,sourceRoot,files){
 guard(!object(manifest)||!Array.isArray(manifest.records),'manifest_invalid');
 guard(!Array.isArray(files)||files.length===0||files.length>MAX_RECORDINGS,'source_file_list_invalid');
 guard(typeof sourceRoot!=='string'||!sourceRoot.trim(),'root_invalid');
 const root=await realpath(sourceRoot);
 guard(!(await lstat(root)).isDirectory(),'root_invalid');
 const expected=new Set();
 for(const r of manifest.records){
  guard(!object(r),'manifest_record_invalid');
  if(r.split==='unassigned')continue;
  guard(typeof r.sourceRecordingSha256!=='string'||!HEX.test(r.sourceRecordingSha256),'declared_sha_invalid');
  expected.add(r.sourceRecordingSha256);
 }
 guard(expected.size===0||expected.size!==files.length,'source_file_coverage_mismatch');
 const seenHash=new Set(),seenPath=new Set();
 const validated=[];
 for(const f of files){
  guard(!object(f)||typeof f.sha256!=='string'||!HEX.test(f.sha256)||!expected.has(f.sha256)||seenHash.has(f.sha256),'source_file_hash_not_expected_or_duplicate');
  guard(!safePath(f.relativePath)||seenPath.has(f.relativePath.toLowerCase()),'source_path_invalid_or_duplicate');
  guard(!Number.isSafeInteger(f.byteLength)||f.byteLength<1||f.byteLength>MAX_BYTES,'source_size_invalid');
  seenHash.add(f.sha256);seenPath.add(f.relativePath.toLowerCase());
  const digest=await hashSource(root,f);
  guard(digest!==f.sha256,'source_hash_mismatch');
  validated.push({sha256:digest,bytes:f.byteLength});
 }
 return Object.freeze({
  localBytesMatchDeclarations:true, checkedRecordings:validated.length,
  checkedBytes:validated.reduce((a,x)=>a+x.bytes,0),
  // Matching local bytes does NOT authenticate which session produced an image.
  sourceIdentityVerified:false, independentHoldoutVerified:false,
  licenseVerified:false, trainingAuthorized:false, modelApproved:false,
  recognitionSucceeded:false, cleanupAuthorized:false
 });
}
