import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

const guardSource=await readFile(new URL('../js/video-archive-v2-guard.js',import.meta.url),'utf8');
const codecSource=await readFile(new URL('../js/video-archive-v2-metadata-codec.js',import.meta.url),'utf8');
const root={};
new Function('window',guardSource)(root);
new Function('window',codecSource)(root);
const api=root.PasekaVideoArchiveV2MetadataCodec;
const guard=root.PasekaVideoArchiveV2Guard;
const state=()=>({meta:{schemaVersion:15,revisionId:'rev'},hives:[{id:'h1'}],records:[]});
const entry=()=>({source:'entrance_media',videoId:'original1',resultId:'result1',
 cleanupState:'deleted',sourceSha256:'a'.repeat(64),sourceBytes:1024,sourceEvidenceVersion:1,
 recognizedAt:'2026-11-20T00:00:00Z',result:{observations:['леток']}});
const args=()=>({state:state(),ledger:{version:1,entries:[entry()]},
 backupId:'test-archive',createdAt:'2026-11-20T00:00:00Z'});
const build=x=>api.buildMetadataArchive(x,webcrypto,guard);
const parse=x=>api.inspectMetadataArchive(x,webcrypto,guard);
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
