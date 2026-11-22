(function(){
'use strict';
const PACKAGE='ru.paseka.journal.diagnostic.archivea08v1';
const DB='paseka_a08_only_synthetic_v1';
const bytes=new TextEncoder().encode('A08_ONLY_SYNTHETIC_BLOB_NOT_MEDIA_2026_11_22');
const runButton=document.getElementById('run');
const copyButton=document.getElementById('copy');
const statusEl=document.getElementById('status');
const resultEl=document.getElementById('result');
const COPY=window.PasekaDiagnosticCopy;
let last=null;
function assert(v,code){if(!v)throw Error(code);}
function plugin(){
 return window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.A08Process;
}
function req(r){return new Promise((resolve,reject)=>{
 r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('IDB_REQUEST'));
});}
function done(t){return new Promise((resolve,reject)=>{
 t.oncomplete=resolve;t.onabort=()=>reject(t.error||Error('IDB_ABORT'));t.onerror=()=>reject(t.error||Error('IDB_ERROR'));
});}
function openDb(){return new Promise((resolve,reject)=>{
 const r=indexedDB.open(DB,1);
 r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('synthetic'))r.result.createObjectStore('synthetic',{keyPath:'id'});};
 r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('DB_OPEN'));
 r.onblocked=()=>reject(Error('DB_BLOCKED'));
});}
async function hash(v){
 const buffer=v instanceof Blob?await v.arrayBuffer():v;
 const out=await crypto.subtle.digest('SHA-256',buffer);
 return Array.from(new Uint8Array(out),x=>x.toString(16).padStart(2,'0')).join('');
}
async function rows(db){
 const tx=db.transaction('synthetic','readonly'),wait=done(tx);
 const result=await req(tx.objectStore('synthetic').getAll());
 await wait;return result;
}
async function ensureFixture(db){
 const all=await rows(db);
 assert(all.every(x=>['a08-a','a08-b','a08-pending'].includes(x.id)),'UNKNOWN_SYNTHETIC_RECORD');
 if(all.some(x=>x.id==='a08-a')||all.some(x=>x.id==='a08-b')){
  assert(all.some(x=>x.id==='a08-a')&&all.some(x=>x.id==='a08-b'),'PARTIAL_FIXTURE');
  return;
 }
 const sha=await hash(bytes);
 const tx=db.transaction('synthetic','readwrite'),wait=done(tx);
 for(const id of ['a08-a','a08-b'])tx.objectStore('synthetic').add({
  id,synthetic:true,sourceSha256:sha,payload:new Blob([bytes],{type:'application/octet-stream'}),sourceBytes:bytes.length
 });
 await wait;
}
async function verify(db){
 const all=await rows(db),hashExpected=await hash(bytes);
 assert(all.length===3,'A08_UNEXPECTED_RECORD_COUNT');
 const records=all.filter(x=>x.id!=='a08-pending').sort((a,b)=>a.id.localeCompare(b.id));
 assert(records.length===2&&records[0].id==='a08-a'&&records[1].id==='a08-b','A08_FIXTURE_IDS');
 for(const r of records){
  assert(r.synthetic===true&&r.payload instanceof Blob&&r.payload.size===bytes.length,'A08_BLOB_MISSING');
  assert(r.sourceBytes===bytes.length&&r.sourceSha256===hashExpected,'A08_METADATA_CHANGED');
  assert(await hash(r.payload)===hashExpected,'A08_BLOB_SHA_CHANGED');
 }
 const mark=all.find(x=>x.id==='a08-pending');
 assert(mark&&mark.synthetic===true&&mark.expectedSha256===hashExpected&&
  typeof mark.nonce==='string'&&/^[0-9a-f]{32}$/.test(mark.nonce),'A08_CHECKPOINT_INVALID');
 return mark;
}
function report(status,code,extra={}){
 const value={status,code,packageId:PACKAGE,suite:'ARCHIVE_A08_PROCESS_KILL_V1',
  checks:status==='PASS'?['A08_SYNTHETIC_BLOB_HASH_AFTER_PROCESS_KILL:PASS','A08_NATIVE_PID_CHANGED:PASS']:[],
  scenariosVerified:status==='PASS'?['A08_PROCESS_KILL_SYNTHETIC_ONLY']:[],
  scenariosNotTested:['A02_REAL_PASEKA01','A03_REAL_PASEKA02','A09_NETWORK_PERMISSION_DEVICE_AUDIT','A08_ANDROID_FORCE_STOP'],
  beeRecognition:'NOT_TESTED',realArchiveRestore:'NOT_TESTED',realVideoAccess:'NOT_ATTEMPTED',
  externalMediaAccess:'NOT_ATTEMPTED',videoDeletion:'NOT_ATTEMPTED',
  cleanupAuthorized:false,restoreAuthorized:false,archiveSafe:false,
  networkRequests:'NOT_ATTEMPTED',userDataModified:false,...extra};
 last=JSON.stringify(value,null,2);
 resultEl.textContent=last;
 copyButton.disabled=false;
 statusEl.textContent=status==='PASS'?'PASS: нажмите «Копировать результат».':'BLOCKED: нажмите «Копировать результат».';
}
async function initial(){
 if(!window.indexedDB||!window.crypto||!crypto.subtle) {
  report('BLOCKED','A08_REQUIRED_API_MISSING');return;
 }
 let db;
 try{
  db=await openDb();
  const all=await rows(db);
  const mark=all.find(x=>x.id==='a08-pending');
  if(!mark)return;
  runButton.disabled=true;
  statusEl.textContent='Проверяю сохранность после перезапуска…';
  const found=await verify(db);
  const native=plugin();
  assert(native&&typeof native.readProof==='function','A08_NATIVE_PLUGIN_MISSING');
  const result=await native.readProof({nonce:found.nonce});
  assert(result&&result.observed===true&&result.processChanged===true&&result.nonceMatched===true,
   'A08_PROCESS_KILL_NOT_PROVEN');
  report('PASS','A08_SYNTHETIC_PROCESS_KILL_VERIFIED',{processKillVerified:true,
   androidForceStopVerified:false,syntheticBlobHashVerified:true});
 }catch(e){report('BLOCKED',String(e&&e.message||e),{processKillVerified:false,
  androidForceStopVerified:false,syntheticBlobHashVerified:false});}
 finally{if(db)db.close();runButton.disabled=false;}
}
async function run(){
 runButton.disabled=true;copyButton.disabled=true;last=null;resultEl.textContent='RUNNING';
 let db;
 try{
  assert(window.indexedDB&&window.crypto&&crypto.subtle,'A08_REQUIRED_API_MISSING');
  const native=plugin();
  assert(native&&typeof native.killSelf==='function'&&typeof native.readProof==='function',
   'A08_NATIVE_PLUGIN_MISSING');
  db=await openDb();
  await ensureFixture(db);
  const nonce=Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
  const tx=db.transaction('synthetic','readwrite'),wait=done(tx);
  tx.objectStore('synthetic').put({id:'a08-pending',synthetic:true,nonce,expectedSha256:await hash(bytes)});
  await wait;
  await verify(db);
  db.close();db=null;
  statusEl.textContent='Первый этап завершён. Приложение закроется — откройте его снова.';
  // The native call commits the nonce+PID before killing this process. No PASS before next launch.
  await native.killSelf({nonce});
  statusEl.textContent='Запрос остановки процесса отправлен. Если приложение ещё открыто, закройте и запустите снова.';
 }catch(e){
  report('BLOCKED',String(e&&e.message||e),{processKillVerified:false,
   androidForceStopVerified:false,syntheticBlobHashVerified:false});
 }finally{if(db)db.close();runButton.disabled=false;}
}
async function copy(){
 if(copyButton.disabled||!last)return;
 copyButton.disabled=true;
 try{
  const native=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.Clipboard;
  await COPY.copyReport(last,native);
  statusEl.textContent='Результат скопирован. Вставьте его в чат.';
 }catch(e){statusEl.textContent='Копирование не выполнено: '+String(e&&e.message||e);}
 finally{copyButton.disabled=false;}
}
runButton.addEventListener('click',run);
copyButton.addEventListener('click',copy);
initial();
})();
