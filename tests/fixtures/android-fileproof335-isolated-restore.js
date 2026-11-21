// TEST-ONLY isolated Android/WebView restore gate.
// NOT wired to any APK. Only caller-supplied synthetic PASEKA01 bytes.
// Never selects production IndexedDB, never deletes a database or original file.
(function(root){
'use strict';
const DATABASE='paseka-fileproof335-destination-only-v1';
const EXPECTED_ARCHIVE_SHA='4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186';
const EXPECTED_VIDEO_SHA=Object.freeze([
  '794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f',
  'bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff'
]);
const IDS=Object.freeze(['android-proof-black','android-proof-white']);
let attempted=false;
function blocked(code){
  const error=new Error(code);
  error.code=code;
  throw error;
}
function sha(bytes){
  return root.crypto.subtle.digest('SHA-256',bytes).then(digest=>
    Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join(''));
}
function request(req){
  return new Promise((resolve,reject)=>{
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error || new Error('IDB_REQUEST_FAILED'));
  });
}
function finished(tx){
  return new Promise((resolve,reject)=>{
    tx.oncomplete=()=>resolve();
    tx.onabort=()=>reject(tx.error || new Error('IDB_TRANSACTION_ABORTED'));
    tx.onerror=()=>{};
  });
}
function openOnlyDestination(){
  return new Promise((resolve,reject)=>{
    const req=root.indexedDB.open(DATABASE,1);
    req.onupgradeneeded=event=>{
      if(event.oldVersion!==0){req.transaction.abort();return;}
      req.result.createObjectStore('main');
      req.result.createObjectStore('entrance_media',{keyPath:'id'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('DESTINATION_OPEN_FAILED'));
    req.onblocked=()=>reject(new Error('DESTINATION_OPEN_BLOCKED'));
  });
}
function requireStores(db){
  if(db.objectStoreNames.length!==2 || !db.objectStoreNames.contains('main') ||
     !db.objectStoreNames.contains('entrance_media')) blocked('DESTINATION_SCHEMA_NOT_ISOLATED');
}
async function existing(db){
  requireStores(db);
  const tx=db.transaction(['main','entrance_media'],'readonly');
  const done=finished(tx);
  const [state,count]=await Promise.all([
    request(tx.objectStore('main').get('state')),
    request(tx.objectStore('entrance_media').count())
  ]);
  await done;
  return {state,count};
}
async function inspectSource(input){
  if(!(input instanceof Uint8Array) || input.byteLength!==3158) blocked('SOURCE_BYTES_OR_SIZE_INVALID');
  const bytes=input.slice();
  if((await sha(bytes))!==EXPECTED_ARCHIVE_SHA) blocked('SOURCE_SHA_INVALID');
  const archive=root.PasekaArchive;
  if(!archive || typeof archive.validateArchiveForRestore!=='function') blocked('ARCHIVE_ENGINE_REQUIRED');
  const blob=new root.Blob([bytes],{type:'application/vnd.paseka.archive'});
  const proof=await archive.validateArchiveForRestore(blob,root.crypto,
    state=>state && state.meta?.schemaVersion===15 && Array.isArray(state.hives) &&
      state.hives.length===1 && typeof state.hives[0]?.id==='string');
  if(proof.videoEntries.length!==2 || proof.orphanVideoIds.length!==0) blocked('SOURCE_ENTRIES_INVALID');
  for(let i=0;i<2;i++){
    const item=proof.videoEntries[i];
    if(item.metadata.id!==IDS[i] || item.metadata.hiveId!==proof.state.hives[0].id ||
       item.metadata.mimeType!=='video/mp4' || item.size!==893 ||
       (await sha(await item.blob.arrayBuffer()))!==EXPECTED_VIDEO_SHA[i]){
      blocked('SOURCE_VIDEO_PIN_MISMATCH');
    }
  }
  return {bytes,proof};
}
async function commit(db,proof,options){
  const tx=db.transaction(['main','entrance_media'],'readwrite');
  const done=finished(tx);
  try{
    const [state,count]=await Promise.all([
      request(tx.objectStore('main').get('state')),
      request(tx.objectStore('entrance_media').count())
    ]);
    if(state!==undefined || count!==0){
      tx.abort();
      await done.catch(()=>{});
      blocked('DESTINATION_NOT_EMPTY');
    }
    tx.objectStore('main').add(proof.state,'state');
    for(let i=0;i<2;i++){
      const item=proof.videoEntries[i];
      tx.objectStore('entrance_media').add({...item.metadata,blob:item.blob});
      if(i===0 && options?.testOnlyAbortAfterFirst){
        tx.abort();
        await done.catch(()=>{});
        blocked('INJECTED_ABORT_TEST_ONLY');
      }
    }
    await done;
  }catch(error){
    try{if(tx.readyState==='active')tx.abort();}catch{}
    await done.catch(()=>{});
    throw error;
  }
}
async function verifyRestored(db,proof){
  const tx=db.transaction(['main','entrance_media'],'readonly');
  const done=finished(tx);
  const [state,videos]=await Promise.all([
    request(tx.objectStore('main').get('state')),
    request(tx.objectStore('entrance_media').getAll())
  ]);
  await done;
  if(JSON.stringify(state)!==JSON.stringify(proof.state) || videos.length!==2) blocked('RESTORED_STATE_MISMATCH');
  for(let i=0;i<2;i++){
    const item=videos.find(v=>v.id===IDS[i]);
    if(!item || item.bytes!==893 || item.mimeType!=='video/mp4' ||
       (await sha(await item.blob.arrayBuffer()))!==EXPECTED_VIDEO_SHA[i]) {
      blocked('RESTORED_VIDEO_SHA_MISMATCH');
    }
  }
}
async function run(bytes,options={}){
  if(attempted) blocked('ONE_SHOT_ALREADY_ATTEMPTED');
  attempted=true;
  const {bytes:original,proof}=await inspectSource(bytes); // before opening/writing test DB
  // A failed or aborted first run still leaves a database. Never treat an
  // existing empty database as permission to retry after WebView restart.
  if(typeof root.indexedDB.databases!=='function') blocked('DATABASE_ENUMERATION_REQUIRED');
  const databases=await root.indexedDB.databases();
  if(!Array.isArray(databases)) blocked('DATABASE_ENUMERATION_FAILED');
  if(databases.some(db=>db && db.name===DATABASE)) blocked('DESTINATION_ALREADY_EXISTS');
  const db=await openOnlyDestination();
  try{
    requireStores(db);
    const before=await existing(db);
    if(before.state!==undefined || before.count!==0) blocked('DESTINATION_NOT_EMPTY');
    await commit(db,proof,options);
  }finally{db.close();}
  const reopened=await openOnlyDestination();
  try{await verifyRestored(reopened,proof);}
  finally{reopened.close();}
  if((await sha(original))!==EXPECTED_ARCHIVE_SHA)blocked('SOURCE_CHANGED_AFTER_RESTORE');
  return Object.freeze({status:'ISOLATED_RESTORE335_TEST_PASS',
    videoCount:2,archiveSha256:EXPECTED_ARCHIVE_SHA,database:DATABASE,
    androidPhysicalTest:false,mp4Decoder:'NOT_TESTED',cleanupAuthorized:false});
}
root.PasekaIsolatedRestore335=Object.freeze({run,DATABASE});
})(typeof window!=='undefined'?window:globalThis);
