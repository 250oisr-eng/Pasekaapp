// Standalone test-only one-button diagnostics. No production database or video access.
(function(root){
'use strict';
const DB='paseka-self-diagnostic-only-v1';
const PKG='ru.paseka.journal.diagnostic.selftest';
const MARKER='PASEKA_SELF_DIAG_SYNTHETIC_V1';
const enc=new TextEncoder();
const payloads=[enc.encode(MARKER+'-A'),enc.encode(MARKER+'-B')];
let busy=false;
function requestDone(req){return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(new Error('IDB_REQUEST_FAILED'));});}
function transactionDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(new Error('IDB_TRANSACTION_ABORTED'));tx.onerror=()=>reject(new Error('IDB_TRANSACTION_FAILED'));});}
function openDatabase(idb){return new Promise((resolve,reject)=>{
  const req=idb.open(DB,1);
  req.onupgradeneeded=()=>{req.result.createObjectStore('synthetic',{keyPath:'id'});};
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(new Error('IDB_OPEN_FAILED'));
  req.onblocked=()=>reject(new Error('IDB_BLOCKED'));
});}
function equalBytes(a,b){return a.length===b.length && a.every((value,i)=>value===b[i]);}
async function verifyBlob(blob,expected){
  if(!(blob instanceof Blob))throw new Error('IDB_BLOB_TYPE_MISMATCH');
  const bytes=new Uint8Array(await blob.arrayBuffer());
  if(!equalBytes(bytes,expected))throw new Error('IDB_BLOB_BYTES_MISMATCH');
}
async function run(idb){
  if(busy)return {status:'BLOCKED',reason:'ALREADY_RUNNING'};
  busy=true;
  let db;
  const result={status:'BLOCKED',packageId:PKG,database:DB,syntheticRecords:0,
    videoDecode:'NOT_TESTED',recognition:'NOT_TESTED',cleanup:'NOT_TESTED',productionAccess:'NOT_ATTEMPTED'};
  try{
    if(!idb || typeof idb.databases!=='function')throw new Error('IDB_DATABASE_INVENTORY_UNAVAILABLE');
    const list=await idb.databases();
    if(!Array.isArray(list) || list.some(x=>x.name===DB))throw new Error('DIAGNOSTIC_DB_ALREADY_EXISTS');
    db=await openDatabase(idb);
    const tx=db.transaction('synthetic','readwrite');
    const store=tx.objectStore('synthetic');
    for(let i=0;i<2;i++)store.add({id:'sample-'+i,blob:new Blob([payloads[i]],{type:'application/octet-stream'})});
    await transactionDone(tx);
    db.close();db=null;
    db=await openDatabase(idb);
    const readTx=db.transaction('synthetic','readonly');
    const records=await Promise.all([requestDone(readTx.objectStore('synthetic').get('sample-0')),
      requestDone(readTx.objectStore('synthetic').get('sample-1'))]);
    await transactionDone(readTx);
    for(let i=0;i<2;i++){
      if(!records[i] || records[i].id!=='sample-'+i)throw new Error('IDB_RECORD_MISSING');
      await verifyBlob(records[i].blob,payloads[i]);
    }
    result.status='PASS';result.syntheticRecords=2;
  }catch(e){result.reason=String(e?.message||'UNEXPECTED_ERROR').slice(0,100);}
  finally{if(db)db.close();busy=false;}
  return result;
}
function attach(doc,idb){
  const button=doc.getElementById('run-diagnostics');
  const report=doc.getElementById('diagnostic-result');
  if(!button||!report)throw new Error('DIAGNOSTIC_UI_MISSING');
  button.addEventListener('click',async()=>{
    button.disabled=true;
    report.textContent='Проверка выполняется…';
    const result=await run(idb);
    report.textContent=JSON.stringify(result,null,2);
    // Disable repeat on this screen: a new run must not overwrite previous evidence.
    button.disabled=true;
  },{once:true});
}
root.PasekaSelfDiagnostic=Object.freeze({run,attach,databaseName:DB});
if(root.document)root.document.addEventListener('DOMContentLoaded',()=>attach(root.document,root.indexedDB));
})(typeof window!=='undefined'?window:globalThis);
