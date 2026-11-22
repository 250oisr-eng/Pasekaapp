import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {mkdtemp,mkdir,copyFile,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('..',import.meta.url));
const script=fileURLToPath(new URL('../scripts/prepare-web.mjs',import.meta.url));
const html=readFileSync(join(root,'index.html'),'utf8');
const sw=readFileSync(join(root,'sw.js'),'utf8');
const sources=[...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(["'])\.\/js\/([A-Za-z0-9_.-]+\.js)\1/gi)].map(m=>m[2]);
const cached=[...sw.matchAll(/(["'])\.\/js\/([A-Za-z0-9_.-]+\.js)\1/g)].map(m=>m[2]);

test('P2: exactly the JS files loaded by the runtime are cached offline',()=>{
 assert.ok(sources.length>=20,'unexpectedly empty or reduced runtime module set');
 assert.equal(new Set(sources).size,sources.length,'duplicate HTML runtime script');
 assert.deepEqual([...new Set(sources)].sort(),[...new Set(cached)].sort());
 for(const file of sources)assert.equal(existsSync(join(root,'js',file)),true,file);
 assert.equal(sources.some(name=>name.startsWith('video-archive-v2-')),false,
  'unactivated PASEKA02 prototypes must not be included in runtime shell');
});

test('P2: prepare-web copies only necessary JS and removes stale generated prototypes',async t=>{
 const temp=await mkdtemp(join(tmpdir(),'p2-web-assets-'));
 t.after(async()=>rm(temp,{recursive:true,force:true}));
 await mkdir(join(temp,'js'),{recursive:true});
 await mkdir(join(temp,'www','js'),{recursive:true});
 await mkdir(join(temp,'icons'),{recursive:true});
 for(const name of ['index.html','sw.js','manifest.webmanifest'])await copyFile(join(root,name),join(temp,name));
 await copyFile(join(root,'icons/paseka.svg'),join(temp,'icons/paseka.svg'));
 for(const file of sources)await copyFile(join(root,'js',file),join(temp,'js',file));
 const isolated='video-archive-v2-guard.js';
 await copyFile(join(root,'js',isolated),join(temp,'js',isolated));
 await writeFile(join(temp,'www/js/stale-prototype.js'),'should not be packaged');
 const run=spawnSync(process.execPath,[script],{cwd:temp,encoding:'utf8',timeout:10000});
 assert.equal(run.status,0,run.stderr||run.stdout);
 assert.match(run.stdout,new RegExp('P2_ANDROID_RUNTIME_SCRIPTS='+sources.length));
 const packaged=(await readdir(join(temp,'www/js'))).sort();
 assert.deepEqual(packaged,[...sources].sort());
 for(const file of sources){
  assert.deepEqual(await readFile(join(temp,'www/js',file)),await readFile(join(root,'js',file)),file);
 }
 assert.equal(existsSync(join(temp,'www/js',isolated)),false);
 assert.equal(existsSync(join(temp,'www/js/stale-prototype.js')),false);
 assert.equal(existsSync(join(temp,'js',isolated)),true,'prototype source remains available for offline tests');

 const modified=sw.replace('./js/hive-model.js','./js/missing-runtime-script.js');
 assert.notEqual(modified,sw);
 await writeFile(join(temp,'sw.js'),modified);
 const rejected=spawnSync(process.execPath,[script],{cwd:temp,encoding:'utf8',timeout:10000});
 assert.notEqual(rejected.status,0,'mismatched runtime/cache inventory must fail closed');
 assert.match(rejected.stderr,/Runtime scripts and offline Service Worker cache are inconsistent/);
 // Invalid input must not overwrite the already generated, valid assets.
 assert.deepEqual((await readdir(join(temp,'www/js'))).sort(),packaged);
});

test('P2: Android CI reports measured APK and web runtime bytes from the built artifact',()=>{
 const workflow=readFileSync(join(root,'.github/workflows/android-debug.yml'),'utf8');
 const scriptSource=readFileSync(join(root,'scripts/report-p2-package-footprint.mjs'),'utf8');
 assert.match(workflow,/scripts\/report-p2-package-footprint\.mjs/);
 assert.match(workflow,/name: Report P2 package footprint\s*\n\s*run: node scripts\/report-p2-package-footprint\.mjs/);
 assert.ok(workflow.indexOf('Build debug APK')<workflow.indexOf('Report P2 package footprint'));
 assert.ok(workflow.indexOf('Report P2 package footprint')<workflow.indexOf('Upload APK'));
 for(const term of ['P2_APK_BYTES','P2_RUNTIME_JS_BYTES','P2_SOURCE_JS_BYTES','P2_OMITTED_ISOLATED_JS_BYTES'])
  assert.match(scriptSource,new RegExp(term));
});
