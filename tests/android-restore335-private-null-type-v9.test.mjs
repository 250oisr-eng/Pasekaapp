import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../tools/android-restore335-private-null-type-v9.ps1',import.meta.url),'utf8');

test('V9 retains exact pinned Android device and diagnostic package gates',()=>{
  for(const token of ['ANDROID_RESTORE335_NULL_TYPE_V9','PASS_NE2213','PASS_API36','PASS_PINNED','PRIVATE_CWD_NOT_PINNED','PACKAGE_IDENTITY_INCONSISTENT_OR_ABSENT_NO_PRIVATE_ACCESS']) assert.ok(src.includes(token),token);
});
test('V9 uses only bounded, null-delimited Toybox type probes',()=>{
  assert.match(src,/\$Arguments.Count -eq 15/);
  assert.match(src,/\$Arguments\[14\] -ceq '-print0'/);
  assert.match(src,/foreach \(\$kind in @\('f','d','l','b','c','p','s'\)\)/);
  assert.match(src,/UNPINNED_PRIVATE_FIND_REQUEST/);
  assert.match(src,/function Test-SingleNullRecord\(\[string\]\$Observed\)/);
  assert.match(src,/if \(\(Test-SingleNullRecord \$found\) -eq 0\) \{ continue \}/);
});
test('V9 stops on multiple, malformed, oversized, contradictory, or changed matches',()=>{
  for(const token of ['PRIVATE_FIND_NULL_OUTPUT_TOO_LARGE','PRIVATE_FIND_NULL_FRAMING_UNVERIFIED','PRIVATE_MULTIPLE_TYPES_CONTRADICTORY','PRIVATE_FIND_RESULT_CHANGED_PRESERVE','PRIVATE_LISTING_CHANGED_PRESERVE','PRIVATE_ENTRY_IDENTITY_UNVERIFIED']) assert.ok(src.includes(token),token);
  assert.match(src,/\$Observed.IndexOf\(\[char\]0\) -ne \(\$Observed.Length - 1\)/);
});
test('V9 never returns names, paths, media bytes or cleanup permission',()=>{
  for(const token of ["cleanup = 'NOT_AUTHORIZED'","writes = 'NOT_ATTEMPTED'","installs = 'NOT_ATTEMPTED'","mediaRead = 'NOT_ATTEMPTED'","privateInput = 'UNKNOWN_PRESERVE'"]) assert.ok(src.includes(token),token);
  for(const re of [/\$report\.(?:filename|name|raw|path|stdout|found)\s*=/i,/Call-Adb[^\r\n]*'(?:push|pull|install|uninstall|clear|rm|cat|cp|mv|restore|delete)'/i]) assert.doesNotMatch(src,re);
});
test('V9 distinguishes type evidence from archive provenance and exits correctly',()=>{
  assert.match(src,/typeEvidence = 'ONE_NULL_TERMINATED_MATCH_PRESERVE'/);
  assert.match(src,/privateEntryType = 'UNKNOWN_PRESERVE'/);
  assert.match(src,/READ_ONLY_SINGLE_ENTRY_NULL_TYPE_NO_CONTENT_READ/);
  assert.match(src,/if \(\$report\.status -ne 'PASS'\) \{ exit 2 \}\s*exit 0\s*$/);
});
