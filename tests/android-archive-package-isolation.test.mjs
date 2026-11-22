import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const paths={
 build:'../scripts/prepare-android-archive-preflight.mjs',
 report:'../diagnostics/archive-preflight/copy-report.js',
 runner:'../diagnostics/archive-preflight/runner.js',
 workflow:'../.github/workflows/android-archive-preflight-apk.yml',
 tests:'./android-archive-share-report.test.mjs'
};
const current='ru.paseka.journal.diagnostic.archivecopyv2';
const legacy='ru.paseka.journal.diagnostic.archivepreflight';
test('new test-only package ID is consistently pinned across build, runner, copy, tests and APK verification',async()=>{
 for(const [label,path] of Object.entries(paths)){
  const contents=await readFile(new URL(path,import.meta.url),'utf8');
  assert.ok(contents.includes(current),label+' lacks isolated package');
  assert.ok(!contents.includes(legacy),label+' still references original signed app');
 }
});
test('diagnostic package is distinct from production and previous signed test APK',()=>{
 assert.notEqual(current,legacy);
 assert.notEqual(current,'ru.paseka.journal');
});
