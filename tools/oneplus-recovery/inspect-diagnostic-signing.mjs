// B09 isolated diagnostic signer preflight. Read-only: no install, force-stop, clear or uninstall.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,readdirSync,rmSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseDeviceList,validateUsbTransportState,validateManifest,PACKAGE} from './oneplus-recovery.mjs';
const HERE=dirname(fileURLToPath(import.meta.url));
const REPORT='ONEPLUS-DIAGNOSTIC-SIGNER-RESULT.json';
const fail=code=>Object.assign(new Error(code),{code});
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
export function inspectDiagnosticSigning({commandFn=command,sdk=androidSdk,manifestPath=join(HERE,'diagnostic-manifest.json'),candidatePath=join(HERE,'app-debug.apk')}={}){
 const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
 validateManifest(manifest);
 const candidateBytes=readFileSync(candidatePath);
 if(candidateBytes.length===0||candidateBytes.length>150*1024*1024)throw fail('CANDIDATE_APK_SIZE_INVALID');
 if(createHash('sha256').update(candidateBytes).digest('hex')!==manifest.apkSha256)throw fail('CANDIDATE_SHA256_MISMATCH');
 const {adb,aapt,jar}=sdk();
 parseDeviceList(commandFn(adb,['devices','-l']));
 validateUsbTransportState(commandFn(adb,['-d','get-state']));
 // Never query the owner's production package; only isolated diagnostic.
 const remote=parseInstalledPath(commandFn(adb,['-d','shell','pm','path',PACKAGE]));
 const temporary=mkdtempSync(join(tmpdir(),'paseka-diagnostic-signer-'));
 try{
  const installedPath=join(temporary,'installed-diagnostic.apk');
  commandFn(adb,['-d','pull',remote,installedPath],120000);
  const readMeta=path=>({
   packageId:PACKAGE,
   versionCode:parsePackageVersion(commandFn(aapt,['dump','badging',path])),
   signer:parseCertificate(commandFn('java',['-jar',jar,'verify','--print-certs',path]))
  });
  return {...compareDiagnosticSigning(readMeta(installedPath),readMeta(candidatePath)),
   installedDiagnosticPresent:true,productionPackageTouched:false,
   noInstallNoOverwriteNoDelete:true,syntheticDataPreserved:true,
   // Do not report fingerprints, serials, package paths or private data.
   candidateSourceSha:manifest.sourceSha};
 }finally{rmSync(temporary,{force:true,recursive:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let report;
 try{report=inspectDiagnosticSigning();}
 catch(e){report={status:'BLOCKED',code:e?.code||'SIGNER_PREFLIGHT_UNKNOWN_ERROR',
  installationAuthorized:false,productionPackageTouched:false,
  noInstallNoOverwriteNoDelete:true};}
 const {writeFileSync}=await import('node:fs');
 try{writeFileSync(join(HERE,REPORT),JSON.stringify({schema:'paseka-diagnostic-signer-preflight-v1',...report},null,2)+'\n',{flag:'wx'});}
 catch{console.error('REPORT_EXISTS_OR_CANNOT_WRITE');process.exitCode=1;process.exit();}
 console.log('DIAGNOSTIC_SIGNER_PREFLIGHT '+report.status+' '+report.code);
 if(report.status!=='PASS')process.exitCode=1;
}
