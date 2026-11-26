// OnePlus physical diagnostic: isolated package ONLY; never acts on ru.paseka.journal.
// Requires the separately built, SHA-bound APK from this CI job.
import {spawn,execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const HERE=dirname(fileURLToPath(import.meta.url));
export const PACKAGE='ru.paseka.journal.disasterproof2';
const MAIN_PACKAGE='ru.paseka.journal';
const TAG='PASEKA_P0_DISASTER_PROOF_RESULT';
const FIRST='P0_DISASTER_WEBVIEW_RESTORE_PASS';
const SECOND='P0_DISASTER_PHYSICAL_RESTART_PASS';
const REPORT='ONEPLUS-RECOVERY-RESULT.json';
const MAX_APK=150*1024*1024;
const now=()=>new Date().toISOString();
function error(code){const e=new Error(code);e.code=code;return e;}
export function parseDeviceList(output){
 const entries=output.split(/\r?\n/).slice(1).filter(line=>line.trim()&&!line.startsWith('*')).map(line=>{
  const parts=line.trim().split(/\s+/);
  return {serial:parts[0],status:parts[1]};
 });
 if(entries.length===0)throw error('ADB_USB_DEVICE_NOT_VISIBLE');
 if(entries.length!==1)throw error('ADB_MULTIPLE_DEVICES_CONNECTED');
 const {serial,status}=entries[0];
 if(status==='unauthorized')throw error('ADB_USB_DEBUGGING_NOT_AUTHORIZED');
 if(status==='offline')throw error('ADB_USB_DEVICE_OFFLINE');
 if(status!=='device')throw error('ADB_DEVICE_NOT_READY');
 // Windows ADB may omit the optional "usb:" field; select USB with adb -d.
 if(/^emulator-/i.test(serial)||/:\d+$/.test(serial)||/_adb-tls-connect\._tcp/i.test(serial))throw error('ADB_WIRELESS_OR_EMULATOR_NOT_ALLOWED');
 return serial;
}
// Unlike 'pm path', 'pm list packages -u FILTER' returns success for absent
// packages. Compare exact package names, never trust a substring-only match.
export function parsePackagePresence(output,expected){
 if(expected!==PACKAGE&&expected!==MAIN_PACKAGE)throw error('UNTRUSTED_PACKAGE_LOOKUP_TARGET');
 const lines=String(output).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 if(lines.some(line=>!/^package:[A-Za-z0-9_.]+$/.test(line)))throw error('ADB_PACKAGE_QUERY_UNTRUSTED');
 return lines.includes('package:'+expected);
}
export function validateUsbTransportState(state){
 if(String(state).trim()!=='device')throw error('ADB_PHYSICAL_USB_TRANSPORT_NOT_READY');
 return true;
}
export function validateDeviceProperties({manufacturer,model,qemu,api}){
 if(manufacturer.trim().toLowerCase()!=='oneplus'||!/^NE221[0-9A-Za-z]*$/.test(model.trim())||qemu.trim()==='1'||Number(api.trim())<35||!Number.isInteger(Number(api.trim())))throw error('NOT_EXPECTED_ONEPLUS_ANDROID_15_PLUS');
 return true;
}
export function validateProofLine(line,expected){
 const pos=line.indexOf(TAG+' ');
 if(pos===-1)return false;
 let obj;try{obj=JSON.parse(line.slice(pos+TAG.length+1).trim());}catch{return false;}
 return obj?.packageId===PACKAGE&&obj?.isolated===true&&obj?.productionApp==='NOT_ACCESSED'&&obj?.productionDatabase==='NOT_ACCESSED'&&obj?.originalVideos==='NOT_ACCESSED'&&obj?.status==='PASS'&&obj?.code===expected;
}
export function validateManifest(m){
 if(m?.packageId!==PACKAGE||m?.originalPackageId!==MAIN_PACKAGE||m?.apkFile!=='app-debug.apk'||!/^[a-f0-9]{64}$/.test(m?.apkSha256||'')||!/^[a-f0-9]{40}$/.test(m?.sourceSha||''))throw error('UNTRUSTED_DIAGNOSTIC_MANIFEST');
}
function command(file,args,timeout=15000,failureCode='ADB_COMMAND_FAILED'){
 return new Promise((resolveResult,reject)=>{
  execFile(file,args,{timeout,maxBuffer:128*1024,windowsHide:true},(err,stdout,stderr)=>{
   if(err)return reject(error(failureCode));
   resolveResult(String(stdout).trim());
  });
 });
}
async function getAdb(){
 // Explicit local SDK ADB; no downloading or network.
 const possibilities=[process.env.ANDROID_HOME,process.env.ANDROID_SDK_ROOT,process.env.LOCALAPPDATA&&resolve(process.env.LOCALAPPDATA,'Android','Sdk')].filter(Boolean);
 for(const root of possibilities){
  const file=resolve(root,'platform-tools',process.platform==='win32'?'adb.exe':'adb');
  try{const fs=await import('node:fs/promises');await fs.access(file);return file;}catch{}
 }
 throw error('ANDROID_PLATFORM_TOOLS_NOT_FOUND');
}
async function liveLogProof(adb,expected,launch){
 // Subscribe BEFORE launching. No historical/stale log entries can pass.
 const child=spawn(adb,['-d','logcat','-T','1','-v','brief'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 let data='',settled=false;
 const promise=new Promise((resolveResult,reject)=>{
  const deadline=setTimeout(()=>finish(error('PROOF_TIMEOUT')),120000);
  function finish(err){if(settled)return;settled=true;clearTimeout(deadline);child.kill();err?reject(err):resolveResult(true);}
  child.on('error',()=>finish(error('LOGCAT_UNAVAILABLE')));
  child.on('exit',()=>{if(!settled)finish(error('LOGCAT_EXITED'));});
  child.stdout.on('data',chunk=>{
   data+=String(chunk);
   if(data.length>256*1024){finish(error('LOGCAT_LINE_TOO_LONG'));return;}
   let idx;while((idx=data.indexOf('\n'))>=0){
    const line=data.slice(0,idx);data=data.slice(idx+1);
    if(validateProofLine(line,expected)){finish();return;}
   }
  });
  child.stderr.on('data',()=>{}); // diagnostics never printed
 });
 try{await new Promise(r=>setTimeout(r,400));await launch();return await promise;}
 catch(e){child.kill();promise.catch(()=>{});throw e;}
}
async function run(setStage=()=>{}){
 setStage('VERIFY_LOCAL_APK');
 const manifest=JSON.parse(await readFile(resolve(HERE,'diagnostic-manifest.json'),'utf8'));
 validateManifest(manifest);
 const apk=resolve(HERE,'app-debug.apk');
 const size=(await stat(apk)).size;
 if(size<=0||size>MAX_APK)throw error('APK_SIZE_INVALID');
 const digest=createHash('sha256').update(await readFile(apk)).digest('hex');
 if(digest!==manifest.apkSha256)throw error('APK_SHA256_MISMATCH');
 setStage('ADB_DISCOVERY');
 const adb=await getAdb();
 parseDeviceList(await command(adb,['devices','-l'],15000,'ADB_DEVICES_COMMAND_FAILED'));
 setStage('USB_TRANSPORT');
 // Fail closed unless ADB itself confirms a USB-only transport.
 let usbState;
 try{usbState=await command(adb,['-d','get-state']);}
 catch{throw error('ADB_PHYSICAL_USB_TRANSPORT_REQUIRED');}
 validateUsbTransportState(usbState);
 setStage('DEVICE_PROPERTIES');
 const prop=(key)=>command(adb,['-d','shell','getprop',key],15000,'ADB_GETPROP_COMMAND_FAILED');
 validateDeviceProperties({
  manufacturer:await prop('ro.product.manufacturer'),
  model:await prop('ro.product.model'),
  qemu:await prop('ro.kernel.qemu'),
  api:await prop('ro.build.version.sdk')
 });
 setStage('PACKAGE_INVENTORY');
 const hasPackage=async name=>{
  const output=await command(adb,['-d','shell','pm','list','packages','-u',name],15000,'ADB_PACKAGE_QUERY_FAILED');
  return parsePackagePresence(output,name);
 };
 // -u is conservative: do not overwrite a diagnostic package with retained data.
 const existing=await hasPackage(PACKAGE);
 if(existing)throw error('DIAGNOSTIC_PACKAGE_ALREADY_INSTALLED_NO_OVERWRITE');
 const sourcePackage=await hasPackage(MAIN_PACKAGE);
 // Reading presence only: never start, pull, stop, update or clear this package.
 setStage('DIAGNOSTIC_INSTALL');
 const result=await command(adb,['-d','install','--no-incremental',apk],120000,'ADB_DIAGNOSTIC_INSTALL_COMMAND_FAILED');
 if(!result.includes('Success'))throw error('DIAGNOSTIC_INSTALL_FAILED');
 const start=()=>command(adb,['-d','shell','am','start','-n',PACKAGE+'/.MainActivity'],30000,'ADB_DIAGNOSTIC_LAUNCH_FAILED');
 setStage('FIRST_RESTORE_PROOF');
 await liveLogProof(adb,FIRST,start);
 // Force-stop only the distinct test package; never restart the whole phone or reset its storage.
 setStage('FORCE_STOP_DIAGNOSTIC');
 await command(adb,['-d','shell','am','force-stop',PACKAGE],15000,'ADB_DIAGNOSTIC_FORCE_STOP_FAILED');
 setStage('RELAUNCH_RESTORE_PROOF');
 await liveLogProof(adb,SECOND,start);
 return {status:'PASS',code:'ONEPLUS_SYNTHETIC_WEBVIEW_RESTORE_AND_RESTART',deviceClass:'ONEPLUS_NE221X',androidApiAtLeast35:true,
  testPackage:PACKAGE,productionPackageTouched:false,productionPackageInstalled:!!sourcePackage,
  testData:'SYNTHETIC_ONLY',verifiedStages:[FIRST,SECOND],realUserDataRecovery:'NOT_TESTED',
  physicalPowerLoss:'NOT_TESTED',videoCleanup:'NOT_ATTEMPTED',sourceSha:manifest.sourceSha};
}
async function main(){
 let report,failedStage='NOT_STARTED';
 const markStage=stage=>{failedStage=stage;};
 try{report=await run(markStage);}
 catch(e){report={status:'BLOCKED',code:e?.code||'UNEXPECTED_DIAGNOSTIC_FAILURE',failedStage,
  diagnosticInstallMayHaveOccurred:['DIAGNOSTIC_INSTALL','FIRST_RESTORE_PROOF','FORCE_STOP_DIAGNOSTIC','RELAUNCH_RESTORE_PROOF'].includes(failedStage),
  testPackage:PACKAGE,productionPackageTouched:false,
  realUserDataRecovery:'NOT_TESTED',videoCleanup:'NOT_ATTEMPTED'};}
 const output={schema:'paseka-oneplus-recovery-report-v1',...report,createdAt:now()};
 try{await writeFile(resolve(HERE,REPORT),JSON.stringify(output,null,2)+'\n',{flag:'wx'});}
 catch{console.error('REPORT_NOT_WRITTEN_EXISTING_OR_UNAVAILABLE');process.exitCode=1;return;}
 console.log('PASEKA_ONEPLUS_RECOVERY '+output.status+' '+output.code);
 if(output.status!=='PASS')process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
