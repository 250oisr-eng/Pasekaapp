import { open, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BLOCK = 512;
const MAX_BYTES = 512 * 1024 * 1024;
const ZERO = Buffer.alloc(BLOCK);

function textField(block, begin, len) {
  return block.subarray(begin, begin + len).toString('utf8').split('\0')[0];
}
function octal(block, begin, len) {
  const raw = textField(block, begin, len).trim();
  if (!/^[0-7]+$/.test(raw)) throw new Error('INVALID_TAR_NUMERIC_FIELD');
  const n = Number.parseInt(raw, 8);
  if (!Number.isSafeInteger(n)) throw new Error('TAR_NUMERIC_OVERFLOW');
  return n;
}
function checksum(header) {
  let unsigned = 0;
  for (let i = 0; i < BLOCK; i++) unsigned += i >= 148 && i < 156 ? 32 : header[i];
  return unsigned;
}
function classify(name) {
  const p = name.replaceAll('\\', '/').toLowerCase();
  return {
    indexedDb: /(^|\/)indexeddb(\/|$)/.test(p),
    levelDb: /(^|\/)(leveldb|\.leveldb)(\/|$)/.test(p) || /\.(ldb|sst)$/.test(p),
    sqlite: /\.(sqlite|sqlite3|db|db-wal|db-shm)$/.test(p),
    media: /\.(mp4|mov|webm|avi|mkv|jpg|jpeg|png|heic)$/.test(p)
  };
}
function unsafeName(name) {
  return !name || name.startsWith('/') || /^[a-z]:/i.test(name) || name.split(/[\\/]/).includes('..') || name.includes('\0');
}

export async function auditTarFile(path, { maxBytes = MAX_BYTES } = {}) {
  if (typeof path !== 'string' || !path || !Number.isSafeInteger(maxBytes) || maxBytes < 1024) throw new Error('INVALID_ARGUMENT');
  const pre = await lstat(path);
  if (!pre.isFile() || pre.isSymbolicLink()) throw new Error('NOT_REGULAR_FILE');
  const fd = await open(path, 'r');
  try {
    const start = await fd.stat();
    if (start.dev !== pre.dev || start.ino !== pre.ino || !Number.isSafeInteger(start.size) ||
        start.size < 1024 || start.size > maxBytes || start.size % BLOCK !== 0) throw new Error('INVALID_TAR_LENGTH');
    async function blockAt(pos) {
      const b = Buffer.alloc(BLOCK);
      const { bytesRead } = await fd.read(b, 0, BLOCK, pos);
      if (bytesRead !== BLOCK) throw new Error('TRUNCATED_TAR_BLOCK');
      return b;
    }
    let pos = 0, entries = 0, zeroBlocks = 0;
    const counts = { indexedDb: 0, levelDb: 0, sqlite: 0, media: 0 };
    let hasUnsupportedMetadata = false;
    while (pos < start.size) {
      const h = await blockAt(pos);
      if (h.equals(ZERO)) {
        zeroBlocks++;
        pos += BLOCK;
        continue;
      }
      if (zeroBlocks > 0) throw new Error('NONZERO_AFTER_ZERO_TAR_BLOCK');
      const actual = checksum(h), claimed = octal(h, 148, 8);
      if (claimed !== actual) throw new Error('BAD_TAR_HEADER_CHECKSUM');
      const size = octal(h, 124, 12);
      const prefix = textField(h, 345, 155);
      const simpleName = textField(h, 0, 100);
      const name = prefix ? prefix + '/' + simpleName : simpleName;
      if (unsafeName(name)) throw new Error('UNSAFE_OR_EMPTY_TAR_PATH');
      const type = String.fromCharCode(h[156] || 0);
      if (!['0', '\0', '5'].includes(type)) hasUnsupportedMetadata = true;
      if (type === '5' && size !== 0) throw new Error('DIRECTORY_HAS_PAYLOAD');
      const padded = Math.ceil(size / BLOCK) * BLOCK;
      if (padded > start.size - pos - BLOCK) throw new Error('TAR_ENTRY_OUT_OF_BOUNDS');
      const categories = classify(name);
      for (const category of Object.keys(counts)) if (categories[category]) counts[category]++;
      entries++;
      pos += BLOCK + padded;
    }
    if (zeroBlocks < 2) throw new Error('TAR_MISSING_EOF_BLOCKS');
    const end = await fd.stat();
    if (start.size !== end.size || start.dev !== end.dev || start.ino !== end.ino ||
        start.mtimeMs !== end.mtimeMs || start.ctimeMs !== end.ctimeMs) throw new Error('TAR_CHANGED_DURING_AUDIT');
    return {
      status: hasUnsupportedMetadata ? 'REVIEW_REQUIRED_UNSUPPORTED_TAR_METADATA' : 'TAR_HEADER_INDEX_VERIFIED_ONLY',
      bytes: start.size, entries, counts,
      containsRecognizedIndexedDb: counts.indexedDb > 0,
      allUserDataBackedUp: false,
      independentRestoreVerified: false,
      videoRecoveryVerified: false
    };
  } finally { await fd.close(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  auditTarFile(process.argv[2]).then(result => console.log(JSON.stringify(result, null, 2)),
    e => { console.error(JSON.stringify({ status: 'BLOCKED', code: e.message, noDeviceAccess: true, restoreAttempted: false })); process.exitCode = 1; });
}
