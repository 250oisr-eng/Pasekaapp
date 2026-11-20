import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../js/video-retention-guard.js',import.meta.url),'utf8');
const root={};
new Function('window',source)(root);
const authorize=root.PasekaVideoRetentionGuard.authorizeOriginalCleanup;
const video={id:'v-1',source:'entrance_media',expectedRevisionId:'r1'};
const receipt={videoId:'v-1',source:'entrance_media',recognitionStatus:'completed',
 recognitionSucceeded:true,resultPersisted:true,resultId:'result-1',
 durableRevisionId:'saved-1',sourceRevisionId:'r1',storageVerified:true,archiveSafe:true};
test('completed and durably verified recognition authorizes a cleanup request but never deletes',()=>{
 const result=authorize(video,receipt);
 assert.equal(result.ok,true);assert.equal(result.action,'cleanup_required');
 assert.equal(result.videoId,'v-1');assert.equal(result.source,'entrance_media');
 assert.match(result.note,/no binary has been deleted/);
 assert.equal(Object.hasOwn(result,'delete'),false);
});
test('same guard supports journal video without touching photo or unrelated media',()=>{
 assert.equal(authorize({...video,source:'record_media'},{...receipt,source:'record_media'}).ok,true);
 for(const source of ['photo','unknown',null])assert.equal(authorize({...video,source},receipt).ok,false);
});
test('rejects failed, offline, partial, unpersisted and unverifiable results',()=>{
 const invalid=[
 {recognitionStatus:'analyzing'},{recognitionStatus:'failed'},
 {recognitionSucceeded:false},{resultPersisted:false},{resultId:''},
 {durableRevisionId:''},{storageVerified:false},{archiveSafe:false},
 {videoId:'other'},{source:'record_media'},{sourceRevisionId:'stale'}
 ];
 for(const patch of invalid)assert.equal(authorize(video,{...receipt,...patch}).ok,false,JSON.stringify(patch));
 assert.equal(authorize(video,null).ok,false);
 assert.equal(authorize(null,receipt).ok,false);
});
test('does not mutate original video or result evidence',()=>{
 const a=structuredClone(video),b=structuredClone(receipt);
 authorize(video,receipt);
 assert.deepEqual(video,a);assert.deepEqual(receipt,b);
});
test('an older receipt cannot authorize a newer source revision',()=>{
 assert.equal(authorize({...video,expectedRevisionId:'r2'},receipt).reason,'stale_source_revision');
});

test('copy inspector blocks journal video copies and does not change stored state',()=>{
 const main={records:[{id:'r',media:[{kind:'video',videoId:'v-1',data:'data:video/mp4;base64,AAAA'},{kind:'image',data:'photo'}]}]};
 const before=structuredClone(main);
 const result=root.PasekaVideoRetentionGuard.inspectManagedVideoCopies('v-1',main,null);
 assert.equal(result.ok,false);assert.equal(result.reason,'original_copies_present');
 assert.deepEqual(result.copies,['main.records[0].media[0]']);
 assert.deepEqual(main,before);
});
test('copy inspector finds video reintroduced by snapshots or automatic backup',()=>{
 const main={records:[],snapshots:[{state:{records:[{media:[{kind:'video',id:'v-1',data:'binary'}]}]}}]};
 const backup={state:{records:[{media:[{kind:'video',videoId:'v-1',data:'binary'}]}]}};
 const result=root.PasekaVideoRetentionGuard.inspectManagedVideoCopies('v-1',main,backup);
 assert.deepEqual(result.copies,['main.snapshots[0].records[0].media[0]','autoBackup.records[0].media[0]']);
 assert.equal(result.ok,false);
});
test('legacy video without stable identity blocks cleanup rather than guessing',()=>{
 const result=root.PasekaVideoRetentionGuard.inspectManagedVideoCopies('v-1',
   {records:[{media:[{kind:'video',data:'data:video/mp4;base64,AAAA'}]}]},null);
 assert.equal(result.ok,false);assert.equal(result.reason,'unidentified_legacy_videos');
 assert.equal(result.ambiguous.length,1);
});
test('copy scanner allows clean state but never performs deletion',()=>{
 const result=root.PasekaVideoRetentionGuard.inspectManagedVideoCopies('v-1',
   {records:[{media:[{kind:'image',data:'photo'},{kind:'video',videoId:'v-2',data:'other'}]}]},null);
 assert.equal(result.ok,true);assert.deepEqual(result.copies,[]);assert.deepEqual(result.ambiguous,[]);
 assert.equal(root.PasekaVideoRetentionGuard.inspectManagedVideoCopies('',{},null).ok,false);
});
