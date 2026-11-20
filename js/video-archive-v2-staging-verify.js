(function(root){
'use strict';
// Isolated SHA audit of previously staged PASEKA02 pending originals.
// It never authorizes commit, rollback, cleanup or original deletion.
const STORES=['main','entrance_media','archive_staging','archive_history','full_backup'];
const LEDGER_KEY='video_recognition_ledger_v1';
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function fail(code){const e=new Error(code);e.code=code;throw e;}
function requireDb(db){
 if(!db?.objectStoreNames||STORES.some(s=>!db.objectStoreNames.contains(s)))
  fail('V2_VERIFY_STORES_MISSING');
}
function requireDeps(d){
 if(typeof d?.codec?.inspectMetadataArchive!=='function'||
    typeof d?.guard?.validateRecognitionLedgerForV2!=='function'||
    typeof d?.gate?.checkRestoreLedgerCandidate!=='function'||
    typeof d?.gate?.checkLivePendingMediaIdentity!=='function'||
    typeof d?.sha?.hashBlobHex!=='function'||!d?.crypto?.subtle?.digest)
  fail('V2_VERIFY_DEPENDENCIES_MISSING');
}
const sessionId=id=>'v2pending:'+id;
const entryId=(backupId,v)=>sessionId(backupId)+':'+v.source+':'+encodeURIComponent(v.videoId);
function requests(tx){
 return {
  state:tx.objectStore('main').get('state'),
  ledger:tx.objectStore('main').get(LEDGER_KEY),
  entranceKeys:tx.objectStore('entrance_media').getAllKeys(),
  staged:tx.objectStore('archive_staging').getAll(),
  history:tx.objectStore('archive_history').getAll(),
  backups:tx.objectStore('full_backup').count()
 };
}
function readSnapshot(db){
 return new Promise((resolve,reject)=>{
  let tx,settled=false,values={};
  const failOnce=error=>{if(!settled){settled=true;reject(error);}};
  try{
   requireDb(db);tx=db.transaction(STORES,'readonly');
   const all=requests(tx);
   for(const [key,req] of Object.entries(all)){
    req.onsuccess=()=>{values[key]=req.result;};
    req.onerror=()=>{try{tx.abort();}catch(_){}failOnce(req.error||new Error('V2_VERIFY_READ_FAILED'));};
   }
   tx.oncomplete=()=>{if(!settled){settled=true;resolve(values);}};
   tx.onabort=()=>failOnce(tx.error||new Error('V2_VERIFY_READ_ABORTED'));
   tx.onerror=()=>failOnce(tx.error||new Error('V2_VERIFY_READ_ERROR'));
  }catch(e){if(tx)try{tx.abort();}catch(_){}failOnce(e);}
 });
}
function fingerprint(v){
 let result;
 try{result=JSON.stringify(v);}catch(_){fail('V2_VERIFY_SERIALIZATION_FAILED');}
 if(typeof result!=='string'||result.length>48*1024*1024)
  fail('V2_VERIFY_SERIALIZATION_FAILED');
 return result;
}
function validateSnapshot(snapshot,incoming,options,d,archiveHash){
 const v=snapshot,sessionKey=sessionId(options.backupId);
 if(!obj(v.state)||!obj(v.state.meta)||v.state.meta.schemaVersion!==15||
    v.state.meta.revisionId!==options.expectedRevision)
  fail('V2_VERIFY_LIVE_REVISION_CHANGED');
 if(!obj(v.ledger)||!Array.isArray(v.entranceKeys)||!Array.isArray(v.staged)||
    !Array.isArray(v.history)||v.backups!==0)
  fail('V2_VERIFY_PROTECTED_CONTEXT_INVALID');
 d.guard.validateRecognitionLedgerForV2(v.ledger);
 d.gate.checkRestoreLedgerCandidate(v.ledger,incoming,d.guard);
 d.gate.checkLivePendingMediaIdentity(v.state,v.entranceKeys,incoming);
 if(v.history.length!==1||!obj(v.history[0]))
  fail('V2_VERIFY_HISTORY_CHANGED');
 const history=v.history[0],head=v.staged.find(r=>r?.id===sessionKey);
 if(!obj(head)||head.kind!=='v2_pending_session'||
    head.status!=='protected_unverified'||head.backupId!==options.backupId||
    head.sessionId!==sessionKey||head.expectedRevision!==options.expectedRevision||
    head.archiveSha256!==archiveHash||
    history.backupId!==options.backupId||history.kind!=='v2_pending_stage_only'||
    history.status!=='staged'||history.sessionId!==sessionKey||
    history.archiveSha256!==archiveHash)
  fail('V2_VERIFY_SESSION_CHANGED');
 const pending=incoming.pendingVideos;
 if(!Array.isArray(pending)||pending.length<1||
    head.expectedEntries!==pending.length||history.pendingCount!==pending.length||
    !Array.isArray(head.entryIds)||head.entryIds.length!==pending.length||
    new Set(head.entryIds).size!==pending.length||
    v.staged.length!==pending.length+1)
  fail('V2_VERIFY_STAGED_SET_CHANGED');
 const byId=new Map(v.staged.map(row=>[row?.id,row]));
 if(byId.size!==v.staged.length)
  fail('V2_VERIFY_STAGED_SET_CHANGED');
 let totalBytes=0;
 const media=[];
 for(const video of pending){
  const key=entryId(options.backupId,video),row=byId.get(key);
  if(!head.entryIds.includes(key)||!obj(row)||row.kind!=='v2_pending_original'||
     row.sessionId!==sessionKey||row.backupId!==undefined||
     row.source!==video.source||row.videoId!==video.videoId||
     row.sourceSha256!==video.sourceSha256||!hash(row.sourceSha256)||
     row.sourceBytes!==video.sourceBytes||row.mimeType!==video.mimeType||
     !row.blob||typeof row.blob.slice!=='function'||
     row.blob.size!==video.sourceBytes||row.blob.type!==video.mimeType)
   fail('V2_VERIFY_STAGED_ENTRY_CHANGED');
  totalBytes+=row.sourceBytes;
  media.push(row);
 }
 if(!Number.isSafeInteger(totalBytes)||head.totalBytes!==totalBytes)
  fail('V2_VERIFY_STAGED_SET_CHANGED');
 // This does NOT bind the bytes inside Blob to the writer lock. It only
 // detects metadata, source-state and ledger changes between two snapshots.
 const metadata=media.map(v=>[v.id,v.sessionId,v.kind,v.source,v.videoId,
  v.sourceSha256,v.sourceBytes,v.mimeType,v.blob.size,v.blob.type]);
 const identity={
  state:v.state,ledger:v.ledger,entranceKeys:v.entranceKeys,
  header:head,history,backupCount:v.backups,
  media:metadata
 };
 return {media,fingerprint:fingerprint(identity)};
}
async function verifyStagedPendingAgainstArchive(db,file,options,d){
 requireDeps(d);requireDb(db);
 if(!obj(options)||!validId(options.backupId)||!validId(options.expectedRevision)||
    !file||typeof file.slice!=='function')
  fail('V2_VERIFY_OPTIONS_INVALID');
 const incoming=await d.codec.inspectMetadataArchive(file,d.crypto,d.guard,d.sha,d.recordAdapter);
 if(!obj(incoming)||incoming.format!=='paseka-archive'||incoming.version!==2||
    incoming.archiveSafe!==false||incoming.restoreAuthorized!==false||
    incoming.backupId!==options.backupId||
    incoming.state?.meta?.schemaVersion!==15||
    !Array.isArray(incoming.pendingVideos)||incoming.pendingVideos.length===0)
  fail('V2_VERIFY_ARCHIVE_INVALID');
 const archiveHash=await d.sha.hashBlobHex(file);
 if(!hash(archiveHash))fail('V2_VERIFY_ARCHIVE_HASH_INVALID');
 const first=await readSnapshot(db);
 const staged=validateSnapshot(first,incoming,options,d,archiveHash);
 // SHA each saved original, NOT the archive Blob. This occurs outside
 // IndexedDB transactions and does not grant a future commit token.
 for(const item of staged.media){
  const actual=await d.sha.hashBlobHex(item.blob);
  if(actual!==item.sourceSha256)
   fail('V2_VERIFY_STAGED_HASH_CHANGED');
 }
 // A second writer-serialized inspection catches ordinary app writers that
 // changed the session, live state or ledger while SHA hashing ran.
 // This final transaction ALWAYS aborts, including successful inspection.
 return new Promise((resolve,reject)=>{
  let tx,settled=false,inspected=false,error=null;
  const rejectOnce=e=>{if(!settled){settled=true;reject(e);}};
  try{
   tx=db.transaction(STORES,'readwrite');
   const all=requests(tx),values={};let remaining=Object.keys(all).length;
   for(const [key,req] of Object.entries(all)){
    req.onsuccess=()=>{
     values[key]=req.result;
     if(--remaining!==0)return;
     try{
      const second=validateSnapshot(values,incoming,options,d,archiveHash);
      if(second.fingerprint!==staged.fingerprint)
       fail('V2_VERIFY_SNAPSHOT_CHANGED_DURING_HASH');
      inspected=true;
     }catch(e){error=e;}
     try{tx.abort();}catch(e){rejectOnce(error||e);}
    };
    req.onerror=()=>{
     error=req.error||new Error('V2_VERIFY_LOCK_READ_FAILED');
     try{tx.abort();}catch(e){rejectOnce(error||e);}
    };
   }
   tx.oncomplete=()=>rejectOnce(new Error('V2_VERIFY_LOCK_NOT_ABORTED'));
   tx.onerror=()=>{if(!inspected&&!error)error=tx.error;};
   tx.onabort=()=>{
    if(error)return rejectOnce(error);
    if(!inspected)return rejectOnce(tx.error||new Error('V2_VERIFY_LOCK_ABORTED'));
    if(!settled){settled=true;resolve({
     backupId:options.backupId,archiveSha256:archiveHash,
     stagedVideosRehashed:staged.media.length,
     verifiedAtSnapshot:true,metadataStableUnderAbortedLock:true,
     transactionAborted:true,byteIntegrityLocked:false,
     requiresAtomicCommitCheck:true,archiveSafe:false,
     restoreAuthorized:false,cleanupAuthorized:false
    });}
   };
  }catch(e){if(tx)try{tx.abort();}catch(_){}rejectOnce(e);}
 });
}
root.PasekaVideoArchiveV2StagingVerify=Object.freeze({
 verifyStagedPendingAgainstArchive
});
})(typeof window!=='undefined'?window:globalThis);
