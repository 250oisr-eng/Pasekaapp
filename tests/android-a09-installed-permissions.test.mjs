import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const runner=await readFile(new URL('../diagnostics/archive-a09/runner.js',import.meta.url),'utf8');
const copy=await readFile(new URL('../diagnostics/archive-a09/copy-report.js',import.meta.url),'utf8');
const html=await readFile(new URL('../diagnostics/archive-a09/index.html',import.meta.url),'utf8');
const native=await readFile(new URL('../scripts/install-android-a09-permission-plugin.mjs',import.meta.url),'utf8');
const PKG='ru.paseka.journal.diagnostic.archivea09v1';
function harness(result,options={}){
 const calls=[];
 const els={};
 for(const id of ['run','copy','status','result'])els[id]={textContent:'',disabled:id==='copy',listeners:{},
  addEventListener(type,cb){this.listeners[type]=cb;}};
 const w={Capacitor:{Plugins:{
  A09Permissions: options.missingPlugin?undefined:{async inspectOwnPackage(){if(options.reject)throw Error(options.reject);return result;}},
  Clipboard:{async write({string}){calls.push(string);}}
 }}};
 const ctx=vm.createContext({window:w,document:{getElementById(id){return els[id];}},console});
 vm.runInContext(copy,ctx);vm.runInContext(runner,ctx);
 return {els,calls,w,async execute(){await els.run.listeners.click();return JSON.parse(els.result.textContent)},
  async copy(){await els.copy.listeners.click();return calls;}};
}
const payload=(requestedPermissions=[])=>({
 packageId:PKG,uidMatchesProcess:true,source:'ANDROID_PACKAGE_MANAGER_INSTALLED_OWN_PACKAGE',requestedPermissions
});
const permission=(name,granted=false)=>({name,granted,requestedGrantedFlag:granted});

test('two-button UX without hidden network transfer',()=>{
 assert.match(html,/>Провести тест<\/button>/);
 assert.match(html,/>Копировать результат<\/button>/);
 assert.match(html,/id="copy"[^>]*disabled/);
 assert.doesNotMatch(runner,/\bfetch\s*\(|XMLHttpRequest|sendBeacon|\.href\s*=/);
 assert.doesNotMatch(native,/QUERY_ALL_PACKAGES|requestPermissions\(|getInstalledPackages\(|getInstalledApplications\(/);
});
test('safe own installed package permissions only yields scoped PASS and exact clipboard JSON',async()=>{
 const f=harness(payload([permission('android.permission.VIBRATE'),permission('android.permission.POST_NOTIFICATIONS')]));
 assert.equal(f.els.copy.disabled,true);
 const report=await f.execute();
 assert.equal(report.status,'PASS');
 assert.equal(report.code,'A09_INSTALLED_PERMISSION_AUDIT_ONLY');
 assert.equal(report.packagePermissionAudit,'PASS');
 assert.equal(report.networkTrafficObserved,'NOT_TESTED');
 assert.equal(report.archiveSafe,false);
 assert.equal(report.cleanupAuthorized,false);
 assert.deepEqual([...report.scenariosVerified],['A09_INSTALLED_PERMISSION_AUDIT_ONLY']);
 assert.equal(f.calls.length,0);
 const original=f.els.result.textContent;
 await f.copy();
 assert.equal(f.calls[0],original);
});
test('legitimate empty requested permissions is a scoped PASS',async()=>{
 const f=harness(payload());const r=await f.execute();
 assert.equal(r.status,'PASS');assert.equal(r.requestedPermissions.length,0);
});
test('forbidden permission in manifest blocks even if not granted',async()=>{
 for(const name of ['INTERNET','CAMERA','READ_EXTERNAL_STORAGE','WRITE_EXTERNAL_STORAGE','MANAGE_EXTERNAL_STORAGE',
 'READ_MEDIA_IMAGES','READ_MEDIA_VIDEO','READ_MEDIA_VISUAL_USER_SELECTED','ACCESS_MEDIA_LOCATION','RECORD_AUDIO']){
  const f=harness(payload([permission('android.permission.'+name,false)]));
  const r=await f.execute();
  assert.equal(r.status,'BLOCKED',name);
  assert.equal(r.code,'A09_FORBIDDEN_PERMISSION_DECLARED');
  assert.equal(r.forbiddenPermissions[0].name,'android.permission.'+name);
  assert.equal(f.els.copy.disabled,false);
  await f.copy();
  assert.equal(JSON.parse(f.calls[0]).status,'BLOCKED');
 }
});
test('wrong app identity, source, missing plugin and failed PM all BLOCK, not PASS',async()=>{
 for(const input of [{...payload(),packageId:'ru.paseka.journal'},
 {...payload(),uidMatchesProcess:false},
 {...payload(),source:'FAKE'}, {...payload(),requestedPermissions:null}]){
  assert.equal((await harness(input).execute()).status,'BLOCKED');
 }
 assert.equal((await harness(null,{missingPlugin:true}).execute()).status,'BLOCKED');
 assert.equal((await harness(null,{reject:'PM_DENIED'}).execute()).status,'BLOCKED');
});
test('permission evidence refuses missing booleans, duplicates and untrusted names',async()=>{
 for(const entries of [[{name:'android.permission.INTERNET',granted:false}],
 [permission('android.permission.VIBRATE'),permission('android.permission.VIBRATE')],
 [permission('<danger>')]]){
  const r=await harness(payload(entries)).execute();
  assert.equal(r.status,'BLOCKED');
  assert.equal(r.code,'A09_PERMISSION_ENTRY_INVALID');
 }
});
test('native plugin queries its own package, never enumerates external apps or requests rights',()=>{
 assert.match(native,/getPackageInfo\(name,PackageManager\.GET_PERMISSIONS\)/);
 assert.match(native,/Process\.myUid\(\)/);
 assert.match(native,/PackageInfo\.REQUESTED_PERMISSION_GRANTED/);
 assert.match(native,/pm\.checkPermission\(permission,name\)/);
 assert.match(native,/registerPlugin\(A09PermissionsPlugin\.class\)/);
 assert.doesNotMatch(native,/getInstalledPackages|QUERY_ALL_PACKAGES|requestPermissions\(|MediaStore|READ_MEDIA/);
});
