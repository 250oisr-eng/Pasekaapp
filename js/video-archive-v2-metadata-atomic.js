(function(root){
'use strict';
// ISOLATED proof-of-atomicity for METADATA-ONLY PASEKA02 import and rollback.
// No runtime integration. Every original video (new or existing), staging,
// historical import, prior full_backup or unknown schema blocks this path.
// This is NOT a video-restoration, cleanup, migration or production API.
const STORES=['main','entrance_media','archive_staging','archive_history','full_backup'];
const LEDGER_KEY='video_recognition_ledger_v1';
const MAX_JSON=16*1024*1024;
function fail(code){const e=new Error(code);e.code=code;throw e;}
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(x);
function stableJson(v) {
 let out;
 try{out=JSON.stringify(v);}catch(_){fail('V2_ATOMIC_JSON_UNSAFE');}
 if(typeof out!=='string'||out.length>MAX_JSON)fail('V2_ATOMIC_JSON_UNSAFE');
 return out;
}
function noOriginals(value,depth=0,seen=new Set()){
 if(depth>48)fail('V2_ATOMIC_UNVERIFIED_ORIGINAL');
 if(typeof value==='string'){
  if(/(?:^data:(?:video\/|application\/octet-stream)|^blob:)/i.test(value))
   fail('V2_ATOMIC_UNVERIFIED_ORIGINAL');
  return;
 }
 if(value==null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return;
 if(typeof value!=='object'||seen.has(value)||!(Array.isArray(value)||Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null))
  fail('V2_ATOMIC_UNVERIFIED_ORIGINAL');
 seen.add(value);
 if(!Array.isArray(value) && (value.kind==='video'||value.type==='video'||typeof value.type==='string'&&value.type.startsWith('video/'))&&value.data!=null)
  fail('V2_ATOMIC_UNVERIFIED_ORIGINAL');
 for(const v of (Array.isArray(value)?value:Object.values(value)))noOriginals(v,depth+1,seen);
 seen.delete(value);
}
function validateState(state,validator){
 if(!obj(state)||!obj(state.meta)||state.meta.schemaVersion!==15||!validId(state.meta.revisionId))
  fail('V2_ATOMIC_SCHEMA_UNSUPPORTED');
 if(!Array.isArray(state.records))fail('V2_ATOMIC_STATE_INVALID');
 noOriginals(state);stableJson(state);
 if(typeof validator!=='function')fail('V2_ATOMIC_VALIDATOR_REQUIRED');
 const valid=validator(state);
 if(valid===false||valid==null||typeof valid?.then==='function')fail('V2_ATOMIC_STATE_INVALID');
}
function requireDb(db){
 if(!db?.objectStoreNames||STORES.some(name=>!db.objectStoreNames.contains(name)))
  fail('V2_ATOMIC_STORES_MISSING');
}
function assertDeps(d){
 if(typeof d?.codec?.inspectMetadataArchive!=='function'||
    typeof d?.guard?.validateRecognitionLedgerForV2!=='function'||
    typeof d?.gate?.checkRestoreLedgerCandidate!=='function'||
    typeof d?.sha?.hashBlobHex!=='function'||!d?.crypto?.subtle?.digest)
  fail('V2_ATOMIC_DEPENDENCIES_MISSING');
}
function abortTx(tx,err,record){
 record.error=err;
 try{tx.abort();}catch(_){record.reject(err);}
}
function runLocked(db,reads,process) {
 return new Promise((resolve,reject)=>{
  let tx,settled=false,result,record={error:null,reject(error){if(!settled){settled=true;reject(error);}}};
  try{
   requireDb(db);
   tx=db.transaction(STORES,'readwrite');
   const pending={},values={};
   for(const [name,read] of Object.entries(reads)){
    const req=read(tx);
    pending[name]=true;
    req.onsuccess=()=>{
     values[name]=req.result;delete pending[name];
     if(Object.keys(pending).length)return;
     try{result=process(tx,values);}
     catch(err){abortTx(tx,err,record);}
    };
    req.onerror=()=>abortTx(tx,req.error||new Error('V2_ATOMIC_READ_FAILED'),record);
   }
   tx.oncomplete=()=>{if(!settled){settled=true;resolve(result);}};
   tx.onabort=()=>record.reject(record.error||tx.error||new Error('V2_ATOMIC_TRANSACTION_ABORTED'));
   tx.onerror=()=>record.reject(record.error||tx.error||new Error('V2_ATOMIC_TRANSACTION_FAILED'));
  }catch(err){if(tx)try{tx.abort();}catch(_){}record.reject(err);}
 });
}
function baseReads(){
 return {
  state:tx=>tx.objectStore('main').get('state'),
  ledger:tx=>tx.objectStore('main').get(LEDGER_KEY),
  videoKeys:tx=>tx.objectStore('entrance_media').getAllKeys(),
  staged:tx=>tx.objectStore('archive_staging').count(),
  historyCount:tx=>tx.objectStore('archive_history').count(),
  backupCount:tx=>tx.objectStore('full_backup').count()
 };
}
function protectedEmpty(v){
 if(!Array.isArray(v.videoKeys)||v.videoKeys.length!==0||
   v.staged!==0||v.historyCount!==0||v.backupCount!==0)
  fail('V2_ATOMIC_PROTECTED_DATA_PRESENT');
}
async function commitMetadataOnly(db,file,options,deps){
 assertDeps(deps);requireDb(db);
 if(!options||!validId(options.expectedRevision)||!validId(options.newRevisionId)||
   options.expectedRevision===options.newRevisionId||!validId(options.backupId)||
   typeof options.validateState!=='function')
  fail('V2_ATOMIC_OPTIONS_INVALID');
 const incoming=await deps.codec.inspectMetadataArchive(file,deps.crypto,deps.guard,deps.sha,deps.recordAdapter);
 if(incoming.format!=='paseka-archive'||incoming.version!==2||
   incoming.archiveSafe!==false||incoming.restoreAuthorized!==false||
   incoming.backupId!==options.backupId||!Array.isArray(incoming.pendingVideos))
  fail('V2_ATOMIC_ARCHIVE_INVALID');
 if(incoming.pendingVideos.length!==0)fail('V2_ATOMIC_VIDEO_PAYLOAD_FORBIDDEN');
 // Decode, hash and validate entirely before opening the write transaction.
 validateState(incoming.state,options.validateState);
 deps.guard.validateRecognitionLedgerForV2(incoming.ledger);
 const fileHash=await deps.sha.hashBlobHex(file);
 if(!/^[a-f0-9]{64}$/.test(fileHash))fail('V2_ATOMIC_HASH_INVALID');
 return runLocked(db,baseReads(),(tx,values)=>{
  protectedEmpty(values);
  validateState(values.state,options.validateState);
  if(values.state.meta.revisionId!==options.expectedRevision)
   fail('V2_ATOMIC_REVISION_CHANGED');
  deps.guard.validateRecognitionLedgerForV2(values.ledger);
  deps.gate.checkRestoreLedgerCandidate(values.ledger,incoming,deps.guard);
  if(stableJson(values.ledger)!==stableJson(incoming.ledger))
   fail('V2_ATOMIC_LEDGER_REWRITE_FORBIDDEN');
  const imported={...incoming.state,meta:{...incoming.state.meta,revisionId:options.newRevisionId}};
  validateState(imported,options.validateState);
  const snapshot={
   kind:'v2_metadata_only_rollback',backupId:options.backupId,
   beforeState:values.state,beforeLedger:values.ledger,
   afterState:imported,archiveSha256:fileHash
  };
  const history={
   backupId:options.backupId,kind:'v2_metadata_only',status:'committed',
   importedRevisionId:options.newRevisionId,previousRevisionId:options.expectedRevision,
   archiveSha256:fileHash,rollbackKey:'v2:'+options.backupId
  };
  const main=tx.objectStore('main');
  tx.objectStore('full_backup').put(snapshot,history.rollbackKey);
  tx.objectStore('archive_history').put(history);
  main.put(imported,'state');
  // Existing ledger stays untouched; no originals, no media.clear(), no deletion.
  return {committed:true,importedRevisionId:options.newRevisionId,backupId:options.backupId,
   pendingVideoCount:0,rollbackRecorded:true,archiveSafe:false,cleanupAuthorized:false};
 });
}
function rollbackMetadataOnly(db,options,deps){
 assertDeps(deps);requireDb(db);
 if(!options||!validId(options.backupId)||!validId(options.expectedRevision)||
   !validId(options.rollbackRevisionId)||options.expectedRevision===options.rollbackRevisionId||
   typeof options.validateState!=='function')fail('V2_ATOMIC_OPTIONS_INVALID');
 const reads={...baseReads(),
  history:tx=>tx.objectStore('archive_history').get(options.backupId),
  snapshot:tx=>tx.objectStore('full_backup').get('v2:'+options.backupId)};
 return runLocked(db,reads,(tx,v)=>{
  if(!Array.isArray(v.videoKeys)||v.videoKeys.length!==0||v.staged!==0||
     v.historyCount!==1||v.backupCount!==1)
   fail('V2_ATOMIC_ROLLBACK_PROTECTED_CHANGED');
  const h=v.history,s=v.snapshot;
  if(!obj(h)||h.kind!=='v2_metadata_only'||h.status!=='committed'||
    h.importedRevisionId!==options.expectedRevision||
    h.rollbackKey!=='v2:'+options.backupId||
    !obj(s)||s.kind!=='v2_metadata_only_rollback'||s.backupId!==h.backupId||
    h.archiveSha256!==s.archiveSha256)
   fail('V2_ATOMIC_ROLLBACK_HISTORY_CHANGED');
  validateState(v.state,options.validateState);
  validateState(s.beforeState,options.validateState);
  validateState(s.afterState,options.validateState);
  if(v.state.meta.revisionId!==options.expectedRevision||
     stableJson(v.state)!==stableJson(s.afterState))
   fail('V2_ATOMIC_ROLLBACK_REVISION_CHANGED');
  deps.guard.validateRecognitionLedgerForV2(v.ledger);
  if(stableJson(v.ledger)!==stableJson(s.beforeLedger))
   fail('V2_ATOMIC_ROLLBACK_LEDGER_CHANGED');
  const restored={...s.beforeState,meta:{...s.beforeState.meta,revisionId:options.rollbackRevisionId}};
  validateState(restored,options.validateState);
  tx.objectStore('main').put(restored,'state');
  tx.objectStore('archive_history').put({...h,status:'reverted',revertedRevisionId:options.rollbackRevisionId});
  // Keep snapshot and recognition ledger for audit; no deletion.
  return {reverted:true,restoredRevisionId:options.rollbackRevisionId,
   backupId:options.backupId,originalSnapshotPreserved:true,
   archiveSafe:false,cleanupAuthorized:false};
 });
}
root.PasekaVideoArchiveV2MetadataAtomic=Object.freeze({
 commitMetadataOnly,rollbackMetadataOnly
});
})(typeof window!=='undefined'?window:globalThis);
