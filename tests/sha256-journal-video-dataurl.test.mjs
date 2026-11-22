import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root={};
new Function('window',readFileSync('js/paseka-sha256.js','utf8'))(root);
const hash=root.PasekaSha256;
test('journal Data URL SHA matches ordinary Blob and Node SHA for binary with chunk boundaries',async()=>{
 const bytes=new Uint8Array(240021);
 for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
 const dataUrl='data:video/mp4;base64,'+Buffer.from(bytes).toString('base64');
 const result=await hash.hashVideoDataUrlHex(dataUrl);
 const direct=await hash.hashBlobHex(new Blob([bytes]));
 assert.deepEqual(result,{sha256:direct,bytes:bytes.length});
 assert.equal(result.sha256,createHash('sha256').update(bytes).digest('hex'));
});
test('Android octet-stream Data URL is validated as video evidence',async()=>{
 const result=await hash.hashVideoDataUrlHex('data:application/octet-stream;base64,AQID');
 assert.equal(result.bytes,3);
 assert.equal(result.sha256,createHash('sha256').update(Buffer.from([1,2,3])).digest('hex'));
});
for(const source of ['data:video/mp4;base64,','data:video/mp4;base64,!!!!',
  'data:video/mp4;base64,AQ','data:text/plain;base64,AQID','blob:local',
  'data:video/mp4;base64,AAAA!AAA']){
 test('journal SHA rejects invalid source encoding: '+source,async()=>{
  await assert.rejects(hash.hashVideoDataUrlHex(source),error=>
   ['SHA256_VIDEO_DATA_URL_INVALID','SHA256_VIDEO_BASE64_INVALID','SHA256_VIDEO_EMPTY'].includes(error?.code));
 });
}
test('aborted journal SHA stops without returning a success digest',async()=>{
 const controller=new AbortController();
 controller.abort();
 await assert.rejects(hash.hashVideoDataUrlHex('data:video/mp4;base64,AQID',
   {signal:controller.signal}),error=>error?.name==='AbortError');
});
