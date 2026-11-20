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
