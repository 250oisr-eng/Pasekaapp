import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

test('read-only Mendeley metadata probe has a passing offline Python regression suite',()=>{
 const cmd=process.platform==='win32'?'python':'python3';
 const x=spawnSync(cmd,['-m','unittest','discover','-s','tests','-p','test_probe_public_mendeley.py','-v'],{
  cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:30000,maxBuffer:1024*1024
 });
 assert.equal(x.error,undefined,String(x.error));
 assert.equal(x.status,0,x.stderr||x.stdout);
 assert.match(x.stderr,/Ran 6 tests/);
});
test('metadata probe never activates application features or downloads archives',async()=>{
 const code=await readFile(new URL('../tools/probe_public_mendeley.py',import.meta.url),'utf8');
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/probe_public_mendeley/);
 assert.doesNotMatch(sw,/probe_public_mendeley/);
 assert.doesNotMatch(code,/file_downloaded|zip\/file_downloaded|requests\.|urlretrieve|extractall\s*\(|shutil\.rmtree/);
});
