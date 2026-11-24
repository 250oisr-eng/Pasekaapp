import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../js/disaster-archive.js',import.meta.url),'utf8');
const start=source.indexOf('function getRecords(db){');
const end=source.indexOf('\nasync function exportArchive(db){',start);
assert.ok(start>=0&&end>start,'must run the real full archive snapshot reader');
const getRecords=new Function('assert','return ('+source.slice(start,end)+');')(
 (ok,message)=>{if(!ok)throw new Error(message);}
);

function snapshotHarness(){
 const names=['main','full_backup','entrance_media'];
 const requests=new Map(),storeCalls=[];
 const tx={error:null,objectStore(name){
  storeCalls.push(name);
  const values={result:null,error:null},keys={result:null,error:null};
  requests.set(name,{values,keys});
  return {keyPath:name==='entrance_media'?'id':null,autoIncrement:false,
   getAll(){return values;},getAllKeys(){return keys;}};
 }};
 const db={objectStoreNames:names,version:3,transaction(requested,mode){
  assert.deepEqual(requested,names);
  assert.equal(mode,'readonly');
  return tx;
 }};
 const seed=()=>{for(const [name,{values,keys}] of requests){
  values.result=[{store:name,id:'unchanged'}];
  keys.result=[name==='entrance_media'?'media-1':'state'];
  values.onsuccess();
  keys.onsuccess();
 }};
 return {db,tx,requests,storeCalls,seed};
}

test('B01 export reader does not resolve on getAll/getAllKeys success before transaction complete',async()=>{
 const h=snapshotHarness(),pending=getRecords(h.db);
 let status='pending';
 pending.then(()=>status='resolved',()=>status='rejected');
 h.seed();await Promise.resolve();
 assert.equal(status,'pending');
 h.tx.oncomplete();
 const data=await pending;
 assert.equal(data.version,3);
 assert.equal(data.stores.length,3);
 assert.deepEqual(data.stores.map(row=>row.name),['main','full_backup','entrance_media']);
 assert.deepEqual(h.storeCalls,['main','full_backup','entrance_media']);
});

test('B01 export reader rejects read transaction abort after successful individual IDB requests',async()=>{
 const h=snapshotHarness(),pending=getRecords(h.db);
 h.seed();
 h.tx.error=new Error('simulated read abort');
 h.tx.onabort();
 await assert.rejects(pending,/simulated read abort/);
});

test('B01 export reader rejects transaction error after partial read without publishing snapshot',async()=>{
 const h=snapshotHarness(),pending=getRecords(h.db);
 const first=h.requests.get('main');
 first.values.result=[{meta:{revisionId:'r1'}}];
 first.keys.result=['state'];
 first.values.onsuccess();first.keys.onsuccess();
 h.tx.error=new Error('simulated snapshot transaction failure');
 h.tx.onerror();
 await assert.rejects(pending,/simulated snapshot transaction failure/);
 // Later completion does not resurrect a failed snapshot.
 h.seed();h.tx.oncomplete();
});

test('B01 export reader fails closed on synchronous transaction setup failure',async()=>{
 const db={objectStoreNames:['main','full_backup','entrance_media'],transaction(){
  throw new Error('synthetic storage unavailable');
 }};
 await assert.rejects(getRecords(db),/synthetic storage unavailable/);
});

test('B01 export reader rejects absent required stores without starting a transaction',async()=>{
 let started=false;
 const db={objectStoreNames:['main','full_backup'],transaction(){started=true;throw Error('unreachable');}};
 assert.throws(()=>getRecords(db),/Required IndexedDB stores are missing/);
 assert.equal(started,false);
});

test('B01 export does not publish snapshot on abort after only one getAllKeys success',async()=>{
 const h=snapshotHarness(),pending=getRecords(h.db);
 const only=h.requests.get('entrance_media');
 only.keys.result=['media-1'];
 only.keys.onsuccess();
 h.tx.error=new Error('synthetic quota abort');
 h.tx.onabort();
 await assert.rejects(pending,/synthetic quota abort/);
 h.tx.oncomplete();
});

test('B01 archive reader refuses a missing entrance_media store without any transaction',()=>{
 let attempted=0;
 const db={objectStoreNames:['main','full_backup'],transaction(){attempted++;}};
 assert.throws(()=>getRecords(db),/Required IndexedDB stores are missing/);
 assert.equal(attempted,0);
});

test('B01 export includes extra legacy store in the single atomic readonly snapshot',async()=>{
 const h=snapshotHarness();
 const names=['main','full_backup','entrance_media','historical_custom'];
 const requests=new Map();
 const tx={error:null,objectStore(name){
  const values={result:null},keys={result:null};
  requests.set(name,{values,keys});
  return {keyPath:null,autoIncrement:false,getAll(){return values},getAllKeys(){return keys}};
 }};
 const db={objectStoreNames:names,version:3,transaction(actual,mode){
  assert.deepEqual(actual,names);assert.equal(mode,'readonly');return tx;
 }};
 const promise=getRecords(db);
 for(const [name,x] of requests){x.values.result=[{id:name}];x.keys.result=[name];x.values.onsuccess();x.keys.onsuccess();}
 tx.oncomplete();
 const snapshot=await promise;
 assert.deepEqual(snapshot.stores.map(x=>x.name),names);
 assert.equal(snapshot.stores.at(-1).records[0].id,'historical_custom');
});
