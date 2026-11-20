import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { readFile } from 'node:fs/promises';

const restoreSource = await readFile(new URL('../js/paseka-archive-restore.js', import.meta.url), 'utf8');
new Function(restoreSource)();
const Restore = globalThis.PasekaArchiveRestore;

function openTestDb(name) {
  return new Promise((resolve, reject) => {
    const request = new IDBFactory().open(name, 1);
    request.onupgradeneeded = () => {
      const staging = request.result.createObjectStore('archive_staging', { keyPath: 'id' });
      staging.createIndex('sessionId', 'sessionId', { unique: false });
      request.result.createObjectStore('archive_history', { keyPath: 'backupId' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function put(db, storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function seedSession(db, sessionId, status) {
  const header = { id: sessionId, sessionId, kind: 'session', backupId: 'backup-' + sessionId };
  if (status !== undefined) header.status = status;
  await put(db, 'archive_staging', header);
  await put(db, 'archive_staging', {
    id: sessionId + ':state', sessionId, kind: 'state', blob: new Blob(['staged'])
  });
}

for (const status of ['unknown', undefined]) {
  test('cleanup preserves staging rows when the session status is invalid: ' + String(status), async () => {
    const db = await openTestDb('paseka-invalid-session-status-' + String(status));
    const sessionId = 'session-' + (status || 'missing');
    await seedSession(db, sessionId, status);

    await assert.rejects(
      Restore.discardArchiveRestoreSession(db, sessionId),
      { code: 'STAGING_SESSION_INVALID' }
    );

    assert.ok(await new Promise((resolve, reject) => {
      const tx = db.transaction('archive_staging', 'readonly');
      const request = tx.objectStore('archive_staging').get(sessionId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }), 'invalid session header must remain intact');
    assert.ok(await new Promise((resolve, reject) => {
      const tx = db.transaction('archive_staging', 'readonly');
      const request = tx.objectStore('archive_staging').get(sessionId + ':state');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }), 'staged content must remain intact');
    db.close();
  });
}

test('cleanup still removes a known reverted import session', async () => {
  const db = await openTestDb('paseka-reverted-session-cleanup');
  const sessionId = 'session-reverted';
  await seedSession(db, sessionId, 'reverted');

  assert.equal(await Restore.discardArchiveRestoreSession(db, sessionId), true);
  const tx = db.transaction('archive_staging', 'readonly');
  const rows = await new Promise((resolve, reject) => {
    const request = tx.objectStore('archive_staging').index('sessionId').getAll(sessionId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.equal(rows.length, 0);
  db.close();
});

function readRows(db,sessionId){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('archive_staging','readonly');
  const request=tx.objectStore('archive_staging').index('sessionId').getAll(sessionId);
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
}
test('history-linked session cannot be discarded after its status was corrupted to failed',async()=>{
 const db=await openTestDb('paseka-cleanup-history-linked-failed');
 const sessionId='session-history-failed';
 await seedSession(db,sessionId,'failed');
 await put(db,'archive_history',{backupId:'history-linked',status:'committed',
  importSessionId:sessionId,rollbackAvailable:true});
 const before=await readRows(db,sessionId);
 await assert.rejects(Restore.discardArchiveRestoreSession(db,sessionId),
  {code:'STAGING_HISTORY_REFERENCED'});
 assert.deepEqual(await readRows(db,sessionId),before);
 db.close();
});
test('history-linked ready or reverted staging stays protected when rollback is still available',async()=>{
 for(const status of ['ready','reverted']){
  const db=await openTestDb('paseka-cleanup-history-available-'+status);
  const sessionId='session-history-'+status;
  await seedSession(db,sessionId,status);
  await put(db,'archive_history',{backupId:'history-'+status,status:'committed',
   importSessionId:sessionId,rollbackAvailable:true});
  await assert.rejects(Restore.discardArchiveRestoreSession(db,sessionId),
   {code:'STAGING_HISTORY_REFERENCED'});
  assert.equal((await readRows(db,sessionId)).length,2);
  db.close();
 }
});
test('fully reverted historical import can still clean up its own unneeded staging',async()=>{
 const db=await openTestDb('paseka-cleanup-history-reverted-safe');
 const sessionId='session-after-rollback';
 await seedSession(db,sessionId,'reverted');
 await put(db,'archive_history',{backupId:'history-reverted',status:'reverted',
  importSessionId:sessionId,rollbackSessionId:null,rollbackAvailable:false});
 assert.equal(await Restore.discardArchiveRestoreSession(db,sessionId),true);
 assert.equal((await readRows(db,sessionId)).length,0);
 db.close();
});
test('reverted session with inconsistent rollback metadata is preserved',async()=>{
 const db=await openTestDb('paseka-cleanup-history-reverted-inconsistent');
 const sessionId='session-reverted-inconsistent';
 await seedSession(db,sessionId,'reverted');
 await put(db,'archive_history',{backupId:'bad-history',status:'reverted',
  importSessionId:sessionId,rollbackSessionId:'rollback-not-resolved',rollbackAvailable:true});
 await assert.rejects(Restore.discardArchiveRestoreSession(db,sessionId),
  {code:'STAGING_HISTORY_REFERENCED'});
 assert.equal((await readRows(db,sessionId)).length,2);
 db.close();
});
test('cleanup refuses indexed entries whose actual primary key belongs to another session',async()=>{
 const db=await openTestDb('paseka-cleanup-crosslinked-record');
 const sessionId='session-crosslinked';
 await seedSession(db,sessionId,'failed');
 await put(db,'archive_staging',{id:'foreign-staging:video:bad-link',sessionId,
  kind:'video',blob:new Blob(['must remain'])});
 await assert.rejects(Restore.discardArchiveRestoreSession(db,sessionId),
  {code:'STAGING_CLEANUP_KEYS_INVALID'});
 assert.equal((await readRows(db,sessionId)).length,3);
 db.close();
});
