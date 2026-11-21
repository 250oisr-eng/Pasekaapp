import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const build=readFileSync(new URL('../scripts/prepare-android-fileproof335-isolated-apk.mjs',import.meta.url),'utf8');
const start=readFileSync(new URL('./fixtures/android-fileproof335-start.js',import.meta.url),'utf8');
test('package is different from production and fileproof329, and build gated',()=>{
  assert.match(build,/PASEKA_RESTORE335_BUILD/);
  assert.match(build,/ru\.paseka\.journal\.archive\.restoreproof335/);
  assert.match(build,/ORIGINAL_APP_ID_REQUIRED/);
  assert.match(build,/WRONG_TEST_PACKAGE/);
  assert.match(build,/UNEXPECTED_ACTIVITY_NO_PATCH/);
  assert.match(build,/BRIDGE_ALREADY_EXISTS/);
  assert.match(build,/REPORTER_ALREADY_EXISTS/);
});
test('bridge reads only pinned 3158B archive from own private files dir',()=>{
  assert.match(build,/context\.getFilesDir\(\)/);
  assert.match(build,/fileproof335-input\.paseka/);
  assert.match(build,/file\.length\(\)!=3158/);
  assert.match(build,/4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186/);
  assert.match(build,/PINNED_SHA_MISMATCH/);
  assert.match(build,/readAttempted=true/);
  for(const unsafe of [/MediaStore/,/getExternalStorageDirectory/,/FileOutputStream\(file/,/\.delete\(/,/\.renameTo\(/,/deleteDatabase\(/,/Runtime\.getRuntime\(/]){
    assert.doesNotMatch(build,unsafe);
  }
});
test('start uses native pinned archive only and never signals recognition or cleanup',()=>{
  assert.match(start,/readPinnedArchiveBase64\(\)/);
  assert.match(start,/PasekaIsolatedRestore335\.run\(bytes\)/);
  assert.match(start,/ISOLATED_RESTORE335_SHA_PASS/);
  assert.match(start,/sourcePreserved:true/);
  assert.match(start,/recognitionSucceeded:false/);
  assert.match(start,/cleanupAuthorized:false/);
  assert.doesNotMatch(start,/fetch\(/);
  assert.doesNotMatch(start,/deleteDatabase\(/);
});
test('one-shot private report refuses overwrite',()=>{
  assert.match(build,/restore335-report\.json/);
  assert.match(build,/if\(destination\.exists\(\)\)return/);
  assert.match(build,/attempted=true/);
});
