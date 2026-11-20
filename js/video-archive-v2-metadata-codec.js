(function(root) {
'use strict';
// Standalone v2 prototype: state + verified recognition ledger only.
// Pending video binaries and state-embedded video Data URLs are NOT supported.
// Never use this module as deletion authorization or live restore implementation.
const MAGIC = 'PASEKA02';
const FORMAT = 'paseka-archive';
const VERSION = 2;
const HEADER = 12;
const MAX_MANIFEST = 64 * 1024;
const MAX_STATE = 16 * 1024 * 1024;
const MAX_LEDGER = 4 * 1024 * 1024;
const MAX_ARCHIVE = HEADER + MAX_MANIFEST + MAX_STATE + MAX_LEDGER;
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
function stateAndLedger(state, ledger, guard) {
 if (!obj(state)||!obj(state.meta)||!Number.isSafeInteger(state.meta.schemaVersion)||state.meta.schemaVersion<1) fail('V2_STATE_INVALID');
 if (!guard||typeof guard.checkCandidateVideoPayloads!=='function') fail('V2_GUARD_MISSING');
 // An empty candidate video list is deliberate: pending originals must be
 // handled by a later, independently tested v2 video transport implementation.
 guard.checkCandidateVideoPayloads(ledger,[]);
 assertNoVideoData(state);
 // Embedded journal media must be explicitly classified. A video payload
 // without a recognized data:video prefix is still a binary until proven otherwise.
 if (Array.isArray(state.records)) for (const record of state.records) {
  if (Array.isArray(record?.media)) for (const media of record.media) {
   const type = String(media?.type || media?.mimeType || '');
   if ((type==='video'||type.startsWith('video/')) && media?.data != null)
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
     !Array.isArray(manifest.entries)||manifest.entries.length!==2) fail('V2_MANIFEST_INVALID');
 const configs=[['state','state.json',MAX_STATE],['recognition_ledger','recognition-ledger.json',MAX_LEDGER]];
 let offset=HEADER+manifestLength;
 const entries=manifest.entries.map((item,i)=>{
  const [kind,path,maxSize]=configs[i];
  if (!allowed(item,['kind','path','size','sha256','mimeType'])||
      item.kind!==kind||item.path!==path||item.mimeType!=='application/json'||
      !Number.isSafeInteger(item.size)||item.size<2||item.size>maxSize||
      typeof item.sha256!=='string'||!/^[0-9a-f]{64}$/.test(item.sha256)) fail('V2_ENTRY_INVALID');
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
async function buildMetadataArchive({state,ledger,backupId,createdAt},cryptoProvider,guard) {
 stateAndLedger(state,ledger,guard);
 if (typeof backupId!=='string'||!backupId.trim()||backupId.length>128||
     typeof createdAt!=='string'||!Number.isFinite(Date.parse(createdAt))) fail('V2_METADATA_INVALID');
 let stateBytes, ledgerBytes;
 try {stateBytes=textBytes({app:'Paseka',state});ledgerBytes=textBytes(ledger);}
 catch (_) {fail('V2_JSON_SERIALIZATION_FAILED');}
 if (stateBytes.length<2||stateBytes.length>MAX_STATE||ledgerBytes.length<2||ledgerBytes.length>MAX_LEDGER) fail('V2_PAYLOAD_SIZE_LIMIT');
 const manifest={format:FORMAT,version:VERSION,backupId,createdAt,schemaVersion:state.meta.schemaVersion,entries:[
  {kind:'state',path:'state.json',size:stateBytes.length,sha256:await hash(stateBytes,cryptoProvider),mimeType:'application/json'},
  {kind:'recognition_ledger',path:'recognition-ledger.json',size:ledgerBytes.length,sha256:await hash(ledgerBytes,cryptoProvider),mimeType:'application/json'}
 ]};
 const manifestBytes=textBytes(manifest);
 if (manifestBytes.length>MAX_MANIFEST) fail('V2_MANIFEST_SIZE_LIMIT');
 const total=HEADER+manifestBytes.length+stateBytes.length+ledgerBytes.length;
 checkManifest(manifest,total,manifestBytes.length);
 const header=new Uint8Array(HEADER);
 header.set(new TextEncoder().encode(MAGIC));
 new DataView(header.buffer).setUint32(8,manifestBytes.length,true);
 return new Blob([header,manifestBytes,stateBytes,ledgerBytes],{type:'application/vnd.paseka.archive'});
}
async function inspectMetadataArchive(blob,cryptoProvider,guard) {
 if (!blob||typeof blob.slice!=='function'||!Number.isSafeInteger(blob.size)||blob.size<HEADER||blob.size>MAX_ARCHIVE) fail('V2_ARCHIVE_SIZE_LIMIT');
 const head=new Uint8Array(await blob.slice(0,HEADER).arrayBuffer());
 if (new TextDecoder().decode(head.subarray(0,8))!==MAGIC) fail('V2_MAGIC_MISMATCH');
 const manifestLength=new DataView(head.buffer).getUint32(8,true);
 if (manifestLength<2||manifestLength>MAX_MANIFEST||HEADER+manifestLength>blob.size) fail('V2_MANIFEST_SIZE_LIMIT');
 const manifest=decodeJson(new Uint8Array(await blob.slice(HEADER,HEADER+manifestLength).arrayBuffer()),'V2_MANIFEST_JSON_INVALID');
 const entries=checkManifest(manifest,blob.size,manifestLength);
 const decoded=[];
 for (const entry of entries) {
  const bytes=new Uint8Array(await blob.slice(entry.offset,entry.end).arrayBuffer());
  if (await hash(bytes,cryptoProvider)!==entry.sha256) fail('V2_PAYLOAD_HASH_MISMATCH');
  decoded.push(decodeJson(bytes,'V2_PAYLOAD_JSON_INVALID'));
 }
 const [wrapper,ledger]=decoded;
 if (!allowed(wrapper,['app','state'])||wrapper.app!=='Paseka'||!obj(wrapper.state)||
     wrapper.state.meta?.schemaVersion!==manifest.schemaVersion) fail('V2_STATE_WRAPPER_INVALID');
 stateAndLedger(wrapper.state,ledger,guard);
 // Return decoded metadata for read-only inspection. This object is not a
 // staging or commit ticket: no transaction, current-state or writer checks.
 return {format:FORMAT,version:VERSION,backupId:manifest.backupId,
  state:wrapper.state,ledger,archiveSafe:false,restoreAuthorized:false};
}
root.PasekaVideoArchiveV2MetadataCodec=Object.freeze({buildMetadataArchive,inspectMetadataArchive});
})(typeof window!=='undefined'?window:globalThis);
