(function (root) {
'use strict';

const STAGING_STORE = 'archive_staging';
const HISTORY_STORE = 'archive_history';

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  throw error;
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
async function putStagingRecord(db, record) {
  const tx = db.transaction(STAGING_STORE, 'readwrite');
  tx.objectStore(STAGING_STORE).put(record);
  await transactionDone(tx);
}
async function updateSession(db, session) {
  await putStagingRecord(db, session);
}
async function putStagingEntryAndUpdateSession(db, record, session) {
  const tx = db.transaction(STAGING_STORE, 'readwrite');
  const store = tx.objectStore(STAGING_STORE);
  let nextSession = null;
  let failure = null;
  const sessionRequest = store.get(session.sessionId || session.id);
  sessionRequest.onerror = () => {
    failure = sessionRequest.error || new Error('Could not read the staging session.');
    try { tx.abort(); } catch (error) {}
  };
  sessionRequest.onsuccess = () => {
    const currentSession = sessionRequest.result;
    if (!currentSession || currentSession.kind !== 'session' ||
        !['staging', 'ready'].includes(currentSession.status)) {
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
async function stageArchiveForRestore(db, archiveBlob, cryptoProvider, archiveApi, validateState, options = {}) {
  ensureStores(db);
  if (!archiveApi || typeof archiveApi.validateArchiveForRestore !== 'function') fail('ARCHIVE_CODEC_UNAVAILABLE', 'Archive validation module is unavailable.');
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
    // Capture the live video baseline and create the staging session under one
    // IndexedDB write lock. Any later video add/delete makes commit refuse to
    // clear the library instead of silently losing work created during staging.
    const baselineTx = db.transaction([STAGING_STORE, 'entrance_media'], 'readwrite');
    const baselineStore = baselineTx.objectStore('entrance_media');
    const baselineRequest = baselineStore.getAll();
    baselineRequest.onsuccess = () => {
      try {
        session.baselineMediaFingerprint = mediaRecordsFingerprint(baselineRequest.result || []);
        baselineTx.objectStore(STAGING_STORE).add(session);
      } catch (error) {
        try { baselineTx.abort(); } catch (ignored) {}
      }
    };
    await transactionDone(baselineTx);
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
        session.errorCode = String(error && error.code || 'STAGING_FAILED').slice(0, 80);
        session.errorMessage = String(error && error.message || 'Staging failed').slice(0, 500);
        await updateSession(db, session);
      } catch (ignored) {}
    }
    throw error;
  }
}
function holdTransactionOpen(tx, store) {
  let active = true;
  const pulse = () => {
    if (!active) return;
    let request;
    try { request = store.get('__paseka_archive_tx_keepalive__'); }
    catch (error) { active = false; return; }
    request.onsuccess = request.onerror = () => { if (active) pulse(); };
  };
  pulse();
  return () => { active = false; };
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
  if (!blob || typeof blob.arrayBuffer !== 'function' || !cryptoProvider?.subtle?.digest) {
    fail('MEDIA_HASH_UNAVAILABLE', 'The video bytes cannot be hashed safely on this device.');
  }
  const digest = await cryptoProvider.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
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
          const currentVideos = Array.isArray(values.currentVideos) ? values.currentVideos : [];
          const session = values.session;
          const records = values.stagedRecords || [];
          if (!session || session.kind !== 'session' || session.status !== 'ready' || session.stagedCount !== session.totalEntries) {
            fail('STAGING_SESSION_INCOMPLETE', 'Staged import is not ready for commit.');
          }
          if (values.history && values.history.status !== 'reverted') fail('ALREADY_IMPORTED', 'This archive has already been imported.');
          if (values.history && values.history.fingerprint !== session.fingerprint) fail('BACKUP_ID_COLLISION', 'This backup ID was already imported with different content.');
          if (!Number.isSafeInteger(session.stagingEpoch) || session.stagingEpoch < 0) fail('STAGING_LEGACY_SESSION', 'This staged import predates revision tracking. Discard it and import the archive again.');
          if (session.backupId !== staged.session.backupId || session.fingerprint !== staged.session.fingerprint) fail('STAGING_SESSION_CHANGED', 'Staged import session changed during restore.');
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
          if (typeof session.baselineMediaFingerprint !== 'string' ||
              mediaRecordsFingerprint(currentVideos) !== session.baselineMediaFingerprint) {
            fail('RESTORE_MEDIA_CHANGED', 'The video library changed while the archive was being prepared. The import was cancelled to preserve newer videos. Start the import again after reviewing the video library.');
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
  const readTx = db.transaction([STAGING_STORE, 'entrance_media'], 'readonly');
  const readStore = readTx.objectStore(STAGING_STORE);
  const [rollbackSession, records, importSession, phaseAMedia] = await Promise.all([
    requestValue(readStore.get(rollbackSessionId)),
    requestValue(readStore.index('sessionId').getAll(rollbackSessionId)),
    requestValue(readStore.get(knownHistory.importSessionId)),
    requestValue(readTx.objectStore('entrance_media').getAll())
  ]);
  await transactionDone(readTx);

  if (!rollbackSession || rollbackSession.kind !== 'rollback_session' || rollbackSession.status !== 'ready') {
    fail('ROLLBACK_SNAPSHOT_MISSING', 'The previous state and media rollback snapshot is unavailable.');
  }
  if (!importSession || importSession.kind !== 'session' || importSession.status !== 'committed' || importSession.backupId !== backupId) {
    fail('ROLLBACK_IMPORT_SESSION_MISSING', 'The committed import session could not be verified.');
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
  const snapshotRecords = (records || []).filter(record => record && record.sessionId === rollbackSessionId);
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

  const restoredVideos = [];
  const seenIds = new Set();
  for (const item of videoRecords) {
    const record = item.record;
    if (!record || typeof record.id !== 'string' || !record.id || seenIds.has(record.id)) {
      fail('ROLLBACK_VIDEO_INVALID', 'The previous video list contains an invalid or duplicate ID.');
    }
    seenIds.add(record.id);
    restoredVideos.push(record);
  }

  // Recheck a deterministic representation in Phase B. Blob bytes are not
  // re-hashed here; all snapshot mutations must use the atomic restore path.
  const snapshotFingerprint = list => JSON.stringify(list.slice().sort((a, b) =>
    String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0
  ), (key, value) => {
    if (typeof Blob !== 'undefined' && value instanceof Blob) return { __blob: true, size: value.size, type: value.type };
    return value;
  });
  const expectedSnapshotFingerprint = snapshotFingerprint(snapshotRecords);
  const now = new Date().toISOString();
  const revertedRevisionId = restoredState?.meta?.revisionId || null;

  // Phase B: only IndexedDB requests and synchronous checks/mutations.
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
          const history = values.history;
          const currentRollbackSession = values.rollbackSession;
          const currentRecords = values.rollbackRecords || [];
          const currentImportSession = values.importSession;
          if (!history || history.status !== 'committed' || history.rollbackSessionId !== rollbackSessionId ||
              history.importSessionId !== knownHistory.importSessionId) {
            fail('ROLLBACK_NOT_AVAILABLE', 'The archive import is no longer eligible for rollback.');
          }
          if ((currentState?.meta?.revisionId || null) !== expectedRevision) {
            fail('RESTORE_CONFLICT', 'The live database changed after the import. Rollback was cancelled to avoid overwriting newer work.');
          }
          if ((values.currentVideos || []).some(record => !/^[a-f0-9]{64}$/.test(record?.blobSha256 || '')) ||
              typeof history.importedMediaFingerprint !== 'string' ||
              history.importedMediaFingerprint !== knownHistory.importedMediaFingerprint ||
              mediaRecordsFingerprint(values.currentVideos || []) !== history.importedMediaFingerprint) {
            fail('ROLLBACK_MEDIA_CHANGED', 'The entrance video library changed after this archive was imported. Export or preserve the new videos before retrying rollback.');
          }
          if (!currentRollbackSession || currentRollbackSession.kind !== 'rollback_session' ||
              currentRollbackSession.status !== 'ready' ||
              currentRollbackSession.totalEntries !== rollbackSession.totalEntries ||
              currentRollbackSession.stagedCount !== rollbackSession.stagedCount) {
            fail('ROLLBACK_SNAPSHOT_CHANGED', 'The rollback snapshot changed during validation. Review it again before retrying.');
          }
          if (!currentImportSession || currentImportSession.kind !== 'session' ||
              currentImportSession.status !== 'committed' || currentImportSession.backupId !== backupId) {
            fail('ROLLBACK_IMPORT_SESSION_MISSING', 'The committed import session could not be verified.');
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
async function getStagedArchive(db, sessionId, cryptoProvider, archiveApi, validateState) {
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
  if (session.status !== 'ready' || session.stagedCount !== session.totalEntries) fail('STAGING_SESSION_INCOMPLETE', 'Staged import is incomplete and cannot be restored.');
  if (!session.manifest || !Array.isArray(session.manifest.entries)) fail('STAGING_MANIFEST_MISSING', 'Staged archive manifest is missing.');
  if (session.manifest.backupId !== session.backupId || session.manifest.schemaVersion !== session.schemaVersion || session.manifest.entries.length !== session.totalEntries) fail('STAGING_MANIFEST_MISMATCH', 'Staged session metadata does not match its manifest.');
  const currentFingerprint = await manifestFingerprint(session.manifest, cryptoProvider);
  if (currentFingerprint !== session.fingerprint) fail('STAGING_MANIFEST_MISMATCH', 'Staged manifest fingerprint is invalid.');
  const stateRecord = records.find(record => record.kind === 'state');
  const videoRecords = records.filter(record => record.kind === 'video');
  if (!stateRecord || !stateRecord.blob || videoRecords.length + 1 !== session.totalEntries) fail('STAGING_CONTENT_MISSING', 'Staged archive content is incomplete.');
  const stateEntry = session.manifest.entries.find(entry => entry.kind === 'state');
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
  const videoEntries = session.manifest.entries.filter(entry => entry.kind === 'entrance_video');
  if (videoEntries.length !== videoRecords.length) fail('STAGING_CONTENT_MISSING', 'Staged video count does not match its manifest.');
  const hiveIds = new Set(Array.isArray(state.hives) ? state.hives.map(hive => hive && hive.id).filter(id => typeof id === 'string' && id) : []);
  const videos = [];
  for (const record of videoRecords) {
    if (!record.blob || !record.metadata || record.blob.size !== record.size) fail('STAGING_VIDEO_SIZE_MISMATCH', 'A staged video is missing or has an invalid size.');
    const entry = videoEntries.find(item => item.metadata?.id === record.metadata.id);
    if (!entry || entry.path !== record.path || entry.size !== record.size || JSON.stringify(record.metadata) !== JSON.stringify(entry.metadata)) fail('STAGING_VIDEO_MANIFEST_MISMATCH', 'A staged video does not match its manifest entry.');
    const hashes = await archiveApi.hashBlobChunks(record.blob, cryptoProvider);
    if (JSON.stringify(hashes) !== JSON.stringify(entry.chunkSha256)) fail('STAGING_CHECKSUM_MISMATCH', 'Staged video checksum does not match its manifest: ' + record.metadata.id);
    videos.push({ ...record, orphanedHiveReference: !hiveIds.has(record.metadata.hiveId) });
  }
  return {
    session,
    state,
    videos: videos.sort((a, b) => String(a.path) < String(b.path) ? -1 : String(a.path) > String(b.path) ? 1 : 0),
    stagingMetadataFingerprint: stagingMetadataFingerprint(session, records)
  };
}
function discardArchiveRestoreSession(db, sessionId) {
  ensureStores(db);
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
      // Read, validate and delete under one readwrite lock. A concurrent commit
      // must either finish first (and be protected) or observe the cleanup.
      tx = db.transaction(STAGING_STORE, 'readwrite');
      const store = tx.objectStore(STAGING_STORE);
      const sessionRequest = store.get(sessionId);
      sessionRequest.onerror = () => abortWith(sessionRequest.error || new Error('Could not read the staged import session.'));
      sessionRequest.onsuccess = () => {
        const session = sessionRequest.result;
        if (!session) { result = false; return; }
        if (session.kind === 'rollback_session') {
          abortWith(Object.assign(new Error('A rollback snapshot cannot be deleted through the staging cleanup action.'), { code: 'ROLLBACK_SNAPSHOT_PROTECTED' }));
          return;
        }
        if (session.kind === 'session' && session.status === 'committed') {
          abortWith(Object.assign(new Error('A committed import is protected until its rollback is explicitly resolved.'), { code: 'COMMITTED_IMPORT_PROTECTED' }));
          return;
        }
        const keysRequest = store.index('sessionId').getAllKeys(sessionId);
        keysRequest.onerror = () => abortWith(keysRequest.error || new Error('Could not list staged import records.'));
        keysRequest.onsuccess = () => {
          const keys = keysRequest.result || [];
          for (const key of keys) store.delete(key);
          result = keys.length > 0;
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
  getStagedArchive, discardArchiveRestoreSession
});
})(typeof window !== 'undefined' ? window : globalThis);
