import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const runner=readFileSync('diagnostics/phone-dashboard/runner.js','utf8');
const build=readFileSync('scripts/prepare-android-phone-dashboard.mjs','utf8');
const html=readFileSync('diagnostics/phone-dashboard/index.html','utf8');
test('unique package and explicit build guard',()=>{assert.match(build,/PASEKA_PHONE_DASHBOARD_BUILD/);assert.match(build,/config\.appId!=='ru\.paseka\.journal'/);assert.match(build,/ru\.paseka\.journal\.diagnostic\.phonechecks/);});
test('run and native clipboard controls',()=>{assert.match(html,/id="run"/);assert.match(html,/id="copy"/);assert.match(runner,/Plugins\?\.Clipboard/);});
test('test-only scope and fail closed',()=>{assert.match(runner,/cleanupAuthorized:false,deleteAllowed:false/);assert.match(runner,/realVideos:'NOT_TESTED'/);assert.match(runner,/beeRecognition:'NOT_TESTED'/);assert.match(runner,/onnxWasm:'NOT_TESTED'/);assert.doesNotMatch(runner,/(?:\.delete\s*\(|deleteDatabase\s*\(|\.clear\s*\(|navigator\.mediaDevices|MediaStore|XMLHttpRequest|fetch\s*\()/);});
test('private synthetic IndexedDB only',()=>{assert.match(runner,/paseka-phonechecks-synthetic-v1/);assert.match(runner,/single-synthetic-blob/);assert.match(runner,/new Blob\(\[bytes\]/);assert.match(runner,/crypto\.subtle\.digest/);});
test('no real user media source names',()=>{assert.doesNotMatch(runner,/entrance_media|record_media|fileproof335|archive\.paseka/);assert.match(runner,/externalRequests:'NOT_MEASURED'/);});

test('synthetic fixture SHA256 matches known fixed reference and is actively enforced',async()=>{
 const {createHash}=await import('node:crypto');
 const expected=createHash('sha256').update('paseka-phonechecks-synthetic-v1').digest('hex');
 assert.match(runner,new RegExp("const EXPECTED='"+expected+"'"));
 assert.match(runner,/if\(sha!==EXPECTED\)throw Error\('SYNTHETIC_REFERENCE_HASH_MISMATCH'\)/);
});

test('existing fixture verified before write; rejected values preserved',()=>{
 assert.match(runner,/const existing=await record\(db,'readonly'/);
 assert.match(runner,/PREVIOUS_FIXTURE_NOT_BLOB_PRESERVE/);
 assert.match(runner,/PREVIOUS_FIXTURE_MISMATCH_PRESERVE/);
 assert.match(runner,/previousFixture=existing===undefined\?'ABSENT_CREATED':'PRESENT_VERIFIED'/);
 assert.match(runner,/if\(existing!==undefined\)/);
 assert.match(runner,/\.add\(blob,'single-synthetic-blob'\)/);
 assert.doesNotMatch(runner,/\.put\(blob,'single-synthetic-blob'\)/);
});
