import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { proveExportedArchiveRecoveryText, proveExportedArchiveRecoveryFile } from '../scripts/prove-exported-archive-recovery.mjs';

const code = await readFile(new URL('../js/disaster-archive.js', import.meta.url), 'utf8');
const root = { crypto:webcrypto };
new Function('window','TextEncoder','Blob','File','atob','btoa',code)(
  root, TextEncoder, Blob, typeof File === 'undefined' ? undefined : File, atob, btoa
);
const api = root.PasekaDisasterArchive;

async function fixture({ corruptVideo = false, withLegacy = false } = {}) {
  const idb = new IDBFactory();
  const req = idb.open('source-only', 3);
  req.onupgradeneeded = () => {
    req.result.createObjectStore('main');
    req.result.createObjectStore('full_backup');
    req.result.createObjectStore('entrance_media',{keyPath:'id'});
    if (withLegacy) req.result.createObjectStore('legacy_extra');
  };
  const db = await new Promise((resolve,reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    const tx = db.transaction(Array.from(db.objectStoreNames),'readwrite');
    tx.objectStore('main').put({meta:{revisionId:'r-synthetic',schemaVersion:15},hives:[{id:'h1'}],families:[],records:[{id:'r1'}]}, 'state');
    tx.objectStore('full_backup').put({state:{history:[1,2]}},'previous');
    tx.objectStore('entrance_media').put({id:'synthetic-only',blob:new Blob([
      Uint8Array.from([0,255,17,3,254,0])
    ],{type:'video/mp4'})});
    if (withLegacy) tx.objectStore('legacy_extra').put({test:'keep'},'old');
    await new Promise((resolve,reject) => {
      tx.oncomplete = resolve;
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
    const raw = await api.exportArchive(db);
    if (!corruptVideo) return raw;
    const changed = JSON.parse(raw);
    const spec = changed.payload.stores.find(x => x.name === 'entrance_media');
    const value = spec.entries[0][1];
    const blob = value.v.find(x => x[0] === 'blob')[1];
    // Same decoded length, but different content; manifest remains unmodified.
    blob.b64 = Buffer.from(Uint8Array.from([9,255,17,3,254,0])).toString('base64');
    return JSON.stringify(changed);
  } finally { db.close(); }
}

test('B01 exported archive independently restores and reopens every declared store and Blob byte', async () => {
  const result = await proveExportedArchiveRecoveryText(await fixture({withLegacy:true}));
  assert.equal(result.status,'EPHEMERAL_ARCHIVE_RESTORE_REOPEN_BYTES_PASS_NOT_DEVICE_PROOF');
  assert.equal(result.archivedStoreCount,4);
  assert.deepEqual(result.requiredStoreCounts,{main:1,full_backup:1,entrance_media:1});
  assert.equal(result.allArchivedStoresByteVerified,true);
  assert.equal(result.ephemeralDatabaseReopened,true);
  assert.equal(result.fullBackupVerified,false);
  assert.equal(result.realAndroidRestore,'NOT_TESTED');
  assert.equal(result.externalOriginalVideos,'NOT_TESTED');
  assert.doesNotMatch(JSON.stringify(result),/synthetic-only|h1|r1|r-synthetic/);
});

test('B01 ephemeral restore rejects byte-altered same-size video and preserves source file', async () => {
  await assert.rejects(proveExportedArchiveRecoveryText(await fixture({corruptVideo:true})),/SHA-256 mismatch/);
  const dir=await mkdtemp(join(tmpdir(),'b01-ephemeral-'));
  try {
    const path=join(dir,'archive.json'),raw=await fixture();
    await writeFile(path,raw,{flag:'wx'});
    const before=await readFile(path);
    const result=await proveExportedArchiveRecoveryFile(path);
    assert.equal(result.originalDataModified,false);
    assert.deepEqual(await readFile(path),before);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('B01 empty target proof refuses missing video store, malformed archive and unknown version', async()=>{
  const original=JSON.parse(await fixture());
  original.payload.stores=original.payload.stores.filter(x=>x.name!=='entrance_media');
  await assert.rejects(proveExportedArchiveRecoveryText(JSON.stringify(original)),/B01_BLOCKED_REQUIRED_STORE_MISSING/);
  const bad=JSON.parse(await fixture());
  bad.payload.version=2;
  await assert.rejects(proveExportedArchiveRecoveryText(JSON.stringify(bad)),/B01_BLOCKED_UNSUPPORTED_ARCHIVE_FORMAT_OR_VERSION/);
  await assert.rejects(proveExportedArchiveRecoveryText('{invalid'),/B01_BLOCKED_INVALID_ARCHIVE_JSON/);
});

test('B01 source reader refuses size limit, source file still byte identical',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'b01-ephemeral-cap-'));
  try {
    const path=join(dir,'archive.json');
    const content='X'.repeat(64*1024*1024+1);
    await writeFile(path,content);
    await assert.rejects(proveExportedArchiveRecoveryFile(path),/memory safety limit/);
    const stat=await (await import('node:fs/promises')).stat(path);
    assert.equal(stat.size,content.length);
  } finally {await rm(dir,{recursive:true,force:true});}
});
