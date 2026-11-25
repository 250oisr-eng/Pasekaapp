// B01 F6: intentionally read-only on a separate diagnostic Android package.
// Only use inside an isolated Android emulator whose WebView files are copies.
// No import, restore, delete, put, clear, key/value reads, uploads or network calls.
'use strict';
(() => {
 const EXPECTED_DB='paseka-v1';
 const REQUIRED=['main','full_backup','entrance_media'];
 const button=document.getElementById('run');
 const output=document.getElementById('output');
 const report=()=>({
   schema:'paseka-b01-isolated-android-indexeddb-reopen-v19',
   status:'BLOCKED',code:'NOT_STARTED',stage:'START',
   expectedDiagnosticPackageId:'ru.paseka.journal.diagnostic.restore',
   diagnosticPackageAttestation:'EXTERNAL_EMULATOR_ONLY_NOT_CONFIRMED_BY_WEB',
   originGuardPassed:false, originExpected:'https://localhost',
   databaseDiscovered:false, databaseOpened:false, schemaStoresMatched:false,
   storeCounts:Object.create(null), databaseVersion:null,
   dbRecordValuesRead:'NO', dbKeysRead:'NO', dbWrites:'NOT_ATTEMPTED',
   importedPrivateFiles:'EXTERNAL_PREP_REQUIRED_NOT_PERFORMED',
   sourceTarUsed:'NO', deviceIdentity:'NOT_ATTESTED_BY_WEB',
   originalAppPackageTouched:'NO',
   fullBackupVerified:false, independentRestore:'NOT_VERIFIED',
   mediaStoreGalleryCoverage:'NOT_TESTED',videoCleanup:'NOT_ATTEMPTED',
   network:'NOT_ATTEMPTED'
 });
 const render = r => {output.value=JSON.stringify(r,null,2);};
 let busy=false;
 async function inspect(){
   if(busy)return;
   busy=true;button.disabled=true;
   const r=report();let db=null;
   try{
     if(location.protocol!=='https:'||location.hostname!=='localhost'){
       r.code='DIAGNOSTIC_ORIGIN_NOT_HTTPS_LOCALHOST';return;
     }
     r.originGuardPassed=true;
     if(!window.indexedDB||typeof indexedDB.databases!=='function'){
       r.code='INDEXEDDB_ENUMERATION_UNAVAILABLE';return;
     }
     const found=await indexedDB.databases();
     // Read only one expected DB. Never create an empty database by guessing.
     if(!Array.isArray(found)||!found.some(x=>x&&x.name===EXPECTED_DB)){
       r.code='EXPECTED_DB_NOT_DISCOVERED';return;
     }
     r.databaseDiscovered=true;r.stage='READONLY_DB_OPEN';
     db=await new Promise((resolve,reject)=>{
       const req=indexedDB.open(EXPECTED_DB);
       req.onupgradeneeded=()=>{try{req.transaction.abort();}catch(_){};reject(new Error('DB_CREATE_OR_UPGRADE_FORBIDDEN'));};
       req.onerror=()=>reject(new Error('DB_OPEN_FAILED'));
       req.onblocked=()=>reject(new Error('DB_BLOCKED'));
       req.onsuccess=()=>resolve(req.result);
     });
     r.databaseOpened=true;r.databaseVersion=db.version;
     db.onversionchange=()=>db.close();
     const names=Array.from(db.objectStoreNames);
     if(REQUIRED.some(n=>!names.includes(n))){
       r.code='REQUIRED_STORES_MISSING';return;
     }
     // A store inventory difference is never silently treated as success.
     r.schemaStoresMatched=names.length===REQUIRED.length;
     if(!r.schemaStoresMatched){r.code='EXTRA_STORES_REQUIRE_REVIEW';return;}
     const countResult=await new Promise((resolve,reject)=>{
       const tx=db.transaction(names,'readonly');
       const counts=Object.create(null);
       for(const name of names){
         const req=tx.objectStore(name).count();
         req.onsuccess=()=>{counts[name]=req.result;};
         req.onerror=()=>reject(new Error('STORE_COUNT_FAILED'));
       }
       tx.oncomplete=()=>resolve(counts);
       tx.onabort=()=>reject(new Error('READONLY_TX_ABORTED'));
       tx.onerror=()=>reject(new Error('READONLY_TX_FAILED'));
     });
     for(const name of REQUIRED){
       if(!Number.isSafeInteger(countResult[name]) || countResult[name]<0){
         r.code='STORE_COUNT_INVALID';return;
       }
       r.storeCounts[name]=countResult[name];
     }
     r.status='ISOLATED_DB_REOPEN_METADATA_PASS_NOT_FULL_RESTORE';
     r.code='INDEXEDDB_READONLY_OPEN_AND_STORE_COUNTS_PASS';
     r.stage='COMPLETE';
   }catch(e){
     const code=e instanceof Error?e.message:'UNKNOWN_ERROR';
     r.code=['DB_CREATE_OR_UPGRADE_FORBIDDEN','DB_OPEN_FAILED','DB_BLOCKED',
       'STORE_COUNT_FAILED','READONLY_TX_ABORTED','READONLY_TX_FAILED'].includes(code)
       ?code:'ISOLATED_DB_DIAGNOSTIC_FAILED_REDACTED';
   }finally{
     try{if(db)db.close();}catch(_){}
     render(r);busy=false;button.disabled=false;
   }
 }
 button.addEventListener('click',inspect);
 render(report());
})();
