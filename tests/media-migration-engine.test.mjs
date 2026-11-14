import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const shaSource=await readFile(new URL('../js/paseka-sha256.js',import.meta.url),'utf8');new Function(shaSource)();
const source=await readFile(new URL('../js/paseka-media-migration-engine.js',import.meta.url),'utf8');new Function(source)();
const Engine=globalThis.PasekaMediaMigrationEngine;
function openDb(name){const f=new IDBFactory();return new Promise((resolve,reject)=>{const q=f.open(name,7);q.onupgradeneeded=()=>{q.result.createObjectStore('media_blobs',{keyPath:'id'});q.result.createObjectStore('media_migration_journal',{keyPath:'id'})};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)})}
const data=(bytes,mime='image/jpeg')=>'data:'+mime+';base64,'+Buffer.from(bytes).toString('base64');
const candidate={id:'legacy-image:records:r1:0',collection:'records',entityId:'r1',mediaIndex:0};
const state=()=>({records:[{id:'r1',media:[{kind:'image',name:'a.jpg',data:data([1,2,3,4])}]}]});
test('copies one image and atomically records a verifiable checkpoint without changing source',async()=>{const db=await openDb('engine-copy');const s=state(),before=structuredClone(s);const result=await Engine.copyOne(db,s,candidate,'migration-a',webcrypto);assert.equal(result.status,'copied');assert.deepEqual(s,before);assert.equal((await Engine.getProgress(db,'migration-a',webcrypto)).completed,1);db.close()});
test('resume is idempotent and verifies the existing blob plus journal',async()=>{const db=await openDb('engine-resume'),s=state();const a=await Engine.copyOne(db,s,candidate,'migration-b',webcrypto),b=await Engine.copyOne(db,s,candidate,'migration-b',webcrypto);assert.equal(a.status,'copied');assert.equal(b.status,'already_copied');assert.equal((await Engine.getProgress(db,'migration-b',webcrypto)).completed,1);db.close()});
test('refuses conflicting destination IDs and never overwrites',async()=>{const db=await openDb('engine-conflict'),s=state();await Engine.copyOne(db,s,candidate,'migration-c',webcrypto);s.records[0].media[0].data=data([9,9,9]);await assert.rejects(Engine.copyOne(db,s,candidate,'migration-other',webcrypto),{code:'MIGRATION_ID_CONFLICT'});db.close()});
test('rollback removes only blobs and journal entries owned by that migration',async()=>{const db=await openDb('engine-rollback'),s=state();await Engine.copyOne(db,s,candidate,'migration-d',webcrypto);const other={...candidate,id:'legacy-image:records:r2:0',entityId:'r2'};s.records.push({id:'r2',media:[{kind:'image',data:data([7,8])}]});await Engine.copyOne(db,s,other,'migration-e',webcrypto);const result=await Engine.rollback(db,'migration-d');assert.equal(result.removedBlobs,1);assert.equal(result.removedJournals,1);assert.equal(result.sourceChanged,false);assert.equal((await Engine.getProgress(db,'migration-e',webcrypto)).completed,1);db.close()});
test('rejects malformed Base64, SVG and oversized data before writing',async()=>{const db=await openDb('engine-validation');const bad=state();bad.records[0].media[0].data='data:image/jpeg;base64,AQ=';await assert.rejects(Engine.copyOne(db,bad,candidate,'m1',webcrypto),{code:'INVALID_BASE64'});const svg=state();svg.records[0].media[0].data=data([1,2],'image/svg+xml');await assert.rejects(Engine.copyOne(db,svg,candidate,'m2',webcrypto),{code:'UNSUPPORTED_IMAGE_MIME'});await assert.rejects(Engine.copyOne(db,state(),candidate,'m3',webcrypto,{maxImageBytes:2}),{code:'IMAGE_SIZE_LIMIT'});assert.equal((await Engine.getProgress(db,'m1',webcrypto)).journalEntries,0);db.close()});
test('rejects invalid candidate and unavailable database stores',async()=>{const db=await openDb('engine-guards');await assert.rejects(Engine.copyOne(db,state(),{},'m',webcrypto),{code:'INVALID_CANDIDATE'});const f=new IDBFactory(),empty=await new Promise((resolve,reject)=>{const q=f.open('engine-empty',1);q.onupgradeneeded=()=>q.result.createObjectStore('x');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});await assert.rejects(Engine.getProgress(empty,'m'),{code:'MIGRATION_STORE_UNAVAILABLE'});db.close();empty.close()});

test('copies candidates for entities without IDs using the planner fallback key',async()=>{const db=await openDb('engine-legacy-index'),s={records:[{media:[{kind:'image',data:data([3,4,5])}]}]},c={id:'legacy-image:records:legacy-index-0:0',collection:'records',entityId:'legacy-index-0',mediaIndex:0};const r=await Engine.copyOne(db,s,c,'migration-index',webcrypto);assert.equal(r.status,'copied');assert.equal((await Engine.getProgress(db,'migration-index',webcrypto)).completed,1);db.close()});
test('detects corrupted stored Blob bytes instead of reporting successful resume',async()=>{const db=await openDb('engine-corrupt'),s=state();await Engine.copyOne(db,s,candidate,'migration-corrupt',webcrypto);const tx=db.transaction('media_blobs','readwrite'),store=tx.objectStore('media_blobs'),records=await new Promise((resolve,reject)=>{const q=store.getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});const rec=records[0];rec.blob=new Blob([new Uint8Array([8,8,8])],{type:'image/jpeg'});store.put(rec);await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});const progress=await Engine.getProgress(db,'migration-corrupt',webcrypto);assert.equal(progress.completed,0);assert.equal(progress.orphanedJournalEntries,1);await assert.rejects(Engine.copyOne(db,s,candidate,'migration-corrupt',webcrypto),{code:'MIGRATION_ID_CONFLICT'});db.close()});
test('rollback preserves copied Blobs referenced by live state or snapshots', async () => {
  const factory = new IDBFactory();
  const db = await new Promise((resolve, reject) => {
    const request = factory.open('engine-rollback-protect-references', 1);
    request.onupgradeneeded = () => {
      const d = request.result;
      d.createObjectStore('media_blobs', { keyPath: 'id' });
      d.createObjectStore('media_migration_journal', { keyPath: 'id' });
      d.createObjectStore('main');
      d.createObjectStore('auto_snapshots', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const s = state();
  const copied = await Engine.copyOne(db, s, candidate, 'migration-protected', webcrypto);
  const tx = db.transaction(['main', 'auto_snapshots'], 'readwrite');
  tx.objectStore('main').put({ records: [{ media: [{ blobId: copied.blobId }] }] }, 'state');
  tx.objectStore('auto_snapshots').put({ id: 'snapshot-1', state: { records: [{ media: [{ blobId: copied.blobId }] }] } });
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

  const result = await Engine.rollback(db, 'migration-protected');
  assert.equal(result.removedBlobs, 0);
  assert.equal(result.protectedBlobs, 1);
  assert.equal(result.removedJournals, 1);
  const read = db.transaction('media_blobs', 'readonly');
  const stored = await new Promise((resolve, reject) => {
    const request = read.objectStore('media_blobs').get(copied.blobId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.ok(stored, 'referenced Blob must remain available');
  db.close();
});

test('rollback is idempotent and does not touch the original state',async()=>{const db=await openDb('engine-rollback-idempotent'),s=state(),before=structuredClone(s);await Engine.copyOne(db,s,candidate,'migration-rb',webcrypto);const first=await Engine.rollback(db,'migration-rb'),second=await Engine.rollback(db,'migration-rb');assert.equal(first.removedBlobs,1);assert.equal(second.removedBlobs,0);assert.deepEqual(s,before);db.close()});
