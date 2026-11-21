(function(root){
'use strict';
// ISOLATED PASEKA02 pending-media staging rehearsal. No live/UI integration,
// restore, cleanup, deletion, or rights to treat a staged copy as a backup.
const STORES=['main','entrance_media','archive_staging','archive_history','full_backup'];
const LEDGER_KEY='video_recognition_ledger_v1';
const MAX_PENDING=128,MAX_BYTES=512*1024*1024;
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(x);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function fail(code){const e=new Error(code);e.code=code;throw e;}
function requireDb(db){
 if(!db?.objectStoreNames||STORES.some(name=>!db.objectStoreNames.contains(name)))
  fail('V2_STAGE_STORES_MISSING');
}
function requireDeps(d){
 if(typeof d?.codec?.inspectMetadataArchive!=='function'||
    typeof d?.guard?.validateRecognitionLedgerForV2!=='function'||
    typeof d?.gate?.checkRestoreLedgerCandidate!=='function'||
    typeof d?.gate?.checkLivePendingMediaIdentity!=='function'||
    typeof d?.sha?.hashBlobHex!=='function'||!d?.crypto?.subtle?.digest)
  fail('V2_STAGE_DEPENDENCIES_MISSING');
}
function sessionId(backupId){return 'v2pending:'+backupId;}
function entryId(backupId,video){
 return sessionId(backupId)+':'+video.source+':'+encodeURIComponent(video.videoId);
}
function failAbort(tx,error,record){
 record.error=error;
 try{tx.abort();}catch(_){record.reject(error);}
}
function runTx(db,mode,makeReads,afterReads){
 return new Promise((resolve,reject)=>{
  let tx,settled=false,result;
  const record={error:null,reject(error){if(!settled){settled=true;reject(error);}}};
  try{
   requireDb(db);
   tx=db.transaction(STORES,mode);
   const requests=makeReads(tx),names=Object.keys(requests),values={};
   if(names.length===0)fail('V2_STAGE_READS_EMPTY');
   let remaining=names.length;
   for(const name of names){
    const request=requests[name];
    request.onsuccess=()=>{
     values[name]=request.result;
     if(--remaining!==0)return;
     try{result=afterReads(tx,values);}
     catch(err){failAbort(tx,err,record);}
    };
    request.onerror=()=>failAbort(tx,request.error||new Error('V2_STAGE_READ_FAILED'),record);
   }
   tx.oncomplete=()=>{if(!settled){settled=true;resolve(result);}};
   tx.onabort=()=>record.reject(record.error||tx.error||new Error('V2_STAGE_ABORTED'));
   tx.onerror=()=>record.reject(record.error||tx.error||new Error('V2_STAGE_TX_ERROR'));
  }catch(error){
   if(tx)try{tx.abort();}catch(_){}
   record.reject(error);
  }
 });
}
function liveReads(tx){
 return {
  state:tx.objectStore('main').get('state'),
  ledger:tx.objectStore('main').get(LEDGER_KEY),
  entranceKeys:tx.objectStore('entrance_media').getAllKeys(),
  stagingCount:tx.objectStore('archive_staging').count(),
  historyCount:tx.objectStore('archive_history').count(),
  backupCount:tx.objectStore('full_backup').count()
 };
}
function assertClean(v,expectedRevision,incoming,d){
 if(v.stagingCount!==0||v.historyCount!==0||v.backupCount!==0)
  fail('V2_STAGE_EXISTING_PROTECTED_RECORDS');
 if(!obj(v.state)||!obj(v.state.meta)||v.state.meta.schemaVersion!==15||
    v.state.meta.revisionId!==expectedRevision)
  fail('V2_STAGE_LIVE_REVISION_CHANGED');
 if(!obj(v.ledger))fail('V2_STAGE_LIVE_LEDGER_MISSING');
 d.guard.validateRecognitionLedgerForV2(v.ledger);
 d.gate.checkRestoreLedgerCandidate(v.ledger,incoming,d.guard);
 d.gate.checkLivePendingMediaIdentity(v.state,v.entranceKeys,incoming);
}
async function stagePendingRestore(db,file,options,d){
 requireDeps(d);requireDb(db);
 if(!obj(options)||!id(options.backupId)||!id(options.expectedRevision)||
    typeof options.createdAt!=='string'||!Number.isFinite(Date.parse(options.createdAt)))
  fail('V2_STAGE_OPTIONS_INVALID');
 if(!file||typeof file.slice!=='function'||!Number.isSafeInteger(file.size)||
    file.size<12||file.size>MAX_BYTES)fail('V2_STAGE_FILE_INVALID');
 // All expensive digest work MUST complete before the single write transaction.
 const incoming=await d.codec.inspectMetadataArchive(file,d.crypto,d.guard,d.sha,d.recordAdapter);
 if(!obj(incoming)||incoming.version!==2||incoming.format!=='paseka-archive'||
    incoming.archiveSafe!==false||incoming.restoreAuthorized!==false||
    incoming.backupId!==options.backupId||
    incoming.state?.meta?.schemaVersion!==15||
    !Array.isArray(incoming.state?.records)||!obj(incoming.ledger)||
    !Array.isArray(incoming.pendingVideos)||incoming.pendingVideos.length<1||
    incoming.pendingVideos.length>MAX_PENDING)
  fail('V2_STAGE_ARCHIVE_INVALID');
 d.guard.validateRecognitionLedgerForV2(incoming.ledger);
 const fileSha256=await d.sha.hashBlobHex(file);
 if(!sha(fileSha256))fail('V2_STAGE_FILE_HASH_INVALID');
 const videos=[],keys=new Set();
 let bytes=0;
 for(const v of incoming.pendingVideos){
  if(!obj(v)||!['entrance_media','record_media'].includes(v.source)||
     typeof v.videoId!=='string'||!v.videoId||v.videoId.length>200||/\s/.test(v.videoId)||
     !sha(v.sourceSha256)||!Number.isSafeInteger(v.sourceBytes)||v.sourceBytes<1||
     !v.blob||typeof v.blob.slice!=='function'||v.blob.size!==v.sourceBytes||
     typeof v.mimeType!=='string'||!/^(?:video\/[a-z0-9.+-]+|application\/octet-stream)$/i.test(v.mimeType))
   fail('V2_STAGE_PENDING_INVALID');
  bytes+=v.sourceBytes;
  if(!Number.isSafeInteger(bytes)||bytes>MAX_BYTES)fail('V2_STAGE_BYTES_LIMIT');
  const key=entryId(options.backupId,v);
  if(keys.has(key))fail('V2_STAGE_DUPLICATE_ID');
  keys.add(key);
  if(await d.sha.hashBlobHex(v.blob)!==v.sourceSha256)
   fail('V2_STAGE_SOURCE_HASH_CHANGED');
  videos.push({id:key,sessionId:sessionId(options.backupId),
   kind:'v2_pending_original',source:v.source,videoId:v.videoId,
   sourceSha256:v.sourceSha256,sourceBytes:v.sourceBytes,
   mimeType:v.mimeType,blob:v.blob});
 }
 const session={
  id:sessionId(options.backupId),sessionId:sessionId(options.backupId),
  backupId:options.backupId,kind:'v2_pending_session',
  status:'protected_unverified',archiveSha256:fileSha256,
  expectedRevision:options.expectedRevision,createdAt:options.createdAt,
  expectedEntries:videos.length,totalBytes:bytes,entryIds:[...keys]
 };
 const history={
  backupId:options.backupId,kind:'v2_pending_stage_only',status:'staged',
  sessionId:session.id,archiveSha256:fileSha256,pendingCount:videos.length
 };
 return runTx(db,'readwrite',liveReads,(tx,v)=>{
  assertClean(v,options.expectedRevision,incoming,d);
  const store=tx.objectStore('archive_staging');
  // The existing staging store has a UNIQUE backupId index. Only the
  // session header contains backupId; children have sessionId but no backupId.
  store.add(session);
  for(const entry of videos)store.add(entry);
  tx.objectStore('archive_history').add(history);
  // Nothing in main, entrance_media or full_backup is changed.
  return {staged:true,sessionId:session.id,backupId:options.backupId,
   pendingCount:videos.length,totalBytes:bytes,archiveSha256:fileSha256,
   originalDataChanged:false,archiveSafe:false,restoreAuthorized:false,
   cleanupAuthorized:false,requiresFullBlobReverification:true};
 });
}
function inspectPendingStaging(db,backupId){
 if(!id(backupId))return Promise.reject(Object.assign(
  new Error('V2_STAGE_BACKUP_ID_INVALID'),{code:'V2_STAGE_BACKUP_ID_INVALID'}));
 const sessionKey=sessionId(backupId);
 return runTx(db,'readonly',tx=>({
  header:tx.objectStore('archive_staging').get(sessionKey),
  keyCount:tx.objectStore('archive_staging').count(),
  sessionKeys:tx.objectStore('archive_staging').index('sessionId').getAllKeys(sessionKey),
  history:tx.objectStore('archive_history').get(backupId),
  historyCount:tx.objectStore('archive_history').count(),
  backupCount:tx.objectStore('full_backup').count()
 }),(_tx,v)=>{
  let status='manual_review_required';
  if(v.keyCount===0&&!v.header&&!v.history&&v.historyCount===0&&v.backupCount===0)
   status='not_staged';
  else if(obj(v.header)&&obj(v.history)&&v.historyCount===1&&v.backupCount===0&&
    v.header.id===sessionKey&&v.header.sessionId===sessionKey&&
    v.header.kind==='v2_pending_session'&&v.header.status==='protected_unverified'&&
    v.header.backupId===backupId&&v.history.backupId===backupId&&
    v.history.kind==='v2_pending_stage_only'&&v.history.status==='staged'&&
    v.history.sessionId===sessionKey&&sha(v.header.archiveSha256)&&
    v.history.archiveSha256===v.header.archiveSha256&&
    Number.isSafeInteger(v.header.expectedEntries)&&v.header.expectedEntries>0&&
    v.header.expectedEntries===v.history.pendingCount&&
    Array.isArray(v.header.entryIds)&&
    v.header.expectedEntries<=MAX_PENDING&&v.header.entryIds.length===v.header.expectedEntries&&
    new Set(v.header.entryIds).size===v.header.expectedEntries&&
    v.keyCount===v.header.expectedEntries+1&&v.sessionKeys.length===v.keyCount&&
    v.header.entryIds.every(key=>typeof key==='string'&&v.sessionKeys.includes(key)&&
     ['entrance_media','record_media'].some(source=>{
      const prefix=sessionKey+':'+source+':';
      return key.startsWith(prefix)&&key.length>prefix.length;
     })))
   status='protected_unverified';
  // Never declare hashes verified solely from metadata/keys.
  return {backupId,status,requiresManualReview:status==='manual_review_required',
   byteIntegrityVerified:false,archiveSafe:false,restoreAuthorized:false,
   cleanupAuthorized:false,originalDataChanged:false};
 });
}
root.PasekaVideoArchiveV2PendingStage=Object.freeze({
 stagePendingRestore,inspectPendingStaging
});
})(typeof window!=='undefined'?window:globalThis);
