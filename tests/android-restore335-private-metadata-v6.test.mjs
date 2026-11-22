import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../tools/android-restore335-private-metadata-stage-v6.ps1',import.meta.url),'utf8');
test('V6 retains pinned ADB and diagnostic-only package gates',()=>{
  for(const key of ['ANDROID_RESTORE335_PRIVATE_METADATA_V6','PASS_NE2213','PASS_API36','PASS_PINNED','PRIVATE_CWD_NOT_PINNED','PACKAGE_IDENTITY_INCONSISTENT_OR_ABSENT_NO_PRIVATE_ACCESS']) assert.ok(src.includes(key),key);
});
test('V6 provides only bounded shallow metadata and no writes',()=>{
  assert.match(src,/if \(\$names.Count -ne 1/);
  assert.match(src,/PRIVATE_LISTING_CHANGED_PRESERVE/);
  assert.match(src,/UNPINNED_PRIVATE_METADATA_REQUEST/);
  assert.match(src,/privateInput = 'UNKNOWN_PRESERVE'/);
  assert.match(src,/cleanup = 'NOT_AUTHORIZED'/);
  assert.match(src,/writes = 'NOT_ATTEMPTED'/);
  for(const re of [/Call-Adb[^\r\n]*'(?:push|pull|install|uninstall|clear|rm|cat|cp|mv|restore)'/i,/\$report\.(?:path|filename|name|metadata|raw)\s*=/i]) assert.doesNotMatch(src,re);
});
test('V6 never infers type from unrecognized metadata',()=>{
  assert.match(src,/privateEntryType = 'UNKNOWN_PRESERVE'/);
  assert.match(src,/metadataFormat = 'UNKNOWN_MODE_FORMAT_PRESERVE'/);
  assert.match(src,/'MODE_WITH_SUFFIX'/);
  assert.match(src,/'STANDARD_MODE'/);
  assert.match(src,/if \(\$metaLines\[0\] -cmatch/);
});
test('V6 bounded metadata accepts normal and single marker formatting, rejects other text',()=>{
  const mode=/^([-dlbcps])[rwxStTs-]{9}(\s|[.+@]\s)/;
  for(const row of ['-rw------- 1 1000 1000 32 sample','drwx------. 2 1000 1000 4096 folder','lrwxrwxrwx+ 1 1000 1000 link']) assert.ok(mode.test(row),row);
  for(const row of ['unknown record','-rw-------x 1 owner something','total 0','-rw- name']) assert.ok(!mode.test(row),row);
});
test('V6 separates PASS of metadata observation from restore and deletion',()=>{
  assert.match(src,/READ_ONLY_SINGLE_ENTRY_METADATA_FORMAT_NO_CONTENT_READ/);
  assert.match(src,/if \(\$report\.status -ne 'PASS'\) \{ exit 2 \}\s*exit 0\s*$/);
  assert.match(src,/privateInput = 'UNKNOWN_PRESERVE'/);
});
