import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {readFile} from 'node:fs/promises';

// This simulates QuotaExceededError after main.put() has already been queued,
// when backup.put() is attempted inside the same real fake-indexeddb transaction.
// No production database, Android storage, or user files are accessed.
const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const begin = source.indexOf('function writeMainWithBackup(');
const end = source.indexOf('function writeAutoBackup(', begin);
assert.ok(begin >= 0 && end > begin, 'Atomic writer functions must be present');
const functionSource = source.slice(begin, end);
const load = deps => new Function('deps', 'with (deps) { return (' + functionSource + '); }')(deps);
const settled = tx => new Promise((resolve,reject) => {
  tx.oncomplete=resolve;
  tx.onabort=()=>reject(tx.error||new Error('Transaction aborted'));
  tx.onerror=()=>reject(tx.error||new Error('Transaction failed'));
});
const readPair = db => new Promise((resolve,reject) => {
  const tx=db.transaction(['main','full_backup'],'readonly');
  const rows={};
  const main=tx.objectStore('main').get('state');
  const backup=tx.objectStore('full_backup').get('previous');
  main.onsuccess=()=>{rows.main=main.result;};
  backup.onsuccess=()=>{rows.backup=backup.result;};
  tx.oncomplete=()=>resolve(rows);
  tx.onerror=()=>reject(tx.error);
  tx.onabort=()=>reject(tx.error);
});
const open=(factory,name)=>new Promise((resolve,reject)=>{
  const request=factory.open(name,1);
  request.onupgradeneeded=()=>{
    request.result.createObjectStore('main');
    request.result.createObjectStore('full_backup');
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
});

test('P1 QuotaExceededError on backup write aborts earlier main.put across reopened IndexedDB', async () => {
  const factory=new IDBFactory(),name='p1-quota-atomicity';
  let db=await open(factory,name);
  const original={meta:{schemaVersion:15,revisionId:'before-quota'},hives:[{id:'existing-hive'}]};
  const backup={at:'2026-11-20T00:00:00Z',state:{
    meta:{schemaVersion:15,revisionId:'older-backup'},hives:[{id:'earlier-hive'}]
  }};
  const seed=db.transaction(['main','full_backup'],'readwrite');
  seed.objectStore('main').put(original,'state');
  seed.objectStore('full_backup').put(backup,'previous');
  await settled(seed);
  const prototype=Object.getPrototypeOf(db.transaction('main','readonly').objectStore('main'));
  const nativePut=prototype.put;
  let injected=0;
  prototype.put=function(value,key){
    if(this.name==='full_backup'&&key==='previous'){
      injected++;
      throw new DOMException('Synthetic quota reached after main.put','QuotaExceededError');
    }
    return nativePut.call(this,value,key);
  };
  try {
    const write=load({db,STORE:'main',BACKUP_STORE:'full_backup',
      assertBackupNotFromNewerSchema:()=>{}});
    await assert.rejects(
      write({meta:{schemaVersion:15,revisionId:'attempted'},hives:[{id:'new-hive'}]},'before-quota'),
      e=>e?.name==='QuotaExceededError'
    );
    assert.equal(injected,1,'the second write must actually reach quota injection');
  } finally {
    prototype.put=nativePut;
    db.close();
  }
  db=await open(factory,name);
  assert.deepEqual(await readPair(db),{main:original,backup});
  const commit=load({db,STORE:'main',BACKUP_STORE:'full_backup',
    assertBackupNotFromNewerSchema:()=>{}});
  const updated={meta:{schemaVersion:15,revisionId:'after-retry'},hives:[{id:'new-hive'}]};
  await commit(updated,'before-quota');
  db.close();
  db=await open(factory,name);
  const rows=await readPair(db);
  assert.deepEqual(rows.main,updated,'retry must commit a valid newer state');
  assert.deepEqual(rows.backup.state,original,'successful retry backs up previous state');
  db.close();
});
