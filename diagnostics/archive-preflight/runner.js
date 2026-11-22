(function() {
'use strict';
const runButton=document.getElementById('run');
const reportElement=document.getElementById('result');
const shareButton=document.getElementById('share');
const shareStatus=document.getElementById('share-status');
let latestReport=null;
const dbName='paseka_archive_preflight_synthetic_only_v1';
const packageId='ru.paseka.journal.diagnostic.archivepreflight';
const guard=window.PasekaAndroidArchivePreflight;
const fixtureBytes=new TextEncoder().encode('PASEKA_SYNTHETIC_ARCHIVE_BYTES_V1_NOT_A_VIDEO');
const expectedIds=['synthetic-a','synthetic-b'];
const checked=[];
function requireCondition(condition,code){if(!condition)throw Error(code);}
function requestResult(req) {
 return new Promise((resolve,reject)=>{
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||Error('IDB_REQUEST_FAILED'));
 });
}
function transactionResult(tx) {
 return new Promise((resolve,reject)=>{
  tx.oncomplete=()=>resolve();
  tx.onerror=()=>reject(tx.error||Error('IDB_TX_FAILED'));
  tx.onabort=()=>reject(tx.error||Error('IDB_TX_ABORT'));
 });
}
function openDatabase() {
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(dbName,1);
  req.onupgradeneeded=()=>{
   if(!req.result.objectStoreNames.contains('synthetic')) {
    req.result.createObjectStore('synthetic',{keyPath:'id'});
   }
  };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||Error('DB_OPEN_FAILED'));
  req.onblocked=()=>reject(Error('DB_OPEN_BLOCKED'));
 });
}
async function digest(value) {
 const array=value instanceof Blob?await value.arrayBuffer():value;
 const result=await crypto.subtle.digest('SHA-256',array);
 return Array.from(new Uint8Array(result),x=>x.toString(16).padStart(2,'0')).join('');
}
async function readRecords(db) {
 const tx=db.transaction('synthetic','readonly');
 const done=transactionResult(tx);
 const data=await requestResult(tx.objectStore('synthetic').getAll());
 await done;
 return data.sort((a,b)=>a.id.localeCompare(b.id));
}
async function prepareRecords(db) {
 const rows=await readRecords(db);
 if(rows.length!==0) {
  requireCondition(rows.length===2&&rows.every(x=>expectedIds.includes(x.id)&&x.synthetic===true),
   'UNKNOWN_EXISTING_SYNTHETIC_STORE_CONTENT');
  return;
 }
 const hash=await digest(fixtureBytes);
 const tx=db.transaction('synthetic','readwrite');
 const done=transactionResult(tx);
 for(const id of expectedIds) {
  tx.objectStore('synthetic').add({
   id,synthetic:true,source:'entrance_media',videoId:id,
   sourceSha256:hash,sourceBytes:fixtureBytes.length,
   sourceEvidenceVersion:1,
   resultId:'result-'+id,recognizedAt:'2026-11-22T00:00:00Z',
   result:{kind:'synthetic_only'},payload:new Blob([fixtureBytes],{type:'application/octet-stream'})
  });
 }
 await done;
}
async function verifyRows(rows) {
 requireCondition(rows.length===2&&rows.every((r,i)=>r.id===expectedIds[i]),'FIXTURE_COPY_COUNT');
 for(const row of rows) {
  requireCondition(row.synthetic===true&&row.sourceBytes===fixtureBytes.length&&
   row.sourceSha256===await digest(fixtureBytes),'FIXTURE_METADATA_CHANGED');
  requireCondition(row.payload instanceof Blob,'SYNTHETIC_BLOB_MISSING');
  requireCondition(row.payload.size===fixtureBytes.length,'SYNTHETIC_BLOB_LENGTH_CHANGED');
  requireCondition(await digest(row.payload)===row.sourceSha256,'SYNTHETIC_BLOB_SHA_CHANGED');
 }
}
function metadata(rows) {
 return rows.map(({payload,synthetic,id,...item})=>item);
}
function denied(report) {
 for(const prop of ['cleanupAuthorized','restoreAuthorized','archiveSafe',
  'physicalRestoreVerified','byteIntegrityVerified']) requireCondition(report[prop]===false,'UNSAFE_FLAG_'+prop);
}
function assertBlocked(records,expectedIssue,scenario) {
 const output=guard.inspect(records);
 requireCondition(output.ok===false&&output.requiresManualReview===true,'FALSE_ACCEPT_'+scenario);
 requireCondition(output.issues.includes(expectedIssue),'EXPECTED_ISSUE_MISSING_'+scenario);
 denied(output);
 checked.push(scenario+':PASS');
}
async function run() {
 runButton.disabled=true;
 shareButton.disabled=true;
 latestReport=null;
 shareStatus.textContent='Выполняется проверка';
 reportElement.textContent='RUNNING';
 checked.length=0;
 let db=null;
 try {
  requireCondition(typeof indexedDB!=='undefined'&&crypto&&crypto.subtle&&guard,'REQUIRED_LOCAL_CAPABILITY_MISSING');
  db=await openDatabase();
  await prepareRecords(db);
  const originals=await readRecords(db);
  await verifyRows(originals);
  const clean=guard.inspect(metadata(originals));
  requireCondition(clean.ok===true,'VALID_FIXTURE_METADATA_REJECTED');
  denied(clean);
  checked.push('A01_SYNTHETIC_COPY_HASH:PASS');
  // These are simulated negative conditions in volatile memory, not destructive DB operations.
  assertBlocked([{...metadata(originals)[0],sourceSha256:'bad'}],
   'SOURCE_EVIDENCE_INVALID','A04_BAD_SOURCE_EVIDENCE');
  const both=metadata(originals);
  assertBlocked([both[0],{...both[0],sourceSha256:'b'.repeat(64),resultId:'another-result'}],
   'SOURCE_COPY_CONFLICT','A05_CONFLICTING_COPY');
  assertBlocked([both[0],{...both[1],resultId:both[0].resultId}],
   'RESULT_ID_DUPLICATE','A06_DUPLICATE_RESULT_ID');
  db.close();
  db=await openDatabase();
  await verifyRows(await readRecords(db));
  checked.push('A01_CLOSE_REOPEN_INTEGRITY:PASS');
  const tx=db.transaction('synthetic','readonly');
  const finished=transactionResult(tx);
  tx.objectStore('synthetic').get('synthetic-a');
  tx.abort();
  let observedAbort=false;
  try { await finished; } catch(_) { observedAbort=true; }
  requireCondition(observedAbort,'READONLY_ABORT_NOT_OBSERVED');
  await verifyRows(await readRecords(db));
  checked.push('A07_READONLY_ABORT_UNCHANGED:PASS');
  checked.push('A10_SYNTHETIC_FIXTURES_UNCHANGED:PASS');
  reportElement.textContent=JSON.stringify({
   status:'PASS',code:'SYNTHETIC_OFFLINE_PREFLIGHT_PARTIAL',
   packageId,suite:'ARCHIVE_PREFLIGHT_V1',checks:checked,
   scenariosVerified:['A01','A04_METADATA_ONLY','A05_METADATA_ONLY','A06_METADATA_ONLY','A07','A10_SYNTHETIC_ONLY'],
   scenariosNotTested:['A02_REAL_PASEKA01','A03_REAL_PASEKA02','A08_PROCESS_KILL','A09_NETWORK_PERMISSION_DEVICE_AUDIT'],
   beeRecognition:'NOT_TESTED',realArchiveRestore:'NOT_TESTED',realVideoAccess:'NOT_ATTEMPTED',
   externalMediaAccess:'NOT_ATTEMPTED',videoDeletion:'NOT_ATTEMPTED',
   cleanupAuthorized:false,restoreAuthorized:false,archiveSafe:false,
   networkRequests:'NOT_ATTEMPTED',userDataModified:false
  },null,2);
 } catch(error) {
  reportElement.textContent=JSON.stringify({
   status:'BLOCKED',code:String(error&&error.message||error),packageId,
   checks:checked,realVideoAccess:'NOT_ATTEMPTED',beeRecognition:'NOT_TESTED',
   cleanupAuthorized:false,restoreAuthorized:false,archiveSafe:false
  },null,2);
 } finally {
  if(db)db.close();
  runButton.disabled=false;
  latestReport=reportElement.textContent;
  try {
   window.PasekaDiagnosticShare.checkedReport(latestReport);
   shareButton.disabled=false;
   shareStatus.textContent='Отчёт готов. Нажмите «Отправить результат» и выберите приложение.';
  } catch(_) {
   latestReport=null;
   shareButton.disabled=true;
   shareStatus.textContent='Отчёт некорректен: отправка заблокирована.';
  }
 }
}
async function shareResult() {
 if(shareButton.disabled || !latestReport)return;
 shareButton.disabled=true;
 shareStatus.textContent='Открывается меню отправки Android…';
 try {
  const share=window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share;
  await window.PasekaDiagnosticShare.shareReport(latestReport,share);
  shareStatus.textContent='Меню отправки закрыто. Проверьте, что сообщение действительно отправлено выбранным приложением.';
 } catch(error) {
  shareStatus.textContent='Отправка не подтверждена: '+String(error&&error.message||error)+'. Отчёт сохранён на экране.';
 } finally {
  shareButton.disabled=false;
 }
}
runButton.addEventListener('click',run);
shareButton.addEventListener('click',shareResult);
})();
