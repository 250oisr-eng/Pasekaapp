import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ps=readFileSync(new URL('../tools/android-restoreproof335-readonly-diagnostic.ps1',import.meta.url),'utf8');
test('diagnostic is pinned to exact device, old and new test package, input path and source hash',()=>{
  for(const literal of [
    'NE2213','restoreproof335','fileproof329',
    'paseka-proof329-59a9e237-e33f-42f6-acf3-ff5f99bc1eec.paseka',
    'files/fileproof335-input.paseka',
    '4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186'
  ]) assert.ok(ps.includes(literal),literal);
});
test('diagnostic never writes to Android or production databases',()=>{
  const commands=[...ps.matchAll(/Adb(?: \$argv| @\(([^\n]+)\))/g)];
  assert.ok(commands.length>2);
  for(const forbidden of [/\binstall\b/i,/\buninstall\b/i,/\bforce-stop\b/i,/\bexec-in\b/i,/\bpush\b/i,/\bpm clear\b/i,/\bdeleteDatabase\b/i,/\bRemove-Item\b/i,/\bSet-Content\b/i,/\bOut-File\b/i,/\bshell\s+rm\b/i]){
    assert.doesNotMatch(ps.replace(/^\s*#.*$/gm,''),forbidden);
  }
  assert.match(ps,/NO_INSTALL_NO_WRITE_NO_RESET_NO_DELETE_NO_LAUNCH/);
  assert.match(ps,/RESTORE_COMMIT: NOT_CONFIRMED/);
});
test('diagnostic checks original first, refuses changed original, and outputs only metadata for target mismatch',()=>{
  const orig=ps.indexOf("ORIGINAL_NOT_PINNED_ABORT");
  const privateRead=ps.indexOf("run-as',$package,'cat',$private");
  assert.ok(orig>=0&&privateRead>orig);
  assert.match(ps,/FIRST_DIFFERENT_BYTE_OFFSET/);
  assert.match(ps,/LENGTH_DELTA/);
  assert.match(ps,/PRIVATE_STAGING_STATUS: MISMATCH_NO_WRITE/);
  assert.match(ps,/WaitForExit\(12000\)/);
  assert.match(ps,/\[void\]\$stdout\.GetAwaiter\(\)\.GetResult\(\)/);
});
