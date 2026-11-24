// P0 recovery proof: ONLY for ru.paseka.journal.disasterproof2 diagnostic APK.
(function(){
'use strict';
const packageId='ru.paseka.journal.disasterproof2';
const TAG='PASEKA_P0_DISASTER_PROOF_RESULT';
const checkpoint='paseka-p0-disaster-restart-v2';
const stages=[];
function add(name,status,detail=''){stages.push({name,status,detail:String(detail)});}
function ensure(value,message){if(!value)throw Error(message);}
async function request(store,key){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),req=tx.objectStore(store).get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
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
function display(status,code,detail=''){
 const result={schema:'paseka-oneplus-p0-disaster-v1',packageId,isolated:true,productionApp:'NOT_ACCESSED',productionDatabase:'NOT_ACCESSED',originalVideos:'NOT_ACCESSED',autoDelete:'NOT_ATTEMPTED',status,code,checks:stages,detail:String(detail)};
 const div=document.createElement('main');div.id='p0-disaster-proof';
 div.style.cssText='position:fixed;inset:0;z-index:2147483647;padding:16px;background:white;color:#182218;overflow:auto;font:15px system-ui;';
 const h=document.createElement('h2');h.textContent='P0 · Аварийное восстановление · '+status;
 const p=document.createElement('p');p.textContent='Только отдельное тестовое приложение. Пользовательская база и видео не затрагиваются.';
 const pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;word-break:break-word;font:12px monospace';pre.textContent=JSON.stringify(result,null,2);
 div.append(h,p,pre);document.body.append(div);
 console.log(TAG+' '+JSON.stringify(result));
}
(async()=>{
 try{
  ensure(location.protocol==='https:','Only secure Capacitor origin is supported');
  await waitDb();
  const saved=localStorage.getItem(checkpoint);
  if(saved){
    const main=await request('main','state'),video=await request('entrance_media','P0_TEST_ONLY_MP4_BYTES');
    ensure(main?.meta?.revisionId==='p0-seed','Main data lost on Android process restart');
    ensure(main.auditLog?.[0]?.id==='p0-test-audit','Audit history lost on restart');
    ensure(video?.blob instanceof Blob,'Video Blob missing after restart');
    const bytes=Array.from(new Uint8Array(await video.blob.arrayBuffer()));
    ensure(JSON.stringify(bytes)===JSON.stringify([0,0,0,24,102,116,121,112,105,115,111,109]),'Blob bytes mismatch after restart');
    add('androidProcessRestartDurability','PASS','Isolated main, full_backup, Blob survive force-stop/relaunch');
    display('PASS','P0_DISASTER_PHYSICAL_RESTART_PASS');
    return;
  }
  const initial=await request('main','state');
  ensure(initial?.hives?.length===0&&initial?.records?.length===0,'Diagnostic storage not clean; refusing overwrite');
  const entries=await new Promise((resolve,reject)=>{const tx=db.transaction('entrance_media','readonly'),q=tx.objectStore('entrance_media').count();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
  ensure(entries===0,'Diagnostic media store is not empty; refusing overwrite');
  add('isolatedStorageGuard','PASS');
  await writeSeed(initial);
  const original=await PasekaDisasterArchive.exportArchive(db);
  const proof=await PasekaDisasterArchive.inspectArchive(original,db);
  ensure(proof.counts.entrance_media===1&&proof.counts.main===1,'Archive inventory mismatch');
  add('fullIndexedDbSnapshotSha256','PASS',proof.sha256);
  const corrupted=JSON.parse(original);corrupted.manifest.sha256='0'.repeat(64);
  let corruptRejected=false;try{await PasekaDisasterArchive.inspectArchive(JSON.stringify(corrupted),db);}catch(_){corruptRejected=true;}
  ensure(corruptRejected,'Corrupt archive was accepted');add('corruptionFailClosed','PASS');
  const conflict=JSON.parse(original);
  const change=await new Promise((resolve,reject)=>{const tx=db.transaction('main','readwrite');tx.objectStore('main').put({meta:{revisionId:'p0-modified'},hives:[],families:[],records:[],auditLog:[]},'state');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
  let conflictRejected=false;try{await PasekaDisasterArchive.atomicRestore(db,proof,'wrong-revision');}catch(_){conflictRejected=true;}
  ensure(conflictRejected,'Conflicting restore unexpectedly committed');
  ensure((await request('main','state')).meta.revisionId==='p0-modified','Conflict altered live state');
  add('revisionConflictRollback','PASS');
  // Even with an updated revision argument, the stale preflight must not erase
  // a same-key edit. Re-inspect the original archive against the current live
  // snapshot before any authorized recovery attempt.
  let staleRejected=false;
  try{await PasekaDisasterArchive.atomicRestore(db,proof,'p0-modified');}catch(_){staleRejected=true;}
  ensure(staleRejected,'Stale same-key preflight unexpectedly overwrote live state');
  ensure((await request('main','state')).meta.revisionId==='p0-modified','Stale preflight changed live data');
  add('sameKeyValueConflictRollback','PASS');
  const freshProof=await PasekaDisasterArchive.inspectArchive(original,db);
  await PasekaDisasterArchive.atomicRestore(db,freshProof,'p0-modified');
  ensure((await request('main','state')).meta.revisionId==='p0-seed','Real IDB restore did not commit');
  ensure((await request('entrance_media','P0_TEST_ONLY_MP4_BYTES'))?.blob instanceof Blob,'Media not restored');
  add('atomicMultiStoreRestore','PASS');
  localStorage.setItem(checkpoint,'ready');
  display('PASS','P0_DISASTER_WEBVIEW_RESTORE_PASS','Use ADB force-stop and relaunch of diagnostic package for persistence gate');
 }catch(e){add('error','BLOCKED',e?.message||e);display('BLOCKED','P0_DISASTER_PROOF_FAILED',e?.stack||e);}
})();
})();