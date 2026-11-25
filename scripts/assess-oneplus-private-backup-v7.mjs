// B01 evidence classifier for a private-app tar snapshot created locally on PC.
// The JSON report contains no user files, and even a valid snapshot is NOT a full
// backup or independent restore; MediaStore/Gallery and LevelDB consistency remain unproven.
export const V7_SCHEMA='paseka-oneplus-app-private-backup-readonly-v7';
export function assessPrivateBackupV7(report){
 if(!report||typeof report!=='object'||Array.isArray(report)||
    report.schema!==V7_SCHEMA||report.packageId!=='ru.paseka.journal'||
    report.deviceModel!=='NE2213')return Object.freeze({
  status:'BLOCKED_REPORT_IDENTITY',privateArchiveVerified:false,
  fullBackupVerified:false,independentRestoreVerified:false,upgradeAllowed:false
 });
 const fail=(status)=>Object.freeze({status,privateArchiveVerified:false,
   fullBackupVerified:false,independentRestoreVerified:false,upgradeAllowed:false});
 if(report.scope?.install!=='NOT_ATTEMPTED'||report.scope?.uninstall!=='NOT_ATTEMPTED'||
    report.scope?.clear!=='NOT_ATTEMPTED'||report.scope?.restore!=='NOT_ATTEMPTED'||
    report.scope?.deleteOriginals!=='NOT_ATTEMPTED'||
    report.scope?.deviceWrites!=='NOT_ATTEMPTED')
   return fail('BLOCKED_DEVICE_MUTATION_IN_REPORT');
 if(report.status==='BLOCKED')return fail('BLOCKED_LOCAL_READONLY_PROBE');
 const allowed=['APP_PRIVATE_CANDIDATE_BACKUP_LOCAL_ONLY','APP_PRIVATE_ARCHIVE_NO_INDEXEDDB_EVIDENCE'];
 if(!allowed.includes(report.status)||report.runAsAvailable!==true||
    report.archiveCreated!==true||report.archiveValidTar!==true||
    !Number.isSafeInteger(report.archiveBytes)||report.archiveBytes<1024||
    !Number.isSafeInteger(report.archiveTarEntries)||report.archiveTarEntries<1||
    typeof report.archiveSha256!=='string'||!/^[a-f0-9]{64}$/.test(report.archiveSha256))
   return fail('BLOCKED_UNVERIFIED_LOCAL_TAR');
 for(const field of ['webviewPathEntries','indexedDbPathHints','databasePathHints']){
  if(!Number.isSafeInteger(report[field])||report[field]<0||
     report[field]>report.archiveTarEntries)return fail('BLOCKED_INVALID_TAR_INVENTORY');
 }
 if(report.independentRestore!=='NOT_TESTED'||
    report.backupCompleteness!=='NOT_VERIFIED_SNAPSHOT_NEEDS_RESTORE_AND_EXTERNAL_MEDIA_INVENTORY'||
    report.mediaStoreGalleryCoverage!=='NOT_TESTED')
   return fail('BLOCKED_FALSE_RECOVERY_CLAIM');
 const hasIdb=report.indexedDbPathHints>0;
 if((hasIdb&&report.status!==allowed[0])||(!hasIdb&&report.status!==allowed[1]))
   return fail('BLOCKED_INCONSISTENT_IDB_STATUS');
 return Object.freeze({
   status:hasIdb?'LOCAL_PRIVATE_SNAPSHOT_INTEGRITY_HINTS_ONLY':'LOCAL_PRIVATE_TAR_NO_IDB_EVIDENCE',
   privateArchiveVerified:false, // only the on-PC TAR integrity check was attempted
   localTarSha256:report.archiveSha256,
   localTarBytes:report.archiveBytes,
   appPrivateEntries:report.archiveTarEntries,
   containsIndexedDbPathHints:hasIdb,
   fullBackupVerified:false, independentRestoreVerified:false,
   externalMediaVerified:false, signerRecoveryVerified:false, upgradeAllowed:false
 });
}
