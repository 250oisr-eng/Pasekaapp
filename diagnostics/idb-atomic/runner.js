(function(){
'use strict';
const PKG='ru.paseka.journal.diagnostic.idbatomicv1';
const el=id=>document.getElementById(id);
let latest='';
el('run').addEventListener('click',async()=>{
 el('run').disabled=true;el('copy').disabled=true;
 el('result').textContent='Проверка атомарности синтетических записей…';latest='';
 try{
  const report=await window.PasekaAndroidIdbAtomicProof.run({
   indexedDB:window.indexedDB,DOMException:window.DOMException
  });
  latest=JSON.stringify(report,null,2);
 }catch(_){
  latest=JSON.stringify({suite:'PHONE_IDB_ATOMIC_FAULT_V1',packageId:PKG,
   status:'BLOCKED',code:'RUNNER_ERROR_PRESERVE',cleanupAuthorized:false,
   deleteAllowed:false,restoreAuthorized:false});
 }
 el('result').textContent=latest;el('run').disabled=false;el('copy').disabled=false;
});
el('copy').addEventListener('click',async()=>{
 if(!latest)return;
 try{
  const value=JSON.parse(latest);
  if(value.packageId!==PKG||value.deleteAllowed!==false||
     value.cleanupAuthorized!==false||value.restoreAuthorized!==false||
     !['PASS','BLOCKED'].includes(value.status))throw Error('REPORT_INVALID');
  const clip=window.Capacitor?.Plugins?.Clipboard;
  if(!clip?.write)throw Error('CLIPBOARD_MISSING');
  await clip.write({string:latest});
  el('copy').textContent='Скопировано — вставьте JSON в чат';
 }catch(_){el('copy').textContent='Копирование не удалось — JSON ниже';}
});
})();
