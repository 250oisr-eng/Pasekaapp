import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {selectOneDevice} from './backup-oneplus-cold-sandbox.mjs';
import {runAdbCommand} from './oneplus-process-probe.mjs';
import {encodedShellArgs,classifyEncodedProbe,isModernAdbClient,hasShellV2Feature} from './oneplus-encoded-shell.mjs';
export async function inspectEncodedShell({adb=process.env.PASEKA_ADB||'adb'}={}){
 const version=await runAdbCommand(adb,['version']);
 if(version.code!==0||version.overflow||!isModernAdbClient(version.output))
   throw Error('ADB_HOST_CLIENT_INCOMPATIBLE');
 const devices=await runAdbCommand(adb,['devices','-l']);
 if(devices.code!==0||devices.overflow)throw Error('ADB_NOT_READY');
 const serial=selectOneDevice(devices.output);
 const features=await runAdbCommand(adb,['-s',serial,'features']);
 if(features.code!==0||features.overflow||!hasShellV2Feature(features.output))
   throw Error('ADB_DEVICE_NO_SHELL_V2');
 // Uses only the public constant; no app-private files, tar, force-stop, or writes.
 const result=await runAdbCommand(adb,encodedShellArgs(serial,'probe'));
 const primary=classifyEncodedProbe(result);
 if(primary.status==='PASS')return {...primary,variants:[],allPrivateReadsAvoided:true};
 // A failed probe is a blocking result, not a reason to run more variants.
 return {...primary,variants:[],allPrivateReadsAvoided:true};

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
