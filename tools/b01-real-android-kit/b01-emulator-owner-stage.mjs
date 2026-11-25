// B01: Windows/Node offline local bridge to a running Android EMULATOR ONLY.
// No APK install, no phone commands, no network, no archive upload or deletion.
// Owner must separately inspect the diagnostic APK and start emulator API35.
import { readdir, lstat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERIAL='emulator-5554';
const PACKAGE='ru.paseka.journal.disasterproof2';
const SOURCE_BYTES=299687;
const SOURCE_HASH='049cec79d7e0a49c5fc2ca33f81d0b9871ca141e8fdf58aecbdd2307c37c98ff';
const REMOTE='/sdcard/Download/PASEKA-B01-OWNER-ARCHIVE-20261125.json';
const report=(status,code,extra={})=>Object.freeze({
 gate:'B01_OWNER_ANDROID_EMULATOR_LOCAL_ONLY',status,code,
 originalArchive:'UNMODIFIED',productionPackage:'NOT_ACCESSED',
 phoneAccess:'NOT_ATTEMPTED',userArchiveUploaded:false,...extra
});
function ensure(ok,code){if(!ok)throw Error(code);}
async function sha(path){
 const hash=createHash('sha256');
 for await(const chunk of createReadStream(path,{highWaterMark:128*1024}))hash.update(chunk);
 return hash.digest('hex');
}
export async function findOriginal(root){
 const items=await readdir(root,{withFileTypes:true});
 const matches=[];
 for(const entry of items){
  if(!entry.isFile()||!/^paseka-idb-full-[A-Za-z0-9_-]+\.json$/i.test(entry.name))continue;
  const path=join(root,entry.name),stat=await lstat(path);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==SOURCE_BYTES)continue;
  if((await sha(path))===SOURCE_HASH)matches.push(path);
 }
 ensure(matches.length===1,'SOURCE_NOT_UNIQUELY_VERIFIED');
 return matches[0];
}
export function inspectEmulator(run){
 const args=(...cmd)=>String(run(cmd)).trim();
 ensure(args('-s',SERIAL,'get-state')==='device','EMULATOR_NOT_CONNECTED');
 ensure(args('-s',SERIAL,'shell','getprop','ro.kernel.qemu')==='1','TARGET_NOT_EMULATOR');
 const sdk=args('-s',SERIAL,'shell','getprop','ro.build.version.sdk');
 ensure(sdk==='35','ANDROID_API_NOT_35');
 const pkg=args('-s',SERIAL,'shell','pm','path',PACKAGE);
 ensure(pkg.includes('package:')&&pkg.includes(PACKAGE),'DIAGNOSTIC_PACKAGE_NOT_INSTALLED');
 return true;
}
export async function runGate({root,mode,run}){
 ensure(mode==='--probe'||mode==='--stage','MODE_REQUIRED');
 inspectEmulator(run);
 const original=await findOriginal(root);
 if(mode==='--probe')return report('READY_EMULATOR_AND_ARCHIVE','NO_DATA_TRANSFER');
 const exists=String(run(['-s',SERIAL,'shell',
  'if [ -e '+REMOTE+' ]; then echo EXISTS; else echo ABSENT; fi'])).trim();
 ensure(exists==='ABSENT','REMOTE_TARGET_NOT_PROVEN_ABSENT');
 run(['-s',SERIAL,'push',original,REMOTE]);
 const remoteHash=String(run(['-s',SERIAL,'shell','sha256sum',REMOTE])).trim().split(/\s+/)[0];
 ensure(remoteHash===SOURCE_HASH,'REMOTE_COPY_SHA_MISMATCH');
 // Re-read the PC original after copy, so a concurrent alteration fails closed.
 ensure((await sha(original))===SOURCE_HASH,'LOCAL_SOURCE_CHANGED_DURING_TRANSFER');
 const output=String(run(['-s',SERIAL,'shell','monkey','-p',PACKAGE,'-c',
  'android.intent.category.LAUNCHER','1']));
 ensure(/Events injected:\s*1/.test(output),'DIAGNOSTIC_APP_LAUNCH_NOT_CONFIRMED');
 return report('PASS_EMULATOR_COPY_HASH_MATCH_NOT_RESTORED','SELECT_FILE_IN_DIAGNOSTIC_UI',{
  bytes:SOURCE_BYTES,emulatorTarget:'CONFIRMED_QEMU_API35',
  targetPackage:PACKAGE,androidRestore:'NOT_TESTED',processRestart:'NOT_TESTED'
 });
}
function cliRun(args){
 const adb=process.env.ADB_PATH||'adb';
 return execFileSync(adb,args,{timeout:15000,maxBuffer:256*1024,encoding:'utf8',
  windowsHide:true,stdio:['ignore','pipe','pipe']});
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const root=join(process.env.LOCALAPPDATA||'', 'PasekaB01LocalBackups');
 try{
  ensure(!!process.env.LOCALAPPDATA,'LOCALAPPDATA_UNAVAILABLE');
  const outcome=await runGate({root,mode:process.argv[2],run:cliRun});
  process.stdout.write('PASEKA_B01_REPORT '+JSON.stringify(outcome)+'\n');
 }catch(e){
  const code=/^[A-Z0-9_]{5,90}$/.test(String(e?.message||''))?e.message:'LOCAL_EMULATOR_GATE_FAILED';
  process.stdout.write('PASEKA_B01_REPORT '+JSON.stringify(report('BLOCKED',code))+'\n');
  process.exitCode=1;
 }
}
