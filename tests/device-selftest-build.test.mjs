import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PACKAGE_ID, TEST_SCRIPT, isolatedConfig, injectTestScript, instrumentMainActivity
} from '../scripts/prepare-device-selftest.mjs';

test('device test configurator refuses unknown or already isolated production app ids', () => {
  assert.throws(() => isolatedConfig({ appId: 'unknown.package' }), /Refusing/);
  assert.throws(() => isolatedConfig({ appId: PACKAGE_ID }), /Refusing/);
  const original = { appId: 'ru.paseka.journal', appName: 'Пасека', webDir: 'www' };
  const isolated = isolatedConfig(original);
  assert.equal(original.appId, 'ru.paseka.journal');
  assert.equal(isolated.appId, PACKAGE_ID);
  assert.equal(isolated.appName, 'Пасека — автоиспытания');
  assert.equal(isolated.webDir, 'www');
});

test('device runner is injected only once after application bootstrap script', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const output = injectTestScript(html);
  assert.equal(html.includes(TEST_SCRIPT), false, 'production HTML must never embed the test harness');
  assert.equal(output.split(TEST_SCRIPT).length - 1, 1);
  assert.ok(output.lastIndexOf(TEST_SCRIPT) > html.lastIndexOf('</script>'));
  assert.throws(() => injectTestScript(output), /already injected/);
  assert.throws(() => injectTestScript('<body></body></body>'), /exact closing body/);
});

test('device reporter Java bridge can only instrument the expected isolated package', () => {
  const generated = 'package ru.paseka.journal.device.test;\nimport com.getcapacitor.BridgeActivity;\npublic class MainActivity extends BridgeActivity {}';
  const java = instrumentMainActivity(generated);
  assert.match(java, /getBridge\(\)\.getWebView\(\)\.addJavascriptInterface/);
  assert.match(java, /paseka-device-report\.json/);
  assert.match(java, /getIntent\(\)\.getStringExtra\("paseka_run_id"\)/);
  assert.match(java, /runId\(\)/);
  assert.throws(() => instrumentMainActivity(generated.replace(
    'ru.paseka.journal.device.test', 'ru.paseka.journal')), /Refusing/);
});

test('device test runner has valid JavaScript and uses only isolated IndexedDB names', async () => {
  const source = await readFile(new URL('./device-selftest.js', import.meta.url), 'utf8');
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /paseka-device-selftest-/);
  assert.match(source, /archive_revision_guard_preserves_new_treatment/);
  assert.match(source, /real_android_restart_persists_indexeddb/);
  assert.match(source, /S = saved/);
  assert.doesNotMatch(source, /indexedDB\.deleteDatabase\s*\(/);
});

test('Windows launcher cannot clear packages or use the production application ID', async () => {
  const ps = await readFile(new URL('../scripts/windows/Run-Paseka-Tests.ps1', import.meta.url), 'utf8');
  assert.match(ps, /\$Package = 'ru\.paseka\.journal\.device\.test'/);
  assert.match(ps, /Get-FileHash.*SHA256/);
  assert.match(ps, /run-as \$Package cat files\/paseka-device-report\.json/);
  assert.match(ps, /force-stop/);
  assert.doesNotMatch(ps, /pm clear/);
  assert.doesNotMatch(ps, /uninstall/);
});
