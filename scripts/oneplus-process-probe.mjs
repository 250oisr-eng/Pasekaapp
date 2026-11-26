import {spawn} from 'node:child_process';
const PKG='ru.paseka.journal';
const MAX=256*1024;
export function classifyPidof({code,output='',overflow=false}){
 const words=output.trim().split(/\s+/).filter(Boolean);
 if(overflow||!Number.isInteger(code))return {state:'UNKNOWN',reason:'OUTPUT_OR_EXIT_UNKNOWN'};
 if(code===0&&words.length>0&&words.every(x=>/^\d+$/.test(x)))return {state:'PRESENT',count:words.length};
 if((code===0||code===1)&&words.length===0)return {state:code===1?'ABSENT':'UNKNOWN',count:code===1?0:null,reason:code===0?'EMPTY_SUCCESS':undefined};
 return {state:'UNKNOWN',reason:'UNEXPECTED_PIDOF_RESULT'};
}
export function classifyPs({code,output='',overflow=false},mode='full'){
 if(code!==0||overflow)return {state:'UNKNOWN',reason:overflow?'OUTPUT_LIMIT':'COMMAND_UNAVAILABLE'};
 const lines=output.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 if(lines.length<2)return {state:'UNKNOWN',reason:'NO_PROCESS_ROWS'};
 const hdr=lines[0].split(/\s+/);
 const idx=hdr.findIndex(x=>['NAME','COMMAND','CMDLINE','CMD','ARGS'].includes(x.toUpperCase()));
 if(idx<0)return {state:'UNKNOWN',reason:'NO_NAME_COLUMN'};
 let hits=0,parsed=0;
 for(const line of lines.slice(1)){
  const parts=line.split(/\s+/);
  if(parts.length<=idx)continue;
  parsed++;
  const name=parts.slice(idx).join(' ');
  if(name===PKG||name.startsWith(PKG+':'))hits++;
 }
 if(parsed===0)return {state:'UNKNOWN',reason:'UNPARSABLE_ROWS'};
 return {state:hits?'PRESENT':'ABSENT',count:hits,rowsParsed:parsed,mode};
}
export async function runAdbCommand(adb,args){
 return new Promise((resolve,reject)=>{
  const proc=spawn(adb,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const chunks=[];let size=0,overflow=false;
  proc.stdout.on('data',buf=>{size+=buf.length;if(size>MAX){overflow=true;proc.kill();return;}chunks.push(buf);});
  // stderr contains device details; never print or store them.
  proc.stderr.on('data',()=>{});
  proc.once('error',()=>reject(Error('ADB_EXEC_NOT_AVAILABLE')));
  proc.once('close',code=>resolve({code,output:overflow?'':Buffer.concat(chunks).toString('utf8'),overflow}));
 });
}
export async function probeProcess(adb,serial){
 const args=(...tail)=>['-s',serial,'shell',...tail];
 const pidof=classifyPidof(await runAdbCommand(adb,args('pidof',PKG)));
 const named=classifyPs(await runAdbCommand(adb,args('ps','-A','-o','NAME')),'names');
 // Android toybox variants sometimes reject "-o NAME"; fall back to full ps.
 const full=named.state==='UNKNOWN'?
   classifyPs(await runAdbCommand(adb,args('ps','-A')),'full'):
   {state:'NOT_NEEDED'};
 const seen=[pidof,named,full].some(x=>x.state==='PRESENT');
 const psClear=[named,full].some(x=>x.state==='ABSENT');
 const pidofSupportsAbsent=pidof.state==='ABSENT'||pidof.reason==='EMPTY_SUCCESS';
 const cannotReadPidof=pidof.state==='UNKNOWN'&&pidof.reason!=='EMPTY_SUCCESS';
 const state=seen?'PRESENT':psClear&&pidofSupportsAbsent?'ABSENT':'UNKNOWN';
 return {state,pidof,namedPs:named,fullPs:full,
   reason:state==='UNKNOWN'?(cannotReadPidof?'PIDOF_UNTRUSTWORTHY':'PROCESS_INVENTORY_UNTRUSTWORTHY'):undefined};
}
