(function(root){
'use strict';
// Test-only, read-only byte evidence for one managed entrance video.
// No delete, no all-copy claim; a successful digest is only a point-in-time sample.
const validId=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!/\s/.test(value);
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const blocked=(reason,extra={})=>Object.freeze({
 status:'BLOCKED',code:'ENTRANCE_BLOB_BYTE_AUDIT_ONLY',reason,
 candidateBytesVerified:false,allCopiesVerified:false,cleanupAuthorized:false,
 deleteAllowed:false,externalCopiesVerified:false,dataModified:false,...extra
});
function read(db,id){
 return new Promise(resolve=>{
  let tx,record,settled=false;
  const done=value=>{if(!settled){settled=true;resolve(value)}};
  try{
   if(!db||!db.objectStoreNames?.contains('entrance_media'))
    return done({ok:false,reason:'store_missing'});
   tx=db.transaction('entrance_media','readonly');
   const req=tx.objectStore('entrance_media').get(id);
   req.onsuccess=()=>{record=req.result};
   req.onerror=()=>{try{tx.abort()}catch(_){}};
   tx.onabort=()=>done({ok:false,reason:'readonly_aborted'});
   tx.onerror=()=>{};
   tx.oncomplete=()=>done({ok:true,record});
  }catch(_){done({ok:false,reason:'readonly_unavailable'})}
 });
}
function check(record,id){
 if(!record||record.id!==id||!record.blob)return 'original_missing';
 if(typeof record.blob.slice!=='function'||!Number.isSafeInteger(record.blob.size))
  return 'blob_invalid';
 if(!validHash(record.blobSha256)||!Number.isSafeInteger(record.bytes)||
    record.bytes<=0||record.blob.size!==record.bytes)
  return 'source_metadata_invalid';
 if(record.sourceSha256!=null&&record.sourceSha256!==record.blobSha256||
    record.sourceBytes!=null&&record.sourceBytes!==record.bytes)
  return 'source_metadata_conflict';
 return null;
}
async function auditEntranceBlob(db,id){
 if(!validId(id))return blocked('invalid_video_id');
 const digest=root.PasekaSha256;
 if(!digest||typeof digest.hashBlobHex!=='function')return blocked('hash_module_unavailable');
 const first=await read(db,id);
 if(!first.ok)return blocked(first.reason);
 const issue=check(first.record,id);
 if(issue)return blocked(issue);
 let hash;
 try{hash=await digest.hashBlobHex(first.record.blob)}catch(_){return blocked('source_hash_failed')}
 if(hash!==first.record.blobSha256)return blocked('source_bytes_hash_mismatch');
 // Reopen a new read-only transaction and hash its blob again to detect
 // overwrites between the original snapshot and the final read.
 const second=await read(db,id);
 if(!second.ok)return blocked(second.reason);
 const secondIssue=check(second.record,id);
 if(secondIssue)return blocked(secondIssue);
 if(second.record.blobSha256!==first.record.blobSha256||
    second.record.bytes!==first.record.bytes||
    (second.record.captureProvenance?.source??null)!==
      (first.record.captureProvenance?.source??null)||
    (second.record.captureProvenance?.externalCopyState??null)!==
      (first.record.captureProvenance?.externalCopyState??null))
  return blocked('source_changed_between_reads');
 let secondHash;
 try{secondHash=await digest.hashBlobHex(second.record.blob)}
 catch(_){return blocked('second_hash_failed')}
 if(secondHash!==hash)return blocked('source_changed_between_reads');
 return blocked('all_copies_and_external_ownership_unverified',{
  candidateBytesVerified:true,videoId:id,source:'entrance_media',
  byteCount:first.record.bytes,sourceHashMatched:true,
  sourceProvenance:
    first.record.captureProvenance?.source==='app_private_capture_verified'?
    'CLAIM_NOT_PHYSICALLY_VERIFIED':'UNKNOWN_OR_EXTERNAL',
  fullAllCopyAudit:'NOT_TESTED'
 });
}
root.PasekaVideoCleanupByteEvidence=Object.freeze({auditEntranceBlob});
})(typeof window!=='undefined'?window:globalThis);
