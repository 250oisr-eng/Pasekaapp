import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const script=await readFile(new URL('../js/video-archive-safety.js',import.meta.url),'utf8');
const root={};new Function('window',script)(root);
const safety=root.PasekaVideoArchiveSafety;
const deleted={videoId:'v1',source:'entrance_media',resultId:'analysis-1',cleanupState:'deleted'};
const local={version:1,entries:[deleted]};
const state={records:[{id:'r1',media:[{kind:'image',data:'photo'}]}],families:[{id:'f1'}]};
const verified={archiveCarriesLedger:true,incomingLedger:{version:1,entries:[{...deleted}]}};
test('legacy JSON or old .paseka without recognition ledger is blocked when local history exists',()=>{
 const r=safety.inspectRestoreRisk(local,state,[],{});
 assert.equal(r.ok,false);
 assert.equal(r.reason,'archive_does_not_preserve_recognition_ledger');
 assert.equal(safety.inspectExportRisk(local,false).reason,'recognition_history_not_in_archive');
});
test('deleted entrance original in an incoming archive cannot reappear',()=>{
 const out=safety.inspectRestoreRisk(local,state,[{id:'v1',blob:'simulated'}],verified);
 assert.equal(out.ok,false);
 assert.equal(out.reason,'deleted_original_would_reappear');
});
test('deleted journal attachment cannot reappear either',()=>{
 const journal={videoId:'j1',source:'record_media',resultId:'jr1',cleanupState:'deleted'};
 const ledger={version:1,entries:[journal]};
 const incoming={...state,records:[{id:'r1',media:[{kind:'video',videoId:'j1',data:'data:video/mp4;base64,AAAA'}]}]};
 const out=safety.inspectRestoreRisk(ledger,incoming,[],{archiveCarriesLedger:true,incomingLedger:ledger});
 assert.equal(out.reason,'deleted_original_would_reappear');
});
test('old recognition result and tombstone must survive restore unchanged',()=>{
 const lost=safety.inspectRestoreRisk(local,state,[],{archiveCarriesLedger:true,incomingLedger:{version:1,entries:[]}});
 assert.equal(lost.reason,'recognition_history_would_be_lost');
 const regressed=safety.inspectRestoreRisk(local,state,[],{archiveCarriesLedger:true,incomingLedger:{version:1,entries:[{...deleted,cleanupState:'delete_required'}]}});
 assert.equal(regressed.reason,'cleanup_tombstone_would_be_lost');
});
test('valid compatible archive preserves recognized history and unrelated state',()=>{
 const frozen=structuredClone(state);
 const out=safety.inspectRestoreRisk(local,state,[{id:'another'}],verified);
 assert.equal(out.ok,true);
 assert.equal(out.scannedOriginals,1);
 assert.deepEqual(state,frozen);
 assert.equal(safety.inspectExportRisk(local,true).ok,true);
});
test('old unidentified videos block safety assertion and must remain untouched',()=>{
 const old={...state,records:[{id:'legacy',media:[{kind:'video',data:'data:video/mp4;base64,AAAA'}]}]};
 assert.equal(safety.inspectRestoreRisk(local,old,[],verified).reason,'legacy_video_identity_unknown');
 assert.equal(old.records[0].media[0].data,'data:video/mp4;base64,AAAA');
});
test('corrupted identity, invalid media and duplicated incoming ledger fail closed',()=>{
 assert.equal(safety.inspectRestoreRisk({version:2,entries:[]},state,[],verified).ok,false);
 assert.equal(safety.inspectRestoreRisk(local,state,[{blob:'missing id'}],verified).ok,false);
 assert.equal(safety.inspectRestoreRisk(local,state,[],{archiveCarriesLedger:true,incomingLedger:{version:1,entries:[deleted,deleted]}}).reason,'duplicate_incoming_ledger_identity');
});

import {indexedDB as factory} from 'fake-indexeddb';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
async function fixture(ledgerValue){
 const request=factory.open('video-archive-preflight-'+Math.random(),1);
 const db=await new Promise((resolve,reject)=>{
  request.onupgradeneeded=()=>request.result.createObjectStore('main');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
 if(ledgerValue!==undefined)await new Promise((resolve,reject)=>{
  const tx=db.transaction('main','readwrite');
  tx.objectStore('main').put(ledgerValue,'video_recognition_ledger_v1');
  tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
 });
 return db;
}
test('legacy JSON and automatic restore call safety check before confirmation or mutation',()=>{
 assert.match(html,/<script src="\.\/js\/video-archive-safety\.js"><\/script>/);
 for(const functionName of ['restoreBackup','restoreAutoBackup']){
  const begin=html.indexOf('async function '+functionName+'(){');
  assert.ok(begin>=0);
  const body=html.slice(begin,html.indexOf('\n}',begin));
  const testAt=body.indexOf('await PasekaVideoArchiveSafety.assertLegacyRestoreSafe(db)');
  assert.ok(testAt>=0);
  assert.ok(testAt<body.indexOf('if(!confirm('));
  assert.ok(testAt<body.indexOf('S=restored'));
 }
});
test('legacy restore stays available for an old database without recognition results',async()=>{
 const db=await fixture(undefined);
 assert.equal(await safety.assertLegacyRestoreSafe(db),true);db.close();
});
test('legacy restore rejects recognition history to avoid irreversible loss',async()=>{
 const db=await fixture(local);
 await assert.rejects(safety.assertLegacyRestoreSafe(db),/VIDEO_RECOGNITION_HISTORY_RESTORE_BLOCKED/);
 db.close();
});
test('corrupt local ledger blocks legacy restore rather than resetting history',async()=>{
 const db=await fixture({version:1,entries:[{corrupt:'data'}]});
 await assert.rejects(safety.assertLegacyRestoreSafe(db),/VIDEO_LEDGER_CORRUPT_RESTORE_BLOCKED/);
 db.close();
});

test('atomic restore implementation has in-transaction video ledger check and safe legacy default',()=>{
 const start=html.indexOf('function writeMainWithBackup(');
 const body=html.slice(start,html.indexOf('function writeAutoBackup(',start));
 assert.match(body,/videoLedgerRequest=requireEmptyVideoRecognitionLedger\?mainStore\.get\('video_recognition_ledger_v1'\):null/);
 assert.match(body,/requireEmptyVideoRecognitionLedger&&!videoLedgerReady/);
 assert.match(body,/videoLedger\.entries\.length>0/);
 assert.match(html,/writeMainWithBackup\(S,current\?\.meta\?\.revisionId\|\|null,true\)/);
});
test('real writeMainWithBackup aborts atomically if recognition exists after UI preflight',async()=>{
 const name='video-archive-atomic-'+Math.random();
 const req=factory.open(name,1);
 const db=await new Promise((resolve,reject)=>{
  req.onupgradeneeded=()=>{req.result.createObjectStore('main');req.result.createObjectStore('full_backup')};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
 const initial={meta:{revisionId:'original'},records:[],hives:[]};
 await new Promise((resolve,reject)=>{
  const tx=db.transaction('main','readwrite');
  tx.objectStore('main').put(initial,'state');
  tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
 });
 assert.equal(await safety.assertLegacyRestoreSafe(db),true);
 // Recognition committed from a different task after preview but before restore commit.
 await new Promise((resolve,reject)=>{
  const tx=db.transaction('main','readwrite');
  tx.objectStore('main').put(local,'video_recognition_ledger_v1');
  tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
 });
 const start=html.indexOf('function writeMainWithBackup(');
 const source=html.slice(start,html.indexOf('function writeAutoBackup(',start));
 const write=new Function('db','STORE','BACKUP_STORE','window','assertBackupNotFromNewerSchema',
  source+'; return writeMainWithBackup;')(db,'main','full_backup',{PasekaVideoArchiveSafety:safety},()=>{});
 await assert.rejects(write({meta:{revisionId:'replacement'},records:[],hives:[]},'original',true),/История распознавания изменилась/);
 const current=await new Promise((resolve,reject)=>{
  const tx=db.transaction('main','readonly'),read=tx.objectStore('main').get('state');
  read.onsuccess=()=>resolve(read.result);read.onerror=()=>reject(read.error);
 });
 assert.deepEqual(current,initial);
 const backup=await new Promise((resolve,reject)=>{
  const tx=db.transaction('full_backup','readonly'),read=tx.objectStore('full_backup').get('previous');
  read.onsuccess=()=>resolve(read.result);read.onerror=()=>reject(read.error);
 });
 assert.equal(backup,undefined);
 db.close();
});
