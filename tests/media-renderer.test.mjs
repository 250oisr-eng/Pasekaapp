import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../js/paseka-media-renderer.js',import.meta.url),'utf8');
new Function(source)();
const Renderer=globalThis.PasekaMediaRenderer;
const legacy='data:image/jpeg;base64,AQID';

function fakeUrls(){
  let next=0;
  const created=[],revoked=[];
  return {
    created,revoked,
    api:{
      createObjectURL(blob){const url='blob:test-'+(++next);created.push({url,blob});return url},
      revokeObjectURL(url){revoked.push(url)}
    }
  };
}
function mediaStore(record,error){
  return {async getImage(db,id,crypto){if(error)throw error;return record}};
}

test('accepts supported legacy image data URLs without creating object URLs',async()=>{
  const urls=fakeUrls(),resolver=Renderer.create({mediaStore:mediaStore(null),urlApi:urls.api});
  const result=await resolver.resolveImage({kind:'image',data:legacy},{},null);
  assert.deepEqual(result,{status:'ready',src:legacy,storage:'data-url',fallback:false});
  assert.equal(resolver.activeObjectUrlCount,0);
  assert.equal(urls.created.length,0);
});

test('resolves and verifies an IndexedDB Blob through the media store',async()=>{
  const blob=new Blob([new Uint8Array([1,2,3])],{type:'image/jpeg'});
  const urls=fakeUrls(),resolver=Renderer.create({mediaStore:mediaStore({blob}),urlApi:urls.api});
  const result=await resolver.resolveImage({storage:'indexeddb-blob-v1',blobId:'blob-1',data:legacy},{},'crypto');
  assert.equal(result.status,'ready');
  assert.equal(result.storage,'indexeddb-blob-v1');
  assert.equal(result.fallback,false);
  assert.equal(urls.created.length,1);
  assert.equal(urls.created[0].blob,blob);
  assert.equal(resolver.activeObjectUrlCount,1);
});

test('falls back to retained legacy data when the Blob record is missing',async()=>{
  const urls=fakeUrls(),resolver=Renderer.create({mediaStore:mediaStore(null),urlApi:urls.api});
  const result=await resolver.resolveImage({storage:'indexeddb-blob-v1',blobId:'missing',data:legacy},{},null);
  assert.deepEqual(result,{status:'ready',src:legacy,storage:'data-url',fallback:true,reason:'MEDIA_BLOB_MISSING'});
  assert.equal(urls.created.length,0);
});

test('falls back safely when Blob verification fails and exposes no object URL',async()=>{
  const urls=fakeUrls(),resolver=Renderer.create({
    mediaStore:mediaStore(null,{code:'IMAGE_CHECKSUM_MISMATCH'}),
    urlApi:urls.api
  });
  const result=await resolver.resolveImage({storage:'indexeddb-blob-v1',blobId:'tampered',data:legacy},{},null);
  assert.equal(result.src,legacy);
  assert.equal(result.fallback,true);
  assert.equal(result.reason,'IMAGE_CHECKSUM_MISMATCH');
  assert.equal(urls.created.length,0);
});

test('does not expose unsupported schemes or malformed legacy image data',async()=>{
  const resolver=Renderer.create({mediaStore:mediaStore(null),urlApi:fakeUrls().api});
  for(const data of ['javascript:alert(1)','https://example.invalid/image.jpg','data:text/html;base64,PHNjcmlwdD4=','data:image/jpeg;base64,%%%']){
    const result=await resolver.resolveImage({kind:'image',data},{},null);
    assert.equal(result.status,'missing');
    assert.equal(result.src,null);
  }
});

test('rejects invalid Blob IDs and preserves a valid legacy fallback',async()=>{
  const urls=fakeUrls(),resolver=Renderer.create({mediaStore:mediaStore(null),urlApi:urls.api});
  const result=await resolver.resolveImage({storage:'indexeddb-blob-v1',blobId:' '.repeat(3),data:legacy},{},null);
  assert.equal(result.src,legacy);
  assert.equal(result.reason,'INVALID_MEDIA_ID');
});

test('releases each owned object URL once and releaseAll is idempotent',async()=>{
  const urls=fakeUrls(),blob=new Blob([new Uint8Array([7])],{type:'image/png'});
  const resolver=Renderer.create({mediaStore:mediaStore({blob}),urlApi:urls.api});
  const first=await resolver.resolveImage({blobId:'a',storage:'indexeddb-blob-v1'},{},null);
  const second=await resolver.resolveImage({blobId:'b',storage:'indexeddb-blob-v1'},{},null);
  assert.equal(resolver.activeObjectUrlCount,2);
  assert.equal(resolver.release(first.src),true);
  assert.equal(resolver.release(first.src),false);
  assert.deepEqual(urls.revoked,[first.src]);
  assert.equal(resolver.releaseAll(),1);
  assert.equal(resolver.releaseAll(),0);
  assert.deepEqual(urls.revoked,[first.src,second.src]);
  assert.equal(resolver.activeObjectUrlCount,0);
});

test('returns controlled missing state when no legacy fallback exists',async()=>{
  const resolver=Renderer.create({mediaStore:mediaStore(null),urlApi:fakeUrls().api});
  const result=await resolver.resolveImage({storage:'indexeddb-blob-v1',blobId:'absent'},{},null);
  assert.deepEqual(result,{status:'missing',src:null,reason:'MEDIA_BLOB_MISSING'});
});

test('safeLegacyImage rejects empty and oversized data URLs',()=>{
  assert.equal(Renderer.safeLegacyImage('data:image/jpeg;base64,'),false);
  assert.equal(Renderer.safeLegacyImage('data:image/jpeg;base64,AQID'),true);
  assert.equal(Renderer.safeLegacyImage('data:image/svg+xml;base64,PHN2Zz4='),false);
});


function fakeImageNode(index){
  const attributes=new Map([['data-media-index',String(index)]]);
  return {
    src:'',alt:'',classList:{values:new Set(),add(value){this.values.add(value)}},
    getAttribute(name){return attributes.get(name)??null},
    removeAttribute(name){attributes.delete(name)},
    hasAttribute(name){return attributes.has(name)}
  };
}
function fakeContainer(nodes){
  return {
    querySelectorAll(selector){return selector==='img[data-media-index]'?nodes:nodes},
    contains(node){return nodes.includes(node)}
  };
}

test('hydrates Blob-backed images and releases their object URLs when the view is replaced',async()=>{
  const blob=new Blob([new Uint8Array([4,5,6])],{type:'image/png'});
  const urls=fakeUrls(),node=fakeImageNode(0),container=fakeContainer([node]);
  const renderer=Renderer.create({mediaStore:mediaStore({blob}),urlApi:urls.api});
  const count=await renderer.hydrate(container,[{storage:'indexeddb-blob-v1',blobId:'photo-1'}],{},null);
  assert.equal(count,1);
  assert.equal(node.src,'blob:test-1');
  assert.equal(node.hasAttribute('data-media-index'),false);
  assert.equal(renderer.activeObjectUrlCount,1);
  assert.equal(renderer.releaseContainer(container),1);
  assert.deepEqual(urls.revoked,['blob:test-1']);
  assert.equal(renderer.activeObjectUrlCount,0);
});

test('releases a Blob URL when a pending hydration becomes stale',async()=>{
  const blob=new Blob([new Uint8Array([8,9])],{type:'image/png'});
  const urls=fakeUrls(),node=fakeImageNode(0),container=fakeContainer([node]);
  let finishRead;
  const delayedStore={getImage(){return new Promise(resolve=>{finishRead=()=>resolve({blob})})}};
  const renderer=Renderer.create({mediaStore:delayedStore,urlApi:urls.api});
  const pending=renderer.hydrate(container,[{storage:'indexeddb-blob-v1',blobId:'photo-late'}],{},null);
  renderer.releaseContainer(container);
  finishRead();
  assert.equal(await pending,0);
  assert.equal(node.src,'');
  assert.deepEqual(urls.revoked,['blob:test-1']);
  assert.equal(renderer.activeObjectUrlCount,0);
});
