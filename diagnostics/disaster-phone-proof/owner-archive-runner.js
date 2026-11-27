/* B01 test-only local archive import. Do NOT ship with production app.
 * Import is explicit, into a NEW empty DB belonging only to diagnostic APK.
 * Never touches ru.paseka.journal, network, uploaded data or original files.
 * A page reload is NOT Android process restart proof; external adb evidence required.
 */
(function(root){
'use strict';
const DB='paseka-b01-owner-disposable-v1';
const EXPECTED_BYTES=299687;
const EXPECTED_FILE_SHA='049cec79d7e0a49c5fc2ca33f81d0b9871ca141e8fdf58aecbdd2307c37c98ff';
const EXPECTED_PAYLOAD_SHA='bc837c49744e2b03d489f7d35f959afdae717a85b14e828c7eb1763f2252f107';
const CHECKPOINT='paseka-b01-owner-isolated-receipt-v1';
const TAG='PASEKA_B01_ANDROID_OWNER_ARCHIVE_REPORT';
const EXPECTED_COUNTS={entrance_media:0,full_backup:1,main:1};
let started=false;
function ensure(ok,code){if(!ok)throw Error(code);}
function emit(status,code,additional={}){
 const record={gate:'B01_REAL_FILE_DISPOSABLE_ANDROID_IDB',status,code,
  originalPhone:'NOT_ACCESSED',productionPackage:'NOT_ACCESSED',
  originalPCArchive:'NOT_MODIFIED',archiveUploaded:false,
  deviceClass:'UNVERIFIED_REQUIRES_ADB_EMULATOR_CHECK',
  realOnePlusRestore:'NOT_ATTEMPTED',...additional};
 const out=document.getElementById('b01-owner-report');
 if(out)out.textContent=JSON.stringify(record,null,2);
 console.log(TAG+' '+JSON.stringify(record));
}
function buttonPanel(){
 const el=document.createElement('section');el.id='b01-owner-import';
 el.style.cssText='position:fixed;z-index:2147483647;right:0;bottom:0;left:0;max-height:42vh;overflow:auto;background:#eff5ff;color:#121b30;border-top:4px solid #4362a0;padding:10px;font:13px system-ui';
 const title=document.createElement('div');title.textContent='B01 · Только отдельный диагностический Android-пакет. Восстановление пользовательского архива в ПУСТУЮ тестовую базу.';
 const label=document.createElement('label');label.textContent='Выбрать локальный архив из эмулятора: ';
 const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
 label.appendChild(input);
 const info=document.createElement('div');info.textContent='Никаких сетевых запросов или удаления. Не устанавливать этот APK на рабочий OnePlus. Положительный результат на Android подтвердит сохранность в отдельном WebView, но не работу версии production и не штатный rollback.';
 const report=document.createElement('pre');report.id='b01-owner-report';report.style.cssText='white-space:pre-wrap;word-break:break-word;';
 el.append(title,label,info,report);document.body.append(el);
 input.addEventListener('change',async()=>{
  const file=input.files?.[0];input.value='';
  if(!file)return;
  input.disabled=true;
  try{await importLocalFile(file);}
  catch(e){emit('BLOCKED',String(e?.message||'UNKNOWN').replace(/[^A-Z0-9_]/g,'').slice(0,90)||'UNKNOWN');}
  finally{input.disabled=false;}
 });
}
function storeCheck(actual){
 ensure(actual?.manifest?.sha256===EXPECTED_PAYLOAD_SHA,'PAYLOAD_SHA_MISMATCH');
 const counts=actual?.manifest?.counts||{};
 ensure(Object.keys(counts).length===3 &&
   Object.keys(EXPECTED_COUNTS).every(k=>counts[k]===EXPECTED_COUNTS[k]),'COUNTS_MISMATCH');
}
async function openExisting(){
 return new Promise((ok,no)=>{const q=indexedDB.open(DB);
  q.onupgradeneeded=()=>{try{q.transaction.abort();}catch(_){}
    no(Error('TARGET_ABSENT_OR_UPGRADE_BLOCKED'));};
  q.onerror=()=>no(q.error||Error('TARGET_OPEN_FAILED'));
  q.onblocked=()=>no(Error('TARGET_BLOCKED'));
  q.onsuccess=()=>ok(q.result);
 });
}
async function openNew(){
 ensure(typeof indexedDB.databases==='function','DATABASE_LIST_UNAVAILABLE');
 const dbs=await indexedDB.databases();
 ensure(!dbs.some(x=>x.name===DB),'TARGET_NOT_FRESH_REFUSE_OVERWRITE');
 return new Promise((ok,no)=>{const q=indexedDB.open(DB,3);
  q.onupgradeneeded=()=>{const d=q.result;
   d.createObjectStore('main');d.createObjectStore('full_backup');
   d.createObjectStore('entrance_media',{keyPath:'id'});};
  q.onerror=()=>no(q.error||Error('TARGET_CREATE_FAILED'));
  q.onblocked=()=>no(Error('TARGET_BLOCKED'));
  q.onsuccess=()=>ok(q.result);
 });
}
async function verifyTarget(db){
 const json=JSON.parse(await root.PasekaDisasterArchive.exportArchive(db));
 storeCheck(json);
 return true;
}
async function importLocalFile(file){
 ensure(root.location?.protocol==='https:','NOT_SECURE_ORIGIN');
 ensure(root.PasekaDisasterArchive?.format==='paseka-idb-full-v1','ARCHIVE_API_NOT_READY');
 ensure(Number.isSafeInteger(file.size)&&file.size===EXPECTED_BYTES,'UNEXPECTED_FILE_SIZE');
 ensure(!root.localStorage.getItem(CHECKPOINT),'ARCHIVE_ALREADY_RESTORED_RESTART_TEST_PENDING');
 const bytes=await file.arrayBuffer();
 const digest=new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes));
 const sha=Array.from(digest,x=>x.toString(16).padStart(2,'0')).join('');
 ensure(sha===EXPECTED_FILE_SHA,'UNEXPECTED_FILE_SHA');
 const raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 const envelope=JSON.parse(raw);
 ensure(envelope?.manifest?.format==='paseka-idb-full-v1' &&
 envelope?.payload?.database==='paseka-v1' &&
 envelope?.payload?.version===3,'FORMAT_OR_DB_VERSION_MISMATCH');
 ensure(envelope.payload.stores?.length===3,'STORE_MANIFEST_NOT_EXACT');
 let target;
 try{
  target=await openNew();
  const names=Array.from(target.objectStoreNames);
  for(const name of names){
   const count=await new Promise((ok,no)=>{const tx=target.transaction(name,'readonly'),q=tx.objectStore(name).count();
    q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});
   ensure(count===0,'TARGET_NOT_EMPTY');
  }
  const preflight=await root.PasekaDisasterArchive.inspectArchive(raw,target);
  ensure(preflight.sha256===EXPECTED_PAYLOAD_SHA,'PAYLOAD_SHA_MISMATCH');
  ensure(Object.keys(preflight.counts).length===3 &&
    Object.keys(EXPECTED_COUNTS).every(k=>preflight.counts[k]===EXPECTED_COUNTS[k]),'COUNTS_MISMATCH');
  await root.PasekaDisasterArchive.atomicRestore(target,preflight,null);
  const first=await root.PasekaDisasterArchive.verifyRestoredArchive(target,preflight);
  ensure(first.verified,'FIRST_READBACK_FAILED');
 }finally{target?.close();}
 target=await openExisting();
 try{await verifyTarget(target);}finally{target.close();}
 root.localStorage.setItem(CHECKPOINT,JSON.stringify({sha256:EXPECTED_PAYLOAD_SHA}));
 emit('PASS_TARGET_READBACK_NOT_PROCESS_RESTART','REAL_FILE_EMPTY_ANDROID_IDB_RESTORE_PASS',{
  bytes:EXPECTED_BYTES,storeCounts:EXPECTED_COUNTS,
  targetDbReopened:true,processRestart:'NOT_TESTED',
  externalDeviceEvidence:'REQUIRED'});
}
async function onStart(){
 if(started)return;started=true;
 buttonPanel();
 const receipt=root.localStorage.getItem(CHECKPOINT);
 if(!receipt){emit('READY','SELECT_LOCAL_ARCHIVE_ON_EMULATOR');return;}
 let target;
 try{
  const parsed=JSON.parse(receipt);
  ensure(parsed.sha256===EXPECTED_PAYLOAD_SHA,'INVALID_LOCAL_RECEIPT');
  target=await openExisting();
  await verifyTarget(target);
  emit('PASS_READBACK_AFTER_RELAUNCH_DEVICE_CLASS_UNVERIFIED',
    'REAL_FILE_REOPEN_BYTES_VERIFIED',{
      bytes:EXPECTED_BYTES,storeCounts:EXPECTED_COUNTS,
      postRelaunchReadback:true,
      externallyConfirmedForceStop:false});
 }catch(e){emit('BLOCKED',String(e?.message||'UNKNOWN').replace(/[^A-Z0-9_]/g,'').slice(0,90)||'UNKNOWN');}
 finally{target?.close();}
}
root.PasekaB01OwnerArchive=Object.freeze({start:onStart});
})(window);
