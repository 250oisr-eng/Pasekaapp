import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateTrackedDrafts,assessExactChecks,auditTrackedDrafts}
 from '../scripts/comprehensive-pr-checks.mjs';

const spec=JSON.parse(readFileSync(new URL('../qa/tracked-drafts.json',import.meta.url),'utf8'));
const SHA='a'.repeat(40);
const run=(name,opts={})=>({name,head_sha:SHA,status:'completed',conclusion:'success',...opts});

test('read-only QA tracks distinct existing Draft numbers without merge or release permissions',()=>{
 assert.equal(validateTrackedDrafts(spec),true);
 assert.equal(spec.phoneActionsRequiredNow,0);
 assert.ok(spec.targetPulls.some(x=>x.number===512));
 assert.ok(spec.targetPulls.some(x=>x.number===524));
 assert.ok(spec.targetPulls.some(x=>x.number===530));
});
test('only checks belonging to exact head SHA may establish code-only CI pass',()=>{
 const wanted=['build','governance'];
 const done=assessExactChecks([run('build'),run('governance')],wanted,SHA);
 assert.equal(done.status,'EXACT_SHA_CI_SUCCESS_ONLY');
 assert.equal(assessExactChecks([run('build',{head_sha:'b'.repeat(40)}),
  run('governance')],wanted,SHA).status,'FAILED_OR_UNVERIFIED');
 assert.equal(assessExactChecks([run('build',{status:'in_progress',conclusion:null}),
  run('governance')],wanted,SHA).status,'REVIEW_REQUIRED');
 assert.equal(assessExactChecks([run('build',{conclusion:'failure'}),
  run('governance')],wanted,SHA).status,'FAILED_OR_UNVERIFIED');
 assert.equal(assessExactChecks([run('build')],wanted,SHA).status,'REVIEW_REQUIRED');
 assert.equal(assessExactChecks([],wanted,'missing').status,'NOT_VERIFIED');
});
test('full read-only Draft audit cannot turn CI PASS into merge, recovery or device proof',async()=>{
 const fetcher=async path=>{
  if(path.startsWith('/pulls/')){
   const number=Number(path.split('/')[2]);
   return {number,state:'open',draft:true,head:{sha:SHA}};
  }
  if(path.startsWith('/commits/'))return {total_count:3,check_runs:[
   run('build'),run('governance'),run('windows-offline-kit')
  ]};
  throw Error('unrecognized test endpoint');
 };
 const report=await auditTrackedDrafts(spec,fetcher,{sourceSha:SHA});
 assert.equal(report.status,'ALL_WATCHED_DRAFT_CODE_CI_VERIFIED_NOT_RELEASE');
 assert.ok(report.prs.every(x=>x.headSha===SHA));
 assert.equal(report.noAutomaticMerge,true);
 assert.equal(report.releaseAuthorized,false);
 assert.equal(report.physicalDeviceVerified,false);
 assert.equal(report.crossPrRuntimeIntegration,'NOT_PROVEN_BY_INDIVIDUAL_CI');
});
test('missing checks, non-draft source and API failure are REVIEW_REQUIRED, never PASS',async()=>{
 const partial=await auditTrackedDrafts(spec,async path=>{
  if(path.startsWith('/pulls/'))return {number:Number(path.split('/')[2]),
    state:'open',draft:true,head:{sha:SHA}};
  return {total_count:1,check_runs:[run('build')]};
 });
 assert.equal(partial.status,'REVIEW_REQUIRED');
 assert.ok(partial.prs.some(x=>x.status==='REVIEW_REQUIRED'));
 const invalid=await auditTrackedDrafts(spec,async path=>{
  if(path.startsWith('/pulls/'))return {number:Number(path.split('/')[2]),
    state:'closed',draft:false,head:{sha:SHA}};
  throw Error('must not get checks for closed PR');
 });
 assert.ok(invalid.prs.every(x=>x.status==='PR_NOT_OPEN_DRAFT_OR_METADATA_INVALID'));
 const failed=await auditTrackedDrafts(spec,async()=>{throw Error('remote temporarily unavailable');});
 assert.ok(failed.prs.every(x=>x.status==='REMOTE_EVIDENCE_NOT_VERIFIED'));
});
test('duplicate watched PR or unrecognized check name rejects fabricated QA coverage',()=>{
 const duplicate=structuredClone(spec);
 duplicate.targetPulls.push(duplicate.targetPulls[0]);
 assert.throws(()=>validateTrackedDrafts(duplicate),/duplicate watched PR/);
 const malicious=structuredClone(spec);
 malicious.targetPulls[0].requiredChecks=['production_deployed'];
 assert.throws(()=>validateTrackedDrafts(malicious));
});
