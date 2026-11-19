import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmark } from '../scripts/local-ai-benchmark.mjs';
const cases = ['a','b','c','d'].map(id=>({id,source:'synthetic',task:'Review',context:'function f(x){return x+1;}'}));
test('four synthetic cases, two models, strictly sequential and results untrusted',async()=>{
  let active=0, maxActive=0, ticks=0;
  const report=await benchmark({models:['qwen3:4b','deepseek-r1:7b'],cases,
    clock:()=>ticks++,
    review:async({fixture,model})=>{
      active++;maxActive=Math.max(maxActive,active);
      assert.equal(fixture.source,'synthetic');
      assert.ok(['qwen3:4b','deepseek-r1:7b'].includes(model));
      await Promise.resolve();active--;
      return {status:'unverified-model-suggestions',finishReason:'stop',findingsText:'Review only',tokens:100,tokensPerSecond:25,totalDurationMs:4000};
    }
  });
  assert.equal(maxActive,1);
  assert.equal(report.runs.length,8);
  assert.equal(report.scored,false);
  assert.deepEqual(report.summary.map(x=>[x.attempted,x.completedUnverified,x.failed,x.meanTokensPerSecond,x.qualityScore]),[[4,4,0,25,null],[4,4,0,25,null]]);
  assert.ok(report.runs.every(x=>x.status==='unverified' && x.durationMs>=0));
  assert.deepEqual(report.runs.map(x=>x.model),[...Array(4).fill('qwen3:4b'),...Array(4).fill('deepseek-r1:7b')]);
});
test('invalid benchmark input fails closed before model requests',async()=>{
  let called=false;const review=async()=>{called=true;return {findingsText:'unexpected'};};
  await assert.rejects(benchmark({models:['qwen3:4b','qwen3:4b'],cases,review}),/distinct/);
  await assert.rejects(benchmark({models:['qwen3:4b'],cases:[...cases.slice(0,3),{...cases[0]}],review}),/repeated/);
  await assert.rejects(benchmark({models:['qwen3:4b'],cases:[...cases.slice(0,3),{...cases[3],context:'password=supersecretpassword'}],review}),/secret/);
  await assert.rejects(benchmark({models:['bad model'],cases,review}),/model/);
  await assert.rejects(benchmark({models:['qwen3:cloud'],cases,review}),/model/);
  assert.equal(called,false);
});
test('offline model failures are recorded without silent success',async()=>{
  const report=await benchmark({models:['qwen3:4b'],cases,review:async()=>{throw new Error('Ollama offline');}});
  assert.equal(report.runs.length,4);
  assert.ok(report.runs.every(x=>x.status==='failed' && /offline/.test(x.error)));
});

test('partial and unconfirmed results cannot be accepted as completed review',async()=>{
  const report=await benchmark({models:['qwen3:4b'],cases,review:async({fixture})=>({
    status:'unverified-model-suggestions',finishReason:fixture.id==='a'?'length':'stop',
    findingsText:fixture.id==='b'?'':'partial/uncertain'
  })});
  assert.equal(report.summary[0].completedUnverified,2);
  assert.equal(report.summary[0].failed,2);
  assert.equal(report.summary[0].qualityScore,null);
  assert.equal(report.summary[0].meanTokensPerSecond,null);
  assert.equal(report.runs[0].status,'failed');
  assert.equal(report.runs[1].status,'failed');
});
