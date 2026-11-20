import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
test('local Pascal VOC to unassigned COCO passes eight Python regressions',()=>{
 const cmd=process.platform==='win32'?'python':'python3';
 const p=spawnSync(cmd,['-m','unittest','discover','-s','tests','-p','test_convert_bee_voc_unassigned.py','-v'],{
  cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:30000,maxBuffer:1024*1024
 });
 assert.equal(p.error,undefined,String(p.error));
 assert.equal(p.status,0,p.stderr||p.stdout);
 assert.match(p.stderr,/Ran 8 tests/);
});
test('VOC converter remains local-only and absent from runtime app',async()=>{
 const raw=await readFile(new URL('../tools/convert_bee_voc_unassigned.py',import.meta.url),'utf8');
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.doesNotMatch(html,/convert_bee_voc_unassigned/);
 assert.doesNotMatch(sw,/convert_bee_voc_unassigned/);
 assert.doesNotMatch(raw,/urllib\.request|requests\.|extractall\s*\(|shutil\.rmtree|indexedDB|MediaStore/);
});
