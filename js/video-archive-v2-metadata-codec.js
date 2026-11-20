(function(root) {
'use strict';
// Standalone v2 prototype: state + verified recognition ledger, with opt-in
// pending entrance-media and verified journal-media Blob transport (opt-in adapter).
// Never use this module as deletion authorization or live restore implementation.
const MAGIC = 'PASEKA02';
const FORMAT = 'paseka-archive';
const VERSION = 2;
const HEADER = 12;
const MAX_MANIFEST = 64 * 1024;
const MAX_STATE = 16 * 1024 * 1024;
const MAX_LEDGER = 4 * 1024 * 1024;
const MAX_VIDEO = 250 * 1024 * 1024;
const MAX_ARCHIVE = 512 * 1024 * 1024;
const MAX_PENDING = 128;
const MAX_ENTRIES = MAX_PENDING + 2;
const obj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
function fail(code) { const e = new Error(code); e.code = code; throw e; }
function allowed(value, keys) { return obj(value) && Object.keys(value).every(key => keys.includes(key)); }
function textBytes(value) { return new TextEncoder().encode(JSON.stringify(value)); }
function hex(buffer) { return Array.from(new Uint8Array(buffer), b=>b.toString(16).padStart(2,'0')).join(''); }
async function hash(bytes, cryptoProvider) {
 if (!cryptoProvider?.subtle?.digest) fail('V2_CRYPTO_UNAVAILABLE');
 return hex(await cryptoProvider.subtle.digest('SHA-256', bytes));
}
function assertNoVideoData(value, depth=0, seen=new Set()) {
 if (depth>48) fail('V2_STATE_DEPTH_LIMIT');
 if (typeof value==='string') {
  if (/^data:(?:video\/[a-z0-9.+-]+|application\/octet-stream)(?:;[^,]*)?,/i.test(value)) fail('V2_STATE_EMBEDDED_VIDEO');
  return;
 }
 if (value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)) return;
 if (typeof value!=='object'||seen.has(value)||!(Array.isArray(value)||obj(value))) fail('V2_STATE_INVALID');
 if (!Array.isArray(value) && Object.getPrototypeOf(value)!==Object.prototype && Object.getPrototypeOf(value)!==null) fail('V2_STATE_INVALID');
 seen.add(value);
 for (const item of Array.isArray(value)?value:Object.values(value)) assertNoVideoData(item,depth+1,seen);
 seen.delete(value);
}
function stateAndLedger(state, ledger, guard, pendingVideos = []) {
 if (!obj(state)||!obj(state.meta)||!Number.isSafeInteger(state.meta.schemaVersion)||state.meta.schemaVersion<1) fail('V2_STATE_INVALID');
 if (!guard||typeof guard.checkCandidateVideoPayloads!=='function') fail('V2_GUARD_MISSING');
 // Candidate entrance videos must be absent from the recognition ledger.
 guard.checkCandidateVideoPayloads(ledger,pendingVideos);
 assertNoVideoData(state);
 // Embedded journal media must be explicitly classified. A video payload
 // without a recognized data:video prefix is still a binary until proven otherwise.
 if (Array.isArray(state.records)) for (const record of state.records) {
  if (Array.isArray(record?.media)) for (const media of record.media) {
   const type = String(media?.type || media?.mimeType || '');
   if ((media?.kind==='video'||type==='video'||type.startsWith('video/')) && media?.data != null)
    fail('V2_STATE_EMBEDDED_VIDEO');
  }
 }
}
function checkManifest(manifest, actualSize, manifestLength) {
 if (!allowed(manifest,['format','version','backupId','createdAt','schemaVersion','entries'])||
     manifest.format!==FORMAT||manifest.version!==VERSION||
     typeof manifest.backupId!=='string'||!manifest.backupId.trim()||manifest.backupId.length>128||
     typeof manifest.createdAt!=='string'||!Number.isFinite(Date.parse(manifest.createdAt))||
     !Number.isSafeInteger(manifest.schemaVersion)||manifest.schemaVersion<1||
     !Array.isArray(manifest.entries)||manifest.entries.length<2||manifest.entries.length>MAX_ENTRIES) fail('V2_MANIFEST_INVALID');
 const configs=[['state','state.json',MAX_STATE],['recognition_ledger','recognition-ledger.json',MAX_LEDGER]];
 let offset=HEADER+manifestLength;
 const entries=manifest.entries.map((item,i)=>{
  if (i >= 2) {
   const n=i-1;
   const isEntrance=item.kind==='entrance_video'&&item.source==='entrance_media';
   const isRecord=item.kind==='record_video'&&item.source==='record_media';
   const expectedPath=(isEntrance?'pending-entrance/':'pending-record/')+String(n).padStart(6,'0')+'.blob';
   if (!allowed(item,['kind','path','size','sha256','mimeType','source','videoId','sourceSha256','sourceBytes']) ||
       !(isEntrance||isRecord) || item.path!==expectedPath ||
       typeof item.videoId!=='string' || item.videoId.length<1 ||
       item.videoId.length>200 || /\s/.test(item.videoId) ||
       item.sourceBytes!==item.size || !Number.isSafeInteger(item.size)||item.size<1||item.size>(isRecord?16*1024*1024:MAX_VIDEO) ||
       typeof item.mimeType!=='string'||!(/^(?:video\/[a-z0-9.+-]+|application\/octet-stream)$/i).test(item.mimeType) ||
       !/^[a-f0-9]{64}$/.test(item.sourceSha256||'') || item.sha256!==item.sourceSha256)
    fail('V2_VIDEO_ENTRY_INVALID');
  } else {
   const [kind,path,maxSize]=configs[i];
   if (!allowed(item,['kind','path','size','sha256','mimeType'])||
       item.kind!==kind||item.path!==path||item.mimeType!=='application/json'||
       !Number.isSafeInteger(item.size)||item.size<2||item.size>maxSize||
       typeof item.sha256!=='string'||!/^[0-9a-f]{64}$/.test(item.sha256)) fail('V2_ENTRY_INVALID');
  }
  const result={...item,offset,end:offset+item.size};
  offset=result.end;
  return result;
 });
 if (offset!==actualSize||offset>MAX_ARCHIVE) fail('V2_ARCHIVE_LENGTH_MISMATCH');
 return entries;
}
function decodeJson(bytes, code) {
 try {return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 catch (_) {fail(code);}
}
async function buildMetadataArchive({state,ledger,backupId,createdAt,pendingVideos=[]},cryptoProvider,guard,shaModule,recordAdapter) {
 if (!Array.isArray(pendingVideos)||pendingVideos.length>MAX_PENDING) fail('V2_VIDEO_COUNT_LIMIT');
 // Caller-supplied journal Blob cannot bypass source Data URL evidence checks.
 // Only the dedicated adapter may create record_media entries.
 if (pendingVideos.some(video=>video?.source!=='entrance_media')) fail('V2_VIDEO_UNSUPPORTED');
 let archiveState=state;
 if (recordAdapter) {
  if (typeof recordAdapter.preparePendingRecordMedia!=='function') fail('V2_RECORD_ADAPTER_UNAVAILABLE');
  const prepared=await recordAdapter.preparePendingRecordMedia(state,ledger,guard,shaModule);
  archiveState=prepared.state;
  pendingVideos=[...pendingVideos,...prepared.pendingVideos];
 }
 if (pendingVideos.length>MAX_PENDING) fail('V2_VIDEO_COUNT_LIMIT');
 const metadata=pendingVideos.map((video)=>{
  if (!obj(video)||!obj(video.blob)||typeof video.blob.slice!=='function' ||
      !Number.isSafeInteger(video.blob.size)||video.blob.size<1||video.blob.size>MAX_VIDEO ||
      !['entrance_media','record_media'].includes(video.source)||video.sourceBytes!==video.blob.size||
      (video.source==='record_media'&&video.blob.size>16*1024*1024)||
      typeof video.mimeType!=='string'||!(/^(?:video\/[a-z0-9.+-]+|application\/octet-stream)$/i).test(video.mimeType))
   fail('V2_VIDEO_UNSUPPORTED');
  return {source:video.source,videoId:video.videoId,
   sourceSha256:video.sourceSha256,sourceBytes:video.sourceBytes};
 });
 stateAndLedger(archiveState,ledger,guard,metadata);
 if (pendingVideos.length && typeof shaModule?.hashBlobHex!=='function') fail('V2_STREAMING_HASH_REQUIRED');
 if (typeof backupId!=='string'||!backupId.trim()||backupId.length>128||
     typeof createdAt!=='string'||!Number.isFinite(Date.parse(createdAt))) fail('V2_METADATA_INVALID');
 let stateBytes, ledgerBytes;
 try {stateBytes=textBytes({app:'Paseka',state:archiveState});ledgerBytes=textBytes(ledger);}
 catch (_) {fail('V2_JSON_SERIALIZATION_FAILED');}
 if (stateBytes.length<2||stateBytes.length>MAX_STATE||ledgerBytes.length<2||ledgerBytes.length>MAX_LEDGER) fail('V2_PAYLOAD_SIZE_LIMIT');
 const manifest={format:FORMAT,version:VERSION,backupId,createdAt,schemaVersion:archiveState.meta.schemaVersion,entries:[
  {kind:'state',path:'state.json',size:stateBytes.length,sha256:await hash(stateBytes,cryptoProvider),mimeType:'application/json'},
  {kind:'recognition_ledger',path:'recognition-ledger.json',size:ledgerBytes.length,sha256:await hash(ledgerBytes,cryptoProvider),mimeType:'application/json'}
 ]};
 for (const [index,video] of pendingVideos.entries()) {
  const actualHash=await shaModule.hashBlobHex(video.blob);
  if (actualHash!==video.sourceSha256) fail('V2_VIDEO_SOURCE_HASH_MISMATCH');
  manifest.entries.push({kind:video.source==='record_media'?'record_video':'entrance_video',
   path:(video.source==='record_media'?'pending-record/':'pending-entrance/')+String(index+1).padStart(6,'0')+'.blob',
   size:video.sourceBytes,sha256:actualHash,mimeType:video.mimeType,source:video.source,
   videoId:video.videoId,sourceSha256:video.sourceSha256,sourceBytes:video.sourceBytes});
 }
 const manifestBytes=textBytes(manifest);
 if (manifestBytes.length>MAX_MANIFEST) fail('V2_MANIFEST_SIZE_LIMIT');
 const total=HEADER+manifestBytes.length+stateBytes.length+ledgerBytes.length+pendingVideos.reduce((n,v)=>n+v.blob.size,0);
 checkManifest(manifest,total,manifestBytes.length);
 const header=new Uint8Array(HEADER);
 header.set(new TextEncoder().encode(MAGIC));
 new DataView(header.buffer).setUint32(8,manifestBytes.length,true);
 return new Blob([header,manifestBytes,stateBytes,ledgerBytes,...pendingVideos.map(v=>v.blob)],{type:'application/vnd.paseka.archive'});
}
async function inspectMetadataArchive(blob,cryptoProvider,guard,shaModule,recordAdapter) {
 if (!blob||typeof blob.slice!=='function'||!Number.isSafeInteger(blob.size)||blob.size<HEADER||blob.size>MAX_ARCHIVE) fail('V2_ARCHIVE_SIZE_LIMIT');
 const head=new Uint8Array(await blob.slice(0,HEADER).arrayBuffer());
 if (new TextDecoder().decode(head.subarray(0,8))!==MAGIC) fail('V2_MAGIC_MISMATCH');
 const manifestLength=new DataView(head.buffer).getUint32(8,true);
 if (manifestLength<2||manifestLength>MAX_MANIFEST||HEADER+manifestLength>blob.size) fail('V2_MANIFEST_SIZE_LIMIT');
 const manifest=decodeJson(new Uint8Array(await blob.slice(HEADER,HEADER+manifestLength).arrayBuffer()),'V2_MANIFEST_JSON_INVALID');
 const entries=checkManifest(manifest,blob.size,manifestLength);
 const decoded=[];
 for (const entry of entries.slice(0,2)) {
  const bytes=new Uint8Array(await blob.slice(entry.offset,entry.end).arrayBuffer());
  if (await hash(bytes,cryptoProvider)!==entry.sha256) fail('V2_PAYLOAD_HASH_MISMATCH');
  decoded.push(decodeJson(bytes,'V2_PAYLOAD_JSON_INVALID'));
 }
 const [wrapper,ledger]=decoded;
 if (!allowed(wrapper,['app','state'])||wrapper.app!=='Paseka'||!obj(wrapper.state)||
     wrapper.state.meta?.schemaVersion!==manifest.schemaVersion) fail('V2_STATE_WRAPPER_INVALID');
 const videoEntries=entries.slice(2);
 const metadata=videoEntries.map(v=>({source:v.source,videoId:v.videoId,
  sourceSha256:v.sourceSha256,sourceBytes:v.sourceBytes}));
 stateAndLedger(wrapper.state,ledger,guard,metadata);
 if (videoEntries.length && typeof shaModule?.hashBlobHex!=='function') fail('V2_STREAMING_HASH_REQUIRED');
 // Hash each source Blob independently. Read the data lazily, never load a
 // full video into ArrayBuffer for verification.
 const videos=[];
 for (const entry of videoEntries) {
  const videoBlob=blob.slice(entry.offset,entry.end,entry.mimeType);
  if (await shaModule.hashBlobHex(videoBlob)!==entry.sha256)
   fail('V2_VIDEO_SOURCE_HASH_MISMATCH');
  videos.push({source:entry.source,videoId:entry.videoId,sourceSha256:entry.sourceSha256,
   sourceBytes:entry.sourceBytes,mimeType:entry.mimeType,blob:videoBlob});
 }
 let decodedState=wrapper.state;
 const recordVideos=videos.filter(item=>item.source==='record_media');
 if (recordVideos.length) {
  if (typeof recordAdapter?.rehydratePendingRecordMedia!=='function') fail('V2_RECORD_ADAPTER_UNAVAILABLE');
  const restored=await recordAdapter.rehydratePendingRecordMedia(wrapper.state,ledger,recordVideos,guard,shaModule);
  decodedState=restored.state;
 } else if (Array.isArray(wrapper.state.records) &&
   wrapper.state.records.some(rec=>Array.isArray(rec?.media)&&rec.media.some(item=>item?.archivePendingVideoV2))) {
  fail('V2_RECORD_ENTRY_MISSING');
 }
 // Return decoded metadata for read-only inspection. This object is not a
 // staging or commit ticket: no transaction, current-state or writer checks.
 return {format:FORMAT,version:VERSION,backupId:manifest.backupId,
  state:decodedState,ledger,pendingVideos:videos,archiveSafe:false,restoreAuthorized:false};
}
root.PasekaVideoArchiveV2MetadataCodec=Object.freeze({buildMetadataArchive,inspectMetadataArchive});
})(typeof window!=='undefined'?window:globalThis);
