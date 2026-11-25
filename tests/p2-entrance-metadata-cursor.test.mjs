import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function load(name,deps){
 const marker='function '+name+'(';
 const start=html.indexOf(marker);
 assert.ok(start>=0,'missing '+name);
 const next=/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
 next.lastIndex=start+marker.length;
 const match=next.exec(html);
 const source=html.slice(start,match?match.index:html.indexOf('</script>',start));
 return new Function('deps','with(deps){return ('+source+');}')(deps);
}

async function database(){
 const factory=new IDBFactory(),name='p2-metadata-read';
 const request=factory.open(name,1);
 request.onupgradeneeded=()=>request.result.createObjectStore('entrance_media',{keyPath:'id'});
 const db=await new Promise((resolve,reject)=>{
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
 return {db,factory,name};
}
async function write(db,records){
 const tx=db.transaction('entrance_media','readwrite');
 for(const item of records)tx.objectStore('entrance_media').add(item);
 await new Promise((resolve,reject)=>{
  tx.oncomplete=resolve;
  tx.onerror=()=>reject(tx.error);
  tx.onabort=()=>reject(tx.error);
 });
}
const hash=async blob=>createHash('sha256').update(Buffer.from(await blob.arrayBuffer())).digest('hex');

test('P2: queue reads only metadata while the original Blob remains byte-exact and previewable after reopen',async t=>{
 const {db,factory,name}=await database();
 let connection=db;
 t.after(()=>{try{connection.close()}catch(_){}});
 const originals=[
  {id:'old',hiveId:'hive-1',capturedAt:'2026-11-21T09:30:00Z',bytes:16384,blob:new Blob([new Uint8Array(16384).fill(5)],{type:'video/mp4'}),status:'waiting_for_server'},
  {id:'new',hiveId:'hive-2',capturedAt:'2026-11-23T08:00:00Z',bytes:8192,blob:new Blob([new Uint8Array(8192).fill(7)],{type:'video/mp4'}),status:'completed',frameQualityCheck:{status:'good'}}
 ];
 const hashes=await Promise.all(originals.map(row=>hash(row.blob)));
 await write(connection,originals);
 const deps={db:connection};
 const listing=load('listEntranceVideos',deps);
 const rows=await listing();
 assert.deepEqual(rows.map(row=>row.id),['new','old']);
 assert.equal(rows.every(row=>!Object.hasOwn(row,'blob')),true,'list must not hold any binary payload');
 assert.equal(rows[0].frameQualityCheck.status,'good');
 assert.equal(rows[0].status,'completed');
 assert.equal(rows[0].bytes,8192);
 assert.equal(rows[1].bytes,16384);
 // Neither the queue operation nor the sorting mutates the source record.
 assert.deepEqual(originals.map(row=>row.id),['old','new']);
 connection.close();
 const req=factory.open(name,1);
 connection=await new Promise((resolve,reject)=>{
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
 deps.db=connection;
 const preview=load('getEntranceVideo',deps);
 const originalNew=await preview('new'),originalOld=await preview('old');
 assert.equal(await hash(originalNew.blob),hashes[1]);
 assert.equal(await hash(originalOld.blob),hashes[0]);
 assert.equal(originalNew.bytes,8192);
 assert.equal(originalOld.bytes,16384);
});

test('P2: queue metadata projection works for old records without optional fields',async t=>{
 const {db}=await database();t.after(()=>db.close());
 await write(db,[{id:'legacy',hiveId:'hive-1',blob:new Blob(['legacy-protected-original'])}]);
 const rows=await load('listEntranceVideos',{db})();
 assert.deepEqual(rows,[{id:'legacy',hiveId:'hive-1'}]);
 const full=await load('getEntranceVideo',{db})('legacy');
 assert.equal(await full.blob.text(),'legacy-protected-original');
});

test('P2: queue listing is readonly and cannot silently recover from transaction failure',async()=>{
 let modes=0;
 const db={transaction(_store,mode){modes++;assert.equal(mode,'readonly');throw new Error('synthetic IndexedDB unavailable')}};
 await assert.rejects(load('listEntranceVideos',{db})(),/synthetic IndexedDB unavailable/);
 assert.equal(modes,1);
});

test('P2: queue list uses incremental cursor, not getAll of all protected originals',()=>{
 const start=html.indexOf('function listEntranceVideos()');
 const end=html.indexOf('function getEntranceVideo(',start);
 assert.ok(start>=0&&end>start);
 const source=html.slice(start,end);
 assert.match(source,/\.openCursor\(\)/);
 assert.doesNotMatch(source,/\.getAll\(\)/);
 assert.match(source,/\{blob,\.\.\.metadata\}/);
 assert.match(source,/tx\.oncomplete/);
 assert.doesNotMatch(source,/\.delete\(|\.clear\(|\.put\(/);
});
