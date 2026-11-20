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
 const issues=new Set(),copies=[],names=new Set(),recognition=new Map();
 const issue=name=>issues.add(name);
 const add=(store,source,id,sha,bytes,blob)=>{
  if(!['entrance_media','record_media'].includes(source)||!key(id)){
   issue('unidentified_copy');return;
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
  for(const e of v.ledger.entries)recognition.set(sourceKey(e.source,e.videoId),e.cleanupState);
 }catch(_){issue('ledger_invalid');}
 if(!object(v.state)||!Array.isArray(v.state.records))issue('state_unknown');
 else for(const record of v.state.records){
  if(!object(record)){issue('record_unknown');continue;}
  if(record.media==null)continue;
  if(!Array.isArray(record.media)){issue('record_media_unknown');continue;}
  for(const m of record.media){
   if(!object(m)){issue('record_media_unknown');continue;}
   const video=m.kind==='video'||m.type==='video'||typeof m.type==='string'&&m.type.startsWith('video/')||
    typeof m.mimeType==='string'&&m.mimeType.startsWith('video/')||videoUri(m.data);
   if(!video)continue;
   if(m.data!=null){
    if(!videoUri(m.data)){issue('record_video_payload_unknown');continue;}
    add('main/state.records.media','record_media',m.videoId,m.sourceSha256,m.sourceBytes,null);
   }else if(!key(m.videoId))issue('record_video_id_missing');
  }
 }
 if(!Array.isArray(v.entrance))issue('entrance_unknown');
 else for(const item of v.entrance){
  if(!object(item)){issue('entrance_record_unknown');continue;}
  if(item.blob==null){issue('entrance_payload_unknown');continue;}
  add('entrance_media','entrance_media',item.id,item.blobSha256||item.sourceSha256,
   item.bytes??item.sourceBytes,item.blob);
 }
 if(!Array.isArray(v.staging))issue('staging_unknown');
 else for(const row of v.staging){
  if(!object(row)){issue('staging_record_unknown');continue;}
  if(row.kind==='v2_pending_original'){
   if(row.blob==null){issue('staging_video_missing');continue;}
   add('archive_staging',row.source,row.videoId,row.sourceSha256,row.sourceBytes,row.blob);
  }else if(row.blob!=null||row.data!=null)issue('unknown_staging_payload');
  else if(row.kind!=='v2_pending_session')issue('unknown_staging_record');
 }
 // Any full_backup entry may contain arbitrary legacy objects, blobs or
 // encoded originals. Known quarantine copies are listed, but no other
 // protected snapshot can be certified safe without a format-specific parser.
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
  if(!['v2_entrance_only_rollback_unverified',
      'v2_entrance_quarantine_rollback_snapshot'].includes(backup.kind))
   issue('unknown_backup_format');
  if(backup.kind==='v2_entrance_quarantine_rollback_snapshot'&&
     !Array.isArray(backup.quarantinedMedia))issue('quarantine_unknown');
 }
 if(!Array.isArray(v.history))issue('history_unknown');
 else for(const record of v.history){
  if(!object(record)||!['v2_pending_stage_only','v2_entrance_only'].includes(record.kind))
   issue('unknown_history_format');
  if(object(record)&&record.kind==='v2_entrance_only'&&
   !['committed_rollback_blocked','reverted_quarantined_unverified'].includes(record.status))
   issue('history_status_unknown');
 }
 for(const copy of copies){
  const status=recognition.get(copy.identity);
  if(status!=null)issue('recognized_original_still_present');
  if(status==='deleted')issue('deleted_tombstone_has_copy');
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
