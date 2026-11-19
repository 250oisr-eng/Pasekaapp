import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PACKAGE_ID = 'ru.paseka.journal.device.test';
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
  const match = source.match(/^\s*package\s+([a-zA-Z0-9_.]+)\s*;/m);
  if (!match || match[1] !== PACKAGE_ID || !source.includes('extends BridgeActivity')) {
    throw new Error('Refusing to instrument unexpected MainActivity');
  }
  // The bridge exists ONLY in the isolated, non-production debug package.
  return `package ${PACKAGE_ID};

import android.os.Bundle;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    if (getBridge() == null || getBridge().getWebView() == null) {
      throw new IllegalStateException("Capacitor WebView is unavailable for device self-test");
    }
    getBridge().getWebView().addJavascriptInterface(new DeviceSelfTestBridge(), "PasekaDeviceTestBridge");
  }

  public final class DeviceSelfTestBridge {
    @JavascriptInterface
    public String runId() {
      String id = getIntent() == null ? null : getIntent().getStringExtra("paseka_run_id");
      return id != null && id.matches("[A-Za-z0-9-]{1,64}") ? id : "";
    }

    @JavascriptInterface
    public void report(String json) {
      String id = runId();
      if (id.isEmpty() || json == null || json.length() > 100000 ||
          !json.contains("\\\"runId\\\":\\\"" + id + "\\\"")) return;
      try (FileOutputStream output = openFileOutput("paseka-device-report.json", MODE_PRIVATE)) {
        output.write(json.getBytes(StandardCharsets.UTF_8));
      } catch (Exception exception) {
        android.util.Log.e("PasekaDeviceTest", "Unable to save test report", exception);
      }
    }
  }
}
`;
}

export async function prepareDeviceTest(mode, root = process.cwd()) {
  const configPath = join(root, 'capacitor.config.json');
  if (mode === 'config') {
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
