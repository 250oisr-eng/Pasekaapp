import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { generateIsolatedProbe, ISOLATED_APP_ID, LIVE_APP_ID } from '../tools/b01-isolated-diagnostic/generate.mjs';

const js=readFileSync(new URL('../tools/b01-isolated-diagnostic/probe.js',import.meta.url),'utf8');

test('B01 diagnostic generates an isolated clean Capacitor source, never overwrites',async()=>{
 const outer=await mkdtemp(join(tmpdir(),'b01-isolated-src-'));
 try{
  const dst=join(outer,'probe');
  const p=await generateIsolatedProbe(dst);
  assert.equal(p.packageId,ISOLATED_APP_ID);
  assert.notEqual(p.packageId,LIVE_APP_ID);
  const config=JSON.parse(await readFile(join(dst,'capacitor.config.json'),'utf8'));
  assert.equal(config.appId,ISOLATED_APP_ID);
  assert.equal(config.webDir,'www');
  assert.equal(config.server,undefined);
  const web=await readFile(join(dst,'www/index.html'),'utf8');
  assert.match(web,/probe\.js/);
  assert.doesNotMatch(web,/js\/app\.js|serviceWorker\.register/);
  await assert.rejects(generateIsolatedProbe(dst),/DESTINATION_ALREADY_EXISTS/);
  assert.equal((await readFile(join(dst,'capacitor.config.json'),'utf8')).includes(LIVE_APP_ID+'"'),false);
 }finally{await rm(outer,{recursive:true,force:true});}
});

test('B01 diagnostic refuses source-tree destinations and redirects through symlinks',async()=>{
 await assert.rejects(generateIsolatedProbe(resolve('tools/b01-isolated-diagnostic/test-out')),/REPOSITORY_OR_SOURCE_TREE/);
 const outer=await mkdtemp(join(tmpdir(),'b01-isolated-link-'));
 try{
  const path=join(outer,'link');
  await symlink(resolve('.'),path,'dir');
  await assert.rejects(generateIsolatedProbe(join(path,'target')),/REPOSITORY_OR_SOURCE_TREE/);
 }finally{await rm(outer,{recursive:true,force:true});}
});

function harness({origin='https://localhost',databases=[],db=null,upgrade=false}={}){
 let handler,openCalls=0,closeCalls=0;
 const button={disabled:false,addEventListener:(name,fn)=>{assert.equal(name,'click');handler=fn;}};
 const output={value:''};
 const document={getElementById:id=>id==='run'?button:id==='output'?output:null};
 const names=db?.names??['main','full_backup','entrance_media'];
 const dbHandle={
  version:3,objectStoreNames:names,close(){closeCalls++;},
  transaction(storeNames,mode){
   assert.equal(mode,'readonly');
   const tx={oncomplete:null,onabort:null,onerror:null,
     objectStore(name){
      assert.ok(storeNames.includes(name));
      return {count(){
        const req={onsuccess:null,onerror:null,result:(db?.counts??{})[name]??1};
        queueMicrotask(()=>{req.onsuccess?.();if(++done===storeNames.length)queueMicrotask(()=>tx.oncomplete?.());});
        return req;
      }};
     }
   };
   let done=0;return tx;
  }
 };
 const indexedDB={
  databases:async()=>databases.map(name=>({name,version:3})),
  open(name){
   openCalls++;assert.equal(name,'paseka-v1');
   const req={transaction:{abort(){}},onsuccess:null,onerror:null,onblocked:null,onupgradeneeded:null,result:dbHandle};
   queueMicrotask(()=>upgrade?req.onupgradeneeded?.():req.onsuccess?.());
   return req;
  }
 };
 vm.runInNewContext(js,{window:{indexedDB},indexedDB,document,location:new URL(origin),queueMicrotask});
 return {click:async()=>{await handler();return JSON.parse(output.value);},getOpenCalls:()=>openCalls,getCloseCalls:()=>closeCalls};
}

test('B01 isolated inspector blocks absent database without open or create',async()=>{
 const h=harness();
 const out=await h.click();
 assert.equal(out.code,'EXPECTED_DB_NOT_DISCOVERED');
 assert.equal(h.getOpenCalls(),0);
 assert.equal(out.fullBackupVerified,false);
 assert.equal(out.independentRestore,'NOT_VERIFIED');
});

test('B01 isolated inspector accepts only HTTPS localhost without opening anything else',async()=>{
 const h=harness({origin:'http://localhost',databases:['paseka-v1']});
 assert.equal((await h.click()).code,'DIAGNOSTIC_ORIGIN_NOT_HTTPS_LOCALHOST');
 assert.equal(h.getOpenCalls(),0);
});

test('B01 isolated inspector counts all stores read-only and never reads values',async()=>{
 const h=harness({databases:['paseka-v1'],db:{names:['main','full_backup','entrance_media'],counts:{main:1,full_backup:2,entrance_media:0}}});
 const out=await h.click();
 assert.equal(out.status,'ISOLATED_DB_REOPEN_METADATA_PASS_NOT_FULL_RESTORE');
 assert.equal(out.code,'INDEXEDDB_READONLY_OPEN_AND_STORE_COUNTS_PASS');
 assert.equal(out.storeCounts.main,1);
 assert.equal(out.storeCounts.full_backup,2);
 assert.equal(out.storeCounts.entrance_media,0);
 assert.equal(out.dbRecordValuesRead,'NO');
 assert.equal(out.dbWrites,'NOT_ATTEMPTED');
 assert.equal(out.fullBackupVerified,false);
 assert.equal(out.diagnosticPackageAttestation,'EXTERNAL_EMULATOR_ONLY_NOT_CONFIRMED_BY_WEB');
 assert.equal(h.getCloseCalls(),1);
});

test('B01 inspector aborts unexpected creation/upgrade and rejects missing stores',async()=>{
 const h=harness({databases:['paseka-v1'],upgrade:true});
 const out=await h.click();
 assert.equal(out.code,'DB_CREATE_OR_UPGRADE_FORBIDDEN');
 assert.equal(out.databaseOpened,false);
 const h2=harness({databases:['paseka-v1'],db:{names:['main','full_backup']}});
 assert.equal((await h2.click()).code,'REQUIRED_STORES_MISSING');
});

test('B01 diagnostic source has no mutable DB methods or external IO',()=>{
 assert.doesNotMatch(js,/['"]readwrite['"]|\.put\s*\(|\.clear\s*\(|\.delete\s*\(|deleteDatabase\s*\(/);
 assert.doesNotMatch(js,/\.getAll\s*\(|\.get\s*\(|fetch\s*\(|XMLHttpRequest|WebSocket|localStorage/);
 assert.match(js,/indexedDB\.databases\(\)/);
 assert.match(js,/req\.transaction\.abort\(\)/);
});


test('B01 Android emulator guard is mandatory, restrictive, and source-identical',async()=>{
 const java=await readFile(new URL('../tools/b01-isolated-diagnostic/MainActivity.java',import.meta.url),'utf8');
 assert.match(java,/B01_EMULATOR_ONLY_NO_PHYSICAL_DEVICE/);
 assert.match(java,/emulatedHardware && emulatedFingerprint/);
 assert.match(java,/throw new IllegalStateException[\s\S]*super\.onCreate/s);
 assert.match(java,/package ru\.paseka\.journal\.diagnostic\.restore;/);
 const {installEmulatorGuard}=await import('../tools/b01-isolated-diagnostic/guard-android.mjs');
 const parent=await mkdtemp(join(tmpdir(),'b01-native-guard-'));
 try{
  const dst=join(parent,'clean');
  await generateIsolatedProbe(dst);
  const source=join(dst,'android/app/src/main/java/ru/paseka/journal/diagnostic/restore');
  await mkdir(source,{recursive:true});
  await import('node:fs/promises').then(({writeFile})=>writeFile(join(source,'MainActivity.java'),
   'package ru.paseka.journal.diagnostic.restore;\npublic class MainActivity extends BridgeActivity {}\n'));
  await installEmulatorGuard(dst);
  assert.equal(await readFile(join(source,'MainActivity.java'),'utf8'),java);
  await assert.rejects(installEmulatorGuard(dst),/UNEXPECTED_GENERATED_ANDROID_ACTIVITY/);
 } finally {await rm(parent,{recursive:true,force:true});}
});
