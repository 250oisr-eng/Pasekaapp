import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../tools/android-restore335-find-output-shape-v8.ps1',import.meta.url),'utf8');
test('V8 retains hard device identity/diagnostic package checks',()=>{
 for(const token of ['ANDROID_RESTORE335_FIND_SHAPE_V8','PASS_NE2213','PASS_API36','PASS_PINNED','PRIVATE_CWD_NOT_PINNED','PACKAGE_IDENTITY_INCONSISTENT_OR_ABSENT_NO_PRIVATE_ACCESS']) assert.ok(code.includes(token),token);
});
test('V8 never changes V7 strict shell-free find filters or path mismatch blocking',()=>{
 assert.match(code,/foreach \(\$kind in @\('f','d','l','b','c','p','s'\)\)/);
 assert.match(code,/UNPINNED_PRIVATE_FIND_REQUEST/);
 assert.match(code,/PRIVATE_FIND_PATH_MISMATCH_PRESERVE/);
 assert.match(code,/PRIVATE_LISTING_CHANGED_PRESERVE/);
 assert.match(code,/PRIVATE_MULTIPLE_TYPES_CONTRADICTORY/);
});
test('V8 reports only bounded mismatch categories and filter symbols',()=>{
 for(const kind of ['DOT_SLASH_PREFIX','EXTRA_PATH_PREFIX','MULTILINE_OUTPUT','CONTROL_CHARACTER','OTHER_OPAQUE_MISMATCH']) assert.ok(code.includes(kind),kind);
 assert.match(code,/\$report\.findMismatchFilter = \$kind/);
 assert.match(code,/\$report\.findMismatchClass = 'NONE'/);
 for(const re of [/\$report\.(?:path|fileName|name|raw|found|expectedPath|privateEntryName)\s*=/i,/\$report\.findMismatchClass = \$found/]) assert.doesNotMatch(code,re);
});
test('V8 retains no media reads, device writes, installation, restore or delete',()=>{
 for(const marker of ["writes = 'NOT_ATTEMPTED'","mediaRead = 'NOT_ATTEMPTED'","cleanup = 'NOT_AUTHORIZED'","privateInput = 'UNKNOWN_PRESERVE'"]) assert.ok(code.includes(marker),marker);
 for(const re of [/Call-Adb[^\r\n]*'(?:push|pull|install|uninstall|clear|rm|cat|cp|mv|restore|delete)'/i]) assert.doesNotMatch(code,re);
});
test('V8 explicitly exits zero only on PASS',()=>{
 assert.match(code,/if \(\$report\.status -ne 'PASS'\) \{ exit 2 \}\s*exit 0\s*$/);
});
