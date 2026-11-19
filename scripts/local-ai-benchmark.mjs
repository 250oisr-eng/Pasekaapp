#!/usr/bin/env node
// Explicitly invoked, sequential, local-only benchmark of synthetic cases.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { reviewFixture, validateModel, validateFixture } from './local-ai-review.mjs';

const CASES = resolve(dirname(fileURLToPath(import.meta.url)), '../tests/fixtures/local-ai-benchmark.json');
export async function benchmark({ models, cases, review = reviewFixture, clock = () => Date.now() }) {
  if (!Array.isArray(models) || models.length < 1 || models.length > 2) throw new Error('Pass one or two local models');
  const ids = models.map(validateModel);
  if (new Set(ids).size !== ids.length) throw new Error('Models must be distinct');
  if (!Array.isArray(cases) || cases.length !== 4) throw new Error('Expected four benchmark cases');
  const seen = new Set();
  for (const item of cases) {
    if (typeof item.id !== 'string' || !/^[a-z0-9-]{1,32}$/.test(item.id) || seen.has(item.id)) throw new Error('Invalid or repeated case id');
    seen.add(item.id);
    validateFixture(item);
  }
  const runs = [];
  for (const model of ids) for (const item of cases) {
    const start = clock();
    try {
      const result = await review({ fixture: item, model });
      if (result?.status !== 'unverified-model-suggestions' || result.finishReason !== 'stop' ||
          typeof result.findingsText !== 'string' || !result.findingsText.trim()) {
        throw new Error('Missing complete final review; rejected');
      }
      runs.push({ model, caseId: item.id, durationMs: Math.max(0,clock()-start),
        status: 'unverified', completion: 'stop',
        tokens: result.tokens ?? null, tokensPerSecond: result.tokensPerSecond ?? null,
        modelDurationMs: result.totalDurationMs ?? null, findingsText: result.findingsText });
    } catch (error) {
      runs.push({ model, caseId: item.id, durationMs: Math.max(0,clock()-start),
        status: 'failed', error: String(error?.message ?? 'Unknown local failure').slice(0,200) });
    }
  }
  const summary = ids.map(model => {
    const modelRuns = runs.filter(run => run.model === model);
    const measuredSpeeds = modelRuns.map(run => run.tokensPerSecond).filter(x => Number.isFinite(x) && x > 0);
    return {
      model, attempted: modelRuns.length,
      completedUnverified: modelRuns.filter(run => run.status === 'unverified').length,
      failed: modelRuns.filter(run => run.status === 'failed').length,
      elapsedMs: modelRuns.reduce((total,run) => total + run.durationMs,0),
      meanTokensPerSecond: measuredSpeeds.length
        ? Math.round(measuredSpeeds.reduce((a,b)=>a+b,0) * 10 / measuredSpeeds.length)/10 : null,
      qualityScore: null
    };
  });
  return { kind: 'synthetic-local-model-comparison', scored: false,
    note: 'Completion is not correctness. Human must check defect detection, false positives, unsafe fixes and regression tests against the synthetic fixtures. Incomplete output counts as failed.',
    summary, runs };
}
async function main() {
  if (process.argv.length !== 4 || process.argv[2] !== '--models') throw new Error('Usage: node scripts/local-ai-benchmark.mjs --models qwen3:4b,deepseek-r1:7b');
  const models = process.argv[3].split(',');
  const cases = JSON.parse(await readFile(CASES,'utf8'));
  const report = await benchmark({models,cases});
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if (report.runs.some(x=>x.status==='failed')) process.exitCode=1;
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch(error=>{process.stderr.write('Benchmark failed: '+error.message+'\n'); process.exitCode=1;});
}
