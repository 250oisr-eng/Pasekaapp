import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseDeviceList,validateDeviceProperties,validateManifest,validateProofLine,PACKAGE} from '../tools/oneplus-recovery/oneplus-recovery.mjs';
const valid={packageId:PACKAGE,originalPackageId:'ru.paseka.journal',apkFile:'app-debug.apk',apkSha256:'a'.repeat(64),sourceSha:'b'.repeat(40)};
test('single physically authorized OnePlus USB device only',()=>{
 assert.equal(parseDeviceList('List of devices attached\nZX123 device product:x model:NE2213 usb:1-1 transport_id:1\n'),'ZX123');
 for(const text of ['List of devices attached\n','List of devices attached\nabc unauthorized usb:1\n','List of devices attached\n192.168.1.2:5555 device transport_id:1\n','List of devices attached\nemulator-5554 device usb:1\n','List of devices attached\na device usb:1\nb device usb:2\n'])
  assert.throws(()=>parseDeviceList(text),/ONE_AUTHORIZED_PHYSICAL_USB_DEVICE_REQUIRED/);
});
test('verify manufacturer model Android and emulator flags before install',()=>{
 assert.equal(validateDeviceProperties({manufacturer:'OnePlus',model:'NE2213',qemu:'',api:'36'}),true);
 for(const change of [{model:'Pixel 6'},{manufacturer:'Samsung'},{api:'34'},{qemu:'1'}]){
  assert.throws(()=>validateDeviceProperties({manufacturer:'OnePlus',model:'NE2213',qemu:'',api:'36',...change}),/NOT_EXPECTED_ONEPLUS_ANDROID_15_PLUS/);
 }
});
test('reject counterfeit, mismatched or missing artifact manifest',()=>{
 validateManifest(valid);
 for(const patch of [{packageId:'ru.paseka.journal'},{apkFile:'evil.apk'},{apkSha256:'123'},{sourceSha:'HEAD'}])
  assert.throws(()=>validateManifest({...valid,...patch}),/UNTRUSTED_DIAGNOSTIC_MANIFEST/);
});
test('strict and current scoped log evidence is required',()=>{
 const object={packageId:PACKAGE,isolated:true,productionApp:'NOT_ACCESSED',productionDatabase:'NOT_ACCESSED',originalVideos:'NOT_ACCESSED',status:'PASS',code:'P0_DISASTER_WEBVIEW_RESTORE_PASS'};
 const line='I/chromium(123): PASEKA_P0_DISASTER_PROOF_RESULT '+JSON.stringify(object);
 assert.equal(validateProofLine(line,'P0_DISASTER_WEBVIEW_RESTORE_PASS'),true);
 assert.equal(validateProofLine(line,'P0_DISASTER_PHYSICAL_RESTART_PASS'),false);
 assert.equal(validateProofLine(line.replace(PACKAGE,'ru.paseka.journal'),'P0_DISASTER_WEBVIEW_RESTORE_PASS'),false);
 assert.equal(validateProofLine(line.replace('NOT_ACCESSED','ACCESSED'),'P0_DISASTER_WEBVIEW_RESTORE_PASS'),false);
 assert.equal(validateProofLine('PASEKA_P0_DISASTER_PROOF_RESULT {corrupt}','P0_DISASTER_WEBVIEW_RESTORE_PASS'),false);
});
test('one-click CMD is inert without packaged node/apk; no production reset or wipe commands',async()=>{
 const s=await readFile(new URL('../tools/oneplus-recovery/ПРОВЕРИТЬ-ONEPLUS.cmd',import.meta.url),'utf8');
 const runner=await readFile(new URL('../tools/oneplus-recovery/oneplus-recovery.mjs',import.meta.url),'utf8');
 assert.match(s,/if not exist "node.exe"/);
 assert.match(s,/if not exist "app-debug.apk"/);
 assert.match(s,/ONEPLUS-RECOVERY-RESULT.json/);
 assert.doesNotMatch(runner,/\b(uninstall|pm clear|reboot|rm -rf|deleteDatabase)\b/);
 assert.match(runner,/am','force-stop',PACKAGE/);
 assert.match(runner,/DIAGNOSTIC_PACKAGE_ALREADY_INSTALLED_NO_OVERWRITE/);
});
