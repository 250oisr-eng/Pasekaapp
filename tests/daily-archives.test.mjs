import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';
const dailyCode=await readFile(new URL('../js/daily-archives.js',import.meta.url),'utf8');
const archiveCode=await readFile(new URL('../js/disaster-archive.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
const root={crypto:webcrypto};
new Function('window',dailyCode)(root);
new Function('window',archiveCode)(root);
const daily=root.PasekaDailyArchives,archive=root.PasekaDisasterArchive;
async function fixture(){
 const idb=new IDBFactory(),store=await daily.openStore(idb);
 const db=await new Promise((resolve,reject)=>{
  const req=idb.open('paseka-v1',3);
  req.onupgradeneeded=()=>{req.result.createObjectStore('main');req.result.createObjectStore('full_backup');req.result.createObjectStore('entrance_media',{keyPath:'id'});};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
 const inspect=raw=>archive.inspectArchive(raw,db,s=>assert.ok(s.meta.revisionId),{captureLiveFence:false});
 async function state(revision,withBlob=false){
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(['main','entrance_media'],'readwrite');
   tx.objectStore('main').put({meta:{revisionId:revision},hives:[],families:[],records:[]},'state');
   if(withBlob)tx.objectStore('entrance_media').put({id:'video1',blob:new Blob([Uint8Array.of(1,2,3)],{type:'video/mp4'})});
   tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);
  });
 }
 const rotate=(day,options={})=>daily.rotate(store,{day,createRaw:()=>archive.exportArchive(db),inspect,...options});
 async function rows(){return (await daily.readAll(store)).filter(r=>r.slot!=='staging').map(r=>[r.slot,r.day,r.id,r.sha256]).sort();}
 async function alter(slot,callback){
  const row=(await daily.readAll(store)).find(r=>r.slot===slot);
  await new Promise((resolve,reject)=>{
   const tx=store.transaction('files','readwrite');tx.objectStore('files').put(callback(row));
   tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);
  });
 }
 return {idb,store,db,inspect,state,rotate,rows,alter,close(){db.close();store.close();}};
}
test('real single-entry ZIP format, Unicode JSON, CRC and truncated bytes',async()=>{
 const raw='{"name":"Пасека","video":"AAEC"}',blob=daily.encodeZip(raw);
 const bytes=new Uint8Array(await blob.arrayBuffer());
 assert.deepEqual([...bytes.slice(0,4)],[0x50,0x4b,3,4]);
 assert.equal(await daily.decodeZip(blob),raw);
 assert.match(await daily.sha256(blob),/^[a-f0-9]{64}$/);
 bytes[55]^=1;
 await assert.rejects(daily.decodeZip(new Blob([bytes])),/CRC32|структура/);
 await assert.rejects(daily.decodeZip(blob.slice(0,-1)),/ZIP/);
});
test('daily generation rotation retains exactly two checked files and skips duplicate day',async()=>{
 const f=await fixture();try{
  await f.state('r1',true);assert.equal((await f.rotate('2026-11-25')).created,true);
  await f.state('r2');await f.rotate('2026-11-26');
  const before=await f.rows();
  assert.equal((await f.rotate('2026-11-26',{createRaw:()=>{throw new Error('must not export twice');}})).created,false);
  assert.deepEqual(await f.rows(),before);
  await f.state('r3');await f.rotate('2026-11-27');
  assert.deepEqual((await f.rows()).map(x=>x.slice(0,2)),[['latest','2026-11-27'],['previous','2026-11-26']]);
  assert.equal((await daily.readAll(f.store)).length,2);
  const old=await daily.getVerified(f.store,'previous',f.inspect);
  assert.equal(old.proof.main.meta.revisionId,'r2');
  const bytes=new Uint8Array(await old.proof.rows.get('entrance_media')[0].value.blob.arrayBuffer());
  assert.deepEqual([...bytes],[1,2,3]);
  assert.equal(old.proof.liveKeySignatures,undefined);
  await assert.rejects(archive.atomicRestore(f.db,old.proof,'r3'),/fence/);
 }finally{f.close();}
});
test('corrupt last archive leaves previous selectable; new valid generation retains good previous',async()=>{
 const f=await fixture();try{
  await f.state('r1');await f.rotate('2026-11-25');
  await f.state('r2');await f.rotate('2026-11-26');
  await f.alter('latest',row=>({...row,blob:new Blob(['corrupt'])}));
  const checked=await daily.checked(await daily.readAll(f.store),f.inspect);
  assert.deepEqual(checked.map(x=>[x.slot,x.valid]),[['latest',false],['previous',true]]);
  await assert.rejects(daily.getVerified(f.store,'latest',f.inspect),/SHA-256/);
  assert.equal((await daily.getVerified(f.store,'previous',f.inspect)).proof.main.meta.revisionId,'r1');
  await f.state('r3');await f.rotate('2026-11-27');
  assert.deepEqual((await f.rows()).map(x=>x.slice(0,2)),[['latest','2026-11-27'],['previous','2026-11-25']]);
 }finally{f.close();}
});
test('failed export or readback does not change committed generations; retry clears staging',async()=>{
 const f=await fixture();try{
  await f.state('r1');await f.rotate('2026-11-25');
  await f.state('r2');await f.rotate('2026-11-26');
  const before=await f.rows();
  await assert.rejects(f.rotate('2026-11-27',{createRaw:()=>{throw new Error('export failed');}}),/export failed/);
  assert.deepEqual(await f.rows(),before);
  await f.state('r3');let seen=0;
  await assert.rejects(f.rotate('2026-11-27',{inspect:async raw=>{
   const proof=await f.inspect(raw);
   if(proof.main.meta.revisionId==='r3'&&++seen===2)throw new Error('readback failure');
   return proof;
  }}),/readback failure/);
  assert.deepEqual(await f.rows(),before);
  assert.equal((await daily.readAll(f.store)).filter(r=>r.slot==='staging').length,1);
  await f.rotate('2026-11-27');assert.equal((await daily.readAll(f.store)).length,2);
 }finally{f.close();}
});
test('competing daily writes cannot overwrite checked generations silently',async()=>{
 const f=await fixture();try{
  await f.state('r1');await f.rotate('2026-11-25');
  await f.state('r2');
  let enter,release;const waiting=new Promise(r=>enter=r),hold=new Promise(r=>release=r);
  const slow=f.rotate('2026-11-26',{createRaw:async()=>{enter();await hold;return archive.exportArchive(f.db);}});
  await waiting;await f.rotate('2026-11-26');release();
  await assert.rejects(slow,/параллельно/);
  assert.deepEqual((await f.rows()).map(x=>x.slice(0,2)),[['latest','2026-11-26'],['previous','2026-11-25']]);
 }finally{f.close();}
});
test('restoring selected daily archive verifies exact state and retains a safety file until completion',async()=>{
 const f=await fixture();try{
  await f.state('r1');await f.rotate('2026-11-25');
  await f.state('r2');await f.rotate('2026-11-26');
  const chosen=await daily.getVerified(f.store,'previous',raw=>archive.inspectArchive(raw,f.db));
  const rollback=await daily.prepareRollback(f.store,await archive.exportArchive(f.db),'2026-11-26',f.inspect);
  await assert.rejects(f.rotate('2026-11-27'),/аварийная копия/i);
  await archive.atomicRestore(f.db,chosen.proof,'r2');
  assert.equal((await archive.verifyRestoredArchive(f.db,chosen.proof)).verified,true);
  await daily.finishRollback(f.store,rollback);
  assert.equal((await daily.readAll(f.store)).length,2);
 }finally{f.close();}
});
test('live video is not overwritten by restore; recovery archives stay unchanged',async()=>{
 const f=await fixture();try{
  await f.state('r1');await f.rotate('2026-11-25');
  await f.state('r2',true);await f.rotate('2026-11-26');const before=await f.rows();
  const chosen=await daily.getVerified(f.store,'previous',raw=>archive.inspectArchive(raw,f.db));
  await assert.rejects(archive.atomicRestore(f.db,chosen.proof,'r2'),/Live binary/);
  assert.deepEqual(await f.rows(),before);
  const current=await f.inspect(await archive.exportArchive(f.db));
  assert.equal(current.main.meta.revisionId,'r2');
  assert.equal(current.rows.get('entrance_media').length,1);
 }finally{f.close();}
});
test('single user-visible recovery action, no manual archive controls, offline module included',()=>{
 const panel=html.match(/<div class="card" id="dailyArchivePanel">[\s\S]*?<\/div>/)?.[0];
 assert.ok(panel);assert.equal((panel.match(/<button\b/g)||[]).length,1);
 assert.match(panel,/onclick="openDailyRestore\(\)">Восстановить/);
 assert.match(html,/hidden inert aria-hidden="true"[^>]+id="legacyBackupDiagnostics"/);
 assert.match(html,/startDailyArchiveScheduler\(\);/);
 assert.match(html,/visibilitychange/);
 assert.match(html,/PasekaDisasterArchive\.verifyRestoredArchive/);
 assert.match(sw,/'\.\/js\/daily-archives\.js'/);
});

test('interrupted restore safety copy clears only if full current payload is verified',async()=>{
 const f=await fixture();try{
  await f.state('r1');await f.rotate('2026-11-25');
  await f.state('r2');await f.rotate('2026-11-26');
  const chosen=await daily.getVerified(f.store,'previous',raw=>archive.inspectArchive(raw,f.db));
  const current=await archive.exportArchive(f.db);
  await daily.prepareRollback(f.store,current,'2026-11-26',f.inspect,chosen.proof.sha256);
  assert.equal(await daily.resolveInterruptedRestore(f.store,current,f.inspect),true);
  assert.equal((await daily.readAll(f.store)).length,2);
  await daily.prepareRollback(f.store,current,'2026-11-26',f.inspect,chosen.proof.sha256);
  await f.state('unrelated-change');
  assert.equal(await daily.resolveInterruptedRestore(f.store,await archive.exportArchive(f.db),f.inspect),false);
  assert.equal((await daily.readAll(f.store)).length,3);
  const target=await daily.getVerified(f.store,'previous',raw=>archive.inspectArchive(raw,f.db));
  await archive.atomicRestore(f.db,target.proof,'unrelated-change');
  assert.equal(await daily.resolveInterruptedRestore(f.store,await archive.exportArchive(f.db),f.inspect),true);
  assert.equal((await daily.readAll(f.store)).length,2);
 }finally{f.close();}
});

test('daily restore keeps existing byte-identical original without clearing or rewriting its row',async()=>{
 const f=await fixture();try{
  await f.state('r1',true);await f.rotate('2026-11-25');
  await f.state('r2');await f.rotate('2026-11-26');
  const chosen=await daily.getVerified(f.store,'previous',raw=>archive.inspectArchive(raw,f.db));
  const writes=[];
  const guarded={
   objectStoreNames:f.db.objectStoreNames,
   transaction(names,mode){
    const inner=f.db.transaction(names,mode);
    if(mode!=='readwrite')return inner;
    return new Proxy(inner,{
     get(tx,property){
      if(property==='objectStore')return name=>{
       const store=tx.objectStore(name);
       return new Proxy(store,{
        get(target,op){
         if(name==='entrance_media'&&['clear','delete','put'].includes(op))return (...args)=>{writes.push(op);throw Error('Protected original must not be rewritten');};
         const value=Reflect.get(target,op,target);return typeof value==='function'?value.bind(target):value;
        }
       });
      };
      const value=Reflect.get(tx,property,tx);return typeof value==='function'?value.bind(tx):value;
     },
     set(tx,property,value){Reflect.set(tx,property,value,tx);return true;}
    });
   }
  };
  await archive.atomicRestore(guarded,chosen.proof,'r2',{preserveIdenticalLiveBinary:true});
  assert.equal((await archive.verifyRestoredArchive(f.db,chosen.proof)).verified,true);
  assert.deepEqual(writes,[]);
 }finally{f.close();}
});
test('daily restore rejects different equal-size live bytes even after preflight and preserves the whole DB',async()=>{
 const f=await fixture();try{
  await f.state('r1',true);await f.rotate('2026-11-25');
  await f.state('r2');await f.rotate('2026-11-26');
  const chosen=await daily.getVerified(f.store,'previous',raw=>archive.inspectArchive(raw,f.db));
  await new Promise((resolve,reject)=>{
   const tx=f.db.transaction('entrance_media','readwrite');
   tx.objectStore('entrance_media').put({id:'video1',blob:new Blob([Uint8Array.of(9,8,7)],{type:'video/mp4'})});
   tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);
  });
  const before=await archive.exportArchive(f.db);
  await assert.rejects(archive.atomicRestore(f.db,chosen.proof,'r2',{preserveIdenticalLiveBinary:true}),/Live binary originals differ/);
  const proof=await f.inspect(before);
  assert.equal((await archive.verifyRestoredArchive(f.db,proof)).verified,true);
  assert.equal(proof.main.meta.revisionId,'r2');
 }finally{f.close();}
});
test('daily restore refuses an old snapshot that omits a current original',async()=>{
 const f=await fixture();try{
  await f.state('r1');await f.rotate('2026-11-25');
  await f.state('r2',true);await f.rotate('2026-11-26');
  const chosen=await daily.getVerified(f.store,'previous',raw=>archive.inspectArchive(raw,f.db));
  const before=await f.inspect(await archive.exportArchive(f.db));
  await assert.rejects(archive.atomicRestore(f.db,chosen.proof,'r2',{preserveIdenticalLiveBinary:true}),/Live binary originals absent/);
  assert.equal((await archive.verifyRestoredArchive(f.db,before)).verified,true);
 }finally{f.close();}
});
