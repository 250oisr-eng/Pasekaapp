import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { IDBFactory } from 'fake-indexeddb';
import { auditPasekaJsonTransfer } from '../scripts/audit-oneplus-json-transfer.mjs';

// Synthetic, separate IndexedDB origins. NOT a physical Android or full-media restore test.
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
function extract(name) {
 const match=new RegExp('(?:async\\s+)?function\\s+'+name+'\\s*\\(').exec(html);
 assert.ok(match,'Missing real app function '+name);
 const next=/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
 next.lastIndex=match.index+match[0].length;
 return html.slice(match.index,next.exec(html)?.index??html.indexOf('</script>',match.index));
}
function appFn(name, deps) {
 return new Function('deps','with(deps){return ('+extract(name)+');}')(deps);
}
const factory=new IDBFactory();
function open(name) {
 return new Promise((ok,no)=>{
  const req=factory.open(name,1);
  req.onupgradeneeded=()=>{req.result.createObjectStore('main');req.result.createObjectStore('backup');};
  req.onsuccess=()=>ok(req.result);
  req.onerror=()=>no(req.error);
 });
}
function put(db,value) {
 return new Promise((ok,no)=>{
  const tx=db.transaction('main','readwrite');
  tx.objectStore('main').put(value,'state');
  tx.oncomplete=ok;tx.onerror=()=>no(tx.error);tx.onabort=()=>no(tx.error);
 });
}
function get(db) {
 return new Promise((ok,no)=>{
  const q=db.transaction('main','readonly').objectStore('main').get('state');
  q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);
 });
}
const fixture={
 meta:{schemaVersion:2,revisionId:'original-revision'},
 hives:[{id:'h-one',number:1}],families:[{id:'f-one',name:'TEST',hive:'h-one'}],
 records:[
  {id:'r-initial',hive:'h-one',family:'f-one',type:'Заметка',text:'initial',media:[]},
  {id:'r-offline',hive:'h-one',family:'f-one',type:'Заметка',text:'offline',media:[]}
 ],tasks:[],extractions:[],layouts:{},auditLog:[],aiMessages:[]
};
test('actual legacy restore writes original first-use JSON to separate blank IndexedDB without modifying source',async()=>{
 const source=await open('transfer-proof-source');
 const target=await open('transfer-proof-target');
 try{
  await put(source,structuredClone(fixture));
  const exported={app:'Paseka',state:structuredClone(await get(source))};
  assert.equal(auditPasekaJsonTransfer(exported,{hives:1,families:1,records:2}).status,'JSON_STATE_PREFLIGHT_ONLY');
  const blank={meta:{schemaVersion:2,revisionId:'blank-target-revision'},hives:[],families:[],records:[],tasks:[],extractions:[],layouts:{},auditLog:[],aiMessages:[]};
  await put(target,structuredClone(blank));
  const alerts=[];
  const deps={
   db:target,STORE:'main',BACKUP_STORE:'backup',S:structuredClone(blank),
   startupWriteGate:{ready:true},rejectWhileStartupNotReady:()=>null,
   $:()=>({files:[{text:async()=>JSON.stringify(exported)}]}),
   confirm:()=>true, saveQueue:Promise.resolve(),
   validateBackupState:state=>state,
   assertRawBackupIntegrity:state=>state,
   assertBackupNotFromNewerSchema:()=>{},
   migrateState:()=>false,
   uid:()=> 'imported-revision',
   logAudit(type){deps.S.auditLog.push({type})},
   validateVirtualApiary:()=>({errorCount:0,errors:[]}),
   autoBackupInfo:null,autoBackupRecovered:false,
   render:()=>{},alert:msg=>alerts.push(msg)
  };
  deps.readMain=appFn('readMain',deps);
  deps.writeMainWithBackup=appFn('writeMainWithBackup',deps);
  await appFn('restoreBackup',deps)();
  const saved=await get(target);
  assert.equal(saved.meta.revisionId,'imported-revision');
  assert.equal(saved.hives[0].id,'h-one');
  assert.equal(saved.families[0].hive,'h-one');
  assert.deepEqual(saved.records.map(r=>r.id),['r-initial','r-offline']);
  assert.match(alerts[0],/Архив восстановлен/);
  assert.deepEqual(await get(source),fixture,'source origin must be byte-for-byte logically unchanged');
  source.close(); target.close();
  const reopened=await open('transfer-proof-target');
  try{
   const persisted=await get(reopened);
   assert.deepEqual(persisted.records.map(r=>r.text),['initial','offline']);
  }finally{reopened.close()}
 }finally{
  try{source.close()}catch{}
  try{target.close()}catch{}
 }
});
