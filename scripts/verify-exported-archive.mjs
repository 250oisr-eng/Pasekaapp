import { readFile, open, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';

// Independent, local, read-only inspection of the *exported file*.
// In-memory fake IndexedDB is not the installed phone DB and is never restored.
const archiveCode = await readFile(new URL('../js/disaster-archive.js', import.meta.url), 'utf8');
const sandbox = { crypto: webcrypto };
new Function('window', 'TextEncoder', 'Blob', 'File', 'atob', 'btoa', archiveCode)(
  sandbox, TextEncoder, Blob, typeof File === 'undefined' ? undefined : File, atob, btoa
);
const archive = sandbox.PasekaDisasterArchive;
const REQUIRED = ['main', 'full_backup', 'entrance_media'];

export async function inspectExportedArchiveText(raw) {
  if (typeof raw !== 'string') throw Error('Invalid archive text');
  let envelope;
  try { envelope = JSON.parse(raw); } catch (_) { throw Error('Invalid archive JSON'); }
  const payload = envelope?.payload;
  if (payload?.database !== 'paseka-v1' || payload.version !== 3 ||
      !Array.isArray(payload.stores)) throw Error('Unsupported archive database or version');
  const names = new Set();
  for (const spec of payload.stores) {
    if (!spec || typeof spec.name !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(spec.name) ||
        names.has(spec.name) || !(spec.keyPath === null || (typeof spec.keyPath === 'string' && spec.keyPath.length > 0)) ||
        typeof spec.autoIncrement !== 'boolean') throw Error('Invalid archive store manifest');
    names.add(spec.name);
  }
  if (!REQUIRED.every(name => names.has(name))) throw Error('Missing required IndexedDB store');

  const factory = new IDBFactory();
  const db = await new Promise((ok, no) => {
    const request = factory.open('paseka-v1-offline-verifier-only', 3);
    request.onupgradeneeded = () => {
      for (const spec of payload.stores)
        request.result.createObjectStore(spec.name, { keyPath: spec.keyPath, autoIncrement: spec.autoIncrement });
    };
    request.onsuccess = () => ok(request.result);
    request.onerror = () => no(request.error || Error('Ephemeral schema setup failed'));
  });
  try {
    const checked = await archive.inspectArchive(raw, db);
    // This is a file consistency check only: no independent restore was run.
    return Object.freeze({
      status: 'EXPORTED_FILE_STRUCTURALLY_VERIFIED_RESTORE_NOT_TESTED',
      format: archive.format,
      manifestSha256: checked.sha256,
      counts: checked.counts,
      allDeclaredStoresChecked: true,
      userDataReadFromDevice: false,
      independentRestoreVerified: false
    });
  } finally {
    db.close();
  }
}

export async function inspectExportedArchiveFile(path, { maxBytes = 512 * 1024 * 1024 } = {}) {
  if (!path || typeof path !== 'string' || !Number.isSafeInteger(maxBytes) || maxBytes < 1)
    throw Error('Invalid local archive path or size limit');
  // Check the already-exported file, never the application's live database.
  // A size check followed by readFile(path) is racy: an external writer can
  // enlarge or replace the file between those operations.
  const preOpen = await lstat(path);
  if (!preOpen.isFile() || preOpen.isSymbolicLink())
    throw Error('Archive must be a regular non-symlink file');
  const flags = constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW);
  const handle = await open(path, flags);
  try {
    const initial = await handle.stat();
    if (!initial.isFile() || initial.dev !== preOpen.dev ||
        initial.ino !== preOpen.ino || !Number.isSafeInteger(initial.size) ||
        initial.size < 1 || initial.size > maxBytes)
      throw Error('Archive exceeds local verifier memory safety limit, is empty or changed');
    const chunks = [];
    let total = 0;
    for (;;) {
      // Read one byte beyond the caller's limit so growth cannot evade the
      // check even if it occurs after the original lstat/fstat.
      const chunk = Buffer.allocUnsafe(Math.min(1024 * 1024, maxBytes - total + 1));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > maxBytes)
        throw Error('Archive exceeds local verifier memory safety limit');
      chunks.push(chunk.subarray(0, bytesRead));
    }
    const finished = await handle.stat();
    if (total !== initial.size || finished.size !== initial.size ||
        finished.dev !== initial.dev || finished.ino !== initial.ino ||
        finished.mtimeMs !== initial.mtimeMs || finished.ctimeMs !== initial.ctimeMs)
      throw Error('Archive file changed during verification; export again');
    return inspectExportedArchiveText(
      new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, total))
    );
  } finally {
    await handle.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  inspectExportedArchiveFile(process.argv[2]).then(
    result => { console.log(JSON.stringify(result, null, 2)); },
    () => {
      // Deliberately do not print paths, user records, parse excerpts or secrets.
      console.error(JSON.stringify({ status:'BLOCKED', code:'FILE_NOT_VERIFIED', restoreAttempted:false }));
      process.exitCode = 1;
    }
  );
}
