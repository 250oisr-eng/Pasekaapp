import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PACKAGE_ID, TEST_SCRIPT, isolatedConfig, injectTestScript, instrumentMainActivity, createTestBridgeSource, validateTestPackageId
} from '../scripts/prepare-device-selftest.mjs';

test('per-workflow Android test package names are isolated and validated', () => {
  assert.equal(validateTestPackageId('ru.paseka.journal.device.r44511116464a1'),
    'ru.paseka.journal.device.r44511116464a1');
  assert.equal(validateTestPackageId('ru.paseka.journal.device.r44511116464a2'),
    'ru.paseka.journal.device.r44511116464a2');
  for (const unsafe of [
    'ru.paseka.journal', 'ru.paseka.journal.device.test',
    'ru.paseka.journal.device.r44511116464a0',
    'ru.paseka.journal.device.r44511116464a1;rm',
    'com.other.app', '../test', '', null
  ]) {
    assert.throws(() => validateTestPackageId(unsafe), /Unsafe or missing/);
  }
});

test('workflow packages the build-specific package manifest beside the APK', async () => {
  const yaml = await readFile(new URL('../.github/workflows/android-device-selftest.yml', import.meta.url), 'utf8');
  assert.match(yaml, /PASEKA_TEST_PACKAGE:/);
  assert.match(yaml, /github\.run_id/);
  assert.match(yaml, /github\.run_attempt/);
  assert.match(yaml, /device-package\.txt/);
  assert.match(yaml, /c\.appId!==process\.env\.PASEKA_TEST_PACKAGE/);
});

test('Windows CI explicitly tests native stderr and retry on PowerShell 5.1', async () => {
  const yaml = await readFile(new URL('../.github/workflows/android-device-selftest.yml', import.meta.url), 'utf8');
  const testScript = await readFile(new URL('./windows-report-polling.ps1', import.meta.url), 'utf8');
  assert.match(yaml, /Simulate native ADB missing report then retry/);
  assert.match(yaml, /windows-report-polling\.ps1/);
  assert.match(testScript, /fake-adb\.cmd/);
  assert.match(testScript, /No such file or directory/);
  assert.match(testScript, /Wait-Report/);
  assert.doesNotMatch(testScript, /adb\.exe|pm clear|uninstall/);
});

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

test('device bridge preserves production archive Downloads bridge in isolated MainActivity', () => {
  const generated = 'package ' + PACKAGE_ID + ';\n' +
    'public class MainActivity extends BridgeActivity {\n' +
    '  void onCreate() { getBridge().getWebView().addJavascriptInterface(' +
    'new PasekaArchiveDownloadBridge(this),\n' +
    '            "PasekaArchiveDownload"\n        ); }\n}';
  const java = instrumentMainActivity(generated);
  assert.match(java, /new PasekaArchiveDownloadBridge\(this\)/);
  assert.match(java, /new PasekaDeviceTestBridge\(this\)/);
  assert.match(java, /PasekaArchiveDownload/);
  assert.match(java, /PasekaDeviceTestBridge/);
  const reportBridge = createTestBridgeSource();
  assert.ok(reportBridge.startsWith('package ' + PACKAGE_ID + ';'), 'native report bridge must use the same test-only package');
  assert.match(reportBridge, /paseka-device-report\.json/);
  assert.match(reportBridge, /verifyAndRemoveTestDownload/);
  assert.match(reportBridge, /MessageDigest\.getInstance\("SHA-256"\)/);
  assert.match(reportBridge, /MediaStore\.Downloads\.EXTERNAL_CONTENT_URI/);
  assert.match(reportBridge, /return resolver\.delete\(uri, null, null\) == 1/);
  assert.throws(() => instrumentMainActivity(generated.replace(
    PACKAGE_ID, 'ru.paseka.journal')), /Refusing/);
  assert.throws(() => instrumentMainActivity(generated.replace(
    'new PasekaArchiveDownloadBridge(this)', 'new SomethingElse(this)')), /Refusing/);
  assert.throws(() => instrumentMainActivity(java), /already injected/);
});

test('device test runner has valid JavaScript and uses only isolated IndexedDB names', async () => {
  const source = await readFile(new URL('./device-selftest.js', import.meta.url), 'utf8');
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /paseka-device-selftest-/);
  assert.match(source, /archive_revision_guard_preserves_new_treatment/);
  assert.match(source, /native_downloads_archive_hash_and_cleanup/);
  assert.match(source, /real_android_restart_persists_indexeddb/);
  assert.match(source, /S = saved/);
  assert.doesNotMatch(source, /indexedDB\.deleteDatabase\s*\(/);
});

test('Windows launcher cannot clear packages or use the production application ID', async () => {
  const ps = await readFile(new URL('../scripts/windows/Run-Paseka-Tests.ps1', import.meta.url), 'utf8');
  assert.match(ps, /device-package\.txt/);
  assert.match(ps, /ru\\\.paseka\\\.journal\\\.device\\\.r/);
  assert.match(ps, /\$Package = \(Get-Content/);
  assert.doesNotMatch(ps, /\$Package = 'ru\.paseka\.journal'/);
  assert.ok(ps.startsWith('\uFEFF'), 'Windows PowerShell 5.1 must receive UTF-8 BOM');
  assert.equal(ps.split('function Invoke-ADB').length - 1, 1, 'launcher must not contain a duplicated script');
  assert.equal(ps.split("$Adb = Join-Path").length - 1, 1, 'ADB initialization must occur once');
  assert.equal(ps.split("$PackagePath = Join-Path").length - 1, 1, 'package selection must occur once');
  assert.match(ps, /\[0-9\]\{0,3\}\$'\) \{/);
  assert.match(ps, /native stderr as an ErrorRecord/);
  assert.match(ps, /\$ErrorActionPreference = 'Continue'/);
  assert.match(ps, /\$LASTEXITCODE -ne 0 -or !\$lines/);
  assert.match(ps, /Capture-TestScreen -Serial \$Serial -Label 'failure'/);
  assert.match(ps, /Get-FileHash.*SHA256/);
  assert.match(ps, /run-as \$Package cat files\/paseka-device-report\.json/);
  assert.match(ps, /force-stop/);
  assert.doesNotMatch(ps, /pm clear/);
  assert.doesNotMatch(ps, /uninstall/);
});
