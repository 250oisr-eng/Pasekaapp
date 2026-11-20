(function(root){
'use strict';
// End-to-end read-only PASEKA02 import rehearsal.
// Inspects actual file bytes, rehydrates journal attachments, checks current
// IndexedDB and repeats the ledger check while holding an aborted write lock.
// NEVER gives a write, staging, rollback or original-deletion authorization.
function fail(code){const e=new Error(code);e.code=code;throw e;}
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
async function inspectRestoreDryRun(db,file,dependencies){
 const d=dependencies;
 if(!d||typeof d.codec?.inspectMetadataArchive!=='function'||
   typeof d.preflight?.inspectRestoreCandidateAgainstDatabase!=='function'||
   typeof d.commitLock?.checkRestoreUnderAbortedWriteLock!=='function'||
   typeof d.sha?.hashBlobHex!=='function'||
   typeof d.guard?.validateRecognitionLedgerForV2!=='function'||
   typeof d.gate?.checkRestoreLedgerCandidate!=='function'||!d.crypto?.subtle?.digest)
  fail('V2_DRY_RUN_DEPENDENCIES_MISSING');
 if(!file||typeof file.slice!=='function'||!Number.isSafeInteger(file.size)||file.size<12)
  fail('V2_DRY_RUN_ARCHIVE_INVALID');
 // Only the v2 codec may decode the archive; callers cannot supply a
 // fabricated object with restoreAuthorized=true or unverified Blob contents.
 const incoming=await d.codec.inspectMetadataArchive(file,d.crypto,d.guard,d.sha,d.recordAdapter);
 if(!obj(incoming)||incoming.version!==2||incoming.format!=='paseka-archive'||
   incoming.restoreAuthorized!==false||incoming.archiveSafe!==false||
   !obj(incoming.state)||!Array.isArray(incoming.state.records)||
   !obj(incoming.ledger)||!Array.isArray(incoming.pendingVideos))
  fail('V2_DRY_RUN_CODEC_CONTRACT_INVALID');
 if(!Number.isSafeInteger(incoming.state.meta?.schemaVersion)||
   incoming.state.meta.schemaVersion<1||incoming.state.meta.schemaVersion>15)
  fail('V2_DRY_RUN_SCHEMA_UNSUPPORTED');
 const verified=d.guard.validateRecognitionLedgerForV2(incoming.ledger);
 if(verified.entryCount!==incoming.ledger.entries.length)
  fail('V2_DRY_RUN_LEDGER_COUNT_MISMATCH');
 const first=await d.preflight.inspectRestoreCandidateAgainstDatabase(db,incoming,d.guard,d.gate);
 if(!first||first.restoreAuthorized!==false||first.archiveSafe!==false||
   first.preflightPassed!==true)
  fail('V2_DRY_RUN_PREFLIGHT_CONTRACT_INVALID');
 // No async callbacks within the final readwrite transaction. It aborts
 // intentionally, including the successful path.
 const locked=await d.commitLock.checkRestoreUnderAbortedWriteLock(db,incoming,d.guard,d.gate);
 if(!locked||locked.restoreAuthorized!==false||locked.archiveSafe!==false||
   locked.lockValidated!==true||locked.transactionAborted!==true)
  fail('V2_DRY_RUN_LOCK_CONTRACT_INVALID');
 // Fingerprint the original immutable Blob for later audit; it is NOT an
 // import approval token. A fresh live check is mandatory at future commit.
 const fingerprint=await d.sha.hashBlobHex(file);
 if(typeof fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(fingerprint))
  fail('V2_DRY_RUN_FINGERPRINT_INVALID');
 return {
  format:'paseka-archive',version:2,backupId:incoming.backupId,
  fileSha256:fingerprint,archiveBytes:file.size,
  incomingSchemaVersion:incoming.state.meta.schemaVersion,
  recognitionCount:verified.entryCount,tombstoneCount:verified.tombstoneCount,
  pendingEntranceCount:incoming.pendingVideos.filter(v=>v.source==='entrance_media').length,
  pendingRecordCount:incoming.pendingVideos.filter(v=>v.source==='record_media').length,
  liveSchemaVersion:locked.liveSchemaVersion,
  protectedStagingCount:locked.stagingCount,
  protectedHistoryCount:locked.historyCount,
  protectedBackupCount:locked.backupCount,
  preflightPassed:true,lockedInspectionPassed:true,
  archiveSafe:false,restoreAuthorized:false,
  requiresAtomicCommitCheck:true,requiresRecoveryPlan:true
 };
}
root.PasekaVideoArchiveV2RestoreDryRun=Object.freeze({inspectRestoreDryRun});
})(typeof window!=='undefined'?window:globalThis);
