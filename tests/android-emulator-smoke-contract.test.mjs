import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const script=readFileSync('scripts/android-emulator-smoke.sh','utf8');
const workflow=readFileSync('.github/workflows/android-emulator-smoke.yml','utf8');
const prepare=readFileSync('scripts/prepare-p0-emulator-build.mjs','utf8');

test('emulator smoke refuses non-emulator or unidentified devices before install or mutation',()=>{
 assert.match(script,/emulator-\[0-9\]/);
 assert.match(script,/getprop ro\.kernel\.qemu/);
 assert.match(script,/QEMU.*"1"/s);
 assert.match(script,/API.*"35"/s);
 const guard=script.indexOf('QEMU="$(adb_safe shell getprop ro.kernel.qemu');
 const install=script.indexOf('adb_safe install -r');
 assert.ok(guard>=0&&install>guard);
 assert.doesNotMatch(script,/adb_safe shell (?:pm clear|rm |wipe|reboot|am broadcast.*DELETE)/);
});
test('emulator smoke uses only a disposable APK and does not authorize cleanup',()=>{
 assert.match(script,/PACKAGE="ru\.paseka\.journal"/);
 assert.match(script,/COLD_START_ON_EMULATOR/);
 assert.match(script,/OFFLINE_RESTART_ON_EMULATOR/);
 assert.match(script,/svc wifi disable/);
 assert.match(script,/svc data disable/);
 assert.match(script,/UNVERIFIED: physical_device/);
 assert.doesNotMatch(script,/adb_safe uninstall/);
});
test('emulator CI is isolated from production deployment and explicitly pins API35',()=>{
 assert.match(workflow,/reactivecircus\/android-emulator-runner@v2/);
 assert.match(workflow,/api-level: 35/);
 assert.match(workflow,/on:\s*\n  workflow_dispatch:/);
 assert.match(workflow,/pull_request:/);
 assert.match(workflow,/bash scripts\/android-emulator-smoke\.sh/);
 assert.doesNotMatch(workflow,/\b(?:deployment|production|release|publish|merge_pull_request)\b/i);
 for(const prop of ['minSdkVersion','compileSdkVersion','targetSdkVersion'])
   assert.ok(prepare.includes(prop));
 assert.match(prepare,/prefix\+'35'/);
});
