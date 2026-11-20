(function(root){
'use strict';
// Pure PRE-RESTORE gate only. It cannot authorize a write or cleanup.
// A real commit must repeat this check under the final readwrite lock.
function fail(code){const e=new Error(code);e.code=code;throw e;}
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const validId=v=>typeof v==='string'&&v.length>0&&v.length<=200&&!/\s/.test(v);
const validHash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const videoLike=v=>v?.kind==='video'||v?.type==='video'||typeof v?.type==='string'&&v.type.startsWith('video/');
function canonical(value){
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(!object(value)||Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)
  fail('V2_RESTORE_LEDGER_VALUE_INVALID');
 return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
}
function checkRestoreLedgerCandidate(currentLedger,incoming,guard){
 if(!guard||typeof guard.validateRecognitionLedgerForV2!=='function'||
    typeof guard.checkCandidateVideoPayloads!=='function')fail('V2_RESTORE_GUARD_MISSING');
 if(!object(incoming)||!object(incoming.state)||!Array.isArray(incoming.pendingVideos)||
    !object(incoming.ledger))fail('V2_RESTORE_CANDIDATE_INVALID');
 const existing=guard.validateRecognitionLedgerForV2(currentLedger);
 const uploaded=guard.validateRecognitionLedgerForV2(incoming.ledger);
 guard.checkCandidateVideoPayloads(incoming.ledger,incoming.pendingVideos);
 // Import may carry additional old recognition history, but must never
 // overwrite, downgrade, or omit any recognition already present locally.
 const known=new Map(incoming.ledger.entries.map(entry=>[entry.source+':'+entry.videoId,entry]));
 for(const current of currentLedger.entries){
  const next=known.get(current.source+':'+current.videoId);
  if(!next)fail('V2_RESTORE_LEDGER_HISTORY_LOST');
  if(canonical(current)!==canonical(next))fail('V2_RESTORE_LEDGER_HISTORY_CONFLICT');
 }
 // Both identity alias and hash alias are checked; videoId alone cannot
 // justify restoring a byte-for-byte copy under a new name.
 const allRecognized=[...currentLedger.entries,...incoming.ledger.entries];
 const recognizedHashes=new Set(allRecognized.map(entry=>entry.sourceSha256));
 const recognizedKeys=new Set(allRecognized.map(entry=>entry.source+':'+entry.videoId));
 const seen=new Set(),pendingByKey=new Map();
 for(const video of incoming.pendingVideos){
  if(!object(video)||!['entrance_media','record_media'].includes(video.source)||
     !validId(video.videoId)||!validHash(video.sourceSha256)||
     !Number.isSafeInteger(video.sourceBytes)||video.sourceBytes<1)
   fail('V2_RESTORE_PENDING_VIDEO_INVALID');
  const key=video.source+':'+video.videoId;
  if(seen.has(key))fail('V2_RESTORE_PENDING_DUPLICATE');
  seen.add(key);
  pendingByKey.set(key,video);
  if(recognizedKeys.has(key)||recognizedHashes.has(video.sourceSha256))
   fail('V2_RESTORE_RECOGNIZED_ORIGINAL');
 }
 // Parsed PASEKA02 state may have rehydrated journal Data URLs; compare them
 // with all known identities and hashes as well, even if a caller supplies
 // an incomplete pendingVideos list.
 if(!Array.isArray(incoming.state.records))fail('V2_RESTORE_STATE_RECORDS_UNAVAILABLE');
 const observedRecordIds=new Set();
 for(const record of incoming.state.records){
  if(!object(record))fail('V2_RESTORE_RECORD_INVALID');
  if(!Array.isArray(record.media))continue;
  for(const media of record.media){
   if(!object(media))fail('V2_RESTORE_MEDIA_INVALID');
   const hasVideoData=typeof media.data==='string'&&/^data:(?:video\/|application\/octet-stream)/i.test(media.data);
   if(hasVideoData&&!videoLike(media))fail('V2_RESTORE_UNCLASSIFIED_VIDEO');
   if(!videoLike(media))continue;
   if(!validId(media.videoId))fail('V2_RESTORE_VIDEO_ID_MISSING');
   const key='record_media:'+media.videoId;
   if(observedRecordIds.has(key))fail('V2_RESTORE_RECORD_DUPLICATE');
   observedRecordIds.add(key);
   if(media.archivePendingVideoV2!=null)fail('V2_RESTORE_TRANSIENT_MARKER');
   // A recognized video may remain as metadata with data=null. Its actual
   // original data must not be restored from a previous backup.
   if((recognizedKeys.has(key)||validHash(media.sourceSha256)&&recognizedHashes.has(media.sourceSha256))&&media.data!=null)
    fail('V2_RESTORE_RECOGNIZED_ORIGINAL');
   if(media.data!=null){
    if(typeof media.data!=='string'||!/^data:(?:video\/[a-z0-9.+-]+|application\/octet-stream);base64,/i.test(media.data))
     fail('V2_RESTORE_RECORD_VIDEO_ENCODING');
    const matched=pendingByKey.get(key);
    if(!matched)fail('V2_RESTORE_UNLISTED_RECORD_VIDEO');
    if(media.sourceSha256!==matched.sourceSha256||media.sourceBytes!==matched.sourceBytes)
     fail('V2_RESTORE_RECORD_SOURCE_MISMATCH');
   }
  }
 }
 for(const video of incoming.pendingVideos){
  if(video.source==='record_media'&&!observedRecordIds.has('record_media:'+video.videoId))
   fail('V2_RESTORE_UNREFERENCED_RECORD_VIDEO');
 }
 return {
  historyPreserved:existing.entryCount,
  incomingRecognitionCount:uploaded.entryCount,
  inspectedPendingVideoCount:seen.size,
  preflightPassed:true,
  restoreAuthorized:false,
  archiveSafe:false,
  requiresAtomicCommitCheck:true
 };
}
root.PasekaVideoArchiveV2RestoreGate=Object.freeze({checkRestoreLedgerCandidate});
})(typeof window!=='undefined'?window:globalThis);
