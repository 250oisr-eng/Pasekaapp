import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  makeQaConfig, assertQaGradle, writeWorkspaceQaConfig, PRODUCTION_ID, QA_ID, QA_NAME
} from '../scripts/prepare-android-qa-config.mjs';

const original = Object.freeze({
  appId: PRODUCTION_ID, appName: 'Пасека', webDir: 'www',
  android: { allowMixedContent: false }
});

test('oneplus QA package differs from production and retains secure local WebView', () => {
  const qa = makeQaConfig(original);
  assert.equal(qa.appId, QA_ID);
  assert.equal(qa.appName, QA_NAME);
  assert.equal(qa.webDir, 'www');
  assert.equal(qa.android.allowMixedContent, false);
  assert.equal(original.appId, PRODUCTION_ID);
});

test('QA config fails closed on unknown appId, unsafe WebView or remote server', () => {
  for (const bad of [
    null, [], {}, { ...original, appId: QA_ID },
    { ...original, appId: 'ru.paseka.mismatch' },
    { ...original, webDir: 'remote' },
    { ...original, server: { url: 'https://example.test' } },
    { ...original, server: { allowNavigation: ['*'] } },
    { ...original, android: { allowMixedContent: true } }
  ]) assert.throws(() => makeQaConfig(bad), /QA_BLOCKED/);
});

test('exactly one generated Android applicationId must be QA, never production', () => {
  assert.equal(assertQaGradle('defaultConfig { applicationId "ru.paseka.journal.qa.ux20261127" }'), true);
  assert.throws(() => assertQaGradle('applicationId "ru.paseka.journal"'), /QA_BLOCKED/);
  assert.throws(() => assertQaGradle('applicationId "ru.paseka.journal.qa.ux20261127"\napplicationId "ru.paseka.journal.qa.ux20261127"'), /QA_BLOCKED/);
  assert.throws(() => assertQaGradle('applicationId "ru.paseka.journal.qa.ux20261127.debug"'), /QA_BLOCKED/);
  assert.throws(() => assertQaGradle(''), /QA_BLOCKED/);
});

test('workspace config switch writes only the expressly provided temporary file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'paseka-qa-'));
  try {
    const file = join(dir, 'capacitor.config.json');
    await writeFile(file, JSON.stringify(original));
    const result = await writeWorkspaceQaConfig(file);
    assert.equal(result.appId, QA_ID);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).appId, QA_ID);
    assert.throws(() => makeQaConfig(result), /QA_BLOCKED/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
