import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const runner=await readFile(new URL('../diagnostics/product-permissions/runner.js',import.meta.url),'utf8');
const copier=await readFile(new URL('../diagnostics/product-permissions/copy-report.js',import.meta.url),'utf8');
const html=await readFile(new URL('../diagnostics/product-permissions/index.html',import.meta.url),'utf8');
const javaScript=await readFile(new URL('../scripts/install-android-product-permissions-plugin.mjs',import.meta.url),'utf8');
const TARGET='ru.paseka.journal';
const workflow=await readFile(new URL('../.github/workflows/android-product-installed-permissions-apk.yml',import.meta.url),'utf8');
const valid=(permissions=[])=>({
 targetPackageId:TARGET,source:'ANDROID_PACKAGE_MANAGER_INSTALLED_EXPLICIT_TARGET',identityVerified:true,
 requestedPermissions:permissions,versionName:'1.0',versionCode:'1'
});
const perm=(name,granted=false)=>({name,granted,requestedGrantedFlag:granted});
function app(data,{missing=false,reject=null}={}){
 const els={};for(const id of ['run','copy','status','result'])els[id]={
  disabled:id==='copy',textContent:'',handlers:{},addEventListener(name,cb){this.handlers[name]=cb;}};
 const writes=[];
 const w={Capacitor:{Plugins:{
  ProductPermissions:missing?undefined:{async inspectTarget(){if(reject)throw Error(reject);return data;}},
  Clipboard:{async write({string}){writes.push(string);}}
 }}};
 const ctx=vm.createContext({window:w,document:{getElementById:id=>els[id]}});
 vm.runInContext(copier,ctx);vm.runInContext(runner,ctx);
 return {els,writes,async run(){await els.run.handlers.click();return JSON.parse(els.result.textContent)},
  async copy(){await els.copy.handlers.click();return writes;}};
}
test('exactly two buttons, copy disabled before a complete diagnostic',()=>{
 assert.match(html,/>Провести тест<\/button>/);assert.match(html,/>Копировать результат<\/button>/);
 assert.match(html,/id="copy"[^>]*disabled/);
});
test('production INTERNET declaration is reported (not blocked or misreported as no traffic)',async()=>{
 const a=app(valid([perm('android.permission.INTERNET',true),perm('ru.paseka.journal.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',true)]));
 assert.equal(a.els.copy.disabled,true);
 const result=await a.run();
 assert.equal(result.status,'PASS');
 assert.equal(result.code,'PRODUCT_INSTALLED_PACKAGE_PERMISSIONS_READONLY');
 assert.equal(result.internetPermissionDeclared,true);
 assert.equal(result.productNetworkTrafficObserved,'NOT_TESTED');
 assert.equal(result.installedAppOpened,false);
 assert.equal(result.cleanupAuthorized,false);
 assert.equal(result.restoreAuthorized,false);
 assert.equal(result.archiveSafe,false);
 assert.equal(a.writes.length,0);
 const json=a.els.result.textContent;await a.copy();assert.equal(a.writes[0],json);
});
test('non-internet installation returns exact permission list but still cannot prove no traffic',async()=>{
 const result=await app(valid()).run();
 assert.equal(result.status,'PASS');
 assert.equal(result.internetPermissionDeclared,false);
 assert.equal(result.productNetworkTrafficObserved,'NOT_TESTED');
});
test('missing product, denied visibility, missing plugin and wrong package all BLOCK without false PASS',async()=>{
 const inputs=[[null,{reject:'PRODUCT_PACKAGE_NOT_INSTALLED_OR_NOT_VISIBLE'}],[null,{missing:true}],
 [{...valid(),targetPackageId:'ru.paseka.journal.fake'},{}],
 [{...valid(),source:'FAKE'},{}]];
 for(const [data,opt] of inputs){
  const a=app(data,opt);const result=await a.run();
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.installedProductPackageVerified,false);
  assert.equal(result.productNetworkTrafficObserved,'NOT_TESTED');
  assert.equal(a.els.copy.disabled,false);
  await a.copy();assert.equal(JSON.parse(a.writes[0]).status,'BLOCKED');
 }
});
test('reject duplicate, incomplete or unsafe response fields',async()=>{
 for(const items of [[perm('android.permission.INTERNET'),perm('android.permission.INTERNET')],
  [{name:'android.permission.INTERNET',granted:true}], [perm('<invalid>')]]){
  const result=await app(valid(items)).run();
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.code,'PERMISSION_LIST_INVALID');
 }
});
test('native bridge can query only explicitly declared product without app enumeration',()=>{
 assert.match(javaScript,/getPackageInfo\(TARGET,PackageManager\.GET_PERMISSIONS\)/);
 assert.match(javaScript,/<queries>/);
 assert.match(javaScript,/registerPlugin\(ProductPermissionsPlugin\.class\)/);
 assert.match(javaScript,/PRODUCT_PACKAGE_NOT_INSTALLED_OR_NOT_VISIBLE/);
 assert.doesNotMatch(javaScript,/QUERY_ALL_PACKAGES|getInstalledPackages\(|requestPermissions\(|MediaStore|Process\.killProcess|startActivity\(/);
 assert.doesNotMatch(runner,/\bfetch\s*\(|sendBeacon|XMLHttpRequest|WebSocket/);
});

test('CI rejects every APK permission not on the single-package allowlist',()=>{
 assert.ok(workflow.includes('product-permissions-apk.txt'));
 assert.ok(workflow.includes('allowed = new Set(['));
 assert.ok(workflow.includes('diagnostic.productpermsv1.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'));
 assert.ok(workflow.includes('!allowed.has(match[1])'));
 assert.ok(workflow.includes('Unexpected diagnostic APK permission'));
 assert.ok(!workflow.includes("grep -E 'android.permission.(INTERNET"));
});
