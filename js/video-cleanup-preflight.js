(function(root){
'use strict';
// Diagnostic only: NEVER grants permission for physical deletion.
// Every known copy or unknown external/private store remains protected.
const sources=new Set(['entrance_media','record_media']);
const validId=v=>typeof v==='string'&&v.length>0&&v.length<=200&&!/\s/.test(v);
const required=Object.freeze([
 'recognition_result_durability_unproven',
 'all_managed_copy_bytes_not_verified',
 'protected_archive_and_restore_copies_not_reconciled',
 'external_android_camera_gallery_downloads_not_verified',
 'atomic_tombstone_and_crash_recovery_not_verified',
 'physical_android_deletion_not_tested'
]);
const fail=(reason,extra={})=>({
 status:'BLOCKED',code:'VIDEO_CLEANUP_PREFLIGHT_ONLY',reason,
 cleanupAuthorized:false,deleteAllowed:false,dataModified:false,
 archiveSafe:false,restoreAuthorized:false,
 ...extra
});
async function assess(db,guard,candidate){
 if(!candidate||!sources.has(candidate.source)||!validId(candidate.videoId))
  return fail('invalid_candidate',{blockers:['invalid_candidate',...required]});
 const identity=candidate.source+':'+candidate.videoId;
 let audit;
 try{
  const inventory=root.PasekaVideoArchiveV2CopyInventory;
  if(!inventory||typeof inventory.auditManagedVideoCopies!=='function')
   return fail('inventory_unavailable',{identity,blockers:['inventory_unavailable',...required]});
  // One single, read-only IndexedDB snapshot via the existing inventory.
  audit=await inventory.auditManagedVideoCopies(db,guard);
 }catch(_){
  return fail('inventory_read_failed',{identity,blockers:['inventory_read_failed',...required]});
 }
 if(!audit||audit.cleanupAuthorized!==false||audit.dataModified!==false||
    audit.archiveSafe!==false||audit.restoreAuthorized!==false||
    !Array.isArray(audit.copies)||!Array.isArray(audit.issues))
  return fail('inventory_contract_violation',{identity,blockers:['inventory_contract_violation',...required]});
 const matching=audit.copies.filter(item=>item&&item.identity===identity);
 // Never leak Blob, file handles, Data URLs, or potentially personal metadata.
 const locations=[...new Set(matching.map(item=>item.store).filter(v=>typeof v==='string'))].sort();
 const blockers=new Set(required);
 for(const issue of audit.issues)if(typeof issue==='string'&&/^[a-z0-9_]{1,100}$/.test(issue))
  blockers.add('inventory_'+issue);
 if(!matching.length)blockers.add('candidate_original_not_located');
 if(audit.copies.some(item=>!item||item.identity===null))blockers.add('unidentified_copies');
 const sha=new Set(matching.map(item=>item.sha256).filter(Boolean));
 const bytes=new Set(matching.map(item=>item.bytes).filter(v=>Number.isSafeInteger(v)&&v>0));
 if(sha.size>1||bytes.size>1)blockers.add('candidate_copy_metadata_conflict');
 // Even a single apparent candidate copy with identical SHA metadata is not proof
 // of byte-level identity or an exhaustive list of all copies.
 return fail('all_copy_safety_unverified',{
  identity,managedCopyLocations:locations,
  managedCopyCount:matching.length,managedInventoryCopyCount:audit.copyCount,
  auditComplete:false,byteIntegrityVerified:false,externalCopiesVerified:false,
  blockers:[...blockers].sort()
 });
}
root.PasekaVideoCleanupPreflight=Object.freeze({assess});
})(typeof window!=='undefined'?window:globalThis);
