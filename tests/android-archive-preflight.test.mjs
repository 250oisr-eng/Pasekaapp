import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root={};
const source=await readFile(new URL('../js/android-archive-preflight.js', import.meta.url),'utf8');
new Function('window',source)(root);
const inspect=root.PasekaAndroidArchivePreflight.inspect;
const entry=(id='video1',resultId='result1')=>({
 source:'entrance_media',videoId:id,resultId,
 sourceSha256:'a'.repeat(64),sourceBytes:25,
 sourceEvidenceVersion:1,recognizedAt:'2026-11-22T00:00:00Z',
 result:{note:'synthetic metadata only'}
});
const denied=report=>{
 for(const key of ['cleanupAuthorized','restoreAuthorized','archiveSafe',
 'physicalRestoreVerified','byteIntegrityVerified'])assert.equal(report[key],false);
};
test('synthetic well-formed metadata never authorizes cleanup or restore',()=>{
 const record=entry();
 const original=JSON.stringify(record);
 const report=inspect([record]);
 assert.equal(report.ok,true);
 assert.deepEqual(report.issues,[]);
 denied(report);
 assert.equal(JSON.stringify(record),original);
 assert.equal(Object.isFrozen(report),true);
});
test('invalid/missing sources fail closed',()=>{
 for(const input of [null,{},[{}],[{...entry(),sourceBytes:0}],
  [{...entry(),sourceSha256:'unknown'}]]) {
  const report=inspect(input);
  assert.equal(report.ok,false);assert.equal(report.requiresManualReview,true);
  denied(report);
 }
});
test('copy SHA and length conflicts fail closed without selecting preferred copy',()=>{
 const a=entry();
 const b={...entry(),sourceSha256:'b'.repeat(64),sourceBytes:27,
  resultId:'result2'};
 const before=JSON.stringify([a,b]);
 const report=inspect([a,b]);
 assert.equal(report.ok,false);
 assert.ok(report.issues.includes('SOURCE_COPY_CONFLICT'));
 assert.ok(report.issues.includes('SOURCE_IDENTITY_DUPLICATE'));
 denied(report);
 assert.equal(JSON.stringify([a,b]),before);
});
test('duplicated result IDs across different videos fail closed',()=>{
 const report=inspect([entry('video1','same'),entry('video2','same')]);
 assert.equal(report.ok,false);
 assert.ok(report.issues.includes('RESULT_ID_DUPLICATE'));
 denied(report);
});
test('missing source-bound recognition fields fail closed',()=>{
 for(const change of [
  {sourceEvidenceVersion:null},{recognizedAt:'invalid-date'},
  {result:null},{resultId:' '},{sourceBytes:-1}
 ]) {
  const report=inspect([{...entry(),...change}]);
  assert.equal(report.ok,false);
  denied(report);
 }
});
test('preflight module contains no persistence or media side effects',()=>{
 for(const pattern of [
  /\bindexedDB\b/i,/\bfetch\s*\(/,/\bXMLHttpRequest\b/,
  /\.delete\s*\(/,/\bremoveItem\s*\(/,/\bgetUserMedia\b/,
  /\bMediaStore\b/,/\bFileReader\b/
 ])assert.doesNotMatch(source,pattern);
});
