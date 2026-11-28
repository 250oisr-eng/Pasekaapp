import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const worker=await readFile(new URL('../cloudflare/worker.js',import.meta.url),'utf8');
const start=worker.indexOf('async function readBoundedBody(');
const end=worker.indexOf('\nfunction allowedRate(',start);
assert.ok(start>=0&&end>start,'Cloudflare bounded reader is present in production Worker');
const readBoundedBody=new Function(worker.slice(start,end)+'\nreturn readBoundedBody;')();

test('Worker body reader counts actual UTF-8 bytes, not JS characters or claimed length',async()=>{
 const good=new Request('https://worker.invalid/',{method:'POST',body:'пчёлы'});
 assert.equal(await readBoundedBody(good,10),'пчёлы');
 const tooLong=new Request('https://worker.invalid/',{method:'POST',body:'пчёлы!'});
 await assert.rejects(readBoundedBody(tooLong,10),e=>e?.code==='BODY_TOO_LARGE');
 const lied=new Request('https://worker.invalid/',{method:'POST',headers:{'content-length':'1'},body:'пчёлы!'});
 await assert.rejects(readBoundedBody(lied,10),e=>e?.code==='BODY_TOO_LARGE');
});
test('Worker reader fails before parsing an oversized declared Content-Length',async()=>{
 const oversized=new Request('https://worker.invalid/',{method:'POST',headers:{'content-length':'90001'},body:'{}'});
 await assert.rejects(readBoundedBody(oversized,90000),e=>e?.code==='BODY_TOO_LARGE');
});
test('Worker reader refuses invalid UTF-8 and malformed Content-Length',async()=>{
 const invalidUtf8=new Request('https://worker.invalid/',{method:'POST',body:new Uint8Array([0xc3,0x28])});
 await assert.rejects(readBoundedBody(invalidUtf8,10),TypeError);
 const invalidLength=new Request('https://worker.invalid/',{method:'POST',headers:{'content-length':'-1'},body:'{}'});
 await assert.rejects(readBoundedBody(invalidLength,10),e=>e?.code==='INVALID_CONTENT_LENGTH');
});
test('Worker updates and tests trigger both read-only quality and debug APK CI, not a release',async()=>{
 const quality=await readFile(new URL('../.github/workflows/quality.yml',import.meta.url),'utf8');
 const android=await readFile(new URL('../.github/workflows/android-debug.yml',import.meta.url),'utf8');
 assert.match(quality,/cloudflare\/\*\*/);
 assert.match(android,/cloudflare\/\*\*/);
 assert.match(quality,/tests\/\*\*/);
 assert.match(android,/tests\/\*\*/);
 assert.doesNotMatch(quality,/gradlew assembleRelease|gh release create/);
 assert.doesNotMatch(android,/gradlew assembleRelease|gh release create/);
});
