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
    orphanVideoIds: checked.orphanVideoIds.slice(),
    status: 'staging',
    errorCode: null,
    errorMessage: null
  };
  let sessionCreated = false;
  try {
    await putStagingRecord(db, session);
    sessionCreated = true;
    await putStagingRecord(db, { id: sessionId + ':state', sessionId, kind: 'state', blob: checked.stateBlob });
    session.stagedCount = 1;
    await updateSession(db, session);
    for (const item of checked.videoEntries) {
      await putStagingRecord(db, {
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
      });
      session.stagedCount++;
      await updateSession(db, session);
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
async function commitStagedArchive(db, sessionId, expectedRevision, cryptoProvider, archiveApi, validateState) {
  ensureStores(db);
  if (!db.objectStoreNames.contains('main') || !db.objectStoreNames.contains('full_backup') || !db.objectStoreNames.contains('entrance_media')) {
    fail('LIVE_DATABASE_STORES_MISSING', 'The live Paseka database stores are unavailable.');
  }
  if (expectedRevision === undefined) fail('EXPECTED_REVISION_REQUIRED', 'The current database revision is required before restore.');
  const staged = await getStagedArchive(db, sessionId, cryptoProvider, archiveApi, validateState);
  const rollbackSessionId = randomId(cryptoProvider);
  const now = new Date().toISOString();
  let tx, stopKeepAlive = null, failure = null, result = null, settled = false;
  return new Promise((resolve, reject) => {
    const rejectOnce = error => {
      if (!settled) { settled = true; reject(error); }
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
      const abortWith = error => {
        failure = error;
        try { tx.abort(); } catch (abortError) { rejectOnce(error); }
      };
      const process = () => {
        stopKeepAlive = holdTransactionOpen(tx, stagingStore);
        (async () => {
          try {
            const currentState = values.currentState || null;
            const currentVideos = Array.isArray(values.currentVideos) ? values.currentVideos : [];
            const session = values.session;
            const records = values.stagedRecords || [];
            if (values.history && values.history.status !== 'reverted') fail('ALREADY_IMPORTED', 'This archive has already been imported.');
            if (values.history && values.history.fingerprint !== session.fingerprint) fail('BACKUP_ID_COLLISION', 'This backup ID was already imported with different content.');
            if (!session || session.kind !== 'session' || session.status !== 'ready' || session.stagedCount !== session.totalEntries) fail('STAGING_SESSION_INCOMPLETE', 'Staged import is not ready for commit.');
            if (session.backupId !== staged.session.backupId || session.fingerprint !== staged.session.fingerprint) fail('STAGING_SESSION_CHANGED', 'Staged import session changed during restore.');
            if ((currentState?.meta?.revisionId || null) !== expectedRevision) fail('RESTORE_CONFLICT', 'The live database changed after the restore preview. Refresh the data and review the archive again.');
            if (!session.manifest || !Array.isArray(session.manifest.entries) || session.manifest.entries.length !== session.totalEntries) fail('STAGING_MANIFEST_MISMATCH', 'Staged manifest is invalid.');
            if (await manifestFingerprint(session.manifest, cryptoProvider) !== session.fingerprint) fail('STAGING_MANIFEST_MISMATCH', 'Staged manifest fingerprint is invalid.');
            if (records.length !== session.totalEntries + 1) fail('STAGING_CONTENT_MISSING', 'Staged entry count does not match the session.');
            const stateRecords = records.filter(record => record.kind === 'state');
            const videoRecords = records.filter(record => record.kind === 'video');
            if (stateRecords.length !== 1) fail('STAGING_CONTENT_MISSING', 'Staged archive must contain exactly one state entry.');
            const stateRecord = stateRecords[0];
            const stateEntry = session.manifest.entries.find(entry => entry.kind === 'state');
            if (!stateRecord?.blob || !stateEntry || stateRecord.blob.size !== stateEntry.size) fail('STAGING_STATE_SIZE_MISMATCH', 'Staged state size does not match its manifest.');
            if (JSON.stringify(await archiveApi.hashBlobChunks(stateRecord.blob, cryptoProvider)) !== JSON.stringify(stateEntry.chunkSha256)) fail('STAGING_CHECKSUM_MISMATCH', 'Staged state checksum does not match its manifest.');
            let wrapper;
            try { wrapper = JSON.parse(await stateRecord.blob.text()); }
            catch (error) { fail('STAGING_STATE_INVALID', 'Staged state JSON is invalid.'); }
            if (!wrapper || wrapper.app !== 'Paseka' || !wrapper.state || typeof wrapper.state !== 'object' || Array.isArray(wrapper.state)) fail('STAGING_STATE_INVALID', 'Staged state wrapper is invalid.');
            const state = cloneState(wrapper.state);
            if (state.meta?.schemaVersion !== session.schemaVersion) fail('STAGING_SCHEMA_MISMATCH', 'Staged state schema does not match its session.');
            const manifestVideos = session.manifest.entries.filter(entry => entry.kind === 'entrance_video');
            if (manifestVideos.length !== videoRecords.length) fail('STAGING_CONTENT_MISSING', 'Staged video count does not match its manifest.');
            if (records.length !== stateRecords.length + videoRecords.length + 1) fail('STAGING_CONTENT_MISSING', 'Staged archive contains unexpected records.');
            for (const record of videoRecords) {
              const entry = manifestVideos.find(item => item.metadata?.id === record.metadata?.id);
              if (!record.blob || !record.metadata || !entry || entry.path !== record.path || entry.size !== record.size || record.blob.size !== record.size || JSON.stringify(record.metadata) !== JSON.stringify(entry.metadata)) {
                fail('STAGING_VIDEO_MANIFEST_MISMATCH', 'A staged video does not match its manifest entry.');
              }
              if (JSON.stringify(await archiveApi.hashBlobChunks(record.blob, cryptoProvider)) !== JSON.stringify(entry.chunkSha256)) {
                fail('STAGING_CHECKSUM_MISMATCH', 'Staged video checksum does not match its manifest: ' + record.metadata.id);
              }
            }
            state.meta = { ...(state.meta || {}), revisionId: randomId(cryptoProvider), updatedAt: now };
            state.auditLog = Array.isArray(state.auditLog) ? state.auditLog : [];
            state.auditLog.push({ id: 'archive-import-' + sessionId, type: 'backup_restored', at: now, source: 'full_archive', backupId: session.backupId });
            if (state.auditLog.length > 500) state.auditLog = state.auditLog.slice(-500);
            const validationResult = await validateState(state);
            if (validationResult === false) fail('STATE_VALIDATION_FAILED', 'The application rejected the staged state before commit.');

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
            stopKeepAlive?.();
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
            main.put(state, 'state');
            media.clear();
            for (const record of videoRecords) media.put({ ...record.metadata, blob: record.blob });
            const historyRecord = {
              backupId: session.backupId,
              fingerprint: session.fingerprint,
              importedAt: now,
              status: 'committed',
              schemaVersion: session.schemaVersion,
              archiveBytes: session.archiveBytes,
              rollbackSessionId,
              importSessionId: sessionId
            };
            historyStore.put(historyRecord);
            stagingStore.put({ ...session, status: 'committed', committedAt: now, importedRevisionId: state.meta.revisionId, rollbackSessionId });
            result = { state, history: historyRecord, rollbackSessionId, previousVideoCount: currentVideos.length };
          } catch (error) {
            stopKeepAlive?.();
            abortWith(error);
          }
        })();
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
      stopKeepAlive?.();
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
  const knownHistory = await getHistory(db, backupId);
  if (!knownHistory || knownHistory.status !== 'committed' || !knownHistory.rollbackSessionId || !knownHistory.importSessionId) {
    fail('ROLLBACK_NOT_AVAILABLE', 'There is no committed archive import with an available rollback snapshot.');
  }
  const rollbackSessionId = knownHistory.rollbackSessionId;
  const now = new Date().toISOString();
  let tx, stopKeepAlive = null, failure = null, result = null, settled = false;
  return new Promise((resolve, reject) => {
    const rejectOnce = error => {
      if (!settled) { settled = true; reject(error); }
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
        history: historyStore.get(backupId),
        rollbackSession: stagingStore.get(rollbackSessionId),
        rollbackRecords: stagingStore.index('sessionId').getAll(rollbackSessionId),
        importSession: stagingStore.get(knownHistory.importSessionId)
      };
      const values = {};
      let pending = Object.keys(reads).length;
      const abortWith = error => {
        failure = error;
        try { tx.abort(); } catch (abortError) { rejectOnce(error); }
      };
      const process = () => {
        stopKeepAlive = holdTransactionOpen(tx, stagingStore);
        (async () => {
          try {
            const currentState = values.currentState || null;
            const history = values.history;
            const rollbackSession = values.rollbackSession;
            const records = values.rollbackRecords || [];
            const importSession = values.importSession;
            if (!history || history.status !== 'committed' || history.rollbackSessionId !== rollbackSessionId) fail('ROLLBACK_NOT_AVAILABLE', 'The archive import is no longer eligible for rollback.');
            if ((currentState?.meta?.revisionId || null) !== expectedRevision) fail('RESTORE_CONFLICT', 'The live database changed after the import. Rollback was cancelled to avoid overwriting newer work.');
            if (!rollbackSession || rollbackSession.kind !== 'rollback_session' || rollbackSession.status !== 'ready') fail('ROLLBACK_SNAPSHOT_MISSING', 'The previous state and media rollback snapshot is unavailable.');
            if (!importSession || importSession.kind !== 'session' || importSession.status !== 'committed' || importSession.backupId !== backupId) fail('ROLLBACK_IMPORT_SESSION_MISSING', 'The committed import session could not be verified.');
            if (records.length !== rollbackSession.totalEntries + 1 || rollbackSession.stagedCount !== rollbackSession.totalEntries) fail('ROLLBACK_SNAPSHOT_INCOMPLETE', 'The rollback snapshot is incomplete.');
            const stateRecords = records.filter(record => record.kind === 'rollback_state');
            const videoRecords = records.filter(record => record.kind === 'rollback_video');
            if (stateRecords.length !== 1 || videoRecords.length + 1 !== rollbackSession.totalEntries) fail('ROLLBACK_SNAPSHOT_INCOMPLETE', 'The rollback snapshot does not contain the expected state and videos.');
            const stateRecord = stateRecords[0];
            if (!stateRecord.state || typeof stateRecord.state !== 'object') fail('ROLLBACK_STATE_INVALID', 'The previous state is invalid.');
            const state = cloneState(stateRecord.state);
            state.meta = { ...(state.meta || {}), revisionId: randomId(cryptoProvider), updatedAt: now };
            state.auditLog = Array.isArray(state.auditLog) ? state.auditLog : [];
            state.auditLog.push({ id: 'archive-rollback-' + backupId, type: 'backup_rollback', at: now, source: 'full_archive', backupId });
            if (state.auditLog.length > 500) state.auditLog = state.auditLog.slice(-500);
            const validationResult = await validateState(state);
            if (validationResult === false) fail('STATE_VALIDATION_FAILED', 'The application rejected the previous state during rollback.');
            const restoredVideos = [];
            const seenIds = new Set();
            for (const item of videoRecords) {
              const record = item.record;
              if (!record || typeof record.id !== 'string' || !record.id || seenIds.has(record.id)) fail('ROLLBACK_VIDEO_INVALID', 'The previous video list contains an invalid or duplicate ID.');
              seenIds.add(record.id);
              restoredVideos.push(record);
            }
            stopKeepAlive?.();
            backup.put({ at: now, state: currentState }, 'previous');
            main.put(state, 'state');
            media.clear();
            for (const record of restoredVideos) media.put(record);
            historyStore.put({ ...history, status: 'reverted', revertedAt: now, revertedRevisionId: state.meta.revisionId });
            stagingStore.put({ ...rollbackSession, status: 'used', usedAt: now });
            stagingStore.put({ ...importSession, backupId: undefined, sourceBackupId: backupId, status: 'reverted', revertedAt: now });
            result = { state, backupId, rollbackSessionId, restoredVideoCount: restoredVideos.length };
          } catch (error) {
            stopKeepAlive?.();
            abortWith(error);
          }
        })();
      };
      for (const [key, request] of Object.entries(reads)) {
        request.onsuccess = () => {
          values[key] = request.result;
          pending--;
          if (pending === 0) process();
        };
        request.onerror = () => abortWith(request.error || new Error('Could not read rollback snapshot.'));
      }
      tx.oncomplete = () => {
        if (!settled) { settled = true; resolve(result); }
      };
      tx.onabort = () => rejectOnce(failure || tx.error || new Error('Atomic archive rollback transaction aborted.'));
      tx.onerror = () => rejectOnce(failure || tx.error || new Error('Atomic archive rollback transaction failed.'));
    } catch (error) {
      stopKeepAlive?.();
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
  return { session, state, videos: videos.sort((a, b) => String(a.path).localeCompare(String(b.path))) };
}
async function discardArchiveRestoreSession(db, sessionId) {
  ensureStores(db);
  const checkTx = db.transaction(STAGING_STORE, 'readonly');
  const session = await requestValue(checkTx.objectStore(STAGING_STORE).get(sessionId));
  await transactionDone(checkTx);
  if (!session) return false;
  if (session.kind === 'rollback_session') fail('ROLLBACK_SNAPSHOT_PROTECTED', 'A rollback snapshot cannot be deleted through the staging cleanup action.');
  if (session.kind === 'session' && session.status === 'committed') fail('COMMITTED_IMPORT_PROTECTED', 'A committed import is protected until its rollback is explicitly resolved.');
  const tx = db.transaction(STAGING_STORE, 'readwrite');
  const store = tx.objectStore(STAGING_STORE);
  const keys = await requestValue(store.index('sessionId').getAllKeys(sessionId));
  for (const key of keys) store.delete(key);
  await transactionDone(tx);
  return keys.length > 0;
}

root.PasekaArchiveRestore = Object.freeze({
  STAGING_STORE, HISTORY_STORE,
  stageArchiveForRestore, commitStagedArchive, rollbackCommittedArchive, listArchiveRestoreSessions, listArchiveImportHistory,
  getStagedArchive, discardArchiveRestoreSession
});
})(typeof window !== 'undefined' ? window : globalThis);
