import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const root={};
for(const file of ['paseka-sha256.js','video-managed-copies-byte-audit.js'])
 new Function('window',await readFile(new URL('../js/'+file,import.meta.url),'utf8'))(root);
const inspect=root.PasekaManagedVideoCopyByteAudit.inspectManagedCopyBytes;
const digest=s=>createHash('sha256').update(s).digest('hex');
let count=0;
const fixtureFactory=new IDBFactory();
async function setup(data={}){
 const r=fixtureFactory.open('managed-bytes-'+(++count),1);
 r.onupgradeneeded=()=>{
  const db=r.result;db.createObjectStore('main');
  db.createObjectStore('entrance_media',{keyPath:'id'});
  db.createObjectStore('archive_staging',{keyPath:'id'});
  db.createObjectStore('archive_history',{keyPath:'backupId'});
  db.createObjectStore('full_backup');
 };
 const db=await new Promise((yes,no)=>{r.onsuccess=()=>yes(r.result);r.onerror=()=>no(r.error)});
 const tx=db.transaction(['main','entrance_media','archive_staging','archive_history','full_backup'],'readwrite');
 tx.objectStore('main').put(data.state||{records:[]},'state');
 for(const item of data.entrance||[])tx.objectStore('entrance_media').put(item);
 for(const item of data.staging||[])tx.objectStore('archive_staging').put(item);
 for(const item of data.history||[])tx.objectStore('archive_history').put(item);
 for(const [key,item] of data.backups||[])tx.objectStore('full_backup').put(item,key);
 await new Promise((yes,no)=>{tx.oncomplete=yes;tx.onabort=tx.onerror=()=>no(tx.error)});
 return db;
}
const live=(id='v1',str='original')=>({id,blob:new Blob([str]),bytes:str.length,blobSha256:digest(str)});
const staged=(id='v1',str='original')=>({id:'stage:'+id,kind:'v2_pending_original',source:'entrance_media',videoId:id,
 blob:new Blob([str]),sourceBytes:str.length,sourceSha256:digest(str)});
const blocked=x=>{
 assert.equal(x.status,'BLOCKED');
 assert.equal(x.cleanupAuthorized,false);
 assert.equal(x.deleteAllowed,false);
 assert.equal(x.allCopiesVerified,false);
 assert.equal(x.externalCopiesVerified,false);
 assert.equal(x.dataModified,false);
};
test('known entrance, staging and quarantine original bytes are individually verified, never approved for deletion',async()=>{
 const db=await setup({
  entrance:[live()],
  staging:[staged()],
  backups:[['b',{kind:'v2_entrance_quarantine_rollback_snapshot',
   quarantinedMedia:[live()],beforeState:{records:[]},afterState:{records:[]}}]]
 });
 const modes=[];
 const readonly={objectStoreNames:db.objectStoreNames,transaction(stores,mode){
  modes.push(mode);if(mode!=='readonly')throw Error('unexpected write');
  return db.transaction(stores,mode);
 }};
 const report=await inspect(readonly,{source:'entrance_media',videoId:'v1'});
 blocked(report);
 assert.equal(report.managedCopiesObserved,3);
 assert.equal(report.managedCopiesByteMatched,3);
 assert.equal(report.byteIntegrityObserved,true);
 assert.deepEqual(modes,['readonly']);
 assert.deepEqual(report.managedCopyLocations,[
  'archive_staging.v2_pending_original','entrance_media','full_backup.quarantine']);
 db.close();
});
test('tampered protected staging Blob is detected despite matching metadata',async()=>{
 const db=await setup({entrance:[live()],staging:[{...staged(),blob:new Blob(['replaced'])}]});
 const report=await inspect(db,{source:'entrance_media',videoId:'v1'});
 blocked(report);assert.equal(report.managedCopiesObserved,2);
 assert.equal(report.managedCopiesByteMatched,1);
 assert.ok(report.issues.includes('copy_bytes_mismatch'));
 db.close();
});
test('journal Data URL bytes are hashed but old unidentified video prevents complete audit',async()=>{
 const encoded=Buffer.from('journal').toString('base64');
 const state={records:[{id:'r1',media:[
  {kind:'video',videoId:'j1',sourceSha256:digest('journal'),sourceBytes:7,data:'data:video/mp4;base64,'+encoded},
  {kind:'video',data:'data:video/mp4;base64,AAAA'}
 ]}]};
 const db=await setup({state});
 const report=await inspect(db,{source:'record_media',videoId:'j1'});
 blocked(report);
 assert.equal(report.managedCopiesObserved,1);
 assert.equal(report.managedCopiesByteMatched,1);
 assert.ok(report.issues.includes('unidentified_journal_video'));
 assert.equal(report.byteIntegrityObserved,false);
 db.close();
});
test('opaque staged state and unknown backup stay blocking, no arbitrary blob disclosure',async()=>{
 const secret='PRIVATE_ARCHIVE_SYNTHETIC_BYTES';
 const db=await setup({
  entrance:[live()],
  staging:[{id:'opaque',kind:'state',blob:new Blob([secret])}],
  backups:[['unknown',{blob:new Blob([secret])}]]
 });
 const report=await inspect(db,{source:'entrance_media',videoId:'v1'});
 blocked(report);
 assert.ok(report.issues.includes('opaque_staging_state'));
 assert.ok(report.issues.includes('unknown_backup'));
 assert.equal(JSON.stringify(report).includes(secret),false);
 db.close();
});
test('invalid identity and inaccessible snapshot fail closed without any bytes returned',async()=>{
 const db=await setup({entrance:[live()]});
 blocked(await inspect(db,{source:'entrance_media',videoId:'../evil'}));
 const bad={objectStoreNames:db.objectStoreNames,transaction(){throw Error('PRIVATE_DEVICE_SECRET')}};
 const report=await inspect(bad,{source:'entrance_media',videoId:'v1'});
 blocked(report);
 assert.equal(report.reason,'snapshot_unavailable');
 assert.equal(JSON.stringify(report).includes('PRIVATE_DEVICE_SECRET'),false);
 db.close();
});

test('PASEKA01 previous.state journal video is counted but remains an opaque legacy backup blocker',async()=>{
 const encoded=Buffer.from('legacy').toString('base64');
 const state={records:[{id:'visit',media:[{kind:'video',videoId:'j1',
  sourceSha256:digest('legacy'),sourceBytes:6,
  data:'data:video/mp4;base64,'+encoded}]}]};
 const db=await setup({backups:[['legacy',{previous:{at:'2026-11-20',state}}]]});
 const report=await inspect(db,{source:'record_media',videoId:'j1'});
 blocked(report);
 assert.equal(report.managedCopiesObserved,1);
 assert.equal(report.managedCopiesByteMatched,1);
 assert.ok(report.managedCopyLocations.includes('full_backup.previous.state'));
 assert.ok(report.issues.includes('unknown_backup'));
 db.close();
});
test('reopen and repeated read-only audits preserve protected originals',async()=>{
 const db=await setup({entrance:[live()],staging:[staged()]});
 const first=await inspect(db,{source:'entrance_media',videoId:'v1'});
 blocked(first);
 const name=db.name;db.close();
 const req=fixtureFactory.open(name,1);
 const other=await new Promise((resolve,reject)=>{
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error);
 });
 const again=await inspect(other,{source:'entrance_media',videoId:'v1'});
 blocked(again);
 assert.equal(first.managedCopiesObserved,2);
 assert.equal(again.managedCopiesObserved,2);
 assert.equal(again.managedCopiesByteMatched,2);
 other.close();
});
