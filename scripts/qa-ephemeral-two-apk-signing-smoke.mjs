import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { signIsolatedQaApk } from './sign-isolated-qa-apk.mjs';

const QA_REF='fix/p0-first-launch-startup-write-gate-2026-11-24';
export function verifySmokeContext(env) {
  if (env.CI !== 'true' || env.GITHUB_EVENT_NAME !== 'pull_request' || env.GITHUB_HEAD_REF !== QA_REF) {
    throw new Error('BLOCKED: disposable QA signing proof only permitted in the protected Draft PR CI');
  }
  if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) throw new Error('BLOCKED: Android SDK required');
  return true;
}

function safelyCall(bin,args) {
  try {
    return execFileSync(bin,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:1024*1024}).trim();
  } catch {
    throw new Error('BLOCKED: disposable QA cryptographic operation failed');
  }
}

export function testEphemeralQaSigning(sourceApk, env=process.env) {
  verifySmokeContext(env);
  if (!sourceApk || !sourceApk.endsWith('.apk') || !existsSync(sourceApk)) {
    throw new Error('BLOCKED: actual isolated APK file missing');
  }
  const workspace=mkdtempSync(join(tmpdir(),'paseka-ephemeral-signing-proof-'));
  const original={};
  const names=['PASEKA_SIGN_ISOLATED_QA','PASEKA_QA_KEYSTORE_PATH','PASEKA_QA_KEY_ALIAS',
    'PASEKA_QA_STORE_PASSWORD','PASEKA_QA_KEY_PASSWORD','PASEKA_QA_CERT_SHA256'];
  for (const key of names) original[key]=process.env[key];
  try {
    const password=randomBytes(22).toString('hex');
    const keyPath=join(workspace,'ephemeral-only.keystore');
    // This disposable key is generated inside the ephemeral runner, never an app signing key.
    safelyCall('keytool',['-genkeypair','-noprompt','-alias','synthetic-smoke',
      '-keyalg','RSA','-keysize','2048','-validity','2',
      '-dname','CN=Paseka Disposable CI Smoke, O=Not For Release, C=US',
      '-keystore',keyPath,'-storepass',password,'-keypass',password]);
    const details=safelyCall('keytool',['-list','-v','-keystore',keyPath,
      '-alias','synthetic-smoke','-storepass',password]);
    const found=/^\s*SHA256:\s*([a-fA-F0-9:]+)/m.exec(details);
    const fingerprint=found?.[1].replaceAll(':','').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(fingerprint||'')) throw new Error('BLOCKED: disposable key certificate unavailable');
    Object.assign(process.env,{
      PASEKA_SIGN_ISOLATED_QA:'YES',
      PASEKA_QA_KEYSTORE_PATH:keyPath,
      PASEKA_QA_KEY_ALIAS:'synthetic-smoke',
      PASEKA_QA_STORE_PASSWORD:password,
      PASEKA_QA_KEY_PASSWORD:password,
      PASEKA_QA_CERT_SHA256:fingerprint
    });
    const outputs=[join(workspace,'qa-proof-1.apk'),join(workspace,'qa-proof-2.apk')];
    const first=signIsolatedQaApk(process.env,resolve(sourceApk),outputs[0]);
    const second=signIsolatedQaApk(process.env,resolve(sourceApk),outputs[1]);
    if (first.packageName!==second.packageName || first.signerSha256!==second.signerSha256 ||
        first.versionCode!==second.versionCode) throw new Error('BLOCKED: disposable QA certificates drifted');
    return {status:'EPHEMERAL_TWO_BINARY_SIGNING_PROOF',packageName:first.packageName,
      versionCode:first.versionCode,matchedCertificate:true,
      requiresExternalDurableKey:true,upgradeOnOnePlus:false};
  } finally {
    for (const key of names) {
      if(original[key] === undefined) delete process.env[key];
      else process.env[key]=original[key];
    }
    rmSync(workspace,{recursive:true,force:true});
  }
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(testEphemeralQaSigning(process.argv[2]),null,2));
    console.log('Disposable signing smoke only; no APK is published or retained.');
  } catch (error) {
    console.error(error.message);
    process.exitCode=1;
  }
}
