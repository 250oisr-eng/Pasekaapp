// B01 CI ONLY — synthetic data. Verifies actual ADB exec-in/run-as TAR and
// sha256sum transfer path on a fresh isolated emulator, never on a physical device.
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {executeIsolatedTransfer} from './transfer-to-emulator.mjs';

async function main(){
 const root=await fs.mkdtemp(join(tmpdir(),'paseka-b01-ci-emulator-only-'));
 try{
  const fileRoot=join(root,'pc-reconstruction-11111111111111111111111111111111',
    'app_webview','Default','IndexedDB','https_localhost_0.indexeddb.leveldb');
  await fs.mkdir(fileRoot,{recursive:true});
  await fs.writeFile(join(fileRoot,'CURRENT'),'MANIFEST-000001\n');
  await fs.writeFile(join(fileRoot,'MANIFEST-000001'),Buffer.from('SYNTHETIC_TEST_ONLY'));
  await fs.writeFile(join(fileRoot,'000001.log'),Buffer.from([0,255,13,10,0,1,2,3,4,5]));
  const report=await executeIsolatedTransfer({
   persistentRoot:root,adb:process.env.B01_CI_ADB,apk:process.env.B01_CI_APK,
   aapt:process.env.B01_CI_AAPT
  });
  if(report.status!=='EMULATOR_ISOLATED_FILE_IMPORT_SHA_PASS_NOT_DB_RESTORE'||
     report.sourceHashesComparedToEmulator!==3||report.verified!==true||
     report.fullBackupVerified!==false || report.physicalOnePlusAccess!=='NOT_ATTEMPTED'){
    throw Error('B01_CI_ADB_EMULATOR_READBACK_UNVERIFIED');
  }
  console.log('B01_REAL_ADB_EMULATOR_SYNTHETIC_TRANSFER_SHA_PASS_NO_PRIVATE_DATA');
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
main().catch(e=>{console.error(String(e.message).startsWith('B01_BLOCKED_')?
 e.message:'B01_EMULATOR_CI_FAILED_REDACTED');process.exitCode=1;});
