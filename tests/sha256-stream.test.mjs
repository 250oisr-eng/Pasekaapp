import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/paseka-sha256.js', import.meta.url), 'utf8');
new Function(source)();
const { hashBlobHex, CHUNK_BYTES } = globalThis.PasekaSha256;

const referenceHash = bytes => createHash('sha256').update(bytes).digest('hex');
const blob = bytes => new Blob([bytes]);

test('incremental SHA-256 matches the empty and abc standard vectors', async () => {
  assert.equal(await hashBlobHex(blob(new Uint8Array())), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(await hashBlobHex(blob(new TextEncoder().encode('abc'))), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('incremental SHA-256 matches Node across padding and block boundaries', async () => {
  for (const length of [1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 191, 192, 193]) {
    const bytes = Uint8Array.from({ length }, (_, index) => (index * 37 + length) & 0xff);
    for (const chunkBytes of [1, 7, 63, 64, 65, 127]) {
      assert.equal(await hashBlobHex(blob(bytes), { chunkBytes }), referenceHash(bytes), `length=${length}, chunkBytes=${chunkBytes}`);
    }
  }
});

test('hashes a multi-megabyte Blob in bounded chunks and matches Node SHA-256', async () => {
  const bytes = Uint8Array.from({ length: 5 * 1024 * 1024 + 137 }, (_, index) => (index * 13 + (index >>> 8)) & 0xff);
  const sourceBlob = blob(bytes);
  const requested = [];
  const trackedBlob = {
    size: sourceBlob.size,
    slice(start, end) {
      requested.push(end - start);
      return sourceBlob.slice(start, end);
    }
  };
  assert.equal(CHUNK_BYTES, 1024 * 1024);
  assert.equal(await hashBlobHex(trackedBlob), referenceHash(bytes));
  assert.ok(requested.length > 1);
  assert.ok(requested.every(size => size > 0 && size <= CHUNK_BYTES));
});

test('propagates Blob chunk read failures instead of returning a partial digest', async () => {
  const brokenBlob = {
    size: 10,
    slice() {
      return { arrayBuffer: async () => { throw new Error('simulated storage read failure'); } };
    }
  };
  await assert.rejects(hashBlobHex(brokenBlob), /simulated storage read failure/);
});

test('rejects a truncated Blob chunk', async () => {
  const truncatedBlob = {
    size: 4,
    slice() {
      return { arrayBuffer: async () => new Uint8Array([1, 2]).buffer };
    }
  };
  await assert.rejects(hashBlobHex(truncatedBlob), { code: 'SHA256_CHUNK_LENGTH_MISMATCH' });
});

test('honors cancellation before reading and between chunks', async () => {
  const beforeRead = new AbortController();
  beforeRead.abort();
  let readCount = 0;
  const trackedBlob = {
    size: CHUNK_BYTES + 1,
    slice(start, end) {
      return {
        arrayBuffer: async () => {
          readCount++;
          return new Uint8Array(end - start).buffer;
        }
      };
    }
  };
  await assert.rejects(hashBlobHex(trackedBlob, { signal: beforeRead.signal }), { name: 'AbortError' });
  assert.equal(readCount, 0);

  const duringRead = new AbortController();
  const cancellableBlob = {
    size: CHUNK_BYTES + 1,
    slice(start, end) {
      return {
        arrayBuffer: async () => {
          if (start === 0) duringRead.abort();
          return new Uint8Array(end - start).buffer;
        }
      };
    }
  };
  await assert.rejects(hashBlobHex(cancellableBlob, { signal: duringRead.signal }), { name: 'AbortError' });
});

test('rejects invalid chunk sizes and unreadable Blob inputs', async () => {
  await assert.rejects(hashBlobHex(blob(new Uint8Array([1])), { chunkBytes: CHUNK_BYTES + 1 }), RangeError);
  await assert.rejects(hashBlobHex({ size: 1 }), { code: 'SHA256_BLOB_UNAVAILABLE' });
});
