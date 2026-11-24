import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';

const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const preparer=fileURLToPath(new URL('../scripts/prepare-p1-oneplus-smoke.mjs',import.meta.url));
const workflow=src('.github/workflows/p1-oneplus-smoke.yml');
const runner=src('diagnostics/p1-oneplus-smoke/runner.js');

function withFixture(fn){
 const dir=mkdtempSync(join(tmpdir(),'paseka-p1smoke-'));
 mkdirSync(join(dir,'www'));
 mkdirSync(join(dir,'diagnostics/p1-oneplus-smoke'),{recursive:true});
 writeFileSync(join(dir,'capacitor.config.json'),JSON.stringify({
  appId:'ru.paseka.journal',appName:'Пасека',webDir:'www',
  android:{allowMixedContent:false}
 }));
 writeFileSync(join(dir,'www/index.html'),'<html><body>ORIGINAL APP</body></html>');
 writeFileSync(join(dir,'diagnostics/p1-oneplus-smoke/runner.js'),runner);
 try{return fn(dir)}finally{rmSync(dir,{recursive:true,force:true})}
}
const run=(dir,extraEnv={})=>spawnSync(process.execPath,[preparer],{
 cwd:dir,encoding:'utf8',env:{...process.env,P1_SOURCE_SHA:'a'.repeat(40),...extraEnv}
});

test('P1 phone test is built under a distinct Android application ID only',()=>{
 withFixture(dir=>{
  const r=run(dir);
  assert.equal(r.status,0,r.stderr+'\n'+r.stdout);
  const cfg=JSON.parse(readFileSync(join(dir,'capacitor.config.json'),'utf8'));
  assert.equal(cfg.appId,'ru.paseka.journal.p1smoke');
  assert.notEqual(cfg.appId,'ru.paseka.journal');
  assert.equal(cfg.webDir,'www');
  assert.equal(cfg.android.allowMixedContent,false);
  const html=readFileSync(join(dir,'www/index.html'),'utf8');
  assert.match(html,/ORIGINAL APP/);
  assert.match(html,/p1-oneplus-smoke-meta\.js/);
  assert.match(html,/p1-oneplus-smoke\.js/);
  const meta=readFileSync(join(dir,'www/p1-oneplus-smoke-meta.js'),'utf8');
  assert.match(meta,/a{40}/);
  assert.match(meta,/TEST_ONLY_READ_ONLY_PHONE_SMOKE/);
  assert.equal(readFileSync(join(dir,'www/p1-oneplus-smoke.js'),'utf8'),runner);
  assert.notEqual(run(dir).status,0,'Duplicate injection must be refused');
 });
});
test('P1 diagnostic refuses unknown production ID and fake commit SHA',()=>{
 withFixture(dir=>{
  const cfg=JSON.parse(readFileSync(join(dir,'capacitor.config.json'),'utf8'));
  cfg.appId='ru.paseka.journal.other';
  writeFileSync(join(dir,'capacitor.config.json'),JSON.stringify(cfg));
  const bad=run(dir);
  assert.notEqual(bad.status,0);
  assert.equal(JSON.parse(readFileSync(join(dir,'capacitor.config.json'),'utf8')).appId,
   'ru.paseka.journal.other');
 });
 withFixture(dir=>{
  const bad=run(dir,{P1_SOURCE_SHA:'not-a-real-sha'});
  assert.notEqual(bad.status,0);
 });
});
test('P1 phone diagnostic workflow cannot install production app or publish',()=>{
 assert.match(workflow,/P1 Isolated OnePlus Smoke APK/);
 assert.match(workflow,/ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
 assert.match(workflow,/P1_SOURCE_SHA/);
 assert.match(workflow,/aapt" dump badging/);
 assert.match(workflow,/ru\.paseka\.journal\.p1smoke/);
 assert.match(workflow,/p1-oneplus-smoke-manifest\.json/);
 assert.match(workflow,/paseka-p1-oneplus-isolated-smoke-apk/);
 assert.doesNotMatch(workflow,/pages\/deploy|deploy-pages|production deploy|pm clear ru\.paseka\.journal\b/);
 assert.doesNotMatch(runner,/indexedDB\.open|readMain\(|writeMain\(|deleteDatabase|\.transaction\(|\.put\(|\.delete\(/);
 assert.match(runner,/independentSecondDeviceArchive:'NOT_VERIFIED'/);
 assert.match(runner,/p1ReleaseReady:false/);
 assert.match(runner,/liveCasBridgeUnshipped/);
});
test('WebView runner reports only isolated module smoke, never fake real phone approval',()=>{
 const logs=[],children=[];
 const doc={
  readyState:'complete',
  createElement(tag){
   const o={tag,style:{},textContent:'',children:[],
    append(...x){this.children.push(...x)},
    addEventListener(){},
    remove(){}};
   return o;
  },
  body:{append(...x){children.push(...x)}}
 };
 const local=new Map();
 const ctx={console:{log:x=>logs.push(String(x))},window:null,document:doc,
  navigator:{onLine:false,clipboard:{writeText:async()=>{}}},
  location:{protocol:'https:',hostname:'localhost'},
  localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)}};
 ctx.window=ctx;
 ctx.PasekaP1SmokeBuild={diagnosticId:'ru.paseka.journal.p1smoke',
  originalId:'ru.paseka.journal',sourceSha:'a'.repeat(40)};
 ctx.PasekaSeasonOperationsWizardV2={descriptors:Array.from({length:14},()=>[])};
 ctx.PasekaSectionalSeasonPhysicalManifestV2={inspectSource(){}};
 ctx.PasekaSectionalPhysicalLayout={validate(){}};
 ctx.PasekaSectionalOP11GuidedV2={plan(){}};
 ctx.PasekaSectionalOP12GuidedV2={plan(){}};
 ctx.PasekaSectionalOP14GuidedV2={plan(){}};
 runInNewContext(src('js/sectional-season-op13-guided-v2.js'),ctx);
 runInNewContext(runner,ctx);
 const row=logs.find(x=>x.startsWith('PASEKA_P1_ONEPLUS_SMOKE_RESULT '));
 assert.ok(row,'No result from Android WebView diagnostic');
 const obj=JSON.parse(row.split('PASEKA_P1_ONEPLUS_SMOKE_RESULT ')[1]);
 assert.equal(obj.status,'PASS',JSON.stringify(obj.checks));
 assert.equal(obj.code,'P1_ISOLATED_PREVIEW_SMOKE_PASS');
 assert.equal(obj.networkReportedByWebView,'OFFLINE');
 assert.equal(obj.p1ReleaseReady,false);
 assert.equal(obj.physicalHiveOperation,'NOT_ATTEMPTED');
 assert.equal(obj.independentSecondDeviceArchive,'NOT_VERIFIED');
 assert.equal(obj.checks.length,12);
 assert.ok(children.length>0);
 ctx.PasekaSectionalPhysicalBrowserCommitV2={commitWitnessed(){}};
 runInNewContext(runner,ctx);
 const last=JSON.parse(logs.at(-1).split('PASEKA_P1_ONEPLUS_SMOKE_RESULT ')[1]);
 assert.equal(last.status,'BLOCKED');
 assert.equal(last.checks.find(x=>x.id==='liveCasBridgeUnshipped').status,'BLOCKED');
});
