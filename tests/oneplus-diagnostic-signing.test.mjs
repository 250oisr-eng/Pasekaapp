import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseInstalledPath,parsePackageVersion,parseCertificate,compareDiagnosticSigning}
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
