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
  const fireFetch=async(url,{mode='cors',method='GET',headers=new Headers(),cache='default'}={})=>{
    let responsePromise=null;
    const settled=[];
    const request={url,mode,method,headers,cache};
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
  const sw=harness({existingCaches:['paseka-shell-v313','other-app-cache','paseka-shell-v314','other-project-data']});
  await sw.activate();
  assert.deepEqual(sw.deleted,['paseka-shell-v313','paseka-shell-v314']);
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

test('B11 SW never stores partial HTTP 206 or empty HTTP 204 shell responses',async()=>{
 const h=harness({network:async request=>
  request.url.endsWith('hive-model.js')
   ?new Response('partial JS',{status:206,headers:{'content-range':'bytes 0-9/100'}})
   :new Response(null,{status:204})
 });
 const partial=await h.fireFetch(scope+'js/hive-model.js');
 const empty=await h.fireFetch(scope+'js/voice-session.js');
 assert.equal(partial.status,206);
 assert.equal(empty.status,204);
 assert.deepEqual(h.writes,[],'no incomplete asset may be cached');
});

test('B11 SW refuses redirected HTTP 200 during normal shell fetch caching',async()=>{
 const sw=harness({network:async request=>{
   // A browser-followed redirect can look like successful HTTP 200.
   return {status:200,ok:true,type:'basic',redirected:true,
     headers:new Headers({'cache-control':'public, max-age=300'}),
     clone(){return this;}};
 }});
 const response=await sw.fireFetch(scope+'js/hive-model.js');
 assert.equal(response.status,200,'network response still reaches caller');
 assert.deepEqual(sw.writes,[],'redirected content must not poison offline shell cache');
});

test('B11 query-bearing HTML and JS responses cannot poison canonical offline shell cache',async()=>{
 const sw=harness({network:async request=>new Response('dynamic response:'+request.url)});
 const navigated=await sw.fireFetch(scope+'index.html?token=synthetic-secret',{mode:'navigate'});
 const module=await sw.fireFetch(scope+'js/hive-model.js?session=synthetic-secret');
 assert.equal(navigated.status,200);
 assert.equal(module.status,200);
 assert.equal(sw.writes.length,0,'query response must not enter durable shell cache');
 assert.equal(sw.requests.length,2,'both queries may still be fetched normally online');
});

test('B11 canonical query-free shell resource remains cacheable after query guard',async()=>{
 const sw=harness({network:async()=>new Response('public module')});
 const resource=await sw.fireFetch(scope+'js/hive-model.js');
 assert.equal(resource.status,200);
 assert.equal(sw.writes.length,1);
 assert.equal(sw.writes[0].request,scope+'js/hive-model.js');
});

test('B11 new v327 policy preserves user and future caches and retires only older numeric shell versions',async()=>{
 assert.match(source,/const CACHE='paseka-shell-v327';/);
 assert.match(source,/const CACHE_VERSION=327;/);
 const h=harness({existingCaches:[
  'paseka-shell-v319','paseka-shell-v320','paseka-shell-v321','paseka-shell-v322','paseka-shell-v323',
  'paseka-shell-v324','paseka-shell-v325','paseka-shell-v326','paseka-shell-v327','paseka-shell-v328','paseka-shell-v319-user','other-app-cache'
 ]});
 await h.activate();
 assert.deepEqual(h.deleted,['paseka-shell-v319','paseka-shell-v320','paseka-shell-v321','paseka-shell-v322','paseka-shell-v323','paseka-shell-v324','paseka-shell-v325','paseka-shell-v326']);
 for(const unchanged of ['paseka-shell-v327','paseka-shell-v328','paseka-shell-v319-user','other-app-cache'])
  assert.ok(!h.deleted.includes(unchanged));
});

test('B11 SW bypasses Authorization requests rather than using or populating shared shell cache',async()=>{
 const sw=harness({network:async()=>new Response('sensitive',{status:200})});
 const result=await sw.fireFetch(scope+'js/hive-model.js',{
  headers:new Headers({authorization:'Bearer SYNTHETIC_TEST_ONLY'})
 });
 assert.equal(result,null,'authorized fetch belongs to browser/network, not shared shell cache');
 assert.deepEqual(sw.requests,[]);
 assert.deepEqual(sw.writes,[]);
});

test('B11 SW bypasses HTTP range and explicit no-store requests even for shell paths',async()=>{
 for(const settings of [
  {headers:new Headers({range:'bytes=0-4'})},
  {cache:'no-store'}
 ]){
  const sw=harness();
  const result=await sw.fireFetch(scope+'index.html',settings);
  assert.equal(result,null,'caller-controlled private fetch must bypass SW');
  assert.deepEqual(sw.requests,[]);
  assert.deepEqual(sw.writes,[]);
 }
});

test('B11 ordinary canonical shell GET still uses offline caching',async()=>{
 const sw=harness({network:async()=>new Response('synthetic shell',{status:200})});
 const result=await sw.fireFetch(scope+'js/hive-model.js',{headers:new Headers()});
 assert.equal(await result.text(),'synthetic shell');
 assert.equal(sw.writes.length,1,'security bypass must not disable normal offline caching');
});


test('B11 HTTP 200 with Content-Range must reach caller but never poison offline shell cache',async()=>{
 const sw=harness({network:async()=>new Response('truncated',{status:200,headers:{'content-range':'bytes 0-9/200','cache-control':'public'}})});
 const response=await sw.fireFetch(scope+'js/hive-model.js');
 assert.equal(response.status,200);
 assert.equal(await response.text(),'truncated');
 assert.deepEqual(sw.writes,[]);
});
