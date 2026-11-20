(function(root){
'use strict';
// Pure, fail-closed authorization. This module NEVER deletes files or modifies records.
// Storage-specific deletion must be implemented only after durable result and backup protections.
const SOURCES=Object.freeze(['entrance_media','record_media']);
const ID=/^[^\s]{1,200}$/;
function isId(value){return typeof value==='string'&&ID.test(value);}
function authorizeOriginalCleanup(video,receipt){
 if(!video||typeof video!=='object'||!isId(video.id)||!SOURCES.includes(video.source))
  return {ok:false,reason:'invalid_video_identity'};
 if(!receipt||typeof receipt!=='object'||receipt.videoId!==video.id||receipt.source!==video.source)
  return {ok:false,reason:'receipt_video_mismatch'};
 if(receipt.recognitionStatus!=='completed'||receipt.recognitionSucceeded!==true)
  return {ok:false,reason:'recognition_not_confirmed'};
 if(receipt.resultPersisted!==true||!isId(receipt.resultId)||!isId(receipt.durableRevisionId))
  return {ok:false,reason:'durable_result_not_confirmed'};
 if(receipt.storageVerified!==true)
  return {ok:false,reason:'storage_not_verified'};
 if(video.expectedRevisionId&&video.expectedRevisionId!==receipt.sourceRevisionId)
  return {ok:false,reason:'stale_source_revision'};
 if(receipt.archiveSafe!==true)
  return {ok:false,reason:'backup_restore_not_safe'};
 return {ok:true,videoId:video.id,source:video.source,resultId:receipt.resultId,
         action:'cleanup_required',note:'Authorization only; no binary has been deleted.'};
}

function inspectManagedVideoCopies(videoId, mainState, autoBackup){
 if(!isId(videoId))return {ok:false,reason:'invalid_video_identity',copies:[],ambiguous:[]};
 const copies=[],ambiguous=[];
 function scanMedia(items,location){
  if(!Array.isArray(items))return;
  items.forEach((item,index)=>{
   if(!item||item.kind!=='video')return;
   const where=location+'.media['+index+']';
   if(item.videoId===videoId||item.id===videoId)copies.push(where);
   else if(!isId(item.videoId)&&!isId(item.id)&&item.data)ambiguous.push(where);
  });
 }
 function scanState(state,prefix){
  if(!state||typeof state!=='object')return;
  if(Array.isArray(state.records))state.records.forEach((rec,i)=>scanMedia(rec&&rec.media,prefix+'.records['+i+']'));
  if(Array.isArray(state.snapshots))state.snapshots.forEach((snapshot,i)=>{
   const nested=snapshot&&(snapshot.state||snapshot.data);
   if(nested&&typeof nested==='object'&&Array.isArray(nested.records))
    nested.records.forEach((rec,j)=>scanMedia(rec&&rec.media,prefix+'.snapshots['+i+'].records['+j+']'));
  });
 }
 scanState(mainState,'main');
 if(autoBackup&&typeof autoBackup==='object')scanState(autoBackup.state||autoBackup,'autoBackup');
 return {ok:copies.length===0&&ambiguous.length===0,
  reason:copies.length?'original_copies_present':ambiguous.length?'unidentified_legacy_videos':null,
  copies,ambiguous};
}

root.PasekaVideoRetentionGuard=Object.freeze({SOURCES,authorizeOriginalCleanup,inspectManagedVideoCopies});
})(typeof window!=='undefined'?window:globalThis);
