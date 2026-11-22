import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {IDBFactory} from 'fake-indexeddb';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';

const shareCode=await readFile(new URL('../diagnostics/archive-preflight/share-report.js',import.meta.url),'utf8');
const runnerCode=await readFile(new URL('../diagnostics/archive-preflight/runner.js',import.meta.url),'utf8');
const guardCode=await readFile(new URL('../js/android-archive-preflight.js',import.meta.url),'utf8');
const html=await readFile(new URL('../diagnostics/archive-preflight/index.html',import.meta.url),'utf8');
const expectedPackage='ru.paseka.journal.diagnostic.archivepreflight';
const valid=(status='PASS')=>JSON.stringify({status,packageId:expectedPackage,cleanupAuthorized:false,restoreAuthorized:false,archiveSafe:false});
function fixture({withDatabase=true,plugin=true}={}) {
 const elements={};
 for(const id of ['run','share','result','share-status']) {
  elements[id]={disabled:id==='share',textContent:'',handlers:{},
   addEventListener(event,fn){this.handlers[event]=fn;}};
 }
 const calls=[];
 const share={async share(options){calls.push(options);return {activityType:'test.receiver'};}};
 const window={};
 if(plugin)window.Capacitor={Plugins:{Share:share}};
 const context=vm.createContext({window,document:{getElementById(id){return elements[id]}},
  indexedDB:withDatabase?new IDBFactory():undefined,crypto:webcrypto,TextEncoder,Blob,
  console,setTimeout,clearTimeout});
 vm.runInContext(guardCode,context);
 vm.runInContext(shareCode,context);
 vm.runInContext(runnerCode,context);
 return {elements,calls,window,share};
}
test('two buttons exist; share disabled before user test, and no implicit sending',()=>{
 const f=fixture();
 assert.match(html,/id="run"/);
 assert.match(html,/id="share"[^>]*disabled/);
 assert.match(html,/share-report\.js/);
 assert.equal(f.elements.share.disabled,true);
 assert.equal(f.calls.length,0);
});
test('explicit two-button path invokes native share with exact complete PASS JSON',async()=>{
 const f=fixture();
 await f.elements.run.handlers.click();
 const report=f.elements.result.textContent;
 assert.equal(JSON.parse(report).status,'PASS',report);
 assert.equal(f.elements.share.disabled,false);
 assert.equal(f.calls.length,0,'no automatic transmission after test');
 await f.elements.share.handlers.click();
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].text,report);
 assert.equal(f.calls[0].url,undefined);
 assert.equal(f.elements.result.textContent,report);
 assert.match(f.elements['share-status'].textContent,/не подтвержден|действительно отправлено/);
});
test('BLOCKED result remains shareable as diagnostic evidence',async()=>{
 const f=fixture({withDatabase:false});
 await f.elements.run.handlers.click();
 assert.equal(JSON.parse(f.elements.result.textContent).status,'BLOCKED');
 assert.equal(f.elements.share.disabled,false);
 await f.elements.share.handlers.click();
 assert.equal(f.calls.length,1);
 assert.equal(JSON.parse(f.calls[0].text).status,'BLOCKED');
});
test('native share failure cannot mark result delivered',async()=>{
 const f=fixture();
 await f.elements.run.handlers.click();
 f.window.Capacitor.Plugins.Share={async share(){throw Error('SHARE_CANCELLED');}};
 await f.elements.share.handlers.click();
 assert.match(f.elements['share-status'].textContent,/Отправка не подтверждена/);
 assert.equal(f.elements.share.disabled,false);
});
test('share module validates package, status, JSON and authorization flags before chooser',async()=>{
 const f=fixture();
 const m=f.window.PasekaDiagnosticShare;
 for(const input of ['', '{',valid().replace(expectedPackage,'ru.paseka.journal'),
 JSON.stringify({...JSON.parse(valid()),cleanupAuthorized:true}),
 JSON.stringify({...JSON.parse(valid()),status:'RUNNING'})]) {
  await assert.rejects(m.shareReport(input,f.share));
 }
 assert.equal(f.calls.length,0);
 await m.shareReport(valid('BLOCKED'),f.share);
 assert.equal(f.calls.length,1);
});
test('diagnostic share only targets native chooser; no hidden endpoint or auto clipboard',()=>{
 for(const source of [shareCode,runnerCode]) {
  assert.doesNotMatch(source,/\bfetch\s*\(|\bXMLHttpRequest\b|\.sendBeacon\s*\(|clipboard\.writeText|location\.href\s*=/);
 }
 assert.match(shareCode,/deliveryConfirmed:false/);
});
