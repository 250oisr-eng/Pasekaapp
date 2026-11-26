/* Android CI debug artifact PROVENANCE ONLY; not a key manager or release signer.
 * This script never interacts with Android devices. It does not authorize upgrades.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBadging, parseSigning } from './check-oneplus-upgrade.mjs';

const EXPECTED_PACKAGE='ru.paseka.journal';
const SHA40=/^[a-f0-9]{40}$/;
const SHA64=/^[a-f0-9]{64}$/;
const MAX_DEBUG_BYTES=128*1024*1024;

function requireThat(ok,reason){if(!ok)throw new Error('B05_DEBUG_ARTIFACT_BLOCKED: '+reason);}

export function auditDebugMetadata({badging,certificates,apkSha256,checkoutSha,apkBytes}){
 const parsed=parseBadging(badging);
 const signers=parseSigning(certificates);
 requireThat(parsed.packageName===EXPECTED_PACKAGE,'wrong expected Android package');
 requireThat(Number.isSafeInteger(parsed.versionCode)&&parsed.versionCode>=1,'invalid Android versionCode');
 requireThat(signers.length===1&&SHA64.test(signers[0]),'exactly one signer SHA-256 required');
 requireThat(typeof apkSha256==='string'&&SHA64.test(apkSha256),'invalid APK content SHA-256');
 requireThat(typeof checkoutSha==='string'&&SHA40.test(checkoutSha),'invalid checked-out commit SHA');
 requireThat(Number.isSafeInteger(apkBytes)&&apkBytes>0&&apkBytes<=MAX_DEBUG_BYTES,
  'APK size is empty, oversized or unknown');
 return Object.freeze({
  schemaVersion:1,
  auditStatus:'PASS_DEBUG_ARTIFACT_METADATA_ONLY',
  artifactKind:'ANDROID_DEBUG_CI_ONLY_NOT_FOR_ONEPLUS',
  packageName:parsed.packageName,
  versionCode:parsed.versionCode,
  apkBytes,
  apkSha256,
  signerCertificateSha256:signers[0],
  checkoutCommitSha:checkoutSha,
  signingKeyCustody:'NOT_PROVEN_EPHEMERAL_CI_DEBUG',
  installedOnePlusSignerMatch:'NOT_TESTED',
  installedOnePlusVersionCompatibility:'NOT_TESTED',
  actualOwnerArchiveProductionRestore:'NOT_TESTED',
  productionRollback:'NOT_TESTED',
  productionUpgradeAuthorized:false,
  publishingAuthorized:false
 });
}

// An explicitly supplied *public* installed-app fingerprint may be compared
// with verified CI debug artifact metadata. A match does NOT attest the reference
// is fresh, prove private key custody or authorize a production installation.
export function compareDebugSignerWithReference(metadata,referenceSha256) {
 requireThat(metadata?.auditStatus==='PASS_DEBUG_ARTIFACT_METADATA_ONLY' &&
   metadata?.artifactKind==='ANDROID_DEBUG_CI_ONLY_NOT_FOR_ONEPLUS' &&
   metadata?.packageName===EXPECTED_PACKAGE &&
   typeof metadata?.signerCertificateSha256==='string' &&
   SHA64.test(metadata.signerCertificateSha256) &&
   metadata?.productionUpgradeAuthorized===false &&
   metadata?.publishingAuthorized===false,
   'trusted debug metadata required before comparing signer reference');
 requireThat(typeof referenceSha256==='string'&&SHA64.test(referenceSha256.toLowerCase()),
   'explicit 64-digit public certificate reference required');
 const match=metadata.signerCertificateSha256===referenceSha256.toLowerCase();
 return Object.freeze({
  status:match?'CI_DEBUG_CERT_MATCHES_SUPPLIED_REFERENCE_METADATA_ONLY':
    'CI_DEBUG_CERT_DIFFERS_FROM_SUPPLIED_REFERENCE',
  ciCertificateSha256:metadata.signerCertificateSha256,
  referenceCertificateSha256:referenceSha256.toLowerCase(),
  matchesSuppliedReference:match,
  referenceIsCurrentInstalledCertificate:'NOT_VERIFIED',
  privateKeyCustodyVerified:false,
  productionUpgradeAuthorized:false,
  productionRollbackVerified:false,
  deviceInstalled:false
 });
}

export function auditLocalDebugApk({apkPath,aapt,apksigner,run=execFileSync}){
 requireThat(typeof apkPath==='string'&&basename(apkPath)==='app-debug.apk','debug APK basename must be app-debug.apk');
 requireThat(typeof aapt==='string'&&aapt.length>0&&typeof apksigner==='string'&&apksigner.length>0,
  'aapt/apksigner tools required');
 const file=resolve(apkPath);
 const st=lstatSync(file);
 requireThat(st.isFile()&&!st.isSymbolicLink()&&st.size>0&&st.size<=MAX_DEBUG_BYTES,
   'APK must be a bounded regular non-symlink file');
 const cmd=(exe,args)=>String(run(exe,args,{
   encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024,
   stdio:['ignore','pipe','pipe']
 })).trim();
 const badging=cmd(aapt,['dump','badging',file]);
 // Failure of apksigner verification is fatal: never infer trust from output text alone.
 const certificates=cmd(apksigner,['verify','--print-certs',file]);
 const checkoutSha=cmd('git',['rev-parse','HEAD']).toLowerCase();
 const apkSha256=createHash('sha256').update(readFileSync(file)).digest('hex');
 return auditDebugMetadata({badging,certificates,checkoutSha,apkSha256,apkBytes:st.size});
}

export function writeDebugProvenance({apkPath,aapt,apksigner,run}){
 const result=auditLocalDebugApk({apkPath,aapt,apksigner,run});
 const dest=join(dirname(resolve(apkPath)),'DEBUG-ONLY-provenance.json');
 writeFileSync(dest,JSON.stringify(result,null,2)+'\n',{flag:'w',mode:0o644});
 return {destination:dest,metadata:result};
}

if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{
  const [apkPath,aapt,apksigner]=process.argv.slice(2);
  requireThat(!!apkPath&&!!aapt&&!!apksigner,'usage: node audit-android-debug-artifact.mjs <app-debug.apk> <aapt> <apksigner>');
  const {metadata}=writeDebugProvenance({apkPath,aapt,apksigner});
  // Intentionally print no sensitive app state or signing key. Public cert fingerprint is in JSON.
  process.stdout.write('B05_DEBUG_ARTIFACT_AUDIT '+JSON.stringify({
   status:metadata.auditStatus,
   artifactKind:metadata.artifactKind,
   apkSha256:metadata.apkSha256,
   productionUpgradeAuthorized:false,
   signingKeyCustody:metadata.signingKeyCustody
  })+'\n');
 }catch(error){
  process.stderr.write('B05_DEBUG_ARTIFACT_BLOCKED: '+String(error?.message||'UNKNOWN').replace(/[\r\n]/g,' ').slice(0,180)+'\n');
  process.exitCode=1;
 }
}
