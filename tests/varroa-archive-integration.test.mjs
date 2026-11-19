import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { IDBFactory } from 'fake-indexeddb';

// This test uses the actual archive codec, transactional restore engine and
// Varroa domain integrity guard. No real apiary records or device DB are used.
const scope = {};
for (const filename of [
  'paseka-sha256.js',
  'paseka-archive.js',
  'paseka-archive-restore.js',
  'varroa-treatment-log.js',
  'equipment-items.js',
  'sectional-physical-layout.js'
]) {
  const code = await readFile(new URL('../js/' + filename, import.meta.url), 'utf8');
  new Function('window', code)(scope);
}
const Archive = scope.PasekaArchive;
const Restore = scope.PasekaArchiveRestore;
const Treatment = scope.PasekaVarroaTreatmentLog;
const appHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const validatorStart = appHtml.indexOf('function validateBackupState(state){');
const validatorEnd = appHtml.indexOf('\nfunction validateRawBackupIntegrity(state)', validatorStart);
assert.ok(validatorStart >= 0 && validatorEnd > validatorStart, 'production backup validator must be discoverable');
const validateBackupState = new Function('deps',
  'with (deps) { return (' + appHtml.slice(validatorStart, validatorEnd).trim() + '); }'
)({
  PasekaEquipmentItems: scope.PasekaEquipmentItems,
  PasekaSectionalPhysicalLayout: scope.PasekaSectionalPhysicalLayout,
  PasekaVarroaTreatmentLog: Treatment
});

function openDatabase(factory, name) {
  return new Promise((resolve, reject) => {
    const req = factory.open(name, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('main');
      db.createObjectStore('full_backup');
      db.createObjectStore('entrance_media', { keyPath: 'id' });
      const stage = db.createObjectStore('archive_staging', { keyPath: 'id' });
      stage.createIndex('sessionId', 'sessionId');
      stage.createIndex('kind', 'kind');
      stage.createIndex('backupId', 'backupId', { unique: true });
      db.createObjectStore('archive_history', { keyPath: 'backupId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function finished(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}
async function writeState(db, state) {
  const tx = db.transaction('main', 'readwrite');
  tx.objectStore('main').put(state, 'state');
  await finished(tx);
}
function readState(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('main', 'readonly');
    const req = tx.objectStore('main').get('state');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function readHistory(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('archive_history', 'readonly');
    const req = tx.objectStore('archive_history').get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function treatment(id, occurredAt, hiveId = 'hive-1') {
  return Treatment.buildTreatmentEvent({
    hiveId, occurredAt, notes: 'Тестовая фактическая обработка', userConfirmed: true
  }, [{ id: hiveId, number: 1 }], () => id, '2026-11-19T12:00:00.000Z');
}
function stateFixture(revisionId, treatmentRows) {
  return {
    meta: { schemaVersion: 16, revisionId },
    hives: [{ id: 'hive-1', number: 1 }],
    families: [], records: [], snapshots: [], tasks: [], extractions: [],
    auditLog: [], aiMessages: [], familyEvents: [], sectionalTechProcesses: [],
    queens: [], queenEvents: [], varroaObservations: [],
    varroaTreatments: treatmentRows, pesticideIncidents: [], deadoutReviews: [],
    plantCatalog: [], plantLocations: [], plantObservations: [], plantAIQueue: [],
    equipmentInventory: { bodies: {}, events: [] }, layouts: {}
  };
}
function validateTreatmentState(state) {
  // Exercise the real application backup validator, including the Varroa
  // integrity gate and unrelated schema/layout/accessory checks.
  validateBackupState(state);
  return true;
}
async function makeArchive(sourceState, backupId) {
  const db = await openDatabase(new IDBFactory(), 'archive-source-' + backupId);
  await writeState(db, sourceState);
  try {
    return await Archive.exportArchiveFromDatabase(db, webcrypto, {
      backupId, createdAt: '2026-11-19T12:15:00.000Z'
    });
  } finally {
    db.close();
  }
}

test('schema 16 Varroa treatment survives a real .paseka export, stage, commit, restart and rollback', async () => {
  const archivedEvent = treatment('archive-treatment', '2026-11-18T08:30:00.000Z');
  const priorEvent = treatment('prior-treatment', '2026-11-16T08:30:00.000Z');
  const archived = stateFixture('source-revision', [archivedEvent]);
  const original = stateFixture('target-before-import', [priorEvent]);
  const backupId = 'varroa-schema16-roundtrip';
  const built = await makeArchive(archived, backupId);
  assert.equal(built.manifest.schemaVersion, 16);

  const checked = await Archive.validateArchiveForRestore(built.blob, webcrypto, validateTreatmentState);
  assert.deepEqual(checked.state.varroaTreatments, [archivedEvent]);
  assert.equal(Treatment.latestTreatmentForHive(checked.state.varroaTreatments, 'hive-1').id, archivedEvent.id);

  const factory = new IDBFactory();
  const db = await openDatabase(factory, 'varroa-roundtrip-target');
  await writeState(db, original);
  const staged = await Restore.stageArchiveForRestore(db, built.blob, webcrypto, Archive, validateTreatmentState);
  assert.equal(staged.session.status, 'ready');
  assert.deepEqual(await readState(db), original, 'staging must not replace live state');

  const committed = await Restore.commitStagedArchive(
    db, staged.session.sessionId, original.meta.revisionId, webcrypto, Archive, validateTreatmentState
  );
  assert.deepEqual(committed.state.varroaTreatments, [archivedEvent]);
  assert.equal(committed.history.status, 'committed');
  db.close();

  const reopened = await openDatabase(factory, 'varroa-roundtrip-target');
  const live = await readState(reopened);
  assert.deepEqual(live.varroaTreatments, [archivedEvent], 'treatment must survive an IndexedDB restart');
  assert.equal(Treatment.latestTreatmentForHive(live.varroaTreatments, 'hive-1').id, archivedEvent.id);
  assert.equal((await readHistory(reopened, backupId)).status, 'committed');

  const rolledBack = await Restore.rollbackCommittedArchive(
    reopened, backupId, live.meta.revisionId, webcrypto, validateTreatmentState
  );
  assert.deepEqual(rolledBack.state.varroaTreatments, [priorEvent]);
  assert.deepEqual((await readState(reopened)).varroaTreatments, [priorEvent]);
  assert.equal((await readHistory(reopened, backupId)).status, 'reverted');
  reopened.close();
});

test('unconfirmed treatment inside a checksummed schema 16 archive is rejected before staging', async () => {
  const bad = { ...treatment('unconfirmed', '2026-11-18T08:30:00.000Z'), userConfirmed: false };
  const built = await makeArchive(stateFixture('untrusted-export', [bad]), 'varroa-invalid-event');
  const db = await openDatabase(new IDBFactory(), 'varroa-invalid-target');
  const original = stateFixture('existing-revision', [treatment('safe', '2026-11-17T08:30:00.000Z')]);
  await writeState(db, original);

  await assert.rejects(
    Restore.stageArchiveForRestore(db, built.blob, webcrypto, Archive, validateTreatmentState),
    /журнал обработок Varroa/i
  );
  assert.deepEqual(await readState(db), original);
  assert.equal((await readHistory(db, 'varroa-invalid-event')), undefined);
  const tx = db.transaction('archive_staging', 'readonly');
  const count = await new Promise((resolve, reject) => {
    const req = tx.objectStore('archive_staging').count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  assert.equal(count, 0, 'invalid archive must not create a staging session');
  db.close();
});

test('rollback cannot erase a new confirmed Varroa treatment recorded after archive import', async () => {
  const built = await makeArchive(
    stateFixture('source-revision', [treatment('imported', '2026-11-17T08:30:00.000Z')]),
    'varroa-rollback-protection'
  );
  const db = await openDatabase(new IDBFactory(), 'varroa-protected-target');
  await writeState(db, stateFixture('initial-revision', []));
  const staged = await Restore.stageArchiveForRestore(db, built.blob, webcrypto, Archive, validateTreatmentState);
  const committed = await Restore.commitStagedArchive(
    db, staged.session.sessionId, 'initial-revision', webcrypto, Archive, validateTreatmentState
  );

  const changed = structuredClone(committed.state);
  changed.varroaTreatments.push(treatment('new-user-event', '2026-11-19T09:00:00.000Z'));
  changed.meta.revisionId = 'user-updated-after-import';
  await writeState(db, changed);
  await assert.rejects(
    Restore.rollbackCommittedArchive(db, 'varroa-rollback-protection', changed.meta.revisionId, webcrypto, validateTreatmentState),
    error => error.code === 'ROLLBACK_STATE_CHANGED'
  );
  assert.deepEqual((await readState(db)).varroaTreatments, changed.varroaTreatments);
  const history = await readHistory(db, 'varroa-rollback-protection');
  assert.equal(history.status, 'committed', 'failed rollback must retain the recovery snapshot');
  assert.equal(history.rollbackAvailable, true);
  db.close();
});
