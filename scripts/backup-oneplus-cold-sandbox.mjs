import {spawn} from 'node:child_process';
import {open,lstat,realpath,rename,writeFile} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {pathToFileURL} from 'node:url';
import {probeProcess} from './oneplus-process-probe.mjs';
import {StrictBase64Decoder} from './oneplus-strict-base64.mjs';
import {inspectPartial} from './inspect-oneplus-partial-tar.mjs';

const PACKAGE='ru.paseka.journal';
const MAX_CAPTURE=1024*1024;
const MAX_ARCHIVE=16*1024*1024*1024; // fail closed on larger source; do not delete originals
const FAIL='DEVICE_BACKUP_BLOCKED';
export function parseArgs(args){
  if(!Array.isArray(args)|| !([2,3].includes(args.length)) ||args[0]!=='--dest'||!args[1]||args[1].startsWith('--')|| (args.length===3 && args[2]!=='--allow-force-stop'))throw Error('INVALID_ARGUMENTS');
  return {dest:args[1],allowForceStop:args.length===3};
}
export function selectOneDevice(raw){
  if(typeof raw!=='string'||!raw.startsWith('List of devices attached'))throw Error('ADB_DEVICE_LIST_INVALID');
  const lines=raw.split(/\r?\n/).slice(1).map(x=>x.trim()).filter(Boolean);
  const devices=lines.map(line=>{
    const m=/^([^\s]+)\s+([^\s]+)/.exec(line);
    if(!m)throw Error('ADB_DEVICE_LIST_INVALID');
    return {serial:m[1],status:m[2]};
  });
  if(devices.length===0)throw Error('ADB_NO_DEVICE');
  if(devices.length!==1)throw Error('ADB_MULTIPLE_DEVICES');
  if(devices[0].status==='unauthorized')throw Error('ADB_DEVICE_UNAUTHORIZED');
  if(devices[0].status!=='device')throw Error('ADB_DEVICE_NOT_READY');
  if(!/^[\w.:\-]+$/.test(devices[0].serial))throw Error('ADB_DEVICE_LIST_INVALID');
  return devices[0].serial;
}
function limitedProcess(command,args,{max=MAX_CAPTURE}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const chunks=[];let length=0,erred=false;
  const onData=chunk=>{length+=chunk.length;if(length>max){erred=true;child.kill();return;}chunks.push(chunk);};
  child.stdout.on('data',onData);
  child.stderr.on('data',chunk=>{if(chunk.length>max)erred=true;});
  child.on('error',()=>reject(Error('ADB_EXEC_NOT_AVAILABLE')));
  child.on('close',code=>resolve({code,stdout:erred?'':Buffer.concat(chunks).toString('utf8'),overflow:erred}));
 });
}
function adb(serial,options){return ['-s',serial,...options];}
async function checkStopped(command,serial){
 const check=await probeProcess(command,serial);
 if(check.state==='ABSENT')return;
 if(check.state==='PRESENT')throw Error('APP_MUST_BE_STOPPED_MANUALLY');
 throw Error('PROCESS_INVENTORY_UNAVAILABLE');
}
// A force-stop is an opt-in local operational action, never the default.
// It interrupts the app and may discard UNSAVED work, even though it does
// not clear the installed app's persistent data.
async function ensureStopped(command,serial,{allowForceStop=false}={}){
 try {await checkStopped(command,serial);return false;}
 catch(e){
  if(e.message!=='APP_MUST_BE_STOPPED_MANUALLY'||!allowForceStop)throw e;
 }
 const stop=await limitedProcess(command,adb(serial,['shell','am','force-stop',PACKAGE]));
 if(stop.code!==0||stop.overflow)throw Error('ADB_FORCE_STOP_FAILED');
 // Detect service auto-restart before and after a modest stabilization window.
 await checkStopped(command,serial);
 await new Promise(r=>setTimeout(r,1300));
 await checkStopped(command,serial);
 return true;
}
async function checkReadable(command,serial){
 const r=await limitedProcess(command,adb(serial,['shell','run-as',PACKAGE,'pwd']));
 if(r.code!==0||r.overflow||!r.stdout.includes('/'+PACKAGE))throw Error('RUN_AS_UNAVAILABLE');
 const d=await limitedProcess(command,adb(serial,['shell','run-as',PACKAGE,'ls','-ld','app_webview']));
 if(d.code!==0||d.overflow)throw Error('WEBVIEW_DIRECTORY_NOT_ACCESSIBLE');
}
async function verifyTar(archivePath){
 const r=await limitedProcess('tar',['-tf',archivePath],{max:12*1024*1024});
 if(r.code!==0||r.overflow)throw Error('TAR_INTEGRITY_NOT_VERIFIED');
 const lines=r.stdout.split(/\r?\n/).filter(Boolean);
 if(lines.length===0||!lines.some(x=>x.startsWith('./app_webview/')||x==='./app_webview/'||x==='app_webview/'))throw Error('APP_WEBVIEW_NOT_IN_ARCHIVE');
 const indexedDb=lines.some(x=>x.includes('/IndexedDB/')||x.includes('/indexeddb/'));
 return {entries:lines.length,indexedDbPresent:indexedDb};
}
// Classification is based on bounded Android stderr, but raw device stderr
// (possibly containing private paths) never enters output or saved reports.
function categorizeTarStderr(raw){
 const low=raw.toLowerCase();
 if(!low)return 'NONE';
 if(/permission denied|operation not permitted|access denied/.test(low))return 'PERMISSION_DENIED';
 if(/no space left|not enough space/.test(low))return 'DEVICE_SPACE_EXHAUSTED';
 if(/file changed as we read|file changed|changed while/.test(low))return 'SOURCE_CHANGED_DURING_READ';
 if(/not found|not recognized|unknown command|inaccessible or not found/.test(low))return 'COMMAND_OR_PATH_NOT_FOUND';
 if(/invalid option|unrecognized option|usage: tar|unknown option/.test(low))return 'TAR_OPTION_UNSUPPORTED';
 if(/broken pipe|write error|read error|input\/output error/.test(low))return 'STREAM_IO_ERROR';
 return 'OTHER_REDACTED';
}
// Only publish bounded stage evidence; stderr is never printed because it
// may contain user filenames or device-internal paths.
function transferFailure(code,{tarExitCode=null,transferredBytes=0,stderrSeen=false,stderrCategory='NONE',encodedBytes=null,transportReason=null}={}){
 const e=Error(code);
 e.safeEvidence={stage:'ANDROID_TAR_TRANSFER',tarExitCode:Number.isInteger(tarExitCode)?tarExitCode:null,
   transferredBytes:Number.isSafeInteger(transferredBytes)?transferredBytes:null,
   stderrSeen:!!stderrSeen,stderrCategory,
   encodedBytes:Number.isSafeInteger(encodedBytes)?encodedBytes:null,
   transportReason:/^BASE64_TRANSPORT_[A-Z_]+$/.test(transportReason||'')?transportReason:null};
 return e;
}
async function streamArchive(command,serial,output){
 let child=null,total=0,stderrBytes=0,stderrSample='';
 const sha=createHash('sha256');
 try{
  const stream=createWriteStream(output,{flags:'wx',mode:0o600});
  child=spawn(command,adb(serial,['exec-out','run-as',PACKAGE,'sh','-c','set -o pipefail; tar -cf - . | base64']),{
    shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']
  });
  child.stderr.on('data',data=>{
   stderrBytes+=data.length;
   if(stderrSample.length<8192)stderrSample+=data.toString('utf8').slice(0,8192-stderrSample.length);
   if(stderrBytes>MAX_CAPTURE)child.kill();
  });
  const done=new Promise((resolve,reject)=>{
    child.once('error',()=>reject(transferFailure('ANDROID_TAR_START_FAILED',{
      transferredBytes:total,stderrSeen:stderrBytes>0,stderrCategory:categorizeTarStderr(stderrSample)
    })));
    child.once('close',code=>resolve(code));
  });
  const tap=new Transform({transform(chunk,_enc,cb){
    total+=chunk.length;
    if(total>MAX_ARCHIVE){child.kill();cb(Error('ARCHIVE_LIMIT_EXCEEDED'));return;}
    sha.update(chunk);cb(null,chunk);
  }});
  const decoder=new StrictBase64Decoder();
  let streamError=null;
  try{await pipeline(child.stdout,decoder,tap,stream);}
  catch(error){streamError=error;}
  const exit=await done;
  if(exit!==0)throw transferFailure('ANDROID_TAR_COMMAND_FAILED',{
    tarExitCode:exit,transferredBytes:total,stderrSeen:stderrBytes>0,stderrCategory:categorizeTarStderr(stderrSample)
  });
  if(streamError)throw transferFailure(decoder.failureReason?'BASE64_TRANSPORT_INVALID':'ANDROID_TAR_STREAM_FAILED',{
    tarExitCode:exit,transferredBytes:total,encodedBytes:decoder.encodedBytes,
    transportReason:decoder.failureReason,
    stderrSeen:stderrBytes>0,stderrCategory:categorizeTarStderr(stderrSample)
  });
  if(stderrBytes>MAX_CAPTURE)throw transferFailure('ANDROID_TAR_STDERR_LIMIT',{
    tarExitCode:exit,transferredBytes:total,stderrSeen:true
  });
  if(total<1024)throw transferFailure('ANDROID_TAR_EMPTY_OR_TOO_SMALL',{
    tarExitCode:exit,transferredBytes:total,stderrSeen:stderrBytes>0,stderrCategory:categorizeTarStderr(stderrSample)
  });
  if(total%512!==0)throw transferFailure('ANDROID_TAR_ALIGNMENT_INVALID',{
    tarExitCode:exit,transferredBytes:total,stderrSeen:stderrBytes>0,stderrCategory:categorizeTarStderr(stderrSample)
  });
  const synced=await open(output,'r');
  try{await synced.sync();}finally{await synced.close();}
  return {bytes:total,sha256:sha.digest('hex')};
 }finally{
  if(child&&!child.killed&&child.exitCode===null)child.kill();
 }
}
export async function runBackup(dest,{adbCommand=process.env.PASEKA_ADB||'adb',allowForceStop=false}={}){
 const root=resolve(dest);
 let info;
 try{info=await lstat(root);}catch{throw Error('DESTINATION_NOT_ACCESSIBLE');}
 if(!info.isDirectory()||info.isSymbolicLink())throw Error('DESTINATION_NOT_DIRECTORY');
 const actual=await realpath(root);
 if(process.platform==='win32'?
   actual.toLowerCase()!==root.toLowerCase():actual!==root)
   throw Error('DESTINATION_NOT_CANONICAL');
 const first=await limitedProcess(adbCommand,['devices','-l']);
 if(first.code!==0||first.overflow)throw Error('ADB_NOT_READY');
 const serial=selectOneDevice(first.stdout);
 // Read-only preflight: no force-stop, no install, no app storage mutations.
 const deviceForcedStopped=await ensureStopped(adbCommand,serial,{allowForceStop});
 await checkReadable(adbCommand,serial);
 const id=randomUUID().slice(0,12);
 const temp=join(root,'PASEKA-ONEPLUS-SANDBOX-'+id+'.tar.partial');
 const final=join(root,'PASEKA-ONEPLUS-SANDBOX-'+id+'.tar');
 const reportFile=join(root,'PASEKA-ONEPLUS-SANDBOX-'+id+'.json');
 try{
  const streamed=await streamArchive(adbCommand,serial,temp);
  await checkStopped(adbCommand,serial);
  const structure=await inspectPartial(temp);
  if(structure.status!=='TAR_STRUCTURE_CHECKED_LOCAL_ONLY')throw Error('TAR_STRUCTURE_NOT_VERIFIED');
  const validated=await verifyTar(temp);
  // Independently re-read bytes actually stored on the chosen disk, rather
  // than trusting only the SHA computed before the operating-system flush.
  const diskHash=createHash('sha256');let diskBytes=0;
  for await(const block of createReadStream(temp)){
    diskBytes+=block.length;diskHash.update(block);
    if(diskBytes>MAX_ARCHIVE)throw Error('ARCHIVE_LIMIT_EXCEEDED');
  }
  if(diskBytes!==streamed.bytes||diskHash.digest('hex')!==streamed.sha256)
    throw Error('LOCAL_ARCHIVE_READBACK_MISMATCH');
  // This is an app-private cold file snapshot. It is NOT an independent
  // WebView/IndexedDB runtime restore or full Android MediaStore inventory.
  await rename(temp,final);
  const result={
    schema:'paseka-oneplus-cold-sandbox-backup-v1',
    status:'APP_PRIVATE_COLD_TAR_ARCHIVED_RESTORE_NOT_TESTED',
    file:final.split(/[\\/]/).pop(),bytes:streamed.bytes,sha256:streamed.sha256,
    tarEntries:validated.entries,indexedDbPathEnumerated:validated.indexedDbPresent,
    transportEncoding:'BASE64_STRICT',androidGalleryMediaStoreIncluded:false,
    independentPhysicalRestoreVerified:false,originalsDeleted:false,
    installedApplicationChanged:false,
    diagnosticPackageChanged:false,deviceForcedStopped
  };
  await writeFile(reportFile,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  return result;
 }catch(error){
  // Preserve any partial copy for inspection; never overwrite or remove data.
  
  throw error;
 }
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 Promise.resolve().then(()=>{const opts=parseArgs(process.argv.slice(2));return runBackup(opts.dest,{allowForceStop:opts.allowForceStop});}).then(r=>{
  console.log(JSON.stringify(r,null,2));
  process.exitCode=2; // full physical independent restore never claimed
 },e=>{
  console.log(JSON.stringify({schema:'paseka-oneplus-cold-sandbox-backup-v1',
   status:'BLOCKED',code:/^[A-Z][A-Z0-9_]*$/.test(e.message)?e.message:FAIL,
   evidence:e.safeEvidence||null,
   originalsDeleted:false,installedApplicationChanged:false,independentPhysicalRestoreVerified:false}));
  process.exitCode=1;
 });
}
