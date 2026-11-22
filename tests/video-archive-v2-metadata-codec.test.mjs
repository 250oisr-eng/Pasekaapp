import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

const guardSource=await readFile(new URL('../js/video-archive-v2-guard.js',import.meta.url),'utf8');
const codecSource=await readFile(new URL('../js/video-archive-v2-metadata-codec.js',import.meta.url),'utf8');
const shaSource=await readFile(new URL('../js/paseka-sha256.js',import.meta.url),'utf8');
const root={};
new Function('window',guardSource)(root);
new Function('window',codecSource)(root);
new Function('window',shaSource)(root);
const api=root.PasekaVideoArchiveV2MetadataCodec;
const guard=root.PasekaVideoArchiveV2Guard;
const state=()=>({meta:{schemaVersion:15,revisionId:'rev'},hives:[{id:'h1'}],records:[]});
const entry=()=>({source:'entrance_media',videoId:'original1',resultId:'result1',
 cleanupState:'deleted',sourceSha256:'a'.repeat(64),sourceBytes:1024,sourceEvidenceVersion:1,
 recognizedAt:'2026-11-20T00:00:00Z',result:{observations:['леток']}});
const args=()=>({state:state(),ledger:{version:1,entries:[entry()]},
 backupId:'test-archive',createdAt:'2026-11-20T00:00:00Z'});
const build=x=>api.buildMetadataArchive(x,webcrypto,guard,root.PasekaSha256);
const parse=x=>api.inspectMetadataArchive(x,webcrypto,guard,root.PasekaSha256);
const rejects=(p,code)=>assert.rejects(p,e=>e.code===code);
const fromParts=async(blob,modify)=>{
 const bytes=new Uint8Array(await blob.arrayBuffer());
 modify(bytes);
 return new Blob([bytes]);
};

test('metadata-only v2 roundtrip preserves recognition history and never authorizes restore',async()=>{
 const source=args();
 const blob=await build(source);
 const result=await parse(blob);
 assert.equal(result.version,2);
 assert.equal(result.archiveSafe,false);
 assert.equal(result.restoreAuthorized,false);
 assert.deepEqual(result.ledger,source.ledger);
 assert.deepEqual(result.state,source.state);
 assert.equal(new TextDecoder().decode(new Uint8Array(await blob.slice(0,8).arrayBuffer())),'PASEKA02');
});

test('v1 header is rejected, not confused with v2',async()=>{
 const blob=await build(args());
 const old=await fromParts(blob,b=>b.set(new TextEncoder().encode('PASEKA01')));
 await rejects(parse(old),'V2_MAGIC_MISMATCH');
});

test('corrupted state, ledger and trailing payload bytes rejected',async()=>{
 const blob=await build(args());
 const bytes=new Uint8Array(await blob.arrayBuffer());
 const manifestLength=new DataView(bytes.buffer).getUint32(8,true);
 const manifest=JSON.parse(new TextDecoder().decode(bytes.slice(12,12+manifestLength)));
 const ledgerOffset=12+manifestLength+manifest.entries[0].size;
 const corruptedState=await fromParts(blob,b=>b[12+manifestLength]^=1);
 await rejects(parse(corruptedState),'V2_PAYLOAD_HASH_MISMATCH');
 const corruptedLedger=await fromParts(blob,b=>b[ledgerOffset+2]^=1);
 await rejects(parse(corruptedLedger),'V2_PAYLOAD_HASH_MISMATCH');
 await rejects(parse(new Blob([blob,new Uint8Array([1])])),'V2_ARCHIVE_LENGTH_MISMATCH');
});

test('state containing video Data URL cannot be exported in metadata-only v2',async()=>{
 const input=args();
 input.state.records=[{id:'r1',media:[{id:'pending',data:'data:video/mp4;base64,AAAA'}]}];
 await rejects(build(input),'V2_STATE_EMBEDDED_VIDEO');
});

test('recognized video cannot be disguised as a journal attachment',async()=>{
 const input=args();
 input.state.records=[{id:'r1',media:[{id:'original1',type:'video',data:'data:application/octet-stream;base64,AA=='}]}];
 await rejects(build(input),'V2_STATE_EMBEDDED_VIDEO');
});

test('unsupported ledger, duplicate result and invalid source hash fail before archive output',async()=>{
 const input=args(); input.ledger.version=3;
 await rejects(build(input),'V2_LEDGER_INVALID');
 input.ledger.version=1;input.ledger.entries.push({...entry(),videoId:'another'});
 await rejects(build(input),'V2_LEDGER_DUPLICATE');
 input.ledger.entries=[{...entry(),sourceSha256:'unknown'}];
 await rejects(build(input),'V2_LEDGER_ENTRY_INVALID');
});

test('archive metadata-only rejects modified manifest length and truncation',async()=>{
 const blob=await build(args());
 const extra=await fromParts(blob,b=>new DataView(b.buffer).setUint32(8,65537,true));
 await rejects(parse(extra),'V2_MANIFEST_SIZE_LIMIT');
 const truncated=new Blob([blob.slice(0,blob.size-1)]);
 await rejects(parse(truncated),'V2_ARCHIVE_LENGTH_MISMATCH');
});

test('fails closed without guard or crypto, and empty recognition history remains representable',async()=>{
 await rejects(api.buildMetadataArchive(args(),webcrypto,null),'V2_GUARD_MISSING');
 await rejects(api.buildMetadataArchive(args(),null,guard),'V2_CRYPTO_UNAVAILABLE');
 const input=args(); input.ledger.entries=[];
 const result=await parse(await build(input));
 assert.deepEqual(result.ledger.entries,[]);
 assert.equal(result.restoreAuthorized,false);
});

test('opaque Blob or non-finite numeric state cannot be silently serialized as valid archive',async()=>{
 const input=args();
 input.state.records=[{id:'r',media:[{id:'m',data:new Blob(['original'])}]}];
 await rejects(build(input),'V2_STATE_INVALID');
 input.state.records=[{value:Infinity}];
 await rejects(build(input),'V2_STATE_INVALID');
});

test('journal video with unrecognized data encoding is fail-closed',async()=>{
 const input=args();
 input.state.records=[{id:'r',media:[{type:'video',data:'raw-unknown-encoding'}]}];
 await rejects(build(input),'V2_STATE_EMBEDDED_VIDEO');
});

test('pending entrance video survives isolated roundtrip with verified exact bytes',async()=>{
 const blob=new Blob([new Uint8Array([0,1,2,3,255])],{type:'video/mp4'});
 const digest=await root.PasekaSha256.hashBlobHex(blob);
 const input=args();
 input.pendingVideos=[{source:'entrance_media',videoId:'pending-1',sourceSha256:digest,
  sourceBytes:blob.size,mimeType:'video/mp4',blob}];
 const result=await parse(await build(input));
 assert.equal(result.pendingVideos.length,1);
 assert.equal(result.pendingVideos[0].videoId,'pending-1');
 assert.deepEqual(new Uint8Array(await result.pendingVideos[0].blob.arrayBuffer()),
  new Uint8Array(await blob.arrayBuffer()));
 assert.deepEqual(result.ledger,input.ledger);
 assert.equal(result.restoreAuthorized,false);
 assert.equal(result.archiveSafe,false);
});

test('recognized entrance video cannot be serialized as pending original',async()=>{
 const blob=new Blob([new Uint8Array([1,2,3])],{type:'video/mp4'});
 const input=args();
 input.pendingVideos=[{source:'entrance_media',videoId:'original1',sourceSha256:await root.PasekaSha256.hashBlobHex(blob),
 sourceBytes:blob.size,mimeType:'video/mp4',blob}];
 await rejects(build(input),'V2_RECOGNIZED_ORIGINAL_INCLUDED');
});

test('source SHA mismatch, wrong metadata size and duplicated identities fail closed',async()=>{
 const blob=new Blob([new Uint8Array([1,2,3])],{type:'video/mp4'});
 const digest=await root.PasekaSha256.hashBlobHex(blob);
 const input=args();
 input.pendingVideos=[{source:'entrance_media',videoId:'pending-1',sourceSha256:'b'.repeat(64),
 sourceBytes:blob.size,mimeType:'video/mp4',blob}];
 await rejects(build(input),'V2_VIDEO_SOURCE_HASH_MISMATCH');
 input.pendingVideos[0].sourceSha256=digest;
 input.pendingVideos[0].sourceBytes=blob.size+1;
 await rejects(build(input),'V2_VIDEO_UNSUPPORTED');
 input.pendingVideos[0].sourceBytes=blob.size;
 input.pendingVideos.push({...input.pendingVideos[0]});
 await rejects(build(input),'V2_PAYLOAD_DUPLICATE');
});

test('bit-flipped pending video is detected before returning reconstructed Blob',async()=>{
 const original=new Blob([new Uint8Array([42,43,44,45])],{type:'video/mp4'});
 const input=args();
 input.pendingVideos=[{source:'entrance_media',videoId:'pending-1',
 sourceSha256:await root.PasekaSha256.hashBlobHex(original),sourceBytes:original.size,
 mimeType:'video/mp4',blob:original}];
 const packed=await build(input);
 const damaged=await fromParts(packed,b=>{b[b.length-1]^=1;});
 await rejects(parse(damaged),'V2_VIDEO_SOURCE_HASH_MISMATCH');
});

test('journal media and unknown blob kind remain blocked pending dedicated v2 support',async()=>{
 const blob=new Blob(['contents'],{type:'video/mp4'});
 const input=args();
 input.pendingVideos=[{source:'record_media',videoId:'j1',sourceSha256:await root.PasekaSha256.hashBlobHex(blob),
 sourceBytes:blob.size,mimeType:'video/mp4',blob}];
 await rejects(build(input),'V2_VIDEO_UNSUPPORTED');
 input.pendingVideos=[];
 input.state.records=[{id:'r',media:[{type:'video',data:'opaque-binary'}]}];
 await rejects(build(input),'V2_STATE_EMBEDDED_VIDEO');
});
