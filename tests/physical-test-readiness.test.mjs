import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPhysicalReadiness,PHYSICAL_STAGES} from '../scripts/physical-test-readiness.mjs';
import {executeChecks,runAndSave,HUB_SCHEMA} from '../scripts/paseka-check-hub.mjs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const basic=(overrides={})=>({
 schema:HUB_SCHEMA,
 checks:{
  'oneplus-usb-metadata':{status:'NEEDS_INPUT',code:'USB_PHONE_NOT_CONNECTED',proofLevel:'NOT_VERIFIED'},
  'full-indexeddb-export':{status:'NEEDS_INPUT',code:'FULL_EXPORT_NOT_FOUND',proofLevel:'NOT_VERIFIED'},
  ...overrides
 }
});

test('S0-S7 are exhaustive and absent physical evidence never becomes PASS',()=>{
 const output=assessPhysicalReadiness(basic());
 assert.deepEqual(Object.keys(output.steps),[...PHYSICAL_STAGES]);
 assert.equal(output.steps.S0_USB_IDENTITY.status,'NEEDS_INPUT');
 assert.equal(output.steps.S1_FULL_ARCHIVE.status,'BLOCKED');
 assert.equal(output.steps.S2_DISPOSABLE_RECOVERY.status,'NOT_TESTED');
 assert.equal(output.steps.S3_EXTERNAL_ORIGINALS.status,'BLOCKED');
 assert.equal(output.steps.S4_SIGNER_AND_ROLLBACK.status,'BLOCKED');
 assert.equal(output.steps.S5_COLD_OFFLINE.status,'NOT_TESTED');
 assert.equal(output.steps.S6_REAL_VIDEO_PIPELINE.status,'FROZEN');
 assert.equal(output.steps.S7_LOCAL_REPORT.status,'NOT_TESTED');
 assert.equal(output.deviceWritePermitted,false);
 assert.equal(output.apkInstallPermitted,false);
 assert.equal(output.originalDeletePermitted,false);
 assert.equal(output.physicalEndToEndVerified,false);
 assert.equal(output.fullOriginalRecoveryVerified,false);
});
test('valid attested OnePlus and local synthetic archive remain partial, never device restore',()=>{
 const output=assessPhysicalReadiness(basic({
  'oneplus-usb-metadata':{status:'PASS',code:'ONEPLUS_10_PRO_INSTALLED_PACKAGE_METADATA_ONLY',proofLevel:'USB_DEVICE_PACKAGE_METADATA_ONLY'},
  'full-indexeddb-export':{status:'PASS',code:'EPHEMERAL_RESTORE_REOPEN_BYTES_VERIFIED',proofLevel:'LOCAL_EXPORTED_FILE_ONLY_NOT_ANDROID',
    allArchivedStoresByteVerified:true,requiredStoreCounts:{main:1,full_backup:1,entrance_media:2}}
 }));
 assert.equal(output.steps.S0_USB_IDENTITY.status,'PASS');
 assert.equal(output.steps.S1_FULL_ARCHIVE.status,'PARTIAL');
 assert.equal(output.steps.S2_DISPOSABLE_RECOVERY.status,'PARTIAL');
 assert.equal(output.steps.S3_EXTERNAL_ORIGINALS.status,'BLOCKED');
 assert.equal(output.steps.S4_SIGNER_AND_ROLLBACK.status,'BLOCKED');
 assert.equal(output.originalDeletePermitted,false);
 assert.equal(output.stopReason,'EXTERNAL_ORIGINALS_AND_SIGNER_UNVERIFIED');
});
test('incomplete IDB archive verification or fake USB proof does not improve readiness',()=>{
 const result=assessPhysicalReadiness(basic({
  'oneplus-usb-metadata':{status:'PASS',code:'SYNTHETIC',proofLevel:'NOT_VERIFIED'},
  'full-indexeddb-export':{status:'PASS',code:'EPHEMERAL_RESTORE_REOPEN_BYTES_VERIFIED',proofLevel:'NOT_VERIFIED',
    allArchivedStoresByteVerified:false}
 }));
 assert.notEqual(result.steps.S0_USB_IDENTITY.status,'PASS');
 assert.equal(result.steps.S1_FULL_ARCHIVE.status,'BLOCKED');
 assert.equal(result.steps.S2_DISPOSABLE_RECOVERY.status,'NOT_TESTED');
});
test('hub saved reports contain only fixed readiness statuses, not original files',async t=>{
 const bundle=await mkdtemp(join(tmpdir(),'paseka-physical-ready-'));
 t.after(()=>rm(bundle,{force:true,recursive:true}));
 const result=await runAndSave({bundleRoot:bundle,downloads:join(bundle,'missing'),desktop:join(bundle,'absent'),
  checks:[{id:'runtime',readOnly:true,deviceAccess:false,networkAccess:false,
    async run(){return {status:'PASS',code:'OFFLINE_RUNTIME_READY',proofLevel:'LOCAL_RUNTIME_ONLY'}}}]});
 assert.equal(result.report.physicalReadiness.steps.S3_EXTERNAL_ORIGINALS.status,'BLOCKED');
 assert.equal(result.report.physicalReadiness.steps.S7_LOCAL_REPORT.status,'PASS');
 const saved=JSON.parse(await readFile(result.path,'utf8'));
 assert.equal(saved.physicalReadiness.steps.S7_LOCAL_REPORT.code,'LOCAL_REPORT_WRITTEN_EXCLUSIVELY');
 assert.doesNotMatch(JSON.stringify(saved),/secret|private\.mp4|USB-SERIAL-123/);
 assert.equal(saved.originalFilesModified,false);
});
