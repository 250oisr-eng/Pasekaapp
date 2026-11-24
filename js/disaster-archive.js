/* P0 isolated full-IndexedDB export and atomic restore. No automatic cleanup. */
(function(root){
'use strict';
const FORMAT='paseka-idb-full-v1';
const enc=new TextEncoder();
function assert(ok,msg){if(!ok)throw new Error(msg);}
function b64(bytes){
 let out='';for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
 return btoa(out);
}
function fromB64(value){
 assert(typeof value==='string'&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value),'Invalid base64');
 const raw=atob(value),arr=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);
 return arr;
}
function hex(arr){return Array.from(arr,x=>x.toString(16).padStart(2,'0')).join('');}
async function sha(value){
 assert(root.crypto&&root.crypto.subtle,'SHA-256 requires secure context');
 return hex(new Uint8Array(await root.crypto.subtle.digest('SHA-256',enc.encode(value))));
}
async function pack(value,seen=new WeakSet()){
 if(value===null||typeof value==='string'||typeof value==='boolean'||(typeof value==='number'&&Number.isFinite(value)))return {t:'primitive',v:value};
 if(value===undefined)return {t:'undefined'};
 assert(typeof value==='object','Unsupported value in archive');
 if(value instanceof Date){assert(!Number.isNaN(value.getTime()),'Invalid date');return {t:'date',v:value.toISOString()};}
 if(typeof File!=='undefined'&&value instanceof File){const bytes=new Uint8Array(await value.arrayBuffer());return {t:'file',name:value.name,modified:value.lastModified,mime:value.type,size:value.size,b64:b64(bytes)};}
 if(value instanceof Blob){const bytes=new Uint8Array(await value.arrayBuffer());return {t:'blob',mime:value.type,size:value.size,b64:b64(bytes)};}
 if(value instanceof ArrayBuffer)return {t:'buffer',b64:b64(new Uint8Array(value))};
 assert(!(ArrayBuffer.isView(value)),'Typed arrays are not supported; export aborted to prevent data loss');
 assert(!seen.has(value),'Circular data; export aborted');
 seen.add(value);
 let result;
 if(Array.isArray(value)){const items=[];for(const item of value)items.push(await pack(item,seen));result={t:'array',v:items};}
 else{
  assert(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null,'Unsupported object prototype');
  const pairs=[];for(const key of Object.keys(value))pairs.push([key,await pack(value[key],seen)]);
  result={t:'object',v:pairs};
 }
 seen.delete(value);return result;
}
function unpack(value,depth=0){
 assert(value&&typeof value==='object'&&typeof value.t==='string'&&depth<200,'Invalid or deep archive node');
 switch(value.t){
 case 'primitive':assert(value.v===null||typeof value.v==='string'||typeof value.v==='boolean'||(typeof value.v==='number'&&Number.isFinite(value.v)),'Invalid primitive');return value.v;
 case 'undefined':return undefined;
 case 'date':assert(typeof value.v==='string'&&!Number.isNaN(Date.parse(value.v)),'Invalid date');return new Date(value.v);
 case 'blob':{const bytes=fromB64(value.b64);assert(Number.isSafeInteger(value.size)&&bytes.length===value.size,'Blob size mismatch');return new Blob([bytes],{type:value.mime||''});}
 case 'file':{assert(typeof File!=='undefined','File objects unavailable in restore environment');const bytes=fromB64(value.b64);assert(Number.isSafeInteger(value.size)&&bytes.length===value.size&&typeof value.name==='string'&&Number.isFinite(value.modified),'File metadata mismatch');return new File([bytes],value.name,{type:value.mime||'',lastModified:value.modified});}
 case 'buffer':return fromB64(value.b64).buffer;
 case 'array':assert(Array.isArray(value.v),'Invalid array');return value.v.map(x=>unpack(x,depth+1));
 case 'object':{assert(Array.isArray(value.v),'Invalid object');const target=Object.create(null),keys=new Set();for(const pair of value.v){assert(Array.isArray(pair)&&pair.length===2&&typeof pair[0]==='string'&&!keys.has(pair[0]),'Duplicate object field');keys.add(pair[0]);Object.defineProperty(target,pair[0],{value:unpack(pair[1],depth+1),enumerable:true,writable:true,configurable:true});}return target;}
 default:throw new Error('Unknown archive node type');
 }
}
// IndexedDB keys only: no Blob access and no asynchronous work inside the
// final write transaction. This fence detects additions/deletions/renames
// across every store after the user inspected the archive.
function keySignature(value){
 if(typeof value==='string')return ['s',value];
 if(typeof value==='number'&&Number.isFinite(value))return ['n',value];
 if(value instanceof Date&&Number.isFinite(value.getTime()))return ['d',value.getTime()];
 if(value instanceof ArrayBuffer)return ['b',b64(new Uint8Array(value))];
 if(ArrayBuffer.isView(value))return ['b',b64(new Uint8Array(value.buffer,value.byteOffset,value.byteLength))];
 if(Array.isArray(value))return ['a',value.map(keySignature)];
 throw new Error('Unsupported IndexedDB key in restore fence');
}
function keyListSignature(keys){
 assert(Array.isArray(keys),'Invalid IndexedDB key enumeration');
 return JSON.stringify(keys.map(keySignature));
}
// Synchronous, deterministic value fence for the final readwrite transaction.
// Blob/File contents cannot be synchronously read inside an IndexedDB transaction;
// this covers metadata only. Equal-size/type binary replacements remain BLOCKED
// from being considered fully protected until a byte-level protocol is added.
function liveValueSignature(value){
 const seen=new WeakSet();
 function node(item,depth){
  assert(depth<200,'Live record too deep for restore fence');
  if(item===null||typeof item==='string'||typeof item==='boolean')return ['p',item];
  if(typeof item==='number'){assert(Number.isFinite(item),'Non-finite live value');return ['n',item];}
  if(item===undefined)return ['u'];
  if(typeof item==='bigint')return ['bigint',item.toString()];
  if(item instanceof Date)return ['date',item.getTime()];
  if(typeof File!=='undefined'&&item instanceof File)return ['file',item.size,item.type,item.name,item.lastModified];
  if(item instanceof Blob)return ['blob-metadata-only',item.size,item.type];
  if(item instanceof ArrayBuffer)return ['buffer',b64(new Uint8Array(item))];
  if(ArrayBuffer.isView(item))return ['view',Object.prototype.toString.call(item),b64(new Uint8Array(item.buffer,item.byteOffset,item.byteLength))];
  assert(item&&typeof item==='object','Unsupported live record in restore fence');
  assert(!seen.has(item),'Cyclic live record; restore aborted');
  seen.add(item);
  let result;
  if(Array.isArray(item))result=['array',item.map(x=>node(x,depth+1))];
  else{
   assert(Object.getPrototypeOf(item)===Object.prototype||Object.getPrototypeOf(item)===null,
    'Unsupported live object prototype in restore fence');
   result=['object',Object.keys(item).sort().map(k=>[k,node(item[k],depth+1)])];
  }
  seen.delete(item);
  return result;
 }
 return JSON.stringify(node(value,0));
}
// Fail closed on ALL live Blob/File values before a destructive rewrite.
// IndexedDB clones Blob handles: synchronous size/type checks cannot prove bytes.
// A newly replaced same-size video would otherwise pass the preflight fence.
// Binary archive imports remain possible into a fresh destination database.
function assertNoLiveBinary(value,storeName){
 const seen=new WeakSet();
 function visit(item,depth){
  assert(depth<200,'Live binary guard record too deep: '+storeName);
  if(item===null||typeof item!=='object')return;
  if(item instanceof Blob)throw new Error('Live binary originals require non-destructive restore: '+storeName);
  if(item instanceof ArrayBuffer||ArrayBuffer.isView(item)||item instanceof Date)return;
  assert(!seen.has(item),'Cyclic live record; restore aborted');
  seen.add(item);
  if(Array.isArray(item))for(const child of item)visit(child,depth+1);
  else{
   assert(Object.getPrototypeOf(item)===Object.prototype||Object.getPrototypeOf(item)===null,
    'Unsupported live record for binary guard: '+storeName);
   for(const key of Object.keys(item))visit(item[key],depth+1);
  }
  seen.delete(item);
 }
 visit(value,0);
}
function snapshotLiveKeys(db){
 const names=Array.from(db.objectStoreNames);
 return new Promise((resolve,reject)=>{
  const observedKeys=Object.create(null),observedValues=Object.create(null);
  let tx,finished=false;
  const fail=e=>{if(!finished){finished=true;reject(e||new Error('Restore snapshot failed'));}};
  try{
   tx=db.transaction(names,'readonly');
   for(const name of names){
    const store=tx.objectStore(name),keys=store.getAllKeys(),values=store.getAll();
    keys.onsuccess=()=>{observedKeys[name]=keys.result;};
    values.onsuccess=()=>{observedValues[name]=values.result;};
    keys.onerror=values.onerror=()=>{try{tx.abort();}catch(_){}fail(store.transaction.error||new Error('Restore snapshot read failed'));};
   }
   tx.oncomplete=()=>{
    if(finished)return;
    try{
     const keySignatures=Object.create(null),valueSignatures=Object.create(null);
     for(const name of names){
      assert(Array.isArray(observedKeys[name])&&Array.isArray(observedValues[name])&&
        observedKeys[name].length===observedValues[name].length,'Incomplete restore snapshot');
      keySignatures[name]=keyListSignature(observedKeys[name]);
      valueSignatures[name]=JSON.stringify(observedValues[name].map(liveValueSignature));
     }
     finished=true;resolve({keys:keySignatures,values:valueSignatures});
    }catch(e){fail(e);}
   };
   tx.onabort=()=>fail(tx.error||new Error('Restore snapshot aborted'));
   tx.onerror=()=>fail(tx.error||new Error('Restore snapshot failed'));
  }catch(e){fail(e);}
 });
}
function getRecords(db){
 const names=Array.from(db.objectStoreNames);
 assert(names.includes('main')&&names.includes('full_backup')&&names.includes('entrance_media'),'Required IndexedDB stores are missing');
 return new Promise((resolve,reject)=>{
  let tx;const stores=[];let failed=false;
  try{
   tx=db.transaction(names,'readonly');
   for(const name of names){
    const store=tx.objectStore(name),item={name,keyPath:store.keyPath,autoIncrement:store.autoIncrement,records:null,keys:null};
    stores.push(item);
    const v=store.getAll(),k=store.getAllKeys();
    v.onsuccess=()=>{item.records=v.result;};
    k.onsuccess=()=>{item.keys=k.result;};
   }
   tx.oncomplete=()=>{if(!failed)resolve({version:db.version,stores});};
   tx.onerror=()=>{failed=true;reject(tx.error||new Error('Snapshot failed'));};
   tx.onabort=()=>{failed=true;reject(tx.error||new Error('Snapshot aborted'));};
  }catch(e){reject(e);}
 });
}
async function exportArchive(db){
 const snap=await getRecords(db);
 const stores=[];
 for(const store of snap.stores){
  assert(store.records&&store.keys&&store.records.length===store.keys.length,'Incomplete IndexedDB snapshot');
  const entries=[];for(let i=0;i<store.records.length;i++)entries.push([await pack(store.keys[i]),await pack(store.records[i])]);
  stores.push({name:store.name,keyPath:store.keyPath,autoIncrement:store.autoIncrement,entries});
 }
 const payload={database:'paseka-v1',version:snap.version,stores};
 const json=JSON.stringify(payload);
 const manifest={format:FORMAT,createdAt:new Date().toISOString(),sha256:await sha(json),counts:Object.fromEntries(stores.map(s=>[s.name,s.entries.length]))};
 return JSON.stringify({manifest,payload});
}
async function inspectArchive(raw,db,validateMain){
 assert(typeof raw==='string','Archive must be text');
 const envelope=JSON.parse(raw);
 assert(envelope&&envelope.manifest&&envelope.payload,'Archive envelope missing');
 const {manifest,payload}=envelope;
 assert(manifest.format===FORMAT,'Unknown archive format');
 assert(payload.database==='paseka-v1'&&payload.version===db.version,'Database version mismatch; do not overwrite');
 assert(Array.isArray(payload.stores)&&payload.stores.length>0,'Archive stores missing');
 assert((await sha(JSON.stringify(payload)))===manifest.sha256,'SHA-256 mismatch');
 const names=Array.from(db.objectStoreNames).sort(),archiveNames=payload.stores.map(s=>s.name).sort();
 assert(JSON.stringify(names)===JSON.stringify(archiveNames),'Archive store inventory differs from application');
 const restored=new Map();
 for(const spec of payload.stores){
  const store=db.transaction([spec.name],'readonly').objectStore(spec.name);
  assert(JSON.stringify(spec.keyPath)===JSON.stringify(store.keyPath)&&spec.autoIncrement===store.autoIncrement,'Store schema mismatch: '+spec.name);
  assert(Array.isArray(spec.entries)&&spec.entries.length===manifest.counts[spec.name],'Archive count mismatch: '+spec.name);
  const rows=[],uniqueKeys=new Set();
  for(const pair of spec.entries){
   assert(Array.isArray(pair)&&pair.length===2,'Invalid record tuple');
   const key=unpack(pair[0]),value=unpack(pair[1]);
   assert(key!==undefined&&key!==null,'Invalid record key');
   const encodedKey=JSON.stringify(pair[0]);
   assert(!uniqueKeys.has(encodedKey),'Duplicate record key in archive: '+spec.name);
   uniqueKeys.add(encodedKey);
   if(store.keyPath!==null){
    assert(typeof store.keyPath==='string'&&store.keyPath.length>0,'Unsupported inline keyPath');
    const inlineKey=store.keyPath.split('.').reduce((item,part)=>item?.[part],value);
    assert(inlineKey!==undefined&&JSON.stringify(inlineKey)===JSON.stringify(key),'Inline record key mismatch: '+spec.name);
   }
   rows.push({key,value});
  }
  restored.set(spec.name,rows);
 }
 const main=restored.get('main').find(x=>x.key==='state')?.value;
 assert(main&&typeof main==='object','Main state is missing');
 if(validateMain)validateMain(main);
 const liveSnapshot=await snapshotLiveKeys(db);
 return {rows:restored,main,counts:manifest.counts,sha256:manifest.sha256,
  liveKeySignatures:liveSnapshot.keys,liveValueSignatures:liveSnapshot.values};
}
async function atomicRestore(db,inspection,expectedRevision){
 assert(inspection&&inspection.rows instanceof Map,'Archive must pass preflight');
 const names=Array.from(db.objectStoreNames);
 assert(JSON.stringify(names.slice().sort())===JSON.stringify(Array.from(inspection.rows.keys()).sort()),'Store inventory changed after preflight');
 assert(inspection.liveKeySignatures&&
   JSON.stringify(Object.keys(inspection.liveKeySignatures).sort())===JSON.stringify(names.slice().sort()),
   'Live store key fence is missing; repeat preflight');
 assert(inspection.liveValueSignatures&&
   JSON.stringify(Object.keys(inspection.liveValueSignatures).sort())===JSON.stringify(names.slice().sort()),
   'Live store value fence is missing; repeat preflight');
 return new Promise((resolve,reject)=>{
  let tx,conflict=null,settled=false;
  const fail=e=>{if(!settled){settled=true;reject(e||new Error('Restore transaction aborted'));}};
  try{
   tx=db.transaction(names,'readwrite');
   const main=tx.objectStore('main'),req=main.get('state');
   const checks=names.map(name=>({name,req:tx.objectStore(name).getAllKeys(),values:tx.objectStore(name).getAll()}));
   let remaining=checks.length*2+1,revisionOk=false;
   const abort=e=>{if(!conflict)conflict=e;try{tx.abort();}catch(_){}};
   const proceed=()=>{
    if(--remaining!==0)return;
    if(!revisionOk)return abort(new Error('Database changed since preflight'));
    try{
     for(const {name,req:keys,values} of checks){
      if(keyListSignature(keys.result)!==inspection.liveKeySignatures[name])
       return abort(new Error('Store keys changed since preflight: '+name));
      if(JSON.stringify(values.result.map(liveValueSignature))!==inspection.liveValueSignatures[name])
       return abort(new Error('Store values changed since preflight: '+name));
      // All stores, including nested records: never overwrite an existing
      // binary without a transaction-safe byte-level comparison.
      for(const value of values.result)assertNoLiveBinary(value,name);
     }
     for(const name of names){
      const store=tx.objectStore(name),rows=inspection.rows.get(name);
      store.clear();
      for(const row of rows){
       if(store.keyPath===null)store.put(row.value,row.key);
       else store.put(row.value);
      }
     }
    }catch(e){abort(e);}
   };
   req.onsuccess=()=>{revisionOk=(req.result?.meta?.revisionId||null)===expectedRevision;proceed();};
   req.onerror=()=>abort(req.error||new Error('Restore revision read failed'));
   for(const {req:keys,values} of checks){
    keys.onsuccess=proceed;
    keys.onerror=()=>abort(keys.error||new Error('Restore key read failed'));
    values.onsuccess=proceed;
    values.onerror=()=>abort(values.error||new Error('Restore value read failed'));
   }
   tx.oncomplete=()=>{if(!settled){settled=true;resolve(true);}};
   tx.onabort=()=>fail(conflict||tx.error||new Error('Restore rolled back'));
   tx.onerror=()=>fail(conflict||tx.error||new Error('Restore failed'));
  }catch(e){fail(e);}
 });
}
// Read-only recovery proof: compare every store, record and binary byte of the
// actual target DB against the archive checksum. It cannot prove that an
// external file was saved or that other databases/files were included.
async function verifyRestoredArchive(db,inspection){
 assert(inspection&&typeof inspection.sha256==='string'&&/^[a-f0-9]{64}$/.test(inspection.sha256),
  'Archive inspection with SHA-256 required for recovery verification');
 const exported=JSON.parse(await exportArchive(db));
 assert(exported.manifest.sha256===inspection.sha256,
  'Restored database differs from archived source bytes');
 const expectedCounts=inspection.counts;
 assert(expectedCounts&&typeof expectedCounts==='object','Archive store counts missing');
 assert(JSON.stringify(exported.manifest.counts)===JSON.stringify(expectedCounts),
  'Restored database record inventory differs from archive');
 return {verified:true,sha256:exported.manifest.sha256,counts:exported.manifest.counts};
}
root.PasekaDisasterArchive=Object.freeze({exportArchive,inspectArchive,atomicRestore,verifyRestoredArchive,format:FORMAT});
})(typeof window!=='undefined'?window:globalThis);
