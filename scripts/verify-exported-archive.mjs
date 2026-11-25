import { readFile, stat } from 'node:fs/promises';
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
  const size = (await stat(path)).size;
  if (!Number.isSafeInteger(size) || size < 1 || size > maxBytes)
    throw Error('Archive exceeds local verifier memory safety limit or is empty');
  return inspectExportedArchiveText(await readFile(path, 'utf8'));
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
