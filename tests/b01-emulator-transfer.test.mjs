import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {collectV16IndexedDb,tarBytes,classifyEmulator,ensureExpectedApp,validateAdbDeviceList} from '../tools/b01-isolated-diagnostic/transfer-to-emulator.mjs';

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
