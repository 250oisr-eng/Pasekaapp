import test from 'node:test';
import assert from 'node:assert/strict';
import { createIsolatedTestConfig, assertIsolatedTestApplicationId, PRODUCTION_APP_ID, TEST_APP_ID } from '../scripts/prepare-android-test-config.mjs';

test('test config gets a distinct Android application id and preserves other Capacitor settings', () => {
  const production = { appId: PRODUCTION_APP_ID, appName: 'Пасека', webDir: 'www', android: { allowMixedContent: false } };
  const testConfig = createIsolatedTestConfig(production);
  assert.equal(testConfig.appId, TEST_APP_ID);
  assert.notEqual(testConfig.appId, production.appId);
  assert.equal(testConfig.appName, 'Пасека — тест 2');
  assert.equal(testConfig.webDir, production.webDir);
  assert.deepEqual(testConfig.android, production.android);
  assert.equal(production.appId, PRODUCTION_APP_ID);
});

test('test config refuses an unknown or already modified app id', () => {
  assert.throws(() => createIsolatedTestConfig({ appId: 'com.example.other' }), /Unexpected production appId/);
  assert.throws(() => createIsolatedTestConfig({ appId: TEST_APP_ID }), /Unexpected production appId/);
});

test('generated Gradle project must use only the isolated test application id', () => {
  assert.equal(assertIsolatedTestApplicationId('defaultConfig { applicationId "ru.paseka.journal.test.persistence2" }'), true);
  assert.throws(() => assertIsolatedTestApplicationId('defaultConfig { applicationId "ru.paseka.journal" }'), /not the isolated test id/);
});
