import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../sw.js',import.meta.url),'utf8');
const scope='https://example.invalid/Pasekaapp/';
const resolve=value=>new URL(typeof value==='string'?value:value.url,scope).href;

function harness(){
 const handlers=new Map();
 const buckets=new Map();
 const calls={skipWaiting:0,claimed:0,deleted:[],responded:0,network:0};
 let offline=false;
 const publicResponse=url=>({
  ok:true,type:'basic',url,
  headers:{get:()=> 'public, max-age=600'},
  clone(){return this}
 });
 const caches={
  async open(name){
   if(!buckets.has(name))buckets.set(name,new Map());
   const entries=buckets.get(name);
   return {
    async put(key,value){entries.set(resolve(key),value)},
    async match(key){return entries.get(resolve(key))},
   };
  },
  async keys(){return [...buckets.keys()]},
  async delete(name){calls.deleted.push(name);return buckets.delete(name)}
 };
 const fetch=async request=>{
  calls.network++;
  if(offline)throw new Error('offline');
  return publicResponse(resolve(request));
 };
 const self={
  registration:{scope},
  addEventListener(name,cb){handlers.set(name,cb)},
  skipWaiting(){calls.skipWaiting++;return Promise.resolve()},
  clients:{claim(){calls.claimed++;return Promise.resolve()}}
 };
 const Response={error(){return {ok:false,type:'error'}}};
 vm.runInNewContext(source,{self,caches,fetch,URL,Response},{filename:'sw.js'});
 async function lifecycle(name){
  const promises=[];
  handlers.get(name)({waitUntil(p){promises.push(Promise.resolve(p))}});
  assert.equal(promises.length,1,name+' must register one lifecycle promise');
  await Promise.all(promises);
 }
 async function request(path,{mode='navigate',method='GET'}={}){
  const waits=[];
  let responsePromise=null;
  const event={
   request:{url:new URL(path,scope).href,method,mode},
   waitUntil(p){waits.push(Promise.resolve(p))},
   respondWith(p){calls.responded++;responsePromise=Promise.resolve(p)}
  };
  handlers.get('fetch')(event);
  if(!responsePromise)return {intercepted:false};
  const result=await responsePromise;
  await Promise.all(waits);
  return {intercepted:true,result};
 }
 return {lifecycle,request,calls,buckets,setOffline(value){offline=value},publicResponse};
}

test('B11 cold offline navigation serves installed shell without network and never intercepts user API',async()=>{
 const h=harness();
 await h.lifecycle('install');
 await h.lifecycle('activate');
 h.setOffline(true);
 const before=h.calls.network;
 const home=await h.request('./');
 assert.equal(home.intercepted,true);
 assert.equal(home.result.ok,true);
 assert.equal(h.calls.network,before+1,'navigation attempts network then falls back to installed shell');
 assert.equal((await h.request('./api/private-video')).intercepted,true,'app navigation is shell fallback only');
 assert.equal((await h.request('./api/private-video',{mode:'cors'})).intercepted,false,'API requests must bypass SW cache');
 assert.equal((await h.request('https://other.invalid/')).intercepted,false);
 assert.equal((await h.request('./index.html',{method:'POST'})).intercepted,false);
});

test('B11 activation removes obsolete numeric shell versions only, preserving user and future caches',async()=>{
 const h=harness();
 h.buckets.set('paseka-shell-v315',new Map([['legacy315','data']]));
 h.buckets.set('paseka-shell-v316',new Map([['legacy316','data']]));
 h.buckets.set('paseka-shell-v317',new Map([['legacy317','data']]));
 h.buckets.set('another-app-cache',new Map([['private','untouched']]));
 h.buckets.set('paseka-user-content',new Map([['user-data','untouched']]));
 h.buckets.set('paseka-shell-user-content',new Map([['user-data','untouched']]));
 h.buckets.set('paseka-shell-v317-user-backup',new Map([['user-data','untouched']]));
 h.buckets.set('paseka-shell-v319',new Map([['future','untouched']]));
 h.buckets.set('paseka-shell-v99999999999999999999999',new Map([['unknown','untouched']]));
 await h.lifecycle('install');
 for(const version of [315,316,317]){
  assert.equal(h.buckets.has('paseka-shell-v'+version),true,'install must not evict v'+version);
 }
 assert.equal(h.calls.skipWaiting,1);
 await h.lifecycle('activate');
 for(const version of [315,316,317]){
  assert.equal(h.buckets.has('paseka-shell-v'+version),false,'obsolete v'+version+' must be removed');
 }
 assert.equal(h.buckets.has('paseka-shell-v318'),true,'current shell installed');
 for(const cache of ['another-app-cache','paseka-user-content','paseka-shell-user-content',
  'paseka-shell-v317-user-backup','paseka-shell-v319','paseka-shell-v99999999999999999999999']){
  assert.equal(h.buckets.has(cache),true,'do not delete unrelated/user/future cache '+cache);
 }
 assert.equal(h.calls.claimed,1);
 assert.deepEqual(h.calls.deleted,['paseka-shell-v315','paseka-shell-v316','paseka-shell-v317']);
});
