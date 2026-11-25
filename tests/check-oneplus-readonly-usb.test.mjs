import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseAdbBinary,parseOnePlusTarget,inspectConnectedOnePlus} from '../scripts/check-oneplus-readonly-usb.mjs';
import {executeChecks} from '../scripts/paseka-check-hub.mjs';

test('USB probe refuses zero, offline, unauthorized, emulator and multiple ADB devices',()=>{
 assert.equal(parseOnePlusTarget('List of devices attached\n').code,'USB_PHONE_NOT_CONNECTED');
 assert.equal(parseOnePlusTarget('List of devices attached\nSERIAL00001 unauthorized\n').code,'USB_DEBUG_AUTHORIZATION_REQUIRED');
 assert.equal(parseOnePlusTarget('List of devices attached\nemulator-5554 device\n').code,'USB_TARGET_NOT_SINGLE_PHYSICAL_DEVICE');
 assert.equal(parseOnePlusTarget('List of devices attached\nPHONE10001 device\nemulator-5554 device\n').code,'MULTIPLE_OR_UNAUTHORIZED_ADB_DEVICES');
 assert.equal(parseOnePlusTarget('List of devices attached\n192.168.1.2:5555 device\n').code,'USB_TARGET_NOT_SINGLE_PHYSICAL_DEVICE');
});
test('USB probe without ADB is a nonfatal missing input, not a device proof',async()=>{
 const outcome=await inspectConnectedOnePlus();
 assert.equal(outcome.code,'ADB_PLATFORM_TOOLS_NOT_FOUND');
 assert.equal(outcome.proofLevel,'NOT_VERIFIED');
});
test('metadata-only probe first attests hardware then checks installed package',async()=>{
 const calls=[];
 const command=(_,args)=>{
  calls.push(args);
  if(args[0]==='devices')return 'List of devices attached\nUSB12345 device product:x\n';
  const k=args.slice(3).join(' ');
  if(k==='getprop ro.kernel.qemu')return '0';
  if(k==='getprop ro.product.manufacturer')return 'OnePlus';
  if(k==='getprop ro.product.model')return 'NE2215';
  if(k==='pm path ru.paseka.journal')return 'package:/data/app/placeholder/ru.paseka.journal/base.apk';
  throw Error('unexpected command '+k);
 };
 const result=await inspectConnectedOnePlus({binary:'adb-fixture',command});
 assert.equal(result.status,'PASS');
 assert.equal(result.proofLevel,'USB_DEVICE_PACKAGE_METADATA_ONLY');
 assert.equal(calls.length,5);
 assert.ok(calls.every(x=>!x.includes('install')&&!x.includes('pull')&&!x.includes('clear')));
 assert.ok(calls.slice(1).every(x=>x[0]==='-s'&&x[1]==='USB12345'));
});
test('wrong physical model refuses package lookup',async()=>{
 const calls=[];
 const command=(_,args)=>{
  calls.push(args);
  if(args[0]==='devices')return 'List of devices attached\nUSB12345 device\n';
  const k=args.slice(3).join(' ');
  if(k==='getprop ro.kernel.qemu')return '0';
  if(k==='getprop ro.product.manufacturer')return 'Samsung';
  if(k==='getprop ro.product.model')return 'SM-G991B';
  throw Error('no package probe permitted');
 };
 const result=await inspectConnectedOnePlus({binary:'fixture',command});
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.code,'DEVICE_IS_NOT_CONFIRMED_ONEPLUS_10_PRO');
 assert.ok(calls.every(x=>!x.includes('pm')));
});
test('ADB failure does not leak serial, device ID or private paths',async()=>{
 const outcome=await inspectConnectedOnePlus({binary:'fixture',command:()=>{
  throw Error('USB12345 /home/alice/private/paseka.mov');
 }});
 assert.equal(outcome.status,'BLOCKED');
 assert.doesNotMatch(JSON.stringify(outcome),/USB12345|private|alice/);
});
test('missing installed Paseka APK remains not verified',async()=>{
 const command=(_,args)=>{
  if(args[0]==='devices')return 'List of devices attached\nUSB12345 device\n';
  const key=args.slice(3).join(' ');
  const values={'getprop ro.kernel.qemu':'0','getprop ro.product.manufacturer':'OnePlus',
    'getprop ro.product.model':'OnePlus 10 Pro','pm path ru.paseka.journal':''};
  return values[key];
 };
 const outcome=await inspectConnectedOnePlus({binary:'fixture',command});
 assert.equal(outcome.status,'NEEDS_INPUT');
 assert.equal(outcome.code,'EXPECTED_PASEKA_APP_NOT_FOUND');
});
test('hub refuses arbitrary metadata-only device function while permitting named audited implementation',async()=>{
 await assert.rejects(executeChecks({bundleRoot:process.cwd(),checks:[{
  id:'surprise-device-step',readOnly:true,deviceAccess:'METADATA_ONLY',networkAccess:false,
  run:async()=>({status:'PASS',code:'NOT_ALLOWED',proofLevel:'UNKNOWN'})
 }]}),/UNSAFE_CHECK_REGISTRY/);
});
test('ADB binary selection uses only known Android SDK locations, never PATH or current directory',()=>{
 assert.equal(chooseAdbBinary({platform:'win32',env:{},home:'C:/Users/Test',exists:()=>false}),null);
 const path=chooseAdbBinary({platform:'win32',env:{ANDROID_HOME:'C:/sdk'},home:'C:/Users/Test',exists:()=>true});
 assert.match(path,/platform-tools[\\/]adb\.exe$/);
});
