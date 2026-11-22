// CI-ONLY SYNTHETIC TRANSACTION MODEL. No application import or physical deletion.
// All database names and records below are generated for fake-indexeddb.
import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {createHash} from 'node:crypto';
const factory=new IDBFactory();
const sha=data=>createHash('sha256').update(data).digest('hex');
let serial=0;
const stores=['main','entrance_media','archive_staging','archive_history','full_backup'];
const video='SYNTHETIC_TEST_ONLY_VIDEO';
const digest=sha(video);
async function createFixture(){
 const req=factory.open('synthetic-cleanup-test-only-'+(++serial),1);
 req.onupgradeneeded=()=>{
  const d=req.result;
  for(const name of stores){
   if(name==='entrance_media')d.createObjectStore(name,{keyPath:'id'});
   else d.createObjectStore(name);
  }
 };
 const db=await new Promise((yes,no)=>{req.onsuccess=()=>yes(req.result);req.onerror=()=>no(req.error)});
 await transact(db,'readwrite',tx=>{
  tx.objectStore('main').put({meta:{revisionId:'synthetic-r1'},records:[]},'state');
  tx.objectStore('main').put({version:1,entries:[{source:'entrance_media',
   videoId:'synthetic-v1',resultId:'synthetic-result',cleanupState:'blocked_archive_safety',
   sourceSha256:digest,sourceBytes:video.length,
   recognitionStatus:'synthetic_completed',result:{events:0}}]},'video_recognition_ledger_v1');
  tx.objectStore('entrance_media').put({id:'synthetic-v1',blob:new Blob([video]),
   blobSha256:digest,bytes:video.length,
   captureProvenance:{source:'synthetic_test_only'}});
 });
 return db;
}
function transact(db,mode,fn){
 return new Promise((yes,no)=>{
  const tx=db.transaction(stores,mode);
  try{fn(tx)}catch(err){try{tx.abort()}catch(_){}no(err);return}
  tx.oncomplete=()=>yes();
  tx.onabort=tx.onerror=()=>no(tx.error||Error('transaction aborted'));
 });
}
async function get(db,store,key){
 return new Promise((yes,no)=>{
  const tx=db.transaction(store,'readonly'),q=tx.objectStore(store).get(key);
  q.onsuccess=()=>yes(q.result);q.onerror=()=>no(q.error);
 });
}
async function addProtected(db,store,value,key){
 await transact(db,'readwrite',tx=>{
  tx.objectStore(store).put(value,key);
 });
}
const blocked=(reason)=>({status:'BLOCKED',reason,cleanupAuthorized:false,externalCopiesVerified:false});
async function syntheticCleanupOnly(db,{expectedRevision='synthetic-r1',forceAbort=false}={}){
 // Explicitly never accepts real user IDs, DB identities, or unknown provenance.
 if(!db.name.startsWith('synthetic-cleanup-test-only-'))return blocked('not_synthetic_database');
 const before=await get(db,'entrance_media','synthetic-v1');
 if(!before?.blob)return blocked('synthetic_original_missing');
 if(before.captureProvenance?.source!=='synthetic_test_only')return blocked('source_not_owned');
 if(before.bytes!==video.length||before.blobSha256!==digest)return blocked('source_metadata_invalid');
 const actual=sha(Buffer.from(await before.blob.arrayBuffer()));
 if(actual!==digest)return blocked('source_bytes_mismatch');
 return new Promise(resolve=>{
  const tx=db.transaction(stores,'readwrite');
  const reqs={
   state:tx.objectStore('main').get('state'),
   ledger:tx.objectStore('main').get('video_recognition_ledger_v1'),
   original:tx.objectStore('entrance_media').get('synthetic-v1'),
   tombstone:tx.objectStore('main').get('synthetic_cleanup_tombstone'),
   staging:tx.objectStore('archive_staging').getAll(),
   history:tx.objectStore('archive_history').getAll(),
   backups:tx.objectStore('full_backup').getAll()
  };
  const values={},keys=Object.keys(reqs);
  let seen=0,planned=blocked('transaction_aborted');
  const reject=reason=>{
   planned=blocked(reason);
   try{tx.abort()}catch(_){ }
  };
  for(const key of keys){
   reqs[key].onsuccess=()=>{
    values[key]=reqs[key].result;
    if(++seen!==keys.length)return;
    if(values.state?.meta?.revisionId!==expectedRevision)return reject('state_revision_changed');
    if(values.staging.length||values.history.length||values.backups.length)
     return reject('protected_copy_or_history_present');
    if(values.tombstone)return reject('existing_tombstone_requires_reconciliation');
    const found=values.ledger?.entries?.filter(e=>
     e.source==='entrance_media'&&e.videoId==='synthetic-v1');
    if(found?.length!==1||found[0].recognitionStatus!=='synthetic_completed'||
       found[0].resultId!=='synthetic-result'||found[0].sourceSha256!==digest||
       found[0].sourceBytes!==video.length)
     return reject('synthetic_recognition_evidence_missing');
    if(values.original?.captureProvenance?.source!=='synthetic_test_only'||
       values.original.blobSha256!==digest||values.original.bytes!==video.length)
     return reject('original_changed_since_hash');
    tx.objectStore('main').put({
      version:1,source:'entrance_media',videoId:'synthetic-v1',
      resultId:'synthetic-result',sourceSha256:digest,
      disposition:'synthetic_transaction_deleted_test_only'
    },'synthetic_cleanup_tombstone');
    tx.objectStore('entrance_media').delete('synthetic-v1');
    planned={status:'SYNTHETIC_TRANSACTION_COMMITTED',cleanupAuthorized:false,
       realWorldDeletionVerified:false,externalCopiesVerified:false};
    if(forceAbort)reject('injected_abort');
   };
   reqs[key].onerror=()=>reject('transaction_read_failed');
  }
  tx.oncomplete=()=>resolve(planned);
  tx.onabort=()=>resolve(planned.status==='BLOCKED'?planned:blocked('transaction_aborted'));
  tx.onerror=()=>{};
 });
}
test('synthetic-only atomic tombstone+delete commits without modifying recognition evidence',async()=>{
 const db=await createFixture(),prior=await get(db,'main','video_recognition_ledger_v1');
 const result=await syntheticCleanupOnly(db);
 assert.equal(result.status,'SYNTHETIC_TRANSACTION_COMMITTED');
 assert.equal(result.cleanupAuthorized,false);
 assert.equal(await get(db,'entrance_media','synthetic-v1'),undefined);
 assert.deepEqual(await get(db,'main','video_recognition_ledger_v1'),prior);
 assert.equal((await get(db,'main','synthetic_cleanup_tombstone')).sourceSha256,digest);
 db.close();
});
test('forced abort rolls back original and tombstone as a single transaction',async()=>{
 const db=await createFixture();
 const result=await syntheticCleanupOnly(db,{forceAbort:true});
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.reason,'injected_abort');
 assert.ok((await get(db,'entrance_media','synthetic-v1')).blob);
 assert.equal(await get(db,'main','synthetic_cleanup_tombstone'),undefined);
 db.close();
});
test('new state revision denies synthetic deletion and preserves source',async()=>{
 const db=await createFixture();
 const result=await syntheticCleanupOnly(db,{expectedRevision:'stale'});
 assert.equal(result.reason,'state_revision_changed');
 assert.ok((await get(db,'entrance_media','synthetic-v1')).blob);db.close();
});
test('protected backup prevents any synthetic original deletion',async()=>{
 const db=await createFixture();
 await addProtected(db,'full_backup',{kind:'unknown',blob:new Blob([video])},'backup');
 const result=await syntheticCleanupOnly(db);
 assert.equal(result.reason,'protected_copy_or_history_present');
 assert.ok((await get(db,'entrance_media','synthetic-v1')).blob);
 assert.equal(await get(db,'main','synthetic_cleanup_tombstone'),undefined);db.close();
});
test('old or unknown ownership metadata cannot become synthetic deletion authority',async()=>{
 const db=await createFixture();
 const x=await get(db,'entrance_media','synthetic-v1');
 x.captureProvenance={source:'file_input_or_external_camera'};
 await transact(db,'readwrite',tx=>tx.objectStore('entrance_media').put(x));
 const result=await syntheticCleanupOnly(db);
 assert.equal(result.reason,'source_not_owned');
 assert.ok((await get(db,'entrance_media','synthetic-v1')).blob);db.close();
});
test('reopen preserves synthetic tombstone and never deletes twice',async()=>{
 const db=await createFixture(),name=db.name;
 assert.equal((await syntheticCleanupOnly(db)).status,'SYNTHETIC_TRANSACTION_COMMITTED');
 db.close();
 const request=factory.open(name,1);
 const reopened=await new Promise((yes,no)=>{
  request.onsuccess=()=>yes(request.result);request.onerror=()=>no(request.error)
 });
 assert.equal((await get(reopened,'main','synthetic_cleanup_tombstone')).videoId,'synthetic-v1');
 assert.equal((await syntheticCleanupOnly(reopened)).reason,'synthetic_original_missing');
 assert.equal(await get(reopened,'entrance_media','synthetic-v1'),undefined);
 reopened.close();
});
