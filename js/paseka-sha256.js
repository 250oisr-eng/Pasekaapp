(function (root) {
'use strict';

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
const INITIAL = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
]);
const CHUNK_BYTES = 1024 * 1024;

function rotateRight(value, count) {
  return (value >>> count) | (value << (32 - count));
}
function abortError() {
  const error = new Error('SHA-256 operation was aborted.');
  error.name = 'AbortError';
  return error;
}

class Sha256 {
  constructor() {
    this.state = new Uint32Array(INITIAL);
    this.buffer = new Uint8Array(64);
    this.bufferLength = 0;
    this.bytesHashed = 0n;
    this.finished = false;
    this.words = new Uint32Array(64);
  }

  update(input) {
    if (this.finished) throw new Error('SHA-256 hasher is already finalized.');
    if (!(input instanceof Uint8Array)) throw new TypeError('SHA-256 input must be Uint8Array.');
    this.bytesHashed += BigInt(input.length);
    let offset = 0;

    if (this.bufferLength) {
      const take = Math.min(64 - this.bufferLength, input.length);
      this.buffer.set(input.subarray(0, take), this.bufferLength);
      this.bufferLength += take;
      offset += take;
      if (this.bufferLength === 64) {
        this.compress(this.buffer);
        this.bufferLength = 0;
      }
    }

    while (offset + 64 <= input.length) {
      this.compress(input.subarray(offset, offset + 64));
      offset += 64;
    }
    if (offset < input.length) {
      this.buffer.set(input.subarray(offset), 0);
      this.bufferLength = input.length - offset;
    }
    return this;
  }

  compress(block) {
    const w = this.words;
    for (let i = 0; i < 16; i++) {
      const j = i * 4;
      w[i] = ((block[j] << 24) | (block[j + 1] << 16) | (block[j + 2] << 8) | block[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15], y = w[i - 2];
      const s0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
      const s1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = this.state[0], b = this.state[1], c = this.state[2], d = this.state[3];
    let e = this.state[4], f = this.state[5], g = this.state[6], h = this.state[7];
    for (let i = 0; i < 64; i++) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const t1 = (h + s1 + choice + K[i] + w[i]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    this.state[0] = (this.state[0] + a) >>> 0;
    this.state[1] = (this.state[1] + b) >>> 0;
    this.state[2] = (this.state[2] + c) >>> 0;
    this.state[3] = (this.state[3] + d) >>> 0;
    this.state[4] = (this.state[4] + e) >>> 0;
    this.state[5] = (this.state[5] + f) >>> 0;
    this.state[6] = (this.state[6] + g) >>> 0;
    this.state[7] = (this.state[7] + h) >>> 0;
  }

  digest() {
    if (this.finished) throw new Error('SHA-256 digest is already finalized.');
    this.finished = true;
    const bitLength = this.bytesHashed * 8n;
    this.buffer[this.bufferLength++] = 0x80;
    if (this.bufferLength > 56) {
      this.buffer.fill(0, this.bufferLength);
      this.compress(this.buffer);
      this.bufferLength = 0;
    }
    this.buffer.fill(0, this.bufferLength, 56);
    for (let i = 0; i < 8; i++) {
      this.buffer[63 - i] = Number((bitLength >> BigInt(i * 8)) & 0xffn);
    }
    this.compress(this.buffer);
    return Array.from(this.state, value => value.toString(16).padStart(8, '0')).join('');
  }
}

async function hashBlobHex(blob, options = {}) {
  if (!blob || !Number.isSafeInteger(blob.size) || blob.size < 0 || typeof blob.slice !== 'function') {
    const error = new Error('A readable Blob is required for SHA-256.');
    error.code = 'SHA256_BLOB_UNAVAILABLE';
    throw error;
  }
  const chunkBytes = options.chunkBytes ?? CHUNK_BYTES;
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > CHUNK_BYTES) {
    throw new RangeError('SHA-256 chunk size must be between 1 byte and 1 MiB.');
  }
  const signal = options.signal;
  const hasher = new Sha256();
  let offset = 0;
  while (offset < blob.size) {
    if (signal?.aborted) throw abortError();
    const end = Math.min(offset + chunkBytes, blob.size);
    const part = blob.slice(offset, end);
    if (!part || typeof part.arrayBuffer !== 'function') {
      const error = new Error('Blob chunk could not be read.');
      error.code = 'SHA256_CHUNK_UNREADABLE';
      throw error;
    }
    const bytes = new Uint8Array(await part.arrayBuffer());
    // Do not spend CPU hashing a chunk after cancellation while it was read.
    if (signal?.aborted) throw abortError();
    if (bytes.byteLength !== end - offset) {
      const error = new Error('Blob chunk length did not match the requested range.');
      error.code = 'SHA256_CHUNK_LENGTH_MISMATCH';
      throw error;
    }
    hasher.update(bytes);
    offset = end;
    if (offset < blob.size) await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (signal?.aborted) throw abortError();
  return hasher.digest();
}

root.PasekaSha256 = Object.freeze({ hashBlobHex, CHUNK_BYTES });
if (typeof module !== 'undefined' && module.exports) module.exports = root.PasekaSha256;
})(typeof window !== 'undefined' ? window : globalThis);
