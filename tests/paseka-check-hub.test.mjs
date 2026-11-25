import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,readdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {executeChecks,runAndSave,saveReport,validateChecks,HUB_SCHEMA} from '../scripts/paseka-check-hub.mjs';

async function temp(){
 const base=await mkdtemp(join(tmpdir(),'paseka-hub-'));
 const bundle=join(base,'bundle'),downloads=join(base,'Downloads'),desktop=join(base,'Desktop');
 await Promise.all([bundle,downloads,desktop].map(x=>mkdir(x)));
 return {base,bundle,downloads,desktop};
}
test('registry blocks unreviewed/device/network and duplicated checks',()=>{
 assert.throws(()=>validateChecks([{id:'unsafe',run:async()=>({status:'PASS',code:'X'}),readOnly:true,deviceAccess:true,networkAccess:false}]),/UNSAFE_CHECK_REGISTRY/);
 assert.throws(()=>validateChecks([{id:'duplicated',readOnly:true,deviceAccess:false,networkAccess:false,run:async()=>({})},{id:'duplicated',readOnly:true,deviceAccess:false,networkAccess:false,run:async()=>({})}]),/UNSAFE_CHECK_REGISTRY/);
});
test('first single click needs archive but preserves user files and reports missing external media',async()=>{
 const t=await temp();
 try{
  const result=await runAndSave({bundleRoot:t.bundle,downloads:t.downloads,desktop:t.desktop});
  assert.equal(result.report.schema,HUB_SCHEMA);
  assert.equal(result.report.checks.runtime.status,'PASS');
  assert.equal(result.report.checks['full-indexeddb-export'].status,'NEEDS_INPUT');
  assert.equal(result.report.checks['external-android-media'].status,'NEEDS_DEVICE_EVIDENCE');
  assert.equal(result.report.fullBackupVerified,false);
  assert.equal(result.report.network,'NOT_ATTEMPTED');
  const value=JSON.parse(await readFile(result.path,'utf8'));
  assert.equal(value.checks['full-indexeddb-export'].code,'FULL_EXPORT_NOT_FOUND');
  assert.deepEqual(await readdir(join(t.bundle,'B01-REPORTS')),[result.path.split(/[\\/]/).at(-1)]);
 }finally{await rm(t.base,{recursive:true,force:true})}
});
test('repeated clicks preserve all prior immutable reports, never replace',async()=>{
 const t=await temp();
 try{
  const first=await runAndSave({bundleRoot:t.bundle,downloads:t.downloads,desktop:t.desktop});
  const firstData=await readFile(first.path);
  const second=await runAndSave({bundleRoot:t.bundle,downloads:t.downloads,desktop:t.desktop});
  assert.notEqual(second.path,first.path);
  assert.deepEqual(await readFile(first.path),firstData);
  assert.equal((await readdir(join(t.bundle,'B01-REPORTS'))).length,2);
 }finally{await rm(t.base,{recursive:true,force:true})}
});
test('check execution failure redacts private exceptions and never claims success',async()=>{
 const t=await temp();
 try{
  const report=await executeChecks({bundleRoot:t.bundle,checks:[{id:'future-offline-check',readOnly:true,networkAccess:false,deviceAccess:false,
    async run(){throw Error('SECRET: /Users/owner/private.mp4')} }]});
  assert.equal(report.status,'BLOCKED');
  assert.equal(report.checks['future-offline-check'].code,'CHECK_EXECUTION_FAILED_REDACTED');
  assert.doesNotMatch(JSON.stringify(report),/SECRET|private.mp4|Users/);
 }finally{await rm(t.base,{recursive:true,force:true})}
});
test('untrusted check output is sanitized and cannot inject private filename or new fields',async()=>{
 const t=await temp();
 try{
  const report=await executeChecks({bundleRoot:t.bundle,checks:[{id:'future-test',readOnly:true,networkAccess:false,deviceAccess:false,
    async run(){return {status:'PASS',code:'PASS',proofLevel:'LOCAL_TEST_ONLY',path:'C:/secret',private:{foo:'bar'},requiredStoreCounts:{main:1,full_backup:0,entrance_media:4}};} }]});
  assert.equal(report.checks['future-test'].status,'PASS');
  assert.equal(report.checks['future-test'].requiredStoreCounts.entrance_media,4);
  assert.doesNotMatch(JSON.stringify(report),/secret|private|bar/);
 }finally{await rm(t.base,{recursive:true,force:true})}
});
test('unsafe symlinked report directory blocks any write',async()=>{
 const t=await temp();
 try{
  const target=join(t.base,'target');
  await mkdir(target);
  await symlink(target,join(t.bundle,'B01-REPORTS'));
  const result=await executeChecks({bundleRoot:t.bundle});
  await assert.rejects(saveReport({bundleRoot:t.bundle,report:result}),/UNSAFE_REPORT_DIRECTORY/);
  assert.deepEqual(await readdir(target),[]);
 }finally{await rm(t.base,{recursive:true,force:true})}
});
test('existing report cannot be replaced even on colliding controlled timestamp/id',async()=>{
 const t=await temp();
 try{
  const report=await executeChecks({bundleRoot:t.bundle});
  const args={bundleRoot:t.bundle,report,stamp:'2026-11-25T17-02-00-000Z',random:()=> '0123456789'};
  const path=await saveReport(args),old=await readFile(path);
  await assert.rejects(saveReport(args),e=>e.code==='EEXIST');
  assert.deepEqual(await readFile(path),old);
 }finally{await rm(t.base,{recursive:true,force:true})}
});
test('multiple real-looking exported archive candidates are refused without inspecting contents',async()=>{
 const t=await temp();
 try{
  const a=join(t.downloads,'paseka-full-idb-2026-11-25.json'),b=join(t.desktop,'paseka-full-idb-2026-11-24.json');
  await writeFile(a,'PRIVATE-A');await writeFile(b,'PRIVATE-B');
  const result=await executeChecks({bundleRoot:t.bundle,downloads:t.downloads,desktop:t.desktop});
  assert.equal(result.checks['full-indexeddb-export'].status,'NEEDS_INPUT');
  assert.equal(result.checks['full-indexeddb-export'].code,'MULTIPLE_FULL_EXPORTS');
  assert.equal(await readFile(a,'utf8'),'PRIVATE-A');
  assert.equal(await readFile(b,'utf8'),'PRIVATE-B');
 }finally{await rm(t.base,{recursive:true,force:true})}
});
