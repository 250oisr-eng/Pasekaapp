import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
test('public LILA ZIP filename pairing audit passes five offline regressions',()=>{
 const cmd=process.platform==='win32'?'python':'python3';
 const r=spawnSync(cmd,['-m','unittest','discover','-s','tests','-p','test_audit_lila_zip_filenames.py','-v'],{
  cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:30000,maxBuffer:1024*1024
 });
 assert.equal(r.error,undefined,String(r.error));
 assert.equal(r.status,0,r.stderr||r.stdout);
 assert.match(r.stderr,/Ran 5 tests/);
});
test('ZIP directory audit is isolated from user videos and runtime app',async()=>{
 const code=await readFile(new URL('../tools/audit_lila_zip_filenames.py',import.meta.url),'utf8');
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(code,/urlretrieve|extractall\s*\(|shutil\.rmtree|MediaStore|indexedDB/);
 assert.doesNotMatch(html,/audit_lila_zip_filenames/);
 assert.doesNotMatch(sw,/audit_lila_zip_filenames/);
});
