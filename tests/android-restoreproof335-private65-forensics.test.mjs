import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../tools/android-restoreproof335-private65-forensics.ps1',import.meta.url),'utf8');
test('forensics is strictly read only for exact packages and files',()=>{
  for(const name of [
    'ru.paseka.journal.archive.restoreproof335',
    'ru.paseka.journal.archive.fileproof329',
    'files/fileproof335-input.paseka',
    'files/restore335-report.json',
    '4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186'
  ])assert.ok(source.includes(name));
  for(const bad of [/\bexec-in\b/i,/\binstall\s+-/i,/\buninstall\b/i,/\bpm clear\b/i,/\bforce-stop\b/i,/\bpush\b/i,/\bRemove-Item\b/i,/\bSet-Content\b/i,/\bOut-File\b/i,/\bdeleteDatabase\b/i]){
    assert.doesNotMatch(source.replace(/^\s*#.*$/gm,''),bad);
  }
});
test('forensics shows only bounded 128-byte diagnostic previews',()=>{
  assert.match(source,/PRIVATE_HEX_UP_TO_128/);
  assert.match(source,/PRIVATE_ASCII_UP_TO_128/);
  assert.match(source,/REPORT_HEX_UP_TO_128/);
  assert.match(source,/REPORT_ASCII_UP_TO_128/);
  assert.match(source,/if\(\$bytes\.Length -gt 128\)/);
  assert.match(source,/if\(\$target\.Length -le 128\)/);
  assert.match(source,/if\(\$report\.Bytes\.Length -le 128\)/);
  assert.match(source,/NO_INSTALL_NO_WRITE_NO_RESET_NO_DELETE_NO_LAUNCH/);
});
