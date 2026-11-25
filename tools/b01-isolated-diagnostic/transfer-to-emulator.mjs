// B01 isolated emulator import. Runs ONLY on user's computer with local V16
// reconstruction. No source upload, no physical-device commands, no production app writes.
// ADB tar transport is binary stdin (not PowerShell pipeline, not shared device temp).
import {spawn, spawnSync} from 'node:child_process';
import {createReadStream, promises as fs} from 'node:fs';
import {resolve, join, relative, sep, basename, dirname} from 'node:path';
import {createHash} from 'node:crypto';

export const DIAGNOSTIC='ru.paseka.journal.diagnostic.restore';
export const LIVE='ru.paseka.journal';
const PREFIX='PASEKA_B01_ISOLATED_';
const MAX_FILES=256, MAX_BYTES=128*1024*1024, MAX_DEPTH=25;
const SAFE_NAME=/^[A-Za-z0-9_.@+-]+$/;

function refuse(reason){throw Error('B01_BLOCKED_'+reason);}
function output(result){
 if(result.error || result.status!==0) refuse('ADB_COMMAND_FAILED_REDACTED');
 return (result.stdout||'').toString().trim();
}
export function classifyEmulator({serial,hardware,fingerprint,qemu,avdName,liveInstalled=false,diagnosticInstalled=false}){
 if(!/^emulator-[0-9]+$/.test(serial)) refuse('SERIAL_NOT_EMULATOR');
 if(qemu!=='1' || !['ranchu','goldfish'].includes(hardware)) refuse('DEVICE_NOT_EMULATOR_HARDWARE');
 if(!(/generic|sdk_gphone|emulator/i.test(fingerprint))) refuse('DEVICE_FINGERPRINT_NOT_EMULATOR');
 if(!avdName.startsWith(PREFIX)|| !/^[A-Z0-9_-]{1,80}$/.test(avdName)) refuse('AVD_NOT_EXPLICIT_ISOLATED_B01');
 if(liveInstalled)refuse('LIVE_APP_INSTALLED_IN_TARGET_EMULATOR');
 if(diagnosticInstalled)refuse('DIAGNOSTIC_APP_NOT_FRESH');
 return true;
}
export function ensureExpectedApp(apkBadging){
 const match=/package:\s+name='([^']+)'/.exec(apkBadging);
 if(match?.[1]!==DIAGNOSTIC) refuse('APK_PACKAGE_ID_NOT_DIAGNOSTIC');
 if(!/application-label:'Paseka B01 Isolated Diagnostic'/.test(apkBadging))refuse('APK_LABEL_NOT_DIAGNOSTIC');
}
function adbSync(adb,serial,...args) {
 const result=spawnSync(adb,['-s',serial,...args],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024,windowsHide:true});
 return output(result);
}
async function realFile(path,kind){
 const stat=await fs.lstat(path);
 if(stat.isSymbolicLink()|| (kind==='dir'&&!stat.isDirectory()) || (kind==='file'&&!stat.isFile()))refuse('UNSAFE_SOURCE_MEMBER');
 return {stat,real:await fs.realpath(path)};
}
function legalRelative(path){
 const parts=path.split(/[\\/]/);
 if(parts.length>MAX_DEPTH || parts.some(p=>!p||p==='.'||p==='..'||!SAFE_NAME.test(p)))refuse('UNSAFE_SOURCE_NAME');
 return parts.join('/');
}
export async function collectV16IndexedDb(root) {
 if(typeof root!=='string'||!root.trim())refuse('EXPLICIT_PERSISTENT_ROOT_REQUIRED');
 const persistent=await fs.realpath(resolve(root));
 await realFile(persistent,'dir');
 const candidates=(await fs.readdir(persistent,{withFileTypes:true}))
  .filter(d=>/^pc-reconstruction-[a-f0-9]{32}$/i.test(d.name));
 if(candidates.length!==1)refuse('REQUIRE_EXACTLY_ONE_PRESERVED_V16_RECONSTRUCTION');
 const base=join(persistent,candidates[0].name);
 await realFile(base,'dir');
 try {await fs.access(join(base,'INVALID-PC-RECONSTRUCTION-NOT-BACKUP.txt'));refuse('INCOMPLETE_RECONSTRUCTION');}
 catch(e) {if(e.message?.includes('B01_BLOCKED'))throw e;if(e.code!=='ENOENT')throw e;}
 const path=join(base,'app_webview','Default','IndexedDB');
 const dbRoot=await realFile(path,'dir');
 if(!dbRoot.real.startsWith(base+sep))refuse('PATH_ESCAPES_RECONSTRUCTION');
 const members=[];let count=0,bytes=0,logs=0,hasCurrent=false,hasManifest=false;
 const walk=async(location)=>{
  const entries=await fs.readdir(location,{withFileTypes:true});
  for(const d of entries){
   const full=join(location,d.name),sub=legalRelative(relative(base,full));
   const stat=await fs.lstat(full);
   if(stat.isSymbolicLink())refuse('SYMLINK_NOT_ALLOWED');
   const real=await fs.realpath(full);
   if(!real.startsWith(base+sep))refuse('MEMBER_OUTSIDE_RECONSTRUCTION');
   if(++count>MAX_FILES)refuse('TOO_MANY_FILES');
   if(stat.isDirectory()){
    members.push({name:sub+'/',type:'5',size:0,full,stat});
    await walk(full);
   } else if(stat.isFile()){
    bytes+=stat.size;
    if(bytes>MAX_BYTES)refuse('FILESET_TOO_LARGE');
    if(/\.leveldb\/[0-9]+\.log$/i.test(sub))logs++;
    if(/\.leveldb\/CURRENT$/i.test(sub))hasCurrent=true;
    if(/\.leveldb\/MANIFEST-[0-9]+$/i.test(sub))hasManifest=true;
    members.push({name:sub,type:'0',size:stat.size,full,stat});
   } else refuse('SPECIAL_FILE_NOT_ALLOWED');
  }
 };
 // tar archive paths are always under app_webview/Default/IndexedDB.
 members.push({name:'app_webview/',type:'5',size:0});
 members.push({name:'app_webview/Default/',type:'5',size:0});
 members.push({name:'app_webview/Default/IndexedDB/',type:'5',size:0});
 await walk(path);
 if(!logs||!hasCurrent||!hasManifest)refuse('V17_REQUIRED_LEVELDB_MARKERS_MISSING');
 return {base,members,regular:members.filter(m=>m.type==='0'),bytes};
}
function tarHeader(member){
 const h=Buffer.alloc(512);
 const ascii=(s,off,len)=>{if(!/^[\x00-\x7f]*$/.test(s)||Buffer.byteLength(s)>len)refuse('TAR_NAME_TOO_LONG');h.write(s,off,len,'ascii');};
 const oct=(n,off,len)=>{const s=n.toString(8);if(s.length>len-1)refuse('TAR_MEMBER_TOO_LARGE');ascii(s.padStart(len-1,'0')+'\0',off,len);};
 ascii(member.name,0,100);oct(member.type==='5'?0o700:0o600,100,8);oct(0,108,8);oct(0,116,8);oct(member.size,124,12);oct(0,136,12);
 h.fill(0x20,148,156);ascii(member.type,156,1);ascii('ustar\0',257,6);ascii('00',263,2);
 const sum=h.reduce((a,v)=>a+v,0);oct(sum,148,8);return h;
}
export async function* tarBytes(members){
 for(const member of members){
  yield tarHeader(member);
  if(member.type==='0'){
   const before=await fs.stat(member.full),hash=createHash('sha256');let consumed=0;
   if(before.size!==member.size||before.mtimeMs!==member.stat.mtimeMs)refuse('SOURCE_CHANGED_BEFORE_READ');
   for await(const chunk of createReadStream(member.full,{highWaterMark:32768})){
    consumed+=chunk.length;hash.update(chunk);yield chunk;
    if(consumed>member.size)refuse('SOURCE_GREW_WHILE_READING');
   }
   const after=await fs.stat(member.full);
   if(consumed!==member.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs)refuse('SOURCE_CHANGED_DURING_READ');
   member.sha256=hash.digest('hex');
   const pad=(512-(consumed%512))%512;
   if(pad)yield Buffer.alloc(pad);
  }
 }
 yield Buffer.alloc(1024);
}
export async function transmitTar(adb,serial,members,{spawnFn=spawn}={}){
 const child=spawnFn(adb,['-s',serial,'exec-in','run-as',DIAGNOSTIC,'sh','-c','tar -xf -'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
 let stderr='',stdout='';
 child.stderr.setEncoding('utf8');child.stdout.setEncoding('utf8');
 child.stderr.on('data',d=>{stderr+=d.slice(0,1000)});
 child.stdout.on('data',d=>{stdout+=d.slice(0,1000)});
 const result=new Promise((res,rej)=>{child.on('error',rej);child.on('close',code=>code===0?res():rej(Error('B01_BLOCKED_EMULATOR_TAR_IMPORT_FAILED')))});
 try{
  for await(const buf of tarBytes(members)){
   if(!child.stdin.write(buf))await new Promise((res,rej)=>{
    child.stdin.once('drain',res);child.stdin.once('error',rej);
   });
  }
  child.stdin.end();await result;
 }catch(e){child.stdin.destroy();child.kill();throw e;}
}
export function validateAdbDeviceList(list){
 const rows=list.split(/\r?\n/).filter(x=>/^emulator-[0-9]+\s+device(?:\s|$)/.test(x));
 if(rows.length!==1)refuse('ONE_RUNNING_EMULATOR_REQUIRED');
 return rows[0].trim().split(/\s+/)[0];
}
export async function executeIsolatedTransfer({persistentRoot,adb,apk,aapt,dryRun=false,runner=null}){
 const src=await collectV16IndexedDb(persistentRoot);
 if(!adb||!apk||!aapt)refuse('ADB_APK_AAPT_EXPLICIT_PATHS_REQUIRED');
 await realFile(adb,'file');await realFile(apk,'file');await realFile(aapt,'file');
 const badging=output(spawnSync(aapt,['dump','badging',apk],{encoding:'utf8',timeout:30000,windowsHide:true}));
 ensureExpectedApp(badging);
 const devices=output(spawnSync(adb,['devices','-l'],{encoding:'utf8',timeout:30000,windowsHide:true}));
 const serial=validateAdbDeviceList(devices);
 const qemu=adbSync(adb,serial,'shell','getprop','ro.kernel.qemu');
 const hardware=adbSync(adb,serial,'shell','getprop','ro.hardware');
 const fingerprint=adbSync(adb,serial,'shell','getprop','ro.build.fingerprint');
 const avdName=adbSync(adb,serial,'emu','avd','name').split(/\r?\n/)[0].trim();
 const liveInstalled=adbSync(adb,serial,'shell','pm','path',LIVE).includes('package:');
 const diagnosticInstalled=adbSync(adb,serial,'shell','pm','path',DIAGNOSTIC).includes('package:');
 classifyEmulator({serial,hardware,fingerprint,qemu,avdName,liveInstalled,diagnosticInstalled});
 const report={
  schema:'paseka-b01-isolated-emulator-transfer-v20',
  status:dryRun?'EMULATOR_GUARD_PRECHECK_PASS_NO_IMPORT':'BLOCKED',
  code:dryRun?'PRECHECK_ONLY':'NOT_STARTED',
  physicalOnePlusAccess:'NOT_ATTEMPTED',destination:'ISOLATED_AVD_ONLY',
  appId:DIAGNOSTIC,privateFilesUploaded:'NO',sourceFilesModified:'NO',
  sourceFileCount:src.regular.length,sourceBytes:src.bytes,
  sourceHashesComparedToEmulator:0,verified:false,
  fullBackupVerified:false,independentRestore:'NOT_VERIFIED',
  galleryMediaStore:'NOT_TESTED',videoCleanup:'NOT_ATTEMPTED'
 };
 if(dryRun)return report;
 const installed=adbSync(adb,serial,'install','--no-streaming',apk);
 if(!/Success/.test(installed))refuse('EMULATOR_INSTALL_NOT_CONFIRMED');
 await transmitTar(adb,serial,src.members);
 for(const member of src.regular) {
  // Real data never leaves the diagnostic app sandbox; only digest is returned.
  const result=adbSync(adb,serial,'exec-out','run-as',DIAGNOSTIC,'sha256sum',member.name);
  const digest=/^([0-9a-f]{64})(?:\s|$)/i.exec(result)?.[1]?.toLowerCase();
  if(!digest||digest!==member.sha256)refuse('EMULATOR_BYTE_READBACK_MISMATCH');
  report.sourceHashesComparedToEmulator++;
 }
 if(report.sourceHashesComparedToEmulator!==src.regular.length)refuse('EMULATOR_READBACK_INCOMPLETE');
 report.status='EMULATOR_ISOLATED_FILE_IMPORT_SHA_PASS_NOT_DB_RESTORE';
 report.code='ISOLATED_DIAGNOSTIC_FILE_BYTES_MATCH';
 report.verified=true;
 // Do not auto-launch WebView: a separate diagnostic read-only action remains.
 return report;
}
