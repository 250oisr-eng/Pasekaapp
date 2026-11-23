(function(root){
'use strict';
// Isolated, opt-in journal-video adapter for prospective v2 codec.
// No database writes, cleanup authorization or live restore integration.
const MAX_RECORD_BYTES=16*1024*1024;
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&v.length>0&&v.length<=200&&!/\s/.test(v);
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const videoMime=/^(?:video\/[a-z0-9.+-]+|application\/octet-stream)$/i;
function fail(code){const e=new Error(code);e.code=code;throw e;}
// Keep journal classification consistent with the codec/restore gate: a
// masked video MIME field is still a video, never an ordinary photo.
const videoLikeType=value=>typeof value==='string'&&
 (value.toLowerCase()==='video'||/^video\//i.test(value)||
  /^application\/(?:octet-stream|x-matroska|ogg|x-msvideo|vnd\.apple\.mpegurl)$/i.test(value));
function mediaIsVideo(item){return item?.kind==='video'||videoLikeType(item?.type)||videoLikeType(item?.mimeType);}
function assertDeclaredMime(item,actualMime){
 for(const declared of [item?.type,item?.mimeType]){
  // 'video' is a generic label, not a claimed MIME. Explicit video or
  // application MIME declarations must agree with verified payload MIME.
  if(typeof declared==='string'&&/^(?:video\/|application\/)/i.test(declared)&&
     declared.toLowerCase()!==actualMime)
   fail('V2_RECORD_MIME_MISMATCH');
 }
}
function ledgerKeys(ledger,guard){
 if(!guard||typeof guard.validateRecognitionLedgerForV2!=='function')fail('V2_GUARD_MISSING');
 const valid=guard.validateRecognitionLedgerForV2(ledger);
 return valid.identities;
}
function dataUrlParts(data){
 if(typeof data!=='string')fail('V2_RECORD_SOURCE_UNAVAILABLE');
 const match=/^data:(video\/[a-z0-9.+-]+|application\/octet-stream);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(data);
 if(!match||!match[2]||match[2].length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(match[2]))fail('V2_RECORD_DATA_URL_INVALID');
 return {mimeType:match[1].toLowerCase(),encoded:match[2]};
}
function decodeVideo(encoded){
 const size=Math.floor(encoded.length*3/4)-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0);
 if(!Number.isSafeInteger(size)||size<1||size>MAX_RECORD_BYTES)fail('V2_RECORD_VIDEO_SIZE_LIMIT');
 const parts=[];
 for(let p=0;p<encoded.length;p+=65536){
  let decoded;
  try{decoded=atob(encoded.slice(p,p+65536));}catch(_){fail('V2_RECORD_DATA_URL_INVALID');}
  const chunk=new Uint8Array(decoded.length);
  for(let i=0;i<decoded.length;i++)chunk[i]=decoded.charCodeAt(i);
  parts.push(chunk);
 }
 return new Blob(parts);
}
async function preparePendingRecordMedia(state,ledger,guard,shaModule){
 if(!obj(state)||!Array.isArray(state.records)||typeof shaModule?.hashVideoDataUrlHex!=='function'||
    typeof shaModule?.hashBlobHex!=='function')fail('V2_RECORD_ADAPTER_UNAVAILABLE');
 const completed=ledgerKeys(ledger,guard),seen=new Set(),pendingVideos=[];
 const records=[];
 for(const record of state.records){
  if(!obj(record))fail('V2_RECORD_INVALID');
  if(!Array.isArray(record.media)){records.push(record);continue;}
  const media=[];
  for(const item of record.media){
   if(!obj(item))fail('V2_RECORD_MEDIA_INVALID');
   if(!mediaIsVideo(item)){
    if(typeof item.data==='string'&&/^data:(?:video\/|application\/octet-stream)/i.test(item.data))fail('V2_RECORD_UNCLASSIFIED_VIDEO');
    media.push(item);continue;
   }
   if(!id(item.videoId))fail('V2_RECORD_VIDEO_ID_MISSING');
   const key='record_media:'+item.videoId;
   if(seen.has(key))fail('V2_RECORD_DUPLICATE_VIDEO');
   seen.add(key);
   if(item.archivePendingVideoV2!==undefined)fail('V2_RECORD_MARKER_COLLISION');
   if(completed.has(key)){
    if(item.data!=null)fail('V2_RECOGNIZED_ORIGINAL_INCLUDED');
    media.push(item);continue;
   }
   const parsed=dataUrlParts(item.data);
   assertDeclaredMime(item,parsed.mimeType);
   if(!sha(item.sourceSha256)||!Number.isSafeInteger(item.sourceBytes)||item.sourceBytes<1||
      item.sourceBytes>MAX_RECORD_BYTES)fail('V2_RECORD_SOURCE_EVIDENCE_MISSING');
   const proof=await shaModule.hashVideoDataUrlHex(item.data);
   if(proof.sha256!==item.sourceSha256||proof.bytes!==item.sourceBytes)fail('V2_RECORD_SOURCE_HASH_MISMATCH');
   const blob=decodeVideo(parsed.encoded);
   if(blob.size!==proof.bytes||await shaModule.hashBlobHex(blob)!==proof.sha256)fail('V2_RECORD_SOURCE_HASH_MISMATCH');
   pendingVideos.push({source:'record_media',videoId:item.videoId,sourceSha256:proof.sha256,
    sourceBytes:proof.bytes,mimeType:parsed.mimeType,blob});
   media.push({...item,data:null,archivePendingVideoV2:true});
  }
  records.push({...record,media});
 }
 return {state:{...state,records},pendingVideos,archiveSafe:false};
}
function encodeBase64(bytes){
 let encoded='';
 for(let p=0;p<bytes.length;p+=32766){
  const section=bytes.subarray(p,p+32766);
  let text='';
  for(let i=0;i<section.length;i++)text+=String.fromCharCode(section[i]);
  encoded+=btoa(text);
 }
 // chunks must be multiples of 3 to avoid internal base64 padding.
 return encoded;
}
async function rehydratePendingRecordMedia(state,ledger,entries,guard,shaModule){
 if(!obj(state)||!Array.isArray(state.records)||!Array.isArray(entries)||
   typeof shaModule?.hashBlobHex!=='function')fail('V2_RECORD_ADAPTER_UNAVAILABLE');
 const completed=ledgerKeys(ledger,guard),byKey=new Map();
 for(const item of entries){
  const key='record_media:'+item?.videoId;
  if(!obj(item)||item.source!=='record_media'||!id(item.videoId)||byKey.has(key)||
     completed.has(key)||!sha(item.sourceSha256)||!Number.isSafeInteger(item.sourceBytes)||
     item.sourceBytes<1||item.sourceBytes>MAX_RECORD_BYTES||!videoMime.test(item.mimeType||'')||
     !item.blob||typeof item.blob.arrayBuffer!=='function'||item.blob.size!==item.sourceBytes)
   fail('V2_RECORD_ENTRY_INVALID');
  byKey.set(key,item);
 }
 const used=new Set(),records=[];
 for(const record of state.records){
  if(!obj(record))fail('V2_RECORD_INVALID');
  if(!Array.isArray(record.media)){records.push(record);continue;}
  const media=[];
  for(const item of record.media){
   if(!obj(item))fail('V2_RECORD_MEDIA_INVALID');
   if(!mediaIsVideo(item)){
    if(typeof item.data==='string'&&/^data:(?:video\/|application\/octet-stream)/i.test(item.data))fail('V2_RECORD_UNCLASSIFIED_VIDEO');
    media.push(item);continue;
   }
   if(!id(item.videoId))fail('V2_RECORD_VIDEO_ID_MISSING');
   const key='record_media:'+item.videoId;
   if(completed.has(key)){
    if(item.data!=null||item.archivePendingVideoV2!=null)fail('V2_RECOGNIZED_ORIGINAL_INCLUDED');
    media.push(item);continue;
   }
   if(item.archivePendingVideoV2!==true||item.data!==null||used.has(key))fail('V2_RECORD_MARKER_INVALID');
   const video=byKey.get(key);
   if(!video||video.sourceSha256!==item.sourceSha256||video.sourceBytes!==item.sourceBytes)fail('V2_RECORD_ENTRY_MISSING');
   assertDeclaredMime(item,video.mimeType);
   used.add(key);
   if(await shaModule.hashBlobHex(video.blob)!==video.sourceSha256)fail('V2_RECORD_SOURCE_HASH_MISMATCH');
   const bytes=new Uint8Array(await video.blob.arrayBuffer());
   const encoded=encodeBase64(bytes);
   // Preserve only MIME from the recorded entry, after exact byte verification.
   const {archivePendingVideoV2,...original}=item;
   media.push({...original,data:'data:'+video.mimeType+';base64,'+encoded});
  }
  records.push({...record,media});
 }
 if(used.size!==byKey.size)fail('V2_RECORD_UNREFERENCED_ENTRY');
 return {state:{...state,records},archiveSafe:false,restoreAuthorized:false};
}
root.PasekaVideoArchiveV2RecordMedia=Object.freeze({preparePendingRecordMedia,rehydratePendingRecordMedia});
})(typeof window!=='undefined'?window:globalThis);
