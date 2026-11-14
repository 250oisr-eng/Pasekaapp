import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../js/paseka-auto-snapshots.js', import.meta.url), 'utf8');
new Function(source)();
const Snapshots = globalThis.PasekaAutoSnapshots;

function openDb(name) {
  const factory = new IDBFactory();
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('main');
      request.result.createObjectStore('auto_snapshots', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function put(db, store, value, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const request = key === undefined
      ? tx.objectStore(store).put(value)
      : tx.objectStore(store).put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    request.onerror = () => reject(request.error);
  });
}
function get(db, store, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = tx.objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function fixture(revisionId, value) {
  return { meta: { revisionId, schemaVersion: 12 }, hives: [{ id: 'h1', value }], records: [] };
}

test('writes a SHA-256 checked snapshot only when the main revision matches', async () => {
  const db = await openDb('snapshot-write');
  await put(db, 'main', fixture('main-1', 'current'), 'state');
  const result = await Snapshots.writeSnapshot(db, fixture('old-1', 'previous'), 'main-1', webcrypto);
  assert.equal(result.written, true);
  assert.equal(result.count, 1);
  const stored = await get(db, 'auto_snapshots', 'old-1');
  assert.equal(stored.revisionId, 'old-1');
  assert.match(stored.checksum, /^[a-f0-9]{64}$/);
  assert.equal((await Snapshots.getLatestValidSnapshot(db, webcrypto)).snapshot.id, 'old-1');
  db.close();
});

test('deduplicates a revision and does not overwrite the existing verified copy', async () => {
  const db = await openDb('snapshot-dedupe');
  await put(db, 'main', fixture('main-1', 'current'), 'state');
  await Snapshots.writeSnapshot(db, fixture('old-1', 'first'), 'main-1', webcrypto);
  const duplicate = await Snapshots.writeSnapshot(db, fixture('old-1', 'changed'), 'main-1', webcrypto);
  assert.equal(duplicate.written, false);
  const stored = await get(db, 'auto_snapshots', 'old-1');
  assert.equal(stored.state.hives[0].value, 'first');
  assert.equal((await Snapshots.listSnapshots(db)).length, 1);
  db.close();
});

test('rotates old snapshots while retaining the configured newest limit', async () => {
  const db = await openDb('snapshot-rotation');
  for (let i = 1; i <= 5; i += 1) {
    await put(db, 'main', fixture('main-' + i, 'current'), 'state');
    await Snapshots.writeSnapshot(db, fixture('rev-' + i, 'value-' + i), 'main-' + i, webcrypto, { maxSnapshots: 3 });
  }
  const items = await Snapshots.listSnapshots(db);
  assert.equal(items.length, 3);
  assert.deepEqual(new Set(items.map(item => item.id)), new Set(['rev-3', 'rev-4', 'rev-5']));
  db.close();
});

test('rejects a snapshot if the live database revision changed', async () => {
  const db = await openDb('snapshot-conflict');
  await put(db, 'main', fixture('main-newer', 'current'), 'state');
  await assert.rejects(
    Snapshots.writeSnapshot(db, fixture('old-1', 'stale'), 'main-expected', webcrypto),
    error => error.code === 'SNAPSHOT_REVISION_CONFLICT'
  );
  assert.equal((await Snapshots.listSnapshots(db)).length, 0);
  db.close();
});

test('skips a corrupted newest snapshot and recovers the newest older valid one', async () => {
  const db = await openDb('snapshot-corrupt');
  await put(db, 'main', fixture('main-1', 'current'), 'state');
  await Snapshots.writeSnapshot(db, fixture('rev-1', 'good'), 'main-1', webcrypto);
  await put(db, 'main', fixture('main-2', 'current'), 'state');
  await Snapshots.writeSnapshot(db, fixture('rev-2', 'newer'), 'main-2', webcrypto);
  const corrupted = await get(db, 'auto_snapshots', 'rev-2');
  corrupted.state.hives[0].value = 'tampered';
  await put(db, 'auto_snapshots', corrupted);
  const recovered = await Snapshots.getLatestValidSnapshot(db, webcrypto);
  assert.equal(recovered.invalidCount, 1);
  assert.equal(recovered.snapshot.id, 'rev-1');
  db.close();
});

test('skips an oversized state instead of consuming snapshot quota', async () => {
  const db = await openDb('snapshot-size-guard');
  await put(db, 'main', fixture('main-1', 'current'), 'state');
  const result = await Snapshots.writeSnapshot(db, fixture('large-1', 'x'.repeat(500)), 'main-1', webcrypto, { maxSnapshotBytes: 100 });
  assert.equal(result.written, false);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'SNAPSHOT_TOO_LARGE');
  assert.equal((await Snapshots.listSnapshots(db)).length, 0);
  db.close();
});

test('enforces the total byte budget and retains the newest snapshot', async () => {
  const db = await openDb('snapshot-total-budget');
  await put(db, 'main', fixture('main-1', 'current'), 'state');
  const first = await Snapshots.writeSnapshot(db, fixture('rev-1', 'same-size'), 'main-1', webcrypto, { maxTotalBytes: 10000 });
  assert.equal(first.written, true);
  const budget = first.snapshot.sizeBytes + 1;
  await put(db, 'main', fixture('main-2', 'current'), 'state');
  const second = await Snapshots.writeSnapshot(db, fixture('rev-2', 'same-size'), 'main-2', webcrypto, { maxTotalBytes: budget });
  assert.equal(second.written, true);
  const items = await Snapshots.listSnapshots(db);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'rev-2');
  assert.ok(items[0].sizeBytes <= budget);
  db.close();
});


test('skips a snapshot larger than the total budget without deleting existing recovery points', async () => {
  const db = await openDb('snapshot-total-budget-skip');
  await put(db, 'main', fixture('main-1', 'current'), 'state');
  const first = await Snapshots.writeSnapshot(db, fixture('rev-1', 'small'), 'main-1', webcrypto, { maxTotalBytes: 10000 });
  assert.equal(first.written, true);
  await put(db, 'main', fixture('main-2', 'current'), 'state');
  const result = await Snapshots.writeSnapshot(db, fixture('rev-2', 'x'.repeat(500)), 'main-2', webcrypto, {
    maxSnapshotBytes: 10000,
    maxTotalBytes: first.snapshot.sizeBytes
  });
  assert.equal(result.written, false);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'SNAPSHOT_TOTAL_BUDGET_EXCEEDED');
  const items = await Snapshots.listSnapshots(db);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'rev-1');
  db.close();
});

test('treats an unserializable legacy snapshot as oversized during rotation', async () => {
  const db = await openDb('snapshot-invalid-legacy-size');
  await put(db, 'main', fixture('main-1', 'current'), 'state');
  const invalid = { id: 'legacy-bad', at: '2099-01-01T00:00:00.000Z', revisionId: 'legacy-bad',
    checksum: 'invalid', state: { meta: { revisionId: 'legacy-bad' }, value: 1n } };
  await put(db, 'auto_snapshots', invalid);
  const result = await Snapshots.writeSnapshot(db, fixture('rev-1', 'small'), 'main-1', webcrypto, { maxTotalBytes: 10000 });
  assert.equal(result.written, true);
  const items = await Snapshots.listSnapshots(db);
  assert.equal(items.some(item => item.id === 'legacy-bad'), false);
  assert.ok(items.every(item => Number.isFinite(item.sizeBytes)));
  db.close();
});
