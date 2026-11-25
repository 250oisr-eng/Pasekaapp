import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectEmulator,runGate} from '../tools/b01-real-android-kit/b01-emulator-owner-stage.mjs';
const valid=(argv)=>{
 const cmd=argv.join(' ');
 if(cmd.endsWith('get-state'))return 'device\n';
 if(cmd.endsWith('getprop ro.kernel.qemu'))return '1\n';
 if(cmd.endsWith('getprop ro.build.version.sdk'))return '35\n';
 if(cmd.includes('pm path'))return 'package:/data/app/ru.paseka.journal.disasterproof2-123/base.apk\n';
 if(cmd.endsWith('settings get global airplane_mode_on'))return '1\n';
 if(cmd.endsWith('shell ip route'))return '10.0.2.0/24 dev eth0\n';
 throw Error('unexpected adb command in preflight test: '+cmd);
};
test('emulator-only guard uses explicit serial and requires qemu/API35/test package',()=>{
 assert.equal(inspectEmulator(valid),true);
 assert.throws(()=>inspectEmulator(a=>a.join(' ').includes('ro.kernel.qemu')?'0':valid(a)),/TARGET_NOT_EMULATOR/);
 assert.throws(()=>inspectEmulator(a=>a.join(' ').includes('ro.build.version.sdk')?'34':valid(a)),/ANDROID_API_NOT_35/);
 assert.throws(()=>inspectEmulator(a=>a.join(' ').includes('pm path')?'':valid(a)),/DIAGNOSTIC_PACKAGE_NOT_INSTALLED/);
 assert.throws(()=>inspectEmulator(a=>a.join(' ').includes('airplane_mode_on')?'0':valid(a)),/EMULATOR_AIRPLANE_MODE_REQUIRED/);
 assert.throws(()=>inspectEmulator(a=>a.join(' ').endsWith('shell ip route')?'default via 10.0.2.2 dev eth0':valid(a)),/EMULATOR_NETWORK_ROUTE_PRESENT/);
});
test('real-PC archive gating fails closed when source is absent',async()=>{
 const root=await mkdtemp(join(tmpdir(),'b01-emulator-test-'));
 try{
  const res=runGate({root,mode:'--probe',run:valid});
  await assert.rejects(res,/SOURCE_NOT_UNIQUELY_VERIFIED/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('invalid mode cannot stage any data to emulator',async()=>{
 let called=0;
 await assert.rejects(runGate({root:'irrelevant',mode:'--surprise',
  run:()=>{called++;throw Error('adb must not be called');}}),/MODE_REQUIRED/);
 assert.equal(called,0);
});
