import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { readFile } from 'node:fs/promises';
const [html,mediaSource]=await Promise.all([
 readFile(new URL('../index.html',import.meta.url),'utf8'),
 readFile(new URL('../js/media-analysis-results.js',import.meta.url),'utf8')
]);
const scope={};new Function('window',mediaSource)(scope);
const [hiveSource,labelSource,itemSource,layoutSource]=await Promise.all([readFile(new URL('../js/hive-model.js',import.meta.url),'utf8'),readFile(new URL('../js/equipment-labels.js',import.meta.url),'utf8'),readFile(new URL('../js/equipment-items.js',import.meta.url),'utf8'),readFile(new URL('../js/sectional-physical-layout.js',import.meta.url),'utf8')]);new Function('window',hiveSource)(scope);new Function('window',labelSource)(scope);new Function('window',itemSource)(scope);new Function('window',layoutSource)(scope);
function extract(name){
 const re=new RegExp('(?:async\\s+)?function\\s+'+name+'\\s*\\('),match=re.exec(html);
 assert.ok(match,'missing '+name);
 const next=/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;next.lastIndex=match.index+match[0].length;
 const end=next.exec(html);return html.slice(match.index,end?end.index:html.indexOf('</script>',match.index));
}
function load(name,deps){deps.PasekaMediaAnalysisResults||=scope.PasekaMediaAnalysisResults;deps.PasekaEquipmentItems||=scope.PasekaEquipmentItems;deps.PasekaSectionalPhysicalLayout||=scope.PasekaSectionalPhysicalLayout;return new Function('deps','with(deps){return ('+extract(name)+');}')(deps)}
const emptyState=()=>({meta:{schemaVersion:16,revisionId:'fixture-rev'},hives:[],families:[],records:[],tasks:[],extractions:[],snapshots:[],layouts:{},auditLog:[],aiMessages:[],plantCatalog:[],plantLocations:[],plantObservations:[],plantAIQueue:[],queens:[],queenEvents:[],equipmentInventory:{bodies:{},events:[]},varroaObservations:[],pesticideIncidents:[],deadoutReviews:[],familyEvents:[],sectionalTechProcesses:[],mediaAnalysisResults:[]});
function stateWithResult(id){const state=emptyState();state.mediaAnalysisResults=[{id,jobId:'job-'+id,kind:'image',hiveId:'hive-1',familyId:'family-1',recordId:'record-1',capturedAt:'2026-11-18T09:55:00.000Z',createdAt:'2026-11-18T10:00:00.000Z',originalRef:'media-job:job-'+id,result:{observations:[{label:'bee',count:2}]}}];return state}
async function makeDb(){const factory=new IDBFactory(),request=factory.open('media-restore-'+Math.random(),1);return new Promise((resolve,reject)=>{request.onupgradeneeded=()=>{request.result.createObjectStore('main');request.result.createObjectStore('full_backup')};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
function restoreDeps(db,current,file){
 let revision=0;const deps={db,DB:'paseka',STORE:'main',BACKUP_STORE:'full_backup',S:current,saveQueue:Promise.resolve(),lastPersistedRevision:current.meta.revisionId,autoBackupInfo:null,autoBackupRecovered:false,
  $:id=>id==='backupFile'?{files:[file]}:{},confirm:()=>true,alert:()=>{},render:()=>{},uid:()=> 'restored-revision-'+(++revision),
  migrateState:()=>false,logAudit:(type,details)=>{deps.S.auditLog.push({id:'audit-'+type,type,at:'2026-11-18T12:00:00.000Z',...details})},
  validateVirtualApiary:()=>({errorCount:0,errors:[]}),assertRawBackupIntegrity:state=>state,
  validateBackupState:load('validateBackupState',{}),
  assertBackupNotFromNewerSchema:load('assertBackupNotFromNewerSchema',{})
 };
 deps.readMain=load('readMain',deps);deps.readAutoBackup=load('readAutoBackup',deps);deps.writeMainWithBackup=load('writeMainWithBackup',deps);
 return deps;
}
async function seed(db,main,backup){const tx=db.transaction(['main','full_backup'],'readwrite');tx.objectStore('main').put(main,'state');if(backup)tx.objectStore('full_backup').put({at:'2026-11-18T11:00:00.000Z',state:backup},'previous');await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
async function get(db,store,key){const tx=db.transaction(store,'readonly');return new Promise((resolve,reject)=>{const q=tx.objectStore(store).get(key);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)})}
test('manual JSON restore preserves media analysis results and backs up the replaced state',async()=>{
 const db=await makeDb();try{
  const current=stateWithResult('before'),incoming=stateWithResult('from-json');await seed(db,current,null);
  const file={text:async()=>JSON.stringify({app:'Paseka',state:incoming})},deps=restoreDeps(db,current,file);
  await load('restoreBackup',deps)();
  const main=await get(db,'main','state'),backup=await get(db,'full_backup','previous');
  assert.equal(main.mediaAnalysisResults[0].id,'from-json',deps.alerts.join(' | '));
  assert.equal(backup.state.mediaAnalysisResults[0].id,'before');
  assert.equal(main.meta.revisionId,'restored-revision-1');
 }finally{db.close()}
});
test('automatic backup restore preserves media analysis results and snapshots the replaced state',async()=>{
 const db=await makeDb();try{
  const current=stateWithResult('before'),backupState=stateWithResult('from-auto-backup');await seed(db,current,backupState);
  const deps=restoreDeps(db,current,{text:async()=>''});
  await load('restoreAutoBackup',deps)();
  const main=await get(db,'main','state'),backup=await get(db,'full_backup','previous');
  assert.equal(main.mediaAnalysisResults[0].id,'from-auto-backup',deps.alerts.join(' | '));
  assert.equal(backup.state.mediaAnalysisResults[0].id,'before');
  assert.equal(main.meta.revisionId,'restored-revision-1');
 }finally{db.close()}
});
