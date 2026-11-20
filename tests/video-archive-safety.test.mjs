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
