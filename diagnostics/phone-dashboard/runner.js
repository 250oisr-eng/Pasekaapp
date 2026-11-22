(function(){
'use strict';
const PACKAGE='ru.paseka.journal.diagnostic.phonechecks';
const DB='paseka-phonechecks-synthetic-v1';
const EXPECTED='47df47c91c67aa53a83deebc3b343dcf98a7aa1b12ca8068ba85d20d60b81b3a';
const $=id=>document.getElementById(id);
let reportText='';
function txDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(Error('TRANSACTION_ABORT'));tx.onerror=()=>reject(Error('TRANSACTION_ERROR'));});}
function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('fixtures'))r.result.createObjectStore('fixtures');};r.onerror=()=>reject(Error('DB_OPEN'));r.onsuccess=()=>resolve(r.result);});}
function record(db,mode,task){return new Promise((resolve,reject)=>{const tx=db.transaction('fixtures',mode);const request=task(tx.objectStore('fixtures'));request.onerror=()=>reject(Error('REQUEST'));request.onsuccess=()=>resolve(request.result);});}
function digest(buffer){return crypto.subtle.digest('SHA-256',buffer).then(b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''));}
async function run(){
 const result={suite:'PHONE_SAFE_SYNTHETIC_V1',packageId:PACKAGE,status:'BLOCKED',code:'CHECK_INCOMPLETE',checks:{},scope:{syntheticOnly:true,realVideos:'NOT_TESTED',beeRecognition:'NOT_TESTED',onnxWasm:'NOT_TESTED',mp4Frames:'NOT_TESTED',realBackupRestore:'NOT_TESTED',productPermissions:'NOT_TESTED',cleanup:'NOT_TESTED',networkTraffic:'NOT_TESTED'},cleanupAuthorized:false,deleteAllowed:false,externalRequests:'NOT_ATTEMPTED'};
 let db;
 try{
  if(!indexedDB||!crypto?.subtle||!Blob)throw Error('ANDROID_WEB_APIS_UNAVAILABLE');
  const bytes=new TextEncoder().encode('paseka-phonechecks-synthetic-v1');
  const sha=await digest(bytes);
  result.checks.syntheticSha={status:'PASS',sha256:sha};
  const blob=new Blob([bytes],{type:'application/octet-stream'});
  db=await openDb();
  const putTx=db.transaction('fixtures','readwrite');putTx.objectStore('fixtures').put(blob,'single-synthetic-blob');await txDone(putTx);db.close();db=null;
  db=await openDb();const stored=await record(db,'readonly',store=>store.get('single-synthetic-blob'));
  if(!(stored instanceof Blob))throw Error('BLOB_READBACK_MISSING');
  const copy=new Uint8Array(await stored.arrayBuffer());
  if(copy.length!==bytes.length||copy.some((v,i)=>v!==bytes[i]))throw Error('BLOB_READBACK_MISMATCH');
  if(await digest(copy)!==sha)throw Error('BLOB_SHA_MISMATCH');
  result.checks.syntheticIndexedDbReopen={status:'PASS',bytes:copy.length,hashMatches:true};
  result.checks.failClosed={status:'PASS',cleanupAuthorized:false,deleteAllowed:false,realSourcesAccessed:false};
  result.status='PASS';result.code='SAFE_SYNTHETIC_ONLY';
 }catch(e){
  result.status='BLOCKED';result.code=String(e?.message||'UNKNOWN_FAILURE').slice(0,100);
 }finally{if(db)db.close();}
 return result;
}
$('run').addEventListener('click',async()=>{
 $('run').disabled=true;$('copy').disabled=true;$('result').textContent='Выполнение локальных синтетических проверок…';reportText='';
 try{reportText=JSON.stringify(await run(),null,2);}
 catch{reportText=JSON.stringify({status:'BLOCKED',code:'UNEXPECTED_DIAGNOSTIC_ERROR',packageId:PACKAGE,cleanupAuthorized:false});}
 $('result').textContent=reportText;$('copy').disabled=false;$('run').disabled=false;
});
$('copy').addEventListener('click',async()=>{
 if(!reportText)return;
 try{
  const plugin=window.Capacitor?.Plugins?.Clipboard;
  if(!plugin?.write)throw Error('NATIVE_CLIPBOARD_UNAVAILABLE');
  await plugin.write({string:reportText});
  $('copy').textContent='Скопировано — вставьте JSON в чат';
 }catch{$('copy').textContent='Копирование не удалось — выделите JSON ниже';}
});
})();
