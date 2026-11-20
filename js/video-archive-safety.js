(function(root){
'use strict';
// Pure compatibility preflight for the future .paseka and JSON restore adapters.
// Not wired to existing restore/export; never mutates data or deletes media.
const key=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!/\s/.test(value);
function validLedger(ledger){
 return ledger&&ledger.version===1&&Array.isArray(ledger.entries)&&ledger.entries.every(e=>
 e&&key(e.videoId)&&key(e.resultId)&&['entrance_media','record_media'].includes(e.source)&&
 ['blocked_archive_safety','delete_required','deleted'].includes(e.cleanupState));
}
function collectOriginals(state,entranceVideos){
 const ids=new Set(),unknown=[];
 if(!state||typeof state!=='object'||!Array.isArray(state.records))return {ok:false,reason:'invalid_state'};
 if(!Array.isArray(entranceVideos))return {ok:false,reason:'invalid_media_list'};
 for(const video of entranceVideos){
  if(!video||!key(video.id))return {ok:false,reason:'unidentified_entrance_video'};
  ids.add('entrance_media:'+video.id);
 }
 for(const record of state.records){
  if(!record||typeof record!=='object')return {ok:false,reason:'invalid_record'};
  if(record.media==null)continue;
  if(!Array.isArray(record.media))return {ok:false,reason:'invalid_record_media'};
  for(const item of record.media){
   if(!item||item.kind!=='video')continue;
   if(!key(item.videoId)&&!key(item.id)){unknown.push(record.id||'unknown');continue;}
   ids.add('record_media:'+(item.videoId||item.id));
  }
 }
 return {ok:true,ids,unknown};
}
function inspectRestoreRisk(localLedger,incomingState,incomingVideos,options={}){
 if(!validLedger(localLedger))return {ok:false,reason:'local_ledger_missing_or_corrupt'};
 const originals=collectOriginals(incomingState,incomingVideos);
 if(!originals.ok)return {ok:false,reason:originals.reason};
 // Never restore when the source format cannot carry a consistent recognition ledger.
 if(options.archiveCarriesLedger!==true||!validLedger(options.incomingLedger))
  return {ok:false,reason:'archive_does_not_preserve_recognition_ledger'};
 const incoming=options.incomingLedger;
 const indexed=new Map();
 for(const entry of incoming.entries){
  const id=entry.source+':'+entry.videoId;
  if(indexed.has(id))return {ok:false,reason:'duplicate_incoming_ledger_identity'};
  indexed.set(id,entry);
 }
 for(const old of localLedger.entries){
  const id=old.source+':'+old.videoId;
  const next=indexed.get(id);
  if(!next||next.resultId!==old.resultId)
   return {ok:false,reason:'recognition_history_would_be_lost',videoId:old.videoId};
  if(old.cleanupState==='deleted'&&originals.ids.has(id))
   return {ok:false,reason:'deleted_original_would_reappear',videoId:old.videoId};
  if(old.cleanupState==='deleted'&&next.cleanupState!=='deleted')
   return {ok:false,reason:'cleanup_tombstone_would_be_lost',videoId:old.videoId};
 }
 // Unknown legacy media is never silently treated as recognized, and cannot
 // authorize further automated cleanup even if restore itself is otherwise safe.
 return {ok:originals.unknown.length===0,
   reason:originals.unknown.length?'legacy_video_identity_unknown':null,
   scannedOriginals:originals.ids.size};
}
function inspectExportRisk(ledger,archiveCarriesLedger){
 if(!validLedger(ledger))return {ok:false,reason:'ledger_missing_or_corrupt'};
 if(ledger.entries.length>0&&archiveCarriesLedger!==true)
  return {ok:false,reason:'recognition_history_not_in_archive'};
 return {ok:true,reason:null};
}
root.PasekaVideoArchiveSafety=Object.freeze({validLedger,collectOriginals,inspectRestoreRisk,inspectExportRisk});
})(typeof window!=='undefined'?window:globalThis);
