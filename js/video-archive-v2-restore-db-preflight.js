(function(root){
'use strict';
// Read-only preflight against current Paseka IndexedDB. Deliberately blocks
// *any* existing staging/history records until v2's protected-history protocol
// is implemented. This is not a commit ticket and cannot authorize writes.
const STORES=['main','entrance_media','archive_staging','archive_history','full_backup'];
const LEDGER_KEY='video_recognition_ledger_v1';
function fail(code){const error=new Error(code);error.code=code;throw error;}
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function inspectRestoreCandidateAgainstDatabase(db,incoming,guard,gate){
 return new Promise((resolve,reject)=>{
  let tx,done=false,ledger,state,videoKeys,stagingCount,historyCount,backupCount;
  const rejectOnce=error=>{if(!done){done=true;reject(error);}};
  try{
   if(!db?.objectStoreNames||STORES.some(store=>!db.objectStoreNames.contains(store)))
    fail('V2_RESTORE_PROTECTED_STORES_MISSING');
   if(typeof gate?.checkRestoreLedgerCandidate!=='function')
    fail('V2_RESTORE_GATE_MISSING');
   if(!obj(incoming)||!obj(incoming.ledger)||!Array.isArray(incoming.pendingVideos))
    fail('V2_RESTORE_CANDIDATE_INVALID');
   // Identical readonly transaction for ledger, live state, current video
   // identities and protected staging/history presence. No Blob retrieval.
   tx=db.transaction(STORES,'readonly');
   const main=tx.objectStore('main');
   const requests={
    ledger:main.get(LEDGER_KEY),
    state:main.get('state'),
    videos:tx.objectStore('entrance_media').getAllKeys(),
    staging:tx.objectStore('archive_staging').count(),
    history:tx.objectStore('archive_history').count(),
    backups:tx.objectStore('full_backup').count()
   };
   requests.ledger.onsuccess=()=>{ledger=requests.ledger.result;};
   requests.state.onsuccess=()=>{state=requests.state.result;};
   requests.videos.onsuccess=()=>{videoKeys=requests.videos.result;};
   requests.staging.onsuccess=()=>{stagingCount=requests.staging.result;};
   requests.history.onsuccess=()=>{historyCount=requests.history.result;};
   requests.backups.onsuccess=()=>{backupCount=requests.backups.result;};
   for(const request of Object.values(requests))request.onerror=()=>{
    try{tx.abort();}catch(_){rejectOnce(request.error||new Error('v2 preflight failed'));}
   };
   tx.onerror=()=>rejectOnce(tx.error||new Error('v2 preflight failed'));
   tx.onabort=()=>rejectOnce(tx.error||new Error('v2 preflight transaction aborted'));
   tx.oncomplete=()=>{
    if(done)return;
    try{
     if(!obj(state)||!obj(state.meta)||!Number.isSafeInteger(state.meta.schemaVersion))
      fail('V2_RESTORE_LIVE_STATE_INVALID');
     if(!obj(ledger))fail('V2_RESTORE_LIVE_LEDGER_MISSING');
     if(!Array.isArray(videoKeys)||!Number.isSafeInteger(stagingCount)||!Number.isSafeInteger(historyCount)||!Number.isSafeInteger(backupCount))
      fail('V2_RESTORE_PROTECTED_READ_INVALID');
     // Do not silently discard old staged Blob/rollback/history copies.
     // Some staging entries may contain protected recognized originals.
     if(stagingCount>0||historyCount>0||backupCount>0)fail('V2_RESTORE_EXISTING_ARCHIVE_HISTORY');
     const checked=gate.checkRestoreLedgerCandidate(ledger,incoming,guard);
     done=true;
     resolve({
      ...checked,liveSchemaVersion:state.meta.schemaVersion,
      liveEntranceKeyCount:videoKeys.length,
      stagingCount,historyCount,backupCount,preflightPassed:true,
      restoreAuthorized:false,archiveSafe:false,
      requiresAtomicCommitCheck:true
     });
    }catch(error){rejectOnce(error);}
   };
  }catch(error){rejectOnce(error);}
 });
}
root.PasekaVideoArchiveV2RestoreDatabasePreflight=
 Object.freeze({inspectRestoreCandidateAgainstDatabase});
})(typeof window!=='undefined'?window:globalThis);
