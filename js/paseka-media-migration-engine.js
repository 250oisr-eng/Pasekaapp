(function (root) {
'use strict';
const JOURNAL='media_migration_journal', BLOBS='media_blobs';
const ALLOWED=new Set(['image/jpeg','image/png','image/gif','image/webp','image/avif','image/bmp','image/heic','image/heif']);
const DEFAULT_MAX_IMAGE_BYTES=25*1024*1024;
function fail(code,message){const e=new Error(message||code);e.code=code;throw e}
function hex(bytes){return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}
async function digest(bytes,cryptoProvider){if(!cryptoProvider?.subtle?.digest)fail('MEDIA_CRYPTO_UNAVAILABLE','SHA-256 is unavailable.');return hex(new Uint8Array(await cryptoProvider.subtle.digest('SHA-256',bytes)))}
function request(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('IndexedDB request failed.'))})}
function txDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('IndexedDB transaction failed.'));tx.onabort=()=>reject(tx.error||new Error('IndexedDB transaction aborted.'))})}
function assertDb(db){if(!db?.objectStoreNames?.contains(BLOBS)||!db.objectStoreNames.contains(JOURNAL))fail('MIGRATION_STORE_UNAVAILABLE','The database does not contain the migration stores.')}
function assertMigrationId(id){if(typeof id!=='string'||!id.trim()||id.length>100)fail('INVALID_MIGRATION_ID','Migration ID must contain 1–100 characters.')}
function sourceKey(c){return [c.collection,c.entityId,c.mediaIndex].join(':')}
function locate(state,c){const list=state?.[c.collection];if(!Array.isArray(list))return null;let entity=list.find(x=>x&&x.id===c.entityId);if(!entity&&/^legacy-index-\d+$/.test(c.entityId))entity=list[Number(c.entityId.slice('legacy-index-'.length))]||null;if(!entity||!Array.isArray(entity.media))return null;return entity.media[c.mediaIndex]||null}
function decode(dataUrl,maxBytes){
 if(typeof dataUrl!=='string')fail('INVALID_LEGACY_IMAGE','Legacy image data is missing.');
 const m=/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/]*={0,2})$/i.exec(dataUrl);
 if(!m)fail('INVALID_LEGACY_IMAGE','Legacy image data URL is malformed or unsupported.');
 const mime=m[1].toLowerCase(),payload=m[2];
 if(!ALLOWED.has(mime))fail('UNSUPPORTED_IMAGE_MIME','This image MIME type is not allowed for migration.');
 if(!payload.length||payload.length%4!==0||/=/.test(payload.slice(0,-2)))fail('INVALID_BASE64','Legacy image Base64 is malformed.');
 const padding=payload.endsWith('==')?2:payload.endsWith('=')?1:0,size=payload.length/4*3-padding;
 if(!Number.isSafeInteger(size)||size<1)fail('EMPTY_IMAGE','Legacy image is empty.');
 if(size>maxBytes)fail('IMAGE_SIZE_LIMIT','Legacy image exceeds the migration size limit.');
 let binary;try{if(typeof atob==='function')binary=atob(payload);else fail('BASE64_DECODER_UNAVAILABLE','Base64 decoder is unavailable.')}catch(e){if(e.code)throw e;fail('INVALID_BASE64','Legacy image Base64 could not be decoded.')}
 const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return {bytes,mime,size};
}
async function ids(candidate,cryptoProvider){const key=sourceKey(candidate),hash=await digest(new TextEncoder().encode(key),cryptoProvider);return {blobId:'legacy-image-v1:'+hash,journalId:await digest(new TextEncoder().encode(candidate.id),cryptoProvider)}}
async function copyOne(db,state,candidate,migrationId,cryptoProvider,options={}){
 assertDb(db);assertMigrationId(migrationId);
 if(!candidate||typeof candidate.collection!=='string'||!Number.isInteger(candidate.mediaIndex)||candidate.mediaIndex<0)fail('INVALID_CANDIDATE','A valid migration candidate is required.');
 const max=options.maxImageBytes??DEFAULT_MAX_IMAGE_BYTES;if(!Number.isSafeInteger(max)||max<1)fail('INVALID_LIMIT','Invalid image size limit.');
 const media=locate(state,candidate);if(!media||typeof media.data!=='string')fail('LEGACY_SOURCE_MISSING','The original image could not be found; source data was not changed.');
 const decoded=decode(media.data,max),sha256=await digest(decoded.bytes,cryptoProvider),key=sourceKey(candidate),keyIds=await ids(candidate,cryptoProvider);
 const blob=new Blob([decoded.bytes],{type:decoded.mime});
 const record={id:keyIds.blobId,blob,mimeType:decoded.mime,sizeBytes:decoded.size,name:typeof media.name==='string'?media.name.slice(0,160):'',capturedAt:null,createdAt:new Date().toISOString(),sha256,schemaVersion:1,migrationId,sourceKey:key};
 const journal={id:migrationId+':'+keyIds.journalId,migrationId,candidateId:candidate.id,blobId:keyIds.blobId,sourceKey:key,sha256,status:'completed',completedAt:new Date().toISOString()};
 const tx=db.transaction([BLOBS,JOURNAL],'readwrite'),done=txDone(tx),bs=tx.objectStore(BLOBS),js=tx.objectStore(JOURNAL);done.catch(()=>{});
 try{
  const [existingBlob,existingJournal]=await Promise.all([request(bs.get(record.id)),request(js.get(journal.id))]);
  if(existingJournal&&existingBlob&&existingJournal.migrationId===migrationId&&existingBlob.migrationId===migrationId&&existingJournal.sha256===sha256&&existingBlob.sha256===sha256&&existingBlob.blob&&existingBlob.blob.size===existingBlob.sizeBytes&&existingBlob.blob.type===existingBlob.mimeType&&await digest(await existingBlob.blob.arrayBuffer(),cryptoProvider)===sha256){
   await done;return {status:'already_copied',blobId:record.id,sha256};
  }
  if(existingBlob||existingJournal)fail('MIGRATION_ID_CONFLICT','A destination ID already exists but does not match this migration; nothing was overwritten.');
  bs.add(record);js.add(journal);await done;
  return {status:'copied',blobId:record.id,sha256};
 }catch(e){try{tx.abort()}catch(_){}if(e?.name==='ConstraintError')fail('MIGRATION_ID_CONFLICT','A destination ID was created concurrently; nothing was overwritten.');throw e}
}
async function copyBatch(db,state,plan,migrationId,cryptoProvider,options={}){
 if(!plan||!Array.isArray(plan.candidates))fail('INVALID_MIGRATION_PLAN','A dry-run migration plan is required.');
 const limit=options.limit??plan.candidates.length;if(!Number.isInteger(limit)||limit<0)fail('INVALID_BATCH_LIMIT','Batch limit must be a non-negative integer.');
 const results=[];for(const candidate of plan.candidates.slice(0,limit)){try{results.push({candidateId:candidate.id,...await copyOne(db,state,candidate,migrationId,cryptoProvider,options)})}catch(error){results.push({candidateId:candidate.id,status:'error',code:error.code||'MIGRATION_FAILED',message:error.message});if(options.stopOnError!==false)break}}
 return {migrationId,processed:results.length,copied:results.filter(x=>x.status==='copied').length,alreadyCopied:results.filter(x=>x.status==='already_copied').length,errors:results.filter(x=>x.status==='error'),results};
}
async function getProgress(db,migrationId,cryptoProvider){assertDb(db);assertMigrationId(migrationId);const tx=db.transaction([BLOBS,JOURNAL],'readonly'),done=txDone(tx);const [journals,blobs]=await Promise.all([request(tx.objectStore(JOURNAL).getAll()),request(tx.objectStore(BLOBS).getAll())]);await done;const own=journals.filter(x=>x.migrationId===migrationId),ownedBlobs=blobs.filter(x=>x.migrationId===migrationId);let completed=0;for(const j of own){const b=ownedBlobs.find(x=>x.id===j.blobId);if(j.status==='completed'&&b&&b.sha256===j.sha256&&b.blob&&b.blob.size===b.sizeBytes&&b.blob.type===b.mimeType&&await digest(await b.blob.arrayBuffer(),cryptoProvider)===j.sha256)completed++}return {migrationId,completed,journalEntries:own.length,ownedBlobs:ownedBlobs.length,orphanedJournalEntries:own.length-completed}}
async function rollback(db,migrationId){assertDb(db);assertMigrationId(migrationId);const tx=db.transaction([BLOBS,JOURNAL],'readwrite'),done=txDone(tx),bs=tx.objectStore(BLOBS),js=tx.objectStore(JOURNAL);const [blobs,journals]=await Promise.all([request(bs.getAll()),request(js.getAll())]);let removedBlobs=0,removedJournals=0;for(const b of blobs)if(b.migrationId===migrationId){bs.delete(b.id);removedBlobs++}for(const j of journals)if(j.migrationId===migrationId){js.delete(j.id);removedJournals++}await done;return {migrationId,removedBlobs,removedJournals,sourceChanged:false}}
const api=Object.freeze({JOURNAL,DEFAULT_MAX_IMAGE_BYTES,copyOne,copyBatch,getProgress,rollback});
root.PasekaMediaMigrationEngine=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
