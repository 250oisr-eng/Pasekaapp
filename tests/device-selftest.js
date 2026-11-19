/* Isolated Android device-test code. Included ONLY by prepare-device-selftest.mjs.
 * Never included in production www/index.html or the public PWA. */
(() => {
'use strict';
const bridge = window.PasekaDeviceTestBridge;
if (!bridge || typeof bridge.runId !== 'function' || typeof bridge.report !== 'function') return;
const runId = String(bridge.runId() || '');
if (!/^[A-Za-z0-9-]{1,64}$/.test(runId)) return;
const PREFIX = 'paseka-device-selftest-';
const TARGET = PREFIX + 'target-' + runId;
const MARKER = PREFIX + 'phase-' + runId;
const checks = [];
const testTime = '2026-11-19T12:00:00.000Z';
let previewHtml = '';

const assert = (ok, description) => {
  if (!ok) throw new Error(description);
};
function treatment(id, occurredAt, hiveId = 'hive-1') {
  return PasekaVarroaTreatmentLog.buildTreatmentEvent(
    { hiveId, occurredAt, notes: 'Фиктивная тестовая запись', userConfirmed: true },
    [{ id: hiveId, number: hiveId === 'hive-1' ? 1 : 2 }],
    () => id, testTime
  );
}
function stateFixture(revisionId, treatmentRows) {
  return {
    meta: { schemaVersion: 16, revisionId },
    hives: [{ id: 'hive-1', number: 1, profileId: 'farrar-6x6-v1' },
      { id: 'hive-2', number: 2, profileId: 'farrar-6x6-v1' }],
    families: [], records: [], snapshots: [], tasks: [], extractions: [],
    auditLog: [], aiMessages: [], familyEvents: [], sectionalTechProcesses: [],
    queens: [], queenEvents: [], varroaObservations: [],
    varroaTreatments: treatmentRows, pesticideIncidents: [], deadoutReviews: [],
    plantCatalog: [], plantLocations: [], plantObservations: [], plantAIQueue: [],
    equipmentInventory: { bodies: {}, events: [] }, layouts: {}
  };
}
const validate = state => { validateBackupState(state); return true; };

function openTestDB(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      const database = req.result;
      database.createObjectStore('main');
      database.createObjectStore('full_backup');
      database.createObjectStore('entrance_media', { keyPath: 'id' });
      const stage = database.createObjectStore('archive_staging', { keyPath: 'id' });
      stage.createIndex('sessionId', 'sessionId');
      stage.createIndex('kind', 'kind');
      stage.createIndex('backupId', 'backupId', { unique: true });
      database.createObjectStore('archive_history', { keyPath: 'backupId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('Test IndexedDB is blocked'));
  });
}
function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB write aborted'));
  });
}
async function putState(database, state) {
  const tx = database.transaction('main', 'readwrite');
  tx.objectStore('main').put(state, 'state');
  await txDone(tx);
}
function getItem(database, store, key) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB read aborted'));
  });
}
async function makeArchive(source, backupId, suffix) {
  const sourceDB = await openTestDB(PREFIX + 'source-' + runId + '-' + suffix);
  try {
    await putState(sourceDB, source);
    return await PasekaArchive.exportArchiveFromDatabase(sourceDB, crypto, {
      backupId, createdAt: '2026-11-19T12:15:00.000Z'
    });
  } finally { sourceDB.close(); }
}
async function check(name, action) {
  const started = Date.now();
  try {
    await action();
    checks.push({ name, result: 'PASS', durationMs: Date.now() - started });
  } catch (error) {
    checks.push({
      name, result: 'FAIL', durationMs: Date.now() - started,
      error: String(error?.code || error?.message || error).slice(0, 250)
    });
  }
  drawPanel();
}
function renderCardPreview() {
  const saved = S;
  try {
    const older = treatment('card-old', '2026-11-17T08:30:00.000Z');
    const newer = treatment('card-new', '2026-11-19T08:30:00.000Z');
    S = stateFixture('card-fixture', [newer, older]);
    const first = card(S.hives[0]);
    const second = card(S.hives[1]);
    const container = document.createElement('div');
    container.innerHTML = first + second;
    const rows = container.querySelectorAll('.hive-row');
    assert(rows.length === 2, 'Two real hive cards must render');
    const current = rows[0].querySelector('.hive-treatment-summary');
    assert(current && current.textContent.includes('19.11.2026'), 'Latest Varroa treatment date is missing');
    assert(current.textContent.includes(PasekaVarroaTreatmentLog.METHOD_LABEL), 'Varroa treatment method is missing');
    assert(!rows[1].querySelector('.hive-treatment-summary'), 'Hive without treatment has unexpected summary');
    previewHtml = '<div style="margin:10px 0"><b>Карточки из настоящего интерфейса:</b></div>' + first + second;
  } finally {
    S = saved; // The real app's in-memory data and IndexedDB are never changed.
  }
}
function drawPanel() {
  let node = document.getElementById('paseka-device-selftest-panel');
  if (!node) {
    node = document.createElement('div');
    node.id = 'paseka-device-selftest-panel';
    node.style.cssText = 'position:fixed;inset:0;z-index:2147483647;overflow:auto;background:#f4f3ed;color:#202820;padding:18px;font:15px/1.45 system-ui;box-sizing:border-box';
    document.body.appendChild(node);
  }
  const passed = checks.filter(x => x.result === 'PASS').length;
  node.innerHTML = '<h2 style="margin:0 0 8px">Пасека · испытание на телефоне</h2>' +
    '<p>Только фиктивные данные · '+passed+' из '+checks.length+' проверок пройдено</p>' +
    '<div style="padding:8px;background:white;border-radius:8px">' +
    checks.map(x => '<div style="margin:4px 0">'+(x.result === 'PASS' ? '✅' : '❌')+' '+
      String(x.name).replace(/[&<>]/g, '')+(x.error?' — '+x.error.replace(/[&<>]/g, ''):'')+'</div>').join('')+'</div>' +
    previewHtml +
    '<p style="font-size:12px">Тестовая APK отдельна от основного приложения. Отчёт сохранён локально.</p>';
}
function report(phase) {
  const payload = JSON.stringify({
    format: 'paseka-device-test-v1', runId, phase,
    pass: checks.length > 0 && checks.every(item => item.result === 'PASS'),
    checks, completedAt: new Date().toISOString(),
    scope: 'isolated-android-package-and-test-only-indexeddb',
    notVerified: ['native-download-file-picker', 'offline-network-transport', 'manual-visual-legibility']
  });
  bridge.report(payload);
}
function whenBooted() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      try {
        if (typeof db !== 'undefined' && db &&
            typeof lastPersistedRevision !== 'undefined' && lastPersistedRevision &&
            document.querySelector('.panel.active')) {
          clearInterval(timer); resolve();
        } else if (attempts >= 120) {
          clearInterval(timer); reject(new Error('App bootstrap did not finish within 30 seconds'));
        }
      } catch (error) { clearInterval(timer); reject(error); }
    }, 250);
  });
}
async function phaseOne() {
  await check('app_startup_and_webview', async () => {
    assert(!!db && !!lastPersistedRevision, 'Main application did not start');
    assert(!!crypto.subtle, 'WebCrypto SHA-256 is unavailable');
    assert(!!window.PasekaArchive && !!window.PasekaArchiveRestore, 'Archive modules are unavailable');
    assert(S.meta?.schemaVersion === 16, 'Expected schema 16 in isolated app');
  });
  await check('hive_card_last_event_and_empty_hive', async () => renderCardPreview());

  let built, priorEvent;
  await check('archive_export_preflight_commit_rollback', async () => {
    const archived = treatment('archived-event', '2026-11-18T08:30:00.000Z');
    priorEvent = treatment('prior-event', '2026-11-16T08:30:00.000Z');
    built = await makeArchive(stateFixture('source-rev', [archived]), 'positive-' + runId, 'positive');
    const verified = await PasekaArchive.validateArchiveForRestore(built.blob, crypto, validate);
    assert(verified.state.varroaTreatments[0]?.id === archived.id, 'Preflight lost the treatment');
    const target = await openTestDB(TARGET);
    try {
      await putState(target, stateFixture('target-before-import', [priorEvent]));
      const staged = await PasekaArchiveRestore.stageArchiveForRestore(target, built.blob, crypto, PasekaArchive, validate);
      const unchanged = await getItem(target, 'main', 'state');
      assert(unchanged.varroaTreatments[0]?.id === priorEvent.id, 'Staging replaced live state');
      const committed = await PasekaArchiveRestore.commitStagedArchive(
        target, staged.session.sessionId, 'target-before-import', crypto, PasekaArchive, validate
      );
      assert(committed.state.varroaTreatments[0]?.id === archived.id, 'Commit lost treatment');
      const restored = await PasekaArchiveRestore.rollbackCommittedArchive(
        target, 'positive-' + runId, committed.state.meta.revisionId, crypto, validate
      );
      assert(restored.state.varroaTreatments[0]?.id === priorEvent.id, 'Rollback lost prior history');
      assert((await getItem(target, 'archive_history', 'positive-' + runId)).status === 'reverted',
        'Rollback history is not marked reverted');
    } finally { target.close(); }
  });
  await check('archive_rejects_unconfirmed_treatment', async () => {
    const badEvent = { ...treatment('bad-event', '2026-11-18T08:30:00.000Z'), userConfirmed: false };
    const invalid = await makeArchive(stateFixture('bad-source-rev', [badEvent]),
      'bad-' + runId, 'bad');
    const target = await openTestDB(TARGET);
    try {
      const before = await getItem(target, 'main', 'state');
      let caught = false;
      try {
        await PasekaArchiveRestore.stageArchiveForRestore(target, invalid.blob, crypto, PasekaArchive, validate);
      } catch (error) {
        caught = /журнал обработок Varroa/i.test(String(error.message));
      }
      assert(caught, 'Invalid confirmed-state archive was not rejected by domain guard');
      const after = await getItem(target, 'main', 'state');
      assert(JSON.stringify(after) === JSON.stringify(before), 'Rejected archive modified live state');
    } finally { target.close(); }
  });
  await check('archive_revision_guard_preserves_new_treatment', async () => {
    const guardDB = await openTestDB(PREFIX + 'guard-' + runId);
    try {
      await putState(guardDB, stateFixture('before-guard-import', []));
      if (!built) built = await makeArchive(
        stateFixture('guard-source-rev', [treatment('guard-old', '2026-11-17T08:30:00.000Z')]),
        'guard-' + runId, 'guard');
      const staged = await PasekaArchiveRestore.stageArchiveForRestore(
        guardDB, built.blob, crypto, PasekaArchive, validate);
      const committed = await PasekaArchiveRestore.commitStagedArchive(
        guardDB, staged.session.sessionId, 'before-guard-import', crypto, PasekaArchive, validate);
      const changed = structuredClone(committed.state);
      changed.varroaTreatments.push(treatment('new-event', '2026-11-19T08:30:00.000Z'));
      changed.meta.revisionId = 'changed-after-import';
      await putState(guardDB, changed);
      let blocked = false;
      try {
        await PasekaArchiveRestore.rollbackCommittedArchive(
          guardDB, staged.session.backupId, changed.meta.revisionId, crypto, validate);
      } catch (error) { blocked = error?.code === 'ROLLBACK_STATE_CHANGED'; }
      assert(blocked, 'Rollback was not blocked after a new treatment');
      assert((await getItem(guardDB, 'main', 'state')).varroaTreatments.some(
        x => x.id === 'new-event'), 'New treatment was lost');
    } finally { guardDB.close(); }
  });
  localStorage.setItem(MARKER, JSON.stringify({ checks, expectedId: 'prior-event' }));
  drawPanel();
  report('awaiting_restart');
}
async function phaseTwo(marker) {
  checks.push(...marker.checks);
  await check('real_android_restart_persists_indexeddb', async () => {
    const target = await openTestDB(TARGET);
    try {
      const state = await getItem(target, 'main', 'state');
      assert(state?.varroaTreatments?.[0]?.id === marker.expectedId,
        'Restart did not preserve restored treatment');
      assert((await getItem(target, 'archive_history', 'positive-' + runId))?.status === 'reverted',
        'Restart lost the archive rollback audit');
    } finally { target.close(); }
  });
  await check('real_card_renderer_after_restart', async () => renderCardPreview());
  localStorage.removeItem(MARKER);
  drawPanel();
  report('complete');
}
(async () => {
  try {
    await whenBooted();
    const saved = localStorage.getItem(MARKER);
    if (saved) await phaseTwo(JSON.parse(saved));
    else await phaseOne();
  } catch (error) {
    checks.push({ name: 'test_runner_fatal', result: 'FAIL', error: String(error?.message || error).slice(0, 250) });
    drawPanel();
    report('complete');
  }
})();
})();
