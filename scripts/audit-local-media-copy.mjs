import {lstat,realpath,readdir,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,relative,sep,join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';

// Only compares two existing, external local directories. Never writes to either.
// A match means ONLY these enumerated files match, not that the export is complete.
const LIMIT=100_000;
const BLOCKED='MEDIA_COPY_AUDIT_BLOCKED';
const blocked=()=>new Error(BLOCKED);
function disjoint(a,b){
 const relation=relative(a,b);
 return relation!==''&&!(!relation.startsWith('..'+sep)&&relation!=='..'&&!isAbsolute(relation));
}
async function directory(p){
 const entry=await lstat(p);
 if(!entry.isDirectory()||entry.isSymbolicLink())throw blocked();
 return realpath(p);
}
async function inventory(root){
 const paths=[];
 async function walk(dir){
  const entries=await readdir(dir,{withFileTypes:true});
  for(const entry of entries){
   if(entry.isSymbolicLink()||(!entry.isDirectory()&&!entry.isFile()))throw blocked();
   const file=join(dir,entry.name);
   const check=await lstat(file);
   if(check.isSymbolicLink()||!(check.isDirectory()||check.isFile()))throw blocked();
   if(check.isDirectory())await walk(file);
   else{
    paths.push(relative(root,file));
    if(paths.length>LIMIT)throw blocked();
   }
  }
 }
 await walk(root);
 return paths.sort();
}
async function fileDigest(path){
 // Reject links and files swapped between discovery and actual open.
 const before=await lstat(path);
 if(!before.isFile()||before.isSymbolicLink()||!Number.isSafeInteger(before.size)||before.size<0)throw blocked();
 const fd=await open(path,constants.O_RDONLY|(process.platform==='win32'?0:constants.O_NOFOLLOW));
 try{
  const initial=await fd.stat();
  if(!initial.isFile()||initial.size!==before.size||initial.dev!==before.dev||initial.ino!==before.ino)throw blocked();
  const hash=createHash('sha256');
  let bytes=0;
  const block=Buffer.allocUnsafe(1024*1024);
  while(true){
   const {bytesRead}=await fd.read(block,0,block.length,null);
   if(bytesRead===0)break;
   bytes+=bytesRead;
   if(!Number.isSafeInteger(bytes)||bytes>initial.size)throw blocked();
   hash.update(block.subarray(0,bytesRead));
  }
  const after=await fd.stat();
  if(bytes!==initial.size||after.size!==initial.size||after.dev!==initial.dev||after.ino!==initial.ino||
     after.ctimeMs!==initial.ctimeMs||after.mtimeMs!==initial.mtimeMs)throw blocked();
  return {bytes,digest:hash.digest('hex'),device:initial.dev,inode:initial.ino};
 }finally{await fd.close();}
}
export async function auditMediaCopy(sourcePath,copyPath,{expectedFiles=null}={}){
 if(typeof sourcePath!=='string'||typeof copyPath!=='string'||!sourcePath||!copyPath||
    (expectedFiles!==null&&(!Number.isSafeInteger(expectedFiles)||expectedFiles<1)))throw blocked();
 const source=await directory(resolve(sourcePath));
 const copy=await directory(resolve(copyPath));
 if(!disjoint(source,copy)||!disjoint(copy,source))throw blocked();
 const [src,dst]=await Promise.all([inventory(source),inventory(copy)]);
 if(src.length===0||src.length!==dst.length||expectedFiles!==null&&src.length!==expectedFiles)throw blocked();
 let bytes=0;
 for(let i=0;i<src.length;i++){
  if(src[i]!==dst[i])throw blocked();
  const [a,b]=await Promise.all([fileDigest(join(source,src[i])),fileDigest(join(copy,dst[i]))]);
  // Distinct path names are not proof of distinct copies: reject hardlinks
  // when the filesystem supplies usable identity fields.
  if(a.device===b.device&&a.inode===b.inode&&Number.isSafeInteger(a.inode)&&a.inode>0)throw blocked();
  if(a.bytes!==b.bytes||a.digest!==b.digest)throw blocked();
  bytes+=a.bytes;
  if(!Number.isSafeInteger(bytes))throw blocked();
 }
 // No source filenames, personal metadata, original media or file hashes in stdout.
 return Object.freeze({status:'ENUMERATED_LOCAL_MEDIA_COPIES_MATCH_ONLY',
  filesCompared:src.length,bytesCompared:bytes,
  exhaustiveDeviceInventoryVerified:false,independentRestoreVerified:false,
  originalVideoDeletionAuthorized:false,sourceAndCopyUnmodified:true});
}
export function parseExpectedFileCount(argument){
 if(argument===undefined)return null;
 if(typeof argument!=='string'||! /^[1-9][0-9]*$/.test(argument))throw blocked();
 const count=Number(argument);
 if(!Number.isSafeInteger(count)||count>LIMIT)throw blocked();
 return count;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const audit=async()=>{
  if(process.argv.length<4||process.argv.length>5)throw blocked();
  return auditMediaCopy(process.argv[2],process.argv[3],{
   expectedFiles:parseExpectedFileCount(process.argv[4])
  });
 };
 audit().then(result=>console.log(JSON.stringify(result,null,2)),()=>{
  console.error(JSON.stringify({status:'BLOCKED',code:BLOCKED,noFilesModified:true}));
  process.exitCode=1;
 });
}
