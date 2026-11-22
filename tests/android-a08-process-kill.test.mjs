import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {IDBFactory} from 'fake-indexeddb';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';

const runner=await readFile(new URL('../diagnostics/archive-a08/runner.js',import.meta.url),'utf8');
const copy=await readFile(new URL('../diagnostics/archive-a08/copy-report.js',import.meta.url),'utf8');
const html=await readFile(new URL('../diagnostics/archive-a08/index.html',import.meta.url),'utf8');
const nativeSource=await readFile(new URL('../scripts/install-android-a08-native-plugin.mjs',import.meta.url),'utf8');
const PKG='ru.paseka.journal.diagnostic.archivea08v1';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function load(shared) {
 const els={};
 for(const id of ['run','copy','status','result'])els[id]={
  textContent:id==='result'?'NOT_TESTED':'',disabled:id==='copy',handlers:{},
  addEventListener(n,fn){this.handlers[n]=fn;}
 };
 const w={indexedDB:shared.db,crypto:webcrypto,Capacitor:{Plugins:{A08Process:{
  async killSelf({nonce}) {shared.killCalls++;shared.nonce=nonce;shared.processChanged=true;},
  async readProof({nonce}) {return {observed:shared.processChanged&&shared.nonce===nonce,
   nonceMatched:shared.nonce===nonce,processChanged:shared.processChanged};}
 },Clipboard:{async write({string}){shared.copies.push(string);}}}}};
 const ctx=vm.createContext({window:w,document:{getElementById:id=>els[id]},
  indexedDB:shared.db,crypto:webcrypto,TextEncoder,Blob,console});
 vm.runInContext(copy,ctx);vm.runInContext(runner,ctx);
 return {els,w};
}
test('A08 interface preserves exactly two diagnostic actions',()=>{
 assert.match(html,/>Провести тест<\/button>/);
 assert.match(html,/>Копировать результат<\/button>/);
 assert.match(html,/id="copy"[^>]*disabled/);
 assert.doesNotMatch(html,/Отправить результат/);
});
test('A08 two-phase kill/reopen requires native proof and matching SHA before PASS and copy',async()=>{
 const shared={db:new IDBFactory(),killCalls:0,processChanged:false,nonce:null,copies:[]};
 const first=load(shared); await sleep(30);
 assert.equal(first.els.copy.disabled,true);
 await first.els.run.handlers.click();
 assert.equal(shared.killCalls,1);
 assert.equal(first.els.copy.disabled,true,'no PASS before relaunch');
 const second=load(shared);await sleep(55);
 const report=JSON.parse(second.els.result.textContent);
 assert.equal(report.status,'PASS',second.els.result.textContent);
 assert.deepEqual([...report.scenariosVerified],['A08_PROCESS_KILL_SYNTHETIC_ONLY']);
 assert.equal(report.cleanupAuthorized,false);
 assert.equal(report.restoreAuthorized,false);
 assert.equal(report.archiveSafe,false);
 assert.equal(report.androidForceStopVerified,false);
 assert.equal(report.realArchiveRestore,'NOT_TESTED');
 assert.equal(second.els.copy.disabled,false);
 await second.els.copy.handlers.click();
 assert.equal(shared.copies.length,1);
 assert.equal(shared.copies[0],second.els.result.textContent);
});
test('checkpoint without genuine native PID-change proof must BLOCK',async()=>{
 const shared={db:new IDBFactory(),killCalls:0,processChanged:false,nonce:null,copies:[]};
 const first=load(shared); await sleep(30);await first.els.run.handlers.click();
 shared.processChanged=false;
 const next=load(shared);await sleep(55);
 const report=JSON.parse(next.els.result.textContent);
 assert.equal(report.status,'BLOCKED');
 assert.equal(report.code,'A08_PROCESS_KILL_NOT_PROVEN');
 assert.equal(report.processKillVerified,false);
 assert.equal(next.els.copy.disabled,false);
 await next.els.copy.handlers.click();
 assert.equal(JSON.parse(shared.copies[0]).status,'BLOCKED');
});
test('missing native plugin never fakes process-kill PASS',async()=>{
 const shared={db:new IDBFactory(),killCalls:0,processChanged:false,nonce:null,copies:[]};
 const app=load(shared);await sleep(30);
 delete app.w.Capacitor.Plugins.A08Process;
 await app.els.run.handlers.click();
 const report=JSON.parse(app.els.result.textContent);
 assert.equal(report.status,'BLOCKED');assert.equal(shared.killCalls,0);
});
test('native plugin hard-limits kill to its own package and current PID',()=>{
 assert.match(nativeSource,/Process\.killProcess\(pid\)/);
 assert.match(nativeSource,/getContext\(\)\.getPackageName\(\)/);
 assert.match(nativeSource,/registerPlugin\(A08ProcessPlugin\.class\)/);
 assert.match(nativeSource,/SharedPreferences/);
 assert.match(nativeSource,/Process\.myPid\(\)/);
 assert.doesNotMatch(nativeSource,/force-stop|Runtime\.getRuntime|ProcessBuilder/);
});
