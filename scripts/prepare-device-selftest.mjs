import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Each CI workflow attempt gets a separate test-only Android package, so a
// freshly generated debug signing key cannot conflict with a previously
// installed test APK. No existing test data needs to be uninstalled or cleared.
const EXAMPLE_PACKAGE = 'ru.paseka.journal.device.r123456789a1';
export function validateTestPackageId(value) {
  if (typeof value !== 'string' ||
      !/^ru\.paseka\.journal\.device\.r[0-9]{6,20}a[1-9][0-9]{0,3}$/.test(value)) {
    throw new Error('Unsafe or missing CI-specific Android test package ID');
  }
  return value;
}
export const PACKAGE_ID = validateTestPackageId(
  process.env.PASEKA_TEST_PACKAGE || EXAMPLE_PACKAGE
);
export const APP_NAME = 'Пасека — автоиспытания';
export const TEST_SCRIPT = '<script src="./js/device-selftest.js"></script>';

export function isolatedConfig(config) {
  if (config?.appId !== 'ru.paseka.journal') throw new Error('Refusing to modify unexpected Android app ID');
  return { ...config, appId: PACKAGE_ID, appName: APP_NAME };
}

export function injectTestScript(html) {
  if (!html.includes('</body>') || html.indexOf('</body>') !== html.lastIndexOf('</body>')) {
    throw new Error('Could not identify the exact closing body tag');
  }
  if (html.includes(TEST_SCRIPT)) throw new Error('Test script already injected');
  return html.replace('</body>', TEST_SCRIPT + '\n</body>');
}

export function instrumentMainActivity(source) {
  const pkg = source.match(/^\s*package\s+([a-zA-Z0-9_.]+)\s*;/m);
  if (!pkg || pkg[1] !== PACKAGE_ID || !source.includes('extends BridgeActivity') ||
      !source.includes('new PasekaArchiveDownloadBridge(this)')) {
    throw new Error('Refusing to instrument MainActivity without the production Downloads bridge');
  }
  if (source.includes('PasekaDeviceTestBridge')) throw new Error('Test bridge already injected');
  const marker = '"PasekaArchiveDownload"\n        );';
  if (source.split(marker).length !== 2) {
    throw new Error('Unexpected native Downloads bridge declaration in MainActivity');
  }
  return source.replace(marker,
    marker + '\n        getBridge().getWebView().addJavascriptInterface(' +
    'new PasekaDeviceTestBridge(this), "PasekaDeviceTestBridge");');
}

export function createTestBridgeSource() {
  return "package ru.paseka.journal.device.test;\n\nimport android.app.Activity;\nimport android.content.ContentResolver;\nimport android.database.Cursor;\nimport android.net.Uri;\nimport android.os.Environment;\nimport android.provider.MediaStore;\nimport android.webkit.JavascriptInterface;\nimport java.io.FileOutputStream;\nimport java.io.InputStream;\nimport java.nio.charset.StandardCharsets;\nimport java.security.MessageDigest;\nimport java.util.Locale;\n\npublic final class PasekaDeviceTestBridge {\n  private final Activity activity;\n  private static final String ARCHIVE_MIME = \"application/vnd.paseka.archive\";\n\n  public PasekaDeviceTestBridge(Activity activity) { this.activity = activity; }\n\n  @JavascriptInterface\n  public String runId() {\n    String id = activity.getIntent() == null ? null\n      : activity.getIntent().getStringExtra(\"paseka_run_id\");\n    return id != null && id.matches(\"[a-f0-9]{20}\") ? id : \"\";\n  }\n\n  @JavascriptInterface\n  public String testDownloadName() {\n    String id = runId();\n    if (id.isEmpty()) return \"\";\n    int seed = Integer.parseInt(id.substring(0, 4), 16);\n    return String.format(Locale.US, \"paseka-full-backup-%04d-%02d-%02d.paseka\",\n      2080 + seed % 20, 1 + (seed / 20) % 12, 1 + (seed / 240) % 28);\n  }\n\n  @JavascriptInterface\n  public void report(String json) {\n    String id = runId();\n    if (id.isEmpty() || json == null || json.length() > 100000 ||\n        !json.contains(\"\\\"runId\\\":\\\"\" + id + \"\\\"\")) return;\n    try (FileOutputStream output = activity.openFileOutput(\"paseka-device-report.json\", Activity.MODE_PRIVATE)) {\n      output.write(json.getBytes(StandardCharsets.UTF_8));\n    } catch (Exception exception) {\n      android.util.Log.e(\"PasekaDeviceTest\", \"Unable to save report\", exception);\n    }\n  }\n\n  // TEST-ONLY CLEANUP: only an archive written under a run-specific future\n  // date in Downloads/Пасека, with exactly matching MIME, size and SHA-256,\n  // is eligible for deletion. Never accepts arbitrary user data for deletion.\n  @JavascriptInterface\n  public String verifyAndRemoveTestDownload(String uriText, String sha256, long expectedBytes) {\n    if (runId().isEmpty() || uriText == null || sha256 == null ||\n        !sha256.matches(\"[a-f0-9]{64}\") || expectedBytes < 32 ||\n        expectedBytes > 128L * 1024 * 1024) return \"ERR_INPUT\";\n    String prefix = MediaStore.Downloads.EXTERNAL_CONTENT_URI.toString() + \"/\";\n    if (!uriText.startsWith(prefix)) return \"ERR_URI\";\n    Uri uri = Uri.parse(uriText);\n    ContentResolver resolver = activity.getContentResolver();\n    String[] columns = {\n      MediaStore.MediaColumns.DISPLAY_NAME,\n      MediaStore.MediaColumns.MIME_TYPE,\n      MediaStore.MediaColumns.RELATIVE_PATH\n    };\n    try {\n      try (Cursor cursor = resolver.query(uri, columns, null, null, null)) {\n        if (cursor == null || !cursor.moveToFirst()) return \"ERR_METADATA\";\n        String name = cursor.getString(0);\n        String mime = cursor.getString(1);\n        String folder = cursor.getString(2);\n        if (!testDownloadName().equals(name) || !ARCHIVE_MIME.equals(mime) ||\n            folder == null || !folder.startsWith(Environment.DIRECTORY_DOWNLOADS + \"/Пасека/\")) {\n          return \"ERR_NOT_TEST_ARCHIVE\";\n        }\n      }\n      MessageDigest digest = MessageDigest.getInstance(\"SHA-256\");\n      long total = 0;\n      try (InputStream input = resolver.openInputStream(uri)) {\n        if (input == null) return \"ERR_READ\";\n        byte[] buffer = new byte[8192];\n        int count;\n        while ((count = input.read(buffer)) != -1) {\n          total += count;\n          if (total > expectedBytes) return \"ERR_SIZE\";\n          digest.update(buffer, 0, count);\n        }\n      }\n      if (total != expectedBytes) return \"ERR_SIZE\";\n      byte[] hash = digest.digest();\n      StringBuilder hex = new StringBuilder(hash.length * 2);\n      for (byte value : hash) hex.append(String.format(Locale.US, \"%02x\", value & 0xff));\n      if (!sha256.equals(hex.toString())) return \"ERR_HASH\";\n      return resolver.delete(uri, null, null) == 1 ? \"OK\" : \"ERR_DELETE\";\n    } catch (Exception exception) {\n      android.util.Log.e(\"PasekaDeviceTest\", \"Download verification failed\", exception);\n      return \"ERR_IO\";\n    }\n  }\n}\n".replace(/^package ru\.paseka\.journal\.device\.test;/, 'package ' + PACKAGE_ID + ';');
}
export async function prepareDeviceTest(mode, root = process.cwd()) {
  const configPath = join(root, 'capacitor.config.json');
  if (mode === 'config') {
    // CI must provide a unique namespace for each workflow run+attempt.
    // Never silently reuse a fixed test application ID when packaging an APK.
    if (!process.env.PASEKA_TEST_PACKAGE) {
      throw new Error('PASEKA_TEST_PACKAGE must be set for any physical APK build');
    }
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    await writeFile(configPath, JSON.stringify(isolatedConfig(config), null, 2) + '\n');
    return;
  }
  const configured = JSON.parse(await readFile(configPath, 'utf8'));
  if (configured.appId !== PACKAGE_ID) throw new Error('Device self-test requires isolated package ID');
  if (mode === 'web') {
    const htmlPath = join(root, 'www', 'index.html');
    const html = await readFile(htmlPath, 'utf8');
    await writeFile(htmlPath, injectTestScript(html));
    await copyFile(join(root, 'tests', 'device-selftest.js'), join(root, 'www', 'js', 'device-selftest.js'));
    return;
  }
  if (mode === 'android') {
    const folder = join(root, 'android', 'app', 'src', 'main', 'java');
    const packages = PACKAGE_ID.split('.');
    const activityPath = join(folder, ...packages, 'MainActivity.java');
    const source = await readFile(activityPath, 'utf8');
    await writeFile(activityPath, instrumentMainActivity(source));
    await writeFile(join(folder, ...packages, 'PasekaDeviceTestBridge.java'), createTestBridgeSource());
    return;
  }
  throw new Error('Expected config, web or android mode');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareDeviceTest(process.argv[2]).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
