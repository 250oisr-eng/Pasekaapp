import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {IDBFactory} from 'fake-indexeddb';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
function source(name){
 const rx=new RegExp('(?:async\\s+)?function\\s+'+name+'\\s*\\(');
 const match=rx.exec(html);
 assert(match,'missing handler '+name);
 const next=/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
 next.lastIndex=match.index+match[0].length;
 const end=next.exec(html);
 if(name==='deleteAllData')return html.slice(match.index,html.indexOf("\ndocument.querySelectorAll(",match.index));
 return html.slice(match.index,end?.index??html.indexOf('</script>',match.index));
}
function load(name,deps={}){return new Function('deps','with(deps){return ('+source(name)+');}')(deps);}
async function indexedDb(){
 const factory=new IDBFactory();
 return new Promise((resolve,reject)=>{
  const q=factory.open('first-use-synthetic',1);
  q.onupgradeneeded=()=>{q.result.createObjectStore('main');q.result.createObjectStore('entrance_media',{keyPath:'id'});};
  q.onerror=()=>reject(q.error);
  q.onsuccess=()=>resolve(q.result);
 });
}

test('startup gate: first launch and broken startup cannot write state or media',async()=>{
 const db={transaction(){throw Error('DATABASE_MUST_NOT_BE_TOUCHED')}};
 const gate={ready:false};
 const block=load('rejectWhileStartupNotReady',{startupWriteGate:gate});
 const deps={startupWriteGate:gate,rejectWhileStartupNotReady:block,db,S:{meta:{revisionId:'stable'},hives:[],families:[],records:[]},alert(){throw Error('NO_ALERT_NEEDED_FOR_SAVE')},saveQueue:Promise.resolve()};
 const before=JSON.stringify(deps.S);
 assert.equal(await load('save',deps)(),false);
 assert.equal(JSON.stringify(deps.S),before,'guard must run before mutation of in-memory state');
 await assert.rejects(load('write',deps)(),{name:'PasekaStartupBlockedError'});
 await assert.rejects(load('putEntranceVideo',deps)({id:'synthetic',blob:new Blob(['synthetic'])}),{name:'PasekaStartupBlockedError'});
 await assert.rejects(load('deleteEntranceVideoBlob',deps)('synthetic'),{name:'PasekaStartupBlockedError'});
 assert.equal(gate.ready,false);
});

test('startup gate: destructive restore, raw export, deletion are blocked before any transaction or confirmation',async()=>{
 const calls=[];const gate={ready:false};
 const deps={startupWriteGate:gate,rejectWhileStartupNotReady:load('rejectWhileStartupNotReady',{startupWriteGate:gate}),alert:message=>calls.push('alert:'+message),confirm:()=>{throw Error('CONFIRM_MUST_NOT_RUN')},prompt:()=>{throw Error('PROMPT_MUST_NOT_RUN')},$:()=>{throw Error('NO_FILE_INPUT_BEFORE_STARTUP')},db:{transaction(){throw Error('NO_TRANSACTION_BEFORE_STARTUP')}},saveQueue:Promise.resolve()};
 for(const fn of ['restoreBackup','restoreAutoBackup','deleteAllData','downloadBackup']) await load(fn,deps)();
 assert.equal(calls.length,4);
 assert(calls.every(text=>text.startsWith('alert:')));
});

test('startup gate: verified first-use state permits normal independent media insert/delete and state write',async()=>{
 const db=await indexedDb(),gate={ready:true};
 const deps={startupWriteGate:gate,rejectWhileStartupNotReady:load('rejectWhileStartupNotReady',{startupWriteGate:gate}),db,S:{meta:{revisionId:'first-use'},hives:[],families:[],records:[]},STORE:'main'};
 await load('write',deps)();
 const first=await new Promise((resolve,reject)=>{const tx=db.transaction('main','readonly'),q=tx.objectStore('main').get('state');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 assert.equal(first.meta.revisionId,'first-use');
 assert.equal(await load('putEntranceVideo',deps)({id:'synthetic-one',blob:new Blob(['synthetic-fixture'])}),true);
 assert.equal(await load('deleteEntranceVideoBlob',deps)('synthetic-one'),true);
 const after=await new Promise((resolve,reject)=>{const tx=db.transaction('entrance_media','readonly'),q=tx.objectStore('entrance_media').count();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 assert.equal(after,0);
 db.close();
});

test('startup gate: failed startup exposes blocking UI and resets write readiness',()=>{
 const elements=new Map(),created=[];
 const doc={
  createElement(tag){
   const el={tag,children:[],style:{},tabIndex:0,attributes:{},textContent:'',focus(){this.focused=true},setAttribute(key,value){this.attributes[key]=value},addEventListener(){},append(...args){this.children.push(...args)},appendChild(child){this.children.push(child)}};
   Object.defineProperty(el,'id',{get(){return this._id},set(value){this._id=value;elements.set(value,this)}});
   created.push(el);return el;
  },
  getElementById:id=>elements.get(id)||null,
  body:{appendChild(node){this.child=node}}
 };
 const gate={ready:true};const show=load('showStartupFailure',{startupWriteGate:gate,document:doc,location:{reload(){}}});
 show(new Error('SIMULATED_FAILED_STORAGE_READ'));
 assert.equal(gate.ready,false);
 const overlay=elements.get('startupFailureOverlay');
 assert(overlay?.focused);
 assert.equal(overlay.attributes.role,'alertdialog');
 assert.equal(overlay.attributes['aria-modal'],'true');
 assert.match(elements.get('startupFailureDetail').textContent,/SIMULATED_FAILED_STORAGE_READ/);
 show(new Error('SECOND_FAILURE'));
 assert.equal(created.filter(x=>x.id==='startupFailureOverlay').length,1,'one overlay only');
 assert.match(elements.get('startupFailureDetail').textContent,/SECOND_FAILURE/);
});

test('startup gate: real bootstrap sets ready only after integrity/migration and resets it on versionchange',()=>{
 const init=html.slice(html.lastIndexOf('(async()=>{'));
 assert(init.includes("const databaseCreatedDuringOpen=await openDB()"));
 const loaded=init.indexOf('const loaded=await read()'),integrity=init.indexOf('validateVirtualApiary()'),backups=init.indexOf('ensureAutomaticBackup(S,existingBackup)');
 const ready=init.indexOf('startupWriteGate.ready=true;');
 assert(loaded>=0&&integrity>loaded&&backups>integrity&&ready>backups,'readiness cannot precede the validated state and backup checks');
 assert.match(init,/catch\(e\)\{showStartupFailure\(e\)/);
 assert.match(source('openDB'),/db\.onversionchange=\(\)=>\{startupWriteGate\.ready=false;/);
 assert.match(source('save'),/if\(rejectWhileStartupNotReady\(\)\)return false;/);
});


test('B01 destructive prompts explicitly exclude standalone entrance videos from JSON and auto copies',()=>{
 assert.match(html,/Обычный JSON-архив НЕ включает отдельные видео летков/);
 assert.match(source('restoreAutoBackup'),/Отдельные видео летков в эту автокопию НЕ входят/);
 assert.match(source('restoreBackup'),/отдельные видео летков в неё НЕ входят/);
 assert.match(source('deleteAllData'),/Без отдельно проверенного полного архива и независимого восстановления/);
});
