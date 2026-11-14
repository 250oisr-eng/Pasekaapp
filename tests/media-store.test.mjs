import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/paseka-media-store.js', import.meta.url), 'utf8');
new Function(source)();
const Media = globalThis.PasekaMediaStore;

function openDb(name, withStore = true) {
  const factory = new IDBFactory();
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => {
      if (withStore) request.result.createObjectStore('media_blobs', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function readRecord(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('media_blobs', 'readonly');
    const request = tx.objectStore('media_blobs').get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
const image = (bytes = [1, 2, 3, 4], type = 'image/jpeg') => new Blob([new Uint8Array(bytes)], { type });

test('stores an image Blob with size, MIME and SHA-256 metadata and reads it back verified', async () => {
  const db = await openDb('media-store-roundtrip');
  const metadata = await Media.putImage(db, {
    id: 'image-1', blob: image(), name: 'frame.jpg', capturedAt: '2026-11-14T10:00:00.000Z'
  }, webcrypto);
  assert.equal(metadata.id, 'image-1');
  assert.equal(metadata.mimeType, 'image/jpeg');
  assert.equal(metadata.sizeBytes, 4);
  assert.match(metadata.sha256, /^[a-f0-9]{64}$/);
  const stored = await Media.getImage(db, 'image-1', webcrypto);
  assert.equal(stored.blob.size, 4);
  assert.equal(stored.blob.type, 'image/jpeg');
  assert.deepEqual([...new Uint8Array(await stored.blob.arrayBuffer())], [1, 2, 3, 4]);
  db.close();
});

test('binds the checksum to the Blob captured before asynchronous hashing', async () => {
  const db = await openDb('media-store-blob-snapshot');
  let releaseDigest;
  let digestStarted;
  const started = new Promise(resolve => { digestStarted = resolve; });
  const gate = new Promise(resolve => { releaseDigest = resolve; });
  const delayedCrypto = {
    subtle: {
      digest: async (algorithm, bytes) => {
        digestStarted();
        await gate;
        return webcrypto.subtle.digest(algorithm, bytes);
      }
    }
  };
  const input = { id: 'snapshot-image', blob: image([1, 2, 3]) };
  const saving = Media.putImage(db, input, delayedCrypto);
  await started;
  input.blob = image([9, 9, 9]);
  releaseDigest();
  await saving;
  const stored = await Media.getImage(db, 'snapshot-image', webcrypto);
  assert.deepEqual([...new Uint8Array(await stored.blob.arrayBuffer())], [1, 2, 3]);
  db.close();
});

test('rejects duplicate IDs without replacing the original image', async () => {
  const db = await openDb('media-store-duplicate');
  await Media.putImage(db, { id: 'same-id', blob: image([1]) }, webcrypto);
  await assert.rejects(
    Media.putImage(db, { id: 'same-id', blob: image([9]) }, webcrypto),
    error => error.code === 'IMAGE_ID_EXISTS'
  );
  const stored = await Media.getImage(db, 'same-id', webcrypto);
  assert.deepEqual([...new Uint8Array(await stored.blob.arrayBuffer())], [1]);
  db.close();
});

test('lists metadata without exposing Blob payloads and measures total storage', async () => {
  const db = await openDb('media-store-list');
  await Media.putImage(db, { id: 'image-a', blob: image([1, 2]) }, webcrypto);
  await Media.putImage(db, { id: 'image-b', blob: image([3, 4, 5]) }, webcrypto);
  const items = await Media.listImages(db);
  assert.equal(items.length, 2);
  assert.equal(Object.hasOwn(items[0], 'blob'), false);
  assert.deepEqual(await Media.measureStorage(db), { count: 2, sizeBytes: 5 });
  db.close();
});

test('detects a modified Blob through its stored SHA-256 checksum', async () => {
  const db = await openDb('media-store-checksum');
  await Media.putImage(db, { id: 'image-1', blob: image([1, 2, 3]) }, webcrypto);
  const record = await readRecord(db, 'image-1');
  const tx = db.transaction('media_blobs', 'readwrite');
  record.blob = image([9, 2, 3]);
  tx.objectStore('media_blobs').put(record);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  await assert.rejects(Media.getImage(db, 'image-1', webcrypto), { code: 'IMAGE_CHECKSUM_MISMATCH' });
  db.close();
});

test('rejects unsupported payloads, MIME types, sizes and invalid metadata', async () => {
  const db = await openDb('media-store-validation');
  await assert.rejects(Media.putImage(db, { id: 'not-image', blob: new Blob(['x'], { type: 'text/plain' }) }, webcrypto),
    { code: 'INVALID_IMAGE_BLOB' });
  await assert.rejects(Media.putImage(db, { id: 'too-large', blob: image([1, 2, 3]) }, webcrypto, { maxImageBytes: 2 }),
    { code: 'IMAGE_SIZE_LIMIT' });
  await assert.rejects(Media.putImage(db, { id: 'bad-date', blob: image(), capturedAt: 'not-a-date' }, webcrypto),
    { code: 'INVALID_IMAGE_METADATA' });
  await assert.rejects(Media.putImage(db, { id: '', blob: image() }, webcrypto),
    { code: 'INVALID_MEDIA_ID' });
  assert.deepEqual(await Media.measureStorage(db), { count: 0, sizeBytes: 0 });
  db.close();
});

test('fails clearly when the database has no media store', async () => {
  const db = await openDb('media-store-missing', false);
  await assert.rejects(Media.listImages(db), { code: 'MEDIA_STORE_UNAVAILABLE' });
  db.close();
});

test('returns null for a missing image ID', async () => {
  const db = await openDb('media-store-missing-image');
  assert.equal(await Media.getImage(db, 'absent', webcrypto), null);
  db.close();
});


test('orphan audit is read-only and protects blobs referenced by current state, snapshots and journals', async () => {
  const factory = new IDBFactory();
  const db = await new Promise((resolve, reject) => {
    const request = factory.open('media-store-orphan-audit', 1);
    request.onupgradeneeded = () => {
      const d = request.result;
      d.createObjectStore('main');
      d.createObjectStore('auto_snapshots', { keyPath: 'id' });
      d.createObjectStore('media_migration_journal', { keyPath: 'id' });
      d.createObjectStore('media_blobs', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await Media.putImage(db, { id: 'used-current', blob: image([1]) }, webcrypto);
  await Media.putImage(db, { id: 'used-snapshot', blob: image([2]) }, webcrypto);
  await Media.putImage(db, { id: 'used-journal', blob: image([3]) }, webcrypto);
  await Media.putImage(db, { id: 'orphan-photo', blob: image([4]) }, webcrypto);
  const write = db.transaction(['main', 'auto_snapshots', 'media_migration_journal'], 'readwrite');
  write.objectStore('main').put({ records: [{ media: [{ blobId: 'used-current', storage: 'indexeddb-blob-v1' }] }] }, 'state');
  write.objectStore('auto_snapshots').put({ id: 'snapshot-1', state: { plantObservations: [{ media: [{ blobId: 'used-snapshot' }] }] } });
  write.objectStore('media_migration_journal').put({ id: 'journal-1', blobId: 'used-journal' });
  await new Promise((resolve, reject) => {
    write.oncomplete = resolve;
    write.onerror = () => reject(write.error);
    write.onabort = () => reject(write.error);
  });

  const report = await Media.auditOrphanedImages(db);
  assert.equal(report.mode, 'read-only-audit');
  assert.equal(report.readOnly, true);
  assert.equal(report.deletionPerformed, false);
  assert.deepEqual(report.referenced.map(item => item.id), ['used-current', 'used-journal', 'used-snapshot']);
  assert.deepEqual(report.orphaned.map(item => item.id), ['orphan-photo']);
  assert.deepEqual(report.missingReferences, []);
  assert.equal((await Media.getImage(db, 'orphan-photo', webcrypto)).blob.size, 1);
  assert.equal((await Media.getImage(db, 'used-current', webcrypto)).blob.size, 1);
  db.close();
});

test('orphan audit reports dangling references and never classifies them as deletable blobs', async () => {
  const factory = new IDBFactory();
  const db = await new Promise((resolve, reject) => {
    const request = factory.open('media-store-dangling-audit', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('main');
      request.result.createObjectStore('media_blobs', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const tx = db.transaction('main', 'readwrite');
  tx.objectStore('main').put({ records: [{ media: [{ blobId: 'missing-photo' }] }] }, 'state');
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  const report = await Media.auditOrphanedImages(db);
  assert.equal(report.orphanedCount, 0);
  assert.deepEqual(report.missingReferences, [{ blobId: 'missing-photo', referenceCount: 1, referencedBy: ['main'] }]);
  db.close();
});
