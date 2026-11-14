(function (root) {
'use strict';
const BLOBS='media_blobs', JOURNAL='media_migration_journal';
const ALLOWED=new Set(['image/jpeg','image/png','image/gif','image/webp','image/avif','image/bmp','image/heic','image/heif']);
const DEFAULT_MAX_IMAGE_BYTES=25*1024*1024;
function fail(code,message){const e=new Error(message||code);e.code=code;throw e}
function req(r){return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('IndexedDB request failed.'))})}
function done(tx){return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('IndexedDB transaction failed.'));tx.onabort=()=>reject(tx.error||new Error('IndexedDB transaction aborted.'))})}
function key(c){return [c.collection,c.entityId,c.mediaIndex].join(':')}
function locate(state,c){const list=state?.[c.collection];if(!Array.isArray(list))return null;let entity=list.find(x=>x&&x.id===c.entityId);if(!entity&&/^legacy-index-\d+$/.test(c.entityId))entity=list[Number(c.entityId.slice(13))]||null;return entity?.media?.[c.mediaIndex]||null}
async function sha(blob,cryptoProvider){if(!root.PasekaSha256?.hashBlobHex)fail('MEDIA_CRYPTO_UNAVAILABLE','Incremental SHA-256 is unavailable.');return root.PasekaSha256.hashBlobHex(blob)}
async function verify(db,state,plan,migrationId,cryptoProvider,options={}){
 if(!db?.objectStoreNames?.contains(BLOBS)||!db.objectStoreNames.contains(JOURNAL))fail('MIGRATION_STORE_UNAVAILABLE','Migration stores are unavailable.');
 if(!state||!plan||!Array.isArray(plan.candidates)||!Array.isArray(plan.sourceCollections))fail('INVALID_MIGRATION_PLAN','A valid dry-run plan and source state are required.');
 if(typeof migrationId!=='string'||!migrationId.trim()||migrationId.length>100)fail('INVALID_MIGRATION_ID','Migration ID is invalid.');
 const maxImageBytes=options.maxImageBytes??DEFAULT_MAX_IMAGE_BYTES;
 if(!Number.isSafeInteger(maxImageBytes)||maxImageBytes<1)fail('INVALID_LIMIT','Invalid verification image size limit.');
 const tx=db.transaction([BLOBS,JOURNAL],'readonly'),finished=done(tx);
 const [blobs,journals]=await Promise.all([req(tx.objectStore(BLOBS).getAll()),req(tx.objectStore(JOURNAL).getAll())]);await finished;
 const ownedBlobs=new Map(blobs.filter(x=>x.migrationId===migrationId).map(x=>[x.id,x]));
 const ownedJournals=journals.filter(x=>x.migrationId===migrationId);
 // Source changes and destination damage are independent failure classes; never collapse them into one generic mismatch.
 const problems=[],verified=[],usedBlobIds=new Set();let sourceChanged=false,destinationCorrupted=false;
 const seen=new Set();
 for(const c of plan.candidates){
  if(!c||typeof c.id!=='string'||typeof c.collection!=='string'||typeof c.entityId!=='string'||!Number.isInteger(c.mediaIndex)||c.mediaIndex<0){problems.push({candidateId:c?.id||null,code:'INVALID_CANDIDATE'});continue}
  const sourceKey=key(c);
  if(seen.has(sourceKey)){problems.push({candidateId:c.id,code:'DUPLICATE_SOURCE'});continue}seen.add(sourceKey);
  const media=locate(state,c);
  if(!media||typeof media.data!=='string'){problems.push({candidateId:c.id,code:'SOURCE_MISSING'});continue}
  const match=/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/]*={0,2})$/i.exec(media.data);
  if(!match){problems.push({candidateId:c.id,code:'SOURCE_INVALID'});continue}
  const mimeType=match[1].toLowerCase(),payload=match[2];
  if(!ALLOWED.has(mimeType)){problems.push({candidateId:c.id,code:'SOURCE_UNSUPPORTED_MIME'});continue}
  if(!payload.length||payload.length%4!==0||/=/.test(payload.slice(0,-2))){problems.push({candidateId:c.id,code:'SOURCE_INVALID_BASE64'});continue}
  const padding=payload.endsWith('==')?2:payload.endsWith('=')?1:0,sizeBytes=payload.length/4*3-padding;
  if(!Number.isSafeInteger(sizeBytes)||sizeBytes<1){problems.push({candidateId:c.id,code:'SOURCE_INVALID_BASE64'});continue}
  if(sizeBytes>maxImageBytes){problems.push({candidateId:c.id,code:'SOURCE_SIZE_LIMIT',sizeBytes,maxImageBytes});continue}
  let bytes;try{const raw=atob(payload);bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i)}catch(_){problems.push({candidateId:c.id,code:'SOURCE_INVALID_BASE64'});continue}
  const expected=await sha(new Blob([bytes],{type:mimeType}),cryptoProvider);
  const matches=ownedJournals.filter(x=>x.candidateId===c.id&&x.sourceKey===sourceKey);
  if(matches.length>1){problems.push({candidateId:c.id,code:'DUPLICATE_JOURNAL_ENTRIES'});continue}
  const journal=matches[0];
  const blob=journal&&ownedBlobs.get(journal.blobId);
  if(!journal||journal.status!=='completed'||!blob){problems.push({candidateId:c.id,code:'COPY_MISSING'});continue}
  if(journal.sha256!==expected){sourceChanged=true;problems.push({candidateId:c.id,code:'SOURCE_CHECKSUM_MISMATCH'});continue}
  if(blob.sha256!==expected||blob.sourceKey!==sourceKey||blob.blob?.size!==bytes.length||blob.blob?.type!==mimeType){destinationCorrupted=true;problems.push({candidateId:c.id,code:'METADATA_MISMATCH'});continue}
  if(await sha(blob.blob,cryptoProvider)!==expected){destinationCorrupted=true;problems.push({candidateId:c.id,code:'BLOB_CHECKSUM_MISMATCH'});continue}
  usedBlobIds.add(blob.id);
  verified.push({candidateId:c.id,blobId:blob.id,sha256:expected,sizeBytes:bytes.length,mimeType});
 }
 const unexpected=ownedJournals.filter(j=>!plan.candidates.some(c=>c.id===j.candidateId));
 if(unexpected.length)problems.push({code:'UNEXPECTED_JOURNAL_ENTRIES',count:unexpected.length});
 const orphanedBlobs=[...ownedBlobs.keys()].filter(id=>!usedBlobIds.has(id));
 if(orphanedBlobs.length)problems.push({code:'UNEXPECTED_BLOB_ENTRIES',count:orphanedBlobs.length});
 return Object.freeze({mode:'preflight-verification',readOnly:true,ready:problems.length===0&&verified.length===plan.candidates.length,expected:plan.candidates.length,verified:verified.length,problems,verifiedItems:verified,sourceChanged,destinationCorrupted,linksChanged:false,legacyDataDeleted:false});
}
const api=Object.freeze({verify});
root.PasekaMediaMigrationVerifier=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
