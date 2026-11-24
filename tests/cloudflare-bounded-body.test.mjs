import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../cloudflare/worker.js',import.meta.url),'utf8');
const start=source.indexOf('async function readBoundedBody(request, maxBytes) {');
const end=source.indexOf('\nfunction allowedRate(',start);
assert.ok(start>=0&&end>start,'test must inspect the real Worker streaming reader');
// Only this existing function is evaluated; the rest of the Worker is not executed.
const actualReader=source.slice(start,end).trim();
const readBoundedBody=new Function('TextDecoder','Uint8Array',
  'return ('+actualReader+');')(TextDecoder,Uint8Array);
const req=(body,headers={})=>new Request('https://worker.test/',{method:'POST',body,headers});

test('B08 Cloudflare bound: valid UTF-8 at exact byte threshold is accepted',async()=>{
  assert.equal(new TextEncoder().encode('пчёлы').byteLength,10);
  assert.equal(await readBoundedBody(req('пчёлы'),10),'пчёлы');
  assert.equal(await readBoundedBody(req('{}',{ 'content-length':'2' }),2),'{}');
  assert.equal(await readBoundedBody({headers:new Headers(),body:null},10),'');
});

test('B08 Cloudflare bound: actual streamed bytes are capped, even when Content-Length understates payload',async()=>{
  for(const headers of [{},{'content-length':'1'}]){
    await assert.rejects(readBoundedBody(req('пчёлы!',headers),10),e=>e.code==='BODY_TOO_LARGE');
  }
});

test('B08 Cloudflare bound: large or malformed Content-Length fails before body read',async()=>{
  for(const value of ['11','-1','1e2','NaN','9007199254740992']){
    let accessed=false;
    const request={headers:new Headers({'content-length':value}),get body(){accessed=true;throw Error('should not consume stream');}};
    const expected=value==='11'?'BODY_TOO_LARGE':'INVALID_CONTENT_LENGTH';
    await assert.rejects(readBoundedBody(request,10),e=>e.code===expected);
    assert.equal(accessed,false,'must check header before allocating or reading');
  }
});

test('B08 Cloudflare bound: stream overflow cancels reader and never returns partial data',async()=>{
  let cancelled=false,pulls=0;
  const stream=new ReadableStream({
    pull(controller){
      pulls++;
      controller.enqueue(new Uint8Array([65,66,67]));
      if(pulls>4)controller.close();
    },
    cancel(){cancelled=true;}
  });
  await assert.rejects(readBoundedBody({headers:new Headers(),body:stream},5),e=>e.code==='BODY_TOO_LARGE');
  assert.equal(cancelled,true);
});

test('B08 Cloudflare bound: invalid UTF-8 and invalid stream values fail closed',async()=>{
  await assert.rejects(readBoundedBody(req(new Uint8Array([0xc3,0x28]))),TypeError);
  const badStream={getReader(){return {read:async()=>({done:false,value:undefined}),releaseLock(){},cancel:async()=>{}};}};
  await assert.rejects(readBoundedBody({headers:new Headers(),body:badStream},10),e=>e.code==='BODY_TOO_LARGE');
});

test('B08 Cloudflare bound: request path enforces byte limit before parsing and maps oversize to 413',()=>{
  assert.match(source,/const raw = await readBoundedBody\(request, 270000\);/);
  assert.match(source,/raw\.length > 90000/,'existing text-character limit retained');
  assert.match(source,/error\?\.code === 'BODY_TOO_LARGE'\) return json\([^\n]+413,origin\)/);
  assert.match(source,/return json\(\{error:'Некорректный JSON запроса\.'\},400,origin\)/);
  assert.doesNotMatch(source,/await request\.text\(\)/,'unbounded body read must remain forbidden');
  assert.match(source,/if \(!allowedRate\(userId\)\)/,'existing user rate limit preserved');
  assert.match(source,/if \(!ALLOWED_ORIGINS\.has\(origin\)\)/,'existing CORS guard preserved');
  assert.match(source,/await verifyToken\(/,'existing JWT validation preserved');
});
