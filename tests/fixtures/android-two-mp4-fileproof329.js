(function(root){
'use strict';
const DB='paseka_fileproof_329_v1', HIVE='synthetic-fileproof329-hive';
const EXPECTED=['794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f','bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff'];
const ids=['android-proof-black','android-proof-white'];
const MARKER='fileproof329_attempt_marker';
function fail(c){const e=new Error(c);e.code=c;throw e;}
function request(req){return new Promise((ok,no)=>{req.onsuccess=()=>ok(req.result);req.onerror=()=>no(req.error||Error('IDB_REQUEST_FAILED'));});}
function done(tx){return new Promise((ok,no)=>{tx.oncomplete=ok;tx.onerror=tx.onabort=()=>no(tx.error||Error('IDB_TX_FAILED'));});}
function open(factory){return new Promise((ok,no)=>{const req=factory.open(DB,1);
req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('main'))db.createObjectStore('main');if(!db.objectStoreNames.contains('entrance_media'))db.createObjectStore('entrance_media',{keyPath:'id'});};
req.onsuccess=()=>ok(req.result);req.onerror=()=>no(req.error||Error('IDB_OPEN_FAILED'));req.onblocked=()=>no(Error('IDB_BLOCKED'));});}
async function digest(blob,crypto){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');}
function decode(b64){if(!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))fail('FIXTURE_BASE64_INVALID');return Uint8Array.from(atob(b64),x=>x.charCodeAt(0));}
function base64(bytes){let result='';for(let offset=0;offset<bytes.length;offset+=8192)result+=String.fromCharCode(...bytes.slice(offset,offset+8192));return btoa(result);}
async function run({factory=root.indexedDB,crypto=root.crypto,archive=root.PasekaArchive,fixtures=root.PasekaTwoMp4ProofFixtures,bridge=root.PasekaFileproof329}={}){
 if(!factory||!crypto?.subtle||!archive||!Array.isArray(fixtures)||fixtures.length!==2||!bridge||typeof bridge.saveAndReadBack!=='function')fail('PREREQUISITE_MISSING');
 const videos=[];
 for(let i=0;i<2;i++){
   if(fixtures[i].id!==ids[i]||fixtures[i].sha256!==EXPECTED[i])fail('SOURCE_PIN_MISMATCH');
   const data=decode(fixtures[i].base64),blob=new Blob([data],{type:'video/mp4'});
   if(data.byteLength!==893||(await digest(blob,crypto))!==EXPECTED[i])fail('SOURCE_BYTES_MISMATCH');
   videos.push(blob);
 }
 const db=await open(factory);
 try {
   const tx=db.transaction(['main','entrance_media'],'readonly');
   const a=request(tx.objectStore('main').get('state'));
   const b=request(tx.objectStore('main').get(MARKER));
   const c=request(tx.objectStore('entrance_media').getAll());
   const [existing,marker,media]=await Promise.all([a,b,c]);
   if(existing!=null||marker!=null||media.length!==0)fail('ISOLATED_DB_NOT_EMPTY_NO_OVERWRITE');
   // Commit a durable one-shot barrier *before* any external MediaStore write.
   const write=db.transaction(['main','entrance_media'],'readwrite'),complete=done(write);
   write.objectStore('main').add({meta:{schemaVersion:15},hives:[{id:HIVE}],records:[]},'state');
   write.objectStore('main').add({proofVersion:1,attempted:true,sourceSha256:EXPECTED.slice()},MARKER);
   for(let i=0;i<2;i++)write.objectStore('entrance_media').add({
     id:ids[i],hiveId:HIVE,capturedAt:new Date(Date.UTC(2026,10,21,12,0,i)).toISOString(),
     durationSec:1,width:16,height:16,bytes:893,mimeType:'video/mp4',name:ids[i]+'.mp4',
     status:'waiting_for_server',blob:videos[i]});
   await complete;
 } finally{db.close();}
 const persisted=await open(factory);let exported;
 try {
   const snapshot=await archive.readConsistentDatabaseSnapshot(persisted);
   if(snapshot.videos.length!==2||snapshot.state.hives?.[0]?.id!==HIVE)fail('IDB_SNAPSHOT_MISMATCH');
   for(let i=0;i<2;i++){
     const item=snapshot.videos.find(x=>x.id===ids[i]);
     if(!item||await digest(item.blob,crypto)!==EXPECTED[i])fail('IDB_SOURCE_SHA_MISMATCH');
   }
   exported=await archive.exportArchiveFromDatabase(persisted,crypto);
 } finally{persisted.close();}
 const parsed=await archive.parseArchiveBlob(exported.blob);
 await archive.verifyArchive(exported.blob,parsed,crypto);
 const proof=await archive.validateArchiveForRestore(exported.blob,crypto,
   state=>state.meta?.schemaVersion===15&&state.hives?.[0]?.id===HIVE);
 if(parsed.videoCount!==2||proof.videoEntries.length!==2||proof.orphanVideoIds.length!==0)fail('PASEKA01_ENTRY_MISMATCH');
 for(const [i,id] of ids.entries()){
   const entry=proof.videoEntries.find(v=>v.metadata.id===id);
   if(!entry||await digest(entry.blob,crypto)!==EXPECTED[i])fail('PASEKA01_SOURCE_MISMATCH');
 }
 if(exported.blob.size>1048576)fail('PASEKA01_TOO_LARGE');
 const bytes=new Uint8Array(await exported.blob.arrayBuffer());
 const sha=await digest(exported.blob,crypto);
 // Native bridge writes only in dedicated Download/PasekaProof329 and verifies same URI readback.
 const answer=bridge.saveAndReadBack(base64(bytes),sha);
 if(answer!==('PASS:'+bytes.length+':'+sha))fail('NATIVE_MEDIASTORE_BLOCKED');
 const uri=String(bridge.getSavedUri());
 if(!/^content:\/\/media\//.test(uri))fail('MEDIASTORE_URI_NOT_CONFIRMED');
 return {proofVersion:1,phase:'FILE_READBACK_PASS',status:'PASS',packageId:'ru.paseka.journal.archive.fileproof329',
   sourceSha256:EXPECTED,videoCount:2,archiveBytes:bytes.length,archiveSha256:sha,
   uriType:'content-uri',recognitionSucceeded:false,cleanupAuthorized:false};
}
function emit(result){
 const line=JSON.stringify(result);
 if(root.document?.getElementById('result'))root.document.getElementById('result').textContent=line;
 root.console?.info?.('PASEKA_FILEPROOF329 '+line);
 try{root.PasekaFileproof329Report?.report(line);}catch(_){}
}
root.PasekaFileproof329Run=Object.freeze({run,dbName:DB});
if(root.document&&root.addEventListener)root.addEventListener('DOMContentLoaded',async()=>{
 try{emit(await run());}
 catch(err){emit({proofVersion:1,phase:'FILE_READBACK',status:'BLOCKED',
   code:String(err?.code||err?.message||'UNKNOWN'),recognitionSucceeded:false,cleanupAuthorized:false});}
});
})(typeof window!=='undefined'?window:globalThis);
