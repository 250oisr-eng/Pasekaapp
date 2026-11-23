import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash, webcrypto} from 'node:crypto';

// Real pre-integration guard and real PASEKA02 codec, using only synthetic
// bytes. No live database, Android MediaStore, or real video is touched.
const root={};
for(const filename of [
  'paseka-sha256.js',
  'video-archive-v2-guard.js',
  'video-archive-v2-metadata-codec.js'
]) {
  new Function('window',await readFile(new URL('../js/'+filename,import.meta.url),'utf8'))(root);
}
const guard=root.PasekaVideoArchiveV2Guard;
const codec=root.PasekaVideoArchiveV2MetadataCodec;
const actual=new Uint8Array([11,22,33,44,55]);
const actualHash=createHash('sha256').update(actual).digest('hex');
const otherHash='e'.repeat(64);
const state={meta:{schemaVersion:15,revisionId:'synthetic'},hives:[],records:[]};
const entry=(source,cleanupState='blocked_archive_safety')=>({
  source,videoId:'already-recognized',resultId:'result-for-known-source',
  recognizedAt:'2026-11-23T00:00:00Z',
  stateRevisionId:'before-archive',
  result:{beesIn:0,beesOut:0,synthetic:true},
  sourceSha256:actualHash,sourceBytes:actual.length,
  sourceEvidenceVersion:1,
  sourceHashVerifiedAt:'2026-11-23T00:00:00Z',
  cleanupState
});
const ledger=entry=>({version:1,entries:[entry]});
const candidate=(source,videoId,sha256)=>({
  source,videoId,sourceSha256:sha256,sourceBytes:actual.length
});
const throwsAlias=fn=>assert.throws(fn,e=>e?.code==='V2_RECOGNIZED_ORIGINAL_INCLUDED');

test('P0: PASEKA02 rejects same recognized bytes renamed within or across both media stores',()=>{
  for(const recognizedSource of ['entrance_media','record_media']){
    for(const incomingSource of ['entrance_media','record_media']){
      for(const status of ['blocked_archive_safety','delete_required','deleted']){
        const prior=ledger(entry(recognizedSource,status));
        const alias=candidate(incomingSource,'renamed-video-'+status,actualHash);
        throwsAlias(()=>guard.checkCandidateVideoPayloads(prior,[alias]));
      }
    }
  }
});

test('P0: ordinary distinct hash remains eligible for preflight (never cleanup authorization)',()=>{
  const prior=ledger(entry('record_media'));
  const checked=guard.checkCandidateVideoPayloads(prior,[
    candidate('entrance_media','genuinely-distinct-source',otherHash)
  ]);
  assert.equal(checked.ok,true);
  assert.equal(checked.archiveSafe,false);
  assert.equal(checked.inspectedPayloads,1);
  throwsAlias(()=>guard.checkCandidateVideoPayloads(prior,[
    candidate('record_media','already-recognized',otherHash)
  ]));
});

test('P0: full v2 metadata archive export refuses a recognized original disguised as a new entrance video',async()=>{
  const prior=ledger(entry('record_media','deleted'));
  await assert.rejects(
    codec.buildMetadataArchive({
      state,ledger:prior,backupId:'synthetic-alias-reject',
      createdAt:'2026-11-23T00:00:00Z',
      pendingVideos:[{
        ...candidate('entrance_media','new-id-same-bytes',actualHash),
        mimeType:'video/mp4',
        blob:new Blob([actual],{type:'video/mp4'})
      }]
    },webcrypto,guard,root.PasekaSha256),
    e=>e?.code==='V2_RECOGNIZED_ORIGINAL_INCLUDED'
  );
});
