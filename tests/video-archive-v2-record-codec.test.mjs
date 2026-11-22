import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
const root={},base=new URL('../js/',import.meta.url);
for(const filename of ['video-archive-v2-guard.js','paseka-sha256.js','video-archive-v2-record-media.js','video-archive-v2-metadata-codec.js']){
 const source=await readFile(new URL(filename,base),'utf8');
 new Function('window',source)(root);
}
const guard=root.PasekaVideoArchiveV2Guard,sha=root.PasekaSha256,
 adapter=root.PasekaVideoArchiveV2RecordMedia,codec=root.PasekaVideoArchiveV2MetadataCodec;
const sourceSha='039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81';
const baseState=()=>({meta:{schemaVersion:15},records:[{id:'inspection',media:[
 {kind:'photo',id:'p',data:'data:image/jpeg;base64,AA=='},
 {kind:'video',videoId:'j1',sourceSha256:sourceSha,sourceBytes:3,data:'data:video/mp4;base64,AQID'}]}]});
const ledger=()=>({version:1,entries:[]});
const args=()=>({backupId:'pending-journal',createdAt:'2026-11-20T00:00:00Z',state:baseState(),ledger:ledger()});
const build=(input,withAdapter=true)=>codec.buildMetadataArchive(input,webcrypto,guard,sha,withAdapter?adapter:undefined);
const parse=(blob,withAdapter=true)=>codec.inspectMetadataArchive(blob,webcrypto,guard,sha,withAdapter?adapter:undefined);
const rejects=(p,code)=>assert.rejects(p,error=>error.code===code);

test('PASEKA02 journal video full roundtrip preserves photo, metadata, bytes and does not authorize restore',async()=>{
 const source=args(),before=structuredClone(source.state);
 const file=await build(source);
 assert.deepEqual(source.state,before);
 const parsed=await parse(file);
 assert.deepEqual(parsed.state,source.state);
 assert.deepEqual(parsed.ledger,source.ledger);
 assert.equal(parsed.pendingVideos.length,1);
 assert.equal(parsed.pendingVideos[0].source,'record_media');
 assert.deepEqual(new Uint8Array(await parsed.pendingVideos[0].blob.arrayBuffer()),new Uint8Array([1,2,3]));
 assert.equal(parsed.archiveSafe,false);
 assert.equal(parsed.restoreAuthorized,false);
});

test('PASEKA02 mixed entrance and journal video identities roundtrip without collision',async()=>{
 const input=args(),blob=new Blob([new Uint8Array([7,8,9])],{type:'video/mp4'});
 input.pendingVideos=[{source:'entrance_media',videoId:'j1',sourceSha256:await sha.hashBlobHex(blob),
 sourceBytes:blob.size,mimeType:'video/mp4',blob}];
 const parsed=await parse(await build(input));
 assert.equal(parsed.pendingVideos.length,2);
 assert.deepEqual(parsed.pendingVideos.map(x=>x.source),['entrance_media','record_media']);
 assert.deepEqual(parsed.state,input.state);
});

test('Android application/octet-stream journal Data URL roundtrip',async()=>{
 const input=args();
 input.state.records[0].media[1].data='data:application/octet-stream;base64,AQID';
 const parsed=await parse(await build(input));
 assert.deepEqual(parsed.state,input.state);
 assert.equal(parsed.pendingVideos[0].mimeType,'application/octet-stream');
});

test('journal original with recognized ledger identity is not archived',async()=>{
 const input=args();
 input.ledger.entries=[{source:'record_media',videoId:'j1',resultId:'r1',sourceSha256:sourceSha,
 sourceBytes:3,sourceEvidenceVersion:1,recognizedAt:'2026-11-20T00:00:00Z',stateRevisionId:'synthetic-state',sourceHashVerifiedAt:'2026-11-20T00:00:00Z',
 cleanupState:'deleted',result:{observation:'ok'}}];
 await rejects(build(input),'V2_RECOGNIZED_ORIGINAL_INCLUDED');
 input.state.records[0].media[1].data=null;
 const file=await build(input),parsed=await parse(file);
 assert.equal(parsed.pendingVideos.length,0);
 assert.deepEqual(parsed.state,input.state);
 assert.deepEqual(parsed.ledger,input.ledger);
});

test('journal raw input must not export without explicit adapter, or restore without adapter',async()=>{
 const input=args();
 await rejects(build(input,false),'V2_STATE_EMBEDDED_VIDEO');
 const file=await build(input);
 await rejects(parse(file,false),'V2_RECORD_ADAPTER_UNAVAILABLE');
});

test('tampered journal Blob cannot be returned on read',async()=>{
 const file=await build(args());
 const bytes=new Uint8Array(await file.arrayBuffer());bytes[bytes.length-1]^=1;
 await rejects(parse(new Blob([bytes])),'V2_VIDEO_SOURCE_HASH_MISMATCH');
});

test('journal metadata conflict rejects without constructing a file',async()=>{
 const input=args();
 input.state.records[0].media[1].sourceBytes=4;
 await rejects(build(input),'V2_RECORD_SOURCE_HASH_MISMATCH');
});

test('caller cannot inject raw record_media Blob without source-linked adapter',async()=>{
 const input=args();
 const original=new Blob([new Uint8Array([1,2,3])],{type:'video/mp4'});
 input.pendingVideos=[{source:'record_media',videoId:'other',sourceSha256:sourceSha,
 sourceBytes:original.size,mimeType:'video/mp4',blob:original}];
 await rejects(build(input),'V2_VIDEO_UNSUPPORTED');
 await rejects(build(input,false),'V2_VIDEO_UNSUPPORTED');
});

test('legacy kind=video with opaque encoding is rejected without adapter',async()=>{
 const input=args();
 input.state.records[0].media[1].data='legacy-unknown-encoded-video';
 await rejects(build(input,false),'V2_STATE_EMBEDDED_VIDEO');
 await rejects(build(input),'V2_RECORD_DATA_URL_INVALID');
});
