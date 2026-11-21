import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const fixture=readFileSync(new URL('./fixtures/android-synthetic-mp4.js',import.meta.url),'utf8');
const runner=readFileSync(new URL('./fixtures/android-synthetic-mp4-runner.js',import.meta.url),'utf8');
const builder=readFileSync(new URL('../scripts/prepare-android-synthetic-mp4-apk.mjs',import.meta.url),'utf8');
test('fixture is deterministic exact H264 synthetic video, not a real phone recording',()=>{
 const b64=fixture.match(/SYNTHETIC_MP4_BASE64='([^']+)'/)[1];
 const bytes=Buffer.from(b64,'base64');
 assert.equal(bytes.length,1721);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'29c801c7ffbeabc3796ffd265f8b8e465232c671eeeacfafd8e25e2fb105bd49');
 assert.equal(bytes.toString('latin1',4,8),'ftyp');
});
test('isolated package and no external video, network, storage or destructive calls',()=>{
 assert.match(builder,/ru\.paseka\.journal\.diagnostic\.mediatest/);
 assert.match(builder,/SYNTHETIC_MEDIA_BUILD_NOT_AUTHORIZED/);
 assert.match(builder,/ORIGINAL_APP_ID_REQUIRED/);
 assert.match(runner,/ONE_SHOT_ALREADY_ATTEMPTED/);
 assert.match(runner,/MEDIA_ERROR_/);
 assert.match(runner,/DECODER_TIMEOUT/);
 assert.match(runner,/videoDecode:status==='PASS'\?'PASS':'BLOCKED'/);
 for(const pattern of [/MediaStore/,/indexedDB/,/deleteDatabase/,/\.delete\(/,/fetch\(/,/XMLHttpRequest/,/getUserMedia/,/getExternalStorageDirectory/,/FileReader/,/localStorage/])
  assert.doesNotMatch(runner,pattern);
});
