#!/usr/bin/env node
// Physical device preflight, read-only unless --install-qa explicitly supplied.
import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const QA='ru.paseka.journal.qa.daily',PROD='ru.paseka.journal';
const SHA='b1a80a510a85197903d936076b93a3f133c9428e7f112082bf602e8528357bfa';
const SOURCE='70216c734e91831fe09cc7d98e777814d1a5116d';
export function onlyDevice(output){
 const lines=String(output).split(/\r?\n/).slice(1).map(s=>s.trim()).filter(Boolean);
 if(lines.length!==1||!/^(\S+)\s+device(?:\s|$)/.test(lines[0]))throw Error('BLOCKED: exactly one authorized ADB device required');
 return lines[0].split(/\s+/)[0];
}
export function hasPackage(s,pkg){return String(s).split(/\r?\n/).some(x=>x.trim()==='package:'+pkg)}
export function apkIdentity(s){
 const m=String(s).match(/^package:\s+name='([^']+)'\s+versionCode='\d+'/m);
 if(!m)throw Error('BLOCKED: aapt badging failed');return m[1];
}
export function signerFingerprint(s){
 const fingerprints=[...String(s).matchAll(/certificate SHA-256 digest:\s*([0-9a-f:]+)/gi)].map(m=>m[1].replace(/:/g,'').toLowerCase());
 const values=[...new Set(fingerprints)];
 if(values.length!==1||!/^[a-f0-9]{64}$/.test(values[0]))throw Error('BLOCKED: signer unknown');return values[0];
}
function cmd(program,args){return execFileSync(program,args,{encoding:'utf8',timeout:30000,maxBuffer:12*1024*1024,stdio:['ignore','pipe','pipe']}).trim()}
function sdkTool(name){
 const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT||(process.env.LOCALAPPDATA?join(process.env.LOCALAPPDATA,'Android','Sdk'):null);
 if(!sdk)throw Error('BLOCKED: Android SDK location unknown');
 const dir=join(sdk,'build-tools');
 if(!existsSync(dir))throw Error('BLOCKED: missing Android build-tools');
 for(const version of readdirSync(dir).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}))){
  const p=join(dir,version,process.platform==='win32'&&name==='apksigner'?'lib/apksigner.jar':name+(process.platform==='win32'?'.exe':''));
  if(existsSync(p))return p;
 }
 throw Error('BLOCKED: missing '+name);
}
function parseArgs(argv){
 const out={apk:null,provenance:null,report:null,install:false};
 for(let i=0;i<argv.length;i++){
  const arg=argv[i];
  if(['--apk','--provenance','--report'].includes(arg)){if(!argv[i+1])throw Error('Missing '+arg);out[arg.slice(2)]=resolve(argv[++i]);}
  else if(arg==='--install-qa')out.install=true;
  else throw Error('Unknown option: '+arg);
 }
 if(out.install&&(!out.apk||!out.provenance))throw Error('BLOCKED: APK + provenance mandatory for install');
 return out;
}
export function preflight(argv=process.argv.slice(2)){
 const args=parseArgs(argv),adb=process.env.ADB_PATH||'adb';
 const serial=onlyDevice(cmd(adb,['devices','-l']));
 const call=(...parts)=>cmd(adb,['-s',serial,...parts]);
 const api=Number(call('shell','getprop','ro.build.version.sdk'));
 if(!Number.isInteger(api)||api<35)throw Error('BLOCKED: device Android API must be >=35');
 const installed=call('shell','pm','list','packages');
 const qaWasInstalled=hasPackage(installed,QA);
 const result={protocol:'ONEPLUS_G0_READONLY',at:new Date().toISOString(),model:call('shell','getprop','ro.product.model').slice(0,100),
  androidApi:api,productionPresent:hasPackage(installed,PROD),qaInstalledBefore:qaWasInstalled,
  apkVerified:false,qaInstalledByScript:false,jobPresent:'NOT_VERIFIED',backgroundExecution:'NOT_VERIFIED',
  archiveRotation:'NOT_VERIFIED',restore:'NOT_VERIFIED',physicalResult:'INCOMPLETE'};
 if(args.apk||args.provenance){
  if(!args.apk||!args.provenance)throw Error('BLOCKED: both APK and provenance required');
  const data=JSON.parse(readFileSync(args.provenance,'utf8'));
  const hash=createHash('sha256').update(readFileSync(args.apk)).digest('hex');
  if(hash!==SHA||data.apkSha256!==SHA||data.sourceCommitSha!==SOURCE||
     data.packageName!==QA||data.artifactKind!=='ISOLATED_DISPOSABLE_QA_ONLY_NOT_RELEASE'||
     data.productionPackageTouched!==false||data.publishingAuthorized!==false)
   throw Error('BLOCKED: binary not the approved disposable QA');
  if(apkIdentity(cmd(sdkTool('aapt'),['dump','badging',args.apk]))!==QA)throw Error('BLOCKED: wrong APK identity');
  const apksigner=sdkTool('apksigner');
  const signingOutput=process.platform==='win32'?cmd('java',['-jar',apksigner,'verify','--print-certs',args.apk]):cmd(apksigner,['verify','--print-certs',args.apk]);
  if(signerFingerprint(signingOutput)!==data.signerCertificateSha256)throw Error('BLOCKED: signer mismatch');
  result.apkVerified=true;result.apkSha256=hash;result.sourceCommitSha=SOURCE;
 }
 if(args.install){
  if(qaWasInstalled||!result.apkVerified)throw Error('BLOCKED: cannot upgrade an existing QA or an unverified APK');
  if(!/^Success$/m.test(call('install',args.apk)))throw Error('BLOCKED: QA installation not confirmed');
  if(!hasPackage(call('shell','pm','list','packages'),QA))throw Error('BLOCKED: QA package missing after install');
  result.qaInstalledByScript=true;
 }
 if(qaWasInstalled||result.qaInstalledByScript){
  const job=call('shell','dumpsys','jobscheduler');
  result.jobPresent=job.includes(QA)?'PACKAGE_PRESENT_NOT_EXECUTION_PROOF':'NOT_VERIFIED';
 }
 if(args.report)writeFileSync(args.report,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(result,null,2));return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{preflight()}catch(error){console.error(error.message);process.exitCode=2}
}