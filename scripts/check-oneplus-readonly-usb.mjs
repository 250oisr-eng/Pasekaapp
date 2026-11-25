// B04: Conservative OnePlus USB probe. Metadata only; no private data, no install,
// no APK pull, no UI interaction, no backups or live IndexedDB access.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function chooseAdbBinary({platform=process.platform,env=process.env,home=homedir(),exists=existsSync}={}){
 const exe=platform==='win32'?'adb.exe':'adb';
 const roots=[env.ANDROID_SDK_ROOT,env.ANDROID_HOME,
   platform==='win32'?join(home,'AppData','Local','Android','Sdk'):join(home,'Android','Sdk')];
 for(const root of roots.filter(Boolean)){
   const path=join(root,'platform-tools',exe);
   if(exists(path))return path;
 }
 return null; // Never call a random executable named adb from current working directory.
}

export function parseOnePlusTarget(output){
 const entries=String(output).split(/\r?\n/).slice(1).filter(s=>s.trim());
 // No wireless / tcp serials, unauthorised devices, or emulators. A second
 // unauthorized or online device means the target is ambiguous: fail closed.
 if(entries.length===0)return {status:'NEEDS_INPUT',code:'USB_PHONE_NOT_CONNECTED'};
 if(entries.length!==1)return {status:'NEEDS_INPUT',code:'MULTIPLE_OR_UNAUTHORIZED_ADB_DEVICES'};
 const match=/^(\S+)\s+(device)(?:\s|$)/.exec(entries[0]);
 if(!match)return {status:'NEEDS_INPUT',code:'USB_DEBUG_AUTHORIZATION_REQUIRED'};
 const serial=match[1];
 if(serial.startsWith('emulator-')||serial.includes(':')||
    !/^[a-zA-Z0-9_-]{4,128}$/.test(serial))
   return {status:'NEEDS_INPUT',code:'USB_TARGET_NOT_SINGLE_PHYSICAL_DEVICE'};
 return {status:'READY',serial};
}
function defaultCommand(binary,args){
 return execFileSync(binary,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],
    timeout:10000,maxBuffer:1024*1024}).trim();
}
function safeString(v){return String(v||'').trim();}
export async function inspectConnectedOnePlus({binary,command=defaultCommand}={}){
 if(!binary)return {status:'NEEDS_INPUT',code:'ADB_PLATFORM_TOOLS_NOT_FOUND',proofLevel:'NOT_VERIFIED'};
 let target;
 try{target=parseOnePlusTarget(command(binary,['devices','-l']));}
 catch{return {status:'BLOCKED',code:'ADB_DEVICES_COMMAND_FAILED',proofLevel:'NOT_VERIFIED'};}
 if(target.status!=='READY')return {...target,proofLevel:'NOT_VERIFIED'};
 const cmd=(...args)=>safeString(command(binary,['-s',target.serial,'shell',...args]));
 try{
   const qemu=cmd('getprop','ro.kernel.qemu');
   const maker=cmd('getprop','ro.product.manufacturer');
   const model=cmd('getprop','ro.product.model');
   // Note: The package is not read at all until hardware is positively attested.
   if(qemu==='1'||maker.toLowerCase()!=='oneplus'||
      !/^(?:NE221[0-9A-Z]*|OnePlus 10 Pro(?: 5G)?)$/i.test(model))
     return {status:'BLOCKED',code:'DEVICE_IS_NOT_CONFIRMED_ONEPLUS_10_PRO',proofLevel:'NOT_VERIFIED'};
   const paths=cmd('pm','path','ru.paseka.journal');
   if(!/^package:\/\S+\/base\.apk$/m.test(paths))
     return {status:'NEEDS_INPUT',code:'EXPECTED_PASEKA_APP_NOT_FOUND',proofLevel:'NOT_VERIFIED'};
   return {status:'PASS',code:'ONEPLUS_10_PRO_INSTALLED_PACKAGE_METADATA_ONLY',
      proofLevel:'USB_DEVICE_PACKAGE_METADATA_ONLY'};
 }catch{return {status:'BLOCKED',code:'USB_DEVICE_METADATA_PROBE_FAILED',proofLevel:'NOT_VERIFIED'};}
}

export async function inspectOnePlusFullExportPresence({binary,command=defaultCommand}={}) {
  // Only metadata. The names returned by ADB must never enter a report.
  const verified=await inspectConnectedOnePlus({binary,command});
  if(verified.status!=='PASS')return {
    status:'NEEDS_INPUT',code:'FULL_EXPORT_SCAN_REQUIRES_ATTESTED_ONEPLUS',
    proofLevel:'NOT_VERIFIED'};
  let target;
  try{target=parseOnePlusTarget(command(binary,['devices','-l']));}
  catch{return {status:'BLOCKED',code:'USB_EXPORT_LISTING_NOT_AVAILABLE',proofLevel:'NOT_VERIFIED'};}
  if(target.status!=='READY')return {status:'NEEDS_INPUT',code:'USB_TARGET_CHANGED_DURING_PROBE',proofLevel:'NOT_VERIFIED'};
  try {
    const raw=String(command(binary,['-s',target.serial,'shell','ls','-1','/sdcard/Download']));
    const count=raw.split(/\r?\n/).filter(name=>
      /^paseka-full-idb-\d{4}-\d{2}-\d{2}(?:\s*\(\d+\))?\.json$/i.test(name.trim())).length;
    return {
      status:count===1?'PASS':'NEEDS_INPUT',
      code:count===0?'NO_FULL_EXPORT_FILENAME_IN_PHONE_DOWNLOADS':
        count===1?'ONE_FULL_EXPORT_FILENAME_IN_PHONE_DOWNLOADS':
        'MULTIPLE_FULL_EXPORT_FILENAMES_IN_PHONE_DOWNLOADS',
      proofLevel:'FILENAME_PRESENCE_ONLY_NOT_FILE_READBACK'
    };
  }catch{return {status:'BLOCKED',code:'USB_EXPORT_LISTING_NOT_AVAILABLE',proofLevel:'NOT_VERIFIED'};}
}

/**
 * B01: attested installed-app sandbox access eligibility, without reading
 * any private app file. 'run-as <package> id' can only inspect the active
 * shell identity; this intentionally does NOT execute ls, find, cat, tar,
 * sqlite3, cp, pull or any command that touches user records.
 *
 * PASS means only that OS allowed the identity-switch command. It does NOT
 * prove backup, IndexedDB origin, usable WebView, or video copies.
 */
export async function inspectOnePlusPrivateDbAccessGate({binary,command=defaultCommand}={}) {
  const attested=await inspectConnectedOnePlus({binary,command});
  if(attested.status!=='PASS')return {
    status:'NEEDS_INPUT',code:'PRIVATE_DB_GATE_REQUIRES_ATTESTED_ONEPLUS',
    proofLevel:'NOT_VERIFIED'
  };
  let target;
  try{target=parseOnePlusTarget(command(binary,['devices','-l']));}
  catch{return {status:'BLOCKED',code:'PRIVATE_DB_GATE_DEVICE_NOT_AVAILABLE',proofLevel:'NOT_VERIFIED'};}
  if(target.status!=='READY')return {
    status:'NEEDS_INPUT',code:'USB_TARGET_CHANGED_DURING_GATE',proofLevel:'NOT_VERIFIED'
  };
  try{
    const raw=String(command(binary,[
      '-s',target.serial,'shell','run-as','ru.paseka.journal','id'
    ]));
    if(!/^uid=[0-9]+[(][^)]{1,120}[)][ \t]+gid=[0-9]+[(]/.test(raw.trim()))
      return {status:'BLOCKED',code:'RUN_AS_IDENTITY_NOT_ATTESTED',proofLevel:'NOT_VERIFIED'};
    return {
      status:'PASS',code:'INSTALLED_APP_RUN_AS_IDENTITY_AVAILABLE',
      proofLevel:'RUN_AS_ID_ONLY_NO_DATABASE_ACCESS'
    };
  }catch{
    // Most release APKs are non-debuggable; no fallback to root, su,
    // alternate package ID, shell sandbox bypass, or app modification.
    return {status:'NEEDS_INPUT',code:'INSTALLED_APP_RUN_AS_UNAVAILABLE',
      proofLevel:'NOT_VERIFIED'};
  }
}

/**
 * B01 read-only private storage metadata inventory.
 * Lists only fixed WebView IndexedDB candidate directories, discards their
 * contents immediately, and reports fixed status codes (no names or paths).
 * run-as must first be allowed by the installed package on the attested USB
 * OnePlus. It never opens a database, reads file bytes, or creates a copy.
 */
export async function inspectOnePlusIdbInventory({binary,command=defaultCommand}={}) {
  const gate=await inspectOnePlusPrivateDbAccessGate({binary,command});
  if(gate.code!=='INSTALLED_APP_RUN_AS_IDENTITY_AVAILABLE')
    return {status:'NEEDS_INPUT',code:'PRIVATE_STORE_INVENTORY_REQUIRES_RUN_AS',proofLevel:'NOT_VERIFIED'};
  let target;
  try{target=parseOnePlusTarget(command(binary,['devices','-l']));}
  catch{return {status:'BLOCKED',code:'PRIVATE_STORE_INVENTORY_TARGET_LOST',proofLevel:'NOT_VERIFIED'};}
  if(target.status!=='READY')
    return {status:'NEEDS_INPUT',code:'PRIVATE_STORE_INVENTORY_TARGET_CHANGED',proofLevel:'NOT_VERIFIED'};
  const candidates=[
    'app_webview/Default/IndexedDB',
    'app_webview/IndexedDB',
    'app_webview/Default/Local Storage/leveldb'
  ];
  let accessible=0;
  let nonEmpty=0;
  // No shell scripts, glob expansion, find, cat, tar, pull, file reads or
  // filesystem modification. Each command is a fixed readonly ls -1.
  for(const relative of candidates){
    try{
      const entries=String(command(binary,[
        '-s',target.serial,'shell','run-as','ru.paseka.journal',
        'ls','-1',relative
      ])).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
      accessible++;
      if(entries.length>0)nonEmpty++;
    }catch{
      // Missing path or permission is not evidence of an empty or
      // nonexistent IndexedDB in another profile or WebView version.
    }
  }
  if(accessible===0)
    return {status:'NEEDS_INPUT',code:'WEBVIEW_CANDIDATE_DIRECTORIES_UNAVAILABLE',proofLevel:'NOT_VERIFIED'};
  return {
    status:'PASS',
    code:nonEmpty>0?'WEBVIEW_STORAGE_DIRECTORY_ENTRIES_PRESENT':'WEBVIEW_STORAGE_CANDIDATES_EMPTY',
    proofLevel:'DIRECTORY_METADATA_ONLY_NOT_BACKUP'
  };
}
