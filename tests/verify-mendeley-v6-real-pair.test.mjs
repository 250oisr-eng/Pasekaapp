import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

test('Mendeley real-pair network code has ten mocked local regression cases',()=>{
 const cmd=process.platform==='win32'?'python':'python3';
 const p=spawnSync(cmd,['-m','unittest','discover','-s','tests','-p','test_verify_mendeley_v6_public_pair.py','-v'],{
  cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:30000,maxBuffer:1024*1024
 });
 assert.equal(p.error,undefined,String(p.error));
 assert.equal(p.status,0,p.stderr||p.stdout);
 assert.match(p.stderr,/Ran 10 tests/);
});
test('public-pair verifier is not imported by runtime PWA or Service Worker',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/verify_mendeley_v6_public_pair/);
 assert.doesNotMatch(sw,/verify_mendeley_v6_public_pair/);
});
