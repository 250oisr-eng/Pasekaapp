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
