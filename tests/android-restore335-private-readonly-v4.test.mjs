import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const v4=readFileSync(new URL('../tools/android-restore335-private-readonly-stage-v4.ps1',import.meta.url),'utf8');
test('V4 is pinned to diagnostic package, physical device and ADB',()=>{
  for(const token of ['ANDROID_RESTORE335_PRIVATE_READONLY_V4','PASS_NE2213','PASS_API36','PASS_PINNED','ru.paseka.journal.archive.restoreproof335','PRIVATE_CWD_NOT_PINNED'])
    assert.ok(v4.includes(token),token);
});
test('V4 does not add device write, cleanup, media reading, or binary output',()=>{
  for(const dangerous of [/Call-Adb[^\r\n]*'push'/i,/Call-Adb[^\r\n]*'install'/i,/Call-Adb[^\r\n]*'uninstall'/i,/Call-Adb[^\r\n]*'clear'/i,/Call-Adb[^\r\n]*'rm'/i,/Call-Adb[^\r\n]*'cat'/i])
    assert.doesNotMatch(v4,dangerous);
  assert.match(v4,/writes = 'NOT_ATTEMPTED'/);
  assert.match(v4,/cleanup = 'NOT_AUTHORIZED'/);
  assert.match(v4,/mediaRead = 'NOT_ATTEMPTED'/);
});
test('V4 stops on inconsistent package and private path predicates',()=>{
  assert.match(v4,/PACKAGE_IDENTITY_INCONSISTENT_OR_ABSENT_NO_PRIVATE_ACCESS/);
  assert.match(v4,/PRIVATE_PATH_TESTS_CONTRADICTORY_NO_ACTION/);
  assert.match(v4,/PRIVATE_LISTING_COUNT_UNVERIFIED/);
});
test('V4 reports count without names, never upgrades unknown input',()=>{
  assert.match(v4,/privateEntryCount = \[string\]\$names.Count/);
  assert.match(v4,/READ_ONLY_NONEMPTY_COUNT_ONLY_NO_ARCHIVE_READ/);
  assert.match(v4,/privateInput = 'UNKNOWN_PRESERVE'/);
  assert.doesNotMatch(v4,/\$report\.[a-zA-Z]+\s*=\s*\$names\b/);
});
