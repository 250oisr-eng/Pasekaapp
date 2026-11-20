import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root={};
for(const filename of ['video-archive-v2-guard.js','video-archive-v2-restore-gate.js']){
 new Function('window',await readFile(new URL('../js/'+filename,import.meta.url),'utf8'))(root);
}
const api=root.PasekaVideoArchiveV2RestoreGate.checkRestoreLedgerCandidate;
const guard=root.PasekaVideoArchiveV2Guard;
const hashes={recognized:'a'.repeat(64),pending:'b'.repeat(64),other:'c'.repeat(64)};
const result=(overrides={})=>({source:'record_media',videoId:'v1',resultId:'r1',
 recognizedAt:'2026-11-20T00:00:00Z',sourceEvidenceVersion:1,
 sourceSha256:hashes.recognized,sourceBytes:3,cleanupState:'deleted',
 result:{observation:'облёт'},...overrides});
const ledger=entries=>({version:1,entries});
const media=(overrides={})=>({kind:'video',videoId:'v2',sourceSha256:hashes.pending,
 sourceBytes:2,data:'data:video/mp4;base64,AQI=',...overrides});
const pending=(overrides={})=>({source:'record_media',videoId:'v2',sourceSha256:hashes.pending,
 sourceBytes:2,mimeType:'video/mp4',blob:new Blob([new Uint8Array([1,2])]),...overrides});
const state=records=>({meta:{schemaVersion:15},records});
const candidate=(overrides={})=>({state:state([{id:'inspection',media:[media()]}]),
 ledger:ledger([result()]),pendingVideos:[pending()],...overrides});
const rejects=(run,code)=>assert.throws(run,e=>e.code===code);

test('candidate retains all existing recognition results without authorizing restore',()=>{
 const existing=ledger([result()]);
 const output=api(existing,candidate(),guard);
 assert.equal(output.historyPreserved,1);
 assert.equal(output.inspectedPendingVideoCount,1);
 assert.equal(output.preflightPassed,true);
 assert.equal(output.archiveSafe,false);
 assert.equal(output.restoreAuthorized,false);
 assert.equal(output.requiresAtomicCommitCheck,true);
});

test('incoming archive omitting current tombstone is rejected, including empty history',()=>{
 rejects(()=>api(ledger([result()]),candidate({ledger:ledger([])}),guard),'V2_RESTORE_LEDGER_HISTORY_LOST');
});

test('cleanup status downgrade, result alteration or hash change reject even if IDs match',()=>{
 for(const change of [
  {cleanupState:'blocked_archive_safety'},
  {result:{observation:'modified'}},
  {sourceSha256:'d'.repeat(64)}
 ]){
  rejects(()=>api(ledger([result()]),candidate({ledger:ledger([result(change)])}),guard),'V2_RESTORE_LEDGER_HISTORY_CONFLICT');
 }
});

test('pending video that matches a recognized original by identity OR bytes is rejected',()=>{
 const original=ledger([result()]);
 rejects(()=>api(original,candidate({pendingVideos:[pending({videoId:'v1'})],
 state:state([{id:'inspection',media:[media({videoId:'v1'})]}])}),guard),'V2_RECOGNIZED_ORIGINAL_INCLUDED');
 const alias=pending({videoId:'new-name',sourceSha256:hashes.recognized});
 const input=candidate({pendingVideos:[alias],state:state([{id:'inspection',media:[media({videoId:'new-name',sourceSha256:hashes.recognized})]}])});
 rejects(()=>api(original,input,guard),'V2_RESTORE_RECOGNIZED_ORIGINAL');
});

test('an already recognized journal video must have no original Data URL in restored state',()=>{
 const original=ledger([result()]);
 const input=candidate({pendingVideos:[],state:state([{id:'inspection',media:[media({videoId:'v1',sourceSha256:hashes.recognized})]}])});
 rejects(()=>api(original,input,guard),'V2_RESTORE_RECOGNIZED_ORIGINAL');
});

test('recognized journal metadata without video bytes remains acceptable for preflight',()=>{
 const original=ledger([result()]);
 const input=candidate({pendingVideos:[],state:state([{id:'inspection',media:[media({videoId:'v1',sourceSha256:hashes.recognized,data:null})]}])});
 const output=api(original,input,guard);
 assert.equal(output.preflightPassed,true);
 assert.equal(output.restoreAuthorized,false);
});

test('unlisted journal video Data URL, missing ID and unexpected nested video type reject',()=>{
 const current=ledger([]);
 const input=candidate({ledger:current,pendingVideos:[]});
 rejects(()=>api(current,input,guard),'V2_RESTORE_UNLISTED_RECORD_VIDEO');
 const lost=candidate({ledger:current,pendingVideos:[],state:state([{id:'inspection',media:[media({videoId:undefined})]}])});
 rejects(()=>api(current,lost,guard),'V2_RESTORE_VIDEO_ID_MISSING');
 const hidden=candidate({ledger:current,pendingVideos:[],state:state([{id:'inspection',media:[{kind:'photo',data:'data:video/mp4;base64,AQI='}]}])});
 rejects(()=>api(current,hidden,guard),'V2_RESTORE_UNCLASSIFIED_VIDEO');
});

test('duplicate journal media, orphan pending payloads and unknown marker reject',()=>{
 const current=ledger([]);
 const duplicate=candidate({ledger:current,state:state([{id:'inspection',media:[media(),media()]}])});
 rejects(()=>api(current,duplicate,guard),'V2_RESTORE_RECORD_DUPLICATE');
 const orphan=candidate({ledger:current,state:state([])});
 rejects(()=>api(current,orphan,guard),'V2_RESTORE_UNREFERENCED_RECORD_VIDEO');
 const marker=candidate({ledger:current,state:state([{id:'inspection',media:[media({archivePendingVideoV2:true})]}])});
 rejects(()=>api(current,marker,guard),'V2_RESTORE_TRANSIENT_MARKER');
});

test('new incoming recognition history can be represented but never authorizes commit',()=>{
 const input=candidate();
 assert.equal(api(ledger([]),input,guard).restoreAuthorized,false);
});

test('invalid ledgers and candidates always fail closed',()=>{
 rejects(()=>api({version:98,entries:[]},candidate(),guard),'V2_LEDGER_INVALID');
 rejects(()=>api(ledger([]),{ledger:ledger([]),pendingVideos:[]},guard),'V2_RESTORE_CANDIDATE_INVALID');
 rejects(()=>api(ledger([]),candidate(),null),'V2_RESTORE_GUARD_MISSING');
});

test('journal media hash and byte count must equal referenced pending original',()=>{
 const current=ledger([]);
 const mismatched=candidate({ledger:current,state:state([{id:'inspection',media:[media({sourceSha256:hashes.other})]}])});
 rejects(()=>api(current,mismatched,guard),'V2_RESTORE_RECORD_SOURCE_MISMATCH');
 const wrongBytes=candidate({ledger:current,state:state([{id:'inspection',media:[media({sourceBytes:3})]}])});
 rejects(()=>api(current,wrongBytes,guard),'V2_RESTORE_RECORD_SOURCE_MISMATCH');
});
test('unknown video encoding cannot bypass gate by declaring kind video',()=>{
 const current=ledger([]);
 const input=candidate({ledger:current,state:state([{id:'inspection',media:[media({data:'raw-video-bytes'})]}])});
 rejects(()=>api(current,input,guard),'V2_RESTORE_RECORD_VIDEO_ENCODING');
});
