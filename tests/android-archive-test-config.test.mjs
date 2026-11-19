import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARCHIVE_TEST_APP_ID,
  ARCHIVE_TEST_APP_NAME,
  createArchiveTestConfig
} from '../scripts/prepare-archive-test-config.mjs';

test('archive test configuration uses a unique package and label without mutating production config', () => {
  const production = {
    appId: 'ru.paseka.journal',
    appName: 'Пасека',
    webDir: 'www',
    bundledWebRuntime: false,
    android: { allowMixedContent: false }
  };
  const isolated = createArchiveTestConfig(production);
  assert.equal(ARCHIVE_TEST_APP_ID, 'ru.paseka.journal.archive.test4');
  assert.equal(ARCHIVE_TEST_APP_NAME, 'Пасека — архив тест 4');
  assert.equal(isolated.appId, ARCHIVE_TEST_APP_ID);
  assert.equal(isolated.appName, ARCHIVE_TEST_APP_NAME);
  assert.equal(isolated.webDir, production.webDir);
  assert.deepEqual(isolated.android, production.android);
  assert.equal(production.appId, 'ru.paseka.journal');
  assert.equal(production.appName, 'Пасека');
});

test('archive test configuration fails closed for an unexpected package ID', () => {
  assert.throws(
    () => createArchiveTestConfig({ appId: 'ru.paseka.journal.test', appName: 'Пасека — тест' }),
    /unexpected application ID/
  );
});

test('archive test configuration rejects invalid input', () => {
  assert.throws(() => createArchiveTestConfig(null), TypeError);
  assert.throws(() => createArchiveTestConfig([]), TypeError);
});
