import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { auditDebugMetadata, auditLocalDebugApk, compareDebugSignerWithReference } from '../scripts/audit-android-debug-artifact.mjs';

const fingerprint='b'.repeat(64),digest='a'.repeat(64),checkout='c'.repeat(40);
const input=()=>({badging:"package: name='ru.paseka.journal' versionCode='17' versionName='1.0'",
 certificates:'Signer #1 certificate SHA-256 digest: '+fingerprint,apkSha256:digest,
 checkoutSha:checkout,apkBytes:100});

test('B05 audit describes CI debug artifact but never authorizes OnePlus upgrade or key custody',()=>{
 const r=auditDebugMetadata(input());
 assert.equal(r.auditStatus,'PASS_DEBUG_ARTIFACT_METADATA_ONLY');
 assert.equal(r.packageName,'ru.paseka.journal');
 assert.equal(r.signerCertificateSha256,fingerprint);
 assert.equal(r.apkSha256,digest);
 assert.equal(r.checkoutCommitSha,checkout);
 assert.equal(r.signingKeyCustody,'NOT_PROVEN_EPHEMERAL_CI_DEBUG');
 assert.equal(r.productionUpgradeAuthorized,false);
 assert.equal(r.publishingAuthorized,false);
 assert.equal(r.installedOnePlusSignerMatch,'NOT_TESTED');
 assert.equal(r.productionRollback,'NOT_TESTED');
 assert.ok(Object.isFrozen(r));
});

test('B05 refuses other package, malformed metadata, duplicate distinct signers',()=>{
 assert.throws(()=>auditDebugMetadata({...input(),
   badging:"package: name='ru.paseka.journal.disasterproof2' versionCode='17'"}),/wrong expected Android package/);
 assert.throws(()=>auditDebugMetadata({...input(),badging:"package: name='ru.paseka.journal' versionCode='0'"}),/BLOCKED/);
 assert.throws(()=>auditDebugMetadata({...input(),badging:'garbled'}),/BLOCKED/);
 assert.throws(()=>auditDebugMetadata({...input(),certificates:'no signer'}),/BLOCKED/);
 assert.throws(()=>auditDebugMetadata({...input(),certificates:
   'Signer #1 certificate SHA-256 digest: '+fingerprint+'\nSigner #2 certificate SHA-256 digest: '+'d'.repeat(64)}),/exactly one signer/);
 assert.equal(auditDebugMetadata({...input(),certificates:
   'V2.0 Signer: certificate SHA-256 digest: '+fingerprint+'\nV3.0 Signer: certificate SHA-256 digest: '+fingerprint}).signerCertificateSha256,fingerprint);
});

test('B05 refuses malformed APK SHA, commit SHA and unbounded artifact',()=>{
 assert.throws(()=>auditDebugMetadata({...input(),apkSha256:'short'}),/APK content SHA/);
 assert.throws(()=>auditDebugMetadata({...input(),checkoutSha:'c'.repeat(39)}),/commit SHA/);
 assert.throws(()=>auditDebugMetadata({...input(),apkBytes:0}),/APK size/);
 assert.throws(()=>auditDebugMetadata({...input(),apkBytes:128*1024*1024+1}),/APK size/);
 assert.throws(()=>auditDebugMetadata({...input(),apkBytes:0.5}),/APK size/);
});

test('B05 local provenance calls SDK read-only tools, hashes exact built APK',()=>{
 const root=mkdtempSync(join(tmpdir(),'paseka-b05-debug-'));
 try{
  const apk=join(root,'app-debug.apk');writeFileSync(apk,'synthetic apk bytes');
  const calls=[];
  const run=(exe,args)=>{calls.push([exe,args]);
   if(exe==='aapt')return input().badging;
   if(exe==='apksigner')return input().certificates;
   if(exe==='git')return checkout;
   throw Error('unexpected binary');
  };
  const out=auditLocalDebugApk({apkPath:apk,aapt:'aapt',apksigner:'apksigner',run});
  assert.equal(out.apkBytes,19);
  assert.equal(out.signingKeyCustody,'NOT_PROVEN_EPHEMERAL_CI_DEBUG');
  assert.equal(calls.length,3);
  assert.deepEqual(calls.map(x=>x[1].slice(0,2)),[
   ['dump','badging'],['verify','--print-certs'],['rev-parse','HEAD']]);
  assert.ok(calls.every(x=>!x[1].some(a=>/^(install|uninstall|sign|genkey|clear|push)$/.test(a))));
  assert.match(out.apkSha256,/^[0-9a-f]{64}$/);
 }finally{rmSync(root,{force:true,recursive:true});}
});

test('B05 local audit refuses missing, symlink and incorrectly named APK before invoking tools',()=>{
 const root=mkdtempSync(join(tmpdir(),'paseka-b05-invalid-'));
 try{
  const apk=join(root,'app-debug.apk'),other=join(root,'release.apk');
  writeFileSync(other,'fake');
  let calls=0;
  const run=()=>{calls++;throw Error('must not run');};
  assert.throws(()=>auditLocalDebugApk({apkPath:apk,aapt:'aapt',apksigner:'apksigner',run}),/ENOENT/);
  symlinkSync(other,apk);
  assert.throws(()=>auditLocalDebugApk({apkPath:apk,aapt:'aapt',apksigner:'apksigner',run}),/non-symlink/);
  assert.throws(()=>auditLocalDebugApk({apkPath:other,aapt:'aapt',apksigner:'apksigner',run}),/basename/);
  assert.equal(calls,0);
 }finally{rmSync(root,{force:true,recursive:true});}
});

test('B05 workflow audits before uploading debug APK with explicit warning; no release',()=>{
 const wf=readFileSync(resolve(import.meta.dirname,'../.github/workflows/android-debug.yml'),'utf8');
 assert.match(wf,/node scripts\/audit-android-debug-artifact\.mjs/);
 assert.ok(wf.indexOf('audit-android-debug-artifact.mjs',wf.indexOf('Build debug APK'))<wf.indexOf('Upload APK'));
 assert.match(wf,/DEBUG-ONLY-provenance\.json/);
 assert.match(wf,/NOT_FOR_ONEPLUS\.txt/);
 assert.match(wf,/permissions:\n  contents: read/);
 assert.doesNotMatch(wf,/apksigner\s+sign|keytool\s+-genkey|gradlew assembleRelease|npm publish|gh release create/);
});

test('B05 matching explicit public signer reference is metadata-only, never upgrade proof',()=>{
 const audited=auditDebugMetadata(input()),before=JSON.stringify(audited);
 const result=compareDebugSignerWithReference(audited,fingerprint);
 assert.equal(result.status,'CI_DEBUG_CERT_MATCHES_SUPPLIED_REFERENCE_METADATA_ONLY');
 assert.equal(result.matchesSuppliedReference,true);
 assert.equal(result.referenceIsCurrentInstalledCertificate,'NOT_VERIFIED');
 assert.equal(result.privateKeyCustodyVerified,false);
 assert.equal(result.productionUpgradeAuthorized,false);
 assert.equal(result.productionRollbackVerified,false);
 assert.equal(result.deviceInstalled,false);
 assert.ok(Object.isFrozen(result));
 assert.equal(JSON.stringify(audited),before);
});

test('B05 mismatched reference is reported without assuming device or key access',()=>{
 const result=compareDebugSignerWithReference(auditDebugMetadata(input()),'e'.repeat(64));
 assert.equal(result.status,'CI_DEBUG_CERT_DIFFERS_FROM_SUPPLIED_REFERENCE');
 assert.equal(result.matchesSuppliedReference,false);
 assert.equal(result.productionUpgradeAuthorized,false);
});

test('B05 signer comparison refuses stale or forged audit output and malformed reference',()=>{
 const audit=auditDebugMetadata(input());
 for(const wrong of ['', 'short','z'.repeat(64)]) {
  assert.throws(()=>compareDebugSignerWithReference(audit,wrong),/BLOCKED/);
 }
 assert.throws(()=>compareDebugSignerWithReference({
  ...audit,productionUpgradeAuthorized:true
 },fingerprint),/BLOCKED/);
 assert.throws(()=>compareDebugSignerWithReference({
  ...audit,auditStatus:'UNVERIFIED'
 },fingerprint),/BLOCKED/);
 assert.throws(()=>compareDebugSignerWithReference({
  ...audit,signerCertificateSha256:'too-short'
 },fingerprint),/BLOCKED/);
});
