import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBadging,parsePermissions,permissionRisk,scanSource,classifyAudit} from '../scripts/audit-android-product-apk.mjs';
const badging="package: name='ru.paseka.journal' versionCode='1' versionName='1.0' platformBuildVersionName='14'\n";
const permissions="package: ru.paseka.journal\nuses-permission: name='android.permission.INTERNET'\nuses-permission: name='ru.paseka.journal.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'\n";
const surface={scope:'SOURCE_HEURISTIC_ONLY',filesScanned:2,matchedLines:1,hits:[{file:'sw.js',line:1,kind:'fetch'}],truncated:false,networkTrafficObserved:'NOT_TESTED'};
const sha='a'.repeat(64);
test('reads actual package name from aapt with an exact independent expected ID',()=>{
 assert.equal(parseBadging(badging).packageId,'ru.paseka.journal');
 for(const bad of ['',badging+badging,"package: name='other'"])
  assert.throws(()=>parseBadging(bad));
 assert.throws(()=>classifyAudit({badging:badging.replace('ru.paseka.journal','ru.paseka.journal.diagnostic.archivea09v1'),permissions,sha256:sha,networkSurface:surface}),/PRODUCT_PACKAGE_ID_MISMATCH/);
});
test('parses complete APK manifest permission list without treating network as absent',()=>{
 const p=parsePermissions(permissions);
 assert.deepEqual(p,['android.permission.INTERNET','ru.paseka.journal.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION']);
 assert.equal(permissionRisk('android.permission.INTERNET'),'NETWORK_CAPABILITY');
 assert.equal(permissionRisk('android.permission.CAMERA'),'SENSITIVE_MEDIA_OR_STORAGE');
 assert.equal(permissionRisk('android.permission.READ_MEDIA_VIDEO'),'SENSITIVE_MEDIA_OR_STORAGE');
 assert.throws(()=>parsePermissions("uses-permission: name='android.permission.INTERNET'"),/PERMISSIONS_AAPT_INVALID/);
 assert.throws(()=>parsePermissions(permissions+"uses-permission: name='android.permission.INTERNET'\n"),/PERMISSION_DUPLICATE/);
});
test('reports static audit success with explicit untested installed permission and traffic',()=>{
 const r=classifyAudit({badging,permissions,sha256:sha,networkSurface:surface});
 assert.equal(r.code,'PRODUCT_APK_STATIC_AUDIT_ONLY');
 assert.equal(r.androidPackagePermissionsSource,'APK_AAPT_BUILD_TIME_ONLY');
 assert.equal(r.productInstalledPermissions,'NOT_TESTED');
 assert.equal(r.productNetworkTrafficObserved,'NOT_TESTED');
 assert.equal(r.sourceNetworkSurface.networkTrafficObserved,'NOT_TESTED');
 assert.equal(r.archiveSafe,false);assert.equal(r.cleanupAuthorized,false);
 assert.equal(r.permissions[0].category,'NETWORK_CAPABILITY');
});
test('source network scan exposes potential calls but does not claim runtime behavior',()=>{
 const result=scanSource('sw.js',"fetch('/one')\nconst url='https://site.invalid'\nnew WebSocket('x')");
 assert.deepEqual(result.map(x=>x.kind),['fetch','externalUrl','websocket']);
 assert.deepEqual(result.map(x=>x.line),[1,2,3]);
});
test('fails closed on unexpected APK hash and bad permissions metadata',()=>{
 assert.throws(()=>classifyAudit({badging,permissions,sha256:'bad',networkSurface:surface}),/APK_SHA256_INVALID/);
 assert.throws(()=>parsePermissions("package: ru.paseka.journal\nuses-permission: weird"),/PERMISSION_LINE_MALFORMED/);
});
