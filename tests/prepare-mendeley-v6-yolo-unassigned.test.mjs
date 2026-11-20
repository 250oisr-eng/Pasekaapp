import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';

test('Mendeley v6 YOLO staging importer passes 11 synthetic Python regressions',()=>{
 const cmd=process.platform==='win32'?'python':'python3';
 const p=spawnSync(cmd,['-m','unittest','discover','-s','tests','-p','test_prepare_mendeley_v6_yolo_unassigned.py','-v'],{
  cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:30000,maxBuffer:1024*1024
 });
 assert.equal(p.error,undefined,String(p.error));
 assert.equal(p.status,0,p.stderr||p.stdout);
 assert.match(p.stderr,/Ran 11 tests/);
});
test('new local-only YOLO importer is not wired into runtime, service worker or network',async()=>{
 const raw=await readFile(new URL('../tools/prepare_mendeley_v6_yolo_unassigned.py',import.meta.url),'utf8');
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/prepare_mendeley_v6_yolo_unassigned/);
 assert.doesNotMatch(sw,/prepare_mendeley_v6_yolo_unassigned/);
 assert.doesNotMatch(raw,/urllib\.request|requests\.|shutil\.rmtree|extractall\s*\(|indexedDB|MediaStore/);
 assert.match(raw,/trainingAuthorized.*False/);
});
