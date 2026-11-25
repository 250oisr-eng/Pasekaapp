// Standalone offline integrity preflight. Detects accidental/tampered package files,
// NOT a cryptographic signature or independent proof of publisher identity.
import {createHash} from 'node:crypto';
import {createReadStream,existsSync,lstatSync,readFileSync} from 'node:fs';
import {dirname,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {finished} from 'node:stream/promises';

const SHA40=/^[a-f0-9]{40}$/;
const SHA256=/^[a-f0-9]{64}$/;
const SAFE_REL=/^[A-Za-z0-9_.\/-]+$/;
export const MANIFEST_FILE='PASEKA-PHYSICAL-KIT-MANIFEST.json';
export const MANIFEST_SCHEMA='paseka-offline-physical-kit-sha256-v1';
export const REQUIRED=[
  'node.exe','scripts/paseka-check-hub.mjs',
  'scripts/check-oneplus-readonly-usb.mjs',
  'scripts/physical-test-readiness.mjs',
  'scripts/verify-physical-kit.mjs',
  'scripts/verify-exported-archive.mjs',
  'scripts/prove-exported-archive-recovery.mjs',
  'scripts/run-b01-oneclick.mjs',
  'js/disaster-archive.js',
  'tools-placeholder' // removed below: package must contain only actual named files
].filter(x=>x!=='tools-placeholder').concat(['ПРОВЕРИТЬ-ПАСЕКУ.cmd','README-RU.txt']);

export function validateKitManifest(manifest){
 if(manifest?.schema!==MANIFEST_SCHEMA||!SHA40.test(manifest.sourceSha||'')||
    !Array.isArray(manifest.files)||!manifest.files.length||
    manifest.files.length>1000)throw Error('INVALID_PHYSICAL_KIT_MANIFEST');
 const seen=new Set();
 for(const entry of manifest.files){
  const p=entry?.path;
  if(typeof p!=='string'||!SAFE_REL.test(p)||p.startsWith('/')||
     p.includes('..')||p.includes('\\')||p.split('/').includes('')||
     !SHA256.test(entry.sha256||'')||!Number.isSafeInteger(entry.size)||
     entry.size<0||entry.size>200*1024*1024||seen.has(p)){
    throw Error('INVALID_PHYSICAL_KIT_MANIFEST');
  }
  seen.add(p);
 }
 if(!REQUIRED.every(p=>seen.has(p)))throw Error('INCOMPLETE_PHYSICAL_KIT_MANIFEST');
 return true;
}

async function sha256File(path){
 const stream=createReadStream(path);
 const hash=createHash('sha256');
 stream.on('data',chunk=>hash.update(chunk));
 await finished(stream);
 return hash.digest('hex');
}

export async function verifyPhysicalKit(root){
 const base=resolve(root),mf=join(base,MANIFEST_FILE);
 const st=lstatSync(mf);
 if(!st.isFile()||st.isSymbolicLink()||st.size>250000||st.size===0)
   throw Error('UNSAFE_PHYSICAL_KIT_MANIFEST');
 const parsed=JSON.parse(readFileSync(mf,'utf8'));
 validateKitManifest(parsed);
 for(const row of parsed.files){
  const target=resolve(base,...row.path.split('/'));
  if(!target.startsWith(base+sep))throw Error('UNSAFE_PHYSICAL_KIT_PATH');
  const info=lstatSync(target);
  if(!info.isFile()||info.isSymbolicLink()||info.size!==row.size)
    throw Error('PHYSICAL_KIT_FILE_CHANGED');
  const digest=await sha256File(target);
  if(digest!==row.sha256)throw Error('PHYSICAL_KIT_FILE_CHANGED');
 }
 return {status:'PASS',code:'OFFLINE_KIT_BYTES_MATCH_LOCAL_MANIFEST',
   sourceSha:parsed.sourceSha,fileCount:parsed.files.length,
   signatureVerified:false,deviceDataRead:false};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 verifyPhysicalKit(resolve(dirname(fileURLToPath(import.meta.url)),'..'))
 .then(result=>console.log('PASEKA_KIT_INTEGRITY '+result.code+' SOURCE_SHA '+result.sourceSha))
 .catch(()=>{console.error('PASEKA_KIT_INTEGRITY_BLOCKED');process.exitCode=3;});
}
