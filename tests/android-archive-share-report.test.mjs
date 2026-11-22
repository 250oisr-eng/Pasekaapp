import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {IDBFactory} from 'fake-indexeddb';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';

const copyCode=await readFile(new URL('../diagnostics/archive-preflight/copy-report.js',import.meta.url),'utf8');
const runnerCode=await readFile(new URL('../diagnostics/archive-preflight/runner.js',import.meta.url),'utf8');
const guardCode=await readFile(new URL('../js/android-archive-preflight.js',import.meta.url),'utf8');
const html=await readFile(new URL('../diagnostics/archive-preflight/index.html',import.meta.url),'utf8');
const expectedPackage='ru.paseka.journal.diagnostic.archivepreflight';
const valid=(status='PASS')=>JSON.stringify({status,packageId:expectedPackage,cleanupAuthorized:false,restoreAuthorized:false,archiveSafe:false});
function fixture({withDatabase=true,plugin=true}={}) {
 const elements={};
 for(const id of ['run','copy','result','copy-status']) {
  elements[id]={disabled:id==='copy',textContent:'',handlers:{},
   addEventListener(event,fn){this.handlers[event]=fn;}};
 }
 const calls=[];
 const clipboard={async write(options){calls.push(options);return;}};
 const window={};
 if(plugin)window.Capacitor={Plugins:{Clipboard:clipboard}};
 const context=vm.createContext({window,document:{getElementById(id){return elements[id]}},
  indexedDB:withDatabase?new IDBFactory():undefined,crypto:webcrypto,TextEncoder,Blob,
  console,setTimeout,clearTimeout});
 vm.runInContext(guardCode,context);
 vm.runInContext(copyCode,context);
 vm.runInContext(runnerCode,context);
 return {elements,calls,window,clipboard};
}
test('two buttons exist; copy disabled before user test, and no implicit clipboard copy',()=>{
 const f=fixture();
 assert.match(html,/id="run"/);
 assert.match(html,/id="copy"[^>]*disabled/);
 assert.match(html,/copy-report\.js/);
 assert.equal(f.elements.copy.disabled,true);
 assert.equal(f.calls.length,0);
});
test('two-button path copies exact complete PASS JSON to native clipboard',async()=>{
 const f=fixture();
 await f.elements.run.handlers.click();
 const report=f.elements.result.textContent;
 assert.equal(JSON.parse(report).status,'PASS',report);
 assert.equal(f.elements.copy.disabled,false);
 assert.equal(f.calls.length,0,'no automatic clipboard write after test');
 await f.elements.copy.handlers.click();
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].string,report);
 assert.equal(f.calls[0].text,undefined);
 assert.equal(f.elements.result.textContent,report);
 assert.match(f.elements['copy-status'].textContent,/Результат скопирован/);
});
test('BLOCKED report also copies without losing error evidence',async()=>{
 const f=fixture({withDatabase:false});
 await f.elements.run.handlers.click();
 assert.equal(JSON.parse(f.elements.result.textContent).status,'BLOCKED');
 assert.equal(f.elements.copy.disabled,false);
 await f.elements.copy.handlers.click();
 assert.equal(f.calls.length,1);
 assert.equal(JSON.parse(f.calls[0].string).status,'BLOCKED');
});
test('native clipboard failure cannot report successful copy',async()=>{
 const f=fixture();
 await f.elements.run.handlers.click();
 f.window.Capacitor.Plugins.Clipboard={async write(){throw Error('CLIPBOARD_DENIED');}};
 await f.elements.copy.handlers.click();
 assert.match(f.elements['copy-status'].textContent,/Копирование не выполнено/);
 assert.equal(f.elements.copy.disabled,false);
});
test('copy module validates package, status, JSON and authorization flags before clipboard',async()=>{
 const f=fixture();
 const m=f.window.PasekaDiagnosticCopy;
 for(const input of ['', '{',valid().replace(expectedPackage,'ru.paseka.journal'),
 JSON.stringify({...JSON.parse(valid()),cleanupAuthorized:true}),
 JSON.stringify({...JSON.parse(valid()),status:'RUNNING'})]) {
  await assert.rejects(m.copyReport(input,f.clipboard));
 }
 assert.equal(f.calls.length,0);
 await m.copyReport(valid('BLOCKED'),f.clipboard);
 assert.equal(f.calls.length,1);
});
test('diagnostic copy only targets native clipboard; no hidden endpoint or transmission',()=>{
 for(const source of [copyCode,runnerCode]) {
  assert.doesNotMatch(source,/\bfetch\s*\(|\bXMLHttpRequest\b|\.sendBeacon\s*\(|location\.href\s*=/);
 }
 assert.match(copyCode,/pasted:false/);
});
