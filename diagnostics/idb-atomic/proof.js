(function(root){
'use strict';
// Standalone test-only IndexedDB: no use of product DB, videos or archives.
// Does NOT cause a real device quota event. Synthetic QuotaExceededError is
// injected before backup.put; actual ConstraintError exercises native IDB abort.
const DB='paseka-diagnostic-idb-atomic-v1';
const PKG='ru.paseka.journal.diagnostic.idbatomicv1';
const mainKey='state', backupKey='previous';
const marker='PASEKA_SYNTHETIC_ATOMIC_V1';
const pair=revision=>({
 state:{marker,revision,synthetic:true},
 backup:{marker,revision,synthetic:true}
});
const baseline=pair('baseline');
const next=pair('next');
const fail=code=>{throw Error(code);};
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const identical=(a,b)=>eq(a?.state,b.state)&&eq(a?.backup,b.backup);
function open(factory){
 return new Promise((resolve,reject)=>{
  const req=factory.open(DB,1);
  req.onupgradeneeded=()=>{
   const db=req.result;
   if(!db.objectStoreNames.contains('main'))db.createObjectStore('main');
   if(!db.objectStoreNames.contains('full_backup'))db.createObjectStore('full_backup');
  };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(Error('DB_OPEN_FAILED'));
 });
}
function done(tx,abortExpected=false){
 return new Promise((resolve,reject)=>{
  tx.oncomplete=()=>abortExpected?reject(Error('UNEXPECTED_TRANSACTION_COMMIT')):resolve({aborted:false});
  tx.onabort=()=>abortExpected?resolve({aborted:true,name:tx.error?.name||'ExplicitAbort'}):reject(Error('UNEXPECTED_TRANSACTION_ABORT'));
  tx.onerror=()=>{}; // Do not prevent native IDB error propagation/transaction abort.
 });
}
function read(db){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(['main','full_backup'],'readonly');
  const state=tx.objectStore('main').get(mainKey);
  const backup=tx.objectStore('full_backup').get(backupKey);
  tx.oncomplete=()=>resolve({state:state.result,backup:backup.result});
  tx.onabort=tx.onerror=()=>reject(Error('DB_READ_FAILED'));
 });
}
async function write(db,value){
 const tx=db.transaction(['main','full_backup'],'readwrite');
 const completed=done(tx);
 tx.objectStore('main').put(value.state,mainKey);
 tx.objectStore('full_backup').put(value.backup,backupKey);
 await completed;
}
async function nativeFailure(db){
 const tx=db.transaction(['main','full_backup'],'readwrite');
 const ended=done(tx,true);
 tx.objectStore('main').put(pair('must-not-commit').state,mainKey);
 // Existing key in full_backup -> genuine IndexedDB ConstraintError. The
 // prior main.put MUST be rolled back by the browser, not our own rewrite.
 tx.objectStore('full_backup').add(pair('must-not-commit').backup,backupKey);
 const report=await ended;
 if(report.name!=='ConstraintError')fail('CONSTRAINT_ERROR_NOT_OBSERVED');
 return report.name;
}
async function injectedQuotaFailure(db,DOMExceptionClass){
 const tx=db.transaction(['main','full_backup'],'readwrite');
 const ended=done(tx,true);
 tx.objectStore('main').put(pair('must-not-commit').state,mainKey);
 let caught=false;
 try {
  // Deliberately injected to avoid filling phone storage.
  throw new DOMExceptionClass('Synthetic quota failure','QuotaExceededError');
 }catch(error){
  if(error?.name!=='QuotaExceededError')fail('QUOTA_INJECTION_MISSING');
  caught=true;
  tx.abort(); // abort the entire transaction after main.put was queued.
 }
 const report=await ended;
 if(!caught||report.name!=='ExplicitAbort')fail('QUOTA_ABORT_NOT_OBSERVED');
 return 'QuotaExceededError:INJECTED_ONLY';
}
async function run({indexedDB:factory,DOMException:DOMExceptionClass}={}){
 const report={suite:'PHONE_IDB_ATOMIC_FAULT_V1',packageId:PKG,status:'BLOCKED',code:'UNVERIFIED',
  checks:{},scope:{syntheticOnly:true,androidActualQuota:'NOT_TESTED',
   syntheticQuotaInjection:true,nativeConstraintAbort:true,realVideos:'NOT_ACCESSED',
   productDatabase:'NOT_ACCESSED',realBackupRestore:'NOT_TESTED',beeRecognition:'NOT_TESTED',
   networkTraffic:'NOT_MEASURED',realVideoDeletion:'NOT_TESTED'},
  cleanupAuthorized:false,deleteAllowed:false,restoreAuthorized:false,
  userDataModified:false,externalRequests:'NOT_MEASURED'};
 if(!factory?.open||typeof DOMExceptionClass!=='function'){
  report.code='IDB_DEPENDENCIES_UNAVAILABLE';return report;
 }
 let db;
 try{
  db=await open(factory);
  let initial=await read(db);
  if(initial.state===undefined&&initial.backup===undefined){
   await write(db,baseline);
   report.checks.fixture='ABSENT_CREATED';
  }else if(identical(initial,baseline)||identical(initial,next)){
   report.checks.fixture='PRESENT_VERIFIED';
  }else fail('UNRECOGNIZED_FIXTURE_PRESERVE');
  db.close();db=await open(factory);
  initial=await read(db);
  if(!identical(initial,baseline)&&!identical(initial,next))
   fail('FIXTURE_REOPEN_MISMATCH_PRESERVE');
  report.checks.nativeConstraintError=await nativeFailure(db);
  db.close();db=await open(factory);
  if(!identical(await read(db),initial))fail('CONSTRAINT_ABORT_NOT_ATOMIC_PRESERVE');
  report.checks.constraintAbort='PASS';
  report.checks.quotaInjection=await injectedQuotaFailure(db,DOMExceptionClass);
  db.close();db=await open(factory);
  if(!identical(await read(db),initial))fail('QUOTA_ABORT_NOT_ATOMIC_PRESERVE');
  report.checks.quotaAbort='PASS';
  const target=identical(initial,baseline)?next:baseline;
  await write(db,target);
  db.close();db=await open(factory);
  if(!identical(await read(db),target))fail('SUCCESSFUL_RETRY_NOT_ATOMIC_PRESERVE');
  report.checks.retryAfterReopen='PASS';
  report.checks.knownSyntheticState=target.state.revision;
  report.status='PASS';report.code='SYNTHETIC_IDB_FAULT_ONLY';
 }catch(error){
  report.code=String(error?.message||'UNEXPECTED_TEST_ERROR').slice(0,90);
 }finally{try{db?.close();}catch{}}
 return report;
}
root.PasekaAndroidIdbAtomicProof=Object.freeze({run});
})(typeof window!=='undefined'?window:globalThis);
