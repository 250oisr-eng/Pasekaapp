import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const scope='https://250oisr-eng.github.io/Pasekaapp/';

function harness({network=async()=>new Response('ok'),existingCaches=[],offlineShell=null}={}){
  const listeners=new Map();
  const requests=[];
  const writes=[];
  const deleted=[];
  const cache={
    addAll:async()=>{},
    match:async(request)=>{
      if(request==='./index.html')return offlineShell;
      return undefined;
    },
    put:async(request,response)=>{writes.push({request:request.url,response});}
  };
  const caches={
    open:async()=>cache,
    keys:async()=>existingCaches,
    delete:async name=>{deleted.push(name);return true;}
  };
  const self={
    location:{origin:new URL(scope).origin},
    registration:{scope},
    addEventListener:(kind,callback)=>listeners.set(kind,callback),
    skipWaiting:async()=>{},
    clients:{claim:async()=>{}}
  };
  const fetch=async request=>{requests.push(request.url);return network(request);};
  vm.runInNewContext(source,{self,caches,fetch,Response,URL});
  const fireFetch=async(url,{mode='cors',method='GET'}={})=>{
    let responsePromise=null;
    const settled=[];
    const request={url,mode,method};
    listeners.get('fetch')({
      request,
      respondWith:promise=>{responsePromise=Promise.resolve(promise);},
      waitUntil:promise=>{settled.push(Promise.resolve(promise));}
    });
    const response=responsePromise?await responsePromise:null;
    await Promise.all(settled);
    return response;
  };
  const activate=async()=>{
    let pending=null;
    listeners.get('activate')({waitUntil:promise=>{pending=promise;}});
    await pending;
  };
  return {fireFetch,activate,requests,writes,deleted};
}

test('P1 SW activation deletes only earlier Paseka caches, never unrelated app caches',async()=>{
  const sw=harness({existingCaches:['paseka-shell-v313','other-app-cache','paseka-shell-v314','paseka-shell-v315','paseka-shell-v316','paseka-shell-v317','paseka-shell-v318','paseka-shell-v319','paseka-shell-v320','paseka-shell-v321','other-project-data']});
  await sw.activate();
  assert.deepEqual(sw.deleted,['paseka-shell-v313','paseka-shell-v314','paseka-shell-v315','paseka-shell-v316','paseka-shell-v317','paseka-shell-v318','paseka-shell-v319','paseka-shell-v320','paseka-shell-v321']);
});

test('P1 SW does not intercept external requests or private non-shell endpoints',async()=>{
  const sw=harness();
  assert.equal(await sw.fireFetch('https://example.org/bee-observations.json'),null);
  assert.equal(await sw.fireFetch('https://250oisr-eng.github.io/AnotherApp/index.html'),null);
  assert.equal(await sw.fireFetch(scope+'private/export.json'),null);
  assert.equal(await sw.fireFetch(scope+'js/hive-model.js',{method:'POST'}),null);
  assert.deepEqual(sw.requests,[]);
  assert.deepEqual(sw.writes,[]);
});

test('P1 SW provides cached index for offline app navigation',async()=>{
  const sw=harness({network:async()=>{throw new Error('offline');},offlineShell:new Response('cached Paseka shell')});
  const response=await sw.fireFetch(scope+'hives/42',{mode:'navigate'});
  assert.equal(await response.text(),'cached Paseka shell');
  assert.deepEqual(sw.writes,[]);
});

test('P1 SW returns a network error instead of HTML for uncached offline JS',async()=>{
  const sw=harness({network:async()=>{throw new Error('offline');},offlineShell:new Response('<html>shell</html>')});
  const response=await sw.fireFetch(scope+'js/hive-model.js');
  assert.equal(response.type,'error');
  assert.deepEqual(sw.writes,[]);
});

test('P1 SW caches successful shell assets but rejects no-store and server failures',async()=>{
  const sw=harness({network:async request=>{
    if(request.url.endsWith('hive-model.js'))return new Response('module');
    if(request.url.endsWith('voice-session.js'))return new Response('secret',{headers:{'cache-control':'no-store'}});
    return new Response('bad',{status:503});
  }});
  assert.equal((await sw.fireFetch(scope+'js/hive-model.js')).status,200);
  assert.equal((await sw.fireFetch(scope+'js/voice-session.js')).status,200);
  assert.equal((await sw.fireFetch(scope+'js/equipment-bodies.js')).status,503);
  assert.equal(sw.writes.length,1);
  assert.equal(sw.writes[0].request,scope+'js/hive-model.js');
});

test('P1 SW preserves project asset allowlist from current main and never includes unshipped v2 modules',()=>{
  const files=source.match(/const FILES=(\[[^;]+\]);/)?.[1]||'';
  assert.ok(files.includes('./js/hive-model.js'));
  assert.ok(files.includes('./js/sectional-operation-coordinator.js'));
  assert.ok(!files.includes('paseka-archive.js'));
  assert.ok(!files.includes('video-archive-v2'));
});

test('P1 SW never caches private or no-store app navigation',async()=>{
  const sw=harness({network:async()=>new Response('<html>private</html>',{
    status:200,headers:{'cache-control':'private, no-store'}
  })});
  const response=await sw.fireFetch(scope+'hives/2',{mode:'navigate'});
  assert.equal(response.status,200);
  assert.deepEqual(sw.writes,[]);
});
