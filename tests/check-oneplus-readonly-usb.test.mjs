import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseAdbBinary,parseOnePlusTarget,inspectConnectedOnePlus,inspectOnePlusFullExportPresence,inspectOnePlusPrivateDbAccessGate,inspectOnePlusIdbInventory} from '../scripts/check-oneplus-readonly-usb.mjs';
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

test('phone Downloads full-export filename scan counts only candidates, never discloses private names',async()=>{
 const calls=[];
 const command=(_,args)=>{
   calls.push(args.join(' '));
   if(args[0]==='devices')return 'List of devices attached\nUSB12345 device product:x\n';
   const k=args.slice(3).join(' ');
   const known={'getprop ro.kernel.qemu':'0','getprop ro.product.manufacturer':'OnePlus',
     'getprop ro.product.model':'NE2215',
     'pm path ru.paseka.journal':'package:/data/app/sample/base.apk',
     'ls -1 /sdcard/Download':'family-private.pdf\npaseka-full-idb-2026-11-25.json\nprivate.mp4'};
   if(!(k in known))throw Error('unknown command');
   return known[k];
 };
 const result=await inspectOnePlusFullExportPresence({binary:'fixture-adb',command});
 assert.equal(result.status,'PASS');
 assert.equal(result.code,'ONE_FULL_EXPORT_FILENAME_IN_PHONE_DOWNLOADS');
 assert.equal(result.proofLevel,'FILENAME_PRESENCE_ONLY_NOT_FILE_READBACK');
 assert.doesNotMatch(JSON.stringify(result),/private|USB12345|paseka-full-idb-2026/);
 assert.ok(calls.every(x=>!/(?:pull|install|clear|rm|cat|cp|mv|content query)/.test(x)));
 assert.ok(calls.some(x=>x.includes('ls -1 /sdcard/Download')));
});
test('phone Downloads scan missing or inaccessible remains NEEDS_INPUT/BLOCKED',async()=>{
 const make=(listing)=>(_,args)=>{
   if(args[0]==='devices')return 'List of devices attached\nUSB12345 device\n';
   const k=args.slice(3).join(' ');
   const values={'getprop ro.kernel.qemu':'0','getprop ro.product.manufacturer':'OnePlus',
     'getprop ro.product.model':'NE2215','pm path ru.paseka.journal':'package:/data/app/a/base.apk'};
   if(k==='ls -1 /sdcard/Download')return listing;
   if(k in values)return values[k];
   throw Error('unexpected');
 };
 const missing=await inspectOnePlusFullExportPresence({binary:'fixture',command:make('holiday.mp4')});
 assert.equal(missing.status,'NEEDS_INPUT');
 assert.equal(missing.code,'NO_FULL_EXPORT_FILENAME_IN_PHONE_DOWNLOADS');
 const multiple=await inspectOnePlusFullExportPresence({binary:'fixture',
   command:make('paseka-full-idb-2026-11-25.json\npaseka-full-idb-2026-11-24.json')});
 assert.equal(multiple.code,'MULTIPLE_FULL_EXPORT_FILENAMES_IN_PHONE_DOWNLOADS');
 const denied=await inspectOnePlusFullExportPresence({binary:'fixture',command:(binary,args)=>{
   if(args.slice(3).join(' ')==='ls -1 /sdcard/Download')throw Error('private filepath');
   return make('')(binary,args);
 }});
 assert.equal(denied.status,'BLOCKED');
 assert.equal(denied.code,'USB_EXPORT_LISTING_NOT_AVAILABLE');
});

test('B01 run-as gate confirms only installed app identity, never lists or copies private files', async()=>{
  const commands=[];
  const command=(_,argv)=>{
    commands.push(argv);
    if(argv[0]==='devices')return 'List of devices attached\nUSB12345 device\n';
    const key=argv.slice(3).join(' ');
    const known={
      'getprop ro.kernel.qemu':'0',
      'getprop ro.product.manufacturer':'OnePlus',
      'getprop ro.product.model':'NE2215',
      'pm path ru.paseka.journal':'package:/data/app/x/base.apk',
      'run-as ru.paseka.journal id':'uid=10123(u0_a123) gid=10123(u0_a123) groups=1015(sdcard_rw)'
    };
    if(!(key in known))throw Error('unexpected ADB command '+key);
    return known[key];
  };
  const result=await inspectOnePlusPrivateDbAccessGate({binary:'fixture',command});
  assert.deepEqual(result,{
    status:'PASS',code:'INSTALLED_APP_RUN_AS_IDENTITY_AVAILABLE',
    proofLevel:'RUN_AS_ID_ONLY_NO_DATABASE_ACCESS'
  });
  assert.ok(commands.some(args=>args.slice(3).join(' ')==='run-as ru.paseka.journal id'));
  assert.ok(commands.every(args=>!/(?:pull|install|rm|clear|tar|cat|find|ls|sqlite|cp|su)/.test(args.slice(3).join(' '))));
  assert.doesNotMatch(JSON.stringify(result),/USB12345|10123|sdcard_rw/);
});
test('B01 run-as unavailable on release app is NEEDS_INPUT, no debug bypass',async()=>{
  const calls=[];
  const command=(_,argv)=>{
    calls.push(argv);
    if(argv[0]==='devices')return 'List of devices attached\nUSB12345 device\n';
    const key=argv.slice(3).join(' ');
    if(key==='run-as ru.paseka.journal id')throw Error('run-as: package not debuggable');
    return {
      'getprop ro.kernel.qemu':'0','getprop ro.product.manufacturer':'OnePlus',
      'getprop ro.product.model':'NE2215',
      'pm path ru.paseka.journal':'package:/data/app/x/base.apk'
    }[key];
  };
  const result=await inspectOnePlusPrivateDbAccessGate({binary:'fixture',command});
  assert.equal(result.status,'NEEDS_INPUT');
  assert.equal(result.code,'INSTALLED_APP_RUN_AS_UNAVAILABLE');
  assert.ok(calls.every(args=>!args.includes('su')&&!args.includes('install')&&!args.includes('pull')));
});
test('B01 run-as malformed identity is BLOCKED, not a backup PASS',async()=>{
  const command=(_,argv)=>{
    if(argv[0]==='devices')return 'List of devices attached\nUSB12345 device\n';
    const key=argv.slice(3).join(' ');
    return {
      'getprop ro.kernel.qemu':'0','getprop ro.product.manufacturer':'OnePlus',
      'getprop ro.product.model':'NE2215',
      'pm path ru.paseka.journal':'package:/data/app/x/base.apk',
      'run-as ru.paseka.journal id':'run-as: permission denied'
    }[key];
  };
  const result=await inspectOnePlusPrivateDbAccessGate({binary:'fixture',command});
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.code,'RUN_AS_IDENTITY_NOT_ATTESTED');
});
test('B01 run-as gate refuses wrong hardware before invoking run-as',async()=>{
  const commands=[];
  const command=(_,argv)=>{
    commands.push(argv.slice(3).join(' '));
    if(argv[0]==='devices')return 'List of devices attached\nUSB12345 device\n';
    const key=argv.slice(3).join(' ');
    return {
      'getprop ro.kernel.qemu':'1',
      'getprop ro.product.manufacturer':'OnePlus',
      'getprop ro.product.model':'NE2215'
    }[key];
  };
  const result=await inspectOnePlusPrivateDbAccessGate({binary:'fixture',command});
  assert.equal(result.status,'NEEDS_INPUT');
  assert.equal(result.code,'PRIVATE_DB_GATE_REQUIRES_ATTESTED_ONEPLUS');
  assert.ok(!commands.some(s=>s.includes('run-as')));
});

test('B01 WebView inventory reads only fixed directory metadata after successful identity gate',async()=>{
 const calls=[];
 const command=(_,args)=>{
   calls.push(args);
   if(args[0]==='devices')return 'List of devices attached\nUSB12345 device\n';
   const key=args.slice(3).join(' ');
   const known={
     'getprop ro.kernel.qemu':'0',
     'getprop ro.product.manufacturer':'OnePlus',
     'getprop ro.product.model':'NE2215',
     'pm path ru.paseka.journal':'package:/data/app/x/base.apk',
     'run-as ru.paseka.journal id':'uid=10123(u0_a123) gid=10123(u0_a123) groups=1015(sdcard_rw)',
     'run-as ru.paseka.journal ls -1 app_webview/Default/IndexedDB':'https_private_origin_0.indexeddb.leveldb',
     'run-as ru.paseka.journal ls -1 app_webview/IndexedDB':'',
     'run-as ru.paseka.journal ls -1 app_webview/Default/Local Storage/leveldb':'LOG'
   };
   if(!(key in known))throw Error('unsupported');
   return known[key];
 };
 const result=await inspectOnePlusIdbInventory({binary:'fixture',command});
 assert.equal(result.status,'PASS');
 assert.equal(result.code,'WEBVIEW_STORAGE_DIRECTORY_ENTRIES_PRESENT');
 assert.equal(result.proofLevel,'DIRECTORY_METADATA_ONLY_NOT_BACKUP');
 assert.doesNotMatch(JSON.stringify(result),/private|https|leveldb|LOG|USB12345|10123/);
 const privateCommands=calls.map(args=>args.slice(3)).filter(args=>args[0]==='run-as');
 assert.deepEqual(privateCommands.map(args=>args.slice(2,4).join(' ')),
  ['','ls -1','ls -1','ls -1'].map(x=>x)); 
 assert.ok(privateCommands.every(args=>
   (args.length===3&&args[2]==='id') ||
   (args.length===5&&args[2]==='ls'&&args[3]==='-1')));
 assert.ok(calls.every(args=>!args.includes('pull')&&!args.includes('install')&&!args.includes('cat')&&!args.includes('tar')&&!args.includes('rm')));
});
test('B01 WebView inventory cannot bypass run-as or claim database absent',async()=>{
 const commands=[];
 const command=(_,args)=>{
   commands.push(args);
   if(args[0]==='devices')return 'List of devices attached\nUSB12345 device\n';
   const key=args.slice(3).join(' ');
   const known={
     'getprop ro.kernel.qemu':'0',
     'getprop ro.product.manufacturer':'OnePlus',
     'getprop ro.product.model':'NE2215',
     'pm path ru.paseka.journal':'package:/data/app/x/base.apk'
   };
   if(key==='run-as ru.paseka.journal id')throw Error('package is not debuggable');
   return known[key];
 };
 const result=await inspectOnePlusIdbInventory({binary:'fixture',command});
 assert.equal(result.status,'NEEDS_INPUT');
 assert.equal(result.code,'PRIVATE_STORE_INVENTORY_REQUIRES_RUN_AS');
 assert.ok(!commands.some(args=>args.includes('ls')));
});
test('B01 WebView inventory unavailable directories do not imply database destroyed',async()=>{
 const command=(_,args)=>{
   if(args[0]==='devices')return 'List of devices attached\nUSB12345 device\n';
   const key=args.slice(3).join(' ');
   const known={
     'getprop ro.kernel.qemu':'0','getprop ro.product.manufacturer':'OnePlus',
     'getprop ro.product.model':'NE2215',
     'pm path ru.paseka.journal':'package:/data/app/x/base.apk',
     'run-as ru.paseka.journal id':'uid=10123(u0_a123) gid=10123(u0_a123)'
   };
   if(key.startsWith('run-as ru.paseka.journal ls'))throw Error('No such file or directory: private name');
   return known[key];
 };
 const result=await inspectOnePlusIdbInventory({binary:'fixture',command});
 assert.equal(result.status,'NEEDS_INPUT');
 assert.equal(result.code,'WEBVIEW_CANDIDATE_DIRECTORIES_UNAVAILABLE');
 assert.doesNotMatch(JSON.stringify(result),/No such|private name/);
});
