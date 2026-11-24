import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REFORM_DOCS = ['AGENTS.md', 'PROJECT_STATUS.md',
  'docs/ПЕРЕДАЧА-МЕЖДУ-ЧАТАМИ.md', 'docs/PROJECT-CONTROL.md',
  'docs/ПРАВИЛА-РАЗРАБОТКИ.md',
  'docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md'];
const SHA40 = /^[a-f0-9]{40}$/;
const FINAL_CONCLUSIONS = new Set(['success', 'failure', 'cancelled', 'skipped', 'timed_out', 'action_required']);

export function validateCycleLedger(ledger) {
  assert.equal(ledger.schemaVersion, 1, 'versioned cycle metric schema');
  assert.ok(SHA40.test(ledger.baseline.sourceMainSha));
  assert.deepEqual(ledger.baseline.docs.map(x => x.path), REFORM_DOCS);
  for (const doc of ledger.baseline.docs) {
    assert.ok(Number.isSafeInteger(doc.chars) && doc.chars > 0, 'baseline file sizes need evidence');
  }
  assert.ok(Array.isArray(ledger.trackedCriticalDependencies) && ledger.trackedCriticalDependencies.length > 0);
  assert.ok(Array.isArray(ledger.preReformCycles) && ledger.preReformCycles.length >= 2);
  assert.ok(Array.isArray(ledger.postReformCycles));
  assert.ok(ledger.evaluation.minimumRealPostCycles >= 2);
  assert.ok(ledger.evaluation.preferredRealPostCycles >= ledger.evaluation.minimumRealPostCycles);
  const unique = new Set();
  for (const cycle of [...ledger.preReformCycles, ...ledger.postReformCycles]) {
    assert.ok(cycle.id && !unique.has(cycle.id), 'cycle ID must be unique');
    unique.add(cycle.id);
    assert.ok(SHA40.test(cycle.codeSha), 'only a verified full SHA');
    assert.ok(Array.isArray(cycle.ciRuns) && cycle.ciRuns.length > 0, 'CI runs must be listed explicitly');
    for (const run of cycle.ciRuns) {
      assert.ok(Number.isSafeInteger(run.id) && run.id > 0);
      assert.ok(FINAL_CONCLUSIONS.has(run.conclusion), 'unverified / pending conclusion must not look complete');
    }
    for (const name of ['repeatedDocumentReads', 'trackedBlockersAtEnd']) {
      const val = cycle[name];
      assert.ok(val === null || (Number.isSafeInteger(val) && val >= 0), name + ' must be null or measured nonnegative integer');
    }
    if (cycle.trackedBlockersAtStart !== undefined) {
      assert.ok(cycle.trackedBlockersAtStart === null ||
        (Number.isSafeInteger(cycle.trackedBlockersAtStart) && cycle.trackedBlockersAtStart >= 0));
    }
    assert.ok(Number.isSafeInteger(cycle.completedVerifiedUserScenarios) && cycle.completedVerifiedUserScenarios >= 0);
    assert.ok(typeof cycle.scenariosEvidence === 'string' && cycle.scenariosEvidence.length > 4);
    if (cycle.completedVerifiedUserScenarios > 0) {
      assert.ok(/https:\/\/|evidence:|report:/i.test(cycle.scenariosEvidence),
        'verified user scenario requires explicit evidence');
    }
  }
  return true;
}

export function summarizeCycleMetrics(ledger, docsChars) {
  validateCycleLedger(ledger);
  const oldChars = ledger.baseline.docs.reduce((s, d) => s + d.chars, 0);
  const currentChars = ledger.baseline.docs.reduce((s, d) => {
    assert.ok(Number.isSafeInteger(docsChars[d.path]) && docsChars[d.path] > 0, 'missing live file size: ' + d.path);
    return s + docsChars[d.path];
  }, 0);
  const allBefore = ledger.preReformCycles.flatMap(c => c.ciRuns);
  const allAfter = ledger.postReformCycles.flatMap(c => c.ciRuns);
  const observedCancelled = runs => runs.filter(r => r.conclusion === 'cancelled').length;
  const posts = ledger.postReformCycles;
  const comparable = posts.length >= ledger.evaluation.minimumRealPostCycles;
  // Never replace a missing repeat-read baseline with zero.
  const knownBaselineReads = ledger.preReformCycles.every(c => Number.isInteger(c.repeatedDocumentReads));
  const knownPostReads = comparable && posts.every(c => Number.isInteger(c.repeatedDocumentReads));
  return {
    documents: {baselineCharacters:oldChars, currentCharacters:currentChars,
      reducedCharacters:oldChars-currentChars,
      reductionPercent:Number(((oldChars-currentChars)/oldChars*100).toFixed(1))},
    before: {cycles:ledger.preReformCycles.length, observedCiRuns:allBefore.length,
      observedCancelledCi:observedCancelled(allBefore), repeatedDocumentReads:knownBaselineReads
        ? ledger.preReformCycles.reduce((n,c)=>n+c.repeatedDocumentReads,0) : null},
    after: {cycles:posts.length, observedCiRuns:allAfter.length,
      observedCancelledCi:observedCancelled(allAfter), repeatedDocumentReads:knownPostReads
        ? posts.reduce((n,c)=>n+c.repeatedDocumentReads,0) : null,
      trackedBlockersAtEnd:comparable&&posts.every(c=>Number.isInteger(c.trackedBlockersAtEnd))
        ? posts.at(-1).trackedBlockersAtEnd : null,
      verifiedUserScenarios:comparable ? posts.reduce((n,c)=>n+c.completedVerifiedUserScenarios,0) : null},
    effectStatus:comparable?'POST_SAMPLE_COLLECTED_CHECK_COMPARABILITY':'NOT_MEASURED_NEEDS_2_TO_3_REAL_POST_CYCLES'
  };
}

export function checkGovernanceFiles(root = ROOT) {
  const texts = Object.fromEntries(REFORM_DOCS.map(path =>
    [path, readFileSync(join(root, path), 'utf8')]));
  const len = Object.fromEntries(REFORM_DOCS.map(path => [path, texts[path].length]));
  assert.ok(len['AGENTS.md'] <= 8000, 'AGENTS.md must remain compact');
  assert.ok(len['PROJECT_STATUS.md'] <= 6500, 'active status is not a historical log');
  assert.ok(len['docs/ПЕРЕДАЧА-МЕЖДУ-ЧАТАМИ.md'] <= 3000, 'handoff is not a duplicate status');
  assert.ok(texts['AGENTS.md'].includes('F0–F7') && texts['AGENTS.md'].includes('OP-02'));
  assert.ok(texts['AGENTS.md'].includes('OP-07') && texts['AGENTS.md'].includes('100–200 г за сутки'));
  assert.ok(texts['AGENTS.md'].includes('FROZEN #442') &&
    texts['AGENTS.md'].includes('Без отдельного явного разрешения'));
  assert.ok(texts['AGENTS.md'].includes('gramsPerColonyPerDay'));
  const strategy=texts['docs/СТРАТЕГИЯ-РАЗРАБОТКИ-ПАСЕКА-2026-11-23.md'];
  assert.ok(strategy.includes('## 4. Непрерывный конвейер принятия каждой новой функции (F0–F7)'));
  for(let i=0;i<8;i++) assert.ok(strategy.includes('**F'+i+' —'),'missing F'+i+' in strategy');
  const index=texts['docs/PROJECT-CONTROL.md'];
  assert.ok(index.startsWith('# PROJECT-CONTROL — индекс'));
  assert.ok(index.includes('AGENTS.md') && index.includes('ЖУРНАЛ-ИЗМЕНЕНИЙ'));
  assert.ok(texts['PROJECT_STATUS.md'].includes('Draft #469') &&
    texts['PROJECT_STATUS.md'].includes('Draft #452'));
  const ledger = JSON.parse(readFileSync(join(root,'docs/WORK-CYCLE-METRICS.json'),'utf8'));
  return summarizeCycleMetrics(ledger,len);
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(checkGovernanceFiles(),null,2));
  } catch (e) {
    console.error('GOVERNANCE_CHECK_BLOCKED: '+e.message);
    process.exitCode=1;
  }
}
