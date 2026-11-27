import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';

const load=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const [html,dailySrc,disasterSrc,job,worker,qaScript,qaWorkflow,plan]=await Promise.all([
 load('index.html'),load('js/daily-archives.js'),load('js/disaster-archive.js'),
 load('android-native/PasekaDailyArchiveJob.java'),load('android-native/daily-archive-worker.js'),
 load('scripts/prepare-android-daily-archives.mjs'),load('.github/workflows/android-qa-daily-archives.yml'),
 load('docs/B01-COMPREHENSIVE-ONEPLUS-QA-2026-11-27.md')
]);
const root={crypto:webcrypto};
new Function('window',dailySrc)(root);
new Function('window',disasterSrc)(root);
const daily=root.PasekaDailyArchives;
const disaster=root.PasekaDisasterArchive;

function segment(start,end){
 const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a, 'required existing main source: '+start);
 return html.slice(a,b);
}
async function fixture(){
 const factory=new IDBFactory(),archiveDb=await daily.openStore(factory);
 const dataDb=await new Promise((resolve,reject)=>{
  const req=factory.open('paseka-v1',3);
  req.onupgradeneeded=()=>{
   req.result.createObjectStore('main');
   req.result.createObjectStore('full_backup');
   req.result.createObjectStore('entrance_media',{keyPath:'id'});
  };
  req.onerror=()=>reject(req.error);req.onsuccess=()=>resolve(req.result);
 });
 const record=revision=>new Promise((resolve,reject)=>{
  const tx=dataDb.transaction('main','readwrite');
  tx.objectStore('main').put({meta:{revisionId:revision},hives:[],families:[],records:[{id:revision,note:'QA-NONFACT-'+revision}]},'state');
  tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);
 });
 const inspect=raw=>disaster.inspectArchive(raw,dataDb,state=>assert.ok(state.meta?.revisionId),{captureLiveFence:false});
 const rotate=day=>daily.rotate(archiveDb,{day,createRaw:()=>disaster.exportArchive(dataDb),inspect});
 return {archiveDb,dataDb,record,inspect,rotate,close(){archiveDb.close();dataDb.close();}};
}

test('updated B01 acceptance no longer requires external JSON, SAF, USB or file in Downloads',()=>{
 assert.match(plan,/два поколения/i);
 for(const clause of ['Не включать в обязательную приёмку','SAF','USB','paseka-full-idb-*.json','не менять системную дату','NOT_TESTED'])
  assert.ok(plan.includes(clause),'missing scope boundary '+clause);
 assert.match(plan,/ru\.paseka\.journal\.qa\.daily/);
 assert.doesNotMatch(plan,/приложение QA — архив обязательно установить/);
});

test('one visible restore action and exactly two displayed checked ZIP generations',()=>{
 const panel=segment('<div class="card" id="dailyArchivePanel"', '<div hidden inert aria-hidden="true" style="display:none" id="legacyBackupDiagnostics"');
 assert.match(panel,/id="dailyArchiveLatest"/);
 assert.match(panel,/id="dailyArchivePrevious"/);
 assert.match(panel,/id="dailyRestoreButton"[^>]+onclick="openDailyRestore\(\)">Восстановить/);
 assert.equal((panel.match(/<button\b/g)||[]).length,1,'no manual create button in B01');
 assert.match(html,/id="legacyBackupDiagnostics"[^>]*hidden inert/);
 assert.ok(!panel.includes('Скачать полный архив'),'portable file export must not be required');
});

test('daily archives use independent IndexedDB, verified ZIP and no remote network',()=>{
 assert.equal(daily.DB_NAME,'paseka-daily-archives-v1');
 assert.equal(daily.MAX_BYTES,256*1024*1024);
 const blob=daily.encodeZip('{"QA":"данные"}');
 return daily.decodeZip(blob).then(raw=>assert.equal(raw,'{"QA":"данные"}'));
});

test('comprehensive synthetic three-day transaction proves two generations and immutability on same date',async()=>{
 const f=await fixture();try{
  await f.record('qa-day1');await f.rotate('2026-11-25');
  await f.record('qa-day2');await f.rotate('2026-11-26');
  const same=await daily.readAll(f.archiveDb);
  assert.equal((await f.rotate('2026-11-26')).created,false);
  assert.deepEqual((await daily.readAll(f.archiveDb)).map(x=>[x.slot,x.id]),same.map(x=>[x.slot,x.id]));
  await f.record('qa-day3');await f.rotate('2026-11-27');
  const all=await daily.readAll(f.archiveDb);
  assert.equal(all.length,2);
  assert.deepEqual(all.map(x=>[x.slot,x.day]).sort(),[['latest','2026-11-27'],['previous','2026-11-26']]);
  assert.equal((await daily.getVerified(f.archiveDb,'previous',f.inspect)).proof.main.records[0].id,'qa-day2');
  assert.equal((await daily.getVerified(f.archiveDb,'latest',f.inspect)).proof.main.records[0].id,'qa-day3');
 }finally{f.close();}
});

test('corrupted newest ZIP has no usable restore path while previous remains valid',async()=>{
 const f=await fixture();try{
  await f.record('qa-safe1');await f.rotate('2026-11-25');
  await f.record('qa-safe2');await f.rotate('2026-11-26');
  const rows=await daily.readAll(f.archiveDb),bad=rows.find(x=>x.slot==='latest');
  await new Promise((resolve,reject)=>{
   const tx=f.archiveDb.transaction('files','readwrite');
   tx.objectStore('files').put({...bad,blob:new Blob(['PK-not-validated'])});
   tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);
  });
  const result=await daily.checked(await daily.readAll(f.archiveDb),f.inspect);
  assert.deepEqual(result.map(x=>[x.slot,x.valid]),[['latest',false],['previous',true]]);
  await assert.rejects(daily.getVerified(f.archiveDb,'latest',f.inspect),/SHA-256/);
  assert.equal((await daily.getVerified(f.archiveDb,'previous',f.inspect)).proof.main.meta.revisionId,'qa-safe1');
 }finally{f.close();}
});

test('restore UI preserves confirmation, verified previous selection, transient rollback and final commit proof',()=>{
 const method=segment('async function restoreDailyArchive(){','async function resolveDailyArchiveRecovery(){');
 for(const line of [
  "if(!confirm(", 'getVerified(store,choice.slot','selected.row.id!==choice.id',
  'prepareRollback(store,rollbackRaw','startupWriteGate.ready=false',
  'PasekaDisasterArchive.atomicRestore(', 'preserveIdenticalLiveBinary:true',
  'verifyRestoredArchive(db,selected.proof)', 'finishRollback(store,rollbackId)', 'location.reload()'
 ])assert.ok(method.includes(line),'restore safety condition missing: '+line);
 assert.ok(method.indexOf('verifyRestoredArchive(db,selected.proof)')<method.indexOf('location.reload()'));
 assert.ok(method.indexOf('prepareRollback(store,rollbackRaw')<method.indexOf('PasekaDisasterArchive.atomicRestore('));
 assert.match(method,/Аварийная копия сохранена; дальнейшие записи остановлены/);
});

test('native scheduled worker cannot silently create or migrate a new primary database',()=>{
 for(const snippet of [
  'setPeriodic(PERIOD_MS, FLEX_MS)','setPersisted(true)','setRequiresStorageNotLow(true)',
  'setBlockNetworkLoads(true)','setAllowFileAccess(false)','setAllowContentAccess(false)',
  'loadDataWithBaseURL("https://localhost/"','jobFinished(parameters, retry)'
 ])assert.ok(job.includes(snippet),'native isolation missing '+snippet);
 for(const snippet of ['req.onupgradeneeded','req.transaction.abort()','readStartupUseMarker()','openExistingSource()','PasekaDailyArchives.rotate(store','outcome=\'RETRY\''])
  assert.ok(worker.includes(snippet),'background worker safety missing '+snippet);
 assert.doesNotMatch(worker,/atomicRestore|deleteDatabase|navigator\.sendBeacon|fetch\(/);
});

test('QA build checks unique package, signer and real APK SHA without replacing an installed package',()=>{
 assert.match(qaWorkflow,/ru\.paseka\.journal\.qa\.daily/);
 assert.match(qaWorkflow,/QA-PROVENANCE\.json/);
 assert.match(qaWorkflow,/aapt/);assert.match(qaWorkflow,/apksigner/);
 assert.match(qaWorkflow,/sha256/);
 assert.match(qaWorkflow,/retention-days: 7/);
 assert.doesNotMatch(qaWorkflow,/adb install|publish-pages|firebase deploy/);
 assert.match(qaScript,/ru\.paseka\.journal\.qa\.daily/);
 assert.match(plan,/не переустанавливать установленные QA/);
});

test('physical multi-day and background status remain unproven until device evidence',()=>{
 for(const token of ['G0_INSTALL_ISOLATED','G2_FIRST_VERIFIED_LOCAL_ZIP','G3_TWO_GENERATIONS_ROTATION','G4_ACTUAL_BACKGROUND_ONLY','G4_CATCH_UP_ON_OPEN','G5_OFFLINE_RESTART_IDB','G6_QA_PREVIOUS_RESTORE_AND_REOPEN','G8_UI_HISTORY_JOURNAL_ISOLATION'])
  assert.ok(plan.includes(token),'missing physical gate '+token);
 assert.match(plan,/не менять часы телефона/i);
 assert.match(plan,/только QA/i);
 assert.match(plan,/Никаких обязательных внешних файлов/i);
});
