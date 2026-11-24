import test from 'node:test';
import assert from 'node:assert/strict';
import { verifySmokeContext } from '../scripts/qa-ephemeral-two-apk-signing-smoke.mjs';
import { requireAndroid15 } from '../scripts/require-android15-qa.mjs';
import { readFileSync } from 'node:fs';

test('ephemeral binary signer proof cannot run from main, push or non-CI environment',()=>{
 const valid={CI:'true',GITHUB_EVENT_NAME:'pull_request',GITHUB_HEAD_REF:'fix/p0-first-launch-startup-write-gate-2026-11-24',ANDROID_HOME:'/tmp/sdk'};
 assert.equal(verifySmokeContext(valid),true);
 for(const altered of [{CI:'false'},{GITHUB_HEAD_REF:'main'},{GITHUB_EVENT_NAME:'push'},{ANDROID_HOME:''}]) {
  assert.throws(()=>verifySmokeContext({...valid,...altered}),/BLOCKED/);
 }
});

test('Android 15 guard updates exactly three variables and rejects unknown format',()=>{
 const source='ext {\n minSdkVersion = 23\n compileSdkVersion = 34\n targetSdkVersion = 34\n other = 12\n}\n';
 const updated=requireAndroid15(source);
 assert.match(updated,/minSdkVersion = 35/);
 assert.match(updated,/compileSdkVersion = 35/);
 assert.match(updated,/targetSdkVersion = 35/);
 assert.match(updated,/other = 12/);
 assert.throws(()=>requireAndroid15('minSdkVersion=23'),/BLOCKED/);
});

test('isolated binary signing CI job never uploads secret keys or disposable signed APKs',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/android-debug.yml',import.meta.url),'utf8');
 const isolated=workflow.split('  isolated_qa_signature_proof:')[1];
 assert.ok(isolated,'isolated signing proof job must exist');
 assert.match(isolated,/github\.event_name == 'pull_request'/);
 assert.match(isolated,/qa-ephemeral-two-apk-signing-smoke/);
 assert.doesNotMatch(isolated,/actions\/upload-artifact/);
 assert.doesNotMatch(isolated,/secrets\./);
 assert.match(isolated,/prepare-oneplus-first-use-config/);
});
