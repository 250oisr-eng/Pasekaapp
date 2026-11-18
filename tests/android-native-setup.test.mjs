import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareAndroidProject } from '../scripts/prepare-android.mjs';

test('generated Android project receives Vosk plugin, permissions and registration idempotently', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'paseka-android-native-'));
  const projectDir = path.join(root, 'android');
  const appRoot = path.join(projectDir, 'app');
  const packageRoot = path.join(appRoot, 'src', 'main', 'java', 'ru', 'paseka', 'journal');
  const pluginSourcePath = path.join(root, 'PasekaOfflineSpeechPlugin.java');
  await mkdir(packageRoot, { recursive: true });
  await writeFile(path.join(appRoot, 'build.gradle'), 'plugins { id \'com.android.application\' }\ndependencies {\n    implementation project(\':capacitor-android\')\n}\n');
  await writeFile(path.join(appRoot, 'src', 'main', 'AndroidManifest.xml'), '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <application android:label="Paseka"></application>\n</manifest>\n');
  await writeFile(path.join(packageRoot, 'MainActivity.java'), 'package ru.paseka.journal;\n\nimport com.getcapacitor.BridgeActivity;\n\npublic class MainActivity extends BridgeActivity {}\n');
  await writeFile(pluginSourcePath, 'package ru.paseka.journal.plugins;\npublic class PasekaOfflineSpeechPlugin {}\n');

  try {
    const first = await prepareAndroidProject({ projectDir, appId: 'ru.paseka.journal', pluginSourcePath });
    assert.equal(first.voskDependencyAdded, true);
    assert.equal(first.jnaDependencyAdded, true);
    assert.equal(first.microphonePermission, true);
    assert.equal(first.networkStatePermission, true);
    assert.equal(first.internetPermission, true);
    assert.equal(first.pluginRegistered, true);

    const gradle = await readFile(path.join(appRoot, 'build.gradle'), 'utf8');
    const manifest = await readFile(path.join(appRoot, 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    const activity = await readFile(path.join(packageRoot, 'MainActivity.java'), 'utf8');
    const plugin = await readFile(path.join(packageRoot, 'plugins', 'PasekaOfflineSpeechPlugin.java'), 'utf8');
    assert.equal((gradle.match(/com\.alphacephei:vosk-android:0\.3\.75@aar/g) || []).length, 1);
    assert.equal((gradle.match(/net\.java\.dev\.jna:jna:5\.18\.1@aar/g) || []).length, 1);
    assert.equal((manifest.match(/android\.permission\.RECORD_AUDIO/g) || []).length, 1);
    assert.equal((manifest.match(/android\.permission\.ACCESS_NETWORK_STATE/g) || []).length, 1);
    assert.equal((manifest.match(/android\.permission\.INTERNET/g) || []).length, 1);
    assert.equal((activity.match(/registerPlugin\(PasekaOfflineSpeechPlugin\.class\)/g) || []).length, 1);
    assert.match(activity, /import ru\.paseka\.journal\.plugins\.PasekaOfflineSpeechPlugin;/);
    assert.match(plugin, /package ru\.paseka\.journal\.plugins;/);

    await prepareAndroidProject({ projectDir, appId: 'ru.paseka.journal', pluginSourcePath });
    const gradleAfter = await readFile(path.join(appRoot, 'build.gradle'), 'utf8');
    const manifestAfter = await readFile(path.join(appRoot, 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    const activityAfter = await readFile(path.join(packageRoot, 'MainActivity.java'), 'utf8');
    assert.equal(gradleAfter, gradle);
    assert.equal(manifestAfter, manifest);
    assert.equal(activityAfter, activity);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Android setup refuses an unexpected app id before touching generated files', async () => {
  await assert.rejects(
    prepareAndroidProject({ projectDir: '/tmp/does-not-matter', appId: 'invalid-app-id', pluginSourcePath: '/tmp/no-plugin.java' }),
    /Invalid Capacitor appId/
  );
});
