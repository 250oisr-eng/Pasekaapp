import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
test('LILA public byte-range probe passes seven offline Python security regressions',()=>{
 const cmd=process.platform==='win32'?'python':'python3';
 const p=spawnSync(cmd,['-m','unittest','discover','-s','tests','-p','test_probe_lila_bee_zip_range.py','-v'],{
  cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:30000,maxBuffer:1024*1024
 });
 assert.equal(p.error,undefined,String(p.error));
 assert.equal(p.status,0,p.stderr||p.stdout);
 assert.match(p.stderr,/Ran 7 tests/);
});
test('public ZIP-range probe cannot activate app or download entire archives',async()=>{
 const code=await readFile(new URL('../tools/probe_lila_bee_zip_range.py',import.meta.url),'utf8');
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/probe_lila_bee_zip_range/);assert.doesNotMatch(sw,/probe_lila_bee_zip_range/);
 assert.doesNotMatch(code,/shutil\.rmtree|extractall\s*\(|urlretrieve|open\([^)]*["']wb["']|HTTPRedirectHandler\(\)/);
});
