(function(root){
'use strict';
// ISOLATED, non-authorizing experiment: use bytes pinned from the verified
// PASEKA02 Blob, NOT bytes re-read from mutable IndexedDB staging, as a
// prospective write source. It never writes or returns Blob handles.
const STORES=['main','entrance_media','archive_staging','archive_history','full_backup'];
const LEDGER_KEY='video_recognition_ledger_v1';
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(x);
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function fail(code){const error=new Error(code);error.code=code;throw error;}
function requireDeps(d){
 if(typeof d?.verify?.verifyStagedPendingAgainstArchive!=='function'||
    typeof d?.codec?.inspectMetadataArchive!=='function'||
    typeof d?.sha?.hashBlobHex!=='function'||
    typeof d?.guard?.validateRecognitionLedgerForV2!=='function'||
    typeof d?.gate?.checkRestoreLedgerCandidate!=='function'||
    typeof d?.gate?.checkLivePendingMediaIdentity!=='function'||
    !d?.crypto?.subtle?.digest)
  fail('V2_PIN_DEPENDENCIES_MISSING');
}
function requireDb(db){
 if(!db?.objectStoreNames||STORES.some(s=>!db.objectStoreNames.contains(s)))
  fail('V2_PIN_STORES_MISSING');
}
const sessionId=backupId=>'v2pending:'+backupId;
const entryId=(backupId,v)=>sessionId(backupId)+':'+v.source+':'+encodeURIComponent(v.videoId);
function makeReads(tx){
 return {
  state:tx.objectStore('main').get('state'),
  ledger:tx.objectStore('main').get(LEDGER_KEY),
  entranceKeys:tx.objectStore('entrance_media').getAllKeys(),
  staging:tx.objectStore('archive_staging').getAll(),
  history:tx.objectStore('archive_history').getAll(),
  backups:tx.objectStore('full_backup').count()
 };
}
function checkUnderLock(v,incoming,options,archiveHash,d){
 if(!obj(v.state)||v.state.meta?.schemaVersion!==15||
    v.state.meta.revisionId!==options.expectedRevision||
    !obj(v.ledger)||!Array.isArray(v.entranceKeys)||
    !Array.isArray(v.staging)||!Array.isArray(v.history)||v.backups!==0)
  fail('V2_PIN_LIVE_CONTEXT_CHANGED');
 d.guard.validateRecognitionLedgerForV2(v.ledger);
 d.gate.checkRestoreLedgerCandidate(v.ledger,incoming,d.guard);
 d.gate.checkLivePendingMediaIdentity(v.state,v.entranceKeys,incoming);
 const pending=incoming.pendingVideos;
 const headerId=sessionId(options.backupId);
 if(!Array.isArray(pending)||pending.length<1||pending.length>128||
    v.history.length!==1||v.staging.length!==pending.length+1)
  fail('V2_PIN_STAGED_SET_CHANGED');
 const head=v.staging.find(x=>x?.id===headerId),history=v.history[0];
 if(!obj(head)||!obj(history)||head.backupId!==options.backupId||
    head.id!==headerId||head.sessionId!==headerId||
    head.kind!=='v2_pending_session'||head.status!=='protected_unverified'||
    head.expectedRevision!==options.expectedRevision||
    head.archiveSha256!==archiveHash||
    history.backupId!==options.backupId||history.sessionId!==headerId||
    history.archiveSha256!==archiveHash||history.kind!=='v2_pending_stage_only'||
    history.status!=='staged'||history.pendingCount!==pending.length||
    head.expectedEntries!==pending.length||
    !Array.isArray(head.entryIds)||head.entryIds.length!==pending.length||
    new Set(head.entryIds).size!==pending.length)
  fail('V2_PIN_SESSION_CHANGED');
 const byId=new Map(v.staging.map(x=>[x?.id,x]));
 if(byId.size!==v.staging.length)fail('V2_PIN_STAGED_SET_CHANGED');
 let bytes=0;
 for(const video of pending){
  const key=entryId(options.backupId,video),row=byId.get(key);
  if(!head.entryIds.includes(key)||!obj(row)||
     row.kind!=='v2_pending_original'||row.sessionId!==headerId||
     row.backupId!==undefined||row.source!==video.source||
     row.videoId!==video.videoId||row.sourceSha256!==video.sourceSha256||
     row.sourceBytes!==video.sourceBytes||row.mimeType!==video.mimeType||
     !row.blob||typeof row.blob.slice!=='function'||
     row.blob.size!==video.sourceBytes||row.blob.type!==video.mimeType)
   fail('V2_PIN_STAGE_METADATA_CHANGED');
  bytes+=video.sourceBytes;
 }
 if(!Number.isSafeInteger(bytes)||head.totalBytes!==bytes)
  fail('V2_PIN_STAGED_SET_CHANGED');
 // Deliberately do NOT claim byte equality for the currently stored Blob.
 // Any writer can replace the stored Blob preserving all these metadata.
 return {pinnedCount:pending.length,pinnedBytes:bytes};
}
function finalAbortedGate(db,incoming,options,d,archiveHash,pinnedForAbort=null){
 return new Promise((resolve,reject)=>{
  let tx,settled=false,completedReads=false,error=null,result;
  const rejectOnce=e=>{if(!settled){settled=true;reject(e);}};
  const abortWith=e=>{
   if(e)error=e;
   try{tx.abort();}catch(abortError){rejectOnce(error||abortError);}
  };
  try{
   requireDb(db);
   tx=db.transaction(STORES,'readwrite');
   const reads=makeReads(tx),values={};let remaining=Object.keys(reads).length;
   for(const [name,request] of Object.entries(reads)){
    request.onsuccess=()=>{
     values[name]=request.result;
     if(--remaining!==0)return;
     try{
      result=checkUnderLock(values,incoming,options,archiveHash,d);
      if(pinnedForAbort!==null){
       // Test-only: queue real IndexedDB add operations with the exact
       // immutable Blob handles verified before opening this transaction.
       // All writes MUST abort before the transaction completes.
       if(!Array.isArray(pinnedForAbort)||pinnedForAbort.length<1||
          pinnedForAbort.some(v=>v.source!=='entrance_media'||
           !id(v.videoId)||!v.blob||v.blob.size!==v.sourceBytes||
           !hex(v.sourceSha256)))
        fail('V2_PIN_WRITE_ENTRANCE_ONLY');
       let pending=pinnedForAbort.length;
       const destination=tx.objectStore('entrance_media');
       for(const verified of pinnedForAbort){
        // ADD is deliberate: PUT might overwrite an unseen live original.
        // The supplied Blob is NOT the mutable staging row Blob.
        const add=destination.add({
         id:verified.videoId,blob:verified.blob,
         blobSha256:verified.sourceSha256,bytes:verified.sourceBytes,
         mimeType:verified.blob.type
        });
        add.onsuccess=()=>{
         if(--pending===0){
          result.abortedAddRequestCount=pinnedForAbort.length;
          completedReads=true;
          abortWith(null);
         }
        };
        add.onerror=()=>abortWith(add.error||new Error('V2_PIN_ADD_FAILED'));
       }
       return;
      }
      completedReads=true;
     }catch(e){return abortWith(e);}
     abortWith(null);
    };
    request.onerror=()=>abortWith(request.error||new Error('V2_PIN_READ_FAILED'));
   }
   tx.oncomplete=()=>rejectOnce(Object.assign(
    new Error('V2_PIN_NOT_ABORTED'),{code:'V2_PIN_NOT_ABORTED'}));
   tx.onabort=()=>{
    if(error)return rejectOnce(error);
    if(!completedReads)return rejectOnce(tx.error||new Error('V2_PIN_ABORTED'));
    if(!settled){settled=true;resolve(result);}
   };
   tx.onerror=()=>{if(!error)error=tx.error;};
  }catch(e){if(tx)try{tx.abort();}catch(_){}rejectOnce(e);}
 });
}
async function rehearsePinnedSources(db,file,options,d,testOnlyAbortAdds=false){
 requireDeps(d);requireDb(db);
 if(!obj(options)||!id(options.backupId)||!id(options.expectedRevision)||
    !file||typeof file.slice!=='function'||!Number.isSafeInteger(file.size)||
    file.size<12)fail('V2_PIN_OPTIONS_INVALID');
 // First audit stored bytes and state. Its result NEVER grants restore rights.
 const stageAudit=await d.verify.verifyStagedPendingAgainstArchive(db,file,options,d);
 if(!stageAudit||stageAudit.restoreAuthorized!==false||
    stageAudit.cleanupAuthorized!==false||stageAudit.byteIntegrityLocked!==false||
    stageAudit.verifiedAtSnapshot!==true||stageAudit.transactionAborted!==true)
  fail('V2_PIN_AUDIT_CONTRACT_INVALID');
 const incoming=await d.codec.inspectMetadataArchive(file,d.crypto,d.guard,d.sha,d.recordAdapter);
 if(!obj(incoming)||incoming.format!=='paseka-archive'||incoming.version!==2||
    incoming.archiveSafe!==false||incoming.restoreAuthorized!==false||
    incoming.backupId!==options.backupId||
    incoming.state?.meta?.schemaVersion!==15||
    !Array.isArray(incoming.pendingVideos)||incoming.pendingVideos.length<1)
  fail('V2_PIN_ARCHIVE_INVALID');
 const archiveHash=await d.sha.hashBlobHex(file);
 if(!hex(archiveHash)||archiveHash!==stageAudit.archiveSha256)
  fail('V2_PIN_ARCHIVE_HASH_CHANGED');
 // Blob instances and slices are immutable. Hold a new Blob composed ONLY of
 // the SHA-verified archive slices. Never copy from a later staging reread.
 // No large whole-file ArrayBuffer allocation is required.
 const pinned=[];
 for(const video of incoming.pendingVideos){
  if(!obj(video)||!['entrance_media','record_media'].includes(video.source)||
     !hex(video.sourceSha256)||!Number.isSafeInteger(video.sourceBytes)||
     video.sourceBytes<1||!video.blob||typeof video.blob.slice!=='function'||
     video.blob.size!==video.sourceBytes||typeof video.mimeType!=='string')
   fail('V2_PIN_VIDEO_INVALID');
  const frozen=new Blob([video.blob],{type:video.mimeType});
  if(frozen.size!==video.sourceBytes||
     await d.sha.hashBlobHex(frozen)!==video.sourceSha256)
   fail('V2_PIN_SOURCE_HASH_CHANGED');
  pinned.push({source:video.source,videoId:video.videoId,
   sourceSha256:video.sourceSha256,sourceBytes:video.sourceBytes,blob:frozen});
 }
 const locked=await finalAbortedGate(db,incoming,options,d,archiveHash,
  testOnlyAbortAdds?pinned:null);
 if(locked.pinnedCount!==pinned.length)
  fail('V2_PIN_COUNT_CHANGED');
 // No Blob, callback or capability is exposed to callers. The local verified
 // handles are discarded. Future commit must itself hold these same handles
 // until its own atomic write under lock; this rehearsal is NOT that commit.
 return {backupId:options.backupId,archiveSha256:archiveHash,
  pinnedSourceCount:pinned.length,pinnedSourceBytes:locked.pinnedBytes,
  abortedAddRequestCount:testOnlyAbortAdds?locked.abortedAddRequestCount:0,
  pinnedArchiveByteSourceVerified:true,stagedBytesLocked:false,
  finalTransactionAborted:true,requiresAtomicCommitCheck:true,
  restoreAuthorized:false,cleanupAuthorized:false,archiveSafe:false};
}
// Only a narrow, abort-only entrance-media write rehearsal. Never exposes
// verified blobs or lets a transaction commit to the user database.
function rehearsePinnedEntranceAddsAbort(db,file,options,d){
 return rehearsePinnedSources(db,file,options,d,true);
}
root.PasekaVideoArchiveV2PinnedSource=Object.freeze({
 rehearsePinnedSources,rehearsePinnedEntranceAddsAbort
});
})(typeof window!=='undefined'?window:globalThis);
