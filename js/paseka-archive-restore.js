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
    await putStagingRecord(db, { id: sessionId + ':state', sessionId, kind: 'state', state: checked.state });
    session.stagedCount = 1;
    await updateSession(db, session);
    for (const item of checked.videoEntries) {
      await putStagingRecord(db, {
        id: sessionId + ':video:' + item.metadata.id,
        sessionId,
        kind: 'video',
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
async function getStagedArchive(db, sessionId) {
  ensureStores(db);
  const tx = db.transaction(STAGING_STORE, 'readonly');
  const store = tx.objectStore(STAGING_STORE);
  const [session, records] = await Promise.all([
    requestValue(store.get(sessionId)),
    requestValue(store.index('sessionId').getAll(sessionId))
  ]);
  await transactionDone(tx);
  if (!session || session.kind !== 'session') fail('STAGING_SESSION_NOT_FOUND', 'Staged import session was not found.');
  if (session.status !== 'ready' || session.stagedCount !== session.totalEntries) fail('STAGING_SESSION_INCOMPLETE', 'Staged import is incomplete and cannot be restored.');
  const stateRecord = records.find(record => record.kind === 'state');
  const videoRecords = records.filter(record => record.kind === 'video');
  if (!stateRecord || videoRecords.length + 1 !== session.totalEntries) fail('STAGING_CONTENT_MISSING', 'Staged archive content is incomplete.');
  return { session, state: stateRecord.state, videos: videoRecords };
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
