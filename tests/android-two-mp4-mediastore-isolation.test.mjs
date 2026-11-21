import test from 'node:test';
import assert from 'node:assert/strict';
import {isolatedMediaStoreBridgeJava,TEST_PACKAGE,TEST_FOLDER,TEST_PREFIX} from '../scripts/isolated-android-mediastore-proof-bridge.mjs';

test('test-only MediaStore helper refuses all production and prior test packages',()=>{
  for(const candidate of ['ru.paseka.journal','ru.paseka.journal.archive.test',
    'ru.paseka.journal.archive.proof325','ru.paseka.journal.archive.fileproof328','']) {
    assert.throws(()=>isolatedMediaStoreBridgeJava(candidate),/ISOLATED_PACKAGE_ONLY/);
  }
});
test('MediaStore test helper has exclusive folder, native random filename and no delete/uninstall/clear',()=>{
  const code=isolatedMediaStoreBridgeJava();
  assert.match(code,new RegExp('package '+TEST_PACKAGE.replaceAll('.','\\.')+';'));
  assert.match(code,/Environment\.DIRECTORY_DOWNLOADS \+ "\/PasekaProof329\/"/);
  assert.equal(TEST_FOLDER,'Download/PasekaProof329');
  assert.equal(TEST_PREFIX,'paseka-proof329-');
  assert.match(code,/UUID\.randomUUID\(\)/);
  assert.match(code,/private boolean exists\(/);
  assert.match(code,/MEDIASTORE_COLLISION_QUERY_FAILED/);
  assert.match(code,/ISOLATED_NAME_COLLISION/);
  assert.match(code,/openOutputStream\(uri, "w"\)/);
  assert.match(code,/openInputStream\(uri\)/);
  assert.match(code,/Arrays\.equals\(bytes, readBack\)/);
  assert.match(code,/MEDIASTORE_READBACK_SHA_MISMATCH/);
  assert.match(code,/ONE_SHOT_ALREADY_USED/);
  assert.match(code,/SOURCE_SHA256_MISMATCH/);
  assert.match(code,/IS_PENDING, 1/);
  assert.match(code,/IS_PENDING, 0/);
  assert.doesNotMatch(code,/getContentResolver\(\)\.delete\s*\(/);
  assert.doesNotMatch(code,/\.delete\s*\(/);
  assert.doesNotMatch(code,/\bpm clear\b|\buninstall\b|\/Пасека["/]/);
});
test('native bridge contract does not accept destination path or user media',()=>{
  const code=isolatedMediaStoreBridgeJava();
  assert.match(code,/saveAndReadBack\(String base64, String sha256\)/);
  assert.doesNotMatch(code,/saveAndReadBack\([^)]*displayName/);
  assert.doesNotMatch(code,/saveAndReadBack\([^)]*uri/);
  assert.match(code,/new byte\[\]\{'P','A','S','E','K','A','0','1'\}/);
  assert.match(code,/MAX_FILE = 1048576/);
  assert.match(code,/READBACK_SIZE_LIMIT/);
  assert.match(code,/return "BLOCKED"/);
});
