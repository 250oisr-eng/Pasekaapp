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
    meta: { schemaVersion: 12, revisionId: 'revision-1' },
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
  assert.equal(parsed.manifest.schemaVersion, 12);
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
  await writeFixture(db, { meta: { schemaVersion: 13 }, hives: [] });
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
