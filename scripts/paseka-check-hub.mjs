// PASEKA 2.0 unified local check hub. No phone, ADB, network or live DB access.
// New checks are reviewed, allowlisted functions in this file, not user-supplied commands.
// Privacy: reports contain only fixed field names, counts and status codes.
import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findFullExport } from './run-b01-oneclick.mjs';
import { proveExportedArchiveRecoveryFile } from './prove-exported-archive-recovery.mjs';
import { chooseAdbBinary, inspectConnectedOnePlus, inspectOnePlusFullExportPresence, inspectOnePlusPrivateDbAccessGate, inspectOnePlusIdbInventory } from './check-oneplus-readonly-usb.mjs';

export const HUB_SCHEMA='paseka-offline-check-hub-v1';
export const HUB_VERSION=1;
const CHECK_IDS=Object.freeze(['runtime','full-indexeddb-export','external-android-media','oneplus-usb-metadata']);
const SAFE_ID=/^[a-z][a-z0-9-]{0,63}$/;

function errorCode(error) {
  const raw=String(error?.message||'');
  if(raw==='B01_BLOCKED_FULL_EXPORT_NOT_FOUND') return 'FULL_EXPORT_NOT_FOUND';
  if(raw==='B01_BLOCKED_MULTIPLE_FULL_EXPORTS') return 'MULTIPLE_FULL_EXPORTS';
  if(raw==='B01_BLOCKED_UNSAFE_OR_OVERSIZE_FULL_EXPORT') return 'UNSAFE_OR_OVERSIZE_FULL_EXPORT';
  if(raw==='B01_BLOCKED_SOURCE_DIRECTORY_UNREADABLE') return 'SOURCE_DIRECTORY_UNREADABLE';
  return 'LOCAL_VERIFICATION_FAILED_REDACTED';
}

export function validateChecks(checks) {
  if(!Array.isArray(checks)||!checks.length||checks.length>16) throw Error('INVALID_CHECK_REGISTRY');
  const seen=new Set();
  for(const c of checks) {
    if(!c||!SAFE_ID.test(c.id)||seen.has(c.id)||typeof c.run!=='function'||
       c.readOnly!==true||c.networkAccess!==false||
       !(c.deviceAccess===false || (c.deviceAccess==='METADATA_ONLY' &&
         ((c.id==='oneplus-usb-metadata' && c.run===onePlusMetadataCheck) ||
          (c.id==='oneplus-downloads-export' && c.run===onePlusDownloadsCheck) ||
          (c.id==='oneplus-private-db-gate' && c.run===onePlusPrivateDbGateCheck) ||
          (c.id==='oneplus-idb-inventory' && c.run===onePlusIdbInventoryCheck)))))
      throw Error('UNSAFE_CHECK_REGISTRY');
    seen.add(c.id);
  }
  return true;
}

async function onePlusMetadataCheck(context) {
  return inspectConnectedOnePlus({binary:chooseAdbBinary()});
}

async function onePlusDownloadsCheck() {
  return inspectOnePlusFullExportPresence({binary:chooseAdbBinary()});
}

async function onePlusPrivateDbGateCheck() {
  return inspectOnePlusPrivateDbAccessGate({binary:chooseAdbBinary()});
}

async function onePlusIdbInventoryCheck() {
  return inspectOnePlusIdbInventory({binary:chooseAdbBinary()});
}

const REGISTERED=Object.freeze([
  Object.freeze({id:'runtime',readOnly:true,deviceAccess:false,networkAccess:false,
    async run() {
      return {status:'PASS',code:'OFFLINE_RUNTIME_READY',proofLevel:'LOCAL_RUNTIME_ONLY'};
    }}),
  Object.freeze({id:'full-indexeddb-export',readOnly:true,deviceAccess:false,networkAccess:false,
    async run(context) {
      let path;
      try {
        path=await findFullExport({
          root:context.bundleRoot,downloads:context.downloads,desktop:context.desktop
        });
      } catch(e) {
        return {status:'NEEDS_INPUT',code:errorCode(e),proofLevel:'NOT_VERIFIED'};
      }
      try {
        const result=await proveExportedArchiveRecoveryFile(path);
        return {
          status: 'PASS',
          code:'EPHEMERAL_RESTORE_REOPEN_BYTES_VERIFIED',
          proofLevel:'LOCAL_EXPORTED_FILE_ONLY_NOT_ANDROID',
          requiredStoreCounts:{
            main:result.requiredStoreCounts.main,
            full_backup:result.requiredStoreCounts.full_backup,
            entrance_media:result.requiredStoreCounts.entrance_media
          },
          allArchivedStoresByteVerified:result.allArchivedStoresByteVerified===true
        };
      } catch(e) {
        return {status:'BLOCKED',code:errorCode(e),proofLevel:'NOT_VERIFIED'};
      }
    }}),
  Object.freeze({id:'external-android-media',readOnly:true,deviceAccess:false,networkAccess:false,
    async run() {
      return {status:'NEEDS_DEVICE_EVIDENCE',code:'GALLERY_MEDIASTORE_NOT_ACCESSIBLE_FROM_LOCAL_ARCHIVE',
        proofLevel:'NOT_VERIFIED'};
    }}),
  Object.freeze({id:'oneplus-usb-metadata',readOnly:true,deviceAccess:'METADATA_ONLY',networkAccess:false,
    run:onePlusMetadataCheck}),
  Object.freeze({id:'oneplus-downloads-export',readOnly:true,deviceAccess:'METADATA_ONLY',networkAccess:false,
    run:onePlusDownloadsCheck}),
  Object.freeze({id:'oneplus-private-db-gate',readOnly:true,deviceAccess:'METADATA_ONLY',networkAccess:false,
    run:onePlusPrivateDbGateCheck}),
  Object.freeze({id:'oneplus-idb-inventory',readOnly:true,deviceAccess:'METADATA_ONLY',networkAccess:false,
    run:onePlusIdbInventoryCheck})
]);
validateChecks(REGISTERED);

function safeReportResult(r) {
  const validStatus=new Set(['PASS','BLOCKED','NEEDS_INPUT','NEEDS_DEVICE_EVIDENCE']);
  if(!r||!validStatus.has(r.status)||typeof r.code!=='string'|| !/^[A-Z0-9_]{3,96}$/.test(r.code))
    return {status:'BLOCKED',code:'CHECK_OUTPUT_UNVERIFIED',proofLevel:'NOT_VERIFIED'};
  const result={status:r.status,code:r.code,proofLevel:
    /^[A-Z0-9_]{3,96}$/.test(r.proofLevel||'')?r.proofLevel:'NOT_VERIFIED'};
  if(r.status==='PASS' && r.requiredStoreCounts) {
    const keys=['main','full_backup','entrance_media'];
    const counts={};
    if(keys.every(k=>Number.isSafeInteger(r.requiredStoreCounts[k])&&r.requiredStoreCounts[k]>=0)){
      for(const key of keys) counts[key]=r.requiredStoreCounts[key];
      result.requiredStoreCounts=counts;
      result.allArchivedStoresByteVerified=r.allArchivedStoresByteVerified===true;
    }
  }
  return result;
}

export async function executeChecks({checks=REGISTERED,bundleRoot,downloads,desktop}={}) {
  validateChecks(checks);
  if(!bundleRoot) throw Error('BUNDLE_ROOT_REQUIRED');
  const ctx=Object.freeze({bundleRoot:resolve(bundleRoot),downloads,desktop});
  const results={};
  for(const check of checks) {
    try {results[check.id]=safeReportResult(await check.run(ctx));}
    catch {results[check.id]={status:'BLOCKED',code:'CHECK_EXECUTION_FAILED_REDACTED',proofLevel:'NOT_VERIFIED'};}
  }
  const statuses=Object.values(results).map(x=>x.status);
  return {
    schema:HUB_SCHEMA,version:HUB_VERSION,
    status:statuses.includes('BLOCKED')?'BLOCKED':
      statuses.includes('NEEDS_INPUT')?'NEEDS_INPUT':'PARTIAL_EVIDENCE_ONLY',
    checks:results,
    fullBackupVerified:false,
    androidDurableRestore:'NOT_TESTED',
    originalVideosRestored:'NOT_TESTED',
    originalFilesModified:false,
    onePlusAccess:results['oneplus-usb-metadata']?.status==='PASS'?'READONLY_PACKAGE_METADATA_ONLY':'NOT_VERIFIED',
    deletion:'NOT_ATTEMPTED',
    network:'NOT_ATTEMPTED'
  };
}

export async function saveReport({bundleRoot,report,stamp=new Date().toISOString().replace(/[:.]/g,'-'),
                              random=()=>randomBytes(5).toString('hex')}={}) {
  if(!bundleRoot||report?.schema!==HUB_SCHEMA)throw Error('INVALID_REPORT');
  const dir=join(resolve(bundleRoot),'PASEKA-CHECK-REPORTS');
  try {
    const st=await fs.lstat(dir);
    if(!st.isDirectory()||st.isSymbolicLink())throw Error('UNSAFE_REPORT_DIRECTORY');
  }catch(e){
    if(e.code==='ENOENT')await fs.mkdir(dir,{recursive:false});
    else throw e;
  }
  if(!/^\d{4}-\d{2}-\d{2}T[0-9TZ-]{10,45}$/.test(stamp)||
     !/^[a-f0-9]{10}$/.test(random())) throw Error('INVALID_REPORT_ID');
  // New random entropy per report and exclusive create; never overwrite or cleanup.
  const id=random(),file=join(dir,'PASEKA-CHECK-'+stamp+'-'+id+'.json');
  await fs.writeFile(file,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  return file;
}

export async function runAndSave({bundleRoot,downloads,desktop,checks,stamp,random}={}) {
  const report=await executeChecks({bundleRoot,downloads,desktop,checks});
  const path=await saveReport({bundleRoot,report,stamp,random});
  return {report,path};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const bundleRoot=resolve(fileURLToPath(new URL('..',import.meta.url)));
 const home=homedir();
 runAndSave({bundleRoot,downloads:join(home,'Downloads'),desktop:join(home,'Desktop')})
   .then(({report})=>{
     for(const [id,item] of Object.entries(report.checks))console.log(id+': '+item.status+' / '+item.code);
     console.log('STATUS: '+report.status);
     console.log('Report saved in PASEKA-CHECK-REPORTS. Share only the latest PASEKA-CHECK-*.json.');
     console.log('No original archive or media files are uploaded or changed.');
   }).catch(()=>{console.error('CHECK_HUB_BLOCKED_REPORT_UNAVAILABLE');process.exitCode=3;});
}
