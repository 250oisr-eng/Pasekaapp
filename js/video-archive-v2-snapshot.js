(function(root){
'use strict';
// Read-only, transactionally consistent v2 export candidate.
// Never grants archiveSafe; no write, staging, restore or deletion operations.
const LEDGER_KEY='video_recognition_ledger_v1';
function fail(code){const e=new Error(code);e.code=code;throw e;}
function obj(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
function snapshotForV2(db,guard){
 return new Promise((resolve,reject)=>{
  let tx,state,ledger,entrance,complete=false;
  const stop=err=>{if(!complete){complete=true;reject(err);}};
  try{
   if(!db?.objectStoreNames?.contains('main')||!db.objectStoreNames.contains('entrance_media'))
    fail('V2_SNAPSHOT_STORES_MISSING');
   if(typeof guard?.validateRecognitionLedgerForV2!=='function')fail('V2_GUARD_MISSING');
   // All three values must come from the same IndexedDB readonly transaction.
   tx=db.transaction(['main','entrance_media'],'readonly');
   const main=tx.objectStore('main'),media=tx.objectStore('entrance_media');
   const rs=main.get('state'),rl=main.get(LEDGER_KEY),rv=media.getAll();
   rs.onsuccess=()=>{state=rs.result;};
   rl.onsuccess=()=>{ledger=rl.result;};
   rv.onsuccess=()=>{entrance=rv.result;};
   for(const request of [rs,rl,rv])request.onerror=()=>{try{tx.abort();}catch(_){stop(request.error||new Error('snapshot read failed'));}};
   tx.onerror=()=>stop(tx.error||new Error('snapshot read failed'));
   tx.onabort=()=>stop(tx.error||new Error('snapshot transaction aborted'));
   tx.oncomplete=()=>{
    if(complete)return;
    try{
     if(!obj(state)||!obj(state.meta)||!Number.isSafeInteger(state.meta.schemaVersion))
      fail('V2_SNAPSHOT_STATE_INVALID');
     // Missing ledger is not assumed to be empty: absence must not erase
     // recognition history from older or partially migrated databases.
     if(ledger===undefined)fail('V2_SNAPSHOT_LEDGER_MISSING');
     guard.validateRecognitionLedgerForV2(ledger);
     if(!Array.isArray(entrance))fail('V2_SNAPSHOT_MEDIA_INVALID');
     const pendingVideos=entrance.map(row=>{
      if(!obj(row)||typeof row.id!=='string'||!row.id||
         !row.blob||typeof row.blob.slice!=='function'||
         !Number.isSafeInteger(row.blob.size)||row.blob.size<1||
         !Number.isSafeInteger(row.bytes)||row.bytes!==row.blob.size||
         typeof row.blobSha256!=='string'||!/^[a-f0-9]{64}$/.test(row.blobSha256))
       fail('V2_SNAPSHOT_SOURCE_EVIDENCE_MISSING');
      const mimeType=row.mimeType||row.blob.type;
      if(typeof mimeType!=='string'||!/^video\/[a-z0-9.+-]+$/i.test(mimeType)||
         row.blob.type&&mimeType!==row.blob.type)
       fail('V2_SNAPSHOT_VIDEO_MIME_INVALID');
      return {source:'entrance_media',videoId:row.id,sourceSha256:row.blobSha256,
       sourceBytes:row.bytes,mimeType,blob:row.blob};
     });
     guard.checkCandidateVideoPayloads(ledger,pendingVideos.map(({source,videoId,sourceSha256,sourceBytes})=>
      ({source,videoId,sourceSha256,sourceBytes})));
     complete=true;
     resolve({state,ledger,pendingVideos,snapshotConsistent:true,
      archiveSafe:false,restoreAuthorized:false,needsPostHashRecheck:true});
    }catch(err){stop(err);}
   };
  }catch(err){stop(err);}
 });
}
root.PasekaVideoArchiveV2Snapshot=Object.freeze({snapshotForV2});
})(typeof window!=='undefined'?window:globalThis);
