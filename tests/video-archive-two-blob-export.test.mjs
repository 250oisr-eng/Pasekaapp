import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import { webcrypto, createHash } from 'node:crypto';

// Load the actual application archive module. This test never accesses a device.
runInThisContext(readFileSync(new URL('../js/paseka-archive.js', import.meta.url), 'utf8'));
const archive = globalThis.PasekaArchive;

function mockReadonlyDb({ state, videos, ledger }) {
  const rows = new Map([['state', state], ['video_recognition_ledger_v1', ledger]]);
  return {
    objectStoreNames: { contains: name => ['main', 'entrance_media'].includes(name) },
    transaction(names, mode) {
      assert.deepEqual(names, ['main', 'entrance_media']);
      assert.equal(mode, 'readonly');
      const requests = [];
      const tx = {
        error: null,
        objectStore(name) {
          assert.ok(names.includes(name));
          return {
            get(key) {
              assert.equal(name, 'main');
              const req = { result: undefined, onsuccess: null, onerror: null };
              requests.push(() => { req.result = rows.get(key); req.onsuccess?.(); });
              return req;
            },
            getAll() {
              assert.equal(name, 'entrance_media');
              const req = { result: undefined, onsuccess: null, onerror: null };
              requests.push(() => { req.result = videos; req.onsuccess?.(); });
              return req;
            }
          };
        },
        abort() { queueMicrotask(() => tx.onabort?.()); }
      };
      queueMicrotask(() => {
        try { for (const run of requests) run(); tx.oncomplete?.(); }
        catch (error) { tx.error = error; tx.onabort?.(); }
      });
      return tx;
    }
  };
}
function fixture() {
  // Artificial, non-playable stand-ins; MIME alone does not make these real MP4s.
  const one = new Blob([new Uint8Array([0,0,0,12,102,116,121,112,105,115,111,109,1,2,3])], { type: 'video/mp4' });
  const two = new Blob([new Uint8Array([0,0,0,12,102,116,121,112,109,112,52,50,4,5,6,7])], { type: 'video/mp4' });
  const mk = (id, blob, capturedAt) => ({
    id, hiveId: 'synthetic-hive', capturedAt, durationSec: 1,
    width: 16, height: 16, bytes: blob.size, mimeType: 'video/mp4',
    name: id + '.mp4', status: 'waiting_for_server', blob
  });
  return {
    state: { meta: { schemaVersion: 15 }, hives: [{ id: 'synthetic-hive' }] },
    videos: [
      mk('synthetic-two', two, '2026-11-21T10:01:00.000Z'),
      mk('synthetic-one', one, '2026-11-21T10:00:00.000Z')
    ],
    sources: [one, two]
  };
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('app exporter includes two source-identical and distinct synthetic Blobs', async () => {
  const input = fixture();
  const result = await archive.exportArchiveFromDatabase(mockReadonlyDb(input), webcrypto, {
    backupId: 'isolated-two-blob', createdAt: '2026-11-21T12:00:00.000Z'
  });
  assert.equal(result.summary.videoCount, 2);
  assert.equal(result.manifest.entries.length, 3);
  const parsed = await archive.parseArchiveBlob(result.blob);
  await archive.verifyArchive(result.blob, parsed, webcrypto);
  const restored = await archive.validateArchiveForRestore(
    result.blob, webcrypto, state => state.meta.schemaVersion === 15
  );
  assert.equal(restored.videoEntries.length, 2);
  const actual = [];
  for (const entry of restored.videoEntries) {
    const bytes = Buffer.from(await entry.blob.arrayBuffer());
    actual.push(sha(bytes));
    assert.equal(entry.size, bytes.length);
    assert.equal(entry.metadata.bytes, bytes.length);
  }
  const expected = await Promise.all(input.sources.map(async blob => sha(Buffer.from(await blob.arrayBuffer()))));
  assert.deepEqual(actual, expected);
  assert.notEqual(actual[0], actual[1]);
  assert.deepEqual(restored.orphanVideoIds, []);
});

test('single-bit video corruption invalidates full archive verification', async () => {
  const result = await archive.exportArchiveFromDatabase(mockReadonlyDb(fixture()), webcrypto);
  const parsed = await archive.parseArchiveBlob(result.blob);
  const entry = parsed.entries.find(item => item.kind === 'entrance_video');
  const raw = new Uint8Array(await result.blob.arrayBuffer());
  raw[entry.offset] ^= 1;
  const damaged = new Blob([raw]);
  const reparsed = await archive.parseArchiveBlob(damaged);
  await assert.rejects(archive.verifyArchive(damaged, reparsed, webcrypto), error => error.code === 'CHECKSUM_MISMATCH');
});

test('missing source Blob blocks application export', async () => {
  const input = fixture();
  delete input.videos[0].blob;
  await assert.rejects(archive.exportArchiveFromDatabase(mockReadonlyDb(input), webcrypto),
    error => error.code === 'VIDEO_BLOB_MISSING');
});

test('recognition ledger blocks lossy legacy PASEKA01 application export', async () => {
  const input = fixture();
  const db = mockReadonlyDb({ ...input, ledger: { version: 1, entries: [{ videoId: 'recognized' }] } });
  await assert.rejects(archive.exportArchiveFromDatabase(db, webcrypto),
    error => error.code === 'VIDEO_LEDGER_NOT_ARCHIVED');
});
