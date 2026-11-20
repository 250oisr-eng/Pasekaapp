import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root={};
for(const file of ['paseka-sha256.js','video-archive-v2-guard.js',
 'video-archive-v2-record-media.js','journal-video-source.js'])
 new Function('window',await readFile(new URL('../js/'+file,import.meta.url),'utf8'))(root);
const source=root.PasekaJournalVideoSource;
const sha=root.PasekaSha256;
let ids=0;
const filename=(bytes='abc')=>Object.assign(new Blob([bytes],{type:'video/mp4'}),{name:'clip.mp4'});
const deps=(extra={})=>({
 newId:()=> 'journal-'+(++ids),videoMime:()=> 'video/mp4',
 hashBlobHex:sha.hashBlobHex,hashVideoDataUrlHex:sha.hashVideoDataUrlHex,
 readDataUrl:async blob=>'data:video/mp4;base64,'+
  Buffer.from(await blob.arrayBuffer()).toString('base64'),
 ...extra
});
const rejects=(value,code)=>assert.rejects(value,e=>e.code===code);
test('new journal video has stable videoId, real SHA, bytes and unchanged DataURL payload',async()=>{
 const file=filename('abc'),out=await source.prepareVideo(file,deps());
 assert.equal(out.kind,'video');
 assert.match(out.videoId,/^journal-/);
 assert.equal(out.sourceBytes,3);
 assert.equal(out.sourceEvidenceVersion,1);
 assert.equal(out.sourceSha256,await sha.hashBlobHex(file));
 assert.equal((await sha.hashVideoDataUrlHex(out.data)).sha256,out.sourceSha256);
 assert.equal(out.data,'data:video/mp4;base64,YWJj');
 assert.equal(out.type,'video/mp4');
});
test('new verified video is compatible with PASEKA02 record-media adapter without modifying existing records',async()=>{
 const old={kind:'video',name:'legacy.mp4',type:'video/mp4',
  data:'data:video/mp4;base64,YWJj'};
 const generated=await source.prepareVideo(filename(),deps());
 const state={meta:{schemaVersion:15,revisionId:'r1'},
  records:[{id:'inspection',media:[old,generated]}]};
 await rejects(root.PasekaVideoArchiveV2RecordMedia.preparePendingRecordMedia(
  state,{version:1,entries:[]},root.PasekaVideoArchiveV2Guard,sha),
  'V2_RECORD_VIDEO_ID_MISSING');
 assert.deepEqual(state.records[0].media[0],old);
 const newOnly={...state,records:[{id:'new-visit',media:[generated]}]};
 const result=await root.PasekaVideoArchiveV2RecordMedia.preparePendingRecordMedia(
  newOnly,{version:1,entries:[]},root.PasekaVideoArchiveV2Guard,sha);
 assert.equal(result.pendingVideos.length,1);
 assert.equal(result.pendingVideos[0].videoId,generated.videoId);
 assert.equal(result.pendingVideos[0].sourceSha256,generated.sourceSha256);
 assert.equal(result.pendingVideos[0].sourceBytes,3);
 assert.equal(result.state.records[0].media[0].data,null);
 assert.equal(newOnly.records[0].media[0].data,generated.data);
});
test('FileReader MIME-less Data URL gets a canonical video header, not altered video bytes',async()=>{
 const out=await source.prepareVideo(filename(),deps({
  readDataUrl:async()=> 'data:;base64,YWJj'
 }));
 assert.equal(out.data,'data:video/mp4;base64,YWJj');
 assert.equal(out.sourceBytes,3);
});
test('invalid ID, unsupported MIME and zero video are rejected',async()=>{
 await rejects(source.prepareVideo(filename(),deps({newId:()=>''})),
  'JOURNAL_VIDEO_ID_INVALID');
 await rejects(source.prepareVideo(filename(),deps({videoMime:()=> 'image/jpeg'})),
  'JOURNAL_VIDEO_MIME_INVALID');
 await rejects(source.prepareVideo(filename(''),deps()),
  'JOURNAL_VIDEO_INVALID_FILE');
});
test('corrupt FileReader data or mismatching hash aborts before producing an attachment',async()=>{
 await rejects(source.prepareVideo(filename(),deps({readDataUrl:async()=> 'invalid'})),
  'JOURNAL_VIDEO_DATA_URL_INVALID');
 await rejects(source.prepareVideo(filename(),deps({
  readDataUrl:async()=> 'data:video/mp4;base64,eHl6'
 })),'JOURNAL_VIDEO_EVIDENCE_MISMATCH');
 await rejects(source.prepareVideo(filename(),deps({
  hashBlobHex:async()=> 'not-sha'
 })),'JOURNAL_VIDEO_SOURCE_HASH_INVALID');
});
test('missing SHA helper cannot silently save a new journal video',async()=>{
 await rejects(source.prepareVideo(filename(),deps({hashVideoDataUrlHex:null})),
  'JOURNAL_VIDEO_DEPS_MISSING');
});
test('both capture and selected video paths use the shared SHA-checked preparer',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/<script src="\.\/js\/journal-video-source\.js"><\/script>/);
 assert.match(html,/async function prepareJournalVideoAttachment\(file\)/);
 assert.match(html,/const item=await prepareJournalVideoAttachment\(file\);/);
 assert.match(html,/media\.push\(await prepareJournalVideoAttachment\(f\)\);/);
});
