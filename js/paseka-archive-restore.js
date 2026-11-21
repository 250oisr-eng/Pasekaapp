(function (root) {
'use strict';

const STAGING_STORE = 'archive_staging';
const HISTORY_STORE = 'archive_history';

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  throw error;
}
function assertLegacyArchiveRecognitionLedger(value) {
  if (value == null) return;
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.version !== 1 || !Array.isArray(value.entries)) {
    fail('VIDEO_LEDGER_UNVERIFIED', 'Recognition history cannot be validated. Archive restore is blocked.');
  }
  if (value.entries.length) {
    fail('VIDEO_LEDGER_NOT_PRESERVED', 'This archive version does not preserve recognized video history. Restore is blocked.');
  }
}
function ensureStores(db) {
  if (!db || !db.objectStoreNames || !db.objectStoreNames.contains(STAGING_STORE) || !db.objectStoreNames.contains(HISTORY_STORE)) {
    fail('ARCHIVE_STAGING_UNAVAILABLE', 'The local database does not support staged archive imports. Update the application and reopen it.');
  }
}
function randomId(cryptoProvider) {
  if (!cryptoProvider || typeof cryptoProvider.getRandomValues !== 'function') fail('CRYPTO_UNAVAILABLE', 'Secure random number generation is unavailable.');
  const bytes = new Uint8Array(16);
  cryptoProvider.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}
function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed.'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted.'));
  });
}
async function getHistory(db, backupId) {
  const tx = db.transaction(HISTORY_STORE, 'readonly');
  const result = await requestValue(tx.objectStore(HISTORY_STORE).get(backupId));
  await transactionDone(tx);
  return result || null;
}
async function findSessionByBackupId(db, backupId) {
  const tx = db.transaction(STAGING_STORE, 'readonly');
  const result = await requestValue(tx.objectStore(STAGING_STORE).index('backupId').get(backupId));
  await transactionDone(tx);
  return result || null;
}
async function updateSession(db, session) {
  const sessionId = session.sessionId || session.id;
  const tx = db.transaction([STAGING_STORE, 'main'], 'readwrite');
  const store = tx.objectStore(STAGING_STORE);
  let failure = null;
  const request = store.get(sessionId);
  request.onerror = () => {
    failure = request.error || new Error('Could not read the staging session before updating it.');
    try { tx.abort(); } catch (error) {}
  };
  request.onsuccess = () => {
    const currentSession = request.result;
    if (!currentSession || currentSession.kind !== 'session') {
      failure = Object.assign(new Error('Staging session is no longer writable.'), { code: 'STAGING_SESSION_NOT_WRITABLE' });
      try { tx.abort(); } catch (error) {}
      return;
    }
    // If explicit recovery finalized the same complete revision just before the
    // original writer's final status update, treat that update as an idempotent
    // success. Never let a stale failure path downgrade a ready session.
    const identicalReady = currentSession.status === 'ready' && session.status === 'ready' &&
        currentSession.fingerprint === session.fingerprint &&
        currentSession.stagingEpoch === session.stagingEpoch &&
        currentSession.stagedCount === session.stagedCount &&
        currentSession.totalEntries === session.totalEntries;
    if (!identicalReady && currentSession.status !== 'staging') {
      failure = Object.assign(new Error('Staging session is no longer writable.'), { code: 'STAGING_SESSION_NOT_WRITABLE' });
      try { tx.abort(); } catch (error) {}
      return;
    }
    if (session.status === 'ready') {
      const ledgerRequest = tx.objectStore('main').get('video_recognition_ledger_v1');
      ledgerRequest.onerror = () => { failure = ledgerRequest.error || new Error('Could not read recognition ledger during staging finalization.'); try { tx.abort(); } catch (ignored) {} };
      ledgerRequest.onsuccess = () => {
        try { assertLegacyArchiveRecognitionLedger(ledgerRequest.result); if (!identicalReady) store.put({ ...currentSession, ...session }); }
        catch (error) { failure = error; try { tx.abort(); } catch (ignored) {} }
      };
      return;
    }
    store.put({ ...currentSession, ...session });
  };
  try {
    await transactionDone(tx);
  } catch (error) {
    throw failure || error;
  }
}
async function putStagingEntryAndUpdateSession(db, record, session) {
  const tx = db.transaction([STAGING_STORE, 'main'], 'readwrite');
  const store = tx.objectStore(STAGING_STORE);
  let nextSession = null;
  let failure = null;
  const sessionRequest = store.get(session.sessionId || session.id);
  sessionRequest.onerror = () => {
    failure = sessionRequest.error || new Error('Could not read the staging session.');
    try { tx.abort(); } catch (error) {}
  };
  sessionRequest.onsuccess = () => {
    // Read the ledger under the same write lock before writing any staged Blob.
    const ledgerRequest = tx.objectStore('main').get('video_recognition_ledger_v1');
    ledgerRequest.onerror = () => {
      failure = ledgerRequest.error || new Error('Unable to verify recognition history before staging media.');
      try { tx.abort(); } catch (error) {}
    };
    ledgerRequest.onsuccess = () => {
      try { assertLegacyArchiveRecognitionLedger(ledgerRequest.result); }
      catch (error) { failure = error; try { tx.abort(); } catch (ignored) {} return; }
    const currentSession = sessionRequest.result;
    if (!currentSession || currentSession.kind !== 'session' ||
        currentSession.status !== 'staging') {
      failure = Object.assign(new Error('Staging session is no longer writable.'), { code: 'STAGING_SESSION_NOT_WRITABLE' });
      try { tx.abort(); } catch (error) {}
      return;
    }
    if (!Number.isSafeInteger(currentSession.stagingEpoch) || currentSession.stagingEpoch < 0) {
      failure = Object.assign(new Error('Legacy staging sessions must be imported again.'), { code: 'STAGING_LEGACY_SESSION' });
      try { tx.abort(); } catch (error) {}
      return;
    }
    const nextEpoch = currentSession.stagingEpoch + 1;
    if (!Number.isSafeInteger(nextEpoch)) {
      failure = Object.assign(new Error('Staging revision limit was exceeded.'), { code: 'STAGING_REVISION_EXHAUSTED' });
      try { tx.abort(); } catch (error) {}
      return;
    }
    const existingRequest = store.get(record.id);
    existingRequest.onerror = () => {
      failure = existingRequest.error || new Error('Could not inspect the staged entry.');
      try { tx.abort(); } catch (error) {}
    };
    existingRequest.onsuccess = () => {
      const existing = existingRequest.result;
      if (existing && (existing.sessionId !== currentSession.sessionId || existing.kind === 'session')) {
        failure = Object.assign(new Error('Staging entry identity conflicts with an existing record.'), { code: 'STAGING_ENTRY_ID_CONFLICT' });
        try { tx.abort(); } catch (error) {}
        return;
      }
      nextSession = {
        ...currentSession,
        stagedCount: currentSession.stagedCount + (existing ? 0 : 1),
        stagingEpoch: nextEpoch
      };
      store.put({ ...record, stagingRevision: nextEpoch });
      store.put(nextSession);
    };
    }; // ledgerRequest.onsuccess
  };
  try {
    await transactionDone(tx);
  } catch (error) {
    throw failure || error;
  }
  Object.assign(session, nextSession);
}
function stagingMetadataFingerprint(session, records) {
  const contentRecords = (records || [])
    .filter(record => record && record.sessionId === session.sessionId && record.kind !== 'session')
    .map(record => {
      const revision = record.stagingRevision;
      const size = Number.isSafeInteger(record.size) ? record.size : record.blob?.size;
      const chunks = Array.isArray(record.chunkSha256) ? record.chunkSha256 : null;
      if (typeof record.id !== 'string' || !record.id || !Number.isSafeInteger(revision) ||
          revision < 1 || !Number.isSafeInteger(size) || size < 0 || !chunks ||
          chunks.some(hash => typeof hash !== 'string' || !/^[a-f0-9]{64}$/i.test(hash))) {
        fail('STAGING_FINGERPRINT_METADATA_INVALID', 'Staged entry metadata is incomplete or invalid.');
      }
      return [record.id, record.kind, revision, size, chunks];
    })
    .sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  if (contentRecords.length !== session.stagedCount ||
      new Set(contentRecords.map(record => record[0])).size !== contentRecords.length) {
    fail('STAGING_FINGERPRINT_SET_INVALID', 'Staged entry set does not match its session.');
  }
  const canonical = JSON.stringify([
    'PASEKA-STAGING-FINGERPRINT',
    1,
    session.sessionId,
    session.backupId,
    session.fingerprint,
    session.stagingEpoch,
    session.stagedCount,
    contentRecords
  ]);
  // FNV-1a 64-bit: synchronous mutation detector, not an authenticity check.
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const byte of new TextEncoder().encode(canonical)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, '0');
}
async function manifestFingerprint(manifest, cryptoProvider) {
  if (!cryptoProvider || !cryptoProvider.subtle || typeof cryptoProvider.subtle.digest !== 'function') fail('CRYPTO_UNAVAILABLE', 'SHA-256 is unavailable.');
  const bytes = new TextEncoder().encode(JSON.stringify(manifest));
  const digest = await cryptoProvider.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
function hasV2ProtectedRecords(stagedKeys,history,backupKeys) {
  return stagedKeys.some(key=>typeof key==='string'&&key.startsWith('v2pending:'))||
    history.some(row=>row&&typeof row.kind==='string'&&row.kind.startsWith('v2_'))||
    backupKeys.some(key=>typeof key==='string'&&key.startsWith('v2entrance:'));
}
async function assertLegacyArchiveStageAllowed(db) {
  // A missing ledger is legitimate for an untouched historical database, but
  // not after PASEKA02 has created protected pending/quarantine/rollback data.
  // Read all four stores in ONE consistent snapshot. A historical PASEKA01
  // archive cannot interpret or preserve those V2 protected originals.
  if (!['main','archive_staging','archive_history','full_backup'].every(
    name => db.objectStoreNames.contains(name))) {
    fail('VIDEO_LEGACY_RESTORE_STORES_MISSING',
      'The archive safety stores are unavailable. Legacy restore is blocked.');
  }
  const tx = db.transaction(['main','archive_staging','archive_history','full_backup'],'readonly');
  const completed = transactionDone(tx);
  const [ledger,stagedKeys,history,backupKeys] = await Promise.all([
    requestValue(tx.objectStore('main').get('video_recognition_ledger_v1')),
    requestValue(tx.objectStore('archive_staging').getAllKeys()),
    requestValue(tx.objectStore('archive_history').getAll()),
    requestValue(tx.objectStore('full_backup').getAllKeys())
  ]);
  await completed;
  assertLegacyArchiveRecognitionLedger(ledger);
  if (hasV2ProtectedRecords(stagedKeys,history,backupKeys)) fail('VIDEO_LEGACY_RESTORE_V2_PROTECTED',
    'Protected PASEKA02 media or rollback records exist. Legacy restore is blocked.');
}
async function stageArchiveForRestore(db, archiveBlob, cryptoProvider, archiveApi, validateState, options = {}) {
  ensureStores(db);
  if (!archiveApi || typeof archiveApi.validateArchiveForRestore !== 'function') fail('ARCHIVE_CODEC_UNAVAILABLE', 'Archive validation module is unavailable.');
  await assertLegacyArchiveStageAllowed(db);
  const checked = await archiveApi.validateArchiveForRestore(archiveBlob, cryptoProvider, validateState);
  const fingerprint = await manifestFingerprint(checked.manifest, cryptoProvider);
  const history = await getHistory(db, checked.backupId);
  if (history) {
    if (history.fingerprint !== fingerprint) fail('BACKUP_ID_COLLISION', 'This backup ID was already imported with different content.');
    if (history.status !== 'reverted') fail('ALREADY_IMPORTED', 'This archive has already been imported.');
  }
  const existing = await findSessionByBackupId(db, checked.backupId);
  if (existing) {
    if (existing.fingerprint !== fingerprint) fail('BACKUP_ID_COLLISION', 'Another staged archive uses the same backup ID with different content.');
    if (existing.status === 'ready') return { session: existing, alreadyStaged: true };
    fail('INCOMPLETE_STAGING_EXISTS', 'An interrupted import session already exists. Discard it before staging this archive again.');
  }

  const sessionId = randomId(cryptoProvider);
  const session = {
    id: sessionId,
    sessionId,
    kind: 'session',
    backupId: checked.backupId,
    fingerprint,
    createdAt: new Date().toISOString(),
    archiveCreatedAt: checked.createdAt,
    schemaVersion: checked.schemaVersion,
    archiveBytes: checked.archiveBytes,
    manifest: checked.manifest,
    totalEntries: checked.videoEntries.length + 1,
    stagedCount: 0,
    stagingEpoch: 0,
    orphanVideoIds: checked.orphanVideoIds.slice(),
    status: 'staging',
    errorCode: null,
    errorMessage: null
  };
  let sessionCreated = false;
  try {
    // Read and hash the live media outside IndexedDB transactions. Never keep a
    // readwrite transaction alive across Blob I/O or asynchronous SHA-256.
    // Recheck after asynchronous archive validation and before any staging writes.
    await assertLegacyArchiveStageAllowed(db);
    const baselineReadTx = db.transaction('entrance_media', 'readonly');
    const baselineReadDone = transactionDone(baselineReadTx);
    const baselineRows = await requestValue(baselineReadTx.objectStore('entrance_media').getAll());
    await baselineReadDone;
    const baselineRecords = await Promise.all((baselineRows || []).map(async record => {
      if (!record || !record.blob || typeof record.blob.slice !== 'function') {
        fail('MEDIA_BASELINE_BLOB_INVALID', 'An existing entrance video has no readable Blob. The archive import was not staged.');
      }
      const actualHash = await sha256BlobHex(record.blob, cryptoProvider);
      if (record.blobSha256 !== undefined &&
          (typeof record.blobSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.blobSha256) || record.blobSha256 !== actualHash)) {
        fail('MEDIA_BASELINE_HASH_MISMATCH', 'An existing entrance video does not match its saved SHA-256 checksum. The archive import was not staged.');
      }
      return { ...record, blobSha256: actualHash };
    }));
    session.baselineMediaFingerprint = mediaRecordsFingerprint(baselineRecords);

    // Re-read under a short write lock, but never rewrite live media rows here.
    // A legacy writer may not persist SHA-256; putting the earlier Blob back
    // could overwrite a newer same-size replacement from another tab.
    // Recheck ledger, V2 protected history/backups, staged keys and live videos
    // in the SAME writer-serialized transaction that reserves PASEKA01 staging.
    // A V2 quarantine writer cannot sneak in after the async preflight.
    const baselineTx = db.transaction(
      [STAGING_STORE, 'entrance_media', 'main', HISTORY_STORE, 'full_backup'], 'readwrite');
    const baselineRequest = baselineTx.objectStore('entrance_media').getAll();
    const ledgerRequest = baselineTx.objectStore('main').get('video_recognition_ledger_v1');
    const stageKeysRequest = baselineTx.objectStore(STAGING_STORE).getAllKeys();
    const historyRequest = baselineTx.objectStore(HISTORY_STORE).getAll();
    const backupKeysRequest = baselineTx.objectStore('full_backup').getAllKeys();
    let baselineFailure = null, pendingReads = 5;
    const finishBaselineReads = () => {
      if (--pendingReads > 0) return;
      try {
        assertLegacyArchiveRecognitionLedger(ledgerRequest.result);
        if (hasV2ProtectedRecords(stageKeysRequest.result || [],
            historyRequest.result || [], backupKeysRequest.result || [])) {
          fail('VIDEO_LEGACY_RESTORE_V2_PROTECTED',
            'Protected PASEKA02 records appeared before staging. Legacy restore is blocked.');
        }
        const currentRows = baselineRequest.result || [];
        const expectedById = new Map(baselineRecords.map(record => [record.id, record]));
        if (currentRows.length !== baselineRecords.length ||
            currentRows.some(record => !record || !expectedById.has(record.id))) {
          fail('RESTORE_MEDIA_CHANGED', 'The video library changed while the archive was being prepared. The import was not staged.');
        }
        const normalizedRows = currentRows.map(record => {
          const expected = expectedById.get(record.id);
          if (record.blobSha256 !== undefined && record.blobSha256 !== expected.blobSha256) {
            fail('RESTORE_MEDIA_CHANGED', 'A video changed while the archive was being prepared. The import was not staged.');
          }
          return { ...record, blobSha256: expected.blobSha256 };
        });
        if (mediaRecordsFingerprint(normalizedRows) !== session.baselineMediaFingerprint) {
          fail('RESTORE_MEDIA_CHANGED', 'The video library changed while the archive was being prepared. The import was not staged.');
        }
        const sessionAddRequest = baselineTx.objectStore(STAGING_STORE).add(session);
        sessionAddRequest.onerror = () => {
          baselineFailure = sessionAddRequest.error || new Error('Could not reserve the archive staging session.');
          try { baselineTx.abort(); } catch (ignored) {}
        };
      } catch (error) {
        baselineFailure = error;
        try { baselineTx.abort(); } catch (ignored) {}
      }
    };
    for(const read of [baselineRequest, ledgerRequest, stageKeysRequest,
        historyRequest, backupKeysRequest]) {
      read.onsuccess = finishBaselineReads;
    }
    try {
      await transactionDone(baselineTx);
    } catch (error) {
      throw baselineFailure || error;
    }
    sessionCreated = true;
    const stateManifestEntry = checked.manifest.entries.find(entry => entry.kind === 'state');
    if (!stateManifestEntry || !Array.isArray(stateManifestEntry.chunkSha256)) fail('STAGING_MANIFEST_MISMATCH', 'State entry checksum metadata is missing.');
    await putStagingEntryAndUpdateSession(db, {
      id: sessionId + ':state', sessionId, kind: 'state', blob: checked.stateBlob,
      size: checked.stateBlob.size, chunkSha256: stateManifestEntry.chunkSha256
    }, session);
    for (const item of checked.videoEntries) {
      await putStagingEntryAndUpdateSession(db, {
        id: sessionId + ':video:' + item.metadata.id,
        sessionId,
        kind: 'video',
        path: item.path,
        size: item.size,
        chunkSize: item.chunkSize,
        chunkSha256: item.chunkSha256,
        metadata: item.metadata,
        blob: item.blob,
        orphanedHiveReference: item.orphanedHiveReference
      }, session);
      if (typeof options.onProgress === 'function') options.onProgress({ staged: session.stagedCount, total: session.totalEntries });
    }
    session.status = 'ready';
    session.completedAt = new Date().toISOString();
    await updateSession(db, session);
    return { session, alreadyStaged: false };
  } catch (error) {
    if (error && error.name === 'ConstraintError' && !sessionCreated) {
      fail('BACKUP_STAGING_CONFLICT', 'Another tab started staging this backup at the same time. Refresh the list of staged imports.');
    }
    if (sessionCreated) {
      try {
        session.status = 'failed';
        session.errorCode = String(error && (error.name && error.name !== 'Error' ? error.name : error.code) || 'STAGING_FAILED').slice(0, 80);
        session.errorMessage = String(error && error.message || 'Staging failed').slice(0, 500);
        await updateSession(db, session);
      } catch (ignored) {}
    }
    throw error;
  }
}
function cloneState(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
function mediaRecordsFingerprint(records) {
  // Versioned, explicit fields keep harmless schema additions from invalidating
  // rollback. blobSha256 covers the actual media bytes and is produced before
  // every supported write/import path.
  const canonical = (records || []).map(record => {
    if (!record || typeof record.id !== 'string' || !record.id) {
      fail('MEDIA_FINGERPRINT_RECORD_INVALID', 'A video record has no stable ID.');
    }
    const blob = record.blob;
    return [
      record.id,
      typeof record.blobSha256 === 'string' ? record.blobSha256 : null,
      typeof record.hiveId === 'string' ? record.hiveId : null,
      record.orphanedHiveReference === true,
      typeof record.capturedAt === 'string' ? record.capturedAt : null,
      Number.isFinite(record.durationSec) ? record.durationSec : null,
      Number.isFinite(record.width) ? record.width : null,
      Number.isFinite(record.height) ? record.height : null,
      Number.isFinite(record.bytes) ? record.bytes : (blob && Number.isFinite(blob.size) ? blob.size : null),
      blob && Number.isFinite(blob.size) ? blob.size : null,
      blob && typeof blob.type === 'string' ? blob.type : null
    ];
  }).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  return JSON.stringify(['PASEKA-MEDIA-FINGERPRINT', 3, canonical]);
}
async function sha256BlobHex(blob, cryptoProvider) {
  if (!root.PasekaSha256 || typeof root.PasekaSha256.hashBlobHex !== 'function') {
    fail('MEDIA_HASH_UNAVAILABLE', 'The incremental SHA-256 module is unavailable on this device.');
  }
  return root.PasekaSha256.hashBlobHex(blob);
}
async function hashLiveMediaBaseline(db, cryptoProvider) {
  const tx = db.transaction('entrance_media', 'readonly');
  const done = transactionDone(tx);
  const rows = await requestValue(tx.objectStore('entrance_media').getAll());
  await done;
  const records = await Promise.all((rows || []).map(async record => {
    if (!record || !record.blob || typeof record.blob.slice !== 'function') {
      fail('MEDIA_BASELINE_BLOB_INVALID', 'An existing entrance video has no readable Blob.');
    }
    const actualHash = await sha256BlobHex(record.blob, cryptoProvider);
    if (record.blobSha256 !== undefined &&
        (typeof record.blobSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.blobSha256) || record.blobSha256 !== actualHash)) {
      fail('MEDIA_BASELINE_HASH_MISMATCH', 'An existing entrance video does not match its saved SHA-256 checksum.');
    }
    return { ...record, blobSha256: actualHash };
  }));
  return {
    fingerprint: mediaRecordsFingerprint(records),
    hashes: new Map(records.map(record => [record.id, record.blobSha256]))
  };
}
async function commitStagedArchive(db, sessionId, expectedRevision, cryptoProvider, archiveApi, validateState, prepareState) {
  ensureStores(db);
  if (!db.objectStoreNames.contains('main') || !db.objectStoreNames.contains('full_backup') || !db.objectStoreNames.contains('entrance_media')) {
    fail('LIVE_DATABASE_STORES_MISSING', 'The live Paseka database stores are unavailable.');
  }
  if (expectedRevision === undefined) fail('EXPECTED_REVISION_REQUIRED', 'The current database revision is required before restore.');

  // Phase A: all Blob reads, hashing, parsing and state validation happen before
  // opening the final write transaction. No non-IDB await is allowed in Phase B.
  const staged = await getStagedArchive(db, sessionId, cryptoProvider, archiveApi, validateState);
  // Re-hash the live library immediately before commit. Database version 5
  // closes older tabs that may still write legacy media without checksums.
  const phaseAMedia = await hashLiveMediaBaseline(db, cryptoProvider);
  if (typeof staged.session.baselineMediaFingerprint !== 'string' ||
      phaseAMedia.fingerprint !== staged.session.baselineMediaFingerprint) {
    fail('RESTORE_MEDIA_CHANGED', 'The video library changed after archive preparation. The import was cancelled to preserve newer videos.');
  }
  const phaseAMediaHashes = phaseAMedia.hashes;
  let importedState = cloneState(staged.state);
  const now = new Date().toISOString();
  importedState.meta = { ...(importedState.meta || {}), revisionId: randomId(cryptoProvider), updatedAt: now };
  importedState.auditLog = Array.isArray(importedState.auditLog) ? importedState.auditLog : [];
  importedState.auditLog.push({ id: 'archive-import-' + sessionId, type: 'backup_restored', at: now, source: 'full_archive', backupId: staged.session.backupId });
  if (importedState.auditLog.length > 500) importedState.auditLog = importedState.auditLog.slice(-500);
  const validationResult = await validateState(importedState);
  if (validationResult === false) fail('STATE_VALIDATION_FAILED', 'The application rejected the staged state before commit.');
  if (prepareState !== undefined) {
    if (typeof prepareState !== 'function') fail('STATE_PREPARATION_INVALID', 'The archive state preparation callback is invalid.');
    const prepared = await prepareState(importedState);
    if (!prepared || typeof prepared !== 'object' || Array.isArray(prepared)) fail('STATE_PREPARATION_INVALID', 'The archive state preparation callback did not return a valid state.');
    importedState = cloneState(prepared);
    const preparedValidation = await validateState(importedState);
    if (preparedValidation === false) fail('STATE_VALIDATION_FAILED', 'The migrated archive state failed validation.');
  }
  const importedHiveIds = new Set(Array.isArray(importedState.hives) ? importedState.hives.map(hive => hive && hive.id).filter(id => typeof id === 'string' && id) : []);
  const importedVideos = await Promise.all(staged.videos.map(async record => ({
    ...record.metadata,
    blob: record.blob,
    blobSha256: await sha256BlobHex(record.blob, cryptoProvider),
    orphanedHiveReference: !importedHiveIds.has(record.metadata.hiveId)
  })));
  const rollbackSessionId = randomId(cryptoProvider);
  let tx, failure = null, result = null, settled = false;

  return new Promise((resolve, reject) => {
    const rejectOnce = error => {
      if (!settled) { settled = true; reject(error); }
    };
    const abortWith = error => {
      failure = error;
      try { tx.abort(); } catch (abortError) { rejectOnce(error); }
    };
    try {
      tx = db.transaction(['main', 'full_backup', 'entrance_media', STAGING_STORE, HISTORY_STORE], 'readwrite');
      const main = tx.objectStore('main');
      const backup = tx.objectStore('full_backup');
      const media = tx.objectStore('entrance_media');
      const stagingStore = tx.objectStore(STAGING_STORE);
      const historyStore = tx.objectStore(HISTORY_STORE);
      const reads = {
        currentState: main.get('state'),
        recognitionLedger: main.get('video_recognition_ledger_v1'),
        currentVideos: media.getAll(),
        session: stagingStore.get(sessionId),
        stagedRecords: stagingStore.index('sessionId').getAll(sessionId),
        history: historyStore.get(staged.session.backupId)
      };
      const values = {};
      let pending = Object.keys(reads).length;
      const process = () => {
        try {
          const currentState = values.currentState || null;
          assertLegacyArchiveRecognitionLedger(values.recognitionLedger);
          const currentVideos = Array.isArray(values.currentVideos) ? values.currentVideos : [];
          const session = values.session;
          const records = values.stagedRecords || [];
          if (!session || session.kind !== 'session' || session.status !== 'ready' || session.stagedCount !== session.totalEntries) {
            fail('STAGING_SESSION_INCOMPLETE', 'Staged import is not ready for commit.');
          }
          if (values.history && values.history.status !== 'reverted') fail('ALREADY_IMPORTED', 'This archive has already been imported.');
          if (values.history && values.history.fingerprint !== session.fingerprint) fail('BACKUP_ID_COLLISION', 'This backup ID was already imported with different content.');
          if (!Number.isSafeInteger(session.stagingEpoch) || session.stagingEpoch < 0) fail('STAGING_LEGACY_SESSION', 'This staged import predates revision tracking. Discard it and import the archive again.');
          if (session.backupId !== staged.session.backupId || session.fingerprint !== staged.session.fingerprint ||
              session.baselineMediaFingerprint !== staged.session.baselineMediaFingerprint) fail('STAGING_SESSION_CHANGED', 'Staged import session changed during restore.');
          const contentRecords = records.filter(record => record && record.sessionId === sessionId && record.kind !== 'session');
          const knownKinds = new Set(['state', 'video']);
          if (contentRecords.some(record => !knownKinds.has(record.kind))) fail('STAGING_KIND_UNKNOWN', 'Staged archive contains an unsupported entry type.');
          const revisions = contentRecords.map(record => record.stagingRevision);
          if (contentRecords.length !== session.stagedCount ||
              revisions.some(revision => !Number.isSafeInteger(revision) || revision < 1 || revision > session.stagingEpoch) ||
              new Set(revisions).size !== revisions.length) {
            fail('STAGING_REVISION_INVALID', 'Staged entry revisions are missing, duplicated, or inconsistent. Import the archive again.');
          }
          if (stagingMetadataFingerprint(session, records) !== staged.stagingMetadataFingerprint) {
            fail('STAGING_CONTENT_CHANGED', 'Staged entries changed after archive verification. Verify the archive again before restoring.');
          }
          const expectedIds = new Set([sessionId + ':state', ...staged.videos.map(video => sessionId + ':video:' + video.metadata.id)]);
          const actualIds = new Set(contentRecords.map(record => record.id));
          if (expectedIds.size !== contentRecords.length || actualIds.size !== expectedIds.size ||
              Array.from(expectedIds).some(id => !actualIds.has(id))) {
            fail('STAGING_RECORD_SET_MISMATCH', 'Staged entry set does not match the verified archive manifest.');
          }
          const normalizedCurrentVideos = currentVideos.map(record => {
            const expectedHash = phaseAMediaHashes.get(record?.id);
            if (typeof expectedHash !== 'string' ||
                (record.blobSha256 !== undefined && record.blobSha256 !== expectedHash)) {
              fail('RESTORE_MEDIA_CHANGED', 'The video library changed while the archive was being committed. The import was cancelled to preserve newer videos.');
            }
            return { ...record, blobSha256: expectedHash };
          });
          if (typeof session.baselineMediaFingerprint !== 'string' ||
              mediaRecordsFingerprint(normalizedCurrentVideos) !== session.baselineMediaFingerprint) {
            fail('RESTORE_MEDIA_CHANGED', 'The video library changed while the archive was being committed. The import was cancelled to preserve newer videos.');
          }
          if ((currentState?.meta?.revisionId || null) !== expectedRevision) fail('RESTORE_CONFLICT', 'The live database changed after the restore preview. Refresh the data and review the archive again.');

          const rollbackEntries = (currentState ? 1 : 0) + currentVideos.length;
          const rollbackSession = {
            id: rollbackSessionId,
            sessionId: rollbackSessionId,
            kind: 'rollback_session',
            sourceBackupId: session.backupId,
            createdAt: now,
            status: 'ready',
            totalEntries: rollbackEntries,
            stagedCount: rollbackEntries
          };
          if (currentState) {
            backup.put({ at: now, state: currentState }, 'previous');
            stagingStore.put({ id: rollbackSessionId + ':state', sessionId: rollbackSessionId, kind: 'rollback_state', state: currentState });
          }
          stagingStore.put(rollbackSession);
          for (const oldVideo of currentVideos) {
            stagingStore.put({
              id: rollbackSessionId + ':video:' + String(oldVideo.id),
              sessionId: rollbackSessionId,
              kind: 'rollback_video',
              originalId: oldVideo.id,
              record: oldVideo
            });
          }
          main.put(importedState, 'state');
          media.clear();
          for (const record of importedVideos) media.put(record);
          const historyRecord = {
            backupId: session.backupId,
            fingerprint: session.fingerprint,
            importedAt: now,
            status: 'committed',
            schemaVersion: session.schemaVersion,
            archiveBytes: session.archiveBytes,
            videoCount: importedVideos.length,
            orphanedVideoCount: importedVideos.filter(record => record.orphanedHiveReference).length,
            importedMediaFingerprint: mediaRecordsFingerprint(importedVideos),
            rollbackSessionId,
            rollbackAvailable: true,
            importSessionId: sessionId
          };
          historyStore.put(historyRecord);
          stagingStore.put({ ...session, status: 'committed', committedAt: now, importedRevisionId: importedState.meta.revisionId, rollbackSessionId });
          for (const record of records) {
            if (record.sessionId === sessionId && record.id !== sessionId) stagingStore.delete(record.id);
          }
          result = {
            state: importedState,
            history: historyRecord,
            rollbackSessionId,
            previousVideoCount: currentVideos.length,
            importedVideoCount: importedVideos.length,
            orphanedVideoCount: importedVideos.filter(record => record.orphanedHiveReference).length
          };
        } catch (error) {
          abortWith(error);
        }
      };
      for (const [key, request] of Object.entries(reads)) {
        request.onsuccess = () => {
          values[key] = request.result;
          pending--;
          if (pending === 0) process();
        };
        request.onerror = () => abortWith(request.error || new Error('Could not read live or staged archive data.'));
      }
      tx.oncomplete = () => {
        if (!settled) { settled = true; resolve(result); }
      };
      tx.onabort = () => rejectOnce(failure || tx.error || new Error('Atomic archive restore transaction aborted.'));
      tx.onerror = () => rejectOnce(failure || tx.error || new Error('Atomic archive restore transaction failed.'));
    } catch (error) {
      rejectOnce(error);
    }
  });
}

async function rollbackCommittedArchive(db, backupId, expectedRevision, cryptoProvider, validateState) {
  ensureStores(db);
  if (!db.objectStoreNames.contains('main') || !db.objectStoreNames.contains('full_backup') || !db.objectStoreNames.contains('entrance_media')) {
    fail('LIVE_DATABASE_STORES_MISSING', 'The live Paseka database stores are unavailable.');
  }
  if (expectedRevision === undefined) fail('EXPECTED_REVISION_REQUIRED', 'The current database revision is required before rollback.');
  if (typeof validateState !== 'function') fail('STATE_VALIDATOR_REQUIRED', 'The application state validator is required before rollback.');

  // Phase A: read and validate the rollback snapshot before opening the final
  // write transaction. All non-IDB awaits stay outside Phase B.
  const knownHistory = await getHistory(db, backupId);
  if (!knownHistory || knownHistory.status !== 'committed' || !knownHistory.rollbackSessionId || !knownHistory.importSessionId) {
    fail('ROLLBACK_NOT_AVAILABLE', 'There is no committed archive import with an available rollback snapshot.');
  }
  const rollbackSessionId = knownHistory.rollbackSessionId;
  const readTx = db.transaction([STAGING_STORE, 'entrance_media', 'main'], 'readonly');
  const readStore = readTx.objectStore(STAGING_STORE);
  const [rollbackSession, records, importSession, phaseAMedia, currentState] = await Promise.all([
    requestValue(readStore.get(rollbackSessionId)),
    requestValue(readStore.index('sessionId').getAll(rollbackSessionId)),
    requestValue(readStore.get(knownHistory.importSessionId)),
    requestValue(readTx.objectStore('entrance_media').getAll()),
    requestValue(readTx.objectStore('main').get('state'))
  ]);
  await transactionDone(readTx);

  if (!rollbackSession || rollbackSession.kind !== 'rollback_session' || rollbackSession.status !== 'ready') {
    fail('ROLLBACK_SNAPSHOT_MISSING', 'The previous state and media rollback snapshot is unavailable.');
  }
  if (rollbackSession.sourceBackupId !== backupId) {
    fail('ROLLBACK_SNAPSHOT_INVALID', 'The rollback snapshot belongs to a different archive and was preserved.');
  }
  if (!importSession || importSession.kind !== 'session' || importSession.status !== 'committed' || importSession.backupId !== backupId) {
    fail('ROLLBACK_IMPORT_SESSION_MISSING', 'The committed import session could not be verified.');
  }
  if (typeof importSession.importedRevisionId !== 'string' || !importSession.importedRevisionId) {
    fail('ROLLBACK_IMPORT_REVISION_MISSING', 'The committed import revision could not be verified. Rollback was cancelled to preserve the current journal.');
  }
  if ((currentState?.meta?.revisionId ?? null) !== importSession.importedRevisionId) {
    fail('ROLLBACK_STATE_CHANGED', 'The journal changed after this archive was imported. Rollback was cancelled to preserve newer journal entries.');
  }
  if ((currentState?.meta?.revisionId ?? null) !== expectedRevision) {
    fail('RESTORE_CONFLICT', 'The live database changed during rollback preparation. Refresh the data and review the current state before retrying.');
  }
  if (typeof knownHistory.importedMediaFingerprint !== 'string') {
    fail('ROLLBACK_MEDIA_BASELINE_MISSING', 'This import predates video change protection. Rollback is disabled to avoid deleting videos that may have been added later.');
  }
  if (phaseAMedia.some(record => !/^[a-f0-9]{64}$/.test(record?.blobSha256 || ''))) {
    fail('ROLLBACK_MEDIA_HASH_MISSING', 'One or more videos predate content hashing. Export them and create a fresh verified archive before rollback.');
  }
  for (const record of phaseAMedia) {
    const actualHash = await sha256BlobHex(record.blob, cryptoProvider);
    if (actualHash !== record.blobSha256) {
      fail('ROLLBACK_MEDIA_CONTENT_CHANGED', 'A video file no longer matches its saved SHA-256 checksum. Rollback was cancelled to preserve the current library.');
    }
  }
  if (mediaRecordsFingerprint(phaseAMedia) !== knownHistory.importedMediaFingerprint) {
    fail('ROLLBACK_MEDIA_CHANGED', 'The entrance video library changed after this archive was imported. Export or preserve the new videos before retrying rollback.');
  }
  let snapshotRecords = (records || []).filter(record => record && record.sessionId === rollbackSessionId);
  const contentRecords = snapshotRecords.filter(record => record.kind !== 'rollback_session');
  if (snapshotRecords.length !== rollbackSession.totalEntries + 1 ||
      rollbackSession.stagedCount !== rollbackSession.totalEntries ||
      contentRecords.length !== rollbackSession.totalEntries) {
    fail('ROLLBACK_SNAPSHOT_INCOMPLETE', 'The rollback snapshot is incomplete.');
  }
  const stateRecords = contentRecords.filter(record => record.kind === 'rollback_state');
  const videoRecords = contentRecords.filter(record => record.kind === 'rollback_video');
  if (contentRecords.some(record => !['rollback_state', 'rollback_video'].includes(record.kind)) ||
      stateRecords.length > 1 || stateRecords.length + videoRecords.length !== rollbackSession.totalEntries) {
    fail('ROLLBACK_SNAPSHOT_INCOMPLETE', 'The rollback snapshot contains unexpected or duplicate entries.');
  }

  // Hash snapshot bytes during Phase A, including legacy records without a
  // persisted checksum. Phase B repeats the hash under its write lock and
  // compares against this in-memory baseline.
  const phaseASnapshotHashes = new Map();
  for (const item of videoRecords) {
    if (!item.record?.blob) fail('ROLLBACK_SNAPSHOT_CONTENT_INVALID', 'A rollback video snapshot has no readable Blob.');
    const snapshotHash = await sha256BlobHex(item.record.blob, cryptoProvider);
    if (item.record.blobSha256 && snapshotHash !== item.record.blobSha256) {
      fail('ROLLBACK_SNAPSHOT_CONTENT_CHANGED', 'A rollback video snapshot no longer matches its saved SHA-256 checksum.');
    }
    phaseASnapshotHashes.set(item.id, snapshotHash);
  }

  // Fingerprint the first validated snapshot before running caller-supplied
  // async validation. The second read below must match this exact metadata
  // and Blob shape; otherwise a concurrent edit could make us restore stale
  // in-memory metadata while silently accepting a changed stored snapshot.
  const snapshotFingerprint = list => JSON.stringify(list.slice().sort((a, b) =>
    String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0
  ), (key, value) => {
    if (typeof Blob !== 'undefined' && value instanceof Blob) return { __blob: true, size: value.size, type: value.type };
    return value;
  });
  const expectedSnapshotFingerprint = snapshotFingerprint(snapshotRecords);

  let restoredState = null;
  if (stateRecords.length === 1) {
    const stateRecord = stateRecords[0];
    if (!stateRecord.state || typeof stateRecord.state !== 'object' || Array.isArray(stateRecord.state)) {
      fail('ROLLBACK_STATE_INVALID', 'The previous state is invalid.');
    }
    restoredState = cloneState(stateRecord.state);
    const preparedAt = new Date().toISOString();
    restoredState.meta = { ...(restoredState.meta || {}), revisionId: randomId(cryptoProvider), updatedAt: preparedAt };
    restoredState.auditLog = Array.isArray(restoredState.auditLog) ? restoredState.auditLog : [];
    restoredState.auditLog.push({ id: 'archive-rollback-' + backupId, type: 'backup_rollback', at: preparedAt, source: 'full_archive', backupId });
    if (restoredState.auditLog.length > 500) restoredState.auditLog = restoredState.auditLog.slice(-500);
    const validationResult = await validateState(restoredState);
    if (validationResult === false) fail('STATE_VALIDATION_FAILED', 'The application rejected the previous state during rollback.');
  }

  // Re-read and re-hash snapshot media after all caller-supplied async
  // validation. This closes the Phase A validation window without keeping a
  // readwrite transaction alive across Blob I/O.
  const finalSnapshotReadTx = db.transaction(STAGING_STORE, 'readonly');
  const finalSnapshotReadDone = transactionDone(finalSnapshotReadTx);
  const finalSnapshotRows = await requestValue(finalSnapshotReadTx.objectStore(STAGING_STORE).index('sessionId').getAll(rollbackSessionId));
  await finalSnapshotReadDone;
  snapshotRecords = (finalSnapshotRows || []).filter(record => record && record.sessionId === rollbackSessionId);
  if (snapshotRecords.length !== rollbackSession.totalEntries + 1 ||
      snapshotFingerprint(snapshotRecords) !== expectedSnapshotFingerprint) {
    fail('ROLLBACK_SNAPSHOT_CHANGED', 'The rollback snapshot changed during validation. Review it again before retrying.');
  }
  for (const item of snapshotRecords.filter(record => record?.kind === 'rollback_video')) {
    const expectedSnapshotHash = phaseASnapshotHashes.get(item.id);
    if (!item.record?.blob || !expectedSnapshotHash) {
      fail('ROLLBACK_SNAPSHOT_CONTENT_INVALID', 'A rollback video snapshot has no readable, verified Blob.');
    }
    const actualSnapshotHash = await sha256BlobHex(item.record.blob, cryptoProvider);
    if (actualSnapshotHash !== expectedSnapshotHash) {
      fail('ROLLBACK_SNAPSHOT_CONTENT_CHANGED', 'A rollback video snapshot changed after validation. Rollback was cancelled.');
    }
  }

  const restoredVideos = [];
  const seenIds = new Set();
  for (const item of videoRecords) {
    const record = item.record;
    if (!record || typeof record.id !== 'string' || !record.id || seenIds.has(record.id)) {
      fail('ROLLBACK_VIDEO_INVALID', 'The previous video list contains an invalid or duplicate ID.');
    }
    seenIds.add(record.id);
    restoredVideos.push({ ...record, blobSha256: phaseASnapshotHashes.get(item.id) });
  }

  // Recheck the same deterministic snapshot representation again under the
  // final write lock. Blob bytes were SHA-256 checked immediately before it.
  const now = new Date().toISOString();
  const revertedRevisionId = restoredState?.meta?.revisionId || null;

  // Phase B: only IndexedDB requests and synchronous checks/mutations.
  let tx, failure = null, result = null, settled = false, stopKeepAlive = () => {};
  return new Promise((resolve, reject) => {
    const rejectOnce = error => {
      if (!settled) { settled = true; reject(error); }
    };
    const abortWith = error => {
      failure = error;
      stopKeepAlive();
      try { tx.abort(); } catch (abortError) { rejectOnce(error); }
    };
    try {
      tx = db.transaction(['main', 'full_backup', 'entrance_media', STAGING_STORE, HISTORY_STORE], 'readwrite');
      const main = tx.objectStore('main');
      const backup = tx.objectStore('full_backup');
      const media = tx.objectStore('entrance_media');
      const stagingStore = tx.objectStore(STAGING_STORE);
      const historyStore = tx.objectStore(HISTORY_STORE);
      // Snapshot Blob bytes were verified in Phase A outside IndexedDB.
      // Phase B is intentionally synchronous: only IDB request callbacks,
      // metadata checks and mutations run while this write transaction is open.
      const reads = {
        currentState: main.get('state'),
        recognitionLedger: main.get('video_recognition_ledger_v1'),
        currentVideos: media.getAll(),
        history: historyStore.get(backupId),
        rollbackSession: stagingStore.get(rollbackSessionId),
        rollbackRecords: stagingStore.index('sessionId').getAll(rollbackSessionId),
        importSession: stagingStore.get(knownHistory.importSessionId)
      };
      const values = {};
      let pending = Object.keys(reads).length;
      const process = () => {
        try {
          const currentState = values.currentState || null;
          assertLegacyArchiveRecognitionLedger(values.recognitionLedger);
          const history = values.history;
          const currentRollbackSession = values.rollbackSession;
          const currentRecords = values.rollbackRecords || [];
          const currentImportSession = values.importSession;
          // The immutable Blob bytes were SHA-256 verified in Phase A. The
          // snapshot row set and metadata fingerprint are rechecked here under
          // the write lock; no asynchronous work is permitted in this phase.
          for (const item of currentRecords.filter(record => record?.kind === 'rollback_video')) {
            if (!item.record?.blob || !phaseASnapshotHashes.has(item.id)) {
              fail('ROLLBACK_SNAPSHOT_CONTENT_INVALID', 'A rollback video snapshot has no readable, verified Blob.');
            }
          }
          if (!history || history.status !== 'committed' || history.rollbackSessionId !== rollbackSessionId ||
              history.importSessionId !== knownHistory.importSessionId) {
            fail('ROLLBACK_NOT_AVAILABLE', 'The archive import is no longer eligible for rollback.');
          }
          if ((values.currentVideos || []).some(record => !/^[a-f0-9]{64}$/.test(record?.blobSha256 || '')) ||
              typeof history.importedMediaFingerprint !== 'string' ||
              history.importedMediaFingerprint !== knownHistory.importedMediaFingerprint ||
              mediaRecordsFingerprint(values.currentVideos || []) !== history.importedMediaFingerprint) {
            fail('ROLLBACK_MEDIA_CHANGED', 'The entrance video library changed after this archive was imported. Export or preserve the new videos before retrying rollback.');
          }
          if (!currentRollbackSession || currentRollbackSession.kind !== 'rollback_session' ||
              currentRollbackSession.sourceBackupId !== backupId || currentRollbackSession.status !== 'ready' ||
              currentRollbackSession.totalEntries !== rollbackSession.totalEntries ||
              currentRollbackSession.stagedCount !== rollbackSession.stagedCount) {
            fail('ROLLBACK_SNAPSHOT_CHANGED', 'The rollback snapshot changed during validation. Review it again before retrying.');
          }
          if (!currentImportSession || currentImportSession.kind !== 'session' ||
              currentImportSession.status !== 'committed' || currentImportSession.backupId !== backupId) {
            fail('ROLLBACK_IMPORT_SESSION_MISSING', 'The committed import session could not be verified.');
          }
          if (typeof currentImportSession.importedRevisionId !== 'string' || !currentImportSession.importedRevisionId ||
              (currentState?.meta?.revisionId ?? null) !== currentImportSession.importedRevisionId) {
            fail('ROLLBACK_STATE_CHANGED', 'The journal changed after this archive was imported. Rollback was cancelled to preserve newer journal entries.');
          }
          if ((currentState?.meta?.revisionId ?? null) !== expectedRevision) {
            fail('RESTORE_CONFLICT', 'The live database changed during rollback. Refresh the data and review the current state before retrying.');
          }
          if (currentRecords.length !== snapshotRecords.length ||
              snapshotFingerprint(currentRecords) !== expectedSnapshotFingerprint) {
            fail('ROLLBACK_SNAPSHOT_CHANGED', 'The rollback snapshot changed during validation. Review it again before retrying.');
          }

          if (currentState) backup.put({ at: now, state: currentState }, 'previous');
          if (restoredState) main.put(restoredState, 'state');
          else main.delete('state');
          media.clear();
          for (const record of restoredVideos) media.put(record);
          historyStore.put({
            ...history,
            status: 'reverted',
            rollbackSessionId: null,
            rollbackAvailable: false,
            revertedAt: now,
            revertedRevisionId
          });
          for (const record of currentRecords) stagingStore.delete(record.id);
          const revertedImportSession = { ...currentImportSession, sourceBackupId: backupId, status: 'reverted', revertedAt: now };
          delete revertedImportSession.backupId;
          stagingStore.put(revertedImportSession);
          result = {
            state: restoredState,
            backupId,
            rollbackSessionId,
            rollbackSnapshotRemoved: true,
            restoredVideoCount: restoredVideos.length
          };
        } catch (error) {
          abortWith(error);
        }
      };
      for (const [key, request] of Object.entries(reads)) {
        request.onsuccess = () => {
          values[key] = request.result;
          pending--;
          if (pending === 0) process();
        };
        request.onerror = () => abortWith(request.error || new Error('Could not read rollback snapshot or live data.'));
      }
      tx.oncomplete = () => {
        if (!settled) { settled = true; resolve(result); }
      };
      tx.onabort = () => rejectOnce(failure || tx.error || new Error('Atomic archive rollback transaction aborted.'));
      tx.onerror = () => rejectOnce(failure || tx.error || new Error('Atomic archive rollback transaction failed.'));
    } catch (error) {
      rejectOnce(error);
    }
  });
}

function discardArchiveRollbackSnapshot(db, backupId) {
  ensureStores(db);
  return new Promise((resolve, reject) => {
    let tx, failure = null, result = null, settled = false;
    const rejectOnce = error => {
      if (!settled) { settled = true; reject(error); }
    };
    const abortWith = error => {
      failure = error;
      try { tx.abort(); } catch (abortError) { rejectOnce(error); }
    };
    try {
      tx = db.transaction([STAGING_STORE, HISTORY_STORE], 'readwrite');
      const stagingStore = tx.objectStore(STAGING_STORE);
      const historyStore = tx.objectStore(HISTORY_STORE);
      const historyRequest = historyStore.get(backupId);
      historyRequest.onerror = () => abortWith(historyRequest.error || new Error('Could not read archive history.'));
      historyRequest.onsuccess = () => {
        const history = historyRequest.result;
        if (!history || !['committed', 'reverted'].includes(history.status) || !history.rollbackSessionId) {
          abortWith(Object.assign(new Error('There is no retained rollback snapshot for this archive.'), { code: 'ROLLBACK_NOT_AVAILABLE' }));
          return;
        }
        const rollbackSessionId = history.rollbackSessionId;
        const sessionRequest = stagingStore.get(rollbackSessionId);
        const keysRequest = stagingStore.index('sessionId').getAllKeys(rollbackSessionId);
        let pending = 2, session, keys;
        const finish = () => {
          pending--;
          if (pending !== 0) return;
          if (!session || session.kind !== 'rollback_session' || session.sourceBackupId !== backupId ||
              !['ready', 'used'].includes(session.status) || !Array.isArray(keys) ||
              session.stagedCount !== session.totalEntries || keys.length !== session.totalEntries + 1 ||
              !keys.includes(rollbackSessionId)) {
            abortWith(Object.assign(new Error('The rollback snapshot could not be verified and was not deleted.'), { code: 'ROLLBACK_SNAPSHOT_INVALID' }));
            return;
          }
          for (const key of keys) stagingStore.delete(key);
          historyStore.put({
            ...history,
            rollbackSessionId: null,
            rollbackAvailable: false,
            rollbackDiscardedAt: new Date().toISOString()
          });
          if (history.importSessionId) {
            const importRequest = stagingStore.get(history.importSessionId);
            importRequest.onerror = () => abortWith(importRequest.error || new Error('Could not update the import session.'));
            importRequest.onsuccess = () => {
              const importSession = importRequest.result;
              if (importSession && importSession.kind === 'session') {
                const updated = { ...importSession };
                delete updated.rollbackSessionId;
                stagingStore.put(updated);
              }
            };
          }
          result = { backupId, deletedRecords: (keys || []).length };
        };
        sessionRequest.onerror = () => abortWith(sessionRequest.error || new Error('Could not read rollback session.'));
        sessionRequest.onsuccess = () => { session = sessionRequest.result; finish(); };
        keysRequest.onerror = () => abortWith(keysRequest.error || new Error('Could not read rollback records.'));
        keysRequest.onsuccess = () => { keys = keysRequest.result; finish(); };
      };
      tx.oncomplete = () => {
        if (!settled) { settled = true; resolve(result); }
      };
      tx.onabort = () => rejectOnce(failure || tx.error || new Error('Rollback snapshot cleanup transaction aborted.'));
      tx.onerror = () => rejectOnce(failure || tx.error || new Error('Rollback snapshot cleanup transaction failed.'));
    } catch (error) {
      rejectOnce(error);
    }
  });
}
async function listArchiveImportHistory(db) {
  ensureStores(db);
  const tx = db.transaction(HISTORY_STORE, 'readonly');
  const records = await requestValue(tx.objectStore(HISTORY_STORE).getAll());
  await transactionDone(tx);
  return records.sort((a, b) => String(b.importedAt || '').localeCompare(String(a.importedAt || '')));
}

async function listArchiveRestoreSessions(db) {
  ensureStores(db);
  const tx = db.transaction(STAGING_STORE, 'readonly');
  const rows = await requestValue(tx.objectStore(STAGING_STORE).index('kind').getAll('session'));
  await transactionDone(tx);
  return rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
async function readStagedArchive(db, sessionId, cryptoProvider, archiveApi, validateState, allowStaging) {
  ensureStores(db);
  if (!archiveApi || typeof archiveApi.hashBlobChunks !== 'function') fail('ARCHIVE_CODEC_UNAVAILABLE', 'Archive validation module is unavailable.');
  if (typeof validateState !== 'function') fail('STATE_VALIDATOR_REQUIRED', 'The application state validator is required before restore.');
  const tx = db.transaction(STAGING_STORE, 'readonly');
  const store = tx.objectStore(STAGING_STORE);
  const [session, records] = await Promise.all([
    requestValue(store.get(sessionId)),
    requestValue(store.index('sessionId').getAll(sessionId))
  ]);
  await transactionDone(tx);
  if (!session || session.kind !== 'session') fail('STAGING_SESSION_NOT_FOUND', 'Staged import session was not found.');
  if ((session.status !== 'ready' && !(allowStaging && session.status === 'staging')) || session.stagedCount !== session.totalEntries) fail('STAGING_SESSION_INCOMPLETE', 'Staged import is incomplete and cannot be restored.');
  if (!session.manifest || !Array.isArray(session.manifest.entries)) fail('STAGING_MANIFEST_MISSING', 'Staged archive manifest is missing.');
  if (session.manifest.backupId !== session.backupId || session.manifest.schemaVersion !== session.schemaVersion || session.manifest.entries.length !== session.totalEntries) fail('STAGING_MANIFEST_MISMATCH', 'Staged session metadata does not match its manifest.');
  const sessionRecords = records.filter(record => record.kind === 'session');
  const contentRecords = records.filter(record => record.kind !== 'session');
  const manifestStateEntries = session.manifest.entries.filter(entry => entry.kind === 'state');
  const videoEntries = session.manifest.entries.filter(entry => entry.kind === 'entrance_video');
  const manifestVideoIds = videoEntries.map(entry => entry.metadata && entry.metadata.id);
  const manifestVideoPaths = videoEntries.map(entry => entry.path);
  if (sessionRecords.length !== 1 || sessionRecords[0].id !== sessionId ||
      contentRecords.length !== session.totalEntries ||
      contentRecords.some(record => !['state', 'video'].includes(record.kind)) ||
      manifestStateEntries.length !== 1 ||
      manifestStateEntries.length + videoEntries.length !== session.manifest.entries.length ||
      new Set(manifestVideoIds).size !== manifestVideoIds.length ||
      manifestVideoIds.some(id => typeof id !== 'string' || !id) ||
      new Set(manifestVideoPaths).size !== manifestVideoPaths.length) {
    fail('STAGING_ENTRY_SET_INVALID', 'Staged entries do not form the exact set declared by the archive manifest.');
  }
  const currentFingerprint = await manifestFingerprint(session.manifest, cryptoProvider);
  if (currentFingerprint !== session.fingerprint) fail('STAGING_MANIFEST_MISMATCH', 'Staged manifest fingerprint is invalid.');
  if (allowStaging && Number.isSafeInteger(session.stagingEpoch) && session.stagingEpoch >= 0) {
    const revisions = contentRecords.map(record => record.stagingRevision);
    if (new Set(revisions).size !== revisions.length || revisions.some(revision => revision > session.stagingEpoch)) {
      fail('STAGING_FINGERPRINT_REVISION_INVALID', 'Staged entry revisions do not form a unique set within the session epoch.');
    }
  }
  const stateRecords = contentRecords.filter(record => record.kind === 'state');
  const videoRecords = contentRecords.filter(record => record.kind === 'video');
  if (stateRecords.length !== 1 || videoRecords.length !== videoEntries.length) fail('STAGING_CONTENT_MISSING', 'Staged archive content is incomplete.');
  const stateRecord = stateRecords[0];
  if (stateRecord.id !== sessionId + ':state' || !stateRecord.blob) fail('STAGING_ENTRY_SET_INVALID', 'Staged state entry identity is invalid.');
  const stateEntry = manifestStateEntries[0];
  if (!stateEntry || stateRecord.blob.size !== stateEntry.size) fail('STAGING_STATE_SIZE_MISMATCH', 'Staged state size does not match its manifest.');
  const stateHashes = await archiveApi.hashBlobChunks(stateRecord.blob, cryptoProvider);
  if (JSON.stringify(stateHashes) !== JSON.stringify(stateEntry.chunkSha256)) fail('STAGING_CHECKSUM_MISMATCH', 'Staged state checksum does not match its manifest.');
  let wrapper;
  try { wrapper = JSON.parse(await stateRecord.blob.text()); }
  catch (error) { fail('STAGING_STATE_INVALID', 'Staged state JSON is invalid.'); }
  if (!wrapper || wrapper.app !== 'Paseka' || !wrapper.state || typeof wrapper.state !== 'object' || Array.isArray(wrapper.state)) fail('STAGING_STATE_INVALID', 'Staged state wrapper is invalid.');
  const state = wrapper.state;
  if (state.meta?.schemaVersion !== session.schemaVersion) fail('STAGING_SCHEMA_MISMATCH', 'Staged state schema does not match its session.');
  const validationResult = await validateState(state);
  if (validationResult === false) fail('STATE_VALIDATION_FAILED', 'The application rejected the staged state.');
  const hiveIds = new Set(Array.isArray(state.hives) ? state.hives.map(hive => hive && hive.id).filter(id => typeof id === 'string' && id) : []);
  const videos = [];
  const matchedVideoIds = new Set();
  for (const record of videoRecords) {
    if (!record.blob || !record.metadata || record.blob.size !== record.size) fail('STAGING_VIDEO_SIZE_MISMATCH', 'A staged video is missing or has an invalid size.');
    const entry = videoEntries.find(item => item.metadata?.id === record.metadata.id);
    if (!entry || matchedVideoIds.has(entry.metadata.id) ||
        record.id !== sessionId + ':video:' + entry.metadata.id ||
        entry.path !== record.path || entry.size !== record.size ||
        JSON.stringify(record.metadata) !== JSON.stringify(entry.metadata)) {
      fail('STAGING_VIDEO_MANIFEST_MISMATCH', 'A staged video does not map uniquely to its manifest entry.');
    }
    matchedVideoIds.add(entry.metadata.id);
    const hashes = await archiveApi.hashBlobChunks(record.blob, cryptoProvider);
    if (JSON.stringify(hashes) !== JSON.stringify(entry.chunkSha256)) fail('STAGING_CHECKSUM_MISMATCH', 'Staged video checksum does not match its manifest: ' + record.metadata.id);
    videos.push({ ...record, orphanedHiveReference: !hiveIds.has(record.metadata.hiveId) });
  }
  if (matchedVideoIds.size !== videoEntries.length) fail('STAGING_VIDEO_MANIFEST_MISMATCH', 'One or more manifest videos are missing from staging.');
  return {
    session,
    state,
    videos: videos.sort((a, b) => String(a.path) < String(b.path) ? -1 : String(a.path) > String(b.path) ? 1 : 0),
    stagingMetadataFingerprint: stagingMetadataFingerprint(session, records)
  };
}

async function getStagedArchive(db, sessionId, cryptoProvider, archiveApi, validateState) {
  return readStagedArchive(db, sessionId, cryptoProvider, archiveApi, validateState, false);
}

async function finalizeStagedArchive(db, sessionId, cryptoProvider, archiveApi, validateState) {
  // Validate the complete manifest, state and every Blob outside a write transaction.
  // The short transaction below then proves that the verified staging revision
  // is still the exact revision being finalized.
  const staged = await readStagedArchive(db, sessionId, cryptoProvider, archiveApi, validateState, true);
  if (!Number.isSafeInteger(staged.session.stagingEpoch) || staged.session.stagingEpoch < 0) {
    fail('STAGING_LEGACY_SESSION', 'Legacy staging sessions must be imported again.');
  }
  if (!Number.isSafeInteger(staged.session.stagedCount) ||
      !Number.isSafeInteger(staged.session.totalEntries) ||
      staged.session.totalEntries < 1 ||
      staged.session.stagedCount !== staged.session.totalEntries) {
    fail('STAGING_FINALIZE_CHANGED', 'Staging counters are invalid. The session remains unchanged.');
  }
  // Repeated requests are safe: validate the ready archive fully, then return
  // its existing header without opening another write transaction.
  if (staged.session.status !== 'staging' && staged.session.status !== 'ready') {
    fail('STAGING_FINALIZE_NOT_ALLOWED', 'Only an interrupted staging session can be finalized.');
  }
  const verifiedSession = staged.session;
  const verifiedFingerprint = staged.stagingMetadataFingerprint;

  return new Promise((resolve, reject) => {
    let tx, failure = null, result = null, settled = false;
    const rejectOnce = error => {
      if (!settled) { settled = true; reject(error); }
    };
    const abortWith = error => {
      failure = error;
      try { tx.abort(); } catch (abortError) { rejectOnce(error); }
    };
    try {
      tx = db.transaction([STAGING_STORE, 'main'], 'readwrite');
      const store = tx.objectStore(STAGING_STORE);
      const sessionRequest = store.get(sessionId);
      const recordsRequest = store.index('sessionId').getAll(sessionId);
      const ledgerRequest = tx.objectStore('main').get('video_recognition_ledger_v1');
      const values = {};
      let pending = 3;
      const process = () => {
        try {
          assertLegacyArchiveRecognitionLedger(values.recognitionLedger);
          const current = values.session;
          const records = values.records || [];
          if (!current || current.kind !== 'session' || !['staging', 'ready'].includes(current.status) ||
              current.sessionId !== verifiedSession.sessionId ||
              current.backupId !== verifiedSession.backupId ||
              current.fingerprint !== verifiedSession.fingerprint ||
              current.stagingEpoch !== verifiedSession.stagingEpoch ||
              current.stagedCount !== verifiedSession.stagedCount ||
              current.totalEntries !== verifiedSession.totalEntries ||
              current.stagedCount !== current.totalEntries ||
              records.length !== current.totalEntries + 1 ||
              stagingMetadataFingerprint(current, records) !== verifiedFingerprint) {
            fail('STAGING_FINALIZE_CHANGED', 'Staging data changed during verification. The session remains unchanged; verify it again.');
          }
          // Another finalizer may have completed the exact verified revision
          // while this caller was hashing. Treat that concurrent completion as
          // an idempotent success and preserve its original completion time.
          if (current.status === 'ready') {
            result = current;
            return;
          }
          result = {
            ...current,
            status: 'ready',
            completedAt: new Date().toISOString(),
            errorCode: null,
            errorMessage: null
          };
          store.put(result);
        } catch (error) {
          abortWith(error);
        }
      };
      for (const [key, request] of [['session', sessionRequest], ['records', recordsRequest], ['recognitionLedger', ledgerRequest]]) {
        request.onsuccess = () => {
          values[key] = request.result;
          pending--;
          if (pending === 0) process();
        };
        request.onerror = () => abortWith(request.error || new Error('Could not recheck the staging session.'));
      }
      tx.oncomplete = () => {
        if (!settled) { settled = true; resolve(result); }
      };
      tx.onabort = () => rejectOnce(failure || tx.error || new Error('Staging finalization transaction aborted.'));
      tx.onerror = () => rejectOnce(failure || tx.error || new Error('Staging finalization transaction failed.'));
    } catch (error) {
      rejectOnce(error);
    }
  });
}

async function inspectStagingRecognitionCopies(db) {
  ensureStores(db);
  if (!db.objectStoreNames.contains('main')) fail('LIVE_DATABASE_STORES_MISSING', 'Main database is unavailable.');
  const tx = db.transaction(['main', STAGING_STORE, HISTORY_STORE], 'readonly');
  const done = transactionDone(tx);
  const [ledger, sessions, videoKeys, history] = await Promise.all([
    requestValue(tx.objectStore('main').get('video_recognition_ledger_v1')),
    requestValue(tx.objectStore(STAGING_STORE).index('kind').getAll('session')),
    requestValue(tx.objectStore(STAGING_STORE).index('kind').getAllKeys('video')),
    requestValue(tx.objectStore(HISTORY_STORE).getAll())
  ]);
  await done;
  const empty = { sessions: [], matchedCopies: 0, orphanedMatchedCopies: 0, unclassifiedVideoKeyCount: 0 };
  if (ledger == null) return { ok: true, status: 'no_recognition_history', ...empty };
  if (!ledger || typeof ledger !== 'object' || ledger.version !== 1 || !Array.isArray(ledger.entries) ||
      ledger.entries.some(entry => !entry || typeof entry.videoId !== 'string' || !entry.videoId ||
        !['entrance_media', 'record_media'].includes(entry.source) ||
        typeof entry.resultId !== 'string' || !entry.resultId ||
        !['blocked_archive_safety', 'delete_required', 'deleted'].includes(entry.cleanupState))) {
    return { ok: false, reason: 'VIDEO_LEDGER_UNVERIFIED', ...empty };
  }
  const identities = new Set();
  for (const entry of ledger.entries) {
    const id = entry.source + ':' + entry.videoId;
    if (identities.has(id)) return { ok: false, reason: 'VIDEO_LEDGER_DUPLICATE_IDENTITY', ...empty };
    identities.add(id);
  }
  const recognized = new Set(ledger.entries
    .filter(entry => entry.source === 'entrance_media')
    .map(entry => entry.videoId));
  const tombstoned = new Set(ledger.entries
    .filter(entry => entry.source === 'entrance_media' && entry.cleanupState === 'deleted')
    .map(entry => entry.videoId));
  const references = new Set();
  for (const entry of history || []) {
    if (entry && typeof entry.importSessionId === 'string') references.add(entry.importSessionId);
    if (entry && typeof entry.rollbackSessionId === 'string') references.add(entry.rollbackSessionId);
  }
  const headers = new Map();
  for (const session of sessions || []) {
    if (session && session.kind === 'session' && typeof session.sessionId === 'string' && session.sessionId) {
      headers.set(session.sessionId, session);
    }
  }
  // Enumerate primary keys only; reading video Blob objects would duplicate
  // large payloads in memory. Include orphaned staging rows without headers.
  const bySession = new Map();
  let unclassifiedVideoKeyCount = 0;
  for (const key of videoKeys || []) {
    if (typeof key !== 'string') { unclassifiedVideoKeyCount++; continue; }
    const delimiter = key.indexOf(':video:');
    if (delimiter <= 0 || delimiter + 7 >= key.length) { unclassifiedVideoKeyCount++; continue; }
    const sessionId = key.slice(0, delimiter);
    const videoId = key.slice(delimiter + 7);
    if (!bySession.has(sessionId)) bySession.set(sessionId, []);
    bySession.get(sessionId).push(videoId);
  }
  const conflicts = [];
  let matchedCopies = 0, orphanedMatchedCopies = 0;
  for (const [sessionId, copies] of bySession) {
    const matches = copies.filter(id => recognized.has(id));
    if (!matches.length) continue;
    const header = headers.get(sessionId);
    matchedCopies += matches.length;
    if (!header) orphanedMatchedCopies += matches.length;
    conflicts.push({
      sessionId,
      status: header ? header.status : 'orphaned_header',
      missingSessionHeader: !header,
      videoCopyCount: copies.length,
      recognizedCopies: matches.length,
      tombstonedCopies: matches.filter(id => tombstoned.has(id)).length,
      protectedByArchiveHistory: references.has(sessionId),
      identityVerifiedByBytes: false,
      action: 'manual_review_required'
    });
  }
  return {
    ok: true,
    status: conflicts.length ? 'staged_recognition_copies_detected' : 'no_staged_recognition_copies',
    sessions: conflicts, matchedCopies, orphanedMatchedCopies, unclassifiedVideoKeyCount,
    requiresManualReview: conflicts.length > 0 || unclassifiedVideoKeyCount > 0
  };
}

function discardArchiveRestoreSession(db, sessionId) {
  ensureStores(db);
  if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 200) {
    fail('STAGING_SESSION_INVALID', 'A non-empty, bounded staging session ID is required for cleanup.');
  }
  return new Promise((resolve, reject) => {
    let tx, failure = null, result = false, settled = false;
    const rejectOnce = error => {
      if (!settled) { settled = true; reject(error); }
    };
    const abortWith = error => {
      failure = error;
      try { tx.abort(); } catch (abortError) { rejectOnce(error); }
    };
    try {
      // Validate ownership and delete under one write lock. If the session
      // header was lost, only unreferenced orphan rows may be removed.
      tx = db.transaction([STAGING_STORE, HISTORY_STORE], 'readwrite');
      const store = tx.objectStore(STAGING_STORE);
      const sessionRequest = store.get(sessionId);
      sessionRequest.onerror = () => abortWith(sessionRequest.error || new Error('Could not read the staged import session.'));
      sessionRequest.onsuccess = () => {
        const session = sessionRequest.result;
        if (session?.kind === 'rollback_session') {
          abortWith(Object.assign(new Error('A rollback snapshot cannot be deleted through the staging cleanup action.'), { code: 'ROLLBACK_SNAPSHOT_PROTECTED' }));
          return;
        }
        if (session && (session.kind !== 'session' || session.sessionId !== sessionId ||
            typeof session.backupId !== 'string' || !session.backupId)) {
          abortWith(Object.assign(new Error('The staging session header identity is invalid; records were preserved.'), { code: 'STAGING_SESSION_INVALID' }));
          return;
        }
        if (session?.kind === 'session' && session.status === 'committed') {
          abortWith(Object.assign(new Error('A committed import is protected until its rollback is explicitly resolved.'), { code: 'COMMITTED_IMPORT_PROTECTED' }));
          return;
        }
        if (session?.kind === 'session' &&
            !['staging', 'ready', 'failed', 'reverted'].includes(session.status)) {
          abortWith(Object.assign(new Error('The staging session status is invalid; staged records were preserved.'), { code: 'STAGING_SESSION_INVALID' }));
          return;
        }
        const keysRequest = store.index('sessionId').getAllKeys(sessionId);
        keysRequest.onerror = () => abortWith(keysRequest.error || new Error('Could not list staged import records.'));
        keysRequest.onsuccess = () => {
          const keys = keysRequest.result || [];
          // Repeated cleanup with no remaining rows is a harmless no-op, even
          // when historical records still name this already-discarded session.
          if (!keys.length) { result = false; return; }
          // Never delete a rollback row, unknown entry type, or a key outside
          // this exact session even if its indexed sessionId was corrupted.
          const validKey = key => typeof key === 'string' &&
            (key === sessionId || key === sessionId + ':state' || key.startsWith(sessionId + ':video:'));
          if (keys.some(key => !validKey(key))) {
            abortWith(Object.assign(new Error('Unexpected staged record key; cleanup was cancelled.'), { code: 'STAGING_CLEANUP_KEYS_INVALID' }));
            return;
          }
          // Read only secondary-index keys, never Blob values. A record with
          // an unexpected kind must not be discarded just because its indexed
          // sessionId or primary-key prefix looks like staging content.
          const kinds = new Map();
          let index;
          try { index = store.index('kind'); }
          catch (error) {
            abortWith(Object.assign(new Error('Staged record-kind index is unavailable; cleanup was cancelled.'), {
              code: 'STAGING_CLEANUP_INDEX_MISSING'
            }));
            return;
          }
          let kindsPending = 3;
          for (const kind of ['session', 'state', 'video']) {
            const kindRequest = index.getAllKeys(kind);
            kindRequest.onerror = () => abortWith(kindRequest.error || new Error('Could not verify staged record kinds.'));
            kindRequest.onsuccess = () => {
              for (const key of kindRequest.result || []) kinds.set(key, kind);
              if (--kindsPending === 0) verifyHistory();
            };
          }
          const verifyHistory = () => {
            const invalid = keys.some(key => kinds.get(key) !== (
              key === sessionId ? 'session' : key === sessionId + ':state' ? 'state' : 'video'
            ));
            if (invalid) {
              abortWith(Object.assign(new Error('Staged record kind or ownership is invalid; records were preserved.'), {
                code: 'STAGING_CLEANUP_KIND_INVALID'
              }));
              return;
            }
            // Check archive_history even when a session header exists. Its
            // status can be corrupted independently of import references.
            const historyRequest = tx.objectStore(HISTORY_STORE).getAll();
            historyRequest.onerror = () => abortWith(historyRequest.error || new Error('Could not verify archive history references.'));
            historyRequest.onsuccess = () => {
            const references = (historyRequest.result || []).filter(item => item &&
              (item.importSessionId === sessionId || item.rollbackSessionId === sessionId));
            const protectedReference = references.some(item => {
              // Reverted imports may discard their now-unneeded import staging,
              // but only after rollback has been explicitly marked complete.
              return !session || session.status !== 'reverted' ||
                item.importSessionId !== sessionId ||
                item.rollbackSessionId === sessionId ||
                item.status !== 'reverted' || item.rollbackAvailable !== false ||
                item.backupId !== session.backupId;
            });
            if (protectedReference) {
              abortWith(Object.assign(new Error('Staged records are referenced by archive history and were preserved.'), {
                code: session ? 'STAGING_HISTORY_REFERENCED' : 'ORPHANED_STAGING_REFERENCED'
              }));
              return;
            }
              for (const key of keys) store.delete(key);
              result = keys.length > 0;
            };
          };
        };
      };
      tx.oncomplete = () => {
        if (!settled) { settled = true; resolve(result); }
      };
      tx.onabort = () => rejectOnce(failure || tx.error || new Error('Staged import cleanup transaction aborted.'));
      tx.onerror = () => rejectOnce(failure || tx.error || new Error('Staged import cleanup transaction failed.'));
    } catch (error) {
      rejectOnce(error);
    }
  });
}

root.PasekaArchiveRestore = Object.freeze({
  STAGING_STORE, HISTORY_STORE,
  stageArchiveForRestore, commitStagedArchive, rollbackCommittedArchive, discardArchiveRollbackSnapshot, listArchiveRestoreSessions, listArchiveImportHistory,
  getStagedArchive, finalizeStagedArchive, inspectStagingRecognitionCopies, discardArchiveRestoreSession
});
})(typeof window !== 'undefined' ? window : globalThis);
