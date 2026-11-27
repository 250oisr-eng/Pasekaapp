import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {onlyDevice,hasPackage,apkIdentity,signerFingerprint} from '../scripts/oneplus-daily-qa.mjs';
test('ADB refuses absent, unauthorized, or multiple devices',()=>{
 assert.equal(onlyDevice('List of devices attached\nABC device product:oneplus\n'),'ABC');
 for(const s of ['List of devices attached\n','List of devices attached\nABC unauthorized\n','List of devices attached\nABC device\nXYZ device\n'])
  assert.throws(()=>onlyDevice(s),/BLOCKED/);
});
test('ADB checks exact QA package and does not confuse it with production',()=>{
 assert.ok(hasPackage('package:ru.paseka.journal.qa.daily\n','ru.paseka.journal.qa.daily'));
 assert.equal(hasPackage('package:ru.paseka.journal.qa.daily\n','ru.paseka.journal'),false);
});
test('APK identity and one signer fingerprint must be parseable',()=>{
 assert.equal(apkIdentity("package: name='ru.paseka.journal.qa.daily' versionCode='1'"),'ru.paseka.journal.qa.daily');
 assert.throws(()=>apkIdentity(''),/BLOCKED/);
 assert.equal(signerFingerprint('Signer #1 certificate SHA-256 digest: '+'ab'.repeat(32)),'ab'.repeat(32));
 assert.throws(()=>signerFingerprint('unknown'),/BLOCKED/);
});
test('OnePlus QA preflight contains no destructive, production update or timed system date commands',()=>{
 const s=readFileSync(new URL('../scripts/oneplus-daily-qa.mjs',import.meta.url),'utf8');
 for(const forbidden of ['pm clear','uninstall','install -r','date -s','deleteDatabase','rm -rf','stop-app'])
  assert.ok(!s.includes(forbidden),'unsafe operation '+forbidden);
 assert.match(s,/if\(qaWasInstalled\|\|!result\.apkVerified\)/);
 assert.match(s,/physicalResult:'INCOMPLETE'/);
 assert.match(s,/backgroundExecution:'NOT_VERIFIED'/);
});