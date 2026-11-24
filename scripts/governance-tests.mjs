import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkGovernanceFiles, summarizeCycleMetrics, validateCycleLedger } from './governance-check.mjs';

const root=resolve(import.meta.dirname || new URL('.',import.meta.url).pathname,'..');
const ledger=JSON.parse(readFileSync(resolve(root,'docs/WORK-CYCLE-METRICS.json'),'utf8'));
const sizes=Object.fromEntries(ledger.baseline.docs.map(d=>[d.path, readFileSync(resolve(root,d.path),'utf8').length]));

test('governance safeguards remain and compact status does not duplicate history',()=>{
 const result=checkGovernanceFiles(root);
 assert.ok(result.documents.currentCharacters<result.documents.baselineCharacters);
 assert.equal(result.effectStatus,'NOT_MEASURED_NEEDS_2_TO_3_REAL_POST_CYCLES');
 assert.equal(result.after.repeatedDocumentReads,null);
 assert.ok(result.before.observedCancelledCi>=1);
});

test('missing baseline repeat-read counts remain NOT_MEASURED rather than becoming zero',()=>{
 const r=summarizeCycleMetrics(ledger,sizes);
 assert.equal(r.before.repeatedDocumentReads,null);
 assert.equal(r.after.verifiedUserScenarios,null);
 assert.equal(r.after.trackedBlockersAtEnd,null);
});

test('after two verifiable macrocycles count results but do not invent baseline measurements',()=>{
 const copy=structuredClone(ledger);
 copy.postReformCycles=[1,2].map(i=>({
  id:'post-fixture-'+i,codeSha:'a'.repeat(40),
  ciRuns:[{id:1000+i,conclusion:i===1?'cancelled':'success'}],
  repeatedDocumentReads:i,trackedBlockersAtStart:4,trackedBlockersAtEnd:3,
  completedVerifiedUserScenarios:0,scenariosEvidence:'No physical scenarios: synthetic fixture only',
  prUrl:'https://github.com/250oisr-eng/Pasekaapp/pull/470'
 }));
 const r=summarizeCycleMetrics(copy,sizes);
 assert.equal(r.effectStatus,'POST_SAMPLE_COLLECTED_CHECK_COMPARABILITY');
 assert.equal(r.after.repeatedDocumentReads,3);
 assert.equal(r.after.observedCancelledCi,1);
 assert.equal(r.after.trackedBlockersAtEnd,3);
 assert.equal(r.before.repeatedDocumentReads,null);
});

test('fake CI conclusions, duplicate cycles and unverified user scenarios are rejected',()=>{
 const incomplete=structuredClone(ledger);
 incomplete.preReformCycles[0].ciRuns[0].conclusion='pending';
 assert.throws(()=>validateCycleLedger(incomplete),/unverified/);
 const duplicated=structuredClone(ledger);
 duplicated.preReformCycles[1].id=duplicated.preReformCycles[0].id;
 assert.throws(()=>validateCycleLedger(duplicated),/unique/);
 const unproved=structuredClone(ledger);
 unproved.postReformCycles=[{
  id:'fake-post',codeSha:'a'.repeat(40),ciRuns:[{id:1,conclusion:'success'}],
  repeatedDocumentReads:0,trackedBlockersAtEnd:3,completedVerifiedUserScenarios:1,
  scenariosEvidence:'Synthetic only'
 }];
 assert.throws(()=>validateCycleLedger(unproved),/requires explicit evidence/);
});

test('governance workflow checks documentation-only main pushes without publishing',()=>{
 const workflow=readFileSync(resolve(root,'.github/workflows/governance-docs.yml'),'utf8');
 assert.match(workflow,/\n  push:\n    branches: \[main\]\n/);
 assert.match(workflow,/\n      - 'PROJECT_STATUS\.md'/);
 assert.match(workflow,/\n      - 'docs\/\*\*'/);
 assert.match(workflow,/\n  pull_request:\n/);
 assert.match(workflow,/\npermissions:\n  contents: read\n/);
 assert.match(workflow,/node scripts\/governance-check\.mjs/);
 assert.match(workflow,/node --test scripts\/governance-tests\.mjs/);
 assert.doesNotMatch(workflow,/deploy-pages|upload-pages-artifact|pages: write|id-token: write|npm publish|git push/);
});
