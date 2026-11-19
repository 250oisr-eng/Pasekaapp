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
      runs.push({ model, caseId: item.id, durationMs: Math.max(0,clock()-start),
        status: 'unverified', findingsText: result.findingsText });
    } catch (error) {
      runs.push({ model, caseId: item.id, durationMs: Math.max(0,clock()-start),
        status: 'failed', error: String(error?.message ?? 'Unknown local failure').slice(0,200) });
    }
  }
  return { kind: 'synthetic-local-model-comparison', scored: false,
    note: 'Manually compare findings to the expected defects in the benchmark fixture; model output is untrusted.',
    runs };
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
