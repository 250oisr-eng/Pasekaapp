import {spawn} from 'node:child_process';
import {open,lstat,realpath,rename,writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {pathToFileURL} from 'node:url';

const PACKAGE='ru.paseka.journal';
const MAX_CAPTURE=1024*1024;
const MAX_ARCHIVE=16*1024*1024*1024; // fail closed on larger source; do not delete originals
const FAIL='DEVICE_BACKUP_BLOCKED';
export function parseArgs(args){
  if(!Array.isArray(args)||args.length!==2||args[0]!=='--dest'||!args[1]||args[1].startsWith('--'))throw Error(FAIL);
  return {dest:args[1]};
}
export function selectOneDevice(raw){
  if(typeof raw!=='string'||!raw.startsWith('List of devices attached'))throw Error(FAIL);
  const lines=raw.split(/\r?\n/).slice(1).map(x=>x.trim()).filter(Boolean);
  const devices=lines.map(line=>{
    const m=/^([^\s]+)\s+([^\s]+)/.exec(line);
    if(!m)throw Error(FAIL);
    return {serial:m[1],status:m[2]};
  });
  if(devices.length!==1||devices[0].status!=='device'||
     !/^[\w.:\-]+$/.test(devices[0].serial))throw Error(FAIL);
  return devices[0].serial;
}
function limitedProcess(command,args,{max=MAX_CAPTURE}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const chunks=[];let length=0,erred=false;
  const onData=chunk=>{length+=chunk.length;if(length>max){erred=true;child.kill();return;}chunks.push(chunk);};
  child.stdout.on('data',onData);
  child.stderr.on('data',chunk=>{if(chunk.length>max)erred=true;});
  child.on('error',()=>reject(Error(FAIL)));
  child.on('close',code=>resolve({code,stdout:erred?'':Buffer.concat(chunks).toString('utf8'),overflow:erred}));
 });
}
function adb(serial,options){return ['-s',serial,...options];}
function isStopped(pidof){
  // Android pidof returns status 1 for a missing process; other failures stop.
  return pidof.code===1&&!pidof.stdout.trim()&&!pidof.overflow;
}
async function checkStopped(command,serial){
 const r=await limitedProcess(command,adb(serial,['shell','pidof',PACKAGE]));
 if(!isStopped(r))throw Error('APP_MUST_BE_STOPPED_MANUALLY');
 const ps=await limitedProcess(command,adb(serial,['shell','ps','-A','-o','NAME']));
 if(ps.code!==0||ps.overflow||!ps.stdout.includes('NAME'))throw Error('PROCESS_INVENTORY_UNAVAILABLE');
 if(ps.stdout.split(/\r?\n/).some(line=>{
   const name=line.trim();return name===PACKAGE||name.startsWith(PACKAGE+':');
 }))throw Error('APP_MUST_BE_STOPPED_MANUALLY');
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
async function streamArchive(command,serial,output){
 let child=null,total=0;
 const sha=createHash('sha256');
 try{
  const stream=createWriteStream(output,{flags:'wx',mode:0o600});
  child=spawn(command,adb(serial,['exec-out','run-as',PACKAGE,'tar','-cf','-','.']),{
    shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']
  });
  let stderrBytes=0;
  child.stderr.on('data',data=>{stderrBytes+=data.length;if(stderrBytes>MAX_CAPTURE)child.kill();});
  const done=new Promise((resolve,reject)=>{
    child.once('error',()=>reject(Error(FAIL)));
    child.once('close',code=>resolve(code));
  });
  const tap=new Transform({transform(chunk,_enc,cb){
    total+=chunk.length;
    if(total>MAX_ARCHIVE){child.kill();cb(Error('ARCHIVE_LIMIT_EXCEEDED'));return;}
    sha.update(chunk);cb(null,chunk);
  }});
  await pipeline(child.stdout,tap,stream);
  const exit=await done;
  if(exit!==0||stderrBytes>MAX_CAPTURE||total<1024||total%512!==0)throw Error('DEVICE_TAR_EXPORT_FAILED');
  const synced=await open(output,'r');
  try{await synced.sync();}finally{await synced.close();}
  return {bytes:total,sha256:sha.digest('hex')};
 }finally{
  if(child&&!child.killed&&child.exitCode===null)child.kill();
 }
}
export async function runBackup(dest,{adbCommand=process.env.PASEKA_ADB||'adb'}={}){
 const root=resolve(dest);
 const info=await lstat(root);
 if(!info.isDirectory()||info.isSymbolicLink()||await realpath(root)!==root)throw Error(FAIL);
 const first=await limitedProcess(adbCommand,['devices','-l']);
 if(first.code!==0||first.overflow)throw Error('ADB_NOT_READY');
 const serial=selectOneDevice(first.stdout);
 // Read-only preflight: no force-stop, no install, no app storage mutations.
 await checkStopped(adbCommand,serial);
 await checkReadable(adbCommand,serial);
 const id=randomUUID().slice(0,12);
 const temp=join(root,'PASEKA-ONEPLUS-SANDBOX-'+id+'.tar.partial');
 const final=join(root,'PASEKA-ONEPLUS-SANDBOX-'+id+'.tar');
 const reportFile=join(root,'PASEKA-ONEPLUS-SANDBOX-'+id+'.json');
 try{
  const streamed=await streamArchive(adbCommand,serial,temp);
  await checkStopped(adbCommand,serial);
  const validated=await verifyTar(temp);
  // This is an app-private cold file snapshot. It is NOT an independent
  // WebView/IndexedDB runtime restore or full Android MediaStore inventory.
  await rename(temp,final);
  const result={
    schema:'paseka-oneplus-cold-sandbox-backup-v1',
    status:'APP_PRIVATE_COLD_TAR_ARCHIVED_RESTORE_NOT_TESTED',
    file:final.split(/[\\/]/).pop(),bytes:streamed.bytes,sha256:streamed.sha256,
    tarEntries:validated.entries,indexedDbPathEnumerated:validated.indexedDbPresent,
    androidGalleryMediaStoreIncluded:false,
    independentPhysicalRestoreVerified:false,originalsDeleted:false,
    installedApplicationChanged:false,
    diagnosticPackageChanged:false,deviceForcedStopped:false
  };
  await writeFile(reportFile,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  return result;
 }catch(error){
  // Preserve any partial copy for inspection; never overwrite or remove data.
  if(staged){} 
  throw error;
 }
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 Promise.resolve().then(()=>runBackup(parseArgs(process.argv.slice(2)).dest)).then(r=>{
  console.log(JSON.stringify(r,null,2));
  process.exitCode=2; // full physical independent restore never claimed
 },e=>{
  console.error(JSON.stringify({schema:'paseka-oneplus-cold-sandbox-backup-v1',
   status:'BLOCKED',code:/^[A-Z_]+$/.test(e.message)?e.message:FAIL,
   originalsDeleted:false,installedApplicationChanged:false,independentPhysicalRestoreVerified:false}));
  process.exitCode=1;
 });
}
