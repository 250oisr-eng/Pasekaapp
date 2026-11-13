import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const java=await readFile(new URL('../capacitor-bee-detector/android/src/main/java/ru/paseka/beedetector/BeeDetectorPlugin.java',import.meta.url),'utf8');
const probe=await readFile(new URL('../capacitor-bee-detector/android/src/main/java/ru/paseka/beedetector/LiteRtRuntimeProbe.java',import.meta.url),'utf8');
const pkg=JSON.parse(await readFile(new URL('../capacitor-bee-detector/package.json',import.meta.url),'utf8'));

test('local Capacitor plugin is registered as an Android plugin package',()=>{
 assert.equal(pkg.name,'@paseka/capacitor-bee-detector');
 assert.equal(pkg.capacitor.android.src,'android');
 assert.match(java,/@CapacitorPlugin\(name = "BeeDetector"\)/);
 assert.match(java,/public void getStatus\(PluginCall call\)/);
 assert.match(java,/public void detectFrame\(PluginCall call\)/);
});

test('native bridge probes standalone LiteRT off the UI thread',()=>{
 assert.match(java,/Executors\.newSingleThreadExecutor\(\)/);
 assert.match(java,/RUNTIME_EXECUTOR\.execute/);
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
