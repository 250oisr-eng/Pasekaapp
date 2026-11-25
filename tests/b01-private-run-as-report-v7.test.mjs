import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPrivateBackupV7,V7_SCHEMA} from '../scripts/assess-oneplus-private-backup-v7.mjs';
const hash='a'.repeat(64);
const baseline={
 schema:V7_SCHEMA,deviceModel:'NE2213',packageId:'ru.paseka.journal',
 status:'APP_PRIVATE_CANDIDATE_BACKUP_LOCAL_ONLY',runAsAvailable:true,
 archiveCreated:true,archiveValidTar:true,archiveBytes:123456,archiveSha256:hash,
 archiveTarEntries:25,webviewPathEntries:18,indexedDbPathHints:4,databasePathHints:3,
 backupCompleteness:'NOT_VERIFIED_SNAPSHOT_NEEDS_RESTORE_AND_EXTERNAL_MEDIA_INVENTORY',
 independentRestore:'NOT_TESTED',mediaStoreGalleryCoverage:'NOT_TESTED',
 scope:{install:'NOT_ATTEMPTED',uninstall:'NOT_ATTEMPTED',clear:'NOT_ATTEMPTED',
  restore:'NOT_ATTEMPTED',deleteOriginals:'NOT_ATTEMPTED',deviceWrites:'NOT_ATTEMPTED'}
};
test('verified local TAR header hints never turn into full backup or authorized upgrade',()=>{
 const r=assessPrivateBackupV7(baseline);
 assert.equal(r.status,'LOCAL_PRIVATE_SNAPSHOT_INTEGRITY_HINTS_ONLY');
 assert.equal(r.localTarSha256,hash);
 assert.equal(r.fullBackupVerified,false);
 assert.equal(r.privateArchiveVerified,false);
 assert.equal(r.externalMediaVerified,false);
 assert.equal(r.independentRestoreVerified,false);
 assert.equal(r.upgradeAllowed,false);
 assert.equal(JSON.stringify(r).includes('password'),false);
});
test('no IndexedDB paths is not a recoverable original-video archive',()=>{
 const r=assessPrivateBackupV7({...baseline,status:'APP_PRIVATE_ARCHIVE_NO_INDEXEDDB_EVIDENCE',indexedDbPathHints:0});
 assert.equal(r.status,'LOCAL_PRIVATE_TAR_NO_IDB_EVIDENCE');
 assert.equal(r.containsIndexedDbPathHints,false);
 assert.equal(r.fullBackupVerified,false);
});
test('read-only probe blocked, malformed hash or identity are all fail-closed',()=>{
 const reports=[
  {...baseline,status:'BLOCKED',archiveCreated:false},
  {...baseline,archiveSha256:'bad'},
  {...baseline,archiveBytes:0},
  {...baseline,deviceModel:'other'},
  {...baseline,packageId:'another.package'},
  {...baseline,archiveTarEntries:0},
  {...baseline,status:'PASS'},
  {...baseline,scope:{...baseline.scope,install:'ATTEMPTED'}},
  {...baseline,indexedDbPathHints:999},
  {...baseline,independentRestore:'PASS'},
  {...baseline,mediaStoreGalleryCoverage:'VERIFIED'},
  {...baseline,status:'APP_PRIVATE_ARCHIVE_NO_INDEXEDDB_EVIDENCE'},
  null
 ];
 for(const r of reports){
  const result=assessPrivateBackupV7(r);
  assert.match(result.status,/^BLOCKED_/,JSON.stringify(r));
  assert.equal(result.fullBackupVerified,false);
  assert.equal(result.upgradeAllowed,false);
 }
});
