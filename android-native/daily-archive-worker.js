/* Android worker only: use unchanged local origin, never bootstrap main. */
(async()=>{
 const bridge=window.PasekaArchiveJob;
 if(!bridge||typeof bridge.isArchiveWorker!=='function'||bridge.isArchiveWorker()!==true)return;
 let store=null,outcome='RETRY';
 function openExistingSource(){
  return new Promise((resolve,reject)=>{
   let settled=false;
   const fail=e=>{if(!settled){settled=true;reject(e);}};
   try{
    const req=indexedDB.open(DB);
    req.onupgradeneeded=()=>{try{req.transaction.abort();}catch(_){}fail(new Error('Existing database required'));};
    req.onblocked=()=>fail(new Error('Database blocked'));
    req.onerror=()=>fail(req.error||new Error('Database unavailable'));
    req.onsuccess=()=>{
     const opened=req.result;
     if(settled){opened.close();return;}
     if(opened.version!==3||!['main','full_backup','entrance_media'].every(name=>opened.objectStoreNames.contains(name))){
      opened.close();fail(new Error('Unexpected existing database schema'));return;
     }
     settled=true;opened.onversionchange=()=>opened.close();resolve(opened);
    };
   }catch(e){fail(e);}
  });
 }
 try{
  if(location.origin!=='https://localhost')throw Error('Unexpected archive worker origin');
  const marker=readStartupUseMarker();
  if(marker==='absent'){outcome='SKIP';return;}
  if(marker!=='present')throw Error('Previous use not confirmed');
  db=await openExistingSource();
  const source=await readMain();
  if(!source||typeof source.meta?.revisionId!=='string'||!source.meta.revisionId)throw Error('Committed main required');
  S=assertRawBackupIntegrity(validateBackupState(source));
  lastPersistedRevision=source.meta.revisionId;
  store=await PasekaDailyArchives.openStore();
  await PasekaDailyArchives.rotate(store,{day:today(),createRaw:createDailyArchiveRaw,inspect:dailyArchiveInspect});
  outcome='OK';
 }catch(_){outcome='RETRY';}
 finally{
  try{store?.close();}catch(_){}
  try{db?.close();}catch(_){}
  bridge.finish(outcome);
 }
})();