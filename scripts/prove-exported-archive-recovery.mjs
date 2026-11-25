// B01: independent ephemeral database proof of an already exported archive.
// Uses ONLY a locally supplied file. Never connects to devices, browser storage,
// Gallery/MediaStore or a production IndexedDB. No user data in the report.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { readExportedArchiveFile } from './verify-exported-archive.mjs';

const LIMIT = 64 * 1024 * 1024;
const REQUIRED = ['main', 'full_backup', 'entrance_media'];

function fail(code) { throw new Error('B01_BLOCKED_' + code); }

export async function proveExportedArchiveRecoveryText(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > LIMIT)
    fail('SOURCE_TEXT_INVALID_OR_TOO_LARGE');
  let envelope;
  try { envelope = JSON.parse(raw); } catch { fail('INVALID_ARCHIVE_JSON'); }
  const stores = envelope?.payload?.stores;
  if (envelope?.manifest?.format !== 'paseka-idb-full-v1' ||
      envelope?.payload?.database !== 'paseka-v1' ||
      envelope?.payload?.version !== 3 || !Array.isArray(stores))
    fail('UNSUPPORTED_ARCHIVE_FORMAT_OR_VERSION');
  const names = new Set();
  for (const spec of stores) {
    if (!spec || typeof spec.name !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(spec.name) ||
        names.has(spec.name) || !(spec.keyPath === null ||
          (typeof spec.keyPath === 'string' && spec.keyPath.length > 0)) ||
        typeof spec.autoIncrement !== 'boolean')
      fail('INVALID_STORE_MANIFEST');
    names.add(spec.name);
  }
  if (!REQUIRED.every(name => names.has(name))) fail('REQUIRED_STORE_MISSING');

  // Load the same production serialization and restore functions into
  // an isolated JS object; never load the app, import data, or write a live DB.
  const code = await readFile(new URL('../js/disaster-archive.js', import.meta.url), 'utf8');
  const sandbox = { crypto: webcrypto };
  new Function('window', 'TextEncoder', 'Blob', 'File', 'atob', 'btoa', code)(
    sandbox, TextEncoder, Blob, typeof File === 'undefined' ? undefined : File, atob, btoa
  );
  const api = sandbox.PasekaDisasterArchive;
  if (api?.format !== 'paseka-idb-full-v1') fail('EXPORT_RUNTIME_MISMATCH');

  const factory = new IDBFactory();
  const name = 'b01-recovery-ephemeral-only';
  const open = () => new Promise((resolveOpen, reject) => {
    const req = factory.open(name, 3);
    req.onupgradeneeded = () => {
      for (const spec of stores)
        req.result.createObjectStore(spec.name, {
          keyPath: spec.keyPath, autoIncrement: spec.autoIncrement
        });
    };
    req.onsuccess = () => resolveOpen(req.result);
    req.onerror = () => reject(req.error || Error('Ephemeral IndexedDB open failed'));
  });

  let db = await open();
  try {
    const inspected = await api.inspectArchive(raw, db);
    // Atomic restore is destructive only to the fresh, private in-memory DB.
    // The empty DB has null revisionId and no pre-existing user originals.
    await api.atomicRestore(db, inspected, null);
    const first = await api.verifyRestoredArchive(db, inspected);
    if (!first.verified) fail('FIRST_READBACK_NOT_VERIFIED');
    db.close();
    db = await open();
    const afterReopen = await api.verifyRestoredArchive(db, inspected);
    if (!afterReopen.verified || afterReopen.sha256 !== first.sha256)
      fail('REOPEN_BYTE_READBACK_MISMATCH');
    const counts = {};
    for (const key of REQUIRED) counts[key] = afterReopen.counts[key];
    return Object.freeze({
      schema: 'paseka-b01-ephemeral-export-recovery-v1',
      status: 'EPHEMERAL_ARCHIVE_RESTORE_REOPEN_BYTES_PASS_NOT_DEVICE_PROOF',
      archivedStoreCount: stores.length,
      requiredStoreCounts: counts,
      allArchivedStoresByteVerified: true,
      ephemeralDatabaseReopened: true,
      inputSource: 'EXPORTED_LOCAL_FILE_ONLY',
      originalDataModified: false,
      phoneAccess: 'NOT_ATTEMPTED',
      galleryMediaStore: 'NOT_TESTED',
      externalOriginalVideos: 'NOT_TESTED',
      realAndroidRestore: 'NOT_TESTED',
      fullBackupVerified: false,
      videoCleanup: 'NOT_ATTEMPTED'
    });
  } finally {
    db.close();
  }
}

export async function proveExportedArchiveRecoveryFile(path) {
  // Smaller cap than the normal file inspector; this experiment materializes
  // both the archive and restored binary data in process memory.
  const raw = await readExportedArchiveFile(path, { maxBytes: LIMIT });
  return proveExportedArchiveRecoveryText(raw);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  proveExportedArchiveRecoveryFile(process.argv[2]).then(
    result => console.log(JSON.stringify(result, null, 2)),
    () => {
      // Do not expose filenames, record values, stack traces or archive hashes.
      console.error(JSON.stringify({
        status: 'BLOCKED',
        code: 'EPHEMERAL_RECOVERY_NOT_VERIFIED',
        userRecordsDisclosed: false,
        phoneAccess: 'NOT_ATTEMPTED',
        videoCleanup: 'NOT_ATTEMPTED'
      }));
      process.exitCode = 1;
    }
  );
}
