import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBadging, parseSigning, evaluateUpgrade, connectedDevice, parseBaseApkPath, runArtifactPairPreflight } from '../scripts/check-oneplus-upgrade.mjs';

const signer = 'a'.repeat(64);
const valid = { packageName: 'ru.paseka.journal', versionCode: 1, signers: [signer] };

test('parse Android metadata and signer cert without private signing key', () => {
  assert.deepEqual(parseBadging("package: name='ru.paseka.journal' versionCode='14' versionName='1.0'"), {packageName:'ru.paseka.journal', versionCode:14});
  assert.deepEqual(parseSigning('Signer #1 certificate SHA-256 digest: '+signer.toUpperCase()), [signer]);
  assert.deepEqual(parseSigning('V3.0 Signer: certificate SHA-256 digest: '+signer), [signer]);
  assert.deepEqual(parseSigning('V2.0 Signer: certificate SHA-256 digest: '+signer), [signer]);
  assert.deepEqual(parseSigning('V3.0 Signer: certificate SHA-256 digest: '+signer+'\nV2.0 Signer: certificate SHA-256 digest: '+signer), [signer]);
  assert.throws(()=>parseSigning('Untrusted: certificate SHA-256 digest: '+signer), /BLOCKED/);
  assert.throws(()=>parseBadging('badging failed'), /BLOCKED/);
  assert.throws(()=>parseSigning('no signer'), /BLOCKED/);
});

test('fail closed for package, signer and downgraded version', () => {
  assert.equal(evaluateUpgrade(valid,{...valid,versionCode:2}).status, 'COMPATIBLE_METADATA_ONLY');
  assert.throws(()=>evaluateUpgrade(valid,{...valid,packageName:'ru.paseka.journal.firstuseqa'}), /package IDs/);
  assert.throws(()=>evaluateUpgrade(valid,{...valid,signers:['b'.repeat(64)]}), /signing/);
  assert.throws(()=>evaluateUpgrade(valid,{...valid,versionCode:0}), /versionCode/);
  assert.throws(()=>evaluateUpgrade(valid,{...valid,signers:[]}), /signing/);
  assert.throws(()=>evaluateUpgrade(valid,{...valid,versionCode:0.5}), /versionCode/);
});

test('require exactly one online authorized ADB device',()=>{
  assert.equal(connectedDevice('List of devices attached\nABC123 device product:OnePlus\n'),'ABC123');
  assert.throws(()=>connectedDevice('List of devices attached\nABC123 unauthorized\n'),/BLOCKED/);
  assert.throws(()=>connectedDevice('List of devices attached\nABC123 device\nDEF456 device\n'),/BLOCKED/);
});

test('require installed base APK from package-manager paths',()=>{
  assert.equal(parseBaseApkPath('package:/data/app/abc/base.apk\n'),'/data/app/abc/base.apk');
  assert.throws(()=>parseBaseApkPath(''),/BLOCKED/);
});

test('offline two-APK preflight rejects archives and missing inputs before invoking external SDK tools', () => {
  assert.throws(() => runArtifactPairPreflight(undefined, 'candidate.apk'), /BLOCKED/);
  assert.throws(() => runArtifactPairPreflight('reference.zip', 'candidate.apk'), /BLOCKED/);
  assert.throws(() => runArtifactPairPreflight('reference.apk', 'candidate.zip'), /BLOCKED/);
});
