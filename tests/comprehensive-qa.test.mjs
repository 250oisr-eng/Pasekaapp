import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {validateQAMatrix,parseTapSummary,buildQAReport} from '../scripts/comprehensive-qa.mjs';

const matrix=JSON.parse(readFileSync(new URL('../qa/comprehensive-matrix.json',import.meta.url),'utf8'));
const root=new URL('../tests/',import.meta.url);
const discovered=readdirSync(root).filter(name=>name.endsWith('.test.mjs'))
  .map(name=>'tests/'+name);
const tap=(overrides={})=>Object.entries({tests:2,pass:2,fail:0,cancelled:0,skipped:0,todo:0,...overrides})
  .map(([key,value])=>'# '+key+' '+value).join('\n');

test('comprehensive QA accounts for every full-suite test file exactly once',()=>{
 const inventory=validateQAMatrix(matrix,discovered);
 assert.equal(inventory.testFileCount,discovered.length);
 assert.ok(inventory.laneCount>=8);
 assert.ok(inventory.externalGateCount>=4);
});
test('unlisted tests and duplicated lane assignments fail closed',()=>{
 const missing=structuredClone(matrix);
 missing.lanes[0].files.pop();
 assert.throws(()=>validateQAMatrix(missing,discovered),/all executable tests/);
 const duplicate=structuredClone(matrix);
 duplicate.lanes[1].files.push(duplicate.lanes[0].files[0]);
 assert.throws(()=>validateQAMatrix(duplicate,discovered),/assigned twice/);
 const unsafe=structuredClone(matrix);
 unsafe.lanes[1].files[0]='../private/real-user-data.json';
 assert.throws(()=>validateQAMatrix(unsafe,discovered),/unsafe or unrecognized/);
});
test('physical device evidence cannot become PASS by changing a CI matrix label',()=>{
 const untrusted=structuredClone(matrix);
 untrusted.externalGates[0].status='PASS';
 assert.throws(()=>validateQAMatrix(untrusted,discovered),/must never claim physical PASS/);
 const noRelease=structuredClone(matrix);
 noRelease.releaseDecision='RELEASE_APPROVED';
 assert.throws(()=>validateQAMatrix(noRelease,discovered));
});
test('TAP verifier accepts only complete non-skipped suites',()=>{
 assert.deepEqual(parseTapSummary(tap()),{
  status:'PASS_SYNTHETIC',tests:2,pass:2,fail:0,cancelled:0,skipped:0,todo:0
 });
 assert.equal(parseTapSummary(tap({pass:1,fail:1})).status,'FAIL');
 assert.equal(parseTapSummary(tap({pass:1,skipped:1})).status,'PARTIAL');
 assert.equal(parseTapSummary(tap({pass:1,cancelled:1})).status,'PARTIAL');
 assert.equal(parseTapSummary(tap({pass:1,todo:1})).status,'PARTIAL');
 assert.equal(parseTapSummary('').status,'NOT_TESTED');
 assert.equal(parseTapSummary('# tests 2\n# pass 2').status,'NOT_VERIFIED');
 assert.equal(parseTapSummary(tap({tests:3})).status,'NOT_VERIFIED');
});
test('synthetic CI pass never constitutes backup, video deletion, OnePlus or release proof',()=>{
 const report=buildQAReport({matrix,discovered,tap:tap(),
   sha:'a'.repeat(40),packageTestScript:'node --test tests/*.test.mjs'});
 assert.equal(report.sourceSha,'a'.repeat(40));
 assert.equal(report.suite.status,'PASS_SYNTHETIC');
 assert.ok(report.laneResults.every(l=>l.status==='COVERED_BY_PASSING_FULL_SYNTHETIC_SUITE'));
 assert.equal(report.physicalDeviceVerified,false);
 assert.equal(report.realOriginalBackupVerified,false);
 assert.equal(report.videoDeletionAuthorized,false);
 assert.equal(report.releaseAuthorized,false);
 assert.equal(report.approvalRequiredForMerge,true);
 assert.ok(report.externalGates.every(g=>g.status!=='PASS'));
});
test('runner cannot infer evidence without exact full npm test command or a valid SHA',()=>{
 assert.throws(()=>buildQAReport({matrix,discovered,tap:tap(),
  packageTestScript:'echo skipped',sha:'a'.repeat(40)}),/exact full-test command/);
 const report=buildQAReport({matrix,discovered,tap:'',
   packageTestScript:'node --test tests/*.test.mjs',sha:'not-a-sha'});
 assert.equal(report.sourceSha,null);
 assert.equal(report.suite.status,'NOT_TESTED');
 assert.ok(report.laneResults.every(l=>l.status==='NOT_VERIFIED_SEPARATELY'));
});
