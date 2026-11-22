import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../tools/android-restore335-fixed-file-predicates-v10.ps1',import.meta.url),'utf8');
const build=readFileSync(new URL('../scripts/prepare-android-fileproof335-isolated-apk.mjs',import.meta.url),'utf8');

test('V10 fixed filename is exact and sourced from isolated diagnostic APK build',()=>{
  assert.match(build,/const INPUT='fileproof335-input\.paseka'/);
  assert.match(build,/const PACKAGE='ru\.paseka\.journal\.archive\.restoreproof335'/);
  assert.match(src,/\$expectedName = 'fileproof335-input\.paseka'/);
  assert.match(src,/\$expectedPath = 'files\/fileproof335-input\.paseka'/);
  assert.match(src,/if \(\$names.Count -ne 1 -or \$inventory -cne \$expectedName\)/);
});
test('V10 retains pinned identity, guarded run-as and no writes',()=>{
  for(const marker of ['ANDROID_RESTORE335_FIXED_FILE_PREDICATES_V10','PASS_NE2213','PASS_API36','PASS_PINNED','PRIVATE_CWD_NOT_PINNED','PACKAGE_IDENTITY_INCONSISTENT_OR_ABSENT_NO_PRIVATE_ACCESS',"writes = 'NOT_ATTEMPTED'","mediaRead = 'NOT_ATTEMPTED'","cleanup = 'NOT_AUTHORIZED'"]) assert.ok(src.includes(marker),marker);
  for(const re of [/Call-Adb[^\r\n]*'(?:push|pull|install|uninstall|clear|rm|cat|cp|mv|dd|sha256sum|restore|delete|find|stat)'/i,/\$report\.(?:filename|name|raw|path|stdout|found)\s*=/i]) assert.doesNotMatch(src,re);
});
test('V10 only interprets true/false for four fixed file predicates',()=>{
  for(const x of ["'-e'","'-f'","'-d'","'-L'"]) assert.ok(src.includes(x),x);
  assert.match(src,/\$Arguments\[8\] -ceq 'files\/fileproof335-input\.paseka'/);
  assert.match(src,/SOURCE_FIXED_TEST_RESPONSE_UNVERIFIED/);
  assert.match(src,/SOURCE_FIXED_SYMLINK_PRESERVE/);
  assert.match(src,/SOURCE_FIXED_PREDICATES_NOT_REGULAR_PRESERVE/);
});
test('V10 checks listing twice and never infers archive integrity from a named entry',()=>{
  assert.match(src,/SOURCE_FIXED_NAME_NOT_MATCHED_PRESERVE/);
  assert.match(src,/SOURCE_FIXED_LISTING_CHANGED_PRESERVE/);
  assert.match(src,/privateInput = 'UNKNOWN_PRESERVE'/);
  assert.match(src,/sourceEntryKind = Get-ExpectedSourceKind/);
  assert.match(src,/SOURCE_NAMED_REGULAR_FILE_ONLY_NO_BYTES_READ/);
});
test('V10 preserves fail-closed status and zero-only success exit',()=>{
  assert.match(src,/if \(\$report\.status -ne 'PASS'\) \{ exit 2 \}\s*exit 0\s*$/);
  assert.doesNotMatch(src,/privateInput\s*=\s*'(?:VALID|RESTORED|YES)'/);
});
