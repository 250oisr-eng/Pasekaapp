import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';
const code=await readFile(new URL('../js/disaster-archive.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const root={crypto:webcrypto,Blob,TextEncoder,Uint8Array,ArrayBuffer,atob,btoa};
new Function('window','TextEncoder','Blob','btoa','atob',code)(root,TextEncoder,Blob,btoa,atob);
const api=root.PasekaDisasterArchive;
async function database(name='paseka-v1'){
 const idb=new IDBFactory();const db=await new Promise((yes,no)=>{
  const q=idb.open(name,3);
  q.onupgradeneeded=()=>{q.result.createObjectStore('main');q.result.createObjectStore('full_backup');q.result.createObjectStore('entrance_media',{keyPath:'id'});};
  q.onsuccess=()=>yes(q.result);q.onerror=()=>no(q.error);
 });
 return db;
}
function seed(db,withBlob=true){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(['main','full_backup','entrance_media'],'readwrite');
  tx.objectStore('main').put({meta:{revisionId:'r1',schemaVersion:15},hives:[{id:'h1'}],families:[],records:[],auditLog:[{id:'event'}]},'state');
  tx.objectStore('full_backup').put({state:{hives:[]}},'previous');
  tx.objectStore('entrance_media').put({id:'video1',blob:withBlob?new Blob([new Uint8Array([1,2,3,4])],{type:'video/mp4'}):'placeholder'});
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
 });
}
async function get(db,store,key){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(store,'readonly'),req=tx.objectStore(store).get(key);
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
}
test('full archive captures all three IndexedDB stores and verifies SHA/records',async()=>{
 const db=await database();await seed(db);
 const raw=await api.exportArchive(db),inspected=await api.inspectArchive(raw,db,s=>assert.equal(s.hives[0].id,'h1'));
 assert.deepEqual(Object.keys(inspected.counts).sort(),['entrance_media','full_backup','main']);
 assert.deepEqual(Object.values(inspected.counts).sort(),[1,1,1]);
 assert.equal(inspected.main.meta.revisionId,'r1');
 const blob=inspected.rows.get('entrance_media')[0].value.blob;
 assert.equal(blob.type,'video/mp4');assert.deepEqual(Array.from(new Uint8Array(await blob.arrayBuffer())),[1,2,3,4]);
 db.close();
});
test('SHA tampering and truncated store inventory fail before any write',async()=>{
 const db=await database();await seed(db);const raw=await api.exportArchive(db);
 const altered=JSON.parse(raw);altered.payload.stores.pop();
 await assert.rejects(api.inspectArchive(JSON.stringify(altered),db),/SHA-256/);
 const damaged=JSON.parse(raw);damaged.manifest.sha256='bad';
 await assert.rejects(api.inspectArchive(JSON.stringify(damaged),db),/SHA-256/);
 assert.equal((await get(db,'main','state')).meta.revisionId,'r1');db.close();
});
test('restoring an archive atomically rewrites non-binary live stores and survives reopen',async()=>{
 const db=await database();await seed(db,false);const raw=await api.exportArchive(db);
 let tx=db.transaction('main','readwrite');tx.objectStore('main').put({meta:{revisionId:'r2'},hives:[],families:[],records:[]},'state');await new Promise(r=>tx.oncomplete=r);
 const inspected=await api.inspectArchive(raw,db);
 await api.atomicRestore(db,inspected,'r2');
 assert.equal((await get(db,'main','state')).meta.revisionId,'r1');
 assert.equal((await get(db,'entrance_media','video1')).id,'video1');db.close();
});
test('revision race aborts restore without clearing existing data',async()=>{
 const db=await database();await seed(db);const raw=await api.exportArchive(db),inspected=await api.inspectArchive(raw,db);
 await assert.rejects(api.atomicRestore(db,inspected,'wrong'),/changed since preflight/);
 assert.equal((await get(db,'main','state')).meta.revisionId,'r1');
 assert.equal((await get(db,'entrance_media','video1')).id,'video1');db.close();
});
test('unexpected invalid inline-key record aborts the entire multi-store restore',async()=>{
 const db=await database();await seed(db);
 const raw=await api.exportArchive(db),inspection=await api.inspectArchive(raw,db);
 inspection.rows.get('main')[0].value.meta.revisionId='different';
 inspection.rows.get('entrance_media')[0].value=Object.create(null);
 await assert.rejects(api.atomicRestore(db,inspection,'r1'));
 assert.equal((await get(db,'main','state')).meta.revisionId,'r1');
 assert.equal((await get(db,'entrance_media','video1')).id,'video1');
 db.close();
});
test('unsupported store changes and missing main state are rejected',async()=>{
 const db=await database();await seed(db);const raw=await api.exportArchive(db),obj=JSON.parse(raw);
 const bad=JSON.parse(raw);bad.payload.stores.find(x=>x.name==='main').entries=[];
 bad.manifest.counts.main=0;
 const cryptoChecksum=await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(bad.payload)));
 bad.manifest.sha256=Buffer.from(cryptoChecksum).toString('hex');
 await assert.rejects(api.inspectArchive(JSON.stringify(bad),db),/Main state is missing/);
 db.close();
});
test('main-based UI exposes read-only full archive without destructive restore and preserves JSON legacy',()=>{
 assert.match(html,/js\/disaster-archive\.js/);
 assert.match(html,/downloadDisasterArchive\(\)/);
 assert.doesNotMatch(html,/function restoreDisasterArchive\(/);
 assert.doesNotMatch(html,/onclick="restoreDisasterArchive\(\)"/);
 assert.match(html,/async function downloadBackup\(/);
 assert.match(html,/async function restoreBackup\(/);
});

test('reopened database retains complete recovery after simulated crash boundary',async()=>{
 const idb=new IDBFactory(),name='paseka-crash-fixture';
 const open=()=>new Promise((yes,no)=>{const q=idb.open(name,3);q.onupgradeneeded=()=>{q.result.createObjectStore('main');q.result.createObjectStore('full_backup');q.result.createObjectStore('entrance_media',{keyPath:'id'});};q.onsuccess=()=>yes(q.result);q.onerror=()=>no(q.error)});
 let db=await open();await seed(db);const raw=await api.exportArchive(db);
 let tx=db.transaction(['main','entrance_media'],'readwrite');
 tx.objectStore('main').put({meta:{revisionId:'new'},hives:[],families:[],records:[]},'state');
 tx.objectStore('entrance_media').delete('video1');
 await new Promise((yes,no)=>{tx.oncomplete=yes;tx.onerror=()=>no(tx.error)});
 const inspection=await api.inspectArchive(raw,db);
 await api.atomicRestore(db,inspection,'new');
 db.close();db=await open();
 assert.equal((await get(db,'main','state')).meta.revisionId,'r1');
 const video=await get(db,'entrance_media','video1');
 assert.deepEqual(Array.from(new Uint8Array(await video.blob.arrayBuffer())),[1,2,3,4]);
 db.close();
});
test('quota-like DataCloneError aborts all-store restore and preserves media and history',async()=>{
 const db=await database();await seed(db,false);
 const raw=await api.exportArchive(db),inspection=await api.inspectArchive(raw,db);
 inspection.rows.get('main')[0].value.meta.revisionId='changed';
 inspection.rows.get('entrance_media')[0].value.blob=()=>{}; // fake structured clone / quota precondition
 await assert.rejects(api.atomicRestore(db,inspection,'r1'));
 assert.equal((await get(db,'main','state')).meta.revisionId,'r1');
 assert.equal((await get(db,'entrance_media','video1')).id,'video1');
 assert.deepEqual((await get(db,'main','state')).auditLog,[{id:'event'}]);
 db.close();
});
test('truncated archive and hostile index shape fail before restore',async()=>{
 const db=await database();await seed(db);const raw=await api.exportArchive(db);
 await assert.rejects(api.inspectArchive(raw.slice(0,-20),db));
 const modified=JSON.parse(raw);
 modified.payload.stores.find(x=>x.name==='entrance_media').keyPath='different';
 modified.manifest.sha256=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(modified.payload)))).toString('hex');
 await assert.rejects(api.inspectArchive(JSON.stringify(modified),db),/Store schema mismatch/);
 assert.equal((await get(db,'main','state')).meta.revisionId,'r1');db.close();
});

test('injected QuotaExceededError after first store write aborts all stores and preserves prior state',async()=>{
 const db=await database();await seed(db,false);
 const raw=await api.exportArchive(db);
 const inspected=await api.inspectArchive(raw,db);
 inspected.rows.get('main')[0].value.meta.revisionId='recovered';
 const hostileDb={
  objectStoreNames:db.objectStoreNames,
  transaction(names,mode){
   const inner=db.transaction(names,mode);
   if(mode!=='readwrite')return inner;
   return new Proxy(inner,{
    get(target,property){
     if(property==='objectStore')return name=>{
      const real=target.objectStore(name);
      return new Proxy(real,{
       get(record,operation){
        if(operation==='put'&&name==='entrance_media')return ()=>{throw Object.assign(new Error('Simulated storage quota reached'),{name:'QuotaExceededError'});};
        const value=Reflect.get(record,operation,record);
        return typeof value==='function'?value.bind(record):value;
       }
      });
     };
     const value=Reflect.get(target,property,target);
     return typeof value==='function'?value.bind(target):value;
    },
    set(target,property,value){Reflect.set(target,property,value,target);return true;}
   });
  }
 };
 await assert.rejects(api.atomicRestore(hostileDb,inspected,'r1'),error=>error?.name==='QuotaExceededError');
 assert.equal((await get(db,'main','state')).meta.revisionId,'r1');
 assert.equal((await get(db,'entrance_media','video1')).id,'video1');
 db.close();
});

test('physical file round-trip imports all stores into a clean independent IndexedDB',async()=>{
 const {mkdtemp,writeFile,readFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const source=await database('source-fixture');await seed(source);
 const raw=await api.exportArchive(source);
 const dir=await mkdtemp(join(tmpdir(),'paseka-independent-'));
 try{
  const filename=join(dir,'full-apiary-test.json');
  await writeFile(filename,raw,'utf8');
  source.close();
  const stored=await readFile(filename,'utf8');
  assert.equal(stored,raw,'actual saved file round-trip must be byte identical');
  const clean=await database('clean-fixture');
  const proof=await api.inspectArchive(stored,clean);
  assert.deepEqual(proof.counts,{entrance_media:1,full_backup:1,main:1});
  assert.equal(await get(clean,'main','state'),undefined);
  await api.atomicRestore(clean,proof,null);
  const byteProof=await api.verifyRestoredArchive(clean,proof);
  assert.equal(byteProof.verified,true);
  assert.equal(byteProof.sha256,JSON.parse(stored).manifest.sha256);
  assert.equal((await get(clean,'main','state')).hives[0].id,'h1');
  assert.equal((await get(clean,'full_backup','previous')).state.hives.length,0);
  const video=await get(clean,'entrance_media','video1');
  assert.deepEqual([...new Uint8Array(await video.blob.arrayBuffer())],[1,2,3,4]);
  clean.close();
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('duplicate source keys and mismatched inline IDs reject preflight with valid recomputed SHA',async()=>{
 const db=await database();await seed(db);const raw=await api.exportArchive(db);
 const reseal=async envelope=>{
  envelope.manifest.counts=Object.fromEntries(envelope.payload.stores.map(x=>[x.name,x.entries.length]));
  envelope.manifest.sha256=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(envelope.payload)))).toString('hex');
  return JSON.stringify(envelope);
 };
 const duplicates=JSON.parse(raw);
 const media=duplicates.payload.stores.find(x=>x.name==='entrance_media');
 media.entries.push(structuredClone(media.entries[0]));
 await assert.rejects(api.inspectArchive(await reseal(duplicates),db),/Duplicate record key/);
 const wrong=JSON.parse(raw),media2=wrong.payload.stores.find(x=>x.name==='entrance_media');
 const record=media2.entries[0][1],idField=record.v.find(item=>item[0]==='id');
 idField[1].v='other-video';
 await assert.rejects(api.inspectArchive(await reseal(wrong),db),/Inline record key mismatch/);
 assert.equal((await get(db,'main','state')).meta.revisionId,'r1');
 db.close();
});
test('archive UI allows non-destructive read-back verification before restore',()=>{
 assert.match(html,/async function verifyDisasterArchive\(/);
 assert.match(html,/onclick="verifyDisasterArchive\(\)"/);
 assert.match(html,/await PasekaDisasterArchive\.inspectArchive\(raw,db/);
});

test('new original entrance video after preflight blocks restore without deleting any media',async()=>{
 const db=await database('key-fence-entrance');await seed(db);
 const raw=await api.exportArchive(db),inspection=await api.inspectArchive(raw,db);
 const t=db.transaction('entrance_media','readwrite');
 t.objectStore('entrance_media').put({id:'new-original',blob:new Blob([new Uint8Array([9,8,7])],{type:'video/mp4'})});
 await new Promise((yes,no)=>{t.oncomplete=yes;t.onabort=t.onerror=()=>no(t.error);});
 await assert.rejects(api.atomicRestore(db,inspection,'r1'),/Store keys changed since preflight: entrance_media/);
 assert.equal((await get(db,'main','state')).meta.revisionId,'r1');
 const original=await get(db,'entrance_media','new-original');
 assert.deepEqual([...new Uint8Array(await original.blob.arrayBuffer())],[9,8,7]);
 assert.equal((await get(db,'entrance_media','video1')).id,'video1');
 db.close();
});
test('new historical backup after preflight blocks restore and preserves full_backup',async()=>{
 const db=await database('key-fence-history');await seed(db,false);
 const raw=await api.exportArchive(db),inspection=await api.inspectArchive(raw,db);
 const t=db.transaction('full_backup','readwrite');
 t.objectStore('full_backup').put({state:{hives:[{id:'newly-saved'}]}},'after-preflight');
 await new Promise((yes,no)=>{t.oncomplete=yes;t.onabort=t.onerror=()=>no(t.error);});
 await assert.rejects(api.atomicRestore(db,inspection,'r1'),/Store keys changed since preflight: full_backup/);
 assert.equal((await get(db,'full_backup','after-preflight')).state.hives[0].id,'newly-saved');
 assert.equal((await get(db,'main','state')).meta.revisionId,'r1');
 db.close();
});
test('changed media key inventory including deletion blocks restore without rewriting prior state',async()=>{
 const db=await database('key-fence-delete');await seed(db);
 const raw=await api.exportArchive(db),inspection=await api.inspectArchive(raw,db);
 const t=db.transaction('entrance_media','readwrite');
 t.objectStore('entrance_media').delete('video1');
 await new Promise((yes,no)=>{t.oncomplete=yes;t.onabort=t.onerror=()=>no(t.error);});
 await assert.rejects(api.atomicRestore(db,inspection,'r1'),/Store keys changed since preflight: entrance_media/);
 assert.equal(await get(db,'entrance_media','video1'),undefined);
 assert.equal((await get(db,'main','state')).meta.revisionId,'r1');
 db.close();
});
test('restore refuses a caller-supplied inspection without live key inventory',async()=>{
 const db=await database('key-fence-missing');await seed(db);
 const raw=await api.exportArchive(db),inspection=await api.inspectArchive(raw,db);
 delete inspection.liveKeySignatures;
 await assert.rejects(api.atomicRestore(db,inspection,'r1'),/Live store key fence is missing/);
 assert.equal((await get(db,'entrance_media','video1')).id,'video1');
 db.close();
});

test('same-key historical backup overwrite after preflight blocks restore without losing newer record',async()=>{
 const db=await database('value-fence-same-key-history');await seed(db,false);
 const raw=await api.exportArchive(db),inspection=await api.inspectArchive(raw,db);
 const t=db.transaction('full_backup','readwrite');
 t.objectStore('full_backup').put({state:{hives:[{id:'newer-hive'}]}},'previous');
 await new Promise((yes,no)=>{t.oncomplete=yes;t.onabort=t.onerror=()=>no(t.error);});
 await assert.rejects(api.atomicRestore(db,inspection,'r1'),/Store values changed since preflight: full_backup/);
 assert.equal((await get(db,'full_backup','previous')).state.hives[0].id,'newer-hive');
 assert.equal((await get(db,'main','state')).meta.revisionId,'r1');
 db.close();
});
test('same-key main.state edit with unchanged revisionId blocks archive restore',async()=>{
 const db=await database('value-fence-main');await seed(db,false);
 const raw=await api.exportArchive(db),inspection=await api.inspectArchive(raw,db);
 const changed=await get(db,'main','state');
 changed.records.push({id:'new-inspection',text:'Synthetic record'});
 const t=db.transaction('main','readwrite');t.objectStore('main').put(changed,'state');
 await new Promise((yes,no)=>{t.oncomplete=yes;t.onabort=t.onerror=()=>no(t.error);});
 await assert.rejects(api.atomicRestore(db,inspection,'r1'),/Store values changed since preflight: main/);
 assert.equal((await get(db,'main','state')).records[0].id,'new-inspection');
 assert.equal((await get(db,'entrance_media','video1')).id,'video1');
 db.close();
});
test('same-key video replacement with different binary size aborts before any store clear',async()=>{
 const db=await database('value-fence-media-size');await seed(db);
 const raw=await api.exportArchive(db),inspection=await api.inspectArchive(raw,db);
 const newer=[8,7,6,5,4,3];
 const t=db.transaction('entrance_media','readwrite');
 t.objectStore('entrance_media').put({id:'video1',blob:new Blob([new Uint8Array(newer)],{type:'video/mp4'})});
 await new Promise((yes,no)=>{t.oncomplete=yes;t.onabort=t.onerror=()=>no(t.error);});
 await assert.rejects(api.atomicRestore(db,inspection,'r1'),/Store values changed since preflight: entrance_media/);
 assert.deepEqual([...new Uint8Array(await (await get(db,'entrance_media','video1')).blob.arrayBuffer())],newer);
 assert.equal((await get(db,'full_backup','previous')).state.hives.length,0);
 db.close();
});
test('restore requires live value fence; an incomplete inspection is not authority to rewrite',async()=>{
 const db=await database('value-fence-missing');await seed(db);
 const raw=await api.exportArchive(db),inspection=await api.inspectArchive(raw,db);
 delete inspection.liveValueSignatures;
 await assert.rejects(api.atomicRestore(db,inspection,'r1'),/Live store value fence is missing/);
 assert.equal((await get(db,'main','state')).meta.revisionId,'r1');
 assert.equal((await get(db,'entrance_media','video1')).id,'video1');
 db.close();
});

test('same-size same-MIME replacement after preflight never overwrites newer original',async()=>{
 const db=await database('binary-fence-equal-size');await seed(db);
 const raw=await api.exportArchive(db),inspection=await api.inspectArchive(raw,db);
 const newer=[9,8,7,6]; // exactly the same byte length and video/mp4 as the archived original
 const t=db.transaction('entrance_media','readwrite');
 t.objectStore('entrance_media').put({id:'video1',blob:new Blob([new Uint8Array(newer)],{type:'video/mp4'})});
 await new Promise((yes,no)=>{t.oncomplete=yes;t.onabort=t.onerror=()=>no(t.error);});
 await assert.rejects(api.atomicRestore(db,inspection,'r1'),/Live binary originals require non-destructive restore: entrance_media/);
 const preserved=await get(db,'entrance_media','video1');
 assert.deepEqual([...new Uint8Array(await preserved.blob.arrayBuffer())],newer);
 assert.equal((await get(db,'main','state')).meta.revisionId,'r1');
 assert.deepEqual((await get(db,'full_backup','previous')).state.hives,[]);
 db.close();
});

test('unchanged existing binary refuses destructive rewrite while fresh DB may restore it',async()=>{
 const original=await database('binary-fence-existing');await seed(original);
 const raw=await api.exportArchive(original),inspection=await api.inspectArchive(raw,original);
 await assert.rejects(api.atomicRestore(original,inspection,'r1'),/Live binary originals require non-destructive restore: entrance_media/);
 assert.deepEqual([...new Uint8Array(await (await get(original,'entrance_media','video1')).blob.arrayBuffer())],[1,2,3,4]);
 const fresh=await database('binary-fence-fresh');
 const cleanInspection=await api.inspectArchive(raw,fresh);
 await api.atomicRestore(fresh,cleanInspection,null);
 assert.deepEqual([...new Uint8Array(await (await get(fresh,'entrance_media','video1')).blob.arrayBuffer())],[1,2,3,4]);
 assert.equal((await get(fresh,'main','state')).meta.revisionId,'r1');
 original.close();fresh.close();
});

test('nested live media in a non-video store blocks restore without clearing any record',async()=>{
 const db=await database('binary-fence-nested');await seed(db,false);
 const raw=await api.exportArchive(db),inspection=await api.inspectArchive(raw,db);
 const old=await get(db,'full_backup','previous');
 old.state.nested={attachments:[{payload:new Blob([Uint8Array.from([4,4,4,4])],{type:'application/octet-stream'})}]};
 const t=db.transaction('full_backup','readwrite');t.objectStore('full_backup').put(old,'previous');
 await new Promise((yes,no)=>{t.oncomplete=yes;t.onabort=t.onerror=()=>no(t.error);});
 await assert.rejects(api.atomicRestore(db,inspection,'r1'),/Store values changed since preflight: full_backup/);
 // A fresh preflight now sees an unchanged nested Blob: the final transaction
 // must still reject its destructive overwrite, independently of value races.
 const unchangedBinaryInspection=await api.inspectArchive(raw,db);
 await assert.rejects(api.atomicRestore(db,unchangedBinaryInspection,'r1'),/Live binary originals require non-destructive restore: full_backup/);
 assert.equal((await get(db,'full_backup','previous')).state.nested.attachments[0].payload.size,4);
 assert.equal((await get(db,'main','state')).meta.revisionId,'r1');
 db.close();
});

test('independent recovered database survives reopen and full SHA/Blob verification',async()=>{
 const original=await database('recover-source-reopen');await seed(original);
 const raw=await api.exportArchive(original);
 const restored=await database('recover-target-reopen');
 const inspection=await api.inspectArchive(raw,restored);
 await api.atomicRestore(restored,inspection,null);
 const proofBefore=await api.verifyRestoredArchive(restored,inspection);
 assert.equal(proofBefore.verified,true);
 restored.close();
 // Reopening a separate database connection after process-like shutdown.
 // IndexedDBFactory per helper is intentionally isolated; this fixture keeps
 // the same underlying IDBFactory to simulate a durable restart accurately.
 const idb=new IDBFactory(),name='recover-real-restart';
 const open=()=>new Promise((yes,no)=>{
  const request=idb.open(name,3);
  request.onupgradeneeded=()=>{
   request.result.createObjectStore('main');
   request.result.createObjectStore('full_backup');
   request.result.createObjectStore('entrance_media',{keyPath:'id'});
  };
  request.onsuccess=()=>yes(request.result);request.onerror=()=>no(request.error);
 });
 let db=await open();
 const reopenedInspection=await api.inspectArchive(raw,db);
 await api.atomicRestore(db,reopenedInspection,null);
 db.close();db=await open();
 assert.equal((await api.verifyRestoredArchive(db,reopenedInspection)).sha256,JSON.parse(raw).manifest.sha256);
 db.close();original.close();
});

test('recovered same-size same-MIME video corruption is detected by full-byte proof',async()=>{
 const source=await database('verify-original-video');await seed(source);
 const raw=await api.exportArchive(source);
 const clean=await database('verify-corrupted-video');
 const proof=await api.inspectArchive(raw,clean);
 await api.atomicRestore(clean,proof,null);
 assert.equal((await api.verifyRestoredArchive(clean,proof)).verified,true);
 const t=clean.transaction('entrance_media','readwrite');
 t.objectStore('entrance_media').put({id:'video1',blob:new Blob([Uint8Array.from([8,7,6,5])],{type:'video/mp4'})});
 await new Promise((yes,no)=>{t.oncomplete=yes;t.onerror=t.onabort=()=>no(t.error);});
 await assert.rejects(api.verifyRestoredArchive(clean,proof),/Restored database differs from archived source bytes/);
 assert.deepEqual([...new Uint8Array(await (await get(clean,'entrance_media','video1')).blob.arrayBuffer())],[8,7,6,5]);
 clean.close();source.close();
});

test('recovery verification refuses unproven inspection and detects altered history',async()=>{
 const source=await database('verify-history-source');await seed(source,false);
 const raw=await api.exportArchive(source);
 const clean=await database('verify-history-target');
 const inspection=await api.inspectArchive(raw,clean);
 await api.atomicRestore(clean,inspection,null);
 await assert.rejects(api.verifyRestoredArchive(clean,{}),/SHA-256 required/);
 const t=clean.transaction('full_backup','readwrite');
 t.objectStore('full_backup').put({state:{hives:[{id:'changed'}]}},'previous');
 await new Promise((yes,no)=>{t.oncomplete=yes;t.onerror=t.onabort=()=>no(t.error);});
 await assert.rejects(api.verifyRestoredArchive(clean,inspection),/Restored database differs from archived source bytes/);
 assert.equal((await get(clean,'full_backup','previous')).state.hives[0].id,'changed');
 clean.close();source.close();
});

test('main baseline keeps G0 inventory and isolates readonly archive UI',()=>{
 assert.ok(html.includes('onclick="downloadG0SourceInventory()"'));
 assert.ok(html.includes('./js/p0-source-inventory.js'));
 assert.ok(html.includes('id="p0FullArchiveReadonly"'));
 assert.ok(html.includes('Функция восстановления полной базы заблокирована'));
 assert.ok(html.includes('await PasekaDisasterArchive.exportArchive(db)'));
 assert.ok(!html.includes('restoreDisasterArchive()'));
});
