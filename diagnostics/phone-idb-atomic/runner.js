(function(){
'use strict';
// Standalone test of production IDB writer against a synthetic, isolated DB.
// No user data, filesystem, MediaStore, imports, restoration or deletes.
const PKG='ru.paseka.journal.diagnostic.idbatomicv1';
const DB_NAME='paseka-p1-atomic-diagnostic-synthetic-v1';
const TAG='PASEKA_P1_ATOMIC_SYNTHETIC_ONLY';
const STORE='main',BACKUP_STORE='full_backup';
let latest='';
const $=id=>document.getElementById(id);
const fail=code=>{throw Error(code);};
const copy=value=>JSON.parse(JSON.stringify(value));
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fixture=counter=>({
  diagnosticTag:TAG,counter,
  meta:{schemaVersion:15,revisionId:'synthetic-'+counter},
  hives:[{id:'synthetic-hive-not-user-data'}]
});
function validState(x){
 return x&&x.diagnosticTag===TAG&&Number.isSafeInteger(x.counter)&&x.counter>=0&&
  x.counter<1000000&&x.meta?.schemaVersion===15&&
  x.meta?.revisionId==='synthetic-'+x.counter&&
  Array.isArray(x.hives)&&x.hives.length===1&&
  x.hives[0]?.id==='synthetic-hive-not-user-data';
}
function openDb(){
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB_NAME,1);
  req.onupgradeneeded=()=>{
   if(req.transaction?.db?.objectStoreNames.length!==0)throw Error('P1_UNKNOWN_SCHEMA_PRESERVE');
   req.result.createObjectStore(STORE);
   req.result.createObjectStore(BACKUP_STORE);
  };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||Error('P1_DB_OPEN_FAILED'));
  req.onblocked=()=>reject(Error('P1_DB_OPEN_BLOCKED'));
 });
}
function txDone(tx){
 return new Promise((resolve,reject)=>{
  tx.oncomplete=resolve;
  tx.onabort=()=>reject(tx.error||Error('P1_TX_ABORT'));
  tx.onerror=()=>reject(tx.error||Error('P1_TX_ERROR'));
 });
}
function readPair(db){
 return new Promise((resolve,reject)=>{
  let main,backup;
  const tx=db.transaction([STORE,BACKUP_STORE],'readonly');
  const a=tx.objectStore(STORE).get('state');
  const b=tx.objectStore(BACKUP_STORE).get('previous');
  a.onsuccess=()=>{main=a.result;};
  b.onsuccess=()=>{backup=b.result;};
  tx.oncomplete=()=>resolve({main,backup});
  tx.onabort=()=>reject(tx.error||Error('P1_READ_ABORT'));
  tx.onerror=()=>reject(tx.error||Error('P1_READ_ERROR'));
 });
}
async function ensureFixture(db){
 let current=await readPair(db);
 if(current.main===undefined&&current.backup===undefined){
  const initial=fixture(0);
  const backup={at:'2026-11-23T00:00:00.000Z',state:copy(initial)};
  const tx=db.transaction([STORE,BACKUP_STORE],'readwrite');
  tx.objectStore(STORE).add(initial,'state');
  tx.objectStore(BACKUP_STORE).add(backup,'previous');
  await txDone(tx);
  current=await readPair(db);
 } else if(current.main===undefined||current.backup===undefined){
  fail('P1_INCOMPLETE_LOCAL_FIXTURE_PRESERVE');
 }
 if(!validState(current.main)||!validState(current.backup.state)||
    typeof current.backup.at!=='string'||!Number.isFinite(Date.parse(current.backup.at)))
  fail('P1_UNKNOWN_LOCAL_FIXTURE_PRESERVE');
 return current;
}
function writer(db){
 const factory=window.PasekaDiagnosticAtomicWriter?.create;
 if(typeof factory!=='function')fail('P1_PRODUCTION_WRITER_MISSING');
 return factory({db,STORE,BACKUP_STORE,
  assertBackupNotFromNewerSchema:backup=>{
   if(backup?.state?.meta?.schemaVersion>15)
     fail('P1_BACKUP_NEWER_SCHEMA_PRESERVE');
  }
 });
}
async function test(){
 let db;
 const checks={};
 const result={
  suite:'PHONE_IDB_ATOMIC_SYNTHETIC_V1',packageId:PKG,
  status:'BLOCKED',code:'P1_ATOMIC_TEST_INCOMPLETE',checks,
  scope:{syntheticOnly:true,injectedQuota:true,actualAndroidQuota:'NOT_TESTED',
   productionDb:'NOT_ACCESSED',userMedia:'NOT_ACCESSED',
   fullArchiveRestore:'NOT_TESTED',androidPowerLoss:'NOT_TESTED',
   networkTraffic:'NOT_MEASURED',beeRecognition:'NOT_TESTED'},
  cleanupAuthorized:false,deleteAllowed:false,restoreAuthorized:false,
  userDataModified:false
 };
 try{
  db=await openDb();
  const original=await ensureFixture(db);
  checks.syntheticFixture={status:'PASS',previousCounter:original.main.counter};
  const previous=copy(original);
  if(original.main.counter>=999999)fail('P1_TEST_COUNTER_LIMIT_PRESERVE');
  const next=fixture(original.main.counter+1);
  const proto=IDBObjectStore?.prototype;
  const nativePut=proto?.put;
  if(typeof nativePut!=='function')fail('P1_OBJECT_STORE_PROTOTYPE_UNAVAILABLE');
  const descriptor=Object.getOwnPropertyDescriptor(proto,'put');
  if(!descriptor?.writable)fail('P1_CANNOT_INJECT_SAFELY');
  let mainQueued=0,backupFaults=0,failure;
  const injected=function(value,key){
   if(this.name===BACKUP_STORE&&key==='previous'){
    if(mainQueued<1)fail('P1_FAULT_ORDER_INVALID');
    backupFaults++;
    throw new DOMException('synthetic quota fault after main.put','QuotaExceededError');
   }
   if(this.name===STORE&&key==='state')mainQueued++;
   return nativePut.call(this,value,key);
  };
  proto.put=injected;
  if(proto.put!==injected)fail('P1_CANNOT_INJECT_SAFELY');
  try{
   await writer(db)(next,original.main.meta.revisionId);
   fail('P1_QUOTA_FAULT_NOT_TRIGGERED');
  }catch(e){failure=e;}
  finally{proto.put=nativePut;}
  if(failure?.name!=='QuotaExceededError'||mainQueued!==1||backupFaults!==1)
   fail('P1_QUOTA_INJECTION_NOT_PROVEN');
  checks.syntheticQuotaAfterMainWrite={status:'PASS',name:failure.name,mainPutQueued:mainQueued,backupPutFaulted:backupFaults};
  db.close();db=await openDb();
  const afterAbort=await readPair(db);
  if(!eq(afterAbort.main,previous.main)||!eq(afterAbort.backup,previous.backup))
   fail('P1_ATOMIC_ABORT_MUTATED_FIXTURE_PRESERVE');
  checks.abortPreservedMainAndBackup={status:'PASS'};
  const stale=original.main.meta.revisionId+'-stale';
  let conflict=null;
  try{await writer(db)(next,stale);}catch(e){conflict=e;}
  if(conflict?.name!=='PasekaConflictError')fail('P1_REVISION_CONFLICT_NOT_ENFORCED');
  const afterConflict=await readPair(db);
  if(!eq(afterConflict.main,previous.main)||!eq(afterConflict.backup,previous.backup))
   fail('P1_REVISION_CONFLICT_MUTATED_FIXTURE_PRESERVE');
  checks.staleRevisionRejected={status:'PASS'};
  await writer(db)(next,original.main.meta.revisionId);
  db.close();db=await openDb();
  const afterRetry=await readPair(db);
  if(!eq(afterRetry.main,next)||!eq(afterRetry.backup?.state,original.main))
   fail('P1_RETRY_OR_BACKUP_MISMATCH_PRESERVE');
  checks.retryAndBackup={status:'PASS',nextCounter:next.counter};
  result.status='PASS';
  result.code='SYNTHETIC_QUOTA_ABORT_ATOMIC_RETRY_ONLY';
  return result;
 }finally{try{db?.close();}catch{}}
}
async function run(){
 try{return await test();}
 catch(e){return {
  suite:'PHONE_IDB_ATOMIC_SYNTHETIC_V1',packageId:PKG,
  status:'BLOCKED',code:String(e?.message||'UNKNOWN').slice(0,100),
  scope:{syntheticOnly:true,actualAndroidQuota:'NOT_TESTED',
   productionDb:'NOT_ACCESSED',userMedia:'NOT_ACCESSED',
   fullArchiveRestore:'NOT_TESTED',networkTraffic:'NOT_MEASURED',
   beeRecognition:'NOT_TESTED'},
  cleanupAuthorized:false,deleteAllowed:false,restoreAuthorized:false,
  userDataModified:false
 };}
}
$('run').addEventListener('click',async()=>{
 $('run').disabled=true;$('copy').disabled=true;latest='';
 $('result').textContent='Проверка атомарности тестовых данных…';
 latest=JSON.stringify(await run(),null,2);
 $('result').textContent=latest;
 $('run').disabled=false;$('copy').disabled=false;
});
$('copy').addEventListener('click',async()=>{
 if(!latest)return;
 try{
  const data=JSON.parse(latest);
  if(data.packageId!==PKG||data.cleanupAuthorized!==false||
     data.deleteAllowed!==false||data.restoreAuthorized!==false)
   fail('P1_REPORT_UNSAFE');
  const clipboard=window.Capacitor?.Plugins?.Clipboard;
  if(!clipboard?.write)fail('P1_CLIPBOARD_UNAVAILABLE');
  await clipboard.write({string:latest});
  $('copy').textContent='Скопировано — вставьте JSON в чат';
 }catch{$('copy').textContent='Скопировать не удалось — JSON показан ниже';}
});
})();
