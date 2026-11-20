import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

test('Python offline public ZIP inspector regression suite',()=>{
 const cmd=process.platform==='win32'?'python':'python3';
 const result=spawnSync(cmd,['-m','unittest','discover','-s','tests','-p','test_inspect_bee_archive.py','-v'],{
  cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:30000,maxBuffer:1024*1024
 });
 assert.equal(result.error,undefined,String(result.error));
 assert.equal(result.status,0,result.stderr||result.stdout);
 assert.match(result.stderr,/Ran 6 tests/);
});
test('ZIP scan not activated in runtime and has no external IO',async()=>{
 const code=await readFile(new URL('../tools/inspect_bee_archive.py',import.meta.url),'utf8');
 const index=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(index,/inspect_bee_archive/);
 assert.doesNotMatch(sw,/inspect_bee_archive/);
 assert.doesNotMatch(code,/urlopen|requests\.|subprocess|shutil\.rmtree|extractall\s*\(|os\.remove/);
});
