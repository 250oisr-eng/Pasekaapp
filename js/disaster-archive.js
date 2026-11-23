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
 if(value instanceof Blob){let bytes=new Uint8Array(await value.arrayBuffer());return {t:'blob',mime:value.type,size:value.size,b64:b64(bytes)};}
 if(value instanceof ArrayBuffer)return {t:'buffer',b64:b64(new Uint8Array(value))};
 assert(!(ArrayBuffer.isView(value)),'Typed arrays are not supported; export aborted to prevent data loss');
 assert(!seen.has(value),'Circular data; export aborted');
 seen.add(value);
 let result;
 if(Array.isArray(value))result={t:'array',v:await Promise.all(value.map(x=>pack(x,seen)))};
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
 case 'buffer':return fromB64(value.b64).buffer;
 case 'array':assert(Array.isArray(value.v),'Invalid array');return value.v.map(x=>unpack(x,depth+1));
 case 'object':{assert(Array.isArray(value.v),'Invalid object');const target=Object.create(null),keys=new Set();for(const pair of value.v){assert(Array.isArray(pair)&&pair.length===2&&typeof pair[0]==='string'&&!keys.has(pair[0]),'Duplicate object field');keys.add(pair[0]);Object.defineProperty(target,pair[0],{value:unpack(pair[1],depth+1),enumerable:true,writable:true,configurable:true});}return target;}
 default:throw new Error('Unknown archive node type');
 }
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
  const rows=[];
  for(const pair of spec.entries){
   assert(Array.isArray(pair)&&pair.length===2,'Invalid record tuple');
   const key=unpack(pair[0]),value=unpack(pair[1]);
   assert(key!==undefined&&key!==null,'Invalid record key');
   rows.push({key,value});
  }
  restored.set(spec.name,rows);
 }
 const main=restored.get('main').find(x=>x.key==='state')?.value;
 assert(main&&typeof main==='object','Main state is missing');
 if(validateMain)validateMain(main);
 return {rows:restored,main,counts:manifest.counts,sha256:manifest.sha256};
}
async function atomicRestore(db,inspection,expectedRevision){
 assert(inspection&&inspection.rows instanceof Map,'Archive must pass preflight');
 const names=Array.from(db.objectStoreNames);
 assert(JSON.stringify(names.slice().sort())===JSON.stringify(Array.from(inspection.rows.keys()).sort()),'Store inventory changed after preflight');
 return new Promise((resolve,reject)=>{
  let tx,conflict=null,settled=false;
  const fail=e=>{if(!settled){settled=true;reject(e||new Error('Restore transaction aborted'));}};
  try{
   tx=db.transaction(names,'readwrite');
   const main=tx.objectStore('main'),req=main.get('state');
   req.onsuccess=()=>{
    try{
     const revision=req.result?.meta?.revisionId||null;
     if(revision!==expectedRevision){conflict=new Error('Database changed since preflight');tx.abort();return;}
     for(const name of names){
      const store=tx.objectStore(name),rows=inspection.rows.get(name);
      store.clear();
      for(const row of rows){
       if(store.keyPath===null)store.put(row.value,row.key);
       else store.put(row.value);
      }
     }
    }catch(e){conflict=e;try{tx.abort()}catch(_){}}
   };
   req.onerror=()=>{conflict=req.error;try{tx.abort()}catch(_){}};
   tx.oncomplete=()=>{if(!settled){settled=true;resolve(true);}};
   tx.onabort=()=>fail(conflict||tx.error||new Error('Restore rolled back'));
   tx.onerror=()=>fail(conflict||tx.error||new Error('Restore failed'));
  }catch(e){fail(e);}
 });
}
root.PasekaDisasterArchive=Object.freeze({exportArchive,inspectArchive,atomicRestore,format:FORMAT});
})(typeof window!=='undefined'?window:globalThis);
