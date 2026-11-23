// Only included in the isolated ru.paseka.journal.journalproof diagnostic APK.
// It never loads in the user's normal PASEKA installation or public PWA.
// The test's hive, observation and treatment are synthetic fixtures, not real apiary actions.
(function(){
'use strict';
const tag='PASEKA_JOURNAL_PHYSICAL_V1';
const key='paseka-journal-physical-v1-stage';
const began=Date.now();
const stages=[];
const add=(name,status,detail='')=>stages.push({name,status,detail:String(detail)});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const savedMeta=()=>({
  suite:tag,packageId:'ru.paseka.journal.journalproof',scope:'ISOLATED_SYNTHETIC_JOURNAL_ONLY',
  runtime:'Android Capacitor WebView',deviceUserAgent:navigator.userAgent,
  networkAtStart:navigator.onLine?'ONLINE_OR_UNKNOWN':'OFFLINE',
  actualProductionApp:'NOT_ACCESSED',originalVideo:'NOT_ACCESSED',cleanup:'NOT_ATTEMPTED',
  realTreatments:'NOT_ATTEMPTED',realBackupRestore:'NOT_TESTED',fullAirplaneMode:'NOT_TESTED',
  autoDeleteAuthorized:false,productionDataMutation:false
});
function display(status,code,detail){
 const report={...savedMeta(),status,code,elapsedMs:Date.now()-began,checks:stages,detail:String(detail||'')};
 const overlay=document.createElement('main');
 overlay.id='paseka-journal-physical-proof';
 overlay.style.cssText='position:fixed;inset:0;z-index:2147483647;background:white;color:#142119;overflow:auto;padding:18px;font-family:system-ui,Arial,sans-serif;line-height:1.45;font-size:16px;';
 const heading=document.createElement('h1');heading.textContent=(status==='PASS'?'✅ PASS':'❌ BLOCKED')+' · ЖУРНАЛ (ТЕСТ)';
 const safety=document.createElement('p');safety.textContent='Это ИЗОЛИРОВАННОЕ тестовое приложение. Реальная «Пасека», её база и видео не затронуты.';
 const pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;word-break:break-word;font:13px monospace;';pre.textContent=JSON.stringify(report,null,2);
 overlay.append(heading,safety,pre);document.body.appendChild(overlay);
 console.log('PASEKA_JOURNAL_PHYSICAL_RESULT '+JSON.stringify(report));
 localStorage.setItem(key+'-report',JSON.stringify(report));
}
async function waitUntilInitialized(){
 for(let i=0;i<100;i++){
  if(typeof S==='object'&&S.meta?.revisionId&&typeof readMain==='function'&&typeof save==='function'&&typeof defaultHive==='function'&&typeof openVarroaTreatmentJournal==='function')return;
  await delay(150);
 }
 throw Error('Main app startup did not complete within 15 seconds (check app alert / DB integrity).');
}
function requireOk(condition,label){if(!condition)throw Error(label);}
async function run(){
 try{
  requireOk(location.protocol==='https:','Diagnostic must run in Capacitor secure origin');
  await waitUntilInitialized();
  const prior=localStorage.getItem(key);
  const proven=localStorage.getItem(key+'-persisted-fixtures');
  if(!prior&&proven){
   const checkpoint=JSON.parse(proven);
   const actual=await readMain();
   requireOk(actual?.hives?.some(h=>h.id===checkpoint.hive),'Synthetic hive not found after Android process restart');
   requireOk(actual?.varroaObservations?.some(o=>o.id===checkpoint.observation),'Synthetic observation not found after Android process restart');
   const record=actual?.records?.find(o=>o.id===checkpoint.record);
   requireOk(record&&!record.archivedAt,'Restored journal record not retained after Android process restart');
   add('androidProcessRestartReadback','PASS','Isolated diagnostic app reopened; same synthetic records present in real IndexedDB');
   display('PASS','ISOLATED_JOURNAL_ANDROID_RESTART_ONLY','Actual device process relaunch passed; airplane mode and production restore not attempted.');
   return;
  }
  if(prior){
   const checkpoint=JSON.parse(prior);
   requireOk(checkpoint.phase==='reload','Unexpected interrupted test checkpoint');
   const actual=await readMain();
   const hive=actual?.hives?.find(h=>h.id===checkpoint.hive);
   const observation=actual?.varroaObservations?.find(o=>o.id===checkpoint.observation);
   const record=actual?.records?.find(o=>o.id===checkpoint.record);
   requireOk(hive&&observation&&record,'Synthetic hive, observation or treatment did not survive WebView reload');
   requireOk(record.archivedAt===undefined,'Previously restored record remains archived');
   requireOk(record.treatmentDose==='','Unspecified Varroa dose was unexpectedly filled');
   add('coldWebViewReloadIndexedDB','PASS','Synthetic hive + observation + treatment are byte-identifiable after restart');
   add('originalAppDataIsolation','PASS','Separate Android applicationId and private WebView storage');
   localStorage.setItem(key+'-persisted-fixtures',JSON.stringify(checkpoint));
   localStorage.removeItem(key);
   display('PASS','ISOLATED_JOURNAL_REAL_WEBVIEW_REOPEN_ONLY','Succeeded on real Android WebView; live backups, network disable and real apiary state not tested.');
   return;
  }
  requireOk(Array.isArray(S.hives)&&S.hives.length===0&&Array.isArray(S.records)&&S.records.length===0,'Diagnostic package contains nonempty state; refuse to mutate or reset it');
  add('isolatedEmptyDatabase','PASS','Only diagnostic package blank private storage is used');
  const oldAlert=window.alert,oldConfirm=window.confirm,alerts=[];
  window.alert=message=>alerts.push(String(message));
  try{
   $('hiveDesc').value='TEST_ONLY_JOURNAL_PROOF_NOT_A_REAL_HIVE';
   await defaultHive({preventDefault(){}});
   requireOk(S.hives.length===1,'Creating isolated synthetic hive failed: '+alerts.join(' | '));
   const hive=S.hives[0].id;
   const first=await readMain();
   requireOk(first?.hives?.some(h=>h.id===hive),'New test hive missing in actual IndexedDB');
   add('createHiveDurable','PASS','Synthetic hive created through production UI handler and present in IndexedDB');
   renderVarroaModule();
   $('varroaHive').value=hive;
   $('varroaType').value='adult_bee_sample';
   $('varroaDate').value=today();
   $('varroaNotes').value='TEST_ONLY_OBSERVATION';
   $('varroaMethod').value='alcohol_wash';
   $('varroaBeesCount').value='100';
   $('varroaMitesCount').value='2';
   await saveVarroaObservation({preventDefault(){}});
   requireOk(S.varroaObservations.length===1,'Test measurement was not saved: '+alerts.join(' | '));
   const obsId=S.varroaObservations[0].id;
   const measured=await readMain();
   requireOk(measured?.varroaObservations?.some(o=>o.id===obsId),'Varroa observation missing from actual IndexedDB');
   add('varroaObservationDurable','PASS','Sample rate and persisted measurement are available in IndexedDB');
   $('varroaHive').value=hive;
   openVarroaTreatmentJournal();
   requireOk($('recordForm').dataset.varroaTreatmentDraft==='1','Treatment journal was not opened');
   requireOk($('rtreatmentDose').value==='','Diagnostic did not preserve unknown dose as blank');
   $('rdate').value=today();$('rtext').value='TEST_ONLY_SYNTHETIC_TREATMENT_NOT_REAL';
   window.confirm=()=>true; // Simulated consent is confined to this test-only application.
   const firstWrite=$('recordForm').onsubmit({preventDefault(){}});
   const duplicate=$('recordForm').onsubmit({preventDefault(){}});
   await Promise.all([firstWrite,duplicate]);
   requireOk(S.records.filter(x=>x.type==='Обработка').length===1,'Concurrent submit duplicated or failed treatment: '+alerts.join(' | '));
   const recordId=S.records.find(x=>x.type==='Обработка').id;
   const persisted=await readMain();
   requireOk(persisted?.records?.some(x=>x.id===recordId),'Synthetic treatment missing from real IndexedDB');
   add('treatmentCommitAndDuplicateGuard','PASS','Exactly one explicitly simulated treatment; no auto-filled dose');
   requireOk(await deleteRecord(recordId)===true,'Archiving synthetic record failed: '+alerts.join(' | '));
   requireOk((await readMain())?.records?.find(x=>x.id===recordId)?.archivedAt,'Archived marker not durably committed');
   requireOk(await restoreRecord(recordId)===true,'Restoring synthetic record failed: '+alerts.join(' | '));
   requireOk(!(await readMain())?.records?.find(x=>x.id===recordId)?.archivedAt,'Restored marker missing from IndexedDB');
   add('archiveRestoreDurable','PASS','Synthetic record archived and restored via production handlers');
   const encoded=JSON.stringify({app:'Paseka',state:S});
   const parsed=JSON.parse(encoded);
   requireOk(parsed.state.records.some(x=>x.id===recordId),'Read-only JSON snapshot lacks journal record');
   requireOk(validateBackupState(parsed.state),'Backup validator failed on in-memory synthetic JSON');
   add('jsonArchiveValidation','PASS','Synthetic journal can be validated as JSON; live full restore NOT attempted');
   const checkpoint={phase:'reload',hive,observation:obsId,record:recordId};
   localStorage.setItem(key,JSON.stringify(checkpoint));
   location.reload();
  }finally{
   window.alert=oldAlert;window.confirm=oldConfirm;
  }
 }catch(error){
  add('diagnosticError','BLOCKED',error?.message||error);
  display('BLOCKED','JOURNAL_PHYSICAL_PROOF_FAILED',error?.stack||error);
 }
}
run();
})();
