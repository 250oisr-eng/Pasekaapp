import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {readFile} from 'node:fs/promises';
const root={};
for(const file of ['video-archive-v2-guard.js','video-archive-v2-copy-inventory.js'])
 new Function('window',await readFile(new URL('../js/'+file,import.meta.url),'utf8'))(root);
const audit=root.PasekaVideoArchiveV2CopyInventory.auditManagedVideoCopies;
const guard=root.PasekaVideoArchiveV2Guard;
const digest='a'.repeat(64);
const ledger=(state='deleted')=>({version:1,entries:[{
 source:'entrance_media',videoId:'v1',resultId:'recognized-1',
 sourceSha256:digest,sourceBytes:3,sourceEvidenceVersion:1,
 recognizedAt:'2026-11-20T00:00:00Z',cleanupState:state,result:{note:'seen'}
}]});
const done=tx=>new Promise((ok,no)=>{
 tx.oncomplete=ok;tx.onerror=tx.onabort=()=>no(tx.error||new Error('tx fail'));
});
let serial=0;
async function setup(data={}){
 const request=new IDBFactory().open('paseka-v2-inventory-'+(++serial),1);
 request.onupgradeneeded=()=>{
  const db=request.result;db.createObjectStore('main');
  db.createObjectStore('entrance_media',{keyPath:'id'});
  const staged=db.createObjectStore('archive_staging',{keyPath:'id'});
  staged.createIndex('backupId','backupId',{unique:true});
  staged.createIndex('sessionId','sessionId',{unique:false});
  staged.createIndex('kind','kind',{unique:false});
  db.createObjectStore('archive_history',{keyPath:'backupId'});
  db.createObjectStore('full_backup');
 };
 const db=await new Promise((ok,no)=>{
  request.onsuccess=()=>ok(request.result);request.onerror=()=>no(request.error);
 });
 const tx=db.transaction(['main','entrance_media','archive_staging','archive_history','full_backup'],'readwrite');
 tx.objectStore('main').put(data.state??{meta:{schemaVersion:15,revisionId:'r1'},records:[]},'state');
 tx.objectStore('main').put(data.ledger??{version:1,entries:[]},'video_recognition_ledger_v1');
 for(const item of data.entrance||[])tx.objectStore('entrance_media').put(item);
 for(const item of data.staging||[])tx.objectStore('archive_staging').put(item);
 for(const item of data.history||[])tx.objectStore('archive_history').put(item);
 for(const [name,item] of data.backups||[])tx.objectStore('full_backup').put(item,name);
 await done(tx);return db;
}
const blob=(str='abc')=>new Blob([str],{type:'video/mp4'});
const live=id=>({id,blob:blob(),blobSha256:digest,bytes:3,mimeType:'video/mp4'});
const staged=id=>({id:'v2pending:backup:entrance_media:'+id,
 kind:'v2_pending_original',sessionId:'v2pending:backup',
 source:'entrance_media',videoId:id,sourceSha256:digest,
 sourceBytes:3,mimeType:'video/mp4',blob:blob()});
test('audit runs one readonly transaction across all protected stores',async()=>{
 const db=await setup(),modes=[];
 const restricted={objectStoreNames:db.objectStoreNames,transaction(stores,mode){
  modes.push({stores,mode});if(mode!=='readonly')throw Error('unexpected write');
  return db.transaction(stores,mode);
 }};
 const r=await audit(restricted,guard);
 assert.equal(modes.length,1);
 assert.deepEqual(modes[0].stores,
  ['main','entrance_media','archive_staging','archive_history','full_backup']);
 assert.equal(r.copyCount,0);
 assert.equal(r.cleanupAuthorized,false);
 assert.equal(r.auditComplete,false);
 assert.equal(r.externalCopiesVerified,false);
 assert.equal(r.byteIntegrityVerified,false);
 assert.equal(r.dataModified,false);
 assert.ok(r.issues.includes('external_android_copies_not_audited'));
 db.close();
});
test('pending entrance, staged and quarantine copies are counted separately by identity',async()=>{
 const db=await setup({
  entrance:[live('pending')],
  staging:[{id:'v2pending:backup',kind:'v2_pending_session',
   backupId:'backup',sessionId:'v2pending:backup',status:'protected_unverified'},
   staged('pending')],
  history:[{backupId:'backup',kind:'v2_entrance_only',
   status:'reverted_quarantined_unverified'}],
  backups:[['v2entrance:backup',{kind:'v2_entrance_quarantine_rollback_snapshot',
   quarantinedMedia:[live('pending')]}]]
 });
 const r=await audit(db,guard);
 assert.equal(r.copyCount,3);
 assert.equal(r.distinctIdentities,1);
 assert.deepEqual(r.copies.map(c=>c.store).sort(),[
  'archive_staging','entrance_media','full_backup.quarantinedMedia']);
 assert.ok(r.copies.every(c=>c.identity==='entrance_media:pending'));
 assert.equal(r.cleanupAuthorized,false);
 db.close();
});
test('recognized tombstone with any live or protected Blob is never silently considered deleted',async()=>{
 const db=await setup({ledger:ledger('deleted'),entrance:[live('v1')],
  backups:[['backup',{kind:'v2_entrance_quarantine_rollback_snapshot',
   quarantinedMedia:[live('v1')]}]]});
 const report=await audit(db,guard);
 assert.equal(report.recognitionEntries,1);
 assert.ok(report.issues.includes('recognized_original_still_present'));
 assert.ok(report.issues.includes('deleted_tombstone_has_copy'));
 assert.equal(report.cleanupAuthorized,false);
 db.close();
});
test('journal video Data URL is counted without exposing its video bytes',async()=>{
 const db=await setup({state:{meta:{schemaVersion:15,revisionId:'r1'},
  records:[{id:'visit',media:[{
   kind:'video',videoId:'journal-v1',
   sourceSha256:digest,sourceBytes:3,
   data:'data:video/mp4;base64,YWJj'
  }]}]}});
 const report=await audit(db,guard);
 assert.equal(report.copyCount,1);
 assert.equal(report.copies[0].identity,'record_media:journal-v1');
 assert.equal(report.copies[0].store,'main/state.records.media');
 assert.equal(JSON.stringify(report).includes('YWJj'),false);
 assert.equal(report.cleanupAuthorized,false);
 db.close();
});
test('unidentified legacy video and invalid ledger cause fail-closed issues',async()=>{
 const db=await setup({ledger:{version:1,entries:[{bad:true}]},
  state:{meta:{schemaVersion:15,revisionId:'r1'},
   records:[{id:'visit',media:[{kind:'video',data:'blob:unsafe-no-id'}]}]}});
 const report=await audit(db,guard);
 assert.ok(report.issues.includes('ledger_invalid'));
 assert.ok(report.issues.includes('unidentified_copy'));
 assert.equal(report.cleanupAuthorized,false);
 db.close();
});
test('unknown full backup format blocks any positive cleanup inference',async()=>{
 const db=await setup({backups:[['v1-legacy',{blob:blob('original')}]]});
 const report=await audit(db,guard);
 assert.ok(report.issues.includes('unknown_backup_format'));
 assert.equal(report.cleanupAuthorized,false);
 db.close();
});
test('cleanupState delete_required is not proof that all copies are cleared',async()=>{
 const db=await setup({ledger:ledger('delete_required')});
 const report=await audit(db,guard);
 assert.ok(report.issues.includes('cleanup_not_confirmed'));
 assert.equal(report.copyCount,0);
 assert.equal(report.cleanupAuthorized,false);
 db.close();
});
test('unknown staging payload or corrupt journal media blocks audit',async()=>{
 const db=await setup({staging:[{id:'opaque',blob:blob()}],
  state:{meta:{schemaVersion:15,revisionId:'r1'},
   records:[{id:'visit',media:'unstructured'}]}});
 const report=await audit(db,guard);
 assert.ok(report.issues.includes('unknown_staging_payload'));
 assert.ok(report.issues.includes('record_media_unknown'));
 assert.equal(report.cleanupAuthorized,false);
 db.close();
});
test('invalid metadata evidence cannot be used to infer safe deletion',async()=>{
 const db=await setup({entrance:[{id:'v1',blob:blob(),
  blobSha256:'not-a-sha',bytes:3,mimeType:'video/mp4'}]});
 const report=await audit(db,guard);
 assert.ok(report.issues.includes('invalid_copy_evidence'));
 assert.ok(report.issues.includes('copy_evidence_missing'));
 assert.equal(report.cleanupAuthorized,false);
 db.close();
});
test('read error does not silently produce permission or modify anything',async()=>{
 const db=await setup();
 const bad={objectStoreNames:db.objectStoreNames,transaction(){
  throw Error('injected read failure');
 }};
 await assert.rejects(audit(bad,guard),/injected read failure/);
 const tx=db.transaction('main','readonly');
 const request=tx.objectStore('main').get('state');
 const state=await new Promise((ok,no)=>{
  request.onsuccess=()=>ok(request.result);request.onerror=()=>no(request.error);
 });
 assert.equal(state.meta.revisionId,'r1');
 db.close();
});

test('legacy PASEKA01 staged video and rollback_video are both tracked as protected originals',async()=>{
 const old=live('legacy-v');
 const db=await setup({
  staging:[
   {id:'legacy-session',sessionId:'legacy-session',kind:'session',
    backupId:'legacy-archive',status:'committed'},
   {id:'legacy-session:video:legacy-v',sessionId:'legacy-session',
    kind:'video',metadata:{id:'legacy-v'},size:3,
    chunkSha256:[digest],blob:blob()},
   {id:'rollback-session',sessionId:'rollback-session',
    kind:'rollback_session',sourceBackupId:'legacy-archive'},
   {id:'rollback-session:video:legacy-v',sessionId:'rollback-session',
    kind:'rollback_video',originalId:'legacy-v',record:old}
  ],
  history:[{backupId:'legacy-archive',status:'committed',
   importSessionId:'legacy-session',rollbackSessionId:'rollback-session'}]
 });
 const r=await audit(db,guard);
 assert.equal(r.copyCount,2);
 assert.ok(r.copies.some(c=>c.store==='archive_staging.legacy_video'&&
  c.videoId==='legacy-v'));
 assert.ok(r.copies.some(c=>c.store==='archive_staging.rollback_video'&&
  c.videoId==='legacy-v'));
 assert.ok(r.issues.includes('legacy_video_chunks_unverified'));
 assert.ok(r.issues.includes('legacy_rollback_requires_review'));
 assert.equal(r.cleanupAuthorized,false);
 db.close();
});
test('legacy full_backup.previous.state and rollback_state count historical journal originals',async()=>{
 const historical={meta:{schemaVersion:15,revisionId:'historical'},records:[{
  id:'record-historical',media:[{
   kind:'video',videoId:'journal-archived',
   data:'data:video/mp4;base64,YWJj',sourceSha256:digest,sourceBytes:3
  }]
 }]};
 const db=await setup({
  backups:[['previous',{at:'2026-11-20T00:00:00Z',state:historical}]],
  staging:[{id:'rollback:state',sessionId:'rollback',kind:'rollback_state',state:historical}]
 });
 const r=await audit(db,guard);
 assert.equal(r.copyCount,2);
 assert.ok(r.copies.some(c=>c.store==='full_backup.legacy_state'&&
  c.identity==='record_media:journal-archived'));
 assert.ok(r.copies.some(c=>c.store==='archive_staging.rollback_state'&&
  c.identity==='record_media:journal-archived'));
 assert.ok(r.issues.includes('legacy_full_backup_requires_review'));
 assert.equal(JSON.stringify(r).includes('YWJj'),false);
 assert.equal(r.cleanupAuthorized,false);
 db.close();
});
test('opaque legacy state Blob is explicitly unverified, never treated as an empty backup',async()=>{
 const db=await setup({staging:[{
  id:'stage:state',sessionId:'stage',kind:'state',
  size:36,blob:new Blob(['{"records":[{"media":["hidden"]}]}'],{type:'application/json'})
 }]});
 const r=await audit(db,guard);
 assert.ok(r.issues.includes('opaque_legacy_state_blob'));
 assert.equal(r.auditComplete,false);
 assert.equal(r.cleanupAuthorized,false);
 db.close();
});
test('recognized deleted tombstone still detects a PASEKA01 rollback_video copy',async()=>{
 const db=await setup({ledger:ledger('deleted'),staging:[{
  id:'rb:video:v1',sessionId:'rb',kind:'rollback_video',
  originalId:'v1',record:live('v1')
 }]});
 const r=await audit(db,guard);
 assert.equal(r.copyCount,1);
 assert.ok(r.issues.includes('deleted_tombstone_has_copy'));
 assert.ok(r.issues.includes('recognized_original_still_present'));
 assert.equal(r.cleanupAuthorized,false);
 db.close();
});
test('legacy rollback with missing original Blob is incomplete, not a safe empty copy',async()=>{
 const db=await setup({staging:[{
  id:'rb:video:v1',sessionId:'rb',kind:'rollback_video',
  originalId:'v1',record:{id:'v1',blobSha256:digest}
 }]});
 const r=await audit(db,guard);
 assert.ok(r.issues.includes('rollback_video_unknown'));
 assert.equal(r.cleanupAuthorized,false);
 db.close();
});
test('v2 rollback beforeState and afterState with journal payload are counted',async()=>{
 const historical={meta:{schemaVersion:15,revisionId:'reverted'},records:[{
  id:'historical',media:[{kind:'video',videoId:'vrec',
   data:'data:video/mp4;base64,YWJj',sourceSha256:digest,sourceBytes:3}]
 }]};
 const db=await setup({backups:[['v2entrance:backup',{
  kind:'v2_entrance_only_rollback_unverified',
  beforeState:historical,afterState:historical
 }]]});
 const r=await audit(db,guard);
 assert.equal(r.copyCount,2);
 assert.ok(r.copies.some(c=>c.store==='full_backup.beforeState'));
 assert.ok(r.copies.some(c=>c.store==='full_backup.afterState'));
 assert.equal(r.cleanupAuthorized,false);
 db.close();
});

test('real legacy journal-capture shape without videoId remains counted and unmatchable',async()=>{
 // The current index.html recordForm stores {kind,type,name,data} without
 // sourceSha256/videoId: inventory must not mistake this for zero originals.
 const db=await setup({state:{meta:{schemaVersion:15,revisionId:'r1'},
  records:[{id:'observation',media:[{
   kind:'video',name:'field.mp4',type:'video/mp4',
   data:'data:video/mp4;base64,YWJj'
  }]}]}});
 const report=await audit(db,guard);
 assert.equal(report.copyCount,1);
 assert.equal(report.distinctIdentities,0);
 assert.equal(report.copies[0].identity,null);
 assert.equal(report.copies[0].store,'main/state.records.media');
 assert.ok(report.issues.includes('unidentified_copy'));
 assert.equal(report.cleanupAuthorized,false);
 assert.equal(JSON.stringify(report).includes('YWJj'),false);
 db.close();
});
test('unidentified entrance original remains counted even without matching ledger identity',async()=>{
 const db=await setup({entrance:[{id:'v2-without-trustworthy-id',blob:blob()}]});
 const result=await audit(db,guard);
 assert.equal(result.copyCount,1);
 assert.ok(result.issues.includes('copy_evidence_missing'));
 assert.equal(result.cleanupAuthorized,false);
 db.close();
});


test('renamed recognized original is reported as a possible SHA alias, never authorized',async()=>{
 const db=await setup({ledger:ledger('deleted'),entrance:[live('renamed-original')]});
 const r=await audit(db,guard);
 assert.equal(r.copyCount,1);
 assert.ok(r.issues.includes('possible_recognized_original_hash_alias'));
 assert.ok(r.issues.includes('possible_deleted_tombstone_hash_alias'));
 assert.equal(r.issues.includes('recognized_original_still_present'),false);
 assert.equal(r.cleanupAuthorized,false);
 assert.equal(r.byteIntegrityVerified,false);
 db.close();
});
test('SHA alias across separate journal and entrance sources is still suspicious',async()=>{
 const db=await setup({ledger:ledger('deleted'),state:{
  meta:{schemaVersion:15,revisionId:'r1'},
  records:[{id:'visit',media:[{kind:'video',videoId:'other-journal-id',
   data:'data:video/mp4;base64,YWJj',sourceSha256:digest,sourceBytes:3}]}]
 }});
 const r=await audit(db,guard);
 assert.equal(r.copyCount,1);
 assert.equal(r.copies[0].source,'record_media');
 assert.ok(r.issues.includes('possible_deleted_tombstone_hash_alias'));
 assert.equal(r.externalCopiesVerified,false);
 db.close();
});
test('independent evidence with same hash but different size is not called an alias',async()=>{
 const db=await setup({ledger:ledger('deleted'),entrance:[{
  id:'distinct-size',blob:blob('abcd'),blobSha256:digest,bytes:4,mimeType:'video/mp4'
 }]});
 const r=await audit(db,guard);
 assert.equal(r.issues.includes('possible_recognized_original_hash_alias'),false);
 assert.equal(r.cleanupAuthorized,false);
 db.close();
});
test('matching original identity is not falsely classified as a renamed alias',async()=>{
 const db=await setup({ledger:ledger('deleted'),entrance:[live('v1')]});
 const r=await audit(db,guard);
 assert.ok(r.issues.includes('recognized_original_still_present'));
 assert.ok(r.issues.includes('deleted_tombstone_has_copy'));
 assert.equal(r.issues.includes('possible_recognized_original_hash_alias'),false);
 assert.equal(r.cleanupAuthorized,false);
 db.close();
});
test('invalid recognition ledger cannot be used as trusted SHA-alias evidence',async()=>{
 const db=await setup({ledger:{version:1,entries:[{bad:true}]},entrance:[live('alias')]});
 const r=await audit(db,guard);
 assert.ok(r.issues.includes('ledger_invalid'));
 assert.equal(r.issues.includes('possible_recognized_original_hash_alias'),false);
 assert.equal(r.auditComplete,false);
 assert.equal(r.cleanupAuthorized,false);
 db.close();
});
test('SHA alias from protected backup is visible without releasing protected bytes',async()=>{
 const db=await setup({ledger:ledger('deleted'),backups:[['v2entrance:one',{
  kind:'v2_entrance_quarantine_rollback_snapshot',
  quarantinedMedia:[live('renamed-backup')]}]]});
 const r=await audit(db,guard);
 assert.ok(r.issues.includes('possible_recognized_original_hash_alias'));
 assert.equal(r.copies[0].store,'full_backup.quarantinedMedia');
 assert.equal(JSON.stringify(r).includes('abc'),false);
 assert.equal(r.cleanupAuthorized,false);
 db.close();
});

test('same video identity with contradictory SHA across app and protected staging flags conflict without writing',async()=>{
 const different='b'.repeat(64);
 const db=await setup({entrance:[live('same')],staging:[{
  ...staged('same'),sourceSha256:different
 }]});
 const report=await audit(db,guard);
 assert.equal(report.copyCount,2);
 assert.equal(report.distinctIdentities,1);
 assert.ok(report.issues.includes('conflicting_copy_evidence'));
 assert.equal(report.cleanupAuthorized,false);
 assert.equal(report.archiveSafe,false);
 assert.equal(report.restoreAuthorized,false);
 assert.equal(report.dataModified,false);
 const recheck=await audit(db,guard);
 assert.deepEqual(recheck.issues,report.issues);
 db.close();
});
test('matching cross-store evidence does not create a false conflict',async()=>{
 const db=await setup({entrance:[live('same')],staging:[staged('same')]});
 const report=await audit(db,guard);
 assert.equal(report.copyCount,2);
 assert.equal(report.issues.includes('conflicting_copy_evidence'),false);
 assert.equal(report.cleanupAuthorized,false);
 db.close();
});
test('same video identity with contradictory byte count flags conflict without deleting copies',async()=>{
 const db=await setup({entrance:[live('same')],staging:[{
  ...staged('same'),sourceBytes:4,blob:blob('abcd')
 }]});
 const report=await audit(db,guard);
 assert.ok(report.issues.includes('conflicting_copy_evidence'));
 assert.equal(report.copies.length,2);
 assert.equal(report.dataModified,false);
 assert.equal(report.cleanupAuthorized,false);
 db.close();
});

test('two conflicting SHA fields on one live entrance record are not silently reconciled',async()=>{
 const db=await setup({entrance:[{...live('v1'),sourceSha256:'b'.repeat(64)}]});
 const report=await audit(db,guard);
 assert.ok(report.issues.includes('conflicting_source_metadata'));
 assert.equal(report.cleanupAuthorized,false);
 assert.equal(report.dataModified,false);
 db.close();
});
test('two conflicting byte lengths on one live entrance record are not silently reconciled',async()=>{
 const db=await setup({entrance:[{...live('v1'),sourceBytes:4}]});
 const report=await audit(db,guard);
 assert.ok(report.issues.includes('conflicting_source_metadata'));
 assert.equal(report.cleanupAuthorized,false);
 assert.equal(report.dataModified,false);
 db.close();
});
test('recognition source SHA mismatch is reported without trusting recognized flag',async()=>{
 const db=await setup({ledger:ledger('deleted'),entrance:[{...live('v1'),blobSha256:'b'.repeat(64)}]});
 const report=await audit(db,guard);
 assert.ok(report.issues.includes('recognition_source_evidence_conflict'));
 assert.ok(report.issues.includes('deleted_tombstone_has_copy'));
 assert.equal(report.cleanupAuthorized,false);
 assert.equal(report.restoreAuthorized,false);
 db.close();
});
test('recognition source byte mismatch is reported with no false mismatch for matching evidence',async()=>{
 const db=await setup({ledger:ledger('deleted'),entrance:[{...live('v1'),bytes:4,blob:blob('abcd')}]});
 const report=await audit(db,guard);
 assert.ok(report.issues.includes('recognition_source_evidence_conflict'));
 assert.equal(report.cleanupAuthorized,false);
 db.close();
 const matching=await setup({ledger:ledger('deleted'),entrance:[live('v1')]});
 const correct=await audit(matching,guard);
 assert.equal(correct.issues.includes('recognition_source_evidence_conflict'),false);
 assert.equal(correct.cleanupAuthorized,false);
 matching.close();
});

test('valid preferred SHA cannot conceal a malformed legacy SHA field',async()=>{
 const db=await setup({entrance:[{...live('v1'),sourceSha256:'untrusted-invalid-hash'}]});
 const report=await audit(db,guard);
 assert.ok(report.issues.includes('invalid_copy_evidence'));
 assert.equal(report.cleanupAuthorized,false);
 assert.equal(report.dataModified,false);
 db.close();
});
test('valid preferred bytes cannot conceal a malformed alternate byte field',async()=>{
 const db=await setup({entrance:[{...live('v1'),sourceBytes:0}]});
 const report=await audit(db,guard);
 assert.ok(report.issues.includes('invalid_copy_evidence'));
 assert.equal(report.cleanupAuthorized,false);
 assert.equal(report.dataModified,false);
 db.close();
});

test('journal video marker with videoId but missing data is not interpreted as deletion',async()=>{
 const db=await setup({state:{meta:{schemaVersion:15,revisionId:'r1'},
  records:[{id:'visit',media:[{kind:'video',videoId:'journal-pending',sourceSha256:digest,sourceBytes:3}]}]}});
 const report=await audit(db,guard);
 assert.ok(report.issues.includes('record_video_payload_missing'));
 assert.equal(report.cleanupAuthorized,false);
 assert.equal(report.archiveSafe,false);
 assert.equal(report.dataModified,false);
 db.close();
});
test('journal video marker with neither source identifier nor payload is detected',async()=>{
 const db=await setup({state:{meta:{schemaVersion:15,revisionId:'r1'},
  records:[{id:'visit',media:[{kind:'video'}]}]}});
 const report=await audit(db,guard);
 assert.ok(report.issues.includes('record_video_payload_missing'));
 assert.ok(report.issues.includes('record_video_id_missing'));
 assert.equal(report.cleanupAuthorized,false);
 db.close();
});
test('duplicated journal video identity across two records cannot appear unambiguous',async()=>{
 const media={kind:'video',videoId:'same',sourceSha256:digest,sourceBytes:3,
  data:'data:video/mp4;base64,YWJj'};
 const db=await setup({state:{meta:{schemaVersion:15,revisionId:'r1'},
  records:[{id:'visit1',media:[media]},{id:'visit2',media:[media]}]}});
 const report=await audit(db,guard);
 assert.equal(report.copyCount,2);
 assert.equal(report.distinctIdentities,1);
 assert.ok(report.issues.includes('duplicate_copy_location_identity'));
 assert.equal(report.cleanupAuthorized,false);
 assert.equal(JSON.stringify(report).includes('YWJj'),false);
 db.close();
});
test('same original in two different protected stores is not mistaken for same-location duplicate',async()=>{
 const db=await setup({entrance:[live('shared')],staging:[staged('shared')]});
 const report=await audit(db,guard);
 assert.equal(report.copyCount,2);
 assert.equal(report.issues.includes('duplicate_copy_location_identity'),false);
 assert.equal(report.cleanupAuthorized,false);
 db.close();
});

test('legacy rollback originalId different from embedded record.id is explicitly ambiguous',async()=>{
 const db=await setup({staging:[{id:'rollback:video:original',kind:'rollback_video',
  sessionId:'rollback',originalId:'original',record:live('other')}]});
 const report=await audit(db,guard);
 assert.ok(report.issues.includes('rollback_original_identity_conflict'));
 assert.ok(report.issues.includes('legacy_rollback_requires_review'));
 assert.equal(report.cleanupAuthorized,false);
 assert.equal(report.restoreAuthorized,false);
 db.close();
});
test('legacy rollback with conflicting embedded SHA and size fields is flagged',async()=>{
 const record={...live('old'),sourceSha256:'b'.repeat(64),sourceBytes:4};
 const db=await setup({staging:[{id:'rollback:video:old',kind:'rollback_video',
  sessionId:'rollback',originalId:'old',record}]});
 const report=await audit(db,guard);
 assert.ok(report.issues.includes('conflicting_source_metadata'));
 assert.equal(report.cleanupAuthorized,false);
 assert.equal(report.dataModified,false);
 db.close();
});
test('consistent rollback originalId and record id adds no false identity conflict',async()=>{
 const db=await setup({staging:[{id:'rollback:video:old',kind:'rollback_video',
  sessionId:'rollback',originalId:'old',record:live('old')}]});
 const report=await audit(db,guard);
 assert.equal(report.issues.includes('rollback_original_identity_conflict'),false);
 assert.equal(report.cleanupAuthorized,false);
 db.close();
});

test('compound interrupted archive snapshot reports every conflict but never authorizes cleanup',async()=>{
 const db=await setup({ledger:ledger('deleted'),
  entrance:[{...live('v1'),sourceSha256:'b'.repeat(64)}],
  staging:[{...staged('v1'),sourceSha256:'c'.repeat(64)},{
    id:'rb:video:v1',kind:'rollback_video',sessionId:'rb',originalId:'v1',
    record:live('renamed')}],
  backups:[['v2entrance:b',{kind:'v2_entrance_quarantine_rollback_snapshot',
    beforeState:{meta:{revisionId:'before'},records:[]},
    afterState:{meta:{revisionId:'after'},records:[]},
    quarantinedMedia:[live('v1')]}]]});
 const report=await audit(db,guard);
 for(const issue of ['conflicting_source_metadata','conflicting_copy_evidence',
  'recognition_source_evidence_conflict','rollback_original_identity_conflict',
  'deleted_tombstone_has_copy','external_android_copies_not_audited']){
  assert.ok(report.issues.includes(issue),issue);
 }
 assert.equal(report.copyCount,4);
 assert.equal(report.cleanupAuthorized,false);
 assert.equal(report.archiveSafe,false);
 assert.equal(report.restoreAuthorized,false);
 assert.equal(report.dataModified,false);
 db.close();
});
test('pending stage original survives read-only audit if main entrance copy is absent',async()=>{
 const db=await setup({staging:[staged('orphan-pending')]});
 const first=await audit(db,guard);
 const second=await audit(db,guard);
 assert.equal(first.copyCount,1);
 assert.equal(first.copies[0].store,'archive_staging');
 assert.deepEqual(second.copies,first.copies);
 assert.equal(first.cleanupAuthorized,false);
 assert.equal(first.dataModified,false);
 db.close();
});
test('same videoId in journal and entrance source remains two distinct identities',async()=>{
 const db=await setup({entrance:[live('shared')],
  state:{meta:{schemaVersion:15,revisionId:'r1'},
   records:[{id:'visit',media:[{kind:'video',videoId:'shared',
    sourceSha256:'b'.repeat(64),sourceBytes:3,
    data:'data:video/mp4;base64,YWJj'}]}]}});
 const report=await audit(db,guard);
 assert.equal(report.copyCount,2);
 assert.equal(report.distinctIdentities,2);
 assert.equal(report.issues.includes('conflicting_copy_evidence'),false);
 assert.equal(report.issues.includes('duplicate_copy_location_identity'),false);
 assert.equal(report.cleanupAuthorized,false);
 db.close();
});
