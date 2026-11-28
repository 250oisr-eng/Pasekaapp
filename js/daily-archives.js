/* Daily local ZIP files in an independent IDB; no network, no live database writes. */
(function(root){
'use strict';
const DB_NAME='paseka-daily-archives-v1', STORE='files';
const NAME=new TextEncoder().encode('paseka-full-idb.json');
const SLOTS=['latest','previous','staging'];
const MAX_BYTES=256*1024*1024;
// ZIP32 STORE has one local header, central header and end record, with
// the UTF-8 entry name stored twice. The cap applies to the whole ZIP Blob.
const ZIP_OVERHEAD=30+NAME.length+46+NAME.length+22;
function requireOk(ok,message){if(!ok)throw new Error(message);}
const crcTable=Uint32Array.from({length:256},(_,i)=>{let n=i;for(let j=0;j<8;j++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=(crc>>>8)^crcTable[(crc^byte)&255];return (crc^0xffffffff)>>>0;}
function zipHeaders(size,crc){
 const local=new Uint8Array(30+NAME.length),central=new Uint8Array(46+NAME.length),end=new Uint8Array(22);
 let v=new DataView(local.buffer);
 v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);v.setUint16(12,33,true);
 v.setUint32(14,crc,true);v.setUint32(18,size,true);v.setUint32(22,size,true);v.setUint16(26,NAME.length,true);local.set(NAME,30);
 v=new DataView(central.buffer);
 v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x0800,true);v.setUint16(14,33,true);
 v.setUint32(16,crc,true);v.setUint32(20,size,true);v.setUint32(24,size,true);v.setUint16(28,NAME.length,true);central.set(NAME,46);
 v=new DataView(end.buffer);
 v.setUint32(0,0x06054b50,true);v.setUint16(8,1,true);v.setUint16(10,1,true);v.setUint32(12,central.length,true);v.setUint32(16,local.length+size,true);
 return {local,central,end};
}
function encodeZip(raw){
 requireOk(typeof raw==='string'&&raw.length>0&&raw.length<=MAX_BYTES,'Размер архива превышает безопасный предел');
 const bytes=new TextEncoder().encode(raw);
 requireOk(bytes.length<=MAX_BYTES-ZIP_OVERHEAD,'Размер архива превышает безопасный предел');
 const h=zipHeaders(bytes.length,crc32(bytes));
 return new Blob([h.local,bytes,h.central,h.end],{type:'application/zip'});
}
function equal(a,b){return a.length===b.length&&a.every((x,i)=>x===b[i]);}
async function decodeZip(blob){
 requireOk(blob instanceof Blob&&blob.size>=98&&blob.size<=MAX_BYTES,'Некорректный размер ZIP');
 const bytes=new Uint8Array(await blob.arrayBuffer()),v=new DataView(bytes.buffer);
 const size=v.getUint32(18,true),offset=30+NAME.length,central=offset+size;
 requireOk(size>0&&central+46+NAME.length+22===bytes.length,'Неполный ZIP');
 const payload=bytes.subarray(offset,central),h=zipHeaders(size,crc32(payload));
 requireOk(equal(bytes.subarray(0,offset),h.local)&&equal(bytes.subarray(central,central+h.central.length),h.central)&&equal(bytes.subarray(central+h.central.length),h.end),'ZIP CRC32 или структура повреждены');
 return new TextDecoder('utf-8',{fatal:true}).decode(payload);
}
async function sha256(blob){
 requireOk(blob instanceof Blob&&blob.size<=MAX_BYTES,'Некорректный файл архива');
 requireOk(root.crypto?.subtle,'SHA-256 недоступен');
 return Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
}
function validDay(day){return typeof day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day+'T00:00:00Z'))&&new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;}
function openStore(factory=root.indexedDB){
 return new Promise((resolve,reject)=>{
  let settled=false;
  const fail=e=>{if(!settled){settled=true;reject(e);}};
  try{
   const req=factory.open(DB_NAME,1);
   req.onupgradeneeded=()=>{req.result.createObjectStore(STORE,{keyPath:'slot'});};
   req.onblocked=()=>fail(new Error('Хранилище архивов занято'));
   req.onerror=()=>fail(req.error||new Error('Не удалось открыть хранилище архивов'));
   req.onsuccess=()=>{const db=req.result;if(settled){db.close();return;}settled=true;db.onversionchange=()=>db.close();resolve(db);};
  }catch(e){fail(e);}
 });
}
function readAll(db){
 return new Promise((resolve,reject)=>{
  let rows;const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).getAll();
  req.onsuccess=()=>{rows=req.result;};
  tx.oncomplete=()=>resolve(rows);
  tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Чтение архивов прервано'));
 });
}
// Transactional compare-and-swap; another tab cannot replace a generation
// between staging, read-back verification and promotion.
function generation(rows){return JSON.stringify(rows.slice().sort((a,b)=>a.slot.localeCompare(b.slot)).map(r=>[r.slot,r.id,r.sha256,r.day,r.kind,r.targetSha256,r.blob?.size]));}
function mutate(db,expected,action){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),req=store.getAll();let failure;
  req.onsuccess=()=>{try{
   requireOk(generation(req.result)===expected,'Архивы изменились параллельно; повторите позже');
   action(store,req.result);
  }catch(e){failure=e;try{tx.abort();}catch(_){}}};
  tx.oncomplete=()=>resolve();
  tx.onabort=tx.onerror=()=>reject(failure||tx.error||new Error('Запись архивов прервана'));
 });
}
async function verify(row,inspect){
 requireOk(row&&SLOTS.includes(row.slot)&&validDay(row.day)&&typeof row.id==='string'&&row.name==='backup-'+row.day+'.zip','Неверные метаданные архива');
 requireOk(typeof row.sha256==='string'&&/^[a-f0-9]{64}$/.test(row.sha256),'Отсутствует SHA-256 архива');
 requireOk(await sha256(row.blob)===row.sha256,'SHA-256 ZIP не совпадает');
 const raw=await decodeZip(row.blob);
 const proof=await inspect(raw);
 requireOk(proof&&typeof proof.sha256==='string'&&/^[a-f0-9]{64}$/.test(proof.sha256),'Не подтверждена проверка содержимого');
 return {row,raw,proof};
}
async function checked(rows,inspect){
 const result=[];
 for(const slot of ['latest','previous']){
  const row=rows.find(r=>r.slot===slot);
  if(!row){result.push({slot,valid:false,missing:true});continue;}
  try{const item=await verify(row,inspect);result.push({slot,valid:true,day:row.day,id:row.id,name:row.name,sha256:row.sha256});}
  catch(e){result.push({slot,valid:false,day:row.day,id:row.id,error:String(e?.message||e)});}
 }
 return result;
}
async function candidate(raw,day,kind,inspect){
 requireOk(validDay(day),'Некорректная дата архивирования');
 const blob=encodeZip(raw);
 const row={slot:'staging',kind,id:root.crypto.randomUUID(),day,name:'backup-'+day+'.zip',sha256:await sha256(blob),blob};
 await verify(row,inspect);
 return row;
}
async function rotate(db,{day,createRaw,inspect}){
 requireOk(validDay(day)&&typeof createRaw==='function'&&typeof inspect==='function','Некорректные параметры архивирования');
 const before=await readAll(db);
 requireOk(!before.some(r=>r.slot==='staging'&&r.kind==='rollback'),'Сохранена аварийная копия до восстановления; сначала завершите восстановление');
 const status=await checked(before,inspect);
 const good=status.filter(r=>r.valid).sort((a,b)=>b.day.localeCompare(a.day));
 // Clock going backwards must not discard a newer verified generation.
 if(good.some(r=>r.day>=day)){
  if(before.some(r=>r.slot==='staging'))await mutate(db,generation(before),store=>store.delete('staging'));
  return {created:false,status};
 }
 const stage=await candidate(await createRaw(),day,'daily',inspect);
 await mutate(db,generation(before),store=>store.put(stage));
 const stored=await readAll(db),saved=stored.find(r=>r.slot==='staging');
 requireOk(saved?.id===stage.id,'Временный файл был изменён');
 await verify(saved,inspect); // Verify bytes actually read from persistent storage.
 // Only promote after readback. Preserve newest valid previous generation,
 // even when the most recent slot is corrupt. No old slot is touched on failure.
 const keep=good.length?before.find(r=>r.id===good[0].id):null;
 requireOk(generation(stored.filter(r=>r.slot!=='staging'))===generation(before.filter(r=>r.slot!=='staging')),'Архивы изменились до ротации');
 await mutate(db,generation(stored),store=>{
  store.put({...saved,slot:'latest'});
  if(keep)store.put({...keep,slot:'previous'});else store.delete('previous');
  store.delete('staging');
 });
 return {created:true,status:[{slot:'latest',valid:true,day:saved.day,id:saved.id,name:saved.name,sha256:saved.sha256},keep?{...good[0],slot:'previous'}:{slot:'previous',valid:false,missing:true}]};
}
async function getVerified(db,slot,inspect){
 requireOk(['latest','previous'].includes(slot),'Выберите один из двух архивов');
 const rows=await readAll(db);
 return verify(rows.find(r=>r.slot===slot),inspect);
}
// A transient pre-restore safety file. Never discard it if a completed
// restore cannot be verified. No routine daily rotation can overwrite it.
async function prepareRollback(db,raw,day,inspect,targetSha256=null){
 const before=await readAll(db);
 requireOk(!before.some(r=>r.slot==='staging'&&r.kind==='rollback'),'Предыдущее восстановление не подтверждено; аварийная копия сохранена');
 const stage={...await candidate(raw,day,'rollback',inspect),targetSha256};
 await mutate(db,generation(before),store=>store.put(stage));
 const stored=await readAll(db),saved=stored.find(r=>r.slot==='staging');
 requireOk(saved?.id===stage.id,'Аварийная копия изменилась');
 await verify(saved,inspect);
 return stage.id;
}
async function finishRollback(db,id){
 const rows=await readAll(db);
 requireOk(rows.some(r=>r.slot==='staging'&&r.kind==='rollback'&&r.id===id),'Аварийная копия не найдена');
 await mutate(db,generation(rows),store=>store.delete('staging'));
}
// An interrupted restore may leave the safety file behind. Delete it only
// if the current full payload is byte-equivalent to the old or intended
// state, verified again from committed storage. Otherwise keep it.
async function payloadProof(raw){
 const envelope=JSON.parse(raw);
 requireOk(envelope?.manifest?.format==='paseka-idb-full-v1'&&envelope.payload?.database==='paseka-v1','Неверный формат аварийной копии');
 const actual=await sha256(new Blob([JSON.stringify(envelope.payload)]));
 requireOk(actual===envelope.manifest.sha256,'SHA-256 исходных данных не совпадает');
 return {sha256:actual};
}
async function resolveInterruptedRestore(db,currentRaw,inspect){
 const rows=await readAll(db),stage=rows.find(r=>r.slot==='staging'&&r.kind==='rollback');
 if(!stage)return false;
 const old=await verify(stage,payloadProof),current=await payloadProof(currentRaw);
 let resolved=old.proof.sha256===current.sha256;
 if(!resolved&&stage.targetSha256===current.sha256){
  for(const slot of ['latest','previous']){
   const row=rows.find(r=>r.slot===slot);
   if(!row)continue;
   try{if((await verify(row,inspect)).proof.sha256===current.sha256){resolved=true;break;}}catch(_){}
  }
 }
 if(!resolved)return false;
 await mutate(db,generation(rows),store=>store.delete('staging'));
 return true;
}
root.PasekaDailyArchives=Object.freeze({openStore,readAll,checked,rotate,getVerified,prepareRollback,finishRollback,resolveInterruptedRestore,encodeZip,decodeZip,sha256,DB_NAME,MAX_BYTES});
})(typeof window!=='undefined'?window:globalThis);
