// CI-only actual Android emulator proof of the transport used by B01.
// Public constants only; no run-as, app install, TAR, private files or writes.
// adb -e chooses only an emulator, never a phone connected to the runner.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const MAX=16*1024;
function remote(script){
 const r=spawnSync('adb',['-e','shell','-T','sh','-c',`'${script}'`],{
   shell:false,encoding:null,timeout:25_000,maxBuffer:MAX,stdio:['ignore','pipe','pipe']
 });
 if(r.error)throw Error('ADB_EMULATOR_SHELLV2_UNAVAILABLE');
 assert.equal(r.signal,null,'ADB_EMULATOR_SIGNALLED');
 assert.equal(typeof r.status,'number','ADB_REMOTE_EXIT_UNKNOWN');
 return {exit:r.status,stdout:r.stdout.toString('utf8'),stderr:r.stderr.toString('utf8')};
}
const dual=remote('printf PASEKA_SHELL_V2_STDOUT; printf PASEKA_SHELL_V2_STDERR >&2; exit 42');
assert.equal(dual.exit,42,'REMOTE_EXIT_WAS_LOST');
assert.equal(dual.stdout,'PASEKA_SHELL_V2_STDOUT','STDOUT_CONTAMINATED');
assert.equal(dual.stderr,'PASEKA_SHELL_V2_STDERR','STDERR_NOT_SEPARATE');
const payload='PASEKA_BASE64_PROBE_V1';
const encoded=remote(`set -o pipefail; printf ${payload} | base64`);
assert.equal(encoded.exit,0,'ANDROID_PIPEFAIL_OR_BASE64_FAILED');
assert.equal(encoded.stderr,'','UNEXPECTED_REMOTE_STDERR');
const decoded=encoded.stdout.replace(/[\\r\\n]/g,'');
assert.equal(decoded,Buffer.from(payload,'ascii').toString('base64'),'BASE64_PAYLOAD_MISMATCH');
console.log('PASS: Android API35 shell -T kept stdout/stderr separate, propagated remote exit 42 and transmitted exact public Base64 with pipefail. No app data or TAR accessed.');
