// P0 recovery proof: ONLY for ru.paseka.journal.disasterproof2 diagnostic APK.
(function(){
'use strict';
const packageId='ru.paseka.journal.disasterproof2';
const TAG='PASEKA_P0_DISASTER_PROOF_RESULT';
const checkpoint='paseka-p0-disaster-restart-v2';
const stages=[];
function add(name,status,detail=''){stages.push({name,status,detail:String(detail)});}
function ensure(value,message){if(!value)throw Error(message);}
const targetDbName='paseka-b01-disposable-recovery-v1';
const testBlobBytes=[0,0,0,24,102,116,121,112,105,115,111,109];
async function openTargetDb(){
 return await new Promise((resolve,reject)=>{
  const req=indexedDB.open(targetDbName,3);
  req.onupgradeneeded=()=>{const d=req.result;
   if(!d.objectStoreNames.contains('main'))d.createObjectStore('main');
   if(!d.objectStoreNames.contains('full_backup'))d.createObjectStore('full_backup');
   if(!d.objectStoreNames.contains('entrance_media'))d.createObjectStore('entrance_media',{keyPath:'id'});
  };
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('Target IndexedDB unavailable'));
  req.onblocked=()=>reject(Error('Target IndexedDB blocked'));
 });
}
function requestFrom(connection,store,key){return new Promise((resolve,reject)=>{
 const tx=connection.transaction(store,'readonly'),req=tx.objectStore(store).get(key);
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('Read failed'));
});}
async function countFrom(connection,store){return await new Promise((resolve,reject)=>{
 const tx=connection.transaction(store,'readonly'),req=tx.objectStore(store).count();
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('Count failed'));
});}
async function verifyTarget(connection,sha){
 const actual=JSON.parse(await PasekaDisasterArchive.exportArchive(connection));
 ensure(actual.manifest.sha256===sha,'Target SHA after restore/reopen differs');
 ensure(actual.manifest.counts.main===1&&actual.manifest.counts.full_backup===1&&
 actual.manifest.counts.entrance_media===1,'Target store counts differ');
 const media=await requestFrom(connection,'entrance_media','P0_TEST_ONLY_MP4_BYTES');
 ensure(media?.blob instanceof Blob,'Target video Blob missing');
 const bytes=Array.from(new Uint8Array(await media.blob.arrayBuffer()));
 ensure(JSON.stringify(bytes)===JSON.stringify(testBlobBytes),'Target Blob bytes mismatch');
 return actual;
}
function writeSeed(initial){
 return new Promise((resolve,reject)=>{
 const tx=db.transaction(['main','full_backup','entrance_media'],'readwrite');
 const state=structuredClone(initial);state.meta={...(state.meta||{}),revisionId:'p0-seed'};state.auditLog=[{id:'p0-test-audit',type:'test'}];tx.objectStore('main').put(state,'state');
 tx.objectStore('full_backup').put({at:'2026-11-23T00:00:00Z',state:{hives:[]}},'previous');
 tx.objectStore('entrance_media').put({id:'P0_TEST_ONLY_MP4_BYTES',blob:new Blob([new Uint8Array([0,0,0,24,102,116,121,112,105,115,111,109])],{type:'video/mp4'})});
 tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('seed aborted'));
 });
}
async function waitDb(){
 for(let i=0;i<160;i++){
  if(typeof db!=='undefined'&&db&&typeof PasekaDisasterArchive==='object'&&typeof readMain==='function'){const saved=await readMain().catch(()=>null);if(saved?.meta?.revisionId)return;}
  await new Promise(r=>setTimeout(r,125));
 }
 throw Error('App database not available');
}
function rootOwnerStart(){try{window.PasekaB01OwnerArchive?.start?.()}catch(_){/* owner proof separate and optional */}}
function display(status,code,detail=''){
 const result={schema:'paseka-oneplus-p0-disaster-v1',packageId,isolated:true,productionApp:'NOT_ACCESSED',productionDatabase:'NOT_ACCESSED',originalVideos:'NOT_ACCESSED',autoDelete:'NOT_ATTEMPTED',status,code,checks:stages,detail:String(detail)};
 const div=document.createElement('main');div.id='p0-disaster-proof';
 div.style.cssText='position:fixed;inset:0;z-index:2147483647;padding:16px;background:white;color:#182218;overflow:auto;font:15px system-ui;';
 const h=document.createElement('h2');h.textContent='P0 · Аварийное восстановление · '+status;
 const p=document.createElement('p');p.textContent='Только отдельное тестовое приложение. Пользовательская база и видео не затрагиваются.';
 const pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;word-break:break-word;font:12px monospace';pre.textContent=JSON.stringify(result,null,2);
 div.append(h,p,pre);document.body.append(div);
 if(status==='PASS')rootOwnerStart();
 console.log(TAG+' '+JSON.stringify(result));
}
(async()=>{
 try{
  ensure(location.protocol==='https:','Only secure Capacitor origin is supported');
  await waitDb();
  const saved=localStorage.getItem(checkpoint);
  if(saved){
    let target;
    try{
      target=await openTargetDb();
      const source=await requestFrom(db,'main','state');
      ensure(source?.meta?.revisionId==='p0-seed','Synthetic source mutated after process restart');
      const receipt=JSON.parse(saved);
      ensure(/^[a-f0-9]{64}$/.test(receipt.sha256),'Invalid pre-restart receipt');
      await verifyTarget(target,receipt.sha256);
      add('androidProcessRestartDurability','PASS','Separate target IndexedDB and Blob survive force-stop/relaunch');
      display('PASS','P0_DISASTER_PHYSICAL_RESTART_PASS');
    }finally{target?.close();}
    return;
  }
  const initial=await requestFrom(db,'main','state');
  ensure(initial?.hives?.length===0&&initial?.records?.length===0,'Diagnostic source not clean; refusing overwrite');
  ensure((await countFrom(db,'entrance_media'))===0,'Diagnostic source media not empty; refusing overwrite');
  add('isolatedSourceGuard','PASS');
  await writeSeed(initial);
  const original=await PasekaDisasterArchive.exportArchive(db);
  ensure(JSON.parse(original).manifest.counts.entrance_media===1,'Expected synthetic source Blob');
  add('fullIndexedDbSnapshotSha256','PASS');
  const corrupt=JSON.parse(original);corrupt.manifest.sha256='0'.repeat(64);
  let rejected=false;
  let target;
  try{
    target=await openTargetDb();
    ensure((await countFrom(target,'main'))===0&&
      (await countFrom(target,'full_backup'))===0&&
      (await countFrom(target,'entrance_media'))===0,'Disposable restore target is not empty');
    try{await PasekaDisasterArchive.inspectArchive(JSON.stringify(corrupt),target);}catch(_){rejected=true;}
    ensure(rejected,'Corrupted manifest was accepted');
    add('corruptionFailClosed','PASS');
    const proof=await PasekaDisasterArchive.inspectArchive(original,target);
    await PasekaDisasterArchive.atomicRestore(target,proof,null);
    const verified=await PasekaDisasterArchive.verifyRestoredArchive(target,proof);
    ensure(verified.verified,'Actual target restore did not verify');
    await verifyTarget(target,proof.sha256);
    add('atomicSeparateEmptyIdbRestore','PASS','Source and target are independent origin-scoped databases');
    // The source already contains a Blob: attempting to overwrite it must
    // fail closed, even if the archive is identical.
    const sourceProof=await PasekaDisasterArchive.inspectArchive(original,db);
    let liveOverwriteRejected=false;
    try{await PasekaDisasterArchive.atomicRestore(db,sourceProof,'p0-seed');}
    catch(_){liveOverwriteRejected=true;}
    ensure(liveOverwriteRejected,'Existing source Blob was overwritten');
    const sourceMedia=await requestFrom(db,'entrance_media','P0_TEST_ONLY_MP4_BYTES');
    ensure(sourceMedia?.blob instanceof Blob,'Protected source Blob disappeared');
    add('existingBlobOverwriteFailsClosed','PASS');
    target.close();target=null;
    target=await openTargetDb();
    await verifyTarget(target,proof.sha256);
    add('androidWebViewCloseReopen','PASS','Restored target stays byte-identical across DB reopening');
    localStorage.setItem(checkpoint,JSON.stringify({sha256:proof.sha256}));
    display('PASS','P0_DISASTER_WEBVIEW_RESTORE_PASS','Restart separate diagnostic package to test Android durability');
  }finally{target?.close();}
 }catch(e){add('error','BLOCKED',e?.message||e);display('BLOCKED','P0_DISASTER_PROOF_FAILED',e?.stack||e);}
})();
})();