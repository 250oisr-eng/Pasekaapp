import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseSigning,parseBadging,EXPECTED_PACKAGE} from './check-oneplus-upgrade.mjs';

export const INSTALLED_ONEPLUS_SHA256 = '9b10baf04e1e09bfe2d58e72b1c1eecf04b48f532940b5e91a3083bd73ddb0aa';
export function evaluateDebugApk({badging,verifiedSigners},expected=INSTALLED_ONEPLUS_SHA256) {
  const app=parseBadging(badging);
  if(app.packageName!==EXPECTED_PACKAGE)throw Error('BLOCKED: CI APK package ID differs from phone');
  const signers=parseSigning(verifiedSigners);
  if(signers.length!==1)throw Error('BLOCKED: unsupported multiple CI APK signer certificates');
  const matched=signers[0]===expected;
  return {
    status:matched?'CI_DEBUG_CERT_MATCHES_INSTALLED_METADATA_ONLY':'CI_DEBUG_CERT_DIFFERS_FROM_INSTALLED',
    packageId:EXPECTED_PACKAGE,versionCode:app.versionCode,
    ciCertificateSha256:signers[0],
    installedCertificateSha256:expected,
    matchesInstalledCertificate:matched,
    signedReleaseCandidateVerified:false,
    privateKeyCustodyVerified:false,
    deviceUpgradeAuthorized:false,
    deviceInstalled:false
  };
}
export function inspectDebugArtifact({
  androidHome=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT,
  apk='android/app/build/outputs/apk/debug/app-debug.apk',
  command=execFileSync,exists=existsSync
}={}) {
  if(!androidHome||!exists(apk))throw Error('BLOCKED: SDK or debug APK missing');
  const tools=join(androidHome,'build-tools','35.0.0');
  const aapt=join(tools,'aapt'),apksigner=join(tools,'apksigner');
  if(!exists(aapt)||!exists(apksigner))throw Error('BLOCKED: official APK verification tools missing');
  const args={encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:8*1024*1024};
  // Official apksigner validates the cryptographic APK signature. No key access.
  const signerOutput=command(apksigner,['verify','--print-certs',resolve(apk)],args);
  const badgingOutput=command(aapt,['dump','badging',resolve(apk)],args);
  return evaluateDebugApk({badging:badgingOutput,verifiedSigners:signerOutput});
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{console.log(JSON.stringify(inspectDebugArtifact(),null,2))}
 catch(_){console.error(JSON.stringify({status:'BLOCKED_CI_DEBUG_APK_NOT_VERIFIED',deviceInstalled:false}));process.exitCode=1}
}
