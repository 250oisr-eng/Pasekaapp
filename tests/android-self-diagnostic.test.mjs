import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {indexedDB as fakeIDB,IDBFactory} from 'fake-indexeddb';
const source=readFileSync(new URL('./fixtures/android-self-diagnostic.js',import.meta.url),'utf8');
const builder=readFileSync(new URL('../scripts/prepare-android-self-diagnostic-apk.mjs',import.meta.url),'utf8');
function moduleWith(idb){
  const root={indexedDB:idb,TextEncoder,Blob,Uint8Array,console};
  root.globalThis=root;
  vm.runInNewContext(source,root);
  return root.PasekaSelfDiagnostic;
}
test('two synthetic blobs round-trip after close/reopen; never claim media recognition or cleanup',async()=>{
  const diag=moduleWith(new IDBFactory());
  const result=await diag.run(new IDBFactory()); // independent empty diagnostic database
  assert.equal(result.status,'PASS');
  assert.equal(result.syntheticRecords,2);
  assert.equal(result.recognition,'NOT_TESTED');
  assert.equal(result.cleanup,'NOT_TESTED');
  assert.equal(result.videoDecode,'NOT_TESTED');
  assert.equal(result.productionAccess,'NOT_ATTEMPTED');
});
test('second invocation cannot overwrite test evidence',async()=>{
  const idb=new IDBFactory(),diag=moduleWith(idb);
  assert.equal((await diag.run(idb)).status,'PASS');
  assert.equal((await diag.run(idb)).reason,'DIAGNOSTIC_DB_ALREADY_EXISTS');
});
test('inventory API unavailable blocks before opening a database',async()=>{
  let opened=false;const idb={open(){opened=true;throw Error('unsafe')}},
    diag=moduleWith(idb);
  assert.equal((await diag.run(idb)).reason,'IDB_DATABASE_INVENTORY_UNAVAILABLE');
  assert.equal(opened,false);
});
test('source is one-way, isolated and without delete, live media or network access',()=>{
  for(const unsafe of [/deleteDatabase\s*\(/,/\.delete\s*\(/,/\.clear\s*\(/,/fetch\s*\(/,/XMLHttpRequest/,/MediaStore/,/getUserMedia/,/entrance_media/,/\bS\.records\b/])
    assert.doesNotMatch(source,unsafe);
  assert.match(source,/DIAGNOSTIC_DB_ALREADY_EXISTS/);
  assert.match(source,/\{once:true\}/);
  assert.match(builder,/PASEKA_SELF_DIAG_BUILD/);
  assert.match(builder,/ORIGINAL_APP_ID_REQUIRED/);
  assert.match(builder,/ru\.paseka\.journal\.diagnostic\.selftest/);
});
