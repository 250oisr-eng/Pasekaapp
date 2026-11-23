import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const src=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html=src('index.html'),shell=src('sw.js');
const modules=[
 'js/sectional-season-ledger-v2.js',
 'js/sectional-season-evidence-v2.js',
 'js/sectional-season-operation-rules-v2.js',
 'js/sectional-season-dual-read-v2.js',
 'js/sectional-season-transaction-v2.js',
 'js/sectional-season-provenance-v2.js',
 'js/sectional-season-physical-executor-v2.js',
 'js/sectional-season-body-manifest-v2.js',
 'js/sectional-season-runtime-v2.js',
 'js/sectional-season-lifecycle-v2.js',
 'js/sectional-season-browser-commit-v2.js',
 'js/sectional-season-operations-wizard-v2.js',
 'js/sectional-op08-honey.js',
 'js/sectional-op09-entrances.js'
];
test('P1 v2 persistence and physical modules are actually shipped to offline Android shell',()=>{
 for(const file of modules){
  assert.ok(existsSync(new URL('../'+file,import.meta.url)),file+' missing');
  assert.ok(html.includes('<script src="./'+file+'"></script>'),file+' not in Android/PWA document');
  assert.ok(shell.includes("'./"+file+"'"),file+' not in SW offline cache');
 }
 const loaded=file=>html.indexOf('<script src="./'+file+'"></script>');
 assert.ok(loaded('js/sectional-season-transaction-v2.js')<loaded('js/sectional-season-runtime-v2.js'));
 assert.ok(loaded('js/sectional-season-runtime-v2.js')<loaded('js/sectional-season-lifecycle-v2.js'));
 assert.ok(loaded('js/sectional-season-lifecycle-v2.js')<loaded('js/sectional-season-browser-commit-v2.js'));
});
test('pre-phone UI exposes only physical preview and never turns a checkbox into DONE or CAS',()=>{
 const wizard=src('js/sectional-season-operations-wizard-v2.js');
 assert.match(wizard,/data-season-preview/);
 assert.match(wizard,/ТОЛЬКО ПРОСМОТР/);
 assert.doesNotMatch(wizard,/\.status\s*=\s*['"]DONE['"]/);
 assert.doesNotMatch(wizard,/data-season-save|data-season-force-commit/);
 assert.match(src('js/sectional-season-runtime-v2.js'),/SECOND_DEVICE_VERIFIED/);
 assert.match(src('js/sectional-season-lifecycle-v2.js'),/SECOND_DEVICE_VERIFIED/);
});
test('PASEKA02 original media auto cleanup stays outside this implementation',()=>{
 assert.doesNotMatch(src('js/sectional-season-runtime-v2.js'),/\bdeleteDatabase\b|\.delete\(['"]entrance_media/);
 assert.doesNotMatch(src('js/sectional-season-lifecycle-v2.js'),/\bdeleteDatabase\b|\.delete\(['"]entrance_media/);
});
