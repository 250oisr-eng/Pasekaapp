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
test('restoring an archive atomically rewrites all stores and survives reopen',async()=>{
 const db=await database();await seed(db);const raw=await api.exportArchive(db);
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
test('main UI exposes distinct guarded P0 flow while legacy JSON functions stay present',()=>{
 assert.match(html,/js\/disaster-archive\.js/);
 assert.match(html,/downloadDisasterArchive\(\)/);
 assert.match(html,/restoreDisasterArchive\(\)/);
 assert.match(html,/await PasekaDisasterArchive\.atomicRestore/);
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
 const db=await database();await seed(db);
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
 const db=await database();await seed(db);
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
 assert.match(html,/Сохранение файла на носитель ещё НЕ подтверждено/);
});
