import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src=readFileSync(new URL('../tools/android-restore335-private-type-stage-v5.ps1',import.meta.url),'utf8');

test('V5 inherits pinned Android identity and private run-as checks',()=>{
  for(const s of ['ANDROID_RESTORE335_PRIVATE_TYPE_V5','PASS_NE2213','PASS_API36','PASS_PINNED','PACKAGE_IDENTITY_INCONSISTENT_OR_ABSENT_NO_PRIVATE_ACCESS','PRIVATE_CWD_NOT_PINNED'])
    assert.ok(src.includes(s),s);
});
test('V5 has no device writes, media payload reads, or cleanup authorization',()=>{
  for(const re of [/Call-Adb[^\r\n]*'(?:push|pull|install|uninstall|clear|rm|cat|cp|mv|restore)'/i,/\$report\.[a-zA-Z]+\s*=\s*\$metaLines/i])
    assert.doesNotMatch(src,re);
  for(const s of ["writes = 'NOT_ATTEMPTED'","installs = 'NOT_ATTEMPTED'","mediaRead = 'NOT_ATTEMPTED'","cleanup = 'NOT_AUTHORIZED'","privateInput = 'UNKNOWN_PRESERVE'"]) assert.ok(src.includes(s),s);
});
test('V5 metadata can run only for exact isolated one-entry listing',()=>{
  assert.match(src,/if \(\$names\.Count -ne 1/);
  assert.match(src,/UNPINNED_PRIVATE_METADATA_REQUEST/);
  assert.match(src,/\$Arguments\[7\] -ceq '-lA' -and \$Arguments\[8\] -ceq 'files'/);
  assert.match(src,/PRIVATE_METADATA_ROWS_UNVERIFIED/);
  assert.match(src,/PRIVATE_METADATA_FORMAT_UNVERIFIED/);
  assert.match(src,/PRIVATE_METADATA_BINARY_UNVERIFIED/);
});
test('V5 never treats a metadata class as archive ownership or valid input',()=>{
  for(const type of ['REGULAR_FILE','DIRECTORY','SYMLINK_NO_FOLLOW','OTHER_NO_FOLLOW']) assert.ok(src.includes(type));
  assert.match(src,/PRIVATE_LISTING_CHANGED_PRESERVE/);
  assert.match(src,/READ_ONLY_SINGLE_ENTRY_TYPE_ONLY_NO_CONTENT_READ/);
  assert.match(src,/privateInput = 'UNKNOWN_PRESERVE'/);
  assert.doesNotMatch(src,/privateInput\s*=\s*'PASS'/);
});
test('V5 protects output, errors and process completion',()=>{
  assert.match(src,/\$report \| ConvertTo-Json -Depth 3/);
  assert.match(src,/if \(\$report\.status -ne 'PASS'\) \{ exit 2 \}\s*exit 0\s*$/);
  assert.doesNotMatch(src,/\$report\.(?:name|filename|path|metadata)\s*=/i);
});
