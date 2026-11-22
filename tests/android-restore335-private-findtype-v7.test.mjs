import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../tools/android-restore335-private-findtype-stage-v7.ps1',import.meta.url),'utf8');
test('V7 has identical pinned device and diagnostic private-only gates',()=>{
 for(const s of ['ANDROID_RESTORE335_PRIVATE_FINDTYPE_V7','PASS_NE2213','PASS_API36','PASS_PINNED','PRIVATE_CWD_NOT_PINNED','PACKAGE_IDENTITY_INCONSISTENT_OR_ABSENT_NO_PRIVATE_ACCESS']) assert.ok(src.includes(s),s);
});
test('V7 only uses strict shallow find with fixed type filters',()=>{
 assert.match(src,/UNPINNED_PRIVATE_FIND_REQUEST/);
 assert.match(src,/\$Arguments.Count -eq 14/);
 assert.match(src,/\$Arguments\[8\] -ceq '-mindepth'/);
 assert.match(src,/\$Arguments\[10\] -ceq '-maxdepth'/);
 assert.match(src,/\$Arguments\[12\] -ceq '-type'/);
 assert.match(src,/foreach \(\$kind in @\('f','d','l','b','c','p','s'\)\)/);
 assert.doesNotMatch(src,/Call-Adb[^\r\n]*'-delete'/);
});
test('V7 never accepts ambiguity, unknown names or changing snapshots',()=>{
 for(const s of ['PRIVATE_ENTRY_IDENTITY_UNVERIFIED','PRIVATE_FIND_BINARY_UNVERIFIED','PRIVATE_FIND_PATH_MISMATCH_PRESERVE','PRIVATE_LISTING_CHANGED_PRESERVE','PRIVATE_MULTIPLE_TYPES_CONTRADICTORY']) assert.ok(src.includes(s),s);
 assert.match(src,/privateEntryType = 'UNKNOWN_PRESERVE'/);
});
test('V7 cannot write, install, restore, or authorize cleanup',()=>{
 assert.match(src,/cleanup = 'NOT_AUTHORIZED'/);
 assert.match(src,/mediaRead = 'NOT_ATTEMPTED'/);
 assert.match(src,/writes = 'NOT_ATTEMPTED'/);
 assert.match(src,/privateInput = 'UNKNOWN_PRESERVE'/);
 for(const re of [/Call-Adb[^\r\n]*'(?:push|pull|install|uninstall|clear|rm|cat|cp|mv|restore|delete)'/i,/\$report\.(?:path|filename|name|raw)\s*=/i]) assert.doesNotMatch(src,re);
});
test('V7 returns explicit exits and no restored-input claim',()=>{
 assert.match(src,/READ_ONLY_SINGLE_ENTRY_FIND_TYPE_NO_CONTENT_READ/);
 assert.match(src,/if \(\$report\.status -ne 'PASS'\) \{ exit 2 \}\s*exit 0\s*$/);
 assert.doesNotMatch(src,/privateInput\s*=\s*'(?:VALID|PASS|RESTORED)'/);
});
