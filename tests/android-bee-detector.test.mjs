import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { patchAndroidGradleSources } from '../scripts/patch-android-gradle.mjs';

const java=await readFile(new URL('../capacitor-bee-detector/android/src/main/java/ru/paseka/beedetector/BeeDetectorPlugin.java',import.meta.url),'utf8');
const probe=await readFile(new URL('../capacitor-bee-detector/android/src/main/java/ru/paseka/beedetector/LiteRtRuntimeProbe.java',import.meta.url),'utf8');
const pkg=JSON.parse(await readFile(new URL('../capacitor-bee-detector/package.json',import.meta.url),'utf8'));
const androidWorkflow=await readFile(new URL('../.github/workflows/android-debug.yml',import.meta.url),'utf8');
const rootPackage=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const gradlePatcher=await readFile(new URL('../scripts/patch-android-gradle.mjs',import.meta.url),'utf8');

test('local Capacitor plugin is registered as an Android plugin package',()=>{
 assert.equal(pkg.name,'@paseka/capacitor-bee-detector');
 assert.equal(pkg.capacitor.android.src,'android');
 assert.match(java,/@CapacitorPlugin\(name = "BeeDetector"\)/);
 assert.match(java,/public void getStatus\(PluginCall call\)/);
 assert.match(java,/public void detectFrame\(PluginCall call\)/);
});

test('native bridge probes standalone LiteRT off the UI thread',()=>{
 assert.match(java,/Executors\.newSingleThreadExecutor\(\)/);
 assert.match(java,/runtimeExecutor\.execute/);
 assert.match(java,/probe\.available/);
 assert.match(probe,/com\.google\.ai\.edge\.litert\.Environment/);
 assert.match(probe,/"create", Context\.class, Map\.class, boolean\.class/);
 assert.match(probe,/"create", Map\.class/);
 assert.match(probe,/getMethod\("close"\)/);
 assert.match(probe,/environment\.getClass\(\)\.getMethod\("close"\)/);
});

test('runtime availability never implies model or inference availability',()=>{
 assert.match(java,/result\.put\("modelAvailable", false\)/);
 assert.match(java,/result\.put\("inferenceAvailable", false\)/);
 assert.match(java,/probe\.available \? "model_not_installed" : "runtime_initialization_failed"/);
 assert.match(java,/result\.put\("status", "unavailable"\)/);
 assert.doesNotMatch(java,/put\("detections"/);
});

test('native detector accepts only readable files inside the private app cache',()=>{
 assert.match(java,/getCacheDir\(\)\.getCanonicalFile\(\)/);
 assert.match(java,/getCanonicalFile\(\)/);
 assert.match(java,/frame_path_outside_app_cache/);
 assert.match(java,/frame_file_unavailable/);
 assert.match(java,/frame\.isFile\(\)\s*\|\|\s*!frame\.canRead\(\)/);
});

test('Android plugin declares the standalone LiteRT runtime and CPU-first PoC',async()=>{
 const gradle=await readFile(new URL('../capacitor-bee-detector/android/build.gradle',import.meta.url),'utf8');
 assert.match(gradle,/com\.google\.ai\.edge\.litert:litert:2\.3\.2/);
 assert.doesNotMatch(gradle,/play-services-litert/);
 assert.doesNotMatch(gradle,/litert-gpu/);
});

test('detector executor is instance-scoped and stopped when Capacitor destroys the plugin',()=>{
 assert.match(java,/private final ExecutorService runtimeExecutor/);
 assert.match(java,/runtimeExecutor\.shutdownNow\(\)/);
 assert.match(java,/protected void handleOnDestroy\(\)/);
 assert.match(java,/destroyed/);
 assert.doesNotMatch(java,/static final ExecutorService/);
});

test('detector executor handles shutdown races and interrupted workers',()=>{
 assert.match(java,/RejectedExecutionException/);
 assert.match(java,/Thread\.currentThread\(\)\.isInterrupted\(\)/);
 assert.match(java,/runtime_executor_unavailable/);
});

test('Capacitor dependencies are pinned to the same stable 8.6.2 release',()=>{
 assert.equal(rootPackage.dependencies['@capacitor/android'],'8.6.2');
 assert.equal(rootPackage.dependencies['@capacitor/core'],'8.6.2');
 assert.equal(rootPackage.devDependencies['@capacitor/cli'],'8.6.2');
 assert.equal(pkg.peerDependencies['@capacitor/core'],'^8.0.0');
});

test('Android CI uses the Capacitor 8 JavaScript and Android toolchain',()=>{
 assert.match(androidWorkflow,/node-version: 22/);
 assert.match(androidWorkflow,/java-version: '21'/);
 assert.match(androidWorkflow,/platforms;android-36/);
 assert.match(androidWorkflow,/build-tools;36\.0\.0/);
 assert.match(androidWorkflow,/minSdkVersion: 24/);
 assert.match(androidWorkflow,/compileSdkVersion: 36/);
 assert.match(androidWorkflow,/targetSdkVersion: 36/);
 assert.match(gradlePatcher,/AGP_VERSION = '8\.13\.0'/);
 assert.match(gradlePatcher,/GRADLE_VERSION = '8\.14\.3'/);
 assert.doesNotMatch(androidWorkflow,/node-version: 20/);
 assert.doesNotMatch(androidWorkflow,/java-version: '17'/);
});

test('Capacitor 8 Gradle patcher upgrades a generated project deterministically',()=>{
 const patched=patchAndroidGradleSources(
  "buildscript { dependencies { classpath 'com.android.tools.build:gradle:8.6.1' } }",
  "distributionUrl=https\\://services.gradle.org/distributions/gradle-8.7-all.zip\\n"
 );
 assert.match(patched.buildGradle,/com\\.android\\.tools\\.build:gradle:8\\.13\\.0/);
 assert.match(patched.wrapperProperties,/gradle-8\\.14\\.3-all\\.zip/);
 assert.throws(()=>patchAndroidGradleSources(
  "classpath 'com.android.tools.build:gradle:8.6.1'\\nclasspath 'com.android.tools.build:gradle:8.6.1'",
  "distributionUrl=https\\://services.gradle.org/distributions/gradle-8.7-all.zip\\n"
 ),/Expected exactly one/);
});
