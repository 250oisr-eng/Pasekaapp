// User's PC only. This CLI never prints filenames, hashes, or WebView content.
import { promises as fs } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {executeIsolatedTransfer} from './transfer-to-emulator.mjs';

const dir=resolve(fileURLToPath(new URL('.',import.meta.url)));
const reportFile=join(dir,'B01-RESULT.json');
const argv=process.argv.slice(2);
function arg(name){const index=argv.indexOf('--'+name);return index<0?null:argv[index+1];}
async function main(){
 try{await fs.lstat(reportFile);console.log('BLOCKED_EXISTING_REPORT_PRESERVED');return;}
 catch(e){if(e.code!=='ENOENT')throw e;}
 let report;
 try {
  report=await executeIsolatedTransfer({
   persistentRoot:arg('root'),adb:arg('adb'),apk:arg('apk'),aapt:arg('aapt'),
   dryRun:argv.includes('--preflight-only')
  });
 }catch(e){
  const message=String(e?.message||'');
  const code=/^B01_BLOCKED_[A-Z0-9_]{1,100}$/.test(message)?message:'B01_BLOCKED_LOCAL_TRANSFER_FAILED_REDACTED';
  report={
   schema:'paseka-b01-isolated-emulator-transfer-v20',status:'BLOCKED',code,
   verified:false,physicalOnePlusAccess:'NOT_ATTEMPTED',
   appId:'ru.paseka.journal.diagnostic.restore',
   fullBackupVerified:false,independentRestore:'NOT_VERIFIED',
   galleryMediaStore:'NOT_TESTED',videoCleanup:'NOT_ATTEMPTED'
  };
 }
 await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log('B01 '+report.status+' '+report.code);
 console.log('Share ONLY B01-RESULT.json; DO NOT upload or delete original WebView files.');
 if(report.status==='BLOCKED')process.exitCode=2;
}
main().catch(()=>{console.error('B01_BLOCKED_REPORT_WRITE_FAILURE');process.exitCode=3;});
