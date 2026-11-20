import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
test('sample LILA VOC directory and XML range probe passes seven offline Python tests',()=>{
 const cmd=process.platform==='win32'?'python':'python3';
 const result=spawnSync(cmd,['-m','unittest','discover','-s','tests','-p','test_sample_lila_voc_range.py','-v'],{
  cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:30000,maxBuffer:1024*1024
 });
 assert.equal(result.error,undefined,String(result.error));
 assert.equal(result.status,0,result.stderr||result.stdout);
 assert.match(result.stderr,/Ran 7 tests/);
});
test('VOC sample is read-only, inactive and has no archive download',async()=>{
 const raw=await readFile(new URL('../tools/sample_lila_voc_range.py',import.meta.url),'utf8');
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/sample_lila_voc_range/);
 assert.doesNotMatch(sw,/sample_lila_voc_range/);
 assert.doesNotMatch(raw,/extractall\s*\(|shutil\.rmtree|urlretrieve|open\([^)]*["']wb["']|indexedDB|MediaStore/);
});
