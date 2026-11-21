import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ps=readFileSync(new URL('../tools/android-restoreproof335-one-shot.ps1',import.meta.url),'utf8');
test('device protocol fixes all three identities and original SHA',()=>{
  assert.match(ps,/ru\.paseka\.journal\.archive\.restoreproof335/);
  assert.match(ps,/ru\.paseka\.journal\.archive\.fileproof329/);
  assert.match(ps,/paseka-proof329-59a9e237-e33f-42f6-acf3-ff5f99bc1eec\.paseka/);
  for(const h of [
    '28e62f19d80a4ede343041a658da7093b2c106c82a02e0db23f2ccedd5bde176',
    '5ba91f66576e8f859a398655be001d0116819478501981650505ea66a92f496e',
    '4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186'
  ])assert.match(ps,new RegExp(h));
});
test('device protocol never deletes, clears, reinstalls or writes original archive',()=>{
  const executable=ps.replace(/^\s*#.*$/gm,'');
  for(const forbidden of [
    /\bRemove-Item\b/i,/\brm\s/i,/\bpm\s+clear\b/i,/\buninstall\b/i,
    /\bforce-stop\b/i,/\binstall\s+-r\b/i,/\bdeleteDatabase\b/i,
    /\bOut-File\b/i,/\bSet-Content\b/i,/\bMediaStore\b/i
  ])assert.doesNotMatch(executable,forbidden);
  assert.match(ps,/VerifyOriginal/);
  assert.match(ps,/PRIVATE_INPUT_READBACK_SHA_MISMATCH/);
  assert.match(ps,/NEW_TEST_PACKAGE_ALREADY_PRESENT/);
  assert.match(ps,/NO_UNINSTALL_NO_RESET_NO_RESTORE_USER_DATA_NO_DELETE/);
});
test('device protocol limits ADB wait and shields binary from task output',()=>{
  assert.match(ps,/WaitForExit\(15000\)/);
  assert.match(ps,/\[void\]\$outTask\.GetAwaiter\(\)\.GetResult\(\)/);
  assert.match(ps,/StandardError\.ReadToEndAsync\(\)/);
  assert.match(ps,/exec-in/);
  assert.match(ps,/run-as/);
  assert.match(ps,/FileMode\]::CreateNew/);
  assert.match(ps,/RESTORE_PROOF335: ANDROID_SYNTHETIC_PASS/);
});
