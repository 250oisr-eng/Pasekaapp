(function(root){
'use strict';
// PASEKA02 source-copy inventory, read-only and fail-closed.
// Inventory is NOT proof of byte integrity and NEVER authorizes deletion.
// External Android Camera/Gallery/Downloads copies cannot be observed here.
const STORES=['main','entrance_media','archive_staging','archive_history','full_backup'];
const LEDGER='video_recognition_ledger_v1';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const key=x=>typeof x==='string'&&x.length>0&&x.length<=200&&!/\s/.test(x);
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const sourceKey=(source,id)=>source+':'+id;
const videoUri=x=>typeof x==='string'&&/^(?:data:(?:video\/|application\/octet-stream)|blob:)/i.test(x);
function snapshot(db){
 return new Promise((resolve,reject)=>{
  if(!db?.objectStoreNames||STORES.some(x=>!db.objectStoreNames.contains(x)))
   return reject(new Error('V2_COPIES_STORES_MISSING'));
  let tx,settled=false;const data={},end=e=>{if(!settled){settled=true;reject(e);}};
  try{
   tx=db.transaction(STORES,'readonly');
   const requests={
    state:tx.objectStore('main').get('state'),
    ledger:tx.objectStore('main').get(LEDGER),
    entrance:tx.objectStore('entrance_media').getAll(),
    staging:tx.objectStore('archive_staging').getAll(),
    history:tx.objectStore('archive_history').getAll(),
    backups:tx.objectStore('full_backup').getAll()
   };
   for(const [n,req]of Object.entries(requests)){
    req.onsuccess=()=>{data[n]=req.result;};
    req.onerror=()=>{try{tx.abort();}catch(_){}end(req.error||new Error('V2_COPIES_READ_FAILED'));};
   }
   tx.onabort=()=>end(tx.error||new Error('V2_COPIES_ABORTED'));
   tx.onerror=()=>end(tx.error||new Error('V2_COPIES_READ_FAILED'));
   tx.oncomplete=()=>{if(!settled){settled=true;resolve(data);}};
  }catch(e){if(tx)try{tx.abort();}catch(_){}end(e);}
 });
}
function inspectSnapshot(v,guard){
 const issues=new Set(),copies=[],names=new Set(),recognition=new Map(),recognitionEvidence=new Map(),recognizedByIdentity=new Map();
 const issue=name=>issues.add(name);
 const add=(store,source,id,sha,bytes,blob)=>{
  if(!['entrance_media','record_media'].includes(source)||!key(id)){
   // Preserve the copy count even when a legacy capture path did not assign
   // a stable ID. This copy is intentionally unmatchable to recognition.
   issue('unidentified_copy');
   copies.push({store,identity:null,source:source||null,videoId:null,
    sha256:null,bytes:null,actualBlobSize:Number.isSafeInteger(blob?.size)?blob.size:null});
   return;
  }
  if(sha!=null&&!hex(sha))issue('invalid_copy_evidence');
  if(bytes!=null&&(!Number.isSafeInteger(bytes)||bytes<1))issue('invalid_copy_evidence');
  if(blob!=null&&(typeof blob.slice!=='function'||!Number.isSafeInteger(blob.size)||
      bytes!=null&&blob.size!==bytes))issue('invalid_copy_evidence');
  const identity=sourceKey(source,id);
  const detail={store,identity,source,videoId:id,
   sha256:hex(sha)?sha:null,bytes:Number.isSafeInteger(bytes)?bytes:null,
   actualBlobSize:Number.isSafeInteger(blob?.size)?blob.size:null};
  copies.push(detail);names.add(identity);
 };
 if(typeof guard?.validateRecognitionLedgerForV2!=='function')issue('ledger_guard_missing');
 else try{
  guard.validateRecognitionLedgerForV2(v.ledger);
  for(const e of v.ledger.entries){
   const identity=sourceKey(e.source,e.videoId);
   recognition.set(identity,e.cleanupState);
   recognizedByIdentity.set(identity,e);
   // Metadata-only possible alias detection: an SHA+size match is not a
   // fresh byte-level proof and never authorizes deletion.
   if(hex(e.sourceSha256)&&Number.isSafeInteger(e.sourceBytes)&&e.sourceBytes>0){
    const evidenceKey=e.sourceSha256+':'+e.sourceBytes;
    const matches=recognitionEvidence.get(evidenceKey)||[];
    matches.push({identity,status:e.cleanupState});
    recognitionEvidence.set(evidenceKey,matches);
   }
  }
 }catch(_){issue('ledger_invalid');}
 const scanState=(state,store)=>{
  if(!object(state)||!Array.isArray(state.records)){issue('state_unknown');return;}
  for(const record of state.records){
   if(!object(record)){issue('record_unknown');continue;}
   if(record.media==null)continue;
   if(!Array.isArray(record.media)){issue('record_media_unknown');continue;}
   for(const m of record.media){
    if(!object(m)){issue('record_media_unknown');continue;}
    const video=m.kind==='video'||m.type==='video'||
     typeof m.type==='string'&&m.type.startsWith('video/')||
     typeof m.mimeType==='string'&&m.mimeType.startsWith('video/')||
     videoUri(m.data);
    if(!video)continue;
    if(m.data!=null){
     if(!videoUri(m.data)){issue('record_video_payload_unknown');continue;}
     add(store,'record_media',m.videoId,m.sourceSha256,m.sourceBytes,null);
    }else if(!key(m.videoId))issue('record_video_id_missing');
   }
  }
 };
 scanState(v.state,'main/state.records.media');
 if(!Array.isArray(v.entrance))issue('entrance_unknown');
 else for(const item of v.entrance){
  if(!object(item)){issue('entrance_record_unknown');continue;}
  if(item.blob==null){issue('entrance_payload_unknown');continue;}
  // Both forms can coexist on migrated records: never silently prefer one.
  if(item.blobSha256!=null&&item.sourceSha256!=null&&
     hex(item.blobSha256)&&hex(item.sourceSha256)&&
     item.blobSha256!==item.sourceSha256)issue('conflicting_source_metadata');
  if(item.bytes!=null&&item.sourceBytes!=null&&
     Number.isSafeInteger(item.bytes)&&Number.isSafeInteger(item.sourceBytes)&&
     item.bytes!==item.sourceBytes)issue('conflicting_source_metadata');
  add('entrance_media','entrance_media',item.id,item.blobSha256??item.sourceSha256,
   item.bytes??item.sourceBytes,item.blob);
 }
 if(!Array.isArray(v.staging))issue('staging_unknown');
 else for(const row of v.staging){
  if(!object(row)){issue('staging_record_unknown');continue;}
  if(row.kind==='v2_pending_original'){
   if(row.blob==null){issue('staging_video_missing');continue;}
   add('archive_staging',row.source,row.videoId,row.sourceSha256,row.sourceBytes,row.blob);
  }else if(row.kind==='video'){
   // Legacy PASEKA01 staging: sessionId:video:<id>, metadata.id and
   // chunkSha256[]; chunk hashes are NOT equivalent to a full-video SHA.
   if(row.blob==null||!object(row.metadata)){issue('staging_video_missing');continue;}
   add('archive_staging.legacy_video','entrance_media',row.metadata.id,
    null,row.size,row.blob);
   issue('legacy_video_chunks_unverified');
  }else if(row.kind==='rollback_video'){
   // Legacy rollback stores an entire entrance_media record, not row.blob.
   if(!object(row.record)||row.record.blob==null){
    issue('rollback_video_unknown');continue;
   }
   add('archive_staging.rollback_video','entrance_media',
    row.originalId??row.record.id,
    row.record.blobSha256??row.record.sourceSha256,
    row.record.bytes??row.record.sourceBytes,row.record.blob);
   issue('legacy_rollback_requires_review');
  }else if(row.kind==='rollback_state'){
   if(row.state!=null)scanState(row.state,'archive_staging.rollback_state');
   else issue('rollback_state_unknown');
  }else if(row.kind==='state'){
   // PASEKA01 state is stored as an opaque JSON Blob. It may contain
   // journal-video Data URLs; until decoded and validated, count as unknown.
   if(row.blob!=null)issue('opaque_legacy_state_blob');
   else issue('staging_state_unknown');
  }else if(row.kind==='session'||row.kind==='rollback_session'){
   if(row.blob!=null||row.data!=null)issue('unknown_staging_payload');
  }else if(row.blob!=null||row.data!=null)issue('unknown_staging_payload');
  else if(row.kind!=='v2_pending_session')issue('unknown_staging_record');
 }
 // PASEKA01 full_backup.previous={at,state}. Scan its historical journal
 // state rather than losing archived record-media copies in a generic issue.
 if(!Array.isArray(v.backups))issue('backup_unknown');
 else for(const backup of v.backups){
  if(!object(backup)){issue('unknown_backup_format');continue;}
  if(Array.isArray(backup.quarantinedMedia)){
   for(const entry of backup.quarantinedMedia){
    if(!object(entry)||entry.blob==null){issue('quarantine_unknown');continue;}
    add('full_backup.quarantinedMedia','entrance_media',entry.id,
     entry.blobSha256,entry.bytes,entry.blob);
   }
  }
  if(backup.kind==='v2_entrance_only_rollback_unverified'||
     backup.kind==='v2_entrance_quarantine_rollback_snapshot'){
   if(backup.beforeState!=null)scanState(backup.beforeState,'full_backup.beforeState');
   else issue('backup_snapshot_state_unknown');
   if(backup.afterState!=null)scanState(backup.afterState,'full_backup.afterState');
   else issue('backup_snapshot_state_unknown');
   if(backup.kind==='v2_entrance_quarantine_rollback_snapshot'&&
      !Array.isArray(backup.quarantinedMedia))issue('quarantine_unknown');
  }else if(Object.prototype.hasOwnProperty.call(backup,'state')){
   scanState(backup.state,'full_backup.legacy_state');
   issue('legacy_full_backup_requires_review');
  }else issue('unknown_backup_format');
 }
 if(!Array.isArray(v.history))issue('history_unknown');
 else for(const record of v.history){
  if(!object(record)||!['v2_pending_stage_only','v2_entrance_only'].includes(record.kind))
   issue('unknown_history_format');
  if(object(record)&&record.kind==='v2_entrance_only'&&
   !['committed_rollback_blocked','reverted_quarantined_unverified'].includes(record.status))
   issue('history_status_unknown');
 }
 // Cross-store metadata disagreement cannot be treated as consistent source evidence.
 // Compare only independently present fields; missing fields stay blocked elsewhere.
 const copiesByIdentity=new Map();
 for(const copy of copies){
  if(copy.identity===null)continue;
  const previous=copiesByIdentity.get(copy.identity)||[];
  for(const prior of previous){
   if(copy.sha256!==null&&prior.sha256!==null&&copy.sha256!==prior.sha256||
      copy.bytes!==null&&prior.bytes!==null&&copy.bytes!==prior.bytes)
    issue('conflicting_copy_evidence');
  }
  previous.push(copy);
  copiesByIdentity.set(copy.identity,previous);
 }
 for(const copy of copies){
  const status=recognition.get(copy.identity);
  if(status!=null)issue('recognized_original_still_present');
  // Persisted recognition digest must not be trusted over contradictory source metadata.
  const verifiedEntry=recognizedByIdentity.get(copy.identity);
  if(verifiedEntry&&(
    copy.sha256!==null&&copy.sha256!==verifiedEntry.sourceSha256||
    copy.bytes!==null&&copy.bytes!==verifiedEntry.sourceBytes))
   issue('recognition_source_evidence_conflict');
  if(status==='deleted')issue('deleted_tombstone_has_copy');
  if(copy.sha256!==null&&Number.isSafeInteger(copy.bytes)&&copy.bytes>0){
   const candidates=recognitionEvidence.get(copy.sha256+':'+copy.bytes)||[];
   if(candidates.some(e=>e.identity!==copy.identity)){
    issue('possible_recognized_original_hash_alias');
    if(candidates.some(e=>e.identity!==copy.identity&&e.status==='deleted'))
     issue('possible_deleted_tombstone_hash_alias');
   }
  }
  if(copy.sha256===null||copy.bytes===null)issue('copy_evidence_missing');
 }
 for(const [identity,status]of recognition)
  if(status==='delete_required'||status==='blocked_archive_safety')issue('cleanup_not_confirmed');
 // Deliberately do not expose blob handles or attempt to hash asynchronously
 // in the live transaction. The report is metadata-only and non-authorizing.
 issue('external_android_copies_not_audited');
 issue('byte_integrity_not_reverified');
 return {copyCount:copies.length,distinctIdentities:names.size,
  copies,recognitionEntries:recognition.size,
  issues:[...issues].sort(),auditComplete:false,
  byteIntegrityVerified:false,externalCopiesVerified:false,
  cleanupAuthorized:false,archiveSafe:false,restoreAuthorized:false,
  dataModified:false};
}
async function auditManagedVideoCopies(db,guard){
 const v=await snapshot(db);
 return inspectSnapshot(v,guard);
}
root.PasekaVideoArchiveV2CopyInventory=Object.freeze({
 auditManagedVideoCopies
});
})(typeof window!=='undefined'?window:globalThis);
