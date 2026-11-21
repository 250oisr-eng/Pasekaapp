import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';
const root={crypto:webcrypto,atob:globalThis.atob,console:{info(){}}};
for(const path of ['../js/paseka-archive.js','./fixtures/android-two-mp4-proof-fixtures.js','./fixtures/android-two-mp4-proof.js']){
  const source=readFileSync(new URL(path,import.meta.url),'utf8');
  new Function('window',source)(root);
}
test('isolated browser proof inserts two pinned MP4s once, reopens and exports on both launches',async()=>{
  const dbFactory=new IDBFactory();
  const deps={factory:dbFactory,cryptoProvider:webcrypto,
    archive:root.PasekaArchive,fixtures:root.PasekaTwoMp4ProofFixtures};
  const first=await root.PasekaTwoMp4Proof.run(deps);
  assert.equal(first.status,'INITIAL_PASS');
  assert.equal(first.videoCount,2);
  assert.equal(first.archiveVersion,1);
  assert.equal(first.cleanupAuthorized,false);
  assert.equal(first.recognitionSucceeded,false);
  const second=await root.PasekaTwoMp4Proof.run(deps);
  assert.equal(second.status,'RELAUNCH_PASS');
  assert.deepEqual(second.sourceSha256,first.sourceSha256);
  assert.equal(second.videoCount,2);
  // Backups have random IDs: source byte hashes, not archive container hashes, are stable.
  const request=dbFactory.open(root.PasekaTwoMp4Proof.dbName,1);
  const db=await new Promise((ok,no)=>{request.onsuccess=()=>ok(request.result);request.onerror=()=>no(request.error);});
  const tx=db.transaction('entrance_media','readonly');
  const count=tx.objectStore('entrance_media').count();
  assert.equal(await new Promise((ok,no)=>{count.onsuccess=()=>ok(count.result);count.onerror=()=>no(count.error);}),2);
  db.close();
});
test('modified source pin blocks before any IndexedDB access',async()=>{
  let opened=0;
  const changed=root.PasekaTwoMp4ProofFixtures.map(x=>({...x}));
  changed[0].base64=changed[1].base64;
  await assert.rejects(root.PasekaTwoMp4Proof.run({
    factory:{open(){opened++;throw new Error('should not open DB');}},
    cryptoProvider:webcrypto,archive:root.PasekaArchive,fixtures:changed
  }),e=>e.code==='SOURCE_BYTES_MISMATCH');
  assert.equal(opened,0);
});
test('existing nonempty test database with no proof marker must not be overwritten',async()=>{
  const dbFactory=new IDBFactory(),name=root.PasekaTwoMp4Proof.dbName;
  const req=dbFactory.open(name,1);
  req.onupgradeneeded=()=>{req.result.createObjectStore('main');req.result.createObjectStore('entrance_media',{keyPath:'id'});};
  const db=await new Promise((ok,no)=>{req.onsuccess=()=>ok(req.result);req.onerror=()=>no(req.error);});
  const tx=db.transaction('main','readwrite');
  tx.objectStore('main').put({userData:true},'state');
  await new Promise((ok,no)=>{tx.oncomplete=ok;tx.onerror=()=>no(tx.error);});
  db.close();
  await assert.rejects(root.PasekaTwoMp4Proof.run({
    factory:dbFactory,cryptoProvider:webcrypto,archive:root.PasekaArchive,
    fixtures:root.PasekaTwoMp4ProofFixtures
  }),e=>e.code==='EXISTING_PROOF_DB_NOT_EXACT');
  const r=dbFactory.open(name,1);
  const checkDb=await new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
  const q=checkDb.transaction('main').objectStore('main').get('state');
  const saved=await new Promise((ok,no)=>{q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});
  assert.deepEqual(saved,{userData:true});
  checkDb.close();
});
