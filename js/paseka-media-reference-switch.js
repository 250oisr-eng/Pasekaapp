(function (root) {
'use strict';
const MAIN='main', BLOBS='media_blobs', COPY_JOURNAL='media_migration_journal', JOURNAL='media_reference_journal';
const COLLECTIONS=new Set(['records','plantObservations','pesticideIncidents','deadoutReviews']);
function fail(code,message){const error=new Error(message||code);error.code=code;throw error}
function request(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('IndexedDB request failed.'))})}
function done(tx){return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('IndexedDB transaction failed.'));tx.onabort=()=>reject(tx.error||new Error('IndexedDB transaction aborted.'))})}
function sourceKey(c){return [c.collection,c.entityId,c.mediaIndex].join(':')}
function locate(state,c){const list=state?.[c.collection];if(!Array.isArray(list))return null;let entity=list.find(x=>x&&x.id===c.entityId);if(!entity&&/^legacy-index-\\d+$/.test(c.entityId))entity=list[Number(c.entityId.slice(13))]||null;return entity?.media?.[c.mediaIndex]||null}
function clone(value){if(typeof structuredClone==='function')return structuredClone(value);return JSON.parse(JSON.stringify(value))}
function validate(db,candidate,migrationId,verifiedItem,revision,newRevision){
 if(!db?.objectStoreNames?.contains(MAIN)||!db.objectStoreNames.contains(BLOBS)||!db.objectStoreNames.contains(COPY_JOURNAL)||!db.objectStoreNames.contains(JOURNAL))fail('REFERENCE_STORE_UNAVAILABLE','Required media reference stores are unavailable.');
 if(!candidate||!COLLECTIONS.has(candidate.collection)||typeof candidate.entityId!=='string'||!candidate.entityId||!Number.isInteger(candidate.mediaIndex)||candidate.mediaIndex<0||typeof candidate.id!=='string')fail('INVALID_CANDIDATE','A valid photo candidate is required.');
 if(typeof migrationId!=='string'||!migrationId.trim()||migrationId.length>100)fail('INVALID_MIGRATION_ID','Migration ID is invalid.');
 if(!verifiedItem||typeof verifiedItem.blobId!=='string'||typeof verifiedItem.sha256!=='string'||!/^([a-f0-9]{64})$/i.test(verifiedItem.sha256)||!Number.isSafeInteger(verifiedItem.sizeBytes)||verifiedItem.sizeBytes<1||typeof verifiedItem.mimeType!=='string')fail('INVALID_VERIFIED_ITEM','A verified Blob descriptor is required.');
 if(typeof revision!=='string'||!revision||typeof newRevision!=='string'||!newRevision||revision===newRevision)fail('INVALID_REVISION','Distinct current and next revisions are required.');
}
function decodeDataUrl(value){
 const match=typeof value==='string'&&/^data:(image\\/[a-z0-9.+-]+);base64,([a-z0-9+/]*={0,2})$/i.exec(value);
 if(!match)fail('SOURCE_INVALID','The legacy image data URL is invalid.');
 let binary;try{binary=atob(match[2])}catch(e){fail('SOURCE_INVALID','The legacy image data URL cannot be decoded.')}
 const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return {bytes,mimeType:match[1].toLowerCase()};
}
function hex(bytes){return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}
async function sha(blob,cryptoProvider){if(!cryptoProvider?.subtle?.digest)fail('CRYPTO_UNAVAILABLE','SHA-256 is unavailable.');return hex(new Uint8Array(await cryptoProvider.subtle.digest('SHA-256',await blob.arrayBuffer())))}
function blobMatches(blob,descriptor,migrationId,candidate){
 return !!blob&&blob.id===descriptor.blobId&&blob.migrationId===migrationId&&blob.sourceKey===sourceKey(candidate)&&blob.sha256===descriptor.sha256&&blob.sizeBytes===descriptor.sizeBytes&&blob.mimeType===descriptor.mimeType&&blob.blob?.size===descriptor.sizeBytes&&blob.blob?.type===descriptor.mimeType;
}
async function switchOne(db,{candidate,migrationId,verifiedItem,expectedRevision,newRevision},cryptoProvider){
 validate(db,candidate,migrationId,verifiedItem,expectedRevision,newRevision);
 const id=migrationId+':'+candidate.id;
 const readTx=db.transaction([MAIN,BLOBS,COPY_JOURNAL,JOURNAL],'readonly'),readDone=done(readTx);
 const [state,blob,copyRows,existing]=await Promise.all([
  request(readTx.objectStore(MAIN).get('state')),
  request(readTx.objectStore(BLOBS).get(verifiedItem.blobId)),
  request(readTx.objectStore(COPY_JOURNAL).getAll()),
  request(readTx.objectStore(JOURNAL).get(id))
 ]);
 await readDone;
 if(existing?.status==='committed')return {status:'already_switched',journalId:id,revision:state?.meta?.revisionId||null};
 if(!state||state.meta?.revisionId!==expectedRevision)fail('REVISION_CONFLICT','Main state revision changed before switching.');
 const previousMedia=locate(state,candidate);
 if(!previousMedia||typeof previousMedia.data!=='string')fail('SOURCE_MISSING','The original legacy photo is missing.');
 const decoded=decodeDataUrl(previousMedia.data);
 const sourceSha=await sha(new Blob([decoded.bytes],{type:decoded.mimeType}),cryptoProvider);
 if(sourceSha!==verifiedItem.sha256||decoded.mimeType!==verifiedItem.mimeType||decoded.bytes.byteLength!==verifiedItem.sizeBytes)fail('SOURCE_CHANGED','The legacy photo no longer matches the verified copy.');
 if(!blobMatches(blob,verifiedItem,migrationId,candidate))fail('DESTINATION_CORRUPTED','The copied Blob does not match the verified descriptor.');
 const checkpoints=copyRows.filter(x=>x?.migrationId===migrationId&&x?.candidateId===candidate.id&&x?.sourceKey===sourceKey(candidate)&&x?.status==='completed'&&x?.blobId===verifiedItem.blobId&&x?.sha256===verifiedItem.sha256);
 if(checkpoints.length!==1)fail('COPY_CHECKPOINT_INVALID','Exactly one completed copy checkpoint is required.');
 const nextState=clone(state),nextMedia=locate(nextState,candidate);
 Object.assign(nextMedia,{storage:'indexeddb-blob-v1',blobId:verifiedItem.blobId,mimeType:verifiedItem.mimeType,sizeBytes:verifiedItem.sizeBytes,sha256:verifiedItem.sha256});
 // Keep the legacy data URL intact: v1 archives and existing backup paths still need it.
 nextState.meta={...(nextState.meta||{}),revisionId:newRevision,updatedAt:new Date().toISOString()};
 const entry={id,migrationId,candidateId:candidate.id,sourceKey:sourceKey(candidate),collection:candidate.collection,entityId:candidate.entityId,mediaIndex:candidate.mediaIndex,status:'committed',previousMedia:clone(previousMedia),committedMedia:clone(nextMedia),previousRevision:expectedRevision,committedRevision:newRevision,blobId:verifiedItem.blobId,sha256:verifiedItem.sha256,createdAt:new Date().toISOString(),rolledBackAt:null};
 return new Promise((resolve,reject)=>{
  let tx,conflict=null,failure=null,remaining=3,mainNow,blobNow,copyNow;
  try{
   tx=db.transaction([MAIN,BLOBS,COPY_JOURNAL,JOURNAL],'readwrite');
   const main=tx.objectStore(MAIN),blobs=tx.objectStore(BLOBS),copies=tx.objectStore(COPY_JOURNAL),journals=tx.objectStore(JOURNAL);
   const check=()=>{if(--remaining!==0)return;
    try{
     if((mainNow?.meta?.revisionId||null)!==expectedRevision)fail('REVISION_CONFLICT','Main state revision changed during switching.');
     const current=locate(mainNow,candidate);
     if(!current||current.data!==previousMedia.data||current.blobId)fail('SOURCE_CHANGED','The source photo changed during switching.');
     if(!blobMatches(blobNow,verifiedItem,migrationId,candidate))fail('DESTINATION_CORRUPTED','The destination Blob changed during switching.');
     if(!copyNow||copyNow.status!=='completed'||copyNow.blobId!==verifiedItem.blobId||copyNow.sha256!==verifiedItem.sha256)fail('COPY_CHECKPOINT_INVALID','The copy checkpoint changed during switching.');
     main.put(nextState,'state');journals.add(entry);
    }catch(e){failure=e;try{tx.abort()}catch(abortError){reject(failure)}}
   };
   const a=main.get('state');a.onsuccess=()=>{mainNow=a.result;check()};a.onerror=()=>{failure=a.error;try{tx.abort()}catch(e){reject(failure)}};
   const b=blobs.get(verifiedItem.blobId);b.onsuccess=()=>{blobNow=b.result;check()};b.onerror=()=>{failure=b.error;try{tx.abort()}catch(e){reject(failure)}};
   const c=copies.get(migrationId+':'+candidate.id);c.onsuccess=()=>{copyNow=c.result;check()};c.onerror=()=>{failure=c.error;try{tx.abort()}catch(e){reject(failure)}};
   tx.oncomplete=()=>resolve({status:'switched',journalId:id,revision:newRevision,legacyDataRetained:true});
   tx.onabort=()=>reject(failure||tx.error||new Error('Photo reference switch aborted.'));
   tx.onerror=()=>reject(failure||tx.error||new Error('Photo reference switch failed.'));
  }catch(e){reject(e)}
 });
}
async function rollbackOne(db,journalId,newRevision){
 if(!db?.objectStoreNames?.contains(MAIN)||!db.objectStoreNames.contains(JOURNAL))fail('REFERENCE_STORE_UNAVAILABLE','Reference journal stores are unavailable.');
 if(typeof journalId!=='string'||!journalId||typeof newRevision!=='string'||!newRevision)fail('INVALID_ROLLBACK_REQUEST','A journal ID and new revision are required.');
 return new Promise((resolve,reject)=>{
  let tx,failure=null,conflict=null,mainState,entry,remaining=2;
  try{
   tx=db.transaction([MAIN,JOURNAL],'readwrite');const main=tx.objectStore(MAIN),journals=tx.objectStore(JOURNAL);
   const check=()=>{if(--remaining!==0)return;try{
    if(!entry)fail('REFERENCE_JOURNAL_MISSING','Reference switch journal entry was not found.');
    if(entry.status==='rolled_back'){resolve({status:'already_rolled_back',journalId});return}
    if(entry.status!=='committed')fail('REFERENCE_NOT_COMMITTED','Only a committed switch can be rolled back.');
    const current=locate(mainState,entry);
    if(!current||current.storage!=='indexeddb-blob-v1'||current.blobId!==entry.blobId||current.sha256!==entry.sha256||current.data!==entry.previousMedia.data)fail('ROLLBACK_CONFLICT','The photo reference has changed; rollback will not overwrite newer data.');
    const restored=clone(mainState),target=locate(restored,entry);const entity=restored[entry.collection].find(x=>x&&x.id===entry.entityId)||restored[entry.collection][Number(String(entry.entityId).slice(13))];entity.media[entry.mediaIndex]=clone(entry.previousMedia);
    restored.meta={...(restored.meta||{}),revisionId:newRevision,updatedAt:new Date().toISOString()};
    journals.put({...entry,status:'rolled_back',rolledBackAt:new Date().toISOString(),rollbackRevision:newRevision});
    main.put(restored,'state');
   }catch(e){failure=e;try{tx.abort()}catch(abortError){reject(failure)}}};
   const a=main.get('state');a.onsuccess=()=>{mainState=a.result;check()};a.onerror=()=>{failure=a.error;try{tx.abort()}catch(e){reject(failure)}};
   const b=journals.get(journalId);b.onsuccess=()=>{entry=b.result;check()};b.onerror=()=>{failure=b.error;try{tx.abort()}catch(e){reject(failure)}};
   tx.oncomplete=()=>resolve({status:'rolled_back',journalId,legacyDataRetained:true,blobDeleted:false});
   tx.onabort=()=>reject(failure||tx.error||new Error('Photo reference rollback aborted.'));
   tx.onerror=()=>reject(failure||tx.error||new Error('Photo reference rollback failed.'));
  }catch(e){reject(e)}
 });
}
const api=Object.freeze({JOURNAL,switchOne,rollbackOne});
root.PasekaMediaReferenceSwitch=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
