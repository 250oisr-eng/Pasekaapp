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
    fail('ALREADY_IMPORTED', 'This archive has already been imported.');
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
  const videos = [];
  for (const record of videoRecords) {
    if (!record.blob || !record.metadata || record.blob.size !== record.size) fail('STAGING_VIDEO_SIZE_MISMATCH', 'A staged video is missing or has an invalid size.');
    const entry = videoEntries.find(item => item.metadata?.id === record.metadata.id);
    if (!entry || entry.path !== record.path || entry.size !== record.size || JSON.stringify(record.metadata) !== JSON.stringify(entry.metadata)) fail('STAGING_VIDEO_MANIFEST_MISMATCH', 'A staged video does not match its manifest entry.');
    const hashes = await archiveApi.hashBlobChunks(record.blob, cryptoProvider);
    if (JSON.stringify(hashes) !== JSON.stringify(entry.chunkSha256)) fail('STAGING_CHECKSUM_MISMATCH', 'Staged video checksum does not match its manifest: ' + record.metadata.id);
    const hiveIds = new Set(Array.isArray(state.hives) ? state.hives.map(hive => hive && hive.id).filter(id => typeof id === 'string' && id) : []);
    videos.push({ ...record, orphanedHiveReference: !hiveIds.has(record.metadata.hiveId) });
  }
  return { session, state, videos: videos.sort((a, b) => String(a.path).localeCompare(String(b.path))) };
}
async function discardArchiveRestoreSession(db, sessionId) {
  ensureStores(db);
  const tx = db.transaction(STAGING_STORE, 'readwrite');
  const store = tx.objectStore(STAGING_STORE);
  const keys = await requestValue(store.index('sessionId').getAllKeys(sessionId));
  for (const key of keys) store.delete(key);
  await transactionDone(tx);
  return keys.length > 0;
}

root.PasekaArchiveRestore = Object.freeze({
  STAGING_STORE, HISTORY_STORE,
  stageArchiveForRestore, listArchiveRestoreSessions,
  getStagedArchive, discardArchiveRestoreSession
});
})(typeof window !== 'undefined' ? window : globalThis);
