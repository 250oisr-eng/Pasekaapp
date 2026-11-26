import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

function extractFunction(name) {
  const match = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(html);
  assert.ok(match, 'Function not found: ' + name);
  const next = /\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
  next.lastIndex = match.index + match[0].length;
  const endMatch = next.exec(html);
  return html.slice(match.index, endMatch ? endMatch.index : html.indexOf('</script>', match.index));
}

function load(name, deps) {
  return new Function('deps', 'with (deps) { return (' + extractFunction(name) + '); }')(deps);
}

function openDbDependencies(indexedDB) {
  const deps = {
    indexedDB,
    DB: 'paseka-startup-guard-integration',
    STORE: 'main',
    BACKUP_STORE: 'full_backup',
    db: null,
  };
  deps.isFreshDatabaseUpgrade = load('isFreshDatabaseUpgrade', deps);
  return deps;
}

test('openDB marks only a genuinely new IndexedDB database as fresh', async () => {
  const indexedDB = new IDBFactory();

  const fresh = openDbDependencies(indexedDB);
  const open = load('openDB', fresh);
  const firstOpenCreatedDatabase = await open();
  assert.equal(firstOpenCreatedDatabase, true);
  assert.equal(fresh.db.version, 3);
  fresh.db.close();

  // A retry in the same page must not inherit the first open's "fresh" result.
  const secondOpenCreatedDatabase = await open();
  assert.equal(secondOpenCreatedDatabase, false);
  assert.equal(fresh.db.version, 3);

  const stateRequest = fresh.db.transaction('main', 'readonly')
    .objectStore('main').get('state');
  const state = await new Promise((resolve, reject) => {
    stateRequest.onsuccess = () => resolve(stateRequest.result);
    stateRequest.onerror = () => reject(stateRequest.error);
  });
  assert.equal(state, undefined);

  const canInitialize = load('canInitializeFreshDatabase', fresh);
  assert.equal(canInitialize(secondOpenCreatedDatabase, state), false);
  fresh.db.close();
});

test('fresh empty database is eligible for first-run initialization', async () => {
  const deps = openDbDependencies(new IDBFactory());
  const createdDatabase = await load('openDB', deps)();
  const canInitialize = load('canInitializeFreshDatabase', deps);
  assert.equal(canInitialize(createdDatabase, undefined), true);
  deps.db.close();
});


test('existing empty database without automatic backup stays empty and is not first-run eligible', async () => {
  const deps = openDbDependencies(new IDBFactory());
  await load('openDB', deps)();
  deps.autoBackupRecovered = false;
  deps.startupRecoveryPending = false;
  deps.autoBackupInfo = null;
  deps.readMain = load('readMain', deps);
  deps.readAutoBackup = load('readAutoBackup', deps);
  deps.validateAutomaticBackup = backup => backup.state;

  const loaded = await load('read', deps)();
  assert.equal(loaded, undefined);
  assert.equal(load('canInitializeFreshDatabase', deps)(false, loaded), false);
  deps.db.close();
});

test('existing empty primary database still recovers a valid automatic backup', async () => {
  const deps = openDbDependencies(new IDBFactory());
  await load('openDB', deps)();
  const backupState = { meta: { schemaVersion: 12 }, hives: [{ id: 'hive-1' }] };
  const transaction = deps.db.transaction('full_backup', 'readwrite');
  transaction.objectStore('full_backup').put({ state: backupState }, 'previous');
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

  deps.autoBackupRecovered = false;
  deps.startupRecoveryPending = false;
  deps.autoBackupInfo = null;
  deps.readMain = load('readMain', deps);
  deps.readAutoBackup = load('readAutoBackup', deps);
  deps.validateAutomaticBackup = backup => backup.state;

  const loaded = await load('read', deps)();
  assert.deepEqual(loaded, backupState);
  assert.equal(deps.startupRecoveryPending, true);
  assert.equal(deps.autoBackupRecovered, false);
  deps.db.close();
});


test('existing empty database fails closed when automatic backup cannot be read', async () => {
  const deps = openDbDependencies(new IDBFactory());
  await load('openDB', deps)();
  deps.readMain = async () => undefined;
  deps.readAutoBackup = async () => { throw new Error('backup read failed'); };

  await assert.rejects(load('read', deps)(), /backup read failed/);
  assert.equal(load('canInitializeFreshDatabase', deps)(false, undefined), false);
  deps.db.close();
});

test('a valid primary state is preferred without consulting automatic backup', async () => {
  const deps = openDbDependencies(new IDBFactory());
  await load('openDB', deps)();
  const primaryState = { meta: { schemaVersion: 12 }, hives: [{ id: 'primary-hive' }] };
  deps.readMain = async () => primaryState;
  deps.readAutoBackup = async () => { throw new Error('must not read backup'); };

  const loaded = await load('read', deps)();
  assert.deepEqual(loaded, primaryState);
  deps.db.close();
});


test('upgrading an existing older database preserves its state and is not treated as first-run creation', async () => {
  const indexedDB = new IDBFactory();
  const deps = openDbDependencies(indexedDB);
  const legacyState = { meta: { schemaVersion: 11, revisionId: 'legacy-revision' }, hives: [{ id: 'legacy-hive' }] };

  const legacyRequest = indexedDB.open(deps.DB, 1);
  const legacyDb = await new Promise((resolve, reject) => {
    legacyRequest.onupgradeneeded = () => legacyRequest.result.createObjectStore('main');
    legacyRequest.onsuccess = () => resolve(legacyRequest.result);
    legacyRequest.onerror = () => reject(legacyRequest.error);
  });
  const write = legacyDb.transaction('main', 'readwrite');
  write.objectStore('main').put(legacyState, 'state');
  await new Promise((resolve, reject) => {
    write.oncomplete = resolve;
    write.onerror = () => reject(write.error);
    write.onabort = () => reject(write.error);
  });
  legacyDb.close();

  const createdDuringOpen = await load('openDB', deps)();
  assert.equal(createdDuringOpen, false);
  assert.equal(deps.db.version, 3);

  const state = await new Promise((resolve, reject) => {
    const request = deps.db.transaction('main', 'readonly').objectStore('main').get('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  assert.deepEqual(state, legacyState);
  assert.equal(load('canInitializeFreshDatabase', deps)(createdDuringOpen, state), false);
  deps.db.close();
});

test('reading a valid automatic backup marks recovery pending but not committed', async () => {
  const deps = openDbDependencies(new IDBFactory());
  await load('openDB', deps)();
  const backupState = { meta: { schemaVersion: 12 }, hives: [{ id: 'pending-hive' }] };
  const transaction = deps.db.transaction('full_backup', 'readwrite');
  transaction.objectStore('full_backup').put({ state: backupState }, 'previous');
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  deps.autoBackupRecovered = false;
  deps.startupRecoveryPending = false;
  deps.readMain = async () => undefined;
  deps.readAutoBackup = load('readAutoBackup', deps);
  deps.validateAutomaticBackup = backup => backup.state;
  assert.deepEqual(await load('read', deps)(), backupState);
  assert.equal(deps.startupRecoveryPending, true);
  assert.equal(deps.autoBackupRecovered, false);
  deps.db.close();
});

test('failed startup recovery commit never marks the backup as recovered', async () => {
  const deps = {
    autoBackupRecovered: false,
    startupRecoveryPending: true,
    writeMainIfUnchanged: async () => { throw new Error('transaction aborted'); }
  };
  await assert.rejects(load('commitStartupState', deps)({ meta: { revisionId: 'restore-rev' } }, null, true), /transaction aborted/);
  assert.equal(deps.autoBackupRecovered, false);
  assert.equal(deps.startupRecoveryPending, true);
});

test('successful startup recovery commit marks the backup as recovered only afterwards', async () => {
  const order = [];
  const deps = {
    autoBackupRecovered: false,
    startupRecoveryPending: true,
    writeMainIfUnchanged: async () => { order.push('commit'); }
  };
  await load('commitStartupState', deps)({ meta: { revisionId: 'restore-rev' } }, null, true);
  order.push('marked');
  assert.deepEqual(order, ['commit', 'marked']);
  assert.equal(deps.autoBackupRecovered, true);
  assert.equal(deps.startupRecoveryPending, false);
});

test('startup recovery commit rejects a concurrent primary write and leaves its data intact', async () => {
  const deps = openDbDependencies(new IDBFactory());
  await load('openDB', deps)();
  const concurrentState = { meta: { revisionId: 'newer-revision' }, value: 'concurrent-write' };
  const backupState = { meta: { revisionId: 'backup-revision' }, value: 'backup' };
  const seed = deps.db.transaction(['main', 'full_backup'], 'readwrite');
  seed.objectStore('main').put(concurrentState, 'state');
  seed.objectStore('full_backup').put({ state: backupState }, 'previous');
  await new Promise((resolve, reject) => {
    seed.oncomplete = resolve;
    seed.onerror = () => reject(seed.error);
    seed.onabort = () => reject(seed.error);
  });

  deps.autoBackupRecovered = false;
  deps.writeMainIfUnchanged = load('writeMainIfUnchanged', deps);
  const commit = load('commitStartupState', deps);
  await assert.rejects(
    commit({ meta: { revisionId: 'restored-revision' }, value: 'stale-backup' }, 'older-revision', true),
    error => error.name === 'PasekaConflictError'
  );
  assert.equal(deps.autoBackupRecovered, false);

  const read = deps.db.transaction(['main', 'full_backup'], 'readonly');
  const mainRequest = read.objectStore('main').get('state');
  const backupRequest = read.objectStore('full_backup').get('previous');
  const result = await new Promise((resolve, reject) => {
    let mainValue, backupValue;
    mainRequest.onsuccess = () => { mainValue = mainRequest.result; };
    backupRequest.onsuccess = () => { backupValue = backupRequest.result; };
    read.oncomplete = () => resolve({ mainValue, backupValue });
    read.onerror = () => reject(read.error);
    read.onabort = () => reject(read.error);
  });
  assert.deepEqual(result.mainValue, concurrentState);
  assert.deepEqual(result.backupValue, { state: backupState });
  deps.db.close();
});


function startupMarkerStore({failRead=false,failWrite=false}={}){
 const entries=new Map();
 return {
  entries,
  getItem(key){if(failRead)throw new Error('marker read denied');return entries.has(key)?entries.get(key):null;},
  setItem(key,value){if(failWrite)throw new Error('marker write denied');entries.set(key,String(value));}
 };
}
function markerHarness(storage){
 const deps={
  STARTUP_USE_MARKER_KEY:'paseka:previously-used:v1',
  canInitializeFreshDatabase:(created,loaded)=>created===true&&loaded==null
 };
 return {
  read:load('readStartupUseMarker',deps),
  persist:load('persistStartupUseMarker',deps),
  authorize:load('requireFirstRunConsent',deps),
  provider:()=>storage
 };
}
test('first-run requires explicit acknowledgment before initializing any empty database',async()=>{
 const deps=openDbDependencies(new IDBFactory());
 const created=await load('openDB',deps)();
 const storage=startupMarkerStore(),m=markerHarness(storage);
 assert.equal(m.read(m.provider),'absent');
 let shown=0;
 assert.equal(m.authorize(created,undefined,m.read(m.provider),text=>{shown++;assert.match(text,/первый запуск/);assert.match(text,/видео/);return true;}),true);
 assert.equal(shown,1);
 assert.equal(m.read(m.provider),'absent','marker cannot be set by consent alone');
 const read=load('readMain',deps);
 assert.equal(await read(),undefined,'consent may not write state automatically');
 deps.db.close();
});
test('refused first-run consent leaves state and marker unmodified',async()=>{
 const deps=openDbDependencies(new IDBFactory());
 const created=await load('openDB',deps)();
 const store=startupMarkerStore(),marker=markerHarness(store);
 await assert.rejects(async()=>marker.authorize(created,await load('readMain',deps)(),marker.read(marker.provider),()=>false),/не подтверждён/);
 assert.equal(await load('readMain',deps)(),undefined);
 assert.equal(store.entries.size,0);
 deps.db.close();
});
test('a retained previous-use marker blocks silent bootstrap after complete IndexedDB loss',async()=>{
 const indexedDB=new IDBFactory(),store=startupMarkerStore(),marker=markerHarness(store);
 const initial=openDbDependencies(indexedDB);const created=await load('openDB',initial)();
 assert.equal(created,true);
 assert.equal(marker.authorize(true,undefined,'absent',()=>true),true);
 const state={meta:{revisionId:'durable-1'},hives:[]};
 await load('writeMainIfUnchanged',initial)(state,null);
 assert.deepEqual(await load('readMain',initial)(),state);
 assert.equal(marker.persist(marker.provider),true,'marker is written only after main commit');
 initial.db.close();
 const removed=indexedDB.deleteDatabase(initial.DB);
 await new Promise((resolve,reject)=>{removed.onsuccess=resolve;removed.onerror=()=>reject(removed.error);removed.onblocked=()=>reject(new Error('database blocked'));});
 const reopened=openDbDependencies(indexedDB);
 const genuinelyNewAgain=await load('openDB',reopened)();
 assert.equal(genuinelyNewAgain,true);
 assert.equal(await load('readMain',reopened)(),undefined);
 let promptCalled=false;
 assert.throws(()=>marker.authorize(true,undefined,marker.read(marker.provider),()=>{promptCalled=true;return true;}),/Ранее приложение уже использовалось/);
 assert.equal(promptCalled,false,'a warning prompt cannot override proven prior use');
 assert.equal(await load('readMain',reopened)(),undefined,'no replacement records are written');
 reopened.db.close();
});
test('existing valid main bypasses first-use confirmation even with a retained marker',()=>{
 const s={meta:{revisionId:'existing'}},m=markerHarness(startupMarkerStore());
 let prompted=false;
 assert.equal(m.authorize(false,s,'present',()=>{prompted=true;return false;}),false);
 assert.equal(prompted,false);
});
test('existing empty database refuses first-use reinitialization despite positive confirmation',()=>{
 const m=markerHarness(startupMarkerStore());
 for(const missing of [undefined,null])assert.throws(()=>m.authorize(false,missing,'absent',()=>true),/существующая локальная база/);
});
test('missing, corrupt or inaccessible storage refuses any unproven first-use',()=>{
 for(const [kind,state] of [['present','1'],['invalid','bogus'],['unavailable',null]]){
  const storage=startupMarkerStore({failRead:kind==='unavailable'}),m=markerHarness(storage);
  if(state!==null)storage.setItem('paseka:previously-used:v1',state);
  const markerState=m.read(m.provider);assert.equal(markerState,kind);
  let prompts=0;assert.throws(()=>m.authorize(true,undefined,markerState,()=>{prompts++;return true;}),/заблокировано/);
  assert.equal(prompts,0);
 }
});
test('failed marker writes do not claim durable prior-use evidence',()=>{
 const s=startupMarkerStore({failWrite:true}),m=markerHarness(s);
 assert.equal(m.persist(m.provider),false);
 assert.equal(s.entries.size,0);
 const forbidden=markerHarness(startupMarkerStore({failRead:true}));
 assert.equal(forbidden.read(forbidden.provider),'unavailable');
});
test('existing backup can recover even if primary state is missing and marker remains present',async()=>{
 const deps=openDbDependencies(new IDBFactory());await load('openDB',deps)();
 const state={meta:{revisionId:'from-backup'},hives:[{id:'one'}]};
 const tx=deps.db.transaction('full_backup','readwrite');
 tx.objectStore('full_backup').put({state},'previous');
 await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
 deps.readMain=load('readMain',deps);deps.readAutoBackup=load('readAutoBackup',deps);
 deps.validateAutomaticBackup=backup=>backup.state;deps.startupRecoveryPending=false;
 const loaded=await load('read',deps)();
 const m=markerHarness(startupMarkerStore());
 assert.deepEqual(loaded,state);
 assert.equal(deps.startupRecoveryPending,true);
 assert.equal(m.authorize(false,loaded,'present',()=>{throw new Error('should not prompt')}),false);
 deps.db.close();
});
test('live bootstrap writes marker only after durable main verification and preserves hard-blocked deletion',()=>{
 const boot=html.indexOf('const databaseCreatedDuringOpen=await openDB()');
 const valid=html.indexOf('let startupIntegrity=validateVirtualApiary()',boot);
 const commit=html.indexOf('await commitStartupState(',valid);
 const verified=html.indexOf('const verifiedMain=await readMain()',commit);
 const marker=html.indexOf('if(!persistStartupUseMarker())',verified);
 const ready=html.indexOf('startupWriteGate.ready=true',marker);
 assert.ok(boot>=0&&valid>boot&&commit>valid&&verified>commit&&marker>verified&&ready>marker);
 assert.match(html,/requireFirstRunConsent\(databaseCreatedDuringOpen,loaded,readStartupUseMarker\(\),/);
 const deletion=extractFunction('deleteAllData');
 assert.match(deletion,/Полная очистка заблокирована/);
 assert.doesNotMatch(deletion,/indexedDB\.deleteDatabase\(/);
});
