import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const capture=html.match(/const item=(\{kind:'video',videoId:uid\(\),name:file\.name\|\|'Видео осмотра\.mp4',type:videoTypeFor\(file\),sourceSha256,sourceBytes:file\.size,data:await fileData\(file\)\})/);
const upload=html.match(/media\.push\((\{kind:'video',videoId:uid\(\),name:f\.name,type:videoTypeFor\(f\),sourceSha256:await PasekaSha256\.hashBlobHex\(f\),sourceBytes:f\.size,data:await fileData\(f\)\})\)/);
test('captured and attached journal videos both receive stable videoId',()=>{
 assert.ok(capture,'camera path must tag video');
 assert.ok(upload,'file picker path must tag video');
});
test('captured and imported videos preserve unique identity and binary payload',async()=>{
 const file={name:'bee.mp4',type:'video/mp4',size:3};
 const digest='a'.repeat(64);
 let count=0;
 const make=async expression=>{
  const run=new Function('uid','file','f','videoTypeFor','fileData','sourceSha256','PasekaSha256',
   'return (async()=>('+expression+'))()');
  return run(()=> 'journal-video-'+(++count),file,file,f=>f.type,async()=> 'data:video/mp4;base64,AAAA',digest,{hashBlobHex:async()=>digest});
 };
 const a=await make(capture[1]),b=await make(upload[1]);
 assert.equal(a.kind,'video');assert.equal(b.kind,'video');
 assert.notEqual(a.videoId,b.videoId);assert.equal(a.data,b.data);
 assert.equal(a.name,file.name);assert.equal(b.name,file.name);
 assert.equal(a.sourceSha256,digest);assert.equal(b.sourceSha256,digest);
 assert.equal(a.sourceBytes,3);assert.equal(b.sourceBytes,3);
});
test('journal changes do not introduce eager cleanup or mutate existing media',()=>{
 assert.match(html,/const combinedMedia=\[\.\.\.\(oldRecord\?\.media\|\|\[\]\),\.\.\.media,\.\.\.pendingRecordMedia\]/);
 assert.match(html,/Автоудаление ещё не подключено|автоудаление ещё не подключено/);
});

test('journal explicitly warns when native Android camera may keep an unmanaged gallery copy',()=>{
 assert.match(html,/Штатная камера может также оставить оригинал в Галерее/);
 assert.match(html,/приложение не может автоматически удалить такую внешнюю копию/);
});

test('source SHA-256 must be computed before the journal media entry is created',()=>{
 assert.match(html,/const sourceSha256=await PasekaSha256\.hashBlobHex\(file\)/);
 assert.match(html,/sourceSha256:await PasekaSha256\.hashBlobHex\(f\)/);
 assert.match(html,/blobSha256=await PasekaSha256\.hashBlobHex\(file\)/);
});
