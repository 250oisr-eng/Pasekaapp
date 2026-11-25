// B01 legacy private WebView reconstruction: read-only, metadata-only PC inventory.
// Never transplants LevelDB to Android or attempts to decode private user records.
import { promises as fs } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';

const FOLDER=/^pc-reconstruction-[a-f0-9]{32}$/i;
const MEMBER=/^[A-Za-z0-9_.@+-]{1,128}$/;
const MAX_ITEMS=256, MAX_BYTES=128*1024*1024;

function fail(code){throw Error('B01_BLOCKED_'+code);}
async function realDirectory(path,insideRoot) {
 const stat=await fs.lstat(path);
 if(stat.isSymbolicLink()||!stat.isDirectory())fail('UNSAFE_LEGACY_DIRECTORY');
 const real=await fs.realpath(path);
 if(insideRoot && !(real===insideRoot||real.startsWith(insideRoot+sep)))fail('LEGACY_PATH_ESCAPES_ROOT');
 return real;
}
export async function inspectLegacyPcCopy(path) {
 if(!path || typeof path!=='string')fail('LEGACY_COPY_LOCATION_REQUIRED');
 const root=resolve(path);
 let st;
 try {st=await fs.lstat(root);}catch(e) {
  if(e.code==='ENOENT') return {status:'NEEDS_INPUT',code:'LEGACY_PC_COPY_NOT_FOUND',proofLevel:'NOT_VERIFIED'};
  fail('LEGACY_COPY_ROOT_UNREADABLE');
 }
 if(st.isSymbolicLink()||!st.isDirectory())fail('UNSAFE_LEGACY_ROOT');
 const rootReal=await realDirectory(root);
 const names=await fs.readdir(root,{withFileTypes:true});
 const candidates=names.filter(d=>FOLDER.test(d.name));
 if(!candidates.length)return {status:'NEEDS_INPUT',code:'LEGACY_PC_RECONSTRUCTION_NOT_FOUND',proofLevel:'NOT_VERIFIED'};
 if(candidates.length!==1)fail('AMBIGUOUS_LEGACY_PC_RECONSTRUCTION');
 const base=join(root,candidates[0].name);
 await realDirectory(base,rootReal);
 try{
  await fs.lstat(join(base,'INVALID-PC-RECONSTRUCTION-NOT-BACKUP.txt'));
  fail('LEGACY_RECONSTRUCTION_FLAGGED_INVALID');
 }catch(e){if(e.message?.startsWith('B01_BLOCKED_'))throw e;if(e.code!=='ENOENT')throw e;}
 const db=join(base,'app_webview','Default','IndexedDB');
 for(const folder of [join(base,'app_webview'),join(base,'app_webview','Default'),db]){
  await realDirectory(folder,rootReal);
 }
 let files=0,bytes=0,entriesSeen=0,hasCurrent=false,hasManifest=false,hasLog=false;
 async function walk(folder,depth=0){
  if(depth>20)fail('LEGACY_PATH_TOO_DEEP');
  const members=await fs.readdir(folder,{withFileTypes:true});
  for(const member of members){
   if(!MEMBER.test(member.name))fail('LEGACY_UNSAFE_MEMBER_NAME');
   const target=join(folder,member.name),stat=await fs.lstat(target);
   if(stat.isSymbolicLink())fail('LEGACY_SYMLINK_REFUSED');
   if(++entriesSeen>MAX_ITEMS)fail('LEGACY_TOO_MANY_MEMBERS');
   const real=await fs.realpath(target);
   if(!real.startsWith(rootReal+sep))fail('LEGACY_MEMBER_ESCAPES_ROOT');
   if(stat.isDirectory()){await walk(target,depth+1);continue;}
   if(!stat.isFile()||!Number.isSafeInteger(stat.size)||stat.size<0)fail('LEGACY_UNSAFE_MEMBER');
   bytes+=stat.size;files++;
   if(bytes>MAX_BYTES)fail('LEGACY_FILESET_OVERSIZE');
   const pathInTree=relative(db,target).replaceAll('\\','/');
   if(/\.leveldb\/CURRENT$/i.test(pathInTree))hasCurrent=true;
   if(/\.leveldb\/MANIFEST-[0-9]+$/i.test(pathInTree))hasManifest=true;
   if(/\.leveldb\/[0-9]+\.log$/i.test(pathInTree))hasLog=true;
  }
 }
 await walk(db);
 return {
  status: hasCurrent&&hasManifest&&hasLog?'PASS':'BLOCKED',
  code:hasCurrent&&hasManifest&&hasLog?
    'LEGACY_PRIVATE_WEBVIEW_FILE_INVENTORY_ONLY_NOT_RESTORE':'LEGACY_LEVELDB_MARKERS_MISSING',
  proofLevel:'LOCAL_FILE_METADATA_ONLY_NOT_INDEXEDDB_RESTORE',
  fileCount:files, byteCount:bytes,
  requiredMarkersPresent:hasCurrent&&hasManifest&&hasLog
 };
}
