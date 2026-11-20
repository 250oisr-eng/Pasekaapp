(function(root){
'use strict';
// Isolated optimistic recheck around PASEKA02 assembly. It is NOT a writer
// fence, save confirmation, restore ticket or original-video deletion permit.
function fail(code){const error=new Error(code);error.code=code;throw error;}
function meta(video){return {source:video.source,videoId:video.videoId,
 sourceSha256:video.sourceSha256,sourceBytes:video.sourceBytes,mimeType:video.mimeType};}
function serialize(value){try{return JSON.stringify(value);}catch(_){fail('V2_RECHECK_SERIALIZE_FAILED');}}
function assertEquivalent(before,after){
 if(serialize(before.state)!==serialize(after.state)||
    serialize(before.ledger)!==serialize(after.ledger)||
    serialize(before.pendingVideos.map(meta))!==serialize(after.pendingVideos.map(meta)))
  fail('V2_SNAPSHOT_CHANGED_DURING_EXPORT');
}
async function buildV2ArchiveCandidateFromDatabase(db,params,deps){
 if(!deps?.snapshot?.snapshotForV2||
    typeof deps?.codec?.buildMetadataArchive!=='function'||
    typeof deps?.sha?.hashBlobHex!=='function'||!deps?.guard)
  fail('V2_EXPORT_DEPENDENCIES_MISSING');
 if(!params||typeof params.backupId!=='string'||typeof params.createdAt!=='string')
  fail('V2_EXPORT_PARAMETERS_INVALID');
 const first=await deps.snapshot.snapshotForV2(db,deps.guard);
 const file=await deps.codec.buildMetadataArchive({
  state:first.state,ledger:first.ledger,pendingVideos:first.pendingVideos,
  backupId:params.backupId,createdAt:params.createdAt
 },deps.crypto,deps.guard,deps.sha,deps.recordAdapter);
 // A second transaction must include both main and entrance_media, not a
 // state-only revision check. Never expose this file until recheck passes.
 const second=await deps.snapshot.snapshotForV2(db,deps.guard);
 assertEquivalent(first,second);
 // The metadata SHA can remain unchanged even if a buggy writer modifies
 // source bytes while retaining stale proof fields. Re-hash second originals.
 for(const video of second.pendingVideos){
  if(await deps.sha.hashBlobHex(video.blob)!==video.sourceSha256)
   fail('V2_SNAPSHOT_SOURCE_CHANGED');
 }
 // No persistent writer lock exists after this point; the result remains a
 // candidate. Do not turn archiveSafe/restoreAuthorized on.
 return {file,archiveSafe:false,restoreAuthorized:false,
  postHashRecheckPassed:true,requiresWriterFence:true};
}
root.PasekaVideoArchiveV2ExportCandidate=Object.freeze({buildV2ArchiveCandidateFromDatabase});
})(typeof window!=='undefined'?window:globalThis);
