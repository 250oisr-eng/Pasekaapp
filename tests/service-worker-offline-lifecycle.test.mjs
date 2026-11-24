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

test('B11 upgrade activation only removes old Paseka shell caches; unrelated caches survive',async()=>{
 const h=harness();
 h.buckets.set('paseka-shell-v316',new Map([['legacy','data']]));
 h.buckets.set('another-app-cache',new Map([['private','untouched']]));
 h.buckets.set('paseka-user-content',new Map([['user-data','untouched']]));
 await h.lifecycle('install');
 assert.equal(h.buckets.has('paseka-shell-v316'),true,'install must not delete old shell');
 assert.equal(h.calls.skipWaiting,1);
 await h.lifecycle('activate');
 assert.equal(h.buckets.has('paseka-shell-v316'),false,'old shell is removed after successful activation');
 assert.equal(h.buckets.has('paseka-shell-v317'),true);
 assert.equal(h.buckets.has('another-app-cache'),true,'other application cache is preserved');
 assert.equal(h.buckets.has('paseka-user-content'),true,'user cache is preserved');
 assert.equal(h.calls.claimed,1);
 assert.deepEqual(h.calls.deleted,['paseka-shell-v316']);
});
