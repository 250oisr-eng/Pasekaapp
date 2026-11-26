import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseInstalledPath,parsePackageVersion,parseCertificate,compareDiagnosticSigning,safeSignerFailure,SIGNER_STAGES,resolveJava,inspectDiagnosticSigning}
 from '../tools/oneplus-recovery/inspect-diagnostic-signing.mjs';
const id='ru.paseka.journal.disasterproof2';
const a='a'.repeat(64),b='b'.repeat(64);
test('only a single isolated base.apk path is allowed',()=>{
 assert.equal(parseInstalledPath('package:/data/app/abc/base.apk'),'/data/app/abc/base.apk');
 for(const x of ['', 'package:/data/app/base.apk\npackage:/data/app/split.apk',
 'package:relative/base.apk','package:/data/app/oops.apk','package:/data/app/base.apk\nError']){
  assert.throws(()=>parseInstalledPath(x),/INSTALLED_BASE_APK_PATH_UNVERIFIED/);
 }
});
test('candidate and installed must identify exact diagnostic package and version',()=>{
 assert.equal(parsePackageVersion("package: name='"+id+"' versionCode='2' versionName='1'"),2);
 for(const x of ["package: name='ru.paseka.journal' versionCode='2'",
 "package: name='"+id+"' versionCode='0'","package: name='"+id+"' versionCode='bad'"]){
  assert.throws(()=>parsePackageVersion(x),/APK_PACKAGE_VERSION_UNVERIFIED/);
 }
});
test('unambiguous SHA256 signer fingerprint is required',()=>{
 assert.equal(parseCertificate('Signer #1 certificate SHA-256 digest: '+a),a);
 for(const x of ['', 'Signer #1 certificate SHA-256 digest: z',
 'Signer #1 certificate SHA-256 digest: '+a+'\nSigner #2 certificate SHA-256 digest: '+b]){
  assert.throws(()=>parseCertificate(x),/APK_SIGNER/);
 }
});
test('certificate mismatch fails closed without exposing certificate, no downgrade allowed',()=>{
 const installed={packageId:id,versionCode:2,signer:a};
 const compatible=compareDiagnosticSigning(installed,{packageId:id,versionCode:2,signer:a});
 assert.deepEqual(compatible,{status:'PASS',code:'SIGNING_METADATA_COMPATIBLE_ONLY',installationAuthorized:false});
 const different=compareDiagnosticSigning(installed,{packageId:id,versionCode:3,signer:b});
 assert.equal(different.code,'DIAGNOSTIC_SIGNER_MISMATCH');
 assert.doesNotMatch(JSON.stringify(different),new RegExp(a+'|'+b));
 assert.equal(compareDiagnosticSigning(installed,{packageId:id,versionCode:1,signer:a}).code,'DIAGNOSTIC_VERSION_DOWNGRADE');
 for(const p of [{packageId:'ru.paseka.journal',versionCode:3,signer:a},
 {packageId:id,versionCode:3,signer:'unknown'}]){
  assert.throws(()=>compareDiagnosticSigning(installed,p),/DIAGNOSTIC_PACKAGE_MISMATCH|SIGNER_UNKNOWN/);
 }
});
test('script has no commands to mutate phone and only pulls isolated package APK',async()=>{
 const s=await readFile(new URL('../tools/oneplus-recovery/inspect-diagnostic-signing.mjs',import.meta.url),'utf8');
 assert.match(s,/\['-d','shell','pm','path',PACKAGE\]/);
 assert.match(s,/\['-d','pull',remote,installedPath\]/);
 assert.doesNotMatch(s,/commandFn\(adb,\['-d','(?:install|uninstall|push|reboot)'/);
 assert.doesNotMatch(s,/commandFn\(adb,\['-d','shell','pm','clear'/);
 const cmd=await readFile(new URL('../tools/oneplus-recovery/ПРОВЕРИТЬ-ПОДПИСЬ-БЕЗ-УСТАНОВКИ.cmd',import.meta.url),'utf8');
 assert.match(cmd,/inspect-diagnostic-signing\.mjs/);
 assert.match(cmd,/ONEPLUS-DIAGNOSTIC-SIGNER-RESULT\.json/);
 const workflow=await readFile(new URL('../.github/workflows/android-disaster-physical.yml',import.meta.url),'utf8');
 assert.match(workflow,/Copy-Item 'tools\/oneplus-recovery\/inspect-diagnostic-signing\.mjs'/);
});

test('owner ENOENT report is staged and sanitized even when executable is missing',()=>{
 const stage=SIGNER_STAGES.includes('INSTALLED_SIGNER')?'INSTALLED_SIGNER':'unexpected';
 const error=Object.assign(new Error('C:\\Secret\\Private\\java.exe'),{code:'ENOENT',path:'C:\\Secret\\Private\\java.exe'});
 const result=safeSignerFailure(error,stage);
 assert.deepEqual(result,{status:'BLOCKED',code:'LOCAL_EXECUTABLE_OR_FILE_NOT_FOUND',
  failedStage:'INSTALLED_SIGNER',installationAuthorized:false,
  productionPackageTouched:false,noInstallNoOverwriteNoDelete:true});
 assert.doesNotMatch(JSON.stringify(result),/Secret|Private|java.exe/);
 assert.equal(safeSignerFailure(error,'secret/path').failedStage,'UNRECOGNIZED_STAGE');
});
test('unknown raw ADB/process errors never leak command or device serial',()=>{
 const result=safeSignerFailure({code:'secret-sn-123',message:'owner data'},'USB_DISCOVERY');
 assert.equal(result.code,'SIGNER_PREFLIGHT_UNKNOWN_ERROR');
 assert.equal(result.failedStage,'USB_DISCOVERY');
 assert.doesNotMatch(JSON.stringify(result),/secret|owner data/);
});

test('use existing Android Studio bundled Java without changing PATH or installing runtime',()=>{
 const studio='C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\java.exe';
 const result=resolveJava({env:{PROGRAMFILES:'C:\\Program Files',PATH:''},platform:'win32',exists:path=>path===studio});
 assert.equal(result,studio);
 const home='X:\\jdk\\bin\\java.exe';
 assert.equal(resolveJava({env:{JAVA_HOME:'X:\\jdk',PATH:''},platform:'win32',exists:path=>path===home}),home);
 assert.throws(()=>resolveJava({env:{PATH:''},platform:'win32',exists:()=>false}),/JAVA_RUNTIME_NOT_FOUND/);
});

test('physical candidate under non-ASCII Windows extraction folder is inspected from verified ASCII temp path',()=>{
 const dir=mkdtempSync(join(tmpdir(),'paseka-b09-test-'));
 try{
  const candidate=join(dir,'папка с пробелом','app-debug.apk');

  mkdirSync(join(dir,'папка с пробелом'),{recursive:true});
  const bytes=Buffer.from('synthetic diagnostic APK test fixture');
  writeFileSync(candidate,bytes);
  const manifestPath=join(dir,'diagnostic-manifest.json');
  writeFileSync(manifestPath,JSON.stringify({packageId:id,originalPackageId:'ru.paseka.journal',
   apkFile:'app-debug.apk',sourceSha:'c'.repeat(40),apkSha256:createHash('sha256').update(bytes).digest('hex')}));
  const stages=[],seenBadging=[];
  const commandFn=(binary,args)=>{
   if(binary==='adb'&&args[0]==='devices')return 'List of devices attached\nZX123 device usb:1';
   if(binary==='adb'&&args[1]==='get-state')return 'device';
   if(binary==='adb'&&args.includes('pm'))return 'package:/data/app/abc/base.apk';
   if(binary==='adb'&&args[1]==='pull'){writeFileSync(args[3],bytes);return '1 file pulled';}
   if(binary==='aapt'&&args[0]==='dump'){
    seenBadging.push(args[2]);assert.ok(!args[2].includes('папка'));
    return "package: name='"+id+"' versionCode='1' versionName='1'";
   }
   if(binary==='java'&&args.includes('--print-certs'))return 'Signer #1 certificate SHA-256 digest: '+a;
   throw Error('unexpected stub call '+args.join(' '));
  };
  const result=inspectDiagnosticSigning({manifestPath,candidatePath:candidate,
   sdk:()=>({adb:'adb',aapt:'aapt',jar:'apksigner.jar'}),
   javaLocator:()=> 'java',commandFn,setStage:stage=>stages.push(stage)});
  assert.equal(result.code,'SIGNING_METADATA_COMPATIBLE_ONLY');
  assert.equal(result.installationAuthorized,false);
  assert.equal(result.noInstallNoOverwriteNoDelete,true);
  assert.equal(seenBadging.length,2);
  assert.ok(seenBadging[0].endsWith('installed-diagnostic.apk'));
  assert.ok(seenBadging[1].endsWith('candidate.apk'));
  assert.deepEqual(readFileSync(candidate),bytes);
  assert.ok(stages.includes('STAGE_CANDIDATE_LOCAL'));
  let badgingCount=0;
  const failingCommand=(binary,args,...rest)=>{
   if(binary==='aapt'&&args[0]==='dump'&&++badgingCount===2)
    throw Object.assign(new Error('private path leaked'),{code:1});
   return commandFn(binary,args,...rest);
  };
  assert.throws(()=>inspectDiagnosticSigning({manifestPath,candidatePath:candidate,
   sdk:()=>({adb:'adb',aapt:'aapt',jar:'apksigner.jar'}),
   javaLocator:()=> 'java',commandFn:failingCommand}),/CANDIDATE_AAPT_COMMAND_FAILED/);
  const error=safeSignerFailure({code:'CANDIDATE_AAPT_COMMAND_FAILED',message:'private path'},'CANDIDATE_BADGING');
  assert.equal(error.code,'CANDIDATE_AAPT_COMMAND_FAILED');
  assert.doesNotMatch(JSON.stringify(error),/private path/);

 }finally{rmSync(dir,{recursive:true,force:true});}
});
