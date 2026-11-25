// PASEKA comprehensive CI: only public source/tests and an already-completed TAP log.
// This script must never access the phone, its DB, private backups or deployment APIs.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MATRIX = join(ROOT, 'qa/comprehensive-matrix.json');
const TEST_FILE = /^tests\/[a-z0-9-]+\.test\.mjs$/;
const STATES = new Set(['BLOCKED', 'FROZEN', 'NOT_TESTED']);
const SHA = /^[a-f0-9]{40}$/;

export function validateQAMatrix(matrix, discovered) {
  assert.equal(matrix?.schemaVersion, 1);
  assert.equal(matrix.kind, 'PASEKA_COMPREHENSIVE_QA_MATRIX');
  assert.equal(matrix.scope, 'MAIN_CODE_SYNTHETIC_TESTS_ONLY');
  assert.equal(matrix.releaseDecision, 'NO_RELEASE_WITHOUT_EXPLICIT_PERMISSION');
  assert.equal(matrix.phoneActionsRequiredNow, 0);
  assert.ok(Array.isArray(matrix.lanes) && matrix.lanes.length >= 8);
  assert.ok(Array.isArray(matrix.externalGates) && matrix.externalGates.length >= 4);
  const seen = new Set(), names = new Set(), patterns = [];
  for (const lane of matrix.lanes) {
    assert.match(lane.id, /^[a-z][a-z0-9_]*$/);
    assert.ok(!names.has(lane.id), 'QA lane repeated');
    names.add(lane.id);
    assert.ok(['P0', 'P1', 'P2'].includes(lane.priority));
    assert.ok(Array.isArray(lane.files) && lane.files.length);
    assert.ok(Array.isArray(lane.autoPrefixes) && lane.autoPrefixes.length);
    for (const prefix of lane.autoPrefixes) {
      assert.match(prefix,/^[a-z0-9-]+$/,'unsafe automatic QA prefix');
      patterns.push({prefix,lane:lane.id});
    }
    for (const file of lane.files) {
      assert.match(file, TEST_FILE, 'unsafe or unrecognized QA file');
      assert.ok(!seen.has(file), 'QA test file assigned twice: ' + file);
      seen.add(file);
    }
  }
  const actual = [...discovered].sort();
  assert.equal(new Set(actual).size,actual.length,'discovery contains repeated test files');
  for(const file of seen)assert.ok(actual.includes(file),
    'QA manifest refers to a deleted test file: '+file);
  const autoCounts=Object.fromEntries(matrix.lanes.map(l=>[l.id,0]));
  for(const file of actual){
    assert.match(file,TEST_FILE,'unsafe discovered QA test file');
    if(seen.has(file))continue;
    const base=file.slice('tests/'.length);
    const matches=patterns.filter(rule=>base.startsWith(rule.prefix));
    if(!matches.length)throw Error('Unclassified new QA test: '+file);
    const longest=Math.max(...matches.map(x=>x.prefix.length));
    const winners=matches.filter(x=>x.prefix.length===longest);
    if(winners.length!==1)throw Error('Ambiguous new QA test: '+file);
    autoCounts[winners[0].lane]++;
  }
  const gateIds = new Set();
  for (const gate of matrix.externalGates) {
    assert.match(gate.id, /^[A-Z][A-Z0-9_]+$/);
    assert.ok(!gateIds.has(gate.id), 'duplicate external gate');
    gateIds.add(gate.id);
    assert.ok(STATES.has(gate.status),
      'a static CI QA inventory must never claim physical PASS');
    assert.ok(typeof gate.requires === 'string' && gate.requires.length > 20);
  }
  for (const mandatory of ['B01_FULL_DEVICE_RECOVERY', 'B04_B05_ANDROID_UPGRADE',
    'DEVICE_VIDEO_PIPELINE_V0_V6']) assert.ok(gateIds.has(mandatory));
  return {laneCount:matrix.lanes.length, testFileCount:actual.length,
    automaticallyClassified:Object.values(autoCounts).reduce((a,n)=>a+n,0),
    autoCounts, externalGateCount:matrix.externalGates.length};
}

export function parseTapSummary(raw) {
  const fallback = {status:'NOT_TESTED', tests:null, pass:null, fail:null,
    cancelled:null, skipped:null, todo:null};
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  const last = key => {
    const expression = new RegExp('^# ' + key + ' (\\d+)\\s*$', 'gm');
    const matches = [...raw.matchAll(expression)];
    return matches.length ? Number(matches.at(-1)[1]) : null;
  };
  const data = Object.fromEntries(['tests','pass','fail','cancelled','skipped','todo']
    .map(key=>[key,last(key)]));
  if (Object.values(data).some(value=>value===null || !Number.isSafeInteger(value)))
    return {...fallback,status:'NOT_VERIFIED'};
  if (!data.tests || data.tests !== data.pass+data.fail+data.cancelled+
      data.skipped+data.todo) return {...data,status:'NOT_VERIFIED'};
  const status = data.fail ? 'FAIL' :
    (data.cancelled || data.skipped || data.todo) ? 'PARTIAL' : 'PASS_SYNTHETIC';
  return {status,...data};
}

export function buildQAReport({matrix, discovered, tap, sha = null, packageTestScript}) {
  const inventory = validateQAMatrix(matrix,discovered);
  assert.equal(packageTestScript,'node --test tests/*.test.mjs',
    'comprehensive file coverage requires the existing exact full-test command');
  const summary = parseTapSummary(tap);
  const useSha = typeof sha === 'string' && SHA.test(sha) ? sha : null;
  return {
    schema:'paseka-qa-comprehensive-v1',
    sourceSha:useSha,
    inventory:'PASS',
    ...inventory,
    suite:summary,
    laneResults:matrix.lanes.map(lane=>({
      id:lane.id, priority:lane.priority, title:lane.title,
      testFiles:lane.files.length+inventory.autoCounts[lane.id],
      status:summary.status==='PASS_SYNTHETIC'
        ? 'COVERED_BY_PASSING_FULL_SYNTHETIC_SUITE'
        : 'NOT_VERIFIED_SEPARATELY'
    })),
    externalGates:matrix.externalGates.map(g=>({
      id:g.id,status:g.status,requires:g.requires
    })),
    physicalDeviceVerified:false,
    realOriginalBackupVerified:false,
    videoDeletionAuthorized:false,
    userDataRead:false,
    releaseAuthorized:false,
    approvalRequiredForMerge:true
  };
}

function main() {
  const args = process.argv.slice(2);
  const mode = args[0];
  assert.ok(mode==='--inventory' || mode==='--tap', 'expected --inventory or --tap <file>');
  if(mode==='--inventory')assert.equal(args.length,1);
  else assert.equal(args.length,2);
  const matrix=JSON.parse(readFileSync(MATRIX,'utf8'));
  const discovered=readdirSync(join(ROOT,'tests'))
    .filter(name=>name.endsWith('.test.mjs')).map(name=>'tests/'+name);
  const script=JSON.parse(readFileSync(join(ROOT,'package.json'),'utf8')).scripts.test;
  const tap=mode==='--tap' ? readFileSync(resolve(args[1]),'utf8') : '';
  const report=buildQAReport({
    matrix,discovered,tap,sha:process.env.GITHUB_SHA||null,packageTestScript:script
  });
  const target=join(ROOT,'qa-results/comprehensive-report.json');
  mkdirSync(dirname(target),{recursive:true});
  writeFileSync(target,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  // Only synthetic counts, ref and gate statuses enter the CI artifact.
  console.log('PASEKA_QA '+JSON.stringify({
    sourceSha:report.sourceSha, inventory:report.inventory, suite:report.suite,
    lanes:report.laneCount, files:report.testFileCount,
    externalGates:report.externalGates.map(x=>({id:x.id,status:x.status})),
    physicalDeviceVerified:false, releaseAuthorized:false
  }));
  if(mode==='--tap' && report.suite.status!=='PASS_SYNTHETIC')process.exitCode=1;
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{main();}
  catch(error){
    // Never echo local file names, TAP excerpts, users' notes or archive content.
    console.error('PASEKA_QA_BLOCKED: inventory, runner or test evidence invalid');
    process.exitCode=1;
  }
}
