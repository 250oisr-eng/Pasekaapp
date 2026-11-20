(function(root){
'use strict';
// Staging-only. A completed recognition must be persisted before any cleanup is considered.
// Does not delete video, change the existing 'state' entry or approve backup safety.
const KEY='video_recognition_ledger_v1';
const idOk=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!/\s/.test(value);
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function validateResult(result){
 if(!isObject(result))return false;
 const seen=new Set();
 function inspect(value,depth){
  if(depth>12)return false;
  if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return true;
  if(typeof value==='string')return !/^data:(?:video|application\/octet-stream)/i.test(value);
  if(typeof value!=='object'||seen.has(value)||!Array.isArray(value)&&!isObject(value))return false;
  seen.add(value);
  const ok=Array.isArray(value)?value.every(item=>inspect(item,depth+1)):
   Object.entries(value).every(([key,item])=>!['data','blob','file','binary','media','base64','original'].includes(key.toLowerCase())&&inspect(item,depth+1));
  seen.delete(value);return ok;
 }
 if(!inspect(result,0))return false;
 try{return JSON.stringify(result).length<=16384}catch{return false}
}
function verifyRequest(input){
 if(!isObject(input)||!idOk(input.videoId)||!idOk(input.resultId)||
 !['entrance_media','record_media'].includes(input.source)||
 !idOk(input.expectedStateRevisionId)||!idOk(input.recognizedAt)||
 input.recognitionStatus!=='completed'||input.recognitionSucceeded!==true||
 !validateResult(input.result))return false;
 return Number.isFinite(Date.parse(input.recognizedAt))&&
  typeof input.processedSourceSha256==='string'&&/^[a-f0-9]{64}$/.test(input.processedSourceSha256)&&
  Number.isSafeInteger(input.processedSourceBytes)&&input.processedSourceBytes>0;
}

// Read the original before hashing. Blob I/O must run after the IndexedDB
// readonly transaction completes: keeping a transaction open while awaiting
// digest would cause TransactionInactiveError in browsers.
function readOriginalSnapshot(db,input) {
 return new Promise(resolve=>{
  let tx,mainRequest,mediaRequest,state;
  try {
   tx=db.transaction(input.source==='entrance_media'?['main','entrance_media']:['main'],'readonly');
   mainRequest=tx.objectStore('main').get('state');
   if(input.source==='entrance_media')mediaRequest=tx.objectStore('entrance_media').get(input.videoId);
   mainRequest.onsuccess=()=>{state=mainRequest.result};
   tx.oncomplete=()=>resolve({ok:true,state,media:mediaRequest?.result});
   tx.onabort=()=>resolve({ok:false,reason:'source_read_aborted'});
   tx.onerror=()=>{};
  }catch {resolve({ok:false,reason:'source_read_unavailable'})}
 });
}
function findJournalVideo(state,id){
 return (Array.isArray(state?.records)?state.records:[]).flatMap(record=>
  Array.isArray(record?.media)?record.media.filter(item=>item&&item.kind==='video'&&
    (item.id===id||item.videoId===id)):[]
 );
}
async function verifyOriginalBytes(db,input){
 const snapshot=await readOriginalSnapshot(db,input);
 if(!snapshot.ok)return snapshot;
 if(!isObject(snapshot.state?.meta)||
    snapshot.state.meta.revisionId!==input.expectedStateRevisionId)
  return {ok:false,reason:'state_revision_changed'};
 const hashing=root.PasekaSha256;
 if(!hashing||typeof hashing.hashBlobHex!=='function'||
    typeof hashing.hashVideoDataUrlHex!=='function')
  return {ok:false,reason:'source_hash_module_unavailable'};
 try{
  if(input.source==='entrance_media'){
   const record=snapshot.media;
   if(!record||record.id!==input.videoId||!record.blob)
    return {ok:false,reason:'source_video_missing'};
   if(!Number.isSafeInteger(record.bytes)||record.bytes<=0||
      record.blob.size!==record.bytes||
      record.blobSha256!==input.processedSourceSha256||
      record.bytes!==input.processedSourceBytes)
    return {ok:false,reason:'source_hash_metadata_mismatch'};
   const digest=await hashing.hashBlobHex(record.blob);
   if(digest!==input.processedSourceSha256)
    return {ok:false,reason:'source_bytes_hash_mismatch'};
   return {ok:true,sha256:digest,bytes:record.bytes,
     sourceCapturedAt:record.capturedAt||null};
  }
  const found=findJournalVideo(snapshot.state,input.videoId);
  if(found.length!==1||typeof found[0].data!=='string')
   return {ok:false,reason:'journal_video_missing_or_ambiguous'};
  const item=found[0];
  if(item.sourceSha256!==input.processedSourceSha256||
     item.sourceBytes!==input.processedSourceBytes)
   return {ok:false,reason:'source_hash_metadata_mismatch'};
  const digest=await hashing.hashVideoDataUrlHex(item.data);
  if(digest.sha256!==input.processedSourceSha256||digest.bytes!==input.processedSourceBytes)
   return {ok:false,reason:'source_bytes_hash_mismatch'};
  // The value comparison in the commit transaction catches journal media
  // rewritten with the same metadata while digesting. No binary is put into
  // the recognition ledger.
  return {ok:true,sha256:digest.sha256,bytes:digest.bytes,dataUrl:item.data};
 }catch{return {ok:false,reason:'source_hash_verification_failed'}}
}

async function recordRecognitionResult(db,input){
 if(!verifyRequest(input))return {ok:false,reason:'invalid_recognition_evidence'};
 const proof=await verifyOriginalBytes(db,input);
 if(!proof.ok)return proof;
 return commitRecognitionResult(db,input,proof);
}
function commitRecognitionResult(db,input,proof){
 return new Promise(resolve=>{
  let tx,main,mediaRequest,ledgerRequest,stateRequest,finished=false,planned=null;
  const finish=value=>{if(!finished){finished=true;resolve(value)}};
  const fail=reason=>{planned={ok:false,reason};try{tx.abort()}catch{finish(planned)}};
  try{
   tx=db.transaction(input.source==='entrance_media'?['main','entrance_media']:['main'],'readwrite');
   main=tx.objectStore('main');
   stateRequest=main.get('state');
   ledgerRequest=main.get(KEY);
   if(input.source==='entrance_media')mediaRequest=tx.objectStore('entrance_media').get(input.videoId);
   let ready=0,needed=mediaRequest?3:2;
   function check(){
    if(++ready!==needed)return;
    const state=stateRequest.result;
    if(!isObject(state)||!isObject(state.meta)||state.meta.revisionId!==input.expectedStateRevisionId)
     return fail('state_revision_changed');
    let video;
    if(input.source==='entrance_media'){
     video=mediaRequest.result;
     if(!video||video.id!==input.videoId||!video.blob)return fail('source_video_missing');
     if(video.blobSha256!==proof.sha256||video.bytes!==proof.bytes||
        video.blob.size!==proof.bytes||
        (video.capturedAt||null)!==proof.sourceCapturedAt)
      return fail('source_changed_after_hash');
    }else{
     const found=findJournalVideo(state,input.videoId);
     if(found.length!==1||!found[0].data)return fail('journal_video_missing_or_ambiguous');
     if(found[0].sourceSha256!==proof.sha256||
        found[0].sourceBytes!==proof.bytes||
        found[0].data!==proof.dataUrl)
      return fail('source_changed_after_hash');
    }
    const ledger=ledgerRequest.result||{version:1,entries:[]};
    if(!isObject(ledger)||ledger.version!==1||!Array.isArray(ledger.entries)||
       ledger.entries.some(entry=>!isObject(entry)||!idOk(entry.videoId)||!idOk(entry.resultId)||!['entrance_media','record_media'].includes(entry.source)))
     return fail('ledger_corrupt');
    const prior=ledger.entries.find(entry=>entry.videoId===input.videoId&&entry.source===input.source);
    if(prior){
     if(prior.resultId!==input.resultId||JSON.stringify(prior.result)!==JSON.stringify(input.result)||
       prior.sourceSha256!==proof.sha256||prior.sourceBytes!==proof.bytes)
      return fail('conflicting_recognition_result');
     planned={ok:true,idempotent:true,videoId:input.videoId,source:input.source,resultId:prior.resultId,
      resultPersisted:true,cleanupState:prior.cleanupState};
     return;
    }
    const entry={videoId:input.videoId,source:input.source,resultId:input.resultId,recognizedAt:input.recognizedAt,
     stateRevisionId:input.expectedStateRevisionId,result:input.result,
     sourceSha256:proof.sha256,sourceBytes:proof.bytes,
     sourceEvidenceVersion:1,sourceHashVerifiedAt:new Date().toISOString(),
     cleanupState:'blocked_archive_safety'};
    try{main.put({version:1,entries:[...ledger.entries,entry]},KEY);
     planned={ok:true,idempotent:false,videoId:input.videoId,source:input.source,resultId:input.resultId,
      resultPersisted:true,cleanupState:'blocked_archive_safety'};
    }catch{return fail('ledger_write_failed')}
   }
   stateRequest.onsuccess=check;ledgerRequest.onsuccess=check;if(mediaRequest)mediaRequest.onsuccess=check;
   stateRequest.onerror=()=>fail('state_read_failed');
   ledgerRequest.onerror=()=>fail('ledger_read_failed');
   if(mediaRequest)mediaRequest.onerror=()=>fail('media_read_failed');
   tx.oncomplete=()=>finish(planned||{ok:false,reason:'no_commit_plan'});
   tx.onabort=()=>finish(planned&&planned.ok===false?planned:{ok:false,reason:'transaction_aborted'});
   tx.onerror=()=>{}; // transaction abort is the authoritative failure callback
  }catch{finish({ok:false,reason:'transaction_unavailable'})}
 });
}
function readRecognitionLedger(db){
 return new Promise(resolve=>{
  let tx,request,ledger;
  try{
   tx=db.transaction('main','readonly');
   request=tx.objectStore('main').get(KEY);
   request.onsuccess=()=>{ledger=request.result||{version:1,entries:[]}};
   tx.oncomplete=()=>resolve(ledger&&ledger.version===1&&Array.isArray(ledger.entries)?
    {ok:true,entries:ledger.entries}:{ok:false,reason:'ledger_corrupt'});
   tx.onabort=()=>resolve({ok:false,reason:'read_aborted'});
  }catch{resolve({ok:false,reason:'transaction_unavailable'})}
 });
}
root.PasekaVideoRecognitionLedger=Object.freeze({KEY,validateResult,recordRecognitionResult,readRecognitionLedger,verifyOriginalBytes});
})(typeof window!=='undefined'?window:globalThis);
