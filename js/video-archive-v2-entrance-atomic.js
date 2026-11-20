(function(root){
'use strict';
// ISOLATED, explicitly non-production PASEKA02 entrance-video commit experiment.
// Only new entrance_media originals, no journal originals or existing live videos.
// Atomically writes state+new originals+rollback snapshot+history, never cleanup.
// No runtime imports this module. Rollback with video is NOT authorized.
const STORES=['main','entrance_media','archive_staging','archive_history','full_backup'];
const LEDGER='video_recognition_ledger_v1';
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(x);
const hash=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
function fail(code){const e=new Error(code);e.code=code;throw e;}
function assertDb(db){
 if(!db?.objectStoreNames||STORES.some(n=>!db.objectStoreNames.contains(n)))
  fail('V2_ENTRANCE_STORES_MISSING');
}
function assertDeps(d){
 if(typeof d?.verify?.verifyStagedPendingAgainstArchive!=='function'||
    typeof d?.codec?.inspectMetadataArchive!=='function'||
    typeof d?.sha?.hashBlobHex!=='function'||
    typeof d?.guard?.validateRecognitionLedgerForV2!=='function'||
    typeof d?.gate?.checkRestoreLedgerCandidate!=='function'||
    typeof d?.gate?.checkLivePendingMediaIdentity!=='function'||
    !d?.crypto?.subtle?.digest)fail('V2_ENTRANCE_DEPS_MISSING');
}
function exact(value){let r;try{r=JSON.stringify(value);}catch(_){fail('V2_ENTRANCE_JSON_UNSAFE');}
 if(typeof r!=='string'||r.length>16*1024*1024)fail('V2_ENTRANCE_JSON_UNSAFE');return r;}
function noVideo(value,depth=0,seen=new Set()){
 if(depth>48)fail('V2_ENTRANCE_VIDEO_STATE_UNSAFE');
 if(typeof value==='string'){
  if(/(?:data:(?:video\/|application\/octet-stream)|blob:)/i.test(value))
   fail('V2_ENTRANCE_VIDEO_STATE_UNSAFE');
  return;
 }
 if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return;
 if(typeof value!=='object'||seen.has(value)||!(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null))
  fail('V2_ENTRANCE_VIDEO_STATE_UNSAFE');
 seen.add(value);
 if(!Array.isArray(value)&&(value.kind==='video'||value.type==='video'||typeof value.type==='string'&&value.type.startsWith('video/'))&&value.data!=null)
  fail('V2_ENTRANCE_VIDEO_STATE_UNSAFE');
 for(const child of (Array.isArray(value)?value:Object.values(value)))noVideo(child,depth+1,seen);
 seen.delete(value);
}
function validateState(v,fn){
 if(!obj(v)||!obj(v.meta)||v.meta.schemaVersion!==15||!id(v.meta.revisionId)||
    !Array.isArray(v.records)||typeof fn!=='function')
  fail('V2_ENTRANCE_STATE_INVALID');
 noVideo(v);
 const before=exact(v),out=fn(v);
 if(out===false||out==null||typeof out?.then==='function'||exact(v)!==before)
  fail('V2_ENTRANCE_STATE_INVALID');
}
const sessionId=backup=>'v2pending:'+backup;
const mediaId=(backup,video)=>sessionId(backup)+':entrance_media:'+encodeURIComponent(video.videoId);
function reads(tx,backupId){
 return {
  state:tx.objectStore('main').get('state'),
  ledger:tx.objectStore('main').get(LEDGER),
  liveKeys:tx.objectStore('entrance_media').getAllKeys(),
  staged:tx.objectStore('archive_staging').getAll(),
  history:tx.objectStore('archive_history').get(backupId),
  historyCount:tx.objectStore('archive_history').count(),
  backups:tx.objectStore('full_backup').count()
 };
}
function assertProtected(v,incoming,opt,fileHash,d){
 validateState(v.state,opt.validateState);
 if(v.state.meta.revisionId!==opt.expectedRevision)
  fail('V2_ENTRANCE_LIVE_REVISION_CHANGED');
 if(!obj(v.ledger)||!Array.isArray(v.liveKeys)||v.liveKeys.length!==0||
    !Array.isArray(v.staged)||v.backups!==0||v.historyCount!==1)
  fail('V2_ENTRANCE_PROTECTED_CONTEXT_CHANGED');
 d.guard.validateRecognitionLedgerForV2(v.ledger);
 d.gate.checkRestoreLedgerCandidate(v.ledger,incoming,d.guard);
 d.gate.checkLivePendingMediaIdentity(v.state,v.liveKeys,incoming);
 if(exact(v.ledger)!==exact(incoming.ledger))
  fail('V2_ENTRANCE_LEDGER_REWRITE_FORBIDDEN');
 const pending=incoming.pendingVideos;
 const key=sessionId(opt.backupId),h=v.history,
  header=v.staged.find(entry=>entry?.id===key);
 if(!Array.isArray(pending)||pending.length<1||pending.length>128||
    pending.some(p=>p.source!=='entrance_media')||
    v.staged.length!==pending.length+1||
    !obj(h)||h.backupId!==opt.backupId||
    h.kind!=='v2_pending_stage_only'||h.status!=='staged'||
    h.sessionId!==key||h.archiveSha256!==fileHash||
    h.pendingCount!==pending.length||
    !obj(header)||header.id!==key||header.sessionId!==key||
    header.kind!=='v2_pending_session'||header.status!=='protected_unverified'||
    header.backupId!==opt.backupId||
    header.expectedRevision!==opt.expectedRevision||
    header.archiveSha256!==fileHash||header.expectedEntries!==pending.length||
    !Array.isArray(header.entryIds)||header.entryIds.length!==pending.length||
    new Set(header.entryIds).size!==pending.length)
  fail('V2_ENTRANCE_STAGING_CHANGED');
 const stagedById=new Map(v.staged.map(row=>[row?.id,row]));
 if(stagedById.size!==v.staged.length)fail('V2_ENTRANCE_STAGING_CHANGED');
 let total=0;
 for(const video of pending){
  const rowId=mediaId(opt.backupId,video),row=stagedById.get(rowId);
  if(!header.entryIds.includes(rowId)||!obj(row)||
     row.kind!=='v2_pending_original'||row.sessionId!==key||
     row.backupId!==undefined||row.source!=='entrance_media'||
     row.videoId!==video.videoId||row.sourceSha256!==video.sourceSha256||
     row.sourceBytes!==video.sourceBytes||row.mimeType!==video.mimeType||
     !row.blob||typeof row.blob.slice!=='function'||
     row.blob.size!==video.sourceBytes||row.blob.type!==video.mimeType)
   fail('V2_ENTRANCE_STAGING_CHANGED');
  total+=video.sourceBytes;
 }
 if(!Number.isSafeInteger(total)||header.totalBytes!==total)
  fail('V2_ENTRANCE_STAGING_CHANGED');
}
function transaction(db,backupId,mode,processor){
 return new Promise((resolve,reject)=>{
  let tx,result,error=null,settled=false;
  const rejectOnce=e=>{if(!settled){settled=true;reject(e);}};
  const abort=e=>{error=e;try{tx.abort();}catch(_){rejectOnce(e);}};
  try{
   assertDb(db);tx=db.transaction(STORES,mode);
   const pending=reads(tx,backupId),values={};let count=Object.keys(pending).length;
   for(const [key,req] of Object.entries(pending)){
    req.onsuccess=()=>{
     values[key]=req.result;
     if(--count!==0)return;
     try{result=processor(tx,values);}
     catch(e){abort(e);}
    };
    req.onerror=()=>abort(req.error||new Error('V2_ENTRANCE_READ_FAILED'));
   }
   tx.oncomplete=()=>{if(!settled){settled=true;resolve(result);}};
   tx.onabort=()=>rejectOnce(error||tx.error||new Error('V2_ENTRANCE_TX_ABORTED'));
   tx.onerror=()=>{if(!error)error=tx.error||new Error('V2_ENTRANCE_TX_FAILED');};
  }catch(e){if(tx)try{tx.abort();}catch(_){}rejectOnce(e);}
 });
}
async function commitEntranceOnlyIsolated(db,file,opt,d){
 assertDb(db);assertDeps(d);
 if(!obj(opt)||!id(opt.backupId)||!id(opt.expectedRevision)||
    !id(opt.newRevisionId)||opt.newRevisionId===opt.expectedRevision||
    typeof opt.validateState!=='function'||
    !file||typeof file.slice!=='function')
  fail('V2_ENTRANCE_OPTIONS_INVALID');
 // Phase A: strong SHA audit, then build immutable sources from the ORIGINAL
 // PASEKA02 archive, never from potentially mutable staging records.
 const audited=await d.verify.verifyStagedPendingAgainstArchive(db,file,opt,d);
 if(audited?.verifiedAtSnapshot!==true||audited.transactionAborted!==true||
    audited.restoreAuthorized!==false||audited.cleanupAuthorized!==false||
    audited.byteIntegrityLocked!==false)
  fail('V2_ENTRANCE_AUDIT_INVALID');
 const incoming=await d.codec.inspectMetadataArchive(file,d.crypto,d.guard,d.sha,d.recordAdapter);
 if(incoming?.format!=='paseka-archive'||incoming.version!==2||
    incoming.archiveSafe!==false||incoming.restoreAuthorized!==false||
    incoming.backupId!==opt.backupId||!Array.isArray(incoming.pendingVideos)||
    incoming.pendingVideos.length<1||
    incoming.pendingVideos.some(x=>x?.source!=='entrance_media'))
  fail('V2_ENTRANCE_ARCHIVE_UNSUPPORTED');
 validateState(incoming.state,opt.validateState);
 const fileHash=await d.sha.hashBlobHex(file);
 if(!hash(fileHash)||fileHash!==audited.archiveSha256)
  fail('V2_ENTRANCE_ARCHIVE_HASH_CHANGED');
 const pinned=[];
 for(const video of incoming.pendingVideos){
  if(!obj(video)||!id(video.videoId)||!hash(video.sourceSha256)||
     !Number.isSafeInteger(video.sourceBytes)||video.sourceBytes<1||
     !video.blob||typeof video.blob.slice!=='function'||
     video.blob.size!==video.sourceBytes||
     typeof video.mimeType!=='string'||!/^(?:video\/[a-z0-9.+-]+|application\/octet-stream)$/i.test(video.mimeType))
   fail('V2_ENTRANCE_VIDEO_INVALID');
  const immutable=new Blob([video.blob],{type:video.mimeType});
  if(immutable.size!==video.sourceBytes||
     await d.sha.hashBlobHex(immutable)!==video.sourceSha256)
   fail('V2_ENTRANCE_VIDEO_HASH_CHANGED');
  pinned.push({id:video.videoId,blob:immutable,bytes:video.sourceBytes,
   blobSha256:video.sourceSha256,mimeType:video.mimeType});
 }
 return transaction(db,opt.backupId,'readwrite',(tx,v)=>{
  assertProtected(v,incoming,opt,fileHash,d);
  const imported={...incoming.state,meta:{
   ...incoming.state.meta,revisionId:opt.newRevisionId
  }};
  validateState(imported,opt.validateState);
  const rollbackKey='v2entrance:'+opt.backupId;
  const snapshot={kind:'v2_entrance_only_rollback_unverified',
   backupId:opt.backupId,archiveSha256:fileHash,
   beforeState:v.state,afterState:imported,beforeLedger:v.ledger,
   previousRevisionId:opt.expectedRevision,importedRevisionId:opt.newRevisionId,
   // Previous live video library is REQUIRED to be empty. Never silently
   // replace or delete a previously saved original in this test-only path.
   beforeEntranceCount:0,
   importedVideos:pinned.map(p=>({id:p.id,blobSha256:p.blobSha256,
    bytes:p.bytes,mimeType:p.mimeType}))
  };
  const history={...v.history,kind:'v2_entrance_only',
   status:'committed_rollback_blocked',
   previousRevisionId:opt.expectedRevision,
   importedRevisionId:opt.newRevisionId,archiveSha256:fileHash,
   rollbackKey};
  const main=tx.objectStore('main'),live=tx.objectStore('entrance_media');
  tx.objectStore('full_backup').add(snapshot,rollbackKey);
  tx.objectStore('archive_history').put(history);
  main.put(imported,'state');
  // Ledger is never written: every existing result and tombstone survives.
  for(const original of pinned)live.add({
   id:original.id,blob:original.blob,
   blobSha256:original.blobSha256,bytes:original.bytes,
   mimeType:original.mimeType
  });
  // No staging originals, snapshots, or history are deleted.
  return {committed:true,backupId:opt.backupId,
   importedRevisionId:opt.newRevisionId,pendingVideoCount:pinned.length,
   rollbackSnapshotPreserved:true,rollbackAuthorized:false,
   restoreAuthorized:false,cleanupAuthorized:false,archiveSafe:false};
 });
}
function inspectEntranceCommit(db,backupId,d){
 if(!id(backupId)||typeof d?.guard?.validateRecognitionLedgerForV2!=='function')
  return Promise.reject(Object.assign(new Error('V2_ENTRANCE_INSPECT_OPTIONS_INVALID'),
   {code:'V2_ENTRANCE_INSPECT_OPTIONS_INVALID'}));
 return new Promise((resolve,reject)=>{
  let tx,settled=false,items={};
  const end=e=>{if(!settled){settled=true;reject(e);}};
  try{
   assertDb(db);tx=db.transaction(STORES,'readonly');
   const q={
    state:tx.objectStore('main').get('state'),
    ledger:tx.objectStore('main').get(LEDGER),
    live:tx.objectStore('entrance_media').getAll(),
    staging:tx.objectStore('archive_staging').getAllKeys(),
    history:tx.objectStore('archive_history').get(backupId),
    historyCount:tx.objectStore('archive_history').count(),
    snapshot:tx.objectStore('full_backup').get('v2entrance:'+backupId),
    backupCount:tx.objectStore('full_backup').count()
   };
   for(const [key,req] of Object.entries(q)){
    req.onsuccess=()=>{items[key]=req.result;};
    req.onerror=()=>{try{tx.abort();}catch(_){}end(req.error||new Error('V2_ENTRANCE_INSPECT_READ_FAILED'));};
   }
   tx.onabort=()=>end(tx.error||new Error('V2_ENTRANCE_INSPECT_ABORTED'));
   tx.oncomplete=()=>{
    let status='manual_review_required';
    try{
     const {state,ledger,live,staging,history:h,snapshot:s,historyCount,backupCount}=items;
     d.guard.validateRecognitionLedgerForV2(ledger);
     if(obj(state)&&obj(h)&&obj(s)&&
       state.meta?.schemaVersion===15&&id(state.meta.revisionId)&&
       historyCount===1&&backupCount===1&&
       h.kind==='v2_entrance_only'&&h.status==='committed_rollback_blocked'&&
       h.backupId===backupId&&h.rollbackKey==='v2entrance:'+backupId&&
       s.kind==='v2_entrance_only_rollback_unverified'&&
       s.backupId===backupId&&s.beforeEntranceCount===0&&
       h.archiveSha256===s.archiveSha256&&hash(h.archiveSha256)&&
       h.previousRevisionId===s.previousRevisionId&&
       h.importedRevisionId===s.importedRevisionId&&
       state.meta.revisionId===h.importedRevisionId&&
       exact(state)===exact(s.afterState)&&
       exact(ledger)===exact(s.beforeLedger)&&
       Array.isArray(live)&&Array.isArray(s.importedVideos)&&
       live.length===s.importedVideos.length&&
       live.every(v=>s.importedVideos.some(p=>p.id===v.id&&
          p.blobSha256===v.blobSha256&&p.bytes===v.bytes&&
          p.mimeType===v.mimeType&&v.blob?.size===p.bytes))&&
       Array.isArray(staging)&&staging.length===s.importedVideos.length+1)
      status='committed_media_unverified';
    }catch(_){status='manual_review_required';}
    if(!settled){settled=true;resolve({backupId,status,
     requiresManualReview:status==='manual_review_required',
     byteIntegrityVerified:false,rollbackAuthorized:false,
     restoreAuthorized:false,cleanupAuthorized:false,archiveSafe:false});}
   };
  }catch(e){if(tx)try{tx.abort();}catch(_){}end(e);}
 });
}
root.PasekaVideoArchiveV2EntranceAtomic=Object.freeze({
 commitEntranceOnlyIsolated,inspectEntranceCommit
});
})(typeof window!=='undefined'?window:globalThis);
