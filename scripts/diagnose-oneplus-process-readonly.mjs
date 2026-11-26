import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {selectOneDevice} from './backup-oneplus-cold-sandbox.mjs';
import {probeProcess} from './oneplus-process-probe.mjs';

const PKG='ru.paseka.journal';
const MAX=8192;
function invoke(adb,args){
 return new Promise((ok,fail)=>{
  let output='',overflow=false;
  const child=spawn(adb,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',buf=>{
   if(output.length+buf.length>MAX){overflow=true;child.kill();return;}
   output+=buf.toString('utf8');
  });
  child.stderr.on('data',()=>{});
  child.once('error',()=>fail(Error('ADB_EXEC_NOT_AVAILABLE')));
  child.once('close',code=>ok({code,output,overflow}));
 });
}
function statusPidof(r){
 if(r.overflow)return {state:'UNKNOWN',count:null};
 const words=r.output.trim().split(/\s+/).filter(Boolean);
 if(r.code===1 && words.length===0)return {state:'ABSENT',count:0};
 if(r.code===0 && words.length>0 && words.every(x=>/^\d+$/.test(x)))
   return {state:'PRESENT',count:words.length};
 return {state:'UNKNOWN',count:null};
}
function statusPs(r){
 if(r.code!==0||r.overflow||!r.output.includes('NAME'))return {state:'UNKNOWN',count:null};
 const all=r.output.split(/\r?\n/).map(x=>x.trim());
 const found=all.filter(x=>x===PKG || x.startsWith(PKG+':'));
 return {state:found.length?'PRESENT':'ABSENT',count:found.length};
}
export async function diagnose({adb=process.env.PASEKA_ADB||'adb', pauseMs=1200}={}){
 const list=await invoke(adb,['devices','-l']);
 if(list.code!==0||list.overflow)throw Error('ADB_NOT_READY');
 const serial=selectOneDevice(list.output);
 const cmd=more=>['-s',serial,'shell',...more];
 const sample=async()=>{
  const p=await probeProcess(adb,serial);
  return {state:p.state,pidof:p.pidof,ps:p.namedPs,psFallback:p.fullPs,reason:p.reason};
 };
 const first=await sample();
 await new Promise(r=>setTimeout(r,pauseMs));
 const second=await sample();
 const runAs=await invoke(adb,cmd(['run-as',PKG,'pwd']));
 const webview=runAs.code===0 ? await invoke(adb,cmd(['run-as',PKG,'ls','-ld','app_webview'])):null;
 const consistent=[first,second].every(x=>x.state!=='UNKNOWN'&&x.state===first.state);
 const contradiction=[first,second].some(x=>x.pidof.state==='ABSENT'&&x.ps.state==='PRESENT');
 return {schema:'paseka-oneplus-process-readonly-diagnostic-v1',
  status:contradiction?'PROCESS_STATE_CONFLICT':consistent?'PROCESS_STATE_MEASURED':'PROCESS_STATE_AMBIGUOUS',
  first,second,
  runAsAvailable:runAs.code===0&&!runAs.overflow,
  appWebviewAccessible:webview?webview.code===0&&!webview.overflow:false,
  forceStopAttempted:false,archiveAttempted:false,
  phoneDataModified:false,independentRestoreVerified:false};
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 diagnose().then(r=>{console.log(JSON.stringify(r,null,2));},e=>{
  console.log(JSON.stringify({schema:'paseka-oneplus-process-readonly-diagnostic-v1',
   status:'BLOCKED',code:/^[A-Z_]+$/.test(e.message)?e.message:'DIAGNOSTIC_FAILED',
   forceStopAttempted:false,archiveAttempted:false,phoneDataModified:false}));
  process.exitCode=1;
 });
}
