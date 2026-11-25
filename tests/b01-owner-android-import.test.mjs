import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';

const engineCode=await readFile(new URL('../js/disaster-archive.js',import.meta.url),'utf8');
const importerSource=await readFile(new URL('../diagnostics/disaster-phone-proof/owner-archive-runner.js',import.meta.url),'utf8');

function loadEngine(){
 const owner={crypto:webcrypto};
 new Function('window','TextEncoder','Blob','File','atob','btoa',engineCode)(
  owner,TextEncoder,Blob,typeof File==='undefined'?undefined:File,atob,btoa);
 return owner.PasekaDisasterArchive;
}
const engine=loadEngine();
function idbOpen(factory,name,version){
 return new Promise((resolve,reject)=>{
  const q=factory.open(name,version);
  q.onupgradeneeded=()=>{
   q.result.createObjectStore('main');
   q.result.createObjectStore('full_backup');
   q.result.createObjectStore('entrance_media',{keyPath:'id'});
  };
  q.onsuccess=()=>resolve(q.result);
  q.onerror=()=>reject(q.error);
 });
}
async function fixture(){
 const factory=new IDBFactory();
 const db=await idbOpen(factory,'synthetic-readonly-source',3);
 const tx=db.transaction(['main','full_backup'],'readwrite');
 tx.objectStore('main').put({meta:{revisionId:'fixture'},hives:[],families:[],records:[]},'state');
 tx.objectStore('full_backup').put({at:'fake',state:{hives:[]}},'previous');
 await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);});
 const raw=await engine.exportArchive(db);
 db.close();
 const obj=JSON.parse(raw);
 return {raw,bytes:Buffer.from(raw,'utf8'),payloadSha:obj.manifest.sha256};
}
function makeDocument(){
 const map=new Map();
 const elements=[];
 const document={
  createElement(tag){
   const elem={tag,textContent:'',style:{},files:[],value:'',disabled:false,
    handlers:{},children:[],
    append(...nodes){this.children.push(...nodes);for(const node of nodes)if(node.id)map.set(node.id,node);},
    appendChild(node){this.append(node);},
    addEventListener(event,handler){this.handlers[event]=handler;}
   };
   elements.push(elem);
   return elem;
  },
  getElementById(id){return map.get(id)||null},
  body:{append(elem){if(elem.id)map.set(elem.id,elem);}}
 };
 return {document,elements,map};
}
function session({factory,fixtureData,localStorage,simulateBadHash=false}){
 let code=importerSource
  .replace('const EXPECTED_BYTES=299687;', 'const EXPECTED_BYTES='+fixtureData.bytes.length+';')
  .replace('049cec79d7e0a49c5fc2ca33f81d0b9871ca141e8fdf58aecbdd2307c37c98ff',
   simulateBadHash?'0'.repeat(64):createHash('sha256').update(fixtureData.bytes).digest('hex'))
  .replace('bc837c49744e2b03d489f7d35f959afdae717a85b14e828c7eb1763f2252f107',fixtureData.payloadSha);
 const io=makeDocument();
 const reports=[];
 const root={crypto:webcrypto,location:{protocol:'https:'},localStorage,
  PasekaDisasterArchive:engine};
 new Function('window','document','indexedDB','TextDecoder','console',code)(
  root,io.document,factory,TextDecoder,{log(v){reports.push(v);}});
 const file={size:fixtureData.bytes.length,
  async arrayBuffer(){return fixtureData.bytes.buffer.slice(fixtureData.bytes.byteOffset,fixtureData.bytes.byteOffset+fixtureData.bytes.byteLength);}};
 return {root,reports,file,io,async pick(){
  await root.PasekaB01OwnerArchive.start();
  const input=io.elements.find(e=>e.tag==='input');assert.ok(input);
  input.files=[file];await input.handlers.change();
  return JSON.parse(reports.at(-1).split(' ').slice(1).join(' '));
 }};
}
function memoryStorage(){
 const data=new Map();
 return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v))};
}
test('user archive import restores separate empty disposable IndexedDB, readback survives reopening',async()=>{
 const f=await fixture(),factory=new IDBFactory(),storage=memoryStorage();
 const a=session({factory,fixtureData:f,localStorage:storage});
 const initial=await a.pick();
 assert.equal(initial.status,'PASS_TARGET_READBACK_NOT_PROCESS_RESTART');
 assert.equal(initial.code,'REAL_FILE_EMPTY_ANDROID_IDB_RESTORE_PASS');
 assert.deepEqual(initial.storeCounts,{entrance_media:0,full_backup:1,main:1});
 assert.equal(initial.originalPhone,'NOT_ACCESSED');
 assert.equal(initial.processRestart,'NOT_TESTED');
 const b=session({factory,fixtureData:f,localStorage:storage});
 await b.root.PasekaB01OwnerArchive.start();
 const reopened=JSON.parse(b.reports.at(-1).split(' ').slice(1).join(' '));
 assert.equal(reopened.status,'PASS_READBACK_AFTER_RELAUNCH_DEVICE_CLASS_UNVERIFIED');
 assert.equal(reopened.externallyConfirmedForceStop,false);
});
test('wrong file hash fails closed; no disposable DB is created',async()=>{
 const f=await fixture(),factory=new IDBFactory(),storage=memoryStorage();
 const a=session({factory,fixtureData:f,localStorage:storage,simulateBadHash:true});
 const result=await a.pick();
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.code,'UNEXPECTED_FILE_SHA');
 assert.ok(!(await factory.databases()).some(x=>x.name==='paseka-b01-owner-disposable-v1'));
});
test('pre-existing target prevents import and retains its record',async()=>{
 const f=await fixture(),factory=new IDBFactory(),storage=memoryStorage();
 const db=await idbOpen(factory,'paseka-b01-owner-disposable-v1',3);
 const tx=db.transaction('main','readwrite');tx.objectStore('main').put({sentinel:'keep'},'other');
 await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
 db.close();
 const a=session({factory,fixtureData:f,localStorage:storage});
 const result=await a.pick();
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.code,'TARGET_NOT_FRESH_REFUSE_OVERWRITE');
 const check=await idbOpenExisting(factory,'paseka-b01-owner-disposable-v1');
 const item=await new Promise((resolve,reject)=>{const q=check.transaction('main','readonly').objectStore('main').get('other');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 assert.deepEqual(item,{sentinel:'keep'});check.close();
});
async function idbOpenExisting(factory,name){
 return await new Promise((resolve,reject)=>{const q=factory.open(name);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);q.onupgradeneeded=()=>{q.transaction.abort();reject(Error('unexpected create'));};});
}
