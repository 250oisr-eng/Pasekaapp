import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {selectOneDevice} from './backup-oneplus-cold-sandbox.mjs';
import {runAdbCommand} from './oneplus-process-probe.mjs';
import {encodedShellArgs,classifyEncodedProbe,PUBLIC_PROBE_VARIANTS,classifyPublicProbe} from './oneplus-encoded-shell.mjs';
export async function inspectEncodedShell({adb=process.env.PASEKA_ADB||'adb'}={}){
 const devices=await runAdbCommand(adb,['devices','-l']);
 if(devices.code!==0||devices.overflow)throw Error('ADB_NOT_READY');
 const serial=selectOneDevice(devices.output);
 // Uses only the public constant; no app-private files, tar, force-stop, or writes.
 const result=await runAdbCommand(adb,encodedShellArgs(serial,'probe'));
 const primary=classifyEncodedProbe(result);
 if(primary.status==='PASS')return {...primary,variants:[],allPrivateReadsAvoided:true};
 const variants=[];
 for(const test of PUBLIC_PROBE_VARIANTS){
  const res=await runAdbCommand(adb,['-s',serial,...test.args]);
  variants.push({id:test.id,...classifyPublicProbe(res,test.expected)});
 }
 return {...primary,variants,allPrivateReadsAvoided:true};

}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 inspectEncodedShell().then(result=>{
  console.log(JSON.stringify(result,null,2));
 },error=>{
  console.log(JSON.stringify({schema:'paseka-encoded-shell-probe-v1',status:'BLOCKED',
    reason:/^[A-Z][A-Z0-9_]*$/.test(error.message)?error.message:'ADB_PROBE_FAILED',
    privateDataRead:false,backupAttempted:false,phoneFilesChanged:false}));
  process.exitCode=1;
 });
}
