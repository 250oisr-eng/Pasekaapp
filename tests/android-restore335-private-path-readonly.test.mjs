import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../tools/android-restore335-private-path-readonly.ps1',import.meta.url),'utf8');
test('only the two expected isolated packages and pinned original',()=>{
  for(const item of ['ru.paseka.journal.archive.restoreproof335','ru.paseka.journal.archive.fileproof329',
  'paseka-proof329-59a9e237-e33f-42f6-acf3-ff5f99bc1eec.paseka',
  '4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186'])assert.ok(source.includes(item));
});
test('read-only private metadata without shell command or data writes',()=>{
  const clean=source.replace(/^\s*#.*$/gm,'');
  for(const re of [/\bexec-in\b/i,/\binstall\s+-/i,/\bpush\b/i,/\buninstall\b/i,
  /\bforce-stop\b/i,/\bpm clear\b/i,/\bdeleteDatabase\b/i,/\bRemove-Item\b/i,
  /\bSet-Content\b/i,/\bOut-File\b/i,/\bsh\s+-c\b/i,/\bmkdir\s+-p\b/i]){
    assert.doesNotMatch(clean,re);
  }
  assert.match(source,/run-as',\$pkg,'ls','-ld',\$path/);
  assert.match(source,/run-as',\$pkg,'pwd'/);
  assert.match(source,/NO_INSTALL_NO_WRITE_NO_LAUNCH_NO_RESET_NO_DELETE/);
  assert.match(source,/ORIGINAL_PINNED_SHA_FAILED/);
  assert.match(source,/No such file or directory/);
});
