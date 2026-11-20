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

test('Windows ADB selection has opt-in private Wi-Fi, USB priority and native PowerShell regression', async () => {
  const ps = await readFile(new URL('../scripts/windows/Run-Paseka-Tests.ps1', import.meta.url), 'utf8');
  const yaml = await readFile(new URL('../.github/workflows/android-device-selftest.yml', import.meta.url), 'utf8');
  const regression = await readFile(new URL('./windows-adb-selection.ps1', import.meta.url), 'utf8');
  assert.match(ps, /function Test-PrivateWifiEndpoint/);
  assert.match(ps, /function Find-TestDevice/);
  assert.match(ps, /PASEKA_ADB_WIFI_ENDPOINT/);
  assert.match(ps, /\$usb\.Count -eq 1/);
  assert.match(ps, /connected -ccontains \$WifiEndpoint/);
  assert.doesNotMatch(ps, /& \$Adb tcpip|Invoke-ADB[^\n]*tcpip/);
  assert.match(regression, /two-usb/);
  assert.match(regression, /Find-TestDevice ''/);
  assert.match(yaml, /windows-adb-selection\.ps1/);
});

test('local scheduled Android runner is opt-in, gated and never installs a test APK', async () => {
  const script = await readFile(new URL('../scripts/windows/Run-Paseka-Tests.ps1', import.meta.url), 'utf8');
  const wrapper = await readFile(new URL('../scripts/windows/Run-Local-Scheduled.ps1', import.meta.url), 'utf8');
  const registration = await readFile(new URL('../scripts/windows/Register-Local-Scheduled.ps1', import.meta.url), 'utf8');
  const mockTest = await readFile(new URL('./windows-local-schedule.ps1', import.meta.url), 'utf8');
  const workflow = await readFile(new URL('../.github/workflows/android-device-selftest.yml', import.meta.url), 'utf8');
  assert.match(script, /PASEKA_SCHEDULED_NO_INSTALL/);
  assert.match(script, /if \(\$env:PASEKA_SCHEDULED_NO_INSTALL -eq '1'\)/);
  assert.match(wrapper, /param\(\[switch\]\$Run\)/);
  assert.match(wrapper, /Get-FileHash/);
  assert.match(wrapper, /report\.final\.pass -eq \$true/);
  assert.match(wrapper, /@\(\$report\.final\.checks\)\.Count -eq 9/);
  assert.match(wrapper, /PASEKA_SCHEDULED_NO_INSTALL = '1'/);
  assert.match(wrapper, /PASEKA_ADB_WIFI_ENDPOINT = ''/);
  assert.doesNotMatch(wrapper, /adb install|adb tcpip|uninstall|pm clear|Invoke-WebRequest|Start-BitsTransfer/);
  assert.match(registration, /\[switch\]\$Install/);
  assert.match(registration, /-LogonType Interactive -RunLevel Limited/);
  assert.match(registration, /Task already exists/);
  assert.match(mockTest, /hash mismatch|APK hash mismatch/);
  assert.match(workflow, /windows-local-schedule\.ps1/);
  assert.match(workflow, /Run-Local-Scheduled\.ps1 scripts\/windows\/Register-Local-Scheduled\.ps1/);
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
  assert.match(reportBridge, /countOwnTestDownloadRows/);
  assert.match(reportBridge, /MediaStore\.MediaColumns\.DISPLAY_NAME \+ "=\?"/);
  // A real OnePlus report found a rejected MediaStore file. Diagnose the exact
  // ownership constraint without weakening or bypassing verified deletion.
  assert.match(reportBridge, /ERR_TEST_NAME/);
  assert.match(reportBridge, /ERR_TEST_MIME/);
  assert.match(reportBridge, /ERR_TEST_FOLDER/);
  // Some Android MediaStore versions compute unknown .paseka MIME as generic
  // binary. Do not allow an arbitrary value; require test APK ownership.
  assert.match(reportBridge, /application\/octet-stream/);
  assert.match(reportBridge, /MediaStore\.MediaColumns\.OWNER_PACKAGE_NAME/);
  assert.match(reportBridge, /activity\.getPackageName\(\)\.equals\(owner\)/);
  assert.match(reportBridge, /ERR_TEST_OWNER/);
  assert.doesNotMatch(reportBridge, /ERR_NOT_TEST_ARCHIVE/);
  const nameGuard = reportBridge.indexOf('ERR_TEST_NAME');
  const mimeGuard = reportBridge.indexOf('ERR_TEST_MIME');
  const folderGuard = reportBridge.indexOf('ERR_TEST_FOLDER');
  const ownerGuard = reportBridge.indexOf('ERR_TEST_OWNER');
  const deleteCall = reportBridge.indexOf('resolver.delete(uri, null, null)');
  assert.ok(nameGuard > 0 && nameGuard < mimeGuard && mimeGuard < folderGuard && folderGuard < ownerGuard && ownerGuard < deleteCall,
    'All rejected MediaStore metadata must be checked before any test-only cleanup');
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
  assert.match(source, /native_downloads_reject_incomplete_and_oversize/);
  assert.match(source, /countOwnTestDownloadRows/);
  assert.match(source, /Truncated archive was published/);
  assert.match(source, /Oversized block was accepted/);
  assert.match(source, /real_android_restart_persists_indexeddb/);
  assert.match(source, /S = saved/);
  assert.doesNotMatch(source, /indexedDB\.deleteDatabase\s*\(/);
});

test('offline mode is explicit, read-only, and limited to isolated APK', async () => {
  const generator = await readFile(new URL('../scripts/prepare-device-selftest.mjs', import.meta.url), 'utf8');
  const java = createTestBridgeSource();
  const script = await readFile(new URL('./device-selftest.js', import.meta.url), 'utf8');
  const ps = await readFile(new URL('../scripts/windows/Run-Paseka-Tests.ps1', import.meta.url), 'utf8');
  const batch = await readFile(new URL('../scripts/windows/START-OFFLINE-TESTS.cmd', import.meta.url), 'utf8');
  const yaml = await readFile(new URL('../.github/workflows/android-device-selftest.yml', import.meta.url), 'utf8');
  assert.match(generator, /android.permission.ACCESS_NETWORK_STATE/);
  assert.match(java, /offlineRequested/);
  assert.match(java, /isNetworkOffline/);
  assert.match(java, /NET_CAPABILITY_INTERNET/);
  assert.doesNotMatch(java, /setWifiEnabled|setMobileDataEnabled|CHANGE_NETWORK_STATE/);
  assert.match(script, /offline_network_disabled_before_archive/);
  assert.match(script, /offline_network_disabled_after_restart/);
  assert.match(script, /manual-offline/);
  assert.match(ps, /^\uFEFFparam\(\[switch\]\$Offline, \[string\]\$AgentRunId = ''\)/);
  assert.equal(ps.split("'--ez', 'paseka_require_offline'").length - 1, 2);
  assert.match(ps, /Count -ne 11/);
  assert.match(batch, /-Offline/);
  assert.match(yaml, /START-OFFLINE-TESTS[.]cmd/);
});

test('manual local agent is packaged only in isolated kit and never starts a schedule', async () => {
  const yaml = await readFile(new URL('../.github/workflows/android-device-selftest.yml', import.meta.url), 'utf8');
  const runner = await readFile(new URL('../scripts/windows/Invoke-Paseka-Test-Agent.ps1', import.meta.url), 'utf8');
  const uploader = await readFile(new URL('../scripts/windows/Publish-Paseka-Test-Report.ps1', import.meta.url), 'utf8');
  const testRunner = await readFile(new URL('../scripts/windows/Run-Paseka-Tests.ps1', import.meta.url), 'utf8');
  const mock = await readFile(new URL('./windows-local-agent.ps1', import.meta.url), 'utf8');
  assert.match(yaml, /device-build-sha\.txt/);
  assert.match(yaml, /windows-local-agent\.ps1/);
  assert.match(yaml, /Publish-Paseka-Test-Report\.ps1/);
  assert.match(testRunner, /AgentRunId/);
  assert.match(runner, /Publish-Paseka-Test-Report/);
  assert.match(uploader, /ConvertFrom-SecureString/);
  assert.match(uploader, /ZeroFreeBSTR/);
  assert.match(uploader, /\$IssueNumber = 198/);
  assert.match(uploader, /paseka-device-test\.sha256/);
  assert.match(uploader, /Test-only Android/);
  assert.match(mock, /PRIVATE-APIARY-DATA-NEVER-SEND/);
  assert.doesNotMatch(runner, /Register-ScheduledTask|Invoke-Expression|pm clear|uninstall/);
  assert.doesNotMatch(uploader, /Start-Process|Invoke-Expression|Register-ScheduledTask|Upload-File|multipart\/form-data/);
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

test('physical Android screenshot regression: isolated panel wraps long check IDs and does not truncate hive details', async () => {
  const script = await readFile(new URL('./device-selftest.js', import.meta.url), 'utf8');
  assert.match(script, /selftest-results\{min-width:0;max-width:100%;overflow-wrap:anywhere/);
  assert.match(script, /selftest-check\{min-width:0;max-width:100%;white-space:normal;overflow-wrap:anywhere/);
  assert.match(script, /selftest-cards \.hive-row-main \.muted\{white-space:normal;overflow:visible;text-overflow:clip/);
  assert.match(script, /previewHtml = '<div class="selftest-cards">/);
  assert.match(script, /node\.style\.overflowX = 'hidden'/);
  assert.doesNotThrow(() => new Function(script), 'isolated JS must parse on device');
});

test('real hive-card details are not clipped on phone but desktop truncation remains available', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /@media\(max-width:600px\)\{\s*\.hive-row\{align-items:flex-start\}/);
  assert.match(html, /\.hive-row-main\{flex:1 1 100%;overflow:visible\}/);
  assert.match(html, /\.hive-mini-status \.muted,\.hive-row-main \.hive-treatment-summary\{/);
  assert.match(html, /white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere/);
  assert.match(html, /\.hive-row-main \.muted\{white-space:nowrap;overflow:hidden;text-overflow:ellipsis\}/);
  assert.match(html, /hive-treatment-summary/);
  assert.match(html, /Последняя обработка:/);
});
