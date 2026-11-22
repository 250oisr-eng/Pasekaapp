import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/video-archive-v2-guard.js', import.meta.url), 'utf8');
const root = {};
new Function('window', source)(root);
const api = root.PasekaVideoArchiveV2Guard;
const hash = 'a'.repeat(64);
const recognized = (overrides = {}) => ({
 source:'entrance_media', videoId:'v1', resultId:'result1',
 cleanupState:'deleted', sourceSha256:hash, sourceBytes:3,
 sourceEvidenceVersion:1, recognizedAt:'2026-11-20T00:00:00Z',
 stateRevisionId:'rev-before-recognition',sourceHashVerifiedAt:'2026-11-20T00:00:00Z',
 result:{label:'облёт'}, ...overrides
});
const ledger = entries => ({version:1,entries});
const payload = (overrides = {}) => ({source:'entrance_media',videoId:'v2',sourceSha256:hash,sourceBytes:3,...overrides});
const rejects = (run, code) => assert.throws(run, error => error.code === code);

test('candidate v2 guard permits pending video metadata but never grants archiveSafe', () => {
 assert.deepEqual(api.checkCandidateVideoPayloads(ledger([recognized()]), [payload()]),
 {ok:true,inspectedPayloads:1,recognitionEntries:1,tombstones:1,archiveSafe:false});
});

test('recognized original cannot appear as v2 video payload in any cleanup state', () => {
 for (const cleanupState of ['deleted','delete_required','blocked_archive_safety']) {
  rejects(() => api.checkCandidateVideoPayloads(ledger([recognized({cleanupState})]),[
   payload({videoId:'v1'})]),'V2_RECOGNIZED_ORIGINAL_INCLUDED');
 }
});

test('same videoId in separate source must be separately identified', () => {
 const result=api.checkCandidateVideoPayloads(ledger([recognized()]),
 [payload({source:'record_media',videoId:'v1'})]);
 assert.equal(result.inspectedPayloads,1);
});

test('duplicate identities, result IDs and payload entries rejected', () => {
 rejects(()=>api.validateRecognitionLedgerForV2(ledger([recognized(),recognized({resultId:'other'})])),'V2_LEDGER_DUPLICATE');
 rejects(()=>api.validateRecognitionLedgerForV2(ledger([recognized(),recognized({videoId:'v3'})])),'V2_LEDGER_DUPLICATE');
 rejects(()=>api.checkCandidateVideoPayloads(ledger([]),[payload(),payload()]),'V2_PAYLOAD_DUPLICATE');
});

test('bad hash, missing evidence and invalid state fail closed', () => {
 rejects(()=>api.validateRecognitionLedgerForV2(ledger([recognized({sourceSha256:'?'})])),'V2_LEDGER_ENTRY_INVALID');
 rejects(()=>api.validateRecognitionLedgerForV2(ledger([recognized({sourceEvidenceVersion:undefined})])),'V2_LEDGER_ENTRY_INVALID');
 rejects(()=>api.validateRecognitionLedgerForV2({version:88,entries:[]}), 'V2_LEDGER_INVALID');
 rejects(()=>api.checkCandidateVideoPayloads(ledger([]),null),'V2_PAYLOAD_SET_MISSING');
 rejects(()=>api.checkCandidateVideoPayloads(ledger([]),[payload({sourceBytes:-3})]),'V2_PAYLOAD_INVALID');
});

test('video binary in recognition result rejected and images not counted as video payload', () => {
 rejects(()=>api.validateRecognitionLedgerForV2(ledger([recognized({result:{media:'data:video/mp4;base64,AA=='}})])),'V2_RESULT_BINARY');
 rejects(()=>api.validateRecognitionLedgerForV2(ledger([recognized({result:{diagnosis:{original:'blob'}}})])),'V2_RESULT_BINARY');
 const x=api.checkCandidateVideoPayloads(ledger([recognized({result:{notes:['леток','осмотр']}})]),[]);
 assert.equal(x.archiveSafe,false);
});

test('large structured result and recursive objects cannot bypass validation', () => {
 rejects(()=>api.validateRecognitionLedgerForV2(ledger([recognized({result:{notes:'x'.repeat(17000)}})])),'V2_RESULT_TOO_LARGE');
 const cyc={};cyc.child=cyc;
 rejects(()=>api.validateRecognitionLedgerForV2(ledger([recognized({result:cyc})])),'V2_RESULT_INVALID');
});

test('opaque recognition payload objects and unknown entry fields fail closed',()=>{
 rejects(()=>api.validateRecognitionLedgerForV2(ledger([recognized({result:{opaque:new Blob(['video'],{type:'video/mp4'})}})])),'V2_RESULT_INVALID');
 rejects(()=>api.validateRecognitionLedgerForV2(ledger([recognized({unexpectedField:new Blob(['bytes'])})])),'V2_LEDGER_ENTRY_INVALID');
 rejects(()=>api.validateRecognitionLedgerForV2({...ledger([recognized()]),unverifiedMetadata:{}}),'V2_LEDGER_INVALID');
});
