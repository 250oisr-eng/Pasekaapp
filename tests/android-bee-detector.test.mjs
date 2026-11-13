import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const java=await readFile(new URL('../capacitor-bee-detector/android/src/main/java/ru/paseka/beedetector/BeeDetectorPlugin.java',import.meta.url),'utf8');
const pkg=JSON.parse(await readFile(new URL('../capacitor-bee-detector/package.json',import.meta.url),'utf8'));

test('local Capacitor plugin is registered as an Android plugin package',()=>{
 assert.equal(pkg.name,'@paseka/capacitor-bee-detector');
 assert.equal(pkg.capacitor.android.src,'android');
 assert.match(java,/@CapacitorPlugin\(name = "BeeDetector"\)/);
 assert.match(java,/public void getStatus\(PluginCall call\)/);
 assert.match(java,/public void detectFrame\(PluginCall call\)/);
});

test('native bridge reports unavailable until an actual model and runtime are installed',()=>{
 assert.match(java,/result.put\("runtimeAvailable", false\)/);
 assert.match(java,/result.put\("modelAvailable", false\)/);
 assert.match(java,/result.put\("inferenceAvailable", false\)/);
 assert.match(java,/result.put\("reason", "model_not_installed"\)/);
});

test('native bridge never fabricates detections while the model is absent',()=>{
 assert.match(java,/result.put\("status", "unavailable"\)/);
 assert.match(java,/result.put\("reason", "model_not_installed"\)/);
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
