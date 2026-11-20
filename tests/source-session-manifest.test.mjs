import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspectSourceManifest,SourceManifestRejected} from '../tools/inspect-source-session-manifest.mjs';
const sha=n=>n.toString(16).padStart(64,'0');
const coco=()=>({info:{split:'unassigned',trainingAuthorized:false},images:[{id:1,sha256:sha(1)},{id:2,sha256:sha(2)},{id:3,sha256:sha(3)}]});
const rec=(n,split='unassigned',group=null)=>({imageSha256:sha(n),split,sourceSessionId:group,sourceRecordingSha256:group?sha(group==='video-a'?100:group==='video-b'?200:300):null,evidence:group?{uri:'https://example.org/original-recording-manifest',description:'External original-session mapping requiring independent verification'}:null});
const manifest=(...records)=>({schemaVersion:1,records});
const rejects=(c,m,reason)=>assert.throws(()=>inspectSourceManifest(c,m),e=>e instanceof SourceManifestRejected&&e.message===reason);
test('all unassigned remains blocked',()=>{
 const r=inspectSourceManifest(coco(),manifest(rec(1),rec(2),rec(3)));
 assert.equal(r.structurallyValid,true);assert.equal(r.unassignedImages,3);
 for(const flag of ['sourceIdentityVerified','independentHoldoutVerified','licenseVerified','trainingAuthorized','modelApproved','recognitionSucceeded','cleanupAuthorized'])assert.equal(r[flag],false);
});
test('consistent declared groups never become verified evidence',()=>{
 const r=inspectSourceManifest(coco(),manifest(rec(1,'train','video-a'),rec(2,'train','video-a'),rec(3,'test','video-b')));
 assert.equal(r.declaredSourceSessions,2);assert.equal(r.declaredRecordingHashes,2);assert.deepEqual(r.declaredSplits,['test','train']);
 assert.equal(r.independentHoldoutVerified,false);assert.equal(r.cleanupAuthorized,false);
});
test('same session spanning splits is rejected',()=>rejects(coco(),manifest(rec(1,'train','video-a'),rec(2,'test','video-a'),rec(3)), 'same_session_across_splits'));
test('duplicate SHA record is rejected',()=>rejects(coco(),manifest(rec(1),rec(1),rec(3)), 'record_sha_unknown_or_duplicate'));
test('unknown record SHA is rejected',()=>rejects(coco(),manifest(rec(1),rec(2),rec(4)), 'record_sha_unknown_or_duplicate'));
test('missing source record count is rejected',()=>rejects(coco(),manifest(rec(1),rec(2)), 'manifest_record_count_or_schema'));
test('unassigned record cannot claim a source group',()=>rejects(coco(),manifest({...rec(1),sourceSessionId:'video-a'},rec(2),rec(3)), 'unassigned_must_not_assert_group'));
test('assigned group requires evidence',()=>rejects(coco(),manifest({...rec(1,'train','video-a'),evidence:null},rec(2),rec(3)), 'source_evidence_required'));
test('rejects untrusted non-HTTPS evidence path',()=>rejects(coco(),manifest({...rec(1,'train','video-a'),evidence:{uri:'file:///tmp/a',description:'bad'}},rec(2),rec(3)), 'source_evidence_https_required'));
test('rejects fabricated invalid group IDs',()=>rejects(coco(),manifest(rec(1,'train','../../foo'),rec(2),rec(3)), 'source_session_id_invalid'));
test('rejects invalid split labels',()=>rejects(coco(),manifest({...rec(1),split:'approved'},rec(2),rec(3)), 'record_split_invalid'));
test('rejects COCO that already asserts training authorized',()=>{const c=coco();c.info.trainingAuthorized=true; rejects(c,manifest(rec(1),rec(2),rec(3)),'coco_must_remain_unassigned');});
test('rejects duplicate COCO hashes',()=>{const c=coco();c.images[1].sha256=sha(1);rejects(c,manifest(rec(1),rec(2),rec(3)),'image_sha_invalid_or_duplicate');});

test('identical source recording SHA across distinct splits is rejected even when group names differ',()=>{
 const a=rec(1,'train','video-a');const b={...rec(2,'test','video-b'),sourceRecordingSha256:a.sourceRecordingSha256};
 rejects(coco(),manifest(a,b,rec(3)),'same_recording_across_splits');
});
test('recording reused under two session IDs in same split is rejected',()=>{
 const a=rec(1,'train','video-a');const b={...rec(2,'train','video-b'),sourceRecordingSha256:a.sourceRecordingSha256};
 rejects(coco(),manifest(a,b,rec(3)),'same_recording_multiple_session_ids');
});
test('one source session cannot change recording hash',()=>{
 const b={...rec(2,'train','video-a'),sourceRecordingSha256:sha(900)};
 rejects(coco(),manifest(rec(1,'train','video-a'),b,rec(3)),'same_session_conflicting_recording_sha');
});
test('assigned record must supply a 64-digit recording SHA',()=>{
 const a={...rec(1,'train','video-a'),sourceRecordingSha256:null};
 rejects(coco(),manifest(a,rec(2),rec(3)),'source_recording_sha_invalid');
});
test('unassigned cannot assert a recording SHA',()=>{
 const a={...rec(1),sourceRecordingSha256:sha(5)};
 rejects(coco(),manifest(a,rec(2),rec(3)),'unassigned_must_not_assert_group');
});
test('recording hash is a declaration, never verified physical source bytes',()=>{
 const r=inspectSourceManifest(coco(),manifest(rec(1,'train','video-a'),rec(2,'validation','video-b'),rec(3,'test','video-c')));
 assert.equal(r.declaredRecordingHashes,3);assert.equal(r.sourceIdentityVerified,false);
 assert.equal(r.independentHoldoutVerified,false);assert.equal(r.trainingAuthorized,false);
 assert.equal(r.cleanupAuthorized,false);
});

test('manifest cannot trigger network or runtime deployment',async()=>{
 const raw=await readFile(new URL('../tools/inspect-source-session-manifest.mjs',import.meta.url),'utf8');
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/inspect-source-session-manifest/);
 assert.doesNotMatch(sw,/inspect-source-session-manifest/);
 assert.doesNotMatch(raw,/fetch\s*\(|XMLHttpRequest|indexedDB|\.delete\s*\(|unlink|MediaStore|deleteFile/);
});
