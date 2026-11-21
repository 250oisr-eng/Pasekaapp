(function(root) {
'use strict';
const NAME = 'paseka_two_mp4_proof_325_v1';
const MARKER = '__paseka_android_two_mp4_proof_marker_v1';
const HIVE = 'synthetic-proof-hive-325';
const EXPECTED = [
  '794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f',
  'bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff'
];
const createdAt = '2026-11-21T10:00:00.000Z';
function fail(code) { const e = new Error(code); e.code = code; throw e; }
function requestResult(request) {
  return new Promise((resolve,reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IDB_REQUEST_FAILED'));
  });
}
function transactionDone(tx) {
  return new Promise((resolve,reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('IDB_TRANSACTION_FAILED'));
  });
}
async function openDatabase(factory) {
  return await new Promise((resolve,reject) => {
    const request = factory.open(NAME,1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('main')) db.createObjectStore('main');
      if (!db.objectStoreNames.contains('entrance_media')) db.createObjectStore('entrance_media',{keyPath:'id'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IDB_OPEN_FAILED'));
    request.onblocked = () => reject(new Error('IDB_UPGRADE_BLOCKED'));
  });
}
function decode(base64) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) fail('INVALID_FIXTURE_BASE64');
  const data = atob(base64);
  return Uint8Array.from(data, char => char.charCodeAt(0));
}
async function digest(blob, cryptoProvider) {
  const bytes = new Uint8Array(await cryptoProvider.subtle.digest('SHA-256',await blob.arrayBuffer()));
  return Array.from(bytes, value => value.toString(16).padStart(2,'0')).join('');
}
function state() { return {meta:{schemaVersion:15},hives:[{id:HIVE}],records:[]}; }
async function run({factory=root.indexedDB,cryptoProvider=root.crypto,archive=root.PasekaArchive,fixtures=root.PasekaTwoMp4ProofFixtures}={}) {
  if (!factory || !cryptoProvider?.subtle || !archive || !Array.isArray(fixtures) || fixtures.length !== 2) fail('PREREQUISITE_MISSING');
  // Provenance verification occurs before any IndexedDB write.
  const blobs=[];
  for(let i=0;i<2;i++){
    if(fixtures[i].sha256 !== EXPECTED[i] || fixtures[i].id !== ['android-proof-black','android-proof-white'][i]) fail('SOURCE_PIN_MISMATCH');
    const blob=new Blob([decode(fixtures[i].base64)],{type:'video/mp4'});
    if(blob.size !== 893 || await digest(blob,cryptoProvider) !== EXPECTED[i]) fail('SOURCE_BYTES_MISMATCH');
    blobs.push(blob);
  }
  let db=await openDatabase(factory);
  let phase;
  try {
    const tx=db.transaction(['main','entrance_media'],'readonly');
    const currentState=requestResult(tx.objectStore('main').get('state'));
    const currentMarker=requestResult(tx.objectStore('main').get(MARKER));
    const currentVideos=requestResult(tx.objectStore('entrance_media').getAll());
    const [existing,marker,videos]=await Promise.all([currentState,currentMarker,currentVideos]);
    if (existing == null && marker == null && videos.length===0) {
      // Only a newly empty, package-private test database may be populated.
      const write=db.transaction(['main','entrance_media'],'readwrite');
      const completed=transactionDone(write);
      write.objectStore('main').put(state(),'state');
      write.objectStore('main').put({proofVersion:1,hashes:EXPECTED.slice(),hiveId:HIVE},MARKER);
      for(let i=0;i<2;i++){
        write.objectStore('entrance_media').add({
          id:fixtures[i].id,hiveId:HIVE,capturedAt:new Date(Date.parse(createdAt)+i*1000).toISOString(),
          durationSec:1,width:16,height:16,bytes:blobs[i].size,mimeType:'video/mp4',
          name:fixtures[i].id+'.mp4',status:'waiting_for_server',blob:blobs[i]
        });
      }
      await completed;
      phase='INITIAL_PASS';
    } else {
      if(!existing || existing.meta?.schemaVersion !== 15 ||
         !Array.isArray(existing.hives) || existing.hives.length !== 1 || existing.hives[0].id !== HIVE ||
         marker?.proofVersion !== 1 || marker.hiveId !== HIVE ||
         JSON.stringify(marker.hashes) !== JSON.stringify(EXPECTED) || videos.length!==2) fail('EXISTING_PROOF_DB_NOT_EXACT');
      phase='RELAUNCH_PASS';
    }
  } finally { db.close(); }
  // New connection proves data is persisted independently of the first transaction.
  db=await openDatabase(factory);
  try {
    const snapshot=await archive.readConsistentDatabaseSnapshot(db);
    if(snapshot.videos.length!==2 || snapshot.state.hives?.[0]?.id!==HIVE) fail('PERSISTED_DATA_MISMATCH');
    const ordered=snapshot.videos.slice().sort((a,b)=>a.capturedAt.localeCompare(b.capturedAt));
    for(let i=0;i<2;i++){
      if(ordered[i].id!==fixtures[i].id || ordered[i].blob?.size!==893 ||
        await digest(ordered[i].blob,cryptoProvider)!==EXPECTED[i]) fail('PERSISTED_BLOB_MISMATCH');
    }
    const exported=await archive.exportArchiveFromDatabase(db,cryptoProvider);
    const parsed=await archive.parseArchiveBlob(exported.blob);
    if(parsed.videoCount!==2 || parsed.entries.length!==3) fail('EXPORT_ENTRY_COUNT');
    await archive.verifyArchive(exported.blob,parsed,cryptoProvider);
    const restored=await archive.validateArchiveForRestore(exported.blob,cryptoProvider,
      data=>data.meta?.schemaVersion===15 && data.hives?.[0]?.id===HIVE);
    if(restored.orphanVideoIds.length!==0 || restored.videoEntries.length!==2) fail('EXPORT_RESTORE_PREFLIGHT');
    for(let i=0;i<2;i++){
      if(restored.videoEntries[i].metadata.id!==fixtures[i].id ||
         await digest(restored.videoEntries[i].blob,cryptoProvider)!==EXPECTED[i]) fail('EXPORT_BLOB_MISMATCH');
    }
    return {proofVersion:1,status:phase,packageId:'ru.paseka.journal.archive.proof325',
      database:NAME,sourceSha256:EXPECTED,videoCount:2,archiveVersion:parsed.version,
      archiveSha256:await digest(exported.blob,cryptoProvider),archiveBytes:exported.blob.size,
      recognitionSucceeded:false,cleanupAuthorized:false};
  } finally { db.close(); }
}
function emit(report) {
  const json=JSON.stringify(report);
  if (root.document?.getElementById('result')) root.document.getElementById('result').textContent=json;
  root.console?.info?.('PASEKA_TWO_MP4_PROOF '+json);
  try { root.PasekaProofBridge?.report(json); } catch (_) { /* Native report optional; UI and log remain. */ }
}
root.PasekaTwoMp4Proof=Object.freeze({run,dbName:NAME});
if(root.document && root.addEventListener)root.addEventListener('DOMContentLoaded',async()=>{
  try{emit(await run());}
  catch(e){emit({proofVersion:1,status:'BLOCKED',code:String(e?.code||e?.message||'UNKNOWN'),
    recognitionSucceeded:false,cleanupAuthorized:false});}
});
})(typeof window !== 'undefined' ? window : globalThis);
