import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

const source = await readFile(new URL('../js/paseka-archive.js', import.meta.url), 'utf8');
new Function(source)();
const Archive = globalThis.PasekaArchive;

async function fixture(videoBytes = new Uint8Array([1, 2, 3, 4, 5])) {
  const state = new Blob([JSON.stringify({ app: 'Paseka', state: { meta: { schemaVersion: 12 }, hives: [], families: [], records: [] } })], { type: 'application/json' });
  const video = new Blob([videoBytes], { type: 'video/mp4' });
  const metadata = {
    id: 'video-1',
    hiveId: 'hive-1',
    capturedAt: '2026-11-14T09:00:00.000Z',
    durationSec: 60,
    width: 1280,
    height: 720,
    bytes: video.size,
    mimeType: 'video/mp4',
    name: 'entrance.mp4',
    status: 'waiting_for_server',
    retryCount: 0
  };
  const manifest = {
    format: Archive.FORMAT,
    version: Archive.VERSION,
    backupId: 'backup-2026-11-14-001',
    createdAt: '2026-11-14T09:05:00.000Z',
    schemaVersion: 12,
    entries: [
      {
        path: 'state.json',
        kind: 'state',
        size: state.size,
        mimeType: 'application/json',
        chunkSize: Archive.CHUNK_BYTES,
        chunkSha256: await Archive.hashBlobChunks(state, webcrypto)
      },
      {
        path: 'entrance-media/000001.blob',
        kind: 'entrance_video',
        size: video.size,
        mimeType: 'video/mp4',
        chunkSize: Archive.CHUNK_BYTES,
        chunkSha256: await Archive.hashBlobChunks(video, webcrypto),
        metadata
      }
    ]
  };
  return { state, video, manifest, blob: Archive.buildArchiveBlob(manifest, [state, video]) };
}

test('Paseka archive round-trips state and separate entrance video without compression', async () => {
  const original = await fixture();
  const parsed = await Archive.parseArchiveBlob(original.blob);
  assert.equal(parsed.format, 'paseka-archive');
  assert.equal(parsed.videoCount, 1);
  assert.equal(parsed.entries.length, 2);
  assert.equal(await Archive.verifyArchive(original.blob, parsed, webcrypto), true);
  assert.equal(await Archive.readArchiveEntry(original.blob, parsed.stateEntry).text(), await original.state.text());
  assert.deepEqual(
    new Uint8Array(await Archive.readArchiveEntry(original.blob, parsed.entries[1]).arrayBuffer()),
    new Uint8Array(await original.video.arrayBuffer())
  );
});

test('Paseka archive hashes payloads in bounded one-megabyte chunks', async () => {
  const payload = new Blob([new Uint8Array(Archive.CHUNK_BYTES + 17)]);
  const hashes = await Archive.hashBlobChunks(payload, webcrypto);
  assert.equal(hashes.length, 2);
  assert.ok(hashes.every(hash => /^[a-f0-9]{64}$/.test(hash)));
});

test('Paseka archive rejects unknown magic and oversized manifest header before parsing', async () => {
  const badMagic = new Uint8Array(Archive.HEADER_BYTES);
  await assert.rejects(Archive.parseArchiveBlob(new Blob([badMagic])), { code: 'INVALID_MAGIC' });

  const header = new Uint8Array(Archive.HEADER_BYTES);
  header.set(Uint8Array.from(Archive.MAGIC_TEXT, ch => ch.charCodeAt(0)));
  new DataView(header.buffer).setUint32(8, 0xffffffff, true);
  await assert.rejects(Archive.parseArchiveBlob(new Blob([header])), { code: 'MANIFEST_SIZE_LIMIT' });
});

test('Paseka archive rejects trailing bytes and declared-size mismatches', async () => {
  const original = await fixture();
  const withTrailingByte = new Blob([original.blob, new Uint8Array([0])]);
  await assert.rejects(Archive.parseArchiveBlob(withTrailingByte), { code: 'ARCHIVE_LENGTH_MISMATCH' });

  const altered = new Blob([original.blob.slice(0, original.blob.size - 1)]);
  await assert.rejects(Archive.parseArchiveBlob(altered), { code: 'ARCHIVE_LENGTH_MISMATCH' });
});

test('Paseka archive rejects duplicate paths, traversal paths and oversized video declarations', async () => {
  const original = await fixture();
  const duplicate = structuredClone(original.manifest);
  duplicate.entries[1].path = 'state.json';
  assert.throws(() => Archive.buildArchiveBlob(duplicate, [original.state, original.video]), { code: 'DUPLICATE_OR_INVALID_PATH' });

  const traversal = structuredClone(original.manifest);
  traversal.entries[1].path = '../outside.blob';
  assert.throws(() => Archive.buildArchiveBlob(traversal, [original.state, original.video]), { code: 'INVALID_VIDEO_ENTRY' });

  const oversized = structuredClone(original.manifest);
  oversized.entries[1].size = Archive.LIMITS.maxVideoBytes + 1;
  oversized.entries[1].chunkSha256 = Array(Math.ceil(oversized.entries[1].size / Archive.CHUNK_BYTES)).fill('0'.repeat(64));
  oversized.entries[1].metadata.bytes = oversized.entries[1].size;
  assert.throws(() => Archive.buildArchiveBlob(oversized, [original.state, original.video]), { code: 'INVALID_VIDEO_ENTRY' });
});

test('Paseka archive rejects duplicate video IDs and unsupported queue states', async () => {
  const original = await fixture();
  const duplicate = structuredClone(original.manifest);
  duplicate.entries.push({ ...duplicate.entries[1], path: 'entrance-media/000002.blob', metadata: { ...duplicate.entries[1].metadata } });
  assert.throws(() => Archive.buildArchiveBlob(duplicate, [original.state, original.video, original.video]), { code: 'DUPLICATE_VIDEO_ID' });

  const badStatus = structuredClone(original.manifest);
  badStatus.entries[1].metadata.status = 'unknown_state';
  assert.throws(() => Archive.buildArchiveBlob(badStatus, [original.state, original.video]), { code: 'INVALID_VIDEO_METADATA' });
});

test('Paseka archive rejects metadata-size mismatch and malformed checksum lists', async () => {
  const original = await fixture();
  const badMetadata = structuredClone(original.manifest);
  badMetadata.entries[1].metadata.bytes++;
  assert.throws(() => Archive.buildArchiveBlob(badMetadata, [original.state, original.video]), { code: 'INVALID_VIDEO_METADATA' });

  const badHashes = structuredClone(original.manifest);
  badHashes.entries[1].chunkSha256 = [];
  assert.throws(() => Archive.buildArchiveBlob(badHashes, [original.state, original.video]), { code: 'INVALID_CHUNK_HASHES' });
});

test('Paseka archive detects payload tampering before restore', async () => {
  const original = await fixture();
  const parsed = await Archive.parseArchiveBlob(original.blob);
  const bytes = new Uint8Array(await original.blob.arrayBuffer());
  bytes[parsed.entries[1].offset] ^= 0xff;
  const tampered = new Blob([bytes]);
  const parsedTampered = await Archive.parseArchiveBlob(tampered);
  await assert.rejects(Archive.verifyArchiveEntry(tampered, parsedTampered.entries[1], webcrypto), { code: 'CHECKSUM_MISMATCH' });
});

test('Paseka archive rejects an archive larger than the caller policy', async () => {
  const original = await fixture();
  await assert.rejects(
    Archive.parseArchiveBlob(original.blob, { ...Archive.LIMITS, maxArchiveBytes: original.blob.size - 1 }),
    { code: 'ARCHIVE_SIZE_LIMIT' }
  );
});


test('Paseka restore preflight verifies archive, validates state, and reports orphaned video references', async () => {
  const original = await fixture();
  let validationCalls = 0;
  const checked = await Archive.validateArchiveForRestore(original.blob, webcrypto, state => {
    validationCalls++;
    assert.equal(state.meta.schemaVersion, 12);
    return true;
  });
  assert.equal(validationCalls, 1);
  assert.equal(checked.backupId, original.manifest.backupId);
  assert.equal(checked.videoEntries.length, 1);
  assert.equal(checked.videoEntries[0].orphanedHiveReference, true);
  assert.deepEqual(checked.orphanVideoIds, ['video-1']);
  assert.equal(checked.videoEntries[0].blob.size, original.video.size);
});

test('Paseka restore preflight refuses to continue after checksum failure', async () => {
  const original = await fixture();
  const parsed = await Archive.parseArchiveBlob(original.blob);
  const bytes = new Uint8Array(await original.blob.arrayBuffer());
  bytes[parsed.stateEntry.offset] ^= 0xff;
  const tampered = new Blob([bytes]);
  let validationCalls = 0;
  await assert.rejects(
    Archive.validateArchiveForRestore(tampered, webcrypto, () => { validationCalls++; return true; }),
    { code: 'CHECKSUM_MISMATCH' }
  );
  assert.equal(validationCalls, 0, 'application state validation must not run before archive integrity checks');
});

test('Paseka restore preflight requires the application validator and matching state schema', async () => {
  const original = await fixture();
  await assert.rejects(
    Archive.validateArchiveForRestore(original.blob, webcrypto),
    { code: 'STATE_VALIDATOR_REQUIRED' }
  );
});
