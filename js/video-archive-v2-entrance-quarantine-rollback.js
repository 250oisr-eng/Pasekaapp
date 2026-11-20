(function(root){
'use strict';
// ISOLATED PASEKA02 entrance rollback: atomically QUARANTINE every current
// live Blob into protected full_backup before removing its live index record.
// No original video bytes are discarded; automatic cleanup is never allowed.
// Only the exact previously committed entrance-only snapshot is supported.
const STORES=['main','entrance_media','archive_staging','archive_history','full_backup'];
const LEDGER='video_recognition_ledger_v1';
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(x);
const hash=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
function fail(code){const e=new Error(code);e.code=code;throw e;}
function requireDb(db){
 if(!db?.objectStoreNames||STORES.some(n=>!db.objectStoreNames.contains(n)))
  fail('V2_QUARANTINE_STORES_MISSING');
}
function canonical(v){
 let text;try{text=JSON.stringify(v);}catch(_){fail('V2_QUARANTINE_JSON_INVALID');}
 if(typeof text!=='string'||text.length>16*1024*1024)
  fail('V2_QUARANTINE_JSON_INVALID');
 return text;
}
function noOriginal(value,depth=0,seen=new Set()){
 if(depth>48)fail('V2_QUARANTINE_STATE_BINARY');
 if(typeof value==='string'){
  if(/(?:data:(?:video\/|application\/octet-stream)|blob:)/i.test(value))
   fail('V2_QUARANTINE_STATE_BINARY');
  return;
 }
 if(value==null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return;
 if(typeof value!=='object'||seen.has(value)||!(Array.isArray(value)||
   Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null))
  fail('V2_QUARANTINE_STATE_BINARY');
 seen.add(value);
 if(!Array.isArray(value)&&
    (value.kind==='video'||value.type==='video'||typeof value.type==='string'&&value.type.startsWith('video/'))&&
    value.data!=null)fail('V2_QUARANTINE_STATE_BINARY');
 for(const item of (Array.isArray(value)?value:Object.values(value)))
  noOriginal(item,depth+1,seen);
 seen.delete(value);
}
function checkState(v,validator){
 if(!obj(v)||!obj(v.meta)||v.meta.schemaVersion!==15||
    !id(v.meta.revisionId)||!Array.isArray(v.records)||
    typeof validator!=='function')fail('V2_QUARANTINE_STATE_INVALID');
 noOriginal(v);
 const earlier=canonical(v),valid=validator(v);
 if(valid===false||valid==null||typeof valid?.then==='function'||canonical(v)!==earlier)
  fail('V2_QUARANTINE_STATE_INVALID');
}
function readRequests(tx,backupId){
 return {
  state:tx.objectStore('main').get('state'),
  ledger:tx.objectStore('main').get(LEDGER),
  live:tx.objectStore('entrance_media').getAll(),
  staged:tx.objectStore('archive_staging').getAll(),
  history:tx.objectStore('archive_history').get(backupId),
  historyCount:tx.objectStore('archive_history').count(),
  snapshot:tx.objectStore('full_backup').get('v2entrance:'+backupId),
  backupCount:tx.objectStore('full_backup').count()
 };
}
function runTransaction(db,backupId,mode,process){
 return new Promise((resolve,reject)=>{
  let tx,result,reason=null,finished=false;
  const rejectOnce=e=>{if(!finished){finished=true;reject(e);}};
  const abort=e=>{reason=e;try{tx.abort();}catch(_){rejectOnce(e);}};
  try{
   requireDb(db);tx=db.transaction(STORES,mode);
   const requests=readRequests(tx,backupId),values={};let count=Object.keys(requests).length;
   for(const [name,request] of Object.entries(requests)){
    request.onsuccess=()=>{
     values[name]=request.result;
     if(--count!==0)return;
     try{result=process(tx,values);}
     catch(e){abort(e);}
    };
    request.onerror=()=>abort(request.error||new Error('V2_QUARANTINE_READ_FAILED'));
   }
   tx.oncomplete=()=>{if(!finished){finished=true;resolve(result);}};
   tx.onabort=()=>rejectOnce(reason||tx.error||new Error('V2_QUARANTINE_ABORTED'));
   tx.onerror=()=>{if(!reason)reason=tx.error;};
  }catch(e){if(tx)try{tx.abort();}catch(_){}rejectOnce(e);}
 });
}
function validated(v,opt,d){
 const h=v.history,s=v.snapshot;
 if(!obj(h)||!obj(s)||h.kind!=='v2_entrance_only'||
    h.status!=='committed_rollback_blocked'||h.backupId!==opt.backupId||
    h.rollbackKey!=='v2entrance:'+opt.backupId||
    s.kind!=='v2_entrance_only_rollback_unverified'||
    s.backupId!==opt.backupId||s.beforeEntranceCount!==0||
    !hash(h.archiveSha256)||h.archiveSha256!==s.archiveSha256||
    h.previousRevisionId!==s.previousRevisionId||
    h.importedRevisionId!==s.importedRevisionId||
    !id(h.previousRevisionId)||!id(h.importedRevisionId)||
    h.previousRevisionId===h.importedRevisionId||
    h.importedRevisionId!==opt.expectedRevision||
    v.historyCount!==1||v.backupCount!==1||
    !Array.isArray(v.live)||!Array.isArray(v.staged))
  fail('V2_QUARANTINE_HISTORY_CHANGED');
 checkState(v.state,opt.validateState);
 checkState(s.beforeState,opt.validateState);
 checkState(s.afterState,opt.validateState);
 if(v.state.meta.revisionId!==opt.expectedRevision||
    s.beforeState.meta.revisionId!==h.previousRevisionId||
    s.afterState.meta.revisionId!==h.importedRevisionId||
    canonical(v.state)!==canonical(s.afterState))
  fail('V2_QUARANTINE_IMPORTED_STATE_CHANGED');
 if(!obj(v.ledger))fail('V2_QUARANTINE_LEDGER_CHANGED');
 d.guard.validateRecognitionLedgerForV2(v.ledger);
 d.guard.validateRecognitionLedgerForV2(s.beforeLedger);
 if(canonical(v.ledger)!==canonical(s.beforeLedger))
  fail('V2_QUARANTINE_LEDGER_CHANGED');
 const proofs=s.importedVideos;
 if(!Array.isArray(proofs)||proofs.length<1||proofs.length>128||
    new Set(proofs.map(p=>p?.id)).size!==proofs.length||
    v.live.length!==proofs.length)
  fail('V2_QUARANTINE_VIDEO_SET_CHANGED');
 const liveIds=new Set();
 for(const row of v.live){
  const p=proofs.find(p=>p?.id===row?.id);
  if(!obj(row)||!obj(p)||!id(row.id)||liveIds.has(row.id)||
     !hash(p.blobSha256)||row.blobSha256!==p.blobSha256||
     row.bytes!==p.bytes||row.mimeType!==p.mimeType||
     !row.blob||typeof row.blob.slice!=='function'||
     row.blob.size!==p.bytes||row.blob.type!==p.mimeType)
   fail('V2_QUARANTINE_VIDEO_SET_CHANGED');
  liveIds.add(row.id);
 }
 const sessionId='v2pending:'+opt.backupId;
 const header=v.staged.find(row=>row?.id===sessionId);
 if(!obj(header)||header.kind!=='v2_pending_session'||
    header.status!=='protected_unverified'||header.backupId!==opt.backupId||
    header.sessionId!==sessionId||header.archiveSha256!==h.archiveSha256||
    header.expectedEntries!==proofs.length||
    !Array.isArray(header.entryIds)||header.entryIds.length!==proofs.length||
    new Set(header.entryIds).size!==proofs.length||
    v.staged.length!==proofs.length+1)
  fail('V2_QUARANTINE_STAGING_CHANGED');
 const entries=new Map(v.staged.map(x=>[x?.id,x]));
 if(entries.size!==v.staged.length)fail('V2_QUARANTINE_STAGING_CHANGED');
 for(const p of proofs){
  const key=sessionId+':entrance_media:'+encodeURIComponent(p.id),row=entries.get(key);
  if(!header.entryIds.includes(key)||!obj(row)||row.kind!=='v2_pending_original'||
     row.sessionId!==sessionId||row.backupId!==undefined||
     row.source!=='entrance_media'||row.videoId!==p.id||
     row.sourceSha256!==p.blobSha256||row.sourceBytes!==p.bytes||
     row.mimeType!==p.mimeType)
   fail('V2_QUARANTINE_STAGING_CHANGED');
 }
 return {snapshot:s,history:h};
}
function fingerprint(v){
 const live=v.live.map(x=>[x?.id,x?.blobSha256,x?.bytes,x?.mimeType,x?.blob?.size,x?.blob?.type]);
 const staged=v.staged.map(x=>[x?.id,x?.kind,x?.sessionId,x?.backupId,
  x?.source,x?.videoId,x?.sourceSha256,x?.sourceBytes,x?.mimeType,
  x?.blob?.size,x?.blob?.type]);
 // Exact bytes are NOT locked by this metadata fingerprint. All live Blob
 // handles are preserved byte-for-byte in full_backup at final write lock.
 return canonical({state:v.state,ledger:v.ledger,live,staged,
  history:v.history,historyCount:v.historyCount,
  snapshot:v.snapshot,backupCount:v.backupCount});
}
async function quarantineRollbackIsolated(db,opt,d){
 requireDb(db);
 if(!obj(opt)||!id(opt.backupId)||!id(opt.expectedRevision)||
    !id(opt.rollbackRevisionId)||opt.rollbackRevisionId===opt.expectedRevision||
    typeof opt.validateState!=='function'||
    typeof d?.guard?.validateRecognitionLedgerForV2!=='function'||
    typeof d?.sha?.hashBlobHex!=='function')
  fail('V2_QUARANTINE_OPTIONS_INVALID');
 // AGENTS.md: match importedRevisionId and current revision BEFORE async SHA,
 // then re-check both inside the final readwrite transaction.
 const prior=await runTransaction(db,opt.backupId,'readonly',(_tx,v)=>{
  validated(v,opt,d);return v;
 });
 const baseline=fingerprint(prior);
 for(const media of prior.live){
  if(await d.sha.hashBlobHex(media.blob)!==media.blobSha256)
   fail('V2_QUARANTINE_VIDEO_HASH_CHANGED');
 }
 return runTransaction(db,opt.backupId,'readwrite',(tx,v)=>{
  const checked=validated(v,opt,d);
  if(fingerprint(v)!==baseline)
   fail('V2_QUARANTINE_CONCURRENT_CHANGE');
  const restored={...checked.snapshot.beforeState,meta:{
   ...checked.snapshot.beforeState.meta,revisionId:opt.rollbackRevisionId
  }};
  checkState(restored,opt.validateState);
  // This is a MOVE of live references, not destruction of video bytes.
  // A same-size writer racing after SHA may change those bytes; we retain
  // the actual current Blob in quarantine and never claim byte integrity.
  const protectedMedia=v.live.map(row=>({
   id:row.id,blob:row.blob,blobSha256:row.blobSha256,
   bytes:row.bytes,mimeType:row.mimeType
  }));
  tx.objectStore('full_backup').put({...checked.snapshot,
   kind:'v2_entrance_quarantine_rollback_snapshot',
   quarantineStatus:'bytes_unverified_after_lock',
   quarantinedMedia:protectedMedia,revertedRevisionId:opt.rollbackRevisionId
  },'v2entrance:'+opt.backupId);
  tx.objectStore('archive_history').put({...checked.history,
   status:'reverted_quarantined_unverified',
   revertedRevisionId:opt.rollbackRevisionId});
  tx.objectStore('main').put(restored,'state');
  for(const row of protectedMedia)tx.objectStore('entrance_media').delete(row.id);
  // All writes above commit or abort together. Staging and ledger are intact.
  return {reverted:true,backupId:opt.backupId,
   restoredRevisionId:opt.rollbackRevisionId,
   quarantineOriginalCount:protectedMedia.length,
   protectedCopiesRetained:true,byteIntegrityLocked:false,
   rollbackAuthorized:false,restoreAuthorized:false,
   cleanupAuthorized:false,archiveSafe:false};
 });
}
function inspectQuarantine(db,backupId,d){
 if(!id(backupId)||typeof d?.guard?.validateRecognitionLedgerForV2!=='function')
  return Promise.reject(Object.assign(new Error('V2_QUARANTINE_OPTIONS_INVALID'),
   {code:'V2_QUARANTINE_OPTIONS_INVALID'}));
 return runTransaction(db,backupId,'readonly',(_tx,v)=>{
  let status='manual_review_required';
  try{
   const h=v.history,s=v.snapshot;
   d.guard.validateRecognitionLedgerForV2(v.ledger);
   if(obj(h)&&obj(s)&&h.backupId===backupId&&s.backupId===backupId&&
      h.kind==='v2_entrance_only'&&h.status==='reverted_quarantined_unverified'&&
      s.kind==='v2_entrance_quarantine_rollback_snapshot'&&
      s.quarantineStatus==='bytes_unverified_after_lock'&&
      h.rollbackKey==='v2entrance:'+backupId&&
      h.importedRevisionId===s.importedRevisionId&&
      h.previousRevisionId===s.previousRevisionId&&
      h.archiveSha256===s.archiveSha256&&hash(h.archiveSha256)&&
      h.revertedRevisionId===s.revertedRevisionId&&id(h.revertedRevisionId)&&
      v.historyCount===1&&v.backupCount===1&&
      Array.isArray(v.live)&&v.live.length===0&&
      Array.isArray(s.quarantinedMedia)&&
      Array.isArray(s.importedVideos)&&
      s.quarantinedMedia.length===s.importedVideos.length&&
      s.quarantinedMedia.every(row=>s.importedVideos.some(p=>
        row.id===p.id&&row.blobSha256===p.blobSha256&&
        row.bytes===p.bytes&&row.mimeType===p.mimeType&&
        row.blob?.size===p.bytes))&&
      canonical(v.ledger)===canonical(s.beforeLedger)&&
      canonical({...v.state,meta:{...v.state.meta,
        revisionId:s.beforeState.meta.revisionId}})===canonical(s.beforeState))
    status='reverted_quarantine_unverified';
  }catch(_){status='manual_review_required';}
  return {backupId,status,requiresManualReview:status==='manual_review_required',
   byteIntegrityVerified:false,rollbackAuthorized:false,
   restoreAuthorized:false,cleanupAuthorized:false,archiveSafe:false};
 });
}
root.PasekaVideoArchiveV2QuarantineRollback=Object.freeze({
 quarantineRollbackIsolated,inspectQuarantine
});
})(typeof window!=='undefined'?window:globalThis);
