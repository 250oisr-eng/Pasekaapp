(function(root){
'use strict';
// Strictly read-only. Samples known managed copies, never authorizes deletion.
const stores=['main','entrance_media','archive_staging','archive_history','full_backup'];
const validId=x=>typeof x==='string'&&x.length>0&&x.length<=200&&!/\s/.test(x);
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const fail=(reason,extra={})=>({
 status:'BLOCKED',code:'MANAGED_COPY_BYTE_AUDIT_ONLY',reason,
 cleanupAuthorized:false,deleteAllowed:false,dataModified:false,
 allCopiesVerified:false,externalCopiesVerified:false,
 ...extra
});
function snapshot(db){
 return new Promise(resolve=>{
  let tx,done=false;
  const end=v=>{if(!done){done=true;resolve(v)}};
  try{
   if(!db?.objectStoreNames||stores.some(k=>!db.objectStoreNames.contains(k)))
    return end({ok:false,reason:'stores_missing'});
   tx=db.transaction(stores,'readonly');
   const requests={
    state:tx.objectStore('main').get('state'),
    entrance:tx.objectStore('entrance_media').getAll(),
    staging:tx.objectStore('archive_staging').getAll(),
    backups:tx.objectStore('full_backup').getAll(),
    history:tx.objectStore('archive_history').getAll()
   };
   const values={};
   for(const [name,request]of Object.entries(requests)){
    request.onsuccess=()=>{values[name]=request.result};
    request.onerror=()=>{try{tx.abort()}catch(_){}};
   }
   tx.onabort=()=>end({ok:false,reason:'snapshot_aborted'});
   tx.onerror=()=>{};
   tx.oncomplete=()=>end({ok:true,values});
  }catch(_){try{tx?.abort()}catch(_){}end({ok:false,reason:'snapshot_unavailable'})}
 });
}
function collect(values,source,videoId){
 const copies=[],unknown=new Set(),identity=source+':'+videoId;
 const add=(where,id,recordedSha,recordedBytes,payload,type)=>{
  if(id!==videoId)return;
  copies.push({where,recordedSha,recordedBytes,payload,type});
 };
 function scanState(state,where){
  if(!state||!Array.isArray(state.records)){unknown.add('state_unreadable');return}
  for(const record of state.records){
   if(!record||typeof record!=='object'||!Array.isArray(record.media)){
    if(record?.media!=null)unknown.add('media_unreadable');
    continue;
   }
   for(const m of record.media){
    if(!m||typeof m!=='object'){unknown.add('media_unreadable');continue}
    if(m.kind==='video'||m.type==='video'||typeof m.type==='string'&&m.type.startsWith('video/')||
       typeof m.data==='string'&&/^data:video\//i.test(m.data)){
      if(!validId(m.videoId)){unknown.add('unidentified_journal_video');continue}
      if(source==='record_media')add(where,m.videoId,m.sourceSha256,m.sourceBytes,m.data,'data');
    }
   }
  }
 }
 scanState(values.state,'main/state');
 if(!Array.isArray(values.entrance)||!Array.isArray(values.staging)||
    !Array.isArray(values.backups)||!Array.isArray(values.history))
  unknown.add('inventory_unavailable');
 else{
  for(const v of values.entrance){
   if(!v||!validId(v.id)){unknown.add('unknown_entrance_record');continue}
   if(source==='entrance_media')add('entrance_media',v.id,v.blobSha256??v.sourceSha256,v.bytes??v.sourceBytes,v.blob,'blob');
  }
  for(const row of values.staging){
   if(!row||typeof row!=='object'){unknown.add('unknown_staging');continue}
   if(row.kind==='v2_pending_original'){
    if(source===row.source)add('archive_staging.v2_pending_original',row.videoId,row.sourceSha256,row.sourceBytes,row.blob,'blob');
   }else if(row.kind==='video'){
    if(source==='entrance_media')add('archive_staging.legacy_video',row.metadata?.id,null,row.size,row.blob,'blob');
   }else if(row.kind==='rollback_video'){
    if(source==='entrance_media')add('archive_staging.rollback_video',row.originalId??row.record?.id,
      row.record?.blobSha256??row.record?.sourceSha256,row.record?.bytes??row.record?.sourceBytes,row.record?.blob,'blob');
   }else if(row.kind==='rollback_state'){
    scanState(row.state,'archive_staging.rollback_state');
   }else if(row.kind==='state'){
    unknown.add('opaque_staging_state');
   }else if(!['session','rollback_session','v2_pending_session'].includes(row.kind)||row.blob!=null||row.data!=null)
    unknown.add('unknown_staging');
  }
  for(const backup of values.backups){
   if(!backup||typeof backup!=='object'){unknown.add('unknown_backup');continue}
   if(Array.isArray(backup.quarantinedMedia)){
    for(const q of backup.quarantinedMedia)
     if(source==='entrance_media')add('full_backup.quarantine',q?.id,q?.blobSha256,q?.bytes,q?.blob,'blob');
   }
   if(backup.beforeState)scanState(backup.beforeState,'full_backup.beforeState');
   if(backup.afterState)scanState(backup.afterState,'full_backup.afterState');
   if(backup.state)scanState(backup.state,'full_backup.legacy_state');
   if(backup.previous&&typeof backup.previous==='object'&&backup.previous.state)
    scanState(backup.previous.state,'full_backup.previous.state');
   // PASEKA01 previous={at,state} is a known legacy snapshot shape,
   // but its presence never establishes complete copy provenance.
   if(!['v2_entrance_only_rollback_unverified','v2_entrance_quarantine_rollback_snapshot'].includes(backup.kind))
    unknown.add('unknown_backup');
  }
  if(values.history.some(h=>!h||!['v2_pending_stage_only','v2_entrance_only'].includes(h.kind)))
   unknown.add('unknown_history');
 }
 return {copies,unknown:[...unknown].sort(),identity};
}
async function inspectManagedCopyBytes(db,candidate){
 const source=candidate?.source,videoId=candidate?.videoId;
 if(!['entrance_media','record_media'].includes(source)||!validId(videoId))
  return fail('invalid_candidate');
 const hash=root.PasekaSha256;
 if(typeof hash?.hashBlobHex!=='function'||typeof hash?.hashVideoDataUrlHex!=='function')
  return fail('hash_module_unavailable');
 const snap=await snapshot(db);
 if(!snap.ok)return fail(snap.reason);
 const {copies,unknown,identity}=collect(snap.values,source,videoId);
 const issues=new Set(unknown),locations=[];
 let matched=0;
 if(copies.length===0)issues.add('source_missing_or_unaccounted');
 if(copies.length>64)issues.add('too_many_candidate_copies');
 for(const copy of copies.slice(0,64)){
  locations.push(copy.where);
  if(!hex(copy.recordedSha)||!Number.isSafeInteger(copy.recordedBytes)||copy.recordedBytes<1){
   issues.add('copy_metadata_missing');continue;
  }
  try{
   let actual;
   if(copy.type==='blob'){
    if(!copy.payload||typeof copy.payload.slice!=='function'||
       copy.payload.size!==copy.recordedBytes){issues.add('blob_bytes_mismatch');continue}
    actual={sha256:await hash.hashBlobHex(copy.payload),bytes:copy.payload.size};
   }else if(copy.type==='data'){
    actual=await hash.hashVideoDataUrlHex(copy.payload);
   }else{issues.add('copy_type_unknown');continue}
   if(actual.sha256!==copy.recordedSha||actual.bytes!==copy.recordedBytes)
    issues.add('copy_bytes_mismatch');
   else matched++;
  }catch(_){issues.add('copy_hash_failed')}
 }
 // No stable lock across digesting; no assertion that we found all physical copies.
 return fail('all_copies_and_device_ownership_unverified',{
  identity,managedCopiesObserved:copies.length,
  managedCopiesByteMatched:matched,
  managedCopyLocations:[...new Set(locations)].sort(),
  issues:[...issues].sort(),
  byteIntegrityObserved:copies.length>0&&copies.length<=64&&matched===copies.length&&issues.size===0,
  auditComplete:false
 });
}
root.PasekaManagedVideoCopyByteAudit=Object.freeze({inspectManagedCopyBytes});
})(typeof window!=='undefined'?window:globalThis);
