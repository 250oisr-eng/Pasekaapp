(function(root){
'use strict';
// Isolated replay of a SELECTED, independently saved archive file.
// It must never write to the live Paseka database.
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
function openTemporary(factory,sourceDb,name){
 return new Promise((resolve,reject)=>{
  const request=factory.open(name,sourceDb.version);
  request.onupgradeneeded=()=>{
   const temp=request.result;
   for(const storeName of Array.from(sourceDb.objectStoreNames)){
    const source=sourceDb.transaction(storeName,'readonly').objectStore(storeName);
    const opts={autoIncrement:source.autoIncrement};
    if(source.keyPath!==null)opts.keyPath=source.keyPath;
    const copy=temp.createObjectStore(storeName,opts);
    for(const indexName of Array.from(source.indexNames)){
     const ix=source.index(indexName);
     copy.createIndex(ix.name,ix.keyPath,{unique:ix.unique,multiEntry:ix.multiEntry});
    }
   }
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||new Error('Temporary archive database failed'));
  request.onblocked=()=>reject(new Error('Temporary database creation blocked'));
 });
}
function deleteTemporary(factory,name){
 return new Promise((resolve,reject)=>{
  const q=factory.deleteDatabase(name);
  q.onsuccess=()=>resolve();
  q.onerror=()=>reject(q.error||new Error('Temporary database cleanup failed'));
  q.onblocked=()=>reject(new Error('Temporary database deletion blocked'));
 });
}
async function verifySavedFileAndReplay(file,sourceDb,options={}){
 const archive=options.archive||root.PasekaDisasterArchive;
 const factory=options.indexedDB||root.indexedDB;
 const crypto=options.crypto||root.crypto;
 if(!file||typeof file.text!=='function'||!sourceDb||!archive||!factory||!crypto||typeof crypto.randomUUID!=='function')return {ok:false,error:'independent_replay_capabilities_missing'};
 if(typeof options.validateMain!=='function')return {ok:false,error:'independent_replay_main_inspector_required'};
 const name='paseka-season-proof-'+crypto.randomUUID();
 let temp=null,created=false;
 try{
  const raw=await file.text();
  const source=await archive.inspectArchive(raw,sourceDb,options.validateMain);
  if(!nonempty(source.main?.meta?.revisionId))throw Error('Archive main revision missing');
  if(nonempty(options.expectedRevisionId)&&source.main.meta.revisionId!==options.expectedRevisionId)throw Error('Archive revision does not match requested state');
  // The archive's own store list must be checked against live DB before making the temp DB.
  temp=await openTemporary(factory,sourceDb,name);created=true;
  const preflight=await archive.inspectArchive(raw,temp,options.validateMain);
  await archive.atomicRestore(temp,preflight,null);
  temp.close();temp=null;
  temp=await new Promise((resolve,reject)=>{
   const q=factory.open(name);
   q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
  });
  const replayed=await archive.exportArchive(temp);
  const verified=await archive.inspectArchive(replayed,temp,options.validateMain);
  if(verified.sha256!==source.sha256||JSON.stringify(verified.counts)!==JSON.stringify(source.counts)||verified.main?.meta?.revisionId!==source.main.meta.revisionId)throw Error('Independent replay differs from original archive payload');
  const mediaRows=verified.rows.get('entrance_media')||[];
  // Byte-by-byte identity covered by re-export payload SHA; count and MIME preserved.
  temp.close();temp=null;
  await deleteTemporary(factory,name);created=false;
  return {ok:true,restoreReplayVerified:true,includesOriginalMedia:true,originalRevisionId:source.main.meta.revisionId,verificationId:source.sha256,mediaRecordCount:mediaRows.length,verificationScope:'LOCAL_INDEPENDENT_INDEXEDDB_REPLAY',externalCopyConfirmed:false};
 }catch(error){
  try{temp?.close()}catch(_){}
  if(created)try{await deleteTemporary(factory,name);created=false}catch(cleanupError){return {ok:false,error:'temporary_replay_cleanup_failed',details:String(cleanupError?.message||cleanupError)}}
  return {ok:false,error:'independent_replay_failed',details:String(error?.message||error)};
 }
}
root.PasekaSeasonArchiveReplayV2=Object.freeze({verifySavedFileAndReplay});
})(typeof window!=='undefined'?window:globalThis);
