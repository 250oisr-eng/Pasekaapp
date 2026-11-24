import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
const SCOPE='https://example.invalid/Pasekaapp/';

function makeInstallHarness({restrictedPath=null,unavailablePath=null}={}){
 const listeners=new Map(),stored=new Map(),calls={skipWaiting:0,network:[],addAll:0};
 const mockResponse=path=>({
  ok:path!==unavailablePath,
  status:path===unavailablePath?404:200,
  type:'basic',
  headers:{get(name){return name.toLowerCase()==='cache-control'&&path===restrictedPath?'private, no-store':'public, max-age=600'}},
  clone(){return this}
 });
 const fetch=async request=>{
  const url=new URL(typeof request==='string'?request:request.url,SCOPE);
  calls.network.push(url.pathname);
  return mockResponse(url.pathname);
 };
 const cache={
  async addAll(files){
   calls.addAll++;
   for(const file of files){
    const response=await fetch(file);
    if(!response.ok)throw Error('Unable to cache shell asset');
    stored.set(new URL(file,SCOPE).pathname,response);
   }
  },
  async put(request,response){stored.set(new URL(typeof request==='string'?request:request.url,SCOPE).pathname,response)},
 };
 const context={self:{
  registration:{scope:SCOPE},
  addEventListener(type,fn){listeners.set(type,fn)},
  skipWaiting(){calls.skipWaiting++;return Promise.resolve()}
 },caches:{open:async()=>cache},fetch,URL,Request};
 vm.runInNewContext(sw,context,{filename:'sw.js'});
 async function install(){
  const work=[];
  const event={waitUntil(p){work.push(Promise.resolve(p))}};
  listeners.get('install')(event);
  assert.equal(work.length,1,'Service Worker install must have one lifecycle promise');
  return Promise.all(work);
 }
 return{install,stored,calls};
}
test('B11 installation refuses private/no-store shell response and never activates',async()=>{
 const path='/Pasekaapp/js/hive-model.js';
 const h=makeInstallHarness({restrictedPath:path});
 await assert.rejects(h.install(),/private|no-store|cache|shell/i);
 assert.equal(h.stored.has(path),false,'restricted response must never enter offline cache');
 assert.equal(h.calls.skipWaiting,0,'incomplete installation must never activate');
});
test('B11 installation refuses missing shell asset rather than activating incomplete offline bundle',async()=>{
 const path='/Pasekaapp/js/disaster-archive.js';
 const h=makeInstallHarness({unavailablePath:path});
 await assert.rejects(h.install(),/missing|non-cacheable|404|shell|cache/i);
 assert.equal(h.calls.skipWaiting,0);
 assert.equal(h.stored.has(path),false);
});
test('B11 installation caches all allowed same-origin shell assets before activation',async()=>{
 const h=makeInstallHarness();
 await h.install();
 assert.equal(h.calls.skipWaiting,1);
 assert.ok(h.stored.has('/Pasekaapp/index.html'));
 assert.ok(h.stored.has('/Pasekaapp/js/disaster-archive.js'));
 assert.ok(h.stored.has('/Pasekaapp/js/hive-model.js'));
 assert.equal(h.calls.network.length,h.stored.size,'each cached asset has an actual network response');
 assert.ok(h.calls.network.every(path=>path.startsWith('/Pasekaapp/')),'no other origin/scope');
});
