import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';

const source=readFileSync(new URL('./fixtures/android-fileproof335-isolated-restore.js',import.meta.url),'utf8');
const ids=['android-proof-black','android-proof-white'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const PIN='4bb2f51ab874956b2387bc381a66c92221d2e88ea9bd0b14adfa73222c785186';
const videoHashes=['794e1dcb2598dff510b8f4b7cafea57a500cbfd57a1e57a99247a9bb7d784b9f','bc9abbf1f109a7f2feb8787d52bce8363eb3c577ef2acd67ae4fcdf59a892eff'];
const fixturesHost={};
new Function('window',readFileSync(new URL('./fixtures/android-two-mp4-proof-fixtures.js',import.meta.url),'utf8'))(fixturesHost);
const fixtures=fixturesHost.PasekaTwoMp4ProofFixtures;
function harness({factory=new IDBFactory(),fakeFullArchivePin=true}={}){
  const crypto=fakeFullArchivePin ? {
    subtle:{ digest:async (algorithm,bytes)=>{
      if(bytes.byteLength===3158)return Uint8Array.from(Buffer.from(PIN,'hex')).buffer;
      return webcrypto.subtle.digest(algorithm,bytes);
    }}
  } : webcrypto;
  const root={indexedDB:factory,crypto,Blob,Uint8Array,TextEncoder,TextDecoder,
    ArrayBuffer,DataView,Date,Promise,Error,Set,Map,JSON,Math,Number,String};
  root.window=root;
  runInNewContext(readFileSync(new URL('../js/paseka-archive.js',import.meta.url),'utf8'),root);
  runInNewContext(source,root);
  return root;
}
async function buildValidArchive(root){
  // The synthetic bytes here are independently built, NOT the Android file.
  // Only its whole-archive digest is substituted in the VM to exercise later
  // storage invariants; payload chunk hashes remain real SHA-256.
  const hives=[{id:'restore335-synthetic-hive'}];
  const videos=fixtures.map((f,i)=>Buffer.from(f.base64,'base64'));
  assert.deepEqual(videos.map(sha),videoHashes);
  const mk=async n=>{
    const state={meta:{schemaVersion:15},hives,records:[{padding:'x'.repeat(n)}]};
    const data=Buffer.from(JSON.stringify({app:'Paseka',state}));
    const entries=[{path:'state.json',kind:'state',size:data.length,mimeType:'application/json',
      chunkSize:1048576,chunkSha256:[sha(data)]}];
    for(let i=0;i<2;i++)entries.push({
      path:'entrance-media/'+String(i+1).padStart(6,'0')+'.blob',
      kind:'entrance_video',size:893,mimeType:'video/mp4',chunkSize:1048576,
      chunkSha256:[videoHashes[i]],metadata:{
        id:ids[i],hiveId:hives[0].id,capturedAt:'2026-11-21T12:00:00Z',
        durationSec:1,width:16,height:16,bytes:893,mimeType:'video/mp4',
        name:ids[i]+'.mp4',status:'waiting_for_server'
      }
    });
    const blob=root.PasekaArchive.buildArchiveBlob({
      format:'paseka-archive',version:1,backupId:'test335-synthetic-only',
      createdAt:'2026-11-21T12:15:00Z',schemaVersion:15,entries
    },[data,...videos]);
    return Buffer.from(await blob.arrayBuffer());
  };
  const initial=await mk(0);
  assert.ok(initial.length<3158,'synthetic archive baseline must fit');
  const final=await mk(3158-initial.length);
  assert.equal(final.length,3158);
  assert.notEqual(sha(final),PIN,'test archive must not be misrepresented as physical archive');
  return Uint8Array.from(final);
}
function req(request){
  return new Promise((res,rej)=>{request.onsuccess=()=>res(request.result);request.onerror=()=>rej(request.error);});
}
async function snapshot(factory,name){
  const db=await new Promise((resolve,reject)=>{
    const q=factory.open(name,1);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
  });
  try{
    const tx=db.transaction(['main','entrance_media'],'readonly');
    return {state:await req(tx.objectStore('main').get('state')),
      videos:await req(tx.objectStore('entrance_media').getAll())};
  }finally{db.close();}
}
test('isolated browser gate: atomic restore, close-reopen and both SHA-pinned MP4',async()=>{
  const root=harness();
  const data=await buildValidArchive(root);
  const proof=await root.PasekaIsolatedRestore335.run(data);
  assert.equal(proof.status,'ISOLATED_RESTORE335_TEST_PASS');
  assert.equal(proof.androidPhysicalTest,false);
  assert.equal(proof.cleanupAuthorized,false);
  const snap=await snapshot(root.indexedDB,root.PasekaIsolatedRestore335.DATABASE);
  assert.equal(snap.state.hives[0].id,'restore335-synthetic-hive');
  assert.deepEqual(snap.videos.map(v=>v.id),ids);
  assert.deepEqual(await Promise.all(snap.videos.map(async v=>sha(Buffer.from(await v.blob.arrayBuffer())))),videoHashes);
  await assert.rejects(root.PasekaIsolatedRestore335.run(data),e=>e.code==='ONE_SHOT_ALREADY_ATTEMPTED');
});
test('isolated browser gate: abort mid-commit preserves completely empty destination',async()=>{
  const root=harness(),data=await buildValidArchive(root);
  await assert.rejects(root.PasekaIsolatedRestore335.run(data,{testOnlyAbortAfterFirst:true}),e=>e.code==='INJECTED_ABORT_TEST_ONLY');
  const snap=await snapshot(root.indexedDB,root.PasekaIsolatedRestore335.DATABASE);
  assert.equal(snap.state,undefined);
  assert.deepEqual(snap.videos,[]);
});
test('isolated browser gate: refuse to overwrite destination state',async()=>{
  const factory=new IDBFactory(),root=harness({factory});
  const db=await new Promise((resolve,reject)=>{
    const q=factory.open(root.PasekaIsolatedRestore335.DATABASE,1);
    q.onupgradeneeded=()=>{q.result.createObjectStore('main');q.result.createObjectStore('entrance_media',{keyPath:'id'});};
    q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
  });
  const tx=db.transaction('main','readwrite');
  const done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
  tx.objectStore('main').put({sentinel:'user-data-is-protected'},'state');
  await done;db.close();
  const data=await buildValidArchive(root);
  await assert.rejects(root.PasekaIsolatedRestore335.run(data),e=>e.code==='DESTINATION_ALREADY_EXISTS');
  const snap=await snapshot(factory,root.PasekaIsolatedRestore335.DATABASE);
  assert.deepEqual(snap.state,{sentinel:'user-data-is-protected'});
  assert.deepEqual(snap.videos,[]);
});
test('isolated browser gate: corrupt input blocks before destination creation',async()=>{
  const root=harness({fakeFullArchivePin:false}),good=await buildValidArchive(root);
  await assert.rejects(root.PasekaIsolatedRestore335.run(good),e=>e.code==='SOURCE_SHA_INVALID');
  const dbs=await root.indexedDB.databases();
  assert.deepEqual(dbs,[]);
});
test('isolated browser gate: never contains deletion, production DB or external access',()=>{
  for(const re of [/deleteDatabase\s*\(/,/\.clear\s*\(/,/\.delete\s*\(/,/\bfetch\s*\(/,/\bXMLHttpRequest\b/,/\bru\.paseka\.journal\b/,/\bpaseka_fileproof_329_v1\b/]){
    assert.doesNotMatch(source,re);
  }
  assert.match(source,/paseka-fileproof335-destination-only-v1/);
  assert.match(source,/cleanupAuthorized:false/);
});

test('browser restart cannot reuse aborted, empty restore335 database',async()=>{
  const factory=new IDBFactory();
  const first=harness({factory}),data=await buildValidArchive(first);
  await assert.rejects(first.PasekaIsolatedRestore335.run(data,{testOnlyAbortAfterFirst:true}),e=>e.code==='INJECTED_ABORT_TEST_ONLY');
  const afterAbort=await snapshot(factory,first.PasekaIsolatedRestore335.DATABASE);
  assert.equal(afterAbort.state,undefined);
  assert.deepEqual(afterAbort.videos,[]);
  const restarted=harness({factory});
  await assert.rejects(restarted.PasekaIsolatedRestore335.run(data),e=>e.code==='DESTINATION_ALREADY_EXISTS');
  const afterRetry=await snapshot(factory,restarted.PasekaIsolatedRestore335.DATABASE);
  assert.equal(afterRetry.state,undefined);
  assert.deepEqual(afterRetry.videos,[]);
});
test('unavailable database inventory blocks before opening restore destination',async()=>{
  const root=harness(),bytes=await buildValidArchive(root);
  root.indexedDB.databases=undefined;
  await assert.rejects(root.PasekaIsolatedRestore335.run(bytes),e=>e.code==='DATABASE_ENUMERATION_REQUIRED');
});

function attachPicker(root) {
  const picker = {}, result = {};
  let change;
  picker.addEventListener = (event, handler) => { if (event === 'change') change = handler; };
  root.document = {getElementById: id => id === 'archive' ? picker : result};
  root.addEventListener = (event, handler) => { if (event === 'DOMContentLoaded') handler(); };
  runInNewContext(readFileSync(new URL('./fixtures/android-restore335-picker.js', import.meta.url), 'utf8'), root);
  return {picker, result, choose: async file => { picker.files = file ? [file] : []; await change(); }};
}

test('picker ignores cancellation and rejects wrong size before reading, wrong SHA before DB', async () => {
  const root = harness({fakeFullArchivePin:false});
  const {choose, picker, result} = attachPicker(root);
  await choose(null);
  await choose({size:10, arrayBuffer(){assert.fail('wrong size must not be read');}});
  assert.equal(picker.value, '');
  await choose(new Blob([new Uint8Array(3158)]));
  assert.equal(JSON.parse(result.textContent).code, 'SOURCE_SHA_INVALID');
  assert.deepEqual(await root.indexedDB.databases(), []);
});

test('picker passes selected bytes through existing restore and reopen checks only once', async () => {
  const root = harness(); // Synthetic complete-archive digest substitution, as in the engine tests.
  const file = new Blob([await buildValidArchive(root)]);
  const {choose, result} = attachPicker(root);
  await Promise.all([choose(file), choose(file)]);
  const report = JSON.parse(result.textContent);
  assert.deepEqual([report.status, report.videoCount, report.cleanupAuthorized], ['PASS', 2, false]);
  const snap = await snapshot(root.indexedDB, root.PasekaIsolatedRestore335.DATABASE);
  assert.deepEqual(await Promise.all(snap.videos.map(async v=>sha(Buffer.from(await v.blob.arrayBuffer())))), videoHashes);
});
