#!/usr/bin/env node
// Offline read-only analysis of a complete JobScheduler dumpsys text snapshot.
// Registration, runnable and even scheduler completion are not ZIP proof.
import {readFileSync} from 'node:fs';
const QA='ru.paseka.journal.qa.daily';
// PowerShell 5.1 redirects native stdout as UTF-16LE.
export function decodeDump(bytes){
 if(!Buffer.isBuffer(bytes))throw Error('G4_BLOCKED: diagnostic input must be bytes');
 if(bytes.length===0)throw Error('G4_BLOCKED: empty JobScheduler dump');
 if(bytes[0]===0xff && bytes[1]===0xfe){
   if(bytes.length%2)throw Error('G4_BLOCKED: invalid UTF-16LE length');
   return bytes.subarray(2).toString('utf16le');
 }
 if(bytes[0]===0xfe && bytes[1]===0xff)throw Error('G4_BLOCKED: unsupported UTF-16BE');
 const decoded=bytes.toString('utf8').replace(/^\uFEFF/,'');
 if(decoded.includes('\0'))throw Error('G4_BLOCKED: unknown encoding');
 return decoded;
}
export function inspectG4(source){
 if(typeof source!=='string'||!source.trim())throw Error('G4_BLOCKED: empty JobScheduler dump');
 const lines=source.split(/\r?\n/);
 const start=lines.findIndex(x=>/^\s*JOB #\S+:.*\bru\.paseka\.journal\.qa\.daily\/\.PasekaDailyArchiveJob\s*$/.test(x));
 if(start<0)return {package:QA,jobRegistered:false,backgroundExecution:'NOT_VERIFIED',reason:'QA JobService block absent'};
 const tail=lines.slice(start+1),next=tail.findIndex(x=>/^\s*JOB #\S+:/.test(x));
 const block=[lines[start],...tail.slice(0,next<0?tail.length:next)].join('\n');
 const meta=block.split(/^\s*JobStatus\{/m)[0];
 const id=block.match(/JOB #(\S+):/),service=meta.match(/^\s*Service:\s*(\S+)/m);
 const interval=meta.match(/\bPERIODIC:\s*interval=(\S+)\s+flex=(\S+)/);
 const timing=block.match(/\bTIME=([^\s]+):([^\s]+)\s+STORENOTLOW\s+PERIODIC\s+PERSISTED/);
 const constraints=meta.match(/^\s*Unsatisfied constraints:\s*(.*)$/m);
 const last=meta.match(/^\s*Last successful run:\s*(.+)$/m);
 return {package:QA,jobRegistered:true,jobId:id?.[1]||null,service:service?.[1]||null,
  periodicInterval:interval?.[1]||null,periodicFlex:interval?.[2]||null,
  persisted:/^\s*PERSISTED\s*$/m.test(meta),
  nextTimingWindow:timing?{earliest:timing[1],latest:timing[2]}:null,
  unsatisfiedConstraints:constraints?.[1]||null,
  jobSchedulerLastSuccessfulRun:last?.[1]||null,
  backgroundExecution:'NOT_VERIFIED',
  reason:'A scheduler record is not proof of completed verified ZIP written before app opening'};
}
if(process.argv[1]&&import.meta.url.endsWith('/'+process.argv[1].replace(/\\/g,'/').split('/').pop())){
 try{
  const args=process.argv.slice(2);
  if(args.length!==1||args[0].startsWith('-'))throw Error('Usage: node scripts/oneplus-g4-dumpsys.mjs path-to-full-dumpsys.txt');
  console.log(JSON.stringify(inspectG4(decodeDump(readFileSync(args[0]))),null,2));
 }catch(e){console.error(e.message);process.exitCode=2;}
}
