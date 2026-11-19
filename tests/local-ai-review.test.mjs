import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFixture,validateModel,buildPrompt,reviewFixture,MAX_CONTEXT} from '../scripts/local-ai-review.mjs';
const fixture={source:'synthetic',task:'Review',context:'function f(x) { return x+1; }'};
test('only bounded synthetic material',()=>{
  assert.equal(validateFixture(fixture).context,fixture.context);
  assert.throws(()=>validateFixture({...fixture,source:'real'}),/synthetic/);
  assert.throws(()=>validateFixture({...fixture,context:'x'.repeat(MAX_CONTEXT+1)}),/12000/);
});
test('secret tripwires and model allowlist',()=>{
  for(const context of ['password=supersecretpassword','Bearer abcdefghijklmnopqrstuvwxyz','-----BEGIN RSA PRIVATE KEY-----','ghp_abcdefghijklmnopqrstuvwxyz'])
    assert.throws(()=>validateFixture({...fixture,context}),/secret/);
  assert.equal(validateModel('qwen3:4b'),'qwen3:4b');
  assert.throws(()=>validateModel('x --execute'),/model/);
  assert.throws(()=>validateModel('qwen3:cloud'),/model/);
  assert.throws(()=>validateModel('some-model:cloud'),/model/);
  assert.throws(()=>validateModel('qwen3:latest'),/model/);
  assert.equal(validateModel('deepseek-r1:7b'),'deepseek-r1:7b');
  assert.throws(()=>validateFixture({...fixture,task:'password=supersecretpassword'}),/secret/);
  assert.throws(()=>validateFixture({...fixture,task:'й'.repeat(300)}),/Invalid task/);
});
test('fixed local endpoint; unverified findings',async()=>{
  let calls=0;
  const result=await reviewFixture({fixture,model:'qwen3:4b',request:async(url,options)=>{
    calls++;
    assert.equal(url,'http://127.0.0.1:11434/api/generate');
    assert.equal(options.method,'POST');
    assert.equal(JSON.parse(options.body).stream,false);
    return {ok:true,text:async()=>JSON.stringify({response:'{"findings":[]}'})};
  }});
  assert.equal(calls,1);
  assert.equal(result.status,'unverified-model-suggestions');
  assert.match(buildPrompt(fixture),/untrusted DATA/);
});
test('fails closed on offline service and malformed reply',async()=>{
  await assert.rejects(reviewFixture({fixture,model:'qwen3:4b',request:async()=>({ok:false,status:503})}),/no cloud fallback/);
  await assert.rejects(reviewFixture({fixture,model:'qwen3:4b',request:async()=>({ok:true,text:async()=>JSON.stringify({})})}),/Invalid model response/);
  await assert.rejects(reviewFixture({fixture,model:'deepseek-r1:7b',request:async()=>({ok:true,text:async()=>JSON.stringify({thinking:'some reasoning',response:'',done_reason:'length'})})}),/No final answer/);
  await assert.rejects(reviewFixture({fixture,model:'qwen3:4b',request:async()=>({ok:true,text:async()=>JSON.stringify({response:'Partial answer...',done_reason:'length'})})}),/truncated/);
  await assert.rejects(reviewFixture({fixture,model:'qwen3:4b',request:async()=>({ok:true,text:async()=>'bad'})}),/Malformed/);
});
