import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  readExportedArchiveFileText,inspectExportedArchiveText,
  replayExportedArchiveInIsolatedMemory
} from './verify-exported-archive.mjs';
import {auditMediaCopy,parseExpectedFileCount} from './audit-local-media-copy.mjs';

// One entry point for all independently safe B01 gates. Device/production
// evidence must come from separate physical procedures, never synthetic CI.
const NONE='NOT_PROVIDED';
const BLOCKED='BLOCKED';
const REDACTED='UNIFIED_LOCAL_AUDIT_FAILED';
export function parseUnifiedArguments(args){
  if(!Array.isArray(args))throw Error(REDACTED);
  const allowed=new Set(['--archive','--media-source','--media-copy','--expected-files']);
  const config={},seen=new Set();
  for(let i=0;i<args.length;i+=2){
    const key=args[i],value=args[i+1];
    if(!allowed.has(key)||seen.has(key)||!value||value.startsWith('--'))throw Error(REDACTED);
    seen.add(key);
    config[key]=value;
  }
  const mediaCount=['--media-source','--media-copy'].filter(x=>seen.has(x)).length;
  if(mediaCount===1||seen.has('--expected-files')&&mediaCount!==2)throw Error(REDACTED);
  const expectedFiles=seen.has('--expected-files')
    ?parseExpectedFileCount(config['--expected-files']):null;
  return {archivePath:config['--archive']??null,mediaSource:config['--media-source']??null,
    mediaCopy:config['--media-copy']??null,expectedFiles};
}
export async function runUnifiedRecoveryAudit({
 archivePath=null,mediaSource=null,mediaCopy=null,expectedFiles=null
}={}){
 const report={
  schema:'paseka-unified-recovery-audit-v1',
  overall:'BLOCKED_EXTERNAL_PHYSICAL_EVIDENCE',
  archive:{status:NONE},
  isolatedMemoryReopen:{status:'NOT_TESTED'},
  externalMediaCopies:{status:NONE},
  deviceOriginalsInventory:{status:'NOT_VERIFIED'},
  independentPhysicalRestore:{status:'NOT_VERIFIED'},
  androidInstalledSigning:{status:'NOT_VERIFIED_IN_THIS_TEST'},
  durableSigningKey:{status:'EXTERNAL_DEPENDENCY'},
  licensedBeeVideoModel:{status:'FROZEN'},
  originalVideoDeletionAuthorized:false,
  installationAuthorized:false,
  userDataModified:false
 };
 const isMediaRequested=mediaSource!==null||mediaCopy!==null;
 if((mediaSource===null)!==(mediaCopy===null)){
   report.externalMediaCopies={status:BLOCKED};
 }else if(isMediaRequested){
   try{
     const result=await auditMediaCopy(mediaSource,mediaCopy,{expectedFiles});
     report.externalMediaCopies={status:result.status,filesCompared:result.filesCompared,
       bytesCompared:result.bytesCompared};
   }catch{report.externalMediaCopies={status:BLOCKED};}
 }
 if(archivePath!==null){
   try{
     const raw=await readExportedArchiveFileText(archivePath);
     const file=await inspectExportedArchiveText(raw);
     report.archive={status:file.status,storesChecked:Object.keys(file.counts).length,
       entranceMediaRecords:file.counts.entrance_media};
     try{
       const replay=await replayExportedArchiveInIsolatedMemory(raw);
       report.isolatedMemoryReopen={status:replay.status,
         archiveSha256Matched:replay.archiveSha256Matched};
     }catch{report.isolatedMemoryReopen={status:BLOCKED};}
   }catch{
     report.archive={status:BLOCKED};
     report.isolatedMemoryReopen={status:'NOT_TESTED'};
   }
 }
 // Any local file mismatch blocks the local stage; even full local match still
 // cannot certify device completeness, storage separation or physical restore.
 const localFailed=[report.archive.status,report.isolatedMemoryReopen.status,
                    report.externalMediaCopies.status].includes(BLOCKED);
 report.overall=localFailed?'BLOCKED_LOCAL_CHECK':
   report.archive.status!==NONE&&report.isolatedMemoryReopen.status.startsWith('ISOLATED_')&&
   report.externalMediaCopies.status==='ENUMERATED_LOCAL_MEDIA_COPIES_MATCH_ONLY'
   ?'LOCAL_CHECKS_VERIFIED_PHYSICAL_GATES_OPEN'
   :'BLOCKED_MISSING_LOCAL_EVIDENCE';
 return Object.freeze(report);
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const run=async()=>{
   const config=parseUnifiedArguments(process.argv.slice(2));
   const result=await runUnifiedRecoveryAudit(config);
   console.log(JSON.stringify(result,null,2));
   // Never exit 0: this runner cannot certify the required physical proof.
   process.exitCode=result.overall==='BLOCKED_LOCAL_CHECK'?1:2;
 };
 run().catch(()=>{
   console.error(JSON.stringify({schema:'paseka-unified-recovery-audit-v1',
    overall:'BLOCKED_INVALID_INVOCATION',userDataModified:false,
    originalVideoDeletionAuthorized:false,installationAuthorized:false}));
   process.exitCode=1;
 });
}
