import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function prepareAndroidProject({
  projectDir = path.join(root, 'android'),
  appId = null,
  pluginSourcePath = path.join(root, 'android-native', 'PasekaOfflineSpeechPlugin.java')
} = {}) {
  if (!appId) {
    const config = JSON.parse(await readFile(path.join(root, 'capacitor.config.json'), 'utf8'));
    appId = config.appId;
  }
  if (typeof appId !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*(\\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(appId)) {
    throw new Error('Invalid Capacitor appId; refusing to patch an unknown Android package');
  }

  const appRoot = path.join(projectDir, 'app');
  const gradlePath = path.join(appRoot, 'build.gradle');
  const manifestPath = path.join(appRoot, 'src', 'main', 'AndroidManifest.xml');
  const packagePath = appId.replaceAll('.', path.sep);
  const sourceRoot = path.join(appRoot, 'src', 'main', 'java', packagePath);
  const mainActivityPath = path.join(sourceRoot, 'MainActivity.java');
  const pluginDirectory = path.join(sourceRoot, 'plugins');
  const pluginPath = path.join(pluginDirectory, 'PasekaOfflineSpeechPlugin.java');

  let gradle = await readFile(gradlePath, 'utf8');
  const dependency = "    implementation 'com.alphacephei:vosk-android:0.3.75'";
  if (!gradle.includes('com.alphacephei:vosk-android')) {
    if (!/dependencies\\s*\\{/.test(gradle)) throw new Error('Android app dependencies block was not found');
    gradle = gradle.replace(/dependencies\\s*\\{/, match => match + '\\n' + dependency);
    await writeFile(gradlePath, gradle);
  }

  let manifest = await readFile(manifestPath, 'utf8');
  const permissions = [
    '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
    '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />'
  ];
  const applicationIndex = manifest.indexOf('<application');
  if (applicationIndex < 0) throw new Error('AndroidManifest.xml has no application element');
  const missingPermissions = permissions.filter(permission => {
    const permissionName = permission.match(/android:name="([^"]+)"/)[1];
    return !manifest.includes(permissionName);
  });
  if (missingPermissions.length) {
    manifest = manifest.slice(0, applicationIndex) + missingPermissions.join('\\n    ') + '\\n    ' + manifest.slice(applicationIndex);
    await writeFile(manifestPath, manifest);
  }

  let mainActivity = await readFile(mainActivityPath, 'utf8');
  const pluginImport = `import ${appId}.plugins.PasekaOfflineSpeechPlugin;`;
  if (!mainActivity.includes(pluginImport)) {
    const packageMatch = mainActivity.match(/^package\\s+[^;]+;/m);
    if (!packageMatch) throw new Error('MainActivity.java package declaration was not found');
    const insertAt = packageMatch.index + packageMatch[0].length;
    mainActivity = mainActivity.slice(0, insertAt) + `\\n\\nimport android.os.Bundle;\\n${pluginImport}` + mainActivity.slice(insertAt);
  }
  if (!mainActivity.includes('PasekaOfflineSpeechPlugin.class')) {
    const superCall = 'super.onCreate(savedInstanceState);';
    if (mainActivity.includes(superCall)) {
      mainActivity = mainActivity.replace(superCall, 'registerPlugin(PasekaOfflineSpeechPlugin.class);\\n        ' + superCall);
    } else {
      const classStart = mainActivity.indexOf('class MainActivity');
      const classOpen = mainActivity.indexOf('{', classStart);
      const classClose = mainActivity.lastIndexOf('}');
      if (classStart < 0 || classOpen < 0 || classClose <= classOpen) throw new Error('Unsupported generated MainActivity.java template');
      const method = `\\n    @Override\\n    public void onCreate(Bundle savedInstanceState) {\\n        registerPlugin(PasekaOfflineSpeechPlugin.class);\\n        super.onCreate(savedInstanceState);\\n    }\\n`;
      mainActivity = mainActivity.slice(0, classOpen + 1) + method + mainActivity.slice(classClose);
    }
    await writeFile(mainActivityPath, mainActivity);
  }

  const pluginTemplate = await readFile(pluginSourcePath, 'utf8');
  const pluginSource = pluginTemplate.replace(/^package\\s+[^;]+;/m, `package ${appId}.plugins;`);
  await mkdir(pluginDirectory, { recursive: true });
  await copyFile(pluginSourcePath, pluginPath);
  if (pluginSource !== pluginTemplate) await writeFile(pluginPath, pluginSource);

  return {
    appId,
    dependencyAdded: gradle.includes('com.alphacephei:vosk-android:0.3.75'),
    microphonePermission: manifest.includes('android.permission.RECORD_AUDIO'),
    networkStatePermission: manifest.includes('android.permission.ACCESS_NETWORK_STATE'),
    pluginRegistered: mainActivity.includes('PasekaOfflineSpeechPlugin.class'),
    pluginPath
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await prepareAndroidProject();
  console.log('Android offline speech plugin prepared:', JSON.stringify(result));
}
