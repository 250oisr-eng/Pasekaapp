import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
test('five-pair public LILA sampler passes eight offline Python tests',()=>{
 const cmd=process.platform==='win32'?'python':'python3';
 const p=spawnSync(cmd,['-m','unittest','discover','-s','tests','-p','test_sample_lila_five_pairs.py','-v'],{
  cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:30000,maxBuffer:1024*1024
 });
 assert.equal(p.error,undefined,String(p.error));
 assert.equal(p.status,0,p.stderr||p.stdout);
 assert.match(p.stderr,/Ran 8 tests/);
});
test('representative sample never touches production runtime or stored video',async()=>{
 const code=await readFile(new URL('../tools/sample_lila_five_pairs.py',import.meta.url),'utf8');
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/sample_lila_five_pairs/);
 assert.doesNotMatch(sw,/sample_lila_five_pairs/);
 assert.doesNotMatch(code,/extractall\s*\(|urlretrieve|shutil\.rmtree|indexedDB|MediaStore/);
});
