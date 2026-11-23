import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const base=new URL('../js/',import.meta.url);
const root={};
for(const filename of ['video-archive-v2-guard.js','paseka-sha256.js','video-archive-v2-record-media.js']){
 const src=await readFile(new URL(filename,base),'utf8');
 new Function('window',src)(root);
}
const guard=root.PasekaVideoArchiveV2Guard,hash=root.PasekaSha256,api=root.PasekaVideoArchiveV2RecordMedia;
const sample=()=>({meta:{schemaVersion:15},records:[
 {id:'r1',media:[{kind:'photo',id:'photo',data:'data:image/jpeg;base64,AA=='},
 {kind:'video',videoId:'v1',sourceBytes:3,sourceSha256:'039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',data:'data:video/mp4;base64,AQID'}]}]});
const empty=()=>({version:1,entries:[]});
const recognized=()=>({version:1,entries:[{source:'record_media',videoId:'v1',resultId:'result1',
 recognizedAt:'2026-11-20T00:00:00Z',stateRevisionId:'synthetic-state',sourceHashVerifiedAt:'2026-11-20T00:00:00Z',cleanupState:'deleted',sourceEvidenceVersion:1,
 sourceBytes:3,sourceSha256:'039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
 result:{observations:['леток']}}]});
const prep=(state,ledger)=>api.preparePendingRecordMedia(state,ledger,guard,hash);
const hydrate=(state,ledger,entries)=>api.rehydratePendingRecordMedia(state,ledger,entries,guard,hash);
const rejected=(promise,code)=>assert.rejects(promise,e=>e.code===code);

test('journal video extraction preserves photo and source state, with verified bytes',async()=>{
 const source=sample(),before=structuredClone(source);
 const extracted=await prep(source,empty());
 assert.deepEqual(source,before);
 assert.equal(extracted.pendingVideos.length,1);
 assert.equal(extracted.state.records[0].media[1].data,null);
 assert.equal(extracted.state.records[0].media[1].archivePendingVideoV2,true);
 assert.equal(extracted.state.records[0].media[0].data,'data:image/jpeg;base64,AA==');
 assert.deepEqual(new Uint8Array(await extracted.pendingVideos[0].blob.arrayBuffer()),new Uint8Array([1,2,3]));
 const reconstructed=await hydrate(extracted.state,empty(),extracted.pendingVideos);
 assert.deepEqual(reconstructed.state,source);
 assert.equal(reconstructed.restoreAuthorized,false);
 assert.equal(extracted.archiveSafe,false);
});
test('recognized journal video with remaining original must never be transported',async()=>{
 await rejected(prep(sample(),recognized()),'V2_RECOGNIZED_ORIGINAL_INCLUDED');
 const state=sample();state.records[0].media[1].data=null;
 const x=await prep(state,recognized());
 assert.equal(x.pendingVideos.length,0);
});
test('unidentified legacy journal video is rejected without mutation',async()=>{
 const state=sample();delete state.records[0].media[1].videoId;
 await rejected(prep(state,empty()),'V2_RECORD_VIDEO_ID_MISSING');
});
test('bad source SHA and size reject before any future archive writer',async()=>{
 let state=sample();state.records[0].media[1].sourceSha256='a'.repeat(64);
 await rejected(prep(state,empty()),'V2_RECORD_SOURCE_HASH_MISMATCH');
 state=sample();state.records[0].media[1].sourceBytes=4;
 await rejected(prep(state,empty()),'V2_RECORD_SOURCE_HASH_MISMATCH');
});
test('two identical video IDs and unknown types fail closed',async()=>{
 const state=sample();state.records[0].media.push({...state.records[0].media[1]});
 await rejected(prep(state,empty()),'V2_RECORD_DUPLICATE_VIDEO');
 const other=sample();other.records[0].media[0]={kind:'unknown',data:'data:video/mp4;base64,AQID'};
 await rejected(prep(other,empty()),'V2_RECORD_UNCLASSIFIED_VIDEO');
});
test('reconstruction refuses corruption, missing, duplicated and extra pending blobs',async()=>{
 const extracted=await prep(sample(),empty());
 await rejected(hydrate(extracted.state,empty(),[]),'V2_RECORD_ENTRY_MISSING');
 const fake={...extracted.pendingVideos[0],blob:new Blob([new Uint8Array([1,2,4])])};
 await rejected(hydrate(extracted.state,empty(),[fake]),'V2_RECORD_SOURCE_HASH_MISMATCH');
 await rejected(hydrate(extracted.state,empty(),[...extracted.pendingVideos,...extracted.pendingVideos]),'V2_RECORD_ENTRY_INVALID');
 const extra={...extracted.pendingVideos[0],videoId:'other'};
 await rejected(hydrate(extracted.state,empty(),[...extracted.pendingVideos,extra]),'V2_RECORD_UNREFERENCED_ENTRY');
});
test('a large multipart base64 payload reconstructs without padding corruption',async()=>{
 const bytes=new Uint8Array(110003);
 for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
 const encoded=Buffer.from(bytes).toString('base64');
 const blob=new Blob([bytes]);
 const digest=await hash.hashBlobHex(blob);
 const state={meta:{schemaVersion:15},records:[{id:'r',media:[{
  kind:'video',videoId:'large',sourceSha256:digest,sourceBytes:bytes.length,
  data:'data:application/octet-stream;base64,'+encoded}]}]};
 const result=await prep(state,empty());
 assert.deepEqual(new Uint8Array(await result.pendingVideos[0].blob.arrayBuffer()),bytes);
 const restored=await hydrate(result.state,empty(),result.pendingVideos);
 assert.deepEqual(Buffer.from(restored.state.records[0].media[0].data.split(',')[1],'base64'),Buffer.from(bytes));
});


test('MIME-only journal video cannot masquerade as a photo during archive and reconstruction',async()=>{
 const state=sample();
 state.records[0].media[1].kind='photo';
 state.records[0].media[1].mimeType='video/mp4';
 const clone=structuredClone(state);
 const candidate=await prep(state,empty());
 assert.deepEqual(state,clone);
 assert.equal(candidate.pendingVideos.length,1);
 assert.equal(candidate.pendingVideos[0].source,'record_media');
 assert.equal(candidate.pendingVideos[0].mimeType,'video/mp4');
 assert.equal(candidate.state.records[0].media[1].data,null);
 assert.equal(candidate.state.records[0].media[1].archivePendingVideoV2,true);
 const restored=await hydrate(candidate.state,empty(),candidate.pendingVideos);
 assert.deepEqual(restored.state,state);
 assert.equal(restored.restoreAuthorized,false);
});

test('masked video MIME still observes prior recognition tombstone instead of reintroducing bytes',async()=>{
 const state=sample();
 state.records[0].media[1].kind='photo';
 state.records[0].media[1].mimeType='video/mp4';
 await rejected(prep(state,recognized()),'V2_RECOGNIZED_ORIGINAL_INCLUDED');
});

test('journal source MIME declarations cannot disagree with actual verified Data URL MIME',async()=>{
 for(const key of ['mimeType','type']){
  const state=sample();
  state.records[0].media[1][key]='video/webm';
  const baseline=structuredClone(state);
  await rejected(prep(state,empty()),'V2_RECORD_MIME_MISMATCH');
  assert.deepEqual(state,baseline);
 }
 const generic=sample();
 generic.records[0].media[1].type='video';
 generic.records[0].media[1].mimeType='video/mp4';
 const extracted=await prep(generic,empty());
 assert.equal(extracted.pendingVideos.length,1);
});

test('journal rehydration rejects mismatched declared MIME or archive entry MIME, preserving staged evidence',async()=>{
 const prepared=await prep(sample(),empty());
 const modified={...prepared.state,records:prepared.state.records.map(record=>({
  ...record,media:record.media.map(item=>item.videoId==='v1'?
   {...item,mimeType:'video/webm'}:item)
 }))};
 const baseline=structuredClone(modified);
 await rejected(hydrate(modified,empty(),prepared.pendingVideos),'V2_RECORD_MIME_MISMATCH');
 assert.deepEqual(modified,baseline);
 const forged=[{...prepared.pendingVideos[0],mimeType:'video/webm'}];
 const explicitlyTyped={...prepared.state,records:prepared.state.records.map(record=>({
  ...record,media:record.media.map(item=>item.videoId==='v1'?
   {...item,mimeType:'video/mp4'}:item)
 }))};
 await rejected(hydrate(explicitlyTyped,empty(),forged),'V2_RECORD_MIME_MISMATCH');
 assert.equal(prepared.pendingVideos[0].blob.size,3);
});
