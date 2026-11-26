// Isolated OnePlus recovery-relaunch verifier: NEVER installs or replaces an APK.
// Scope: ONLY ru.paseka.journal.disasterproof2, existing synthetic test storage.
import {spawn,execFile} from 'node:child_process';
import {readFile,writeFile,access} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseDeviceList,validateUsbTransportState,validateDeviceProperties,
 parsePackagePresence,validateManifest,validateProofLine,PACKAGE}
 from './oneplus-recovery.mjs';
const HERE=dirname(fileURLToPath(import.meta.url));
const MAIN='ru.paseka.journal';
const TAG='PASEKA_P0_DISASTER_PROOF_RESULT ';
const SECOND='P0_DISASTER_PHYSICAL_RESTART_PASS';
const REPORT='ONEPLUS-RESTART-ONLY-RESULT.json';
const ALLOWED_REASONS=[
 ['App database not available','APP_DATABASE_BOOTSTRAP_UNAVAILABLE'],
 ['Target SHA after restore/reopen differs','TARGET_ARCHIVE_SHA_MISMATCH'],
 ['Target store counts differ','TARGET_STORES_MISMATCH'],
 ['Target video Blob missing','TARGET_BLOB_MISSING'],
 ['Target Blob bytes mismatch','TARGET_BLOB_BYTES_MISMATCH'],
 ['Synthetic source mutated','SYNTHETIC_SOURCE_CHANGED'],
 ['Target IndexedDB blocked','TARGET_INDEXEDDB_BLOCKED'],
 ['Only secure Capacitor origin','CAPACITOR_ORIGIN_NOT_SECURE'],
 ['Invalid pre-restart receipt','INVALID_RESTART_CHECKPOINT']
];
const err=code=>Object.assign(new Error(code),{code});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function command(adb,args,ms=15000,code='ADB_COMMAND_FAILED'){
 return new Promise((ok,no)=>execFile(adb,args,{timeout:ms,maxBuffer:64*1024,windowsHide:true},(e,out)=>{
  if(e)return no(err(code));ok(String(out).trim());
 }));
}
async function findAdb(){
 for(const root of [process.env.ANDROID_HOME,process.env.ANDROID_SDK_ROOT,
   process.env.LOCALAPPDATA&&resolve(process.env.LOCALAPPDATA,'Android','Sdk')].filter(Boolean)){
  const p=resolve(root,'platform-tools',process.platform==='win32'?'adb.exe':'adb');
  try{await access(p);return p;}catch{}
 }
 throw err('ANDROID_PLATFORM_TOOLS_NOT_FOUND');
}
export function summarizeDiagnosticLine(line){
 const i=String(line).indexOf(TAG);
 if(i<0)return null;
 let p;
 try{p=JSON.parse(String(line).slice(i+TAG.length).trim());}
 catch{return {kind:'DIAGNOSTIC_TAG_UNPARSEABLE'};}
 if(p?.packageId!==PACKAGE||p?.isolated!==true||
  p?.productionApp!=='NOT_ACCESSED'||p?.productionDatabase!=='NOT_ACCESSED'||
  p?.originalVideos!=='NOT_ACCESSED')return null;
 if(validateProofLine(line,SECOND))return {kind:'RESTART_PASS'};
 if(p.status==='BLOCKED'&&p.code==='P0_DISASTER_PROOF_FAILED'){
  const detail=typeof p.detail==='string'?p.detail:'';
  const known=ALLOWED_REASONS.find(([snippet])=>detail.includes(snippet));
  return {kind:'DEVICE_RESTART_BLOCKED',reason:known?known[1]:'UNCLASSIFIED_DEVICE_ERROR',
   failedCheckNames:Array.isArray(p.checks)?
    p.checks.filter(c=>c&&c.status==='BLOCKED').map(c=>String(c.name).replace(/[^A-Za-z0-9_]/g,'').slice(0,32)).slice(0,5):[]};
 }
 return null;
}
async function watchFreshProof(adb){
 const child=spawn(adb,['-d','logcat','-T','1','-v','brief'],
  {windowsHide:true,stdio:['ignore','pipe','pipe']});
 let take=false,buf='',done=false,tagUnparseable=false;
 let resolveProof,rejectProof;
 const observed=new Promise((yes,no)=>{resolveProof=yes;rejectProof=no;});
 // Prevent an unhandled rejection if logcat exits before an adb command finishes.
 observed.catch(()=>{});
 const timer=setTimeout(()=>finish(err('RESTART_PROOF_TIMEOUT')),90000);
 function finish(e,result){
  if(done)return;
  done=true;clearTimeout(timer);child.kill();
  if(e){e.tagUnparseable=tagUnparseable;rejectProof(e);}else resolveProof(result);
 }
 child.on('error',()=>finish(err('ADB_LOGCAT_START_FAILED')));
 child.on('exit',()=>finish(err('ADB_LOGCAT_EARLY_EXIT')));
 child.stdout.on('data',chunk=>{
  buf+=String(chunk);
  if(buf.length>256*1024){finish(err('ADB_LOGCAT_LINE_EXCESS'));return;}
  let at;while((at=buf.indexOf('\n'))>=0){
   const line=buf.slice(0,at);buf=buf.slice(at+1);
   if(!take)continue;
   const candidate=summarizeDiagnosticLine(line);
   if(candidate?.kind==='DIAGNOSTIC_TAG_UNPARSEABLE'){tagUnparseable=true;continue;}
   if(candidate?.kind==='RESTART_PASS'||candidate?.kind==='DEVICE_RESTART_BLOCKED'){
    finish(null,candidate);return;
   }
  }
 });
 child.stderr.on('data',()=>{}); // No untrusted system logs are written to reports.
 try{
  await pause(700);take=true;
  // This only stops the separate TEST package, never the user app or device.
  await command(adb,['-d','shell','am','force-stop',PACKAGE],15000,'DIAGNOSTIC_FORCE_STOP_FAILED');
  await pause(500);
  await command(adb,['-d','shell','am','start','-n',PACKAGE+'/.MainActivity'],
   30000,'DIAGNOSTIC_RELAUNCH_FAILED');
  return await observed;
 }catch(e){
  const unparseable=tagUnparseable;
  child.kill();observed.catch(()=>{});
  e.tagUnparseable=unparseable;
  throw e;
 }
}
async function run(setStage){
 setStage('LOCAL_KIT_INTEGRITY');
 const manifest=JSON.parse(await readFile(resolve(HERE,'diagnostic-manifest.json'),'utf8'));
 validateManifest(manifest);
 setStage('ADB_USB_CHECK');
 const adb=await findAdb();
 parseDeviceList(await command(adb,['devices','-l'],15000,'ADB_DEVICE_LIST_FAILED'));
 validateUsbTransportState(await command(adb,['-d','get-state'],15000,'ADB_USB_TRANSPORT_REQUIRED'));
 setStage('PHONE_IDENTITY');
 const prop=key=>command(adb,['-d','shell','getprop',key],15000,'ADB_PHONE_PROPS_FAILED');
 validateDeviceProperties({manufacturer:await prop('ro.product.manufacturer'),
  model:await prop('ro.product.model'),qemu:await prop('ro.kernel.qemu'),
  api:await prop('ro.build.version.sdk')});
 setStage('EXISTING_DIAGNOSTIC_PACKAGE');
 const p=await command(adb,['-d','shell','pm','list','packages','-u',PACKAGE],
  15000,'ADB_PACKAGE_LIST_FAILED');
 if(!parsePackagePresence(p,PACKAGE))throw err('DIAGNOSTIC_NOT_INSTALLED_NO_INSTALL_ATTEMPTED');
 setStage('TEST_PACKAGE_RESTART_ONLY');
 const proof=await watchFreshProof(adb);
 if(proof.kind==='RESTART_PASS'){
  return {status:'PASS',code:'ISOLATED_RESTART_RESTORED',
   physicalOnePlusDiagnostic:true,
   syntheticBlobReadbackAfterForceStop:true,
   firstStageEvidence:'PRIOR_OWNER_REPORT_ONLY',latestDiagnosticApkShaVerified:false,
   realUserDataRecovery:'NOT_TESTED',videoCleanup:'NOT_ATTEMPTED'};
 }
 return {status:'BLOCKED',code:'DEVICE_RESTART_PROOF_FAILED',
  deviceFailureReason:proof.reason,failedCheckNames:proof.failedCheckNames,
  physicalOnePlusDiagnostic:true,syntheticBlobReadbackAfterForceStop:false,
  realUserDataRecovery:'NOT_TESTED',videoCleanup:'NOT_ATTEMPTED'};
}
async function main(){
 let result,stage='NOT_STARTED';
 try{result=await run(s=>stage=s);}
 catch(e){result={status:'BLOCKED',code:e.code||'UNEXPECTED_RESTART_DIAGNOSTIC',
  failedStage:stage,tagUnparseable:!!e.tagUnparseable,
  syntheticBlobReadbackAfterForceStop:false,
  realUserDataRecovery:'NOT_TESTED',videoCleanup:'NOT_ATTEMPTED'};}
 const report={schema:'paseka-oneplus-restart-only-report-v1',...result,
  testPackage:PACKAGE,productionPackageTouched:false,
  noInstallNoOverwriteNoDelete:true,createdAt:new Date().toISOString()};
 try{await writeFile(resolve(HERE,REPORT),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
 catch{console.error('REPORT_ALREADY_PRESENT_OR_WRITE_ERROR');process.exitCode=1;return;}
 console.log('PASEKA_ONEPLUS_RESTART_ONLY '+report.status+' '+report.code);
 if(report.status!=='PASS')process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
