import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/paseka-archive.js', import.meta.url), 'utf8');
new Function(source)();
const Archive = globalThis.PasekaArchive;

function openTestDb(name) {
  const factory = new IDBFactory();
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('main');
      request.result.createObjectStore('entrance_media', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function writeFixture(db, state, videos = []) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['main', 'entrance_media'], 'readwrite');
    tx.objectStore('main').put(state, 'state');
    for (const video of videos) tx.objectStore('entrance_media').put(video);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
function stateFixture() {
  return {
    meta: { schemaVersion: 15, revisionId: 'revision-1' },
    hives: [{ id: 'hive-1', number: 1 }],
    families: [],
    records: [{ id: 'record-1', media: ['data:image/jpeg;base64,AA=='] }],
    snapshots: []
  };
}
function videoFixture(id, hiveId, bytes, capturedAt) {
  const blob = new Blob([bytes], { type: 'video/mp4' });
  return {
    id, hiveId, capturedAt, durationSec: 45, width: 1280, height: 720,
    bytes: blob.size, mimeType: 'video/mp4', name: id + '.mp4',
    status: 'waiting_for_server', queueCreatedAt: capturedAt, retryCount: 0,
    lastAttemptAt: null, nextAttemptAt: null, lastError: null, blob
  };
}

test('full archive export reads state and entrance videos from one IndexedDB readonly snapshot', async () => {
  const db = await openTestDb('paseka-export-consistent');
  const first = videoFixture('video-1', 'hive-1', new Uint8Array([1, 2, 3]), '2026-11-14T09:00:00.000Z');
  const second = videoFixture('video-2', 'hive-1', new Uint8Array([4, 5, 6, 7]), '2026-11-14T10:00:00.000Z');
  await writeFixture(db, stateFixture(), [second, first]);

  const result = await Archive.exportArchiveFromDatabase(db, webcrypto, {
    backupId: 'export-test-1',
    createdAt: '2026-11-14T11:00:00.000Z'
  });
  const parsed = await Archive.parseArchiveBlob(result.blob);
  assert.equal(result.summary.videoCount, 2);
  assert.equal(parsed.manifest.backupId, 'export-test-1');
  assert.equal(parsed.manifest.schemaVersion, 15);
  assert.deepEqual(parsed.entries.map(entry => entry.path), [
    'state.json',
    'entrance-media/000001.blob',
    'entrance-media/000002.blob'
  ]);
  assert.equal(await Archive.verifyArchive(result.blob, parsed, webcrypto), true);

  const stateWrapper = JSON.parse(await Archive.readArchiveEntry(result.blob, parsed.stateEntry).text());
  assert.equal(stateWrapper.app, 'Paseka');
  assert.equal(stateWrapper.state.hives[0].id, 'hive-1');
  assert.deepEqual(stateWrapper.state.records[0].media, ['data:image/jpeg;base64,AA==']);
  assert.equal(parsed.entries[1].metadata.id, 'video-1');
  assert.equal(parsed.entries[2].metadata.id, 'video-2');
  assert.deepEqual(
    new Uint8Array(await Archive.readArchiveEntry(result.blob, parsed.entries[1]).arrayBuffer()),
    new Uint8Array([1, 2, 3])
  );

  const remaining = await Archive.readConsistentDatabaseSnapshot(db);
  assert.equal(remaining.videos.length, 2, 'export must not delete original videos');
  assert.equal(remaining.state.meta.revisionId, 'revision-1');
  db.close();
});

test('full archive export refuses missing original video blobs instead of silently omitting them', async () => {
  const db = await openTestDb('paseka-export-missing-video');
  await writeFixture(db, stateFixture(), [{
    id: 'video-missing', hiveId: 'hive-1', capturedAt: '2026-11-14T09:00:00.000Z',
    durationSec: 10, width: 640, height: 480, bytes: 12, mimeType: 'video/mp4',
    name: 'missing.mp4', status: 'waiting_for_server'
  }]);
  await assert.rejects(
    Archive.exportArchiveFromDatabase(db, webcrypto),
    { code: 'VIDEO_BLOB_MISSING' }
  );
  db.close();
});

test('full archive export refuses a missing state or unsupported saved schema', async () => {
  const emptyDb = await openTestDb('paseka-export-no-state');
  await assert.rejects(Archive.exportArchiveFromDatabase(emptyDb, webcrypto), /Основное состояние пасеки не найдено/);
  emptyDb.close();

  const db = await openTestDb('paseka-export-future-schema');
  await writeFixture(db, { meta: { schemaVersion: 16 }, hives: [] });
  await assert.rejects(
    Archive.exportArchiveFromDatabase(db, webcrypto),
    { code: 'UNSUPPORTED_STATE_SCHEMA' }
  );
  db.close();
});

test('full archive export rejects video metadata that disagrees with the stored Blob', async () => {
  const db = await openTestDb('paseka-export-size-mismatch');
  const video = videoFixture('video-bad', 'hive-1', new Uint8Array([1, 2, 3]), '2026-11-14T09:00:00.000Z');
  video.bytes = 99;
  await writeFixture(db, stateFixture(), [video]);
  await assert.rejects(
    Archive.exportArchiveFromDatabase(db, webcrypto),
    { code: 'INVALID_VIDEO_METADATA' }
  );
  db.close();
});

test('portable archive preserves staged 2-to-4 honey pair evidence together with separate entrance video bytes', async () => {
  const db = await openTestDb('paseka-export-sectional-late-pair');
  const state=stateFixture();
  state.equipmentInventory={bodies:{
    honey1:{id:'honey1',kind:'honey',pairId:'pair-1',frames:[{frameId:'h1f1'}]},
    honey2:{id:'honey2',kind:'honey',pairId:'pair-1',frames:[{frameId:'h2f1'}]},
    honey3:{id:'honey3',kind:'honey',pairId:'pair-2',frames:[{frameId:'h3f1',history:[{id:'fh3',action:'corpus_from_storage'}]}]},
    honey4:{id:'honey4',kind:'honey',pairId:'pair-2',frames:[{frameId:'h4f1',history:[{id:'fh4',action:'corpus_from_storage'}]}]}
  }};
  state.sectionalLayouts=[{id:'sectional-layout-1',hiveId:'hive-1',honeyStack:{
    purpose:'main',bodyIds:['honey1','honey2','honey3','honey4']
  }}];
  const initialEvidence={honeyPurpose:'main',honeyBodyIds:['honey1','honey2'],frameComposition:{honey1:[{frameId:'h1f1'}],honey2:[{frameId:'h2f1'}]}};
  const lateEvidence={previousBodyIds:['honey1','honey2'],addedBodyIds:['honey3','honey4'],
    honeyBodyIds:['honey1','honey2','honey3','honey4'],
    frameComposition:{honey3:[{frameId:'h3f1'}],honey4:[{frameId:'h4f1'}]}};
  state.sectionalTechProcesses=[{id:'tech-1',hiveId:'hive-1',state:{operations:[
    {operationId:'OP-07',status:'DONE',completedAt:'2026-11-17T09:00:00.000Z',evidence:initialEvidence},
    {operationId:'OP-07-HONEY-PAIR-ADD',status:'DONE',completedAt:'2026-11-18T09:00:00.000Z',evidence:lateEvidence}
  ]}}];
  const videoBytes=new Uint8Array([1,9,2,8,3,7,4,6,5]);
  const video=videoFixture('video-hive-1','hive-1',videoBytes,'2026-11-18T10:00:00.000Z');
  const original=structuredClone(state);
  await writeFixture(db,state,[video]);

  const exported=await Archive.exportArchiveFromDatabase(db,webcrypto,{
    backupId:'archive-honey-late-pair',createdAt:'2026-11-19T11:00:00.000Z'
  });
  const parsed=await Archive.parseArchiveBlob(exported.blob);
  assert.equal(exported.summary.videoCount,1);
  assert.equal(await Archive.verifyArchive(exported.blob,parsed,webcrypto),true);
  assert.deepEqual(parsed.entries.map(entry=>entry.kind),['state','entrance_video']);
  const restored=JSON.parse(await Archive.readArchiveEntry(exported.blob,parsed.stateEntry).text()).state;
  assert.deepEqual(restored.sectionalLayouts,original.sectionalLayouts);
  assert.deepEqual(restored.sectionalTechProcesses,original.sectionalTechProcesses);
  assert.deepEqual(restored.equipmentInventory,original.equipmentInventory);
  assert.deepEqual(restored.sectionalTechProcesses[0].state.operations[0].evidence,initialEvidence,
    'original OP-07 evidence must not be overwritten by the second-pair event');
  assert.deepEqual(restored.sectionalTechProcesses[0].state.operations[1].evidence,lateEvidence);
  assert.deepEqual(new Uint8Array(await Archive.readArchiveEntry(exported.blob,parsed.entries[1]).arrayBuffer()),videoBytes);
  const current=await Archive.readConsistentDatabaseSnapshot(db);
  assert.deepEqual(current.state,original,'archive export must not modify live sectional hive state');
  assert.equal(current.videos.length,1,'export must not delete live entrance videos');
  db.close();
});
