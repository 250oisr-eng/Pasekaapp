import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const a=html.indexOf('async function verifyDisasterArchive(){');
const b=html.indexOf('async function downloadBackup(){',a);
const source=a>=0&&b>a?html.slice(a,b):'';

function binaryFile(name,bytes){
 const data=Buffer.from(bytes);
 return {name,size:data.length,
  slice(start,end){return {arrayBuffer:async()=>Uint8Array.from(data.subarray(start,end)).buffer}},
  text:async()=>data.toString('utf8')};
}
function setup(file,verify=async()=>({sha256:'proof',counts:{main:1}})){
 assert.ok(source,'read-only archive verifier exists');
 const status={textContent:''},input={files:[file]};
 const db={version:16},calls={inspections:0,validated:0};
 const archive={inspectArchive:async(...args)=>{calls.inspections++;return verify(...args)}};
 const exec=new Function('$','db','PasekaDisasterArchive','assertRawBackupIntegrity','validateBackupState',
   source+';return verifyDisasterArchive;');
 const run=exec(id=>id==='disasterFile'?input:status,db,archive,
  x=>{calls.validated++;return x},x=>x);
 return {run,status,calls};
}

test('mis-selected ZIP with PK magic fails safely before any JSON parsing or database access',async()=>{
 const h=setup(binaryFile('QA-download.zip',[0x50,0x4b,0x03,0x04,0x00,0x01]));
 await h.run();
 assert.match(h.status.textContent,/Проверка архива НЕ пройдена: Выбран ZIP-файл \(сигнатура PK\)/);
 assert.match(h.status.textContent,/paseka-full-idb-YYYY-MM-DD\.json/);
 assert.equal(h.calls.inspections,0);
 assert.equal(h.calls.validated,0);
});
test('ZIP disguised as .json also fails without archive inspection',async()=>{
 const h=setup(binaryFile('paseka-full-idb-2026-11-27.json',[0x50,0x4b,0x05,0x06]));
 await h.run();assert.match(h.status.textContent,/ZIP-файл/);
 assert.equal(h.calls.inspections,0);
});
test('non-json and empty selected files fail with an actionable message',async()=>{
 for(const [f,message] of [
  [binaryFile('unrelated.txt','notes'),/не с расширением \.json/],
  [binaryFile('paseka-full-idb-2026-11-27.json',[]),/Выбран пустой файл/]
 ]){
  const h=setup(f);await h.run();assert.match(h.status.textContent,message);
  assert.equal(h.calls.inspections,0);
 }
});
test('a real saved JSON still passes existing read-only SHA/structure verifier',async()=>{
 const body=JSON.stringify({manifest:{format:'paseka-idb-full-v1'},payload:{stores:[]}});
 let observed='';
 const h=setup(binaryFile('paseka-full-idb-2026-11-27.json',body),
  async(raw)=>{observed=raw;return {sha256:'abcdef',counts:{main:1,records:2}}});
 await h.run();
 assert.equal(observed,body);
 assert.equal(h.calls.inspections,1);
 assert.match(h.status.textContent,/Файл прошёл SHA-256 и проверку структуры: abcdef/);
 assert.match(h.status.textContent,/Записей: 3/);
 assert.match(h.status.textContent,/Независимое восстановление НЕ подтверждено/);
});
test('archive verification remains read-only, without restore or cleanup call sites',()=>{
 assert.doesNotMatch(source,/atomicRestore|restoreBackup|deleteDatabase|objectStore\(.*\)\.clear|\.delete\(/);
 assert.match(source,/const raw=await file\.text\(\)/);
 assert.match(source,/inspectArchive\(raw,db/);
});
