import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const fixture=readFileSync(new URL('./fixtures/android-synthetic-mp4.js',import.meta.url),'utf8');
const runner=readFileSync(new URL('./fixtures/android-synthetic-frame-extraction-runner.js',import.meta.url),'utf8');
const builder=readFileSync(new URL('../scripts/prepare-android-synthetic-frame-apk.mjs',import.meta.url),'utf8');
const actual=readFileSync(new URL('../js/entrance-frame-preparation.js',import.meta.url),'utf8');
test('byte-identical original synthetic MP4 with trusted local SHA',()=>{
 const str=fixture.match(/SYNTHETIC_MP4_BASE64='([^']+)'/)[1];
 const bytes=Buffer.from(str,'base64');
 assert.equal(bytes.length,1720);
 assert.equal(bytes.toString('latin1',4,8),'ftyp');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'29c801c7ffbeabc3796ffd265f8b8e465232c671eeeacfafd8e25e2fb105bd49');
});
test('real frame extraction module, no fabricated inference or cleanup success',()=>{
 assert.match(builder,/copyFileSync\('js\/entrance-frame-preparation\.js'/);
 assert.match(runner,/extractTransientFrames\(record/);
 assert.match(runner,/frameData\.length!==3/);
 assert.match(runner,/SOURCE_CHANGED/);
 assert.match(runner,/recognition:'NOT_TESTED'/);
 assert.match(runner,/cleanup:'NOT_TESTED'/);
 assert.match(actual,/sourceEvidenceVerified:true,recognitionSucceeded:false,cleanupAuthorized:false/);
 for(const text of [runner,builder]){
  for(const pattern of [/MediaStore/,/deleteDatabase/,/getUserMedia/,/XMLHttpRequest/,/fetch\(/,/\.delete\(/,/localStorage/,/FileOutputStream/])
   assert.doesNotMatch(text,pattern);
 }
});
test('new package isolated from prior real phone test packages',()=>{
 assert.match(builder,/ru\.paseka\.journal\.diagnostic\.frametest/);
 assert.match(builder,/PASEKA_FRAME_TEST_BUILD/);
 assert.match(builder,/ORIGINAL_APP_ID_REQUIRED/);
 assert.doesNotMatch(builder,/ru\.paseka\.journal\.diagnostic\.selftest/);
 assert.doesNotMatch(builder,/ru\.paseka\.journal\.diagnostic\.mediatest/);
});
