(function(root){
'use strict';
// Experimental writer-serialized PRE-COMMIT gate. Opens one readwrite
// transaction across every protected store, performs only reads, and
// intentionally ABORTS before releasing the lock. Never commits archive data.
// No async hashing, Blob I/O or network callbacks inside the transaction.
const STORES=['main','entrance_media','archive_staging','archive_history'];
const LEDGER_KEY='video_recognition_ledger_v1';
function fail(code){const e=new Error(code);e.code=code;throw e;}
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function checkRestoreUnderAbortedWriteLock(db,incoming,guard,gate){
 return new Promise((resolve,reject)=>{
  let tx,settled=false,validated=false,validationError=null,output=null;
  let liveState,ledger,videoKeys,stagingCount,historyCount;
  const rejectOnce=error=>{if(!settled){settled=true;reject(error);}};
  try{
   if(!db?.objectStoreNames||STORES.some(store=>!db.objectStoreNames.contains(store)))
    fail('V2_COMMIT_PROTECTED_STORES_MISSING');
   if(typeof gate?.checkRestoreLedgerCandidate!=='function')
    fail('V2_COMMIT_GATE_MISSING');
   if(!obj(incoming)||!obj(incoming.ledger)||!Array.isArray(incoming.pendingVideos))
    fail('V2_COMMIT_CANDIDATE_INVALID');
   tx=db.transaction(STORES,'readwrite');
   const main=tx.objectStore('main');
   const requests={
    state:main.get('state'),
    ledger:main.get(LEDGER_KEY),
    videos:tx.objectStore('entrance_media').getAllKeys(),
    staging:tx.objectStore('archive_staging').count(),
    history:tx.objectStore('archive_history').count()
   };
   const values={};
   // Execute the entire gate synchronously in the final onsuccess callback:
   // IndexedDB retains the write lock until abort. Never return a commit token.
   for(const [name,request] of Object.entries(requests)){
    request.onsuccess=()=>{
     if(settled||validated)return;
     values[name]=request.result;
     if(Object.keys(values).length!==5)return;
     validated=true;
     try{
      liveState=values.state;ledger=values.ledger;videoKeys=values.videos;
      stagingCount=values.staging;historyCount=values.history;
      if(!obj(liveState)||!obj(liveState.meta)||!Number.isSafeInteger(liveState.meta.schemaVersion))
       fail('V2_COMMIT_LIVE_STATE_INVALID');
      if(!obj(ledger))fail('V2_COMMIT_LIVE_LEDGER_MISSING');
      if(!Array.isArray(videoKeys)||!Number.isSafeInteger(stagingCount)||!Number.isSafeInteger(historyCount))
       fail('V2_COMMIT_PROTECTED_READ_INVALID');
      if(stagingCount||historyCount)fail('V2_COMMIT_EXISTING_ARCHIVE_HISTORY');
      const checked=gate.checkRestoreLedgerCandidate(ledger,incoming,guard);
      output={...checked,liveSchemaVersion:liveState.meta.schemaVersion,
       liveEntranceKeyCount:videoKeys.length,
       stagingCount,historyCount,lockValidated:true,transactionAborted:true,
       preflightPassed:true,restoreAuthorized:false,archiveSafe:false,
       requiresAtomicCommitCheck:true};
     }catch(error){validationError=error;}
     // Explicit abort even when validation succeeds. It releases the lock
     // only after the decision was made; no user data is mutated.
     try{tx.abort();}catch(error){rejectOnce(validationError||error);}
    };
    request.onerror=()=>{
     try{tx.abort();}catch(error){rejectOnce(request.error||error);}
    };
   }
   tx.onerror=()=>{if(!validated&&!settled)rejectOnce(tx.error||new Error('v2 write lock failed'));};
   tx.onabort=()=>{
    if(settled)return;
    if(validationError)return rejectOnce(validationError);
    if(!validated||!output)return rejectOnce(tx.error||new Error('v2 write lock was aborted'));
    settled=true;resolve(output);
   };
   tx.oncomplete=()=>rejectOnce(new Error('V2_COMMIT_LOCK_NOT_ABORTED'));
  }catch(error){
   if(tx){try{tx.abort();}catch(_){}}
   rejectOnce(error);
  }
 });
}
root.PasekaVideoArchiveV2CommitLockGuard=Object.freeze({checkRestoreUnderAbortedWriteLock});
})(typeof window!=='undefined'?window:globalThis);
