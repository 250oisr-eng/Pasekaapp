// B09 isolated diagnostic signer preflight. Read-only: no install, force-stop, clear or uninstall.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,readdirSync,rmSync,existsSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {dirname,join,resolve,win32} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseDeviceList,validateUsbTransportState,validateManifest,PACKAGE} from './signer-readonly-guards.mjs';
const HERE=dirname(fileURLToPath(import.meta.url));
const REPORT='ONEPLUS-DIAGNOSTIC-SIGNER-RESULT.json';
const fail=code=>Object.assign(new Error(code),{code});
export const SIGNER_STAGES=Object.freeze([
 'READ_MANIFEST','HASH_CANDIDATE','SDK_DISCOVERY','USB_DISCOVERY','USB_TRANSPORT',
 'INSTALLED_PACKAGE_PATH','PULL_INSTALLED_APK','STAGE_CANDIDATE_LOCAL','INSTALLED_BADGING','INSTALLED_SIGNER',
 'CANDIDATE_BADGING','CANDIDATE_SIGNER','JAVA_RUNTIME_DISCOVERY','COMPARE_SIGNERS'
]);
export function safeSignerFailure(error,stage){
 const failedStage=SIGNER_STAGES.includes(stage)?stage:'UNRECOGNIZED_STAGE';
 const rawCode=typeof error?.code==='string'?error.code:'';
 const allowed=new Set(['LOCAL_ANDROID_SDK_TOOLS_NOT_FOUND','INSTALLED_BASE_APK_PATH_UNVERIFIED',
 'APK_PACKAGE_VERSION_UNVERIFIED','INSTALLED_AAPT_COMMAND_FAILED','CANDIDATE_AAPT_COMMAND_FAILED','APK_SIGNER_COUNT_UNVERIFIED','APK_SIGNER_FINGERPRINT_INVALID',
 'DIAGNOSTIC_PACKAGE_MISMATCH','SIGNER_UNKNOWN','JAVA_RUNTIME_NOT_FOUND','CANDIDATE_APK_SIZE_INVALID',
 'CANDIDATE_SHA256_MISMATCH','CANDIDATE_TEMP_COPY_MISMATCH','UNTRUSTED_DIAGNOSTIC_MANIFEST',
 'ADB_USB_DEVICE_NOT_VISIBLE','ADB_MULTIPLE_DEVICES_CONNECTED','ADB_USB_DEBUGGING_NOT_AUTHORIZED',
 'ADB_USB_DEVICE_OFFLINE','ADB_DEVICE_NOT_READY','ADB_WIRELESS_OR_EMULATOR_NOT_ALLOWED',
 'ADB_PHYSICAL_USB_TRANSPORT_NOT_READY']);
 return {status:'BLOCKED',code:rawCode==='ENOENT'?'LOCAL_EXECUTABLE_OR_FILE_NOT_FOUND':
  allowed.has(rawCode)?rawCode:'SIGNER_PREFLIGHT_UNKNOWN_ERROR',
  failedStage,installationAuthorized:false,productionPackageTouched:false,
  noInstallNoOverwriteNoDelete:true};
}
export function parseInstalledPath(output){
 const lines=String(output).trim().split(/\r?\n/).filter(Boolean);
 if(lines.length!==1||!/^package:\/[^\s]+\/base\.apk$/.test(lines[0]))throw fail('INSTALLED_BASE_APK_PATH_UNVERIFIED');
 return lines[0].slice('package:'.length);
}
export function parsePackageVersion(output,expected=PACKAGE){
 const m=String(output).match(/^package: name='([^']+)' versionCode='(\d+)'/m);
 if(!m||m[1]!==expected||!Number.isSafeInteger(Number(m[2]))||Number(m[2])<1)throw fail('APK_PACKAGE_VERSION_UNVERIFIED');
 return Number(m[2]);
}
export function parseCertificate(output){
 const matches=[...String(output).matchAll(/^Signer #\d+ certificate SHA-256 digest:\s*([0-9a-fA-F:]+)\s*$/gm)];
 if(matches.length!==1)throw fail('APK_SIGNER_COUNT_UNVERIFIED');
 const fingerprint=matches[0][1].replace(/:/g,'').toLowerCase();
 if(!/^[a-f0-9]{64}$/.test(fingerprint))throw fail('APK_SIGNER_FINGERPRINT_INVALID');
 return fingerprint;
}
export function compareDiagnosticSigning(installed,candidate){
 if(installed.packageId!==PACKAGE||candidate.packageId!==PACKAGE)throw fail('DIAGNOSTIC_PACKAGE_MISMATCH');
 if(!/^[a-f0-9]{64}$/.test(installed.signer)||!/^[a-f0-9]{64}$/.test(candidate.signer))throw fail('SIGNER_UNKNOWN');
 if(installed.signer!==candidate.signer)return {status:'BLOCKED',code:'DIAGNOSTIC_SIGNER_MISMATCH',installationAuthorized:false};
 if(candidate.versionCode<installed.versionCode)return {status:'BLOCKED',code:'DIAGNOSTIC_VERSION_DOWNGRADE',installationAuthorized:false};
 return {status:'PASS',code:'SIGNING_METADATA_COMPATIBLE_ONLY',installationAuthorized:false};
}
export function resolveJava({env=process.env,exists=existsSync,platform=process.platform}={}){
 const exe=platform==='win32'?'java.exe':'java';
 const pathJoin=platform==='win32'?win32.join:join;
 const candidates=[
  env.JAVA_HOME&&pathJoin(env.JAVA_HOME,'bin',exe),
  env.STUDIO_JDK&&pathJoin(env.STUDIO_JDK,'bin',exe),
  env.PROGRAMFILES&&pathJoin(env.PROGRAMFILES,'Android','Android Studio','jbr','bin',exe),
  env['ProgramFiles(x86)']&&pathJoin(env['ProgramFiles(x86)'],'Android','Android Studio','jbr','bin',exe)
 ].filter(Boolean);
 for(const candidate of candidates)if(exists(candidate))return candidate;
 // Normal Java installations expose java on PATH; no subprocess here.
 const path=(env.PATH||env.Path||'').split(platform==='win32'?';':':').filter(Boolean);
 for(const directory of path){
  const candidate=pathJoin(directory,exe);
  if(exists(candidate))return candidate;
 }
 throw fail('JAVA_RUNTIME_NOT_FOUND');
}
function command(executable,args,timeout=20000){
 return execFileSync(executable,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:2*1024*1024,timeout,windowsHide:true}).trim();
}
function androidSdk(){
 const roots=[process.env.ANDROID_HOME,process.env.ANDROID_SDK_ROOT,
  process.env.LOCALAPPDATA&&join(process.env.LOCALAPPDATA,'Android','Sdk')].filter(Boolean);
 for(const root of roots){
  const adb=join(root,'platform-tools',process.platform==='win32'?'adb.exe':'adb');
  const base=join(root,'build-tools');
  if(!existsSync(adb)||!existsSync(base))continue;
  const versions=readdirSync(base,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>x.name).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
  for(const v of versions){
   const aapt=join(base,v,process.platform==='win32'?'aapt.exe':'aapt');
   const jar=join(base,v,'lib','apksigner.jar');
   if(existsSync(aapt)&&existsSync(jar))return {adb,aapt,jar};
  }
 }
 throw fail('LOCAL_ANDROID_SDK_TOOLS_NOT_FOUND');
}
export function inspectDiagnosticSigning({commandFn=command,sdk=androidSdk,javaLocator=resolveJava,
 setStage=()=>{},manifestPath=join(HERE,'diagnostic-manifest.json'),
 candidatePath=join(HERE,'app-debug.apk')}={}){
 const mark=stage=>{if(!SIGNER_STAGES.includes(stage))throw fail('UNRECOGNIZED_STAGE');setStage(stage);};
 mark('READ_MANIFEST');
 const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
 validateManifest(manifest);
 mark('HASH_CANDIDATE');
 const candidateBytes=readFileSync(candidatePath);
 if(candidateBytes.length===0||candidateBytes.length>150*1024*1024)throw fail('CANDIDATE_APK_SIZE_INVALID');
 if(createHash('sha256').update(candidateBytes).digest('hex')!==manifest.apkSha256)throw fail('CANDIDATE_SHA256_MISMATCH');
 mark('SDK_DISCOVERY');
 const {adb,aapt,jar}=sdk();
 mark('USB_DISCOVERY');
 parseDeviceList(commandFn(adb,['devices','-l']));
 mark('USB_TRANSPORT');
 validateUsbTransportState(commandFn(adb,['-d','get-state']));
 // Never query the owner's production package; only isolated diagnostic.
 mark('INSTALLED_PACKAGE_PATH');
 const remote=parseInstalledPath(commandFn(adb,['-d','shell','pm','path',PACKAGE]));
 const temporary=mkdtempSync(join(tmpdir(),'paseka-diagnostic-signer-'));
 try{
  const installedPath=join(temporary,'installed-diagnostic.apk');
  mark('PULL_INSTALLED_APK');
  commandFn(adb,['-d','pull',remote,installedPath],120000);
  // Older Windows aapt.exe may fail to open APKs from paths containing
  // non-ASCII characters. Use the SAME verified ASCII-named temp directory
  // as the successfully read installed APK. Never change the original file.
  mark('STAGE_CANDIDATE_LOCAL');
  const candidateLocal=join(temporary,'candidate.apk');
  copyFileSync(candidatePath,candidateLocal);
  if(createHash('sha256').update(readFileSync(candidateLocal)).digest('hex')!==manifest.apkSha256)
   throw fail('CANDIDATE_TEMP_COPY_MISMATCH');
  mark('JAVA_RUNTIME_DISCOVERY');
  const java=javaLocator();
  const readMeta=(path,kind)=>{
   mark(kind==='INSTALLED'?'INSTALLED_BADGING':'CANDIDATE_BADGING');
   let badging;
   try{badging=commandFn(aapt,['dump','badging',path]);}
   catch{throw fail(kind==='INSTALLED'?'INSTALLED_AAPT_COMMAND_FAILED':'CANDIDATE_AAPT_COMMAND_FAILED');}
   const versionCode=parsePackageVersion(badging);
   mark(kind==='INSTALLED'?'INSTALLED_SIGNER':'CANDIDATE_SIGNER');
   const signer=parseCertificate(commandFn(java,['-jar',jar,'verify','--print-certs',path]));
   return {packageId:PACKAGE,versionCode,signer};
  };
  const installed=readMeta(installedPath,'INSTALLED');
  const candidate=readMeta(candidateLocal,'CANDIDATE');
  mark('COMPARE_SIGNERS');
  return {...compareDiagnosticSigning(installed,candidate),
   installedDiagnosticPresent:true,productionPackageTouched:false,
   noInstallNoOverwriteNoDelete:true,syntheticDataPreserved:true,
   // Do not report fingerprints, serials, package paths or private data.
   candidateSourceSha:manifest.sourceSha};
 }finally{rmSync(temporary,{force:true,recursive:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let report,failedStage='READ_MANIFEST';
 try{report=inspectDiagnosticSigning({setStage:stage=>{failedStage=stage;}});}
 catch(e){report=safeSignerFailure(e,failedStage);}
 const {writeFileSync}=await import('node:fs');
 try{writeFileSync(join(HERE,REPORT),JSON.stringify({schema:'paseka-diagnostic-signer-preflight-v1',...report},null,2)+'\n',{flag:'wx'});}
 catch{console.error('REPORT_EXISTS_OR_CANNOT_WRITE');process.exitCode=1;process.exit();}
 console.log('DIAGNOSTIC_SIGNER_PREFLIGHT '+report.status+' '+report.code);
 if(report.status!=='PASS')process.exitCode=1;
}
