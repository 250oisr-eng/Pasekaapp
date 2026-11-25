import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {collectV16IndexedDb,tarBytes,classifyEmulator,ensureExpectedApp,validateAdbDeviceList,executeIsolatedTransfer} from '../tools/b01-isolated-diagnostic/transfer-to-emulator.mjs';

const SERIAL='emulator-5554';
function props(overrides={}){
 return {serial:SERIAL,hardware:'ranchu',fingerprint:'google/sdk_gphone64_x86_64/generic',qemu:'1',
 avdName:'PASEKA_B01_ISOLATED_TEST',liveInstalled:false,diagnosticInstalled:false,...overrides};
}
test('B01 v20 refuses physical, wrong AVD, copied app, and reused diagnostic app',()=>{
 assert.equal(classifyEmulator(props()),true);
 for(const item of [
  {serial:'ABCDEF1234'},{hardware:'qcom'},{fingerprint:'oneplus/NE2213'},
  {qemu:'0'},{avdName:'Pixel_7'},{liveInstalled:true},{diagnosticInstalled:true}
 ])assert.throws(()=>classifyEmulator(props(item)),/B01_BLOCKED_/);
 assert.equal(validateAdbDeviceList('List of devices attached\nemulator-5554 device product:x\nABCDEF1234 device product:y\n'),SERIAL);
 assert.throws(()=>validateAdbDeviceList('List of devices attached\nABCDEF1234 device product:y\n'),/B01_BLOCKED_/);
 assert.throws(()=>validateAdbDeviceList('emulator-5554 device\nemulator-5556 device\n'),/B01_BLOCKED_/);
});
test('B01 v20 verifies real APK package identity, rejects production app',()=>{
 ensureExpectedApp("package: name='ru.paseka.journal.diagnostic.restore' versionCode='1'\napplication-label:'Paseka B01 Isolated Diagnostic'");
 assert.throws(()=>ensureExpectedApp("package: name='ru.paseka.journal' versionCode='1'\napplication-label:'Пасека'"),/B01_BLOCKED_/);
 assert.throws(()=>ensureExpectedApp("package: name='ru.paseka.journal.diagnostic.restore'"),/B01_BLOCKED_/);
});
async function fixture(){
 const root=await fs.mkdtemp(join(tmpdir(),'b01-v20-'));
 const name='pc-reconstruction-11111111111111111111111111111111';
 const db=join(root,name,'app_webview','Default','IndexedDB','https_localhost_0.indexeddb.leveldb');
 await fs.mkdir(db,{recursive:true});
 await fs.writeFile(join(db,'CURRENT'),'MANIFEST-000001\n');
 await fs.writeFile(join(db,'MANIFEST-000001'),'private-placeholder');
 await fs.writeFile(join(db,'000001.log'),Buffer.from([1,2,3,4,5,6]));
 return {root,db};
}
test('B01 v20 builds binary TAR from private local copy in memory with no source mutation',async()=>{
 const {root,db}=await fixture();
 try{
  const src=await collectV16IndexedDb(root);
  assert.equal(src.regular.length,3);
  assert.equal(src.bytes,16+19+6); // synthetic CURRENT, MANIFEST and binary log
  const before=await fs.readFile(join(db,'000001.log'));
  const chunks=[];
  for await(const part of tarBytes(src.members))chunks.push(part);
  const whole=Buffer.concat(chunks);
  assert.equal(whole.length%512,0);
  assert.deepEqual(await fs.readFile(join(db,'000001.log')),before);
  const names=src.members.map(x=>x.name);
  assert.ok(names.some(x=>x.endsWith('/CURRENT')));
  assert.ok(names.some(x=>x.endsWith('/MANIFEST-000001')));
  assert.ok(names.some(x=>x.endsWith('/000001.log')));
  assert.equal(src.regular.every(x=>/^[0-9a-f]{64}$/.test(x.sha256)),true);
  assert.equal(whole.slice(-1024).every(x=>x===0),true);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('B01 v20 refuses incomplete or symlinked private reconstruction without importing',async()=>{
 const {root,db}=await fixture();
 try{
  await fs.writeFile(join(root,'pc-reconstruction-11111111111111111111111111111111','INVALID-PC-RECONSTRUCTION-NOT-BACKUP.txt'),'invalid');
  await assert.rejects(collectV16IndexedDb(root),/B01_BLOCKED_INCOMPLETE/);
  await fs.unlink(join(root,'pc-reconstruction-11111111111111111111111111111111','INVALID-PC-RECONSTRUCTION-NOT-BACKUP.txt'));
  await fs.symlink(join(db,'CURRENT'),join(db,'link-name'));
  await assert.rejects(collectV16IndexedDb(root),/B01_BLOCKED_SYMLINK_NOT_ALLOWED/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});


test('B01 v20 full mocked emulator import: no physical commands, private bytes stream and SHA readback',async()=>{
 const {root,db}=await fixture();
 const {PassThrough}=await import('node:stream');
 const {EventEmitter}=await import('node:events');
 const {createHash}=await import('node:crypto');
 try{
  const source=await collectV16IndexedDb(root);
  const digest=new Map();
  for(const member of source.regular){
   digest.set(member.name,createHash('sha256').update(await fs.readFile(member.full)).digest('hex'));
  }
  const adb=join(root,'adb.exe'),apk=join(root,'B01-diagnostic.apk'),aapt=join(root,'aapt.exe');
  await Promise.all([adb,apk,aapt].map(x=>fs.writeFile(x,'synthetic executable placeholder')));
  const calls=[];let streamed=Buffer.alloc(0);
  const sync=(cmd,args)=>{
    calls.push({cmd,args});
    if(cmd===aapt)return {status:0,stdout:"package: name='ru.paseka.journal.diagnostic.restore'\napplication-label:'Paseka B01 Isolated Diagnostic'"};
    assert.equal(cmd,adb);
    if(args[0]==='devices')return {status:0,stdout:'List of devices attached\nemulator-5554 device product:generic\n'};
    assert.equal(args[0],'-s');
    assert.equal(args[1],'emulator-5554');
    const value=args.slice(2).join(' ');
    const cases={
      'shell getprop ro.kernel.qemu':'1',
      'shell getprop ro.hardware':'ranchu',
      'shell getprop ro.build.fingerprint':'generic/sdk_gphone64_x86_64/emulator',
      'emu avd name':'PASEKA_B01_ISOLATED_TEST\nOK',
      'shell pm path ru.paseka.journal':'',
      'shell pm path ru.paseka.journal.diagnostic.restore':'',
      ['install --no-streaming '+apk]:'Success'
    };
    if(value in cases)return {status:0,stdout:cases[value]};
    if(value.startsWith('exec-out run-as ru.paseka.journal.diagnostic.restore sha256sum ')){
      const path=value.split(' sha256sum ')[1];
      const hash=digest.get(path);
      assert.ok(hash,'all readbacks must reference approved reconstructed files');
      return {status:0,stdout:hash+'  '+path};
    }
    throw Error('unexpected synthetic ADB: '+value);
  };
  const spawnFn=(cmd,args)=>{
    calls.push({cmd,args});
    assert.deepEqual(args.slice(0,6),['-s','emulator-5554','exec-in','run-as','ru.paseka.journal.diagnostic.restore','sh']);
    const child=new EventEmitter();
    child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
    child.stdin.on('data',part=>{streamed=Buffer.concat([streamed,part]);});
    child.stdin.on('finish',()=>queueMicrotask(()=>child.emit('close',0)));
    child.kill=()=>{};
    return child;
  };
  const res=await executeIsolatedTransfer({persistentRoot:root,adb,apk,aapt,spawnSyncFn:sync,spawnFn});
  assert.equal(res.status,'EMULATOR_ISOLATED_FILE_IMPORT_SHA_PASS_NOT_DB_RESTORE');
  assert.equal(res.sourceHashesComparedToEmulator,3);
  assert.equal(res.fullBackupVerified,false);
  assert.equal(res.physicalOnePlusAccess,'NOT_ATTEMPTED');
  assert.ok(streamed.includes(Buffer.from('private-placeholder')));
  assert.equal(streamed.length%512,0);
  assert.equal(calls.filter(x=>x.args.includes('install')).length,1);
  assert.ok(calls.every(x=>!x.args.includes('ABCDEF1234')));
  assert.deepEqual(await fs.readFile(join(db,'000001.log')),Buffer.from([1,2,3,4,5,6]));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('B01 v20 physical-target spoof is rejected before APK installation or TAR streaming',async()=>{
 const {root}=await fixture();
 try{
  const adb=join(root,'adb.exe'),apk=join(root,'B01-diagnostic.apk'),aapt=join(root,'aapt.exe');
  await Promise.all([adb,apk,aapt].map(x=>fs.writeFile(x,'synthetic')));
  const calls=[];
  const sync=(cmd,args)=>{
   calls.push(args);
   if(cmd===aapt)return {status:0,stdout:"package: name='ru.paseka.journal.diagnostic.restore'\napplication-label:'Paseka B01 Isolated Diagnostic'"};
   if(args[0]==='devices')return {status:0,stdout:'emulator-5554 device\n'};
   if(args.join(' ').includes('ro.kernel.qemu'))return {status:0,stdout:'0'};
   if(args.join(' ').includes('ro.hardware'))return {status:0,stdout:'qcom'};
   if(args.join(' ').includes('ro.build.fingerprint'))return {status:0,stdout:'OnePlus/NE2213'};
   if(args.join(' ').includes('emu avd name'))return {status:0,stdout:'PASEKA_B01_ISOLATED_TEST'};
   return {status:0,stdout:''};
  };
  await assert.rejects(
   executeIsolatedTransfer({persistentRoot:root,adb,apk,aapt,spawnSyncFn:sync,
     spawnFn:()=>{throw Error('NO BINARY STREAM SHOULD START');}}),
   /B01_BLOCKED_DEVICE_NOT_EMULATOR_HARDWARE/
  );
  assert.equal(calls.some(x=>x.includes('install')),false);
  assert.equal(calls.some(x=>x.includes('exec-in')),false);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
