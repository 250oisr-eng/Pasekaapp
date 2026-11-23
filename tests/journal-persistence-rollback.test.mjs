import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf("$('recordForm').onsubmit=async e=>{");
const end=html.indexOf('\n\nconst FRAME_TYPES=',start);
assert.ok(start>=0&&end>start,'production journal submission handler must exist');
const handlerSource=html.slice(start,end);

function fixture({saveResults=[true],confirmed=true,existing=null,type='Обработка',varroa=true,date='2026-11-23',suggestThrows=false,renderThrows=false}={}){
 const ids=[...new Set([...handlerSource.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]))];
 const elements=Object.fromEntries(ids.map(id=>[id,{value:'',disabled:false,dataset:{},files:[],closed:false,close(){this.closed=true}}]));
 elements.rtype.value=type;
 elements.rdate.value=date;
 elements.rhive.value='h1';
 elements.rhive.disabled=true;
 elements.recordId.value=existing?.id||'';
 elements.recordForm.dataset.varroaTreatmentDraft=varroa?'1':'';
 elements.rtreatmentActive.value='Щавелевая кислота';
 elements.rtreatmentMethod.value='Сублимация сублиматором';
 const startingState={hives:[{id:'h1',number:1}],families:[],records:existing?[structuredClone(existing)]:[],tasks:[],meta:{revisionId:'original'}};
 const alerts=[];
 let saveCalls=0,confirmCalls=0,renderCalls=0,seq=0;
 const env={
  state:startingState,
  get:id=>elements[id],
  uid:()=> 'synthetic-record-'+(++seq),
  save:async()=>{const result=saveResults[Math.min(saveCalls,saveResults.length-1)];saveCalls++;if(result instanceof Error)throw result;return result},
  confirm:()=>{confirmCalls++;return confirmed},
  alert:message=>alerts.push(message),
  render:()=>{renderCalls++;if(renderThrows)throw Error('simulated UI rendering failure')},
  suggest:()=>{if(suggestThrows)throw Error('simulated expansion failure')},
  validate:()=>({ok:true})
 };
 const factory=new Function('env',[
  'let S=env.state; const $=env.get; const videoRecorder=null; const pendingRecordMedia=[];',
  'const uid=env.uid,save=env.save,confirm=env.confirm,alert=env.alert,render=env.render; const today=()=>"2026-11-23";',
  'const cloneApiaryState=()=>structuredClone(S);',
  'const createExpansionSuggestion=env.suggest,validateJournalRecordDraft=env.validate;',
  'const prepareImage=async()=>{throw Error("unexpected file")},getVideoDuration=async()=>0;',
  'const videoTypeFor=()=>"",fileData=async()=>"";',
  handlerSource,
  "return {submit:()=>$('recordForm').onsubmit({preventDefault(){}}),getState:()=>S};"
 ].join('\n'));
 const runner=factory(env);
 return {runner,elements,alerts,get saveCalls(){return saveCalls},get confirmCalls(){return confirmCalls},get renderCalls(){return renderCalls},startingState};
}

test('failed IndexedDB save leaves Varroa form open and restores all in-memory changes',async()=>{
 const f=fixture({saveResults:[false]});
 const initial=structuredClone(f.startingState);
 await f.runner.submit();
 assert.deepEqual(f.runner.getState(),initial);
 assert.equal(f.elements.recordDlg.closed,false);
 assert.equal(f.elements.rhive.disabled,true);
 assert.equal(f.elements.recordForm.dataset.varroaTreatmentDraft,'1');
 assert.equal(f.saveCalls,1);
 assert.equal(f.renderCalls,1);
 assert.match(f.alerts.at(-1),/не сохранена/i);
});

test('user refusal never writes or creates a treatment',async()=>{
 const f=fixture({confirmed:false});
 await f.runner.submit();
 assert.equal(f.saveCalls,0);
 assert.equal(f.confirmCalls,1);
 assert.deepEqual(f.runner.getState().records,[]);
 assert.equal(f.elements.recordDlg.closed,false);
});

test('success closes form only after committed save and leaves unknown treatment doses empty',async()=>{
 const f=fixture();
 await f.runner.submit();
 assert.equal(f.saveCalls,1);
 assert.equal(f.elements.recordDlg.closed,true);
 assert.equal(f.elements.recordForm.dataset.varroaTreatmentDraft,'');
 assert.equal(f.runner.getState().records.length,1);
 const item=f.runner.getState().records[0];
 assert.equal(item.type,'Обработка');
 assert.equal(item.treatmentActive,'Щавелевая кислота');
 assert.equal(item.treatmentMethod,'Сублимация сублиматором');
 assert.equal(item.treatmentDose,'');
 assert.equal(item.treatmentWaiting,'');
 assert.equal(f.runner.getState().tasks.length,0);
});

test('retry after a rejected save inserts exactly one record',async()=>{
 const f=fixture({saveResults:[false,true]});
 await f.runner.submit();
 assert.equal(f.runner.getState().records.length,0);
 await f.runner.submit();
 assert.equal(f.runner.getState().records.length,1);
 assert.equal(f.saveCalls,2);
 assert.equal(f.elements.recordDlg.closed,true);
});

test('failed edit preserves an existing journal record and metadata',async()=>{
 const original={id:'archived-id',date:'2026-01-20',type:'Обработка',hive:'h1',family:'',text:'old note',treatmentDose:'historical dose',media:[],notes:'preserve'};
 const f=fixture({saveResults:[false],existing:original,varroa:false});
 const prior=structuredClone(f.startingState);
 await f.runner.submit();
 assert.deepEqual(f.runner.getState(),prior);
 assert.equal(f.elements.recordDlg.closed,false);
 assert.equal(f.confirmCalls,0);
});

test('ordinary inspection save failure also rolls back, without Varroa confirmation',async()=>{
 const f=fixture({saveResults:[false],type:'Осмотр',varroa:false});
 const prior=structuredClone(f.startingState);
 await f.runner.submit();
 assert.deepEqual(f.runner.getState(),prior);
 assert.equal(f.elements.recordDlg.closed,false);
 assert.equal(f.confirmCalls,0);
});

test('production ordering: snapshot before mutation and persistence before dialog close',()=>{
 const snap=handlerSource.indexOf('previous=cloneApiaryState()');
 const mutation=handlerSource.indexOf('S.records.push(data)');
 const commit=handlerSource.indexOf('stored=await save()');
 const rollback=handlerSource.indexOf('S=previous;');
 const closing=handlerSource.indexOf("$('recordDlg').close()");
 assert.ok(snap>=0&&mutation>snap&&commit>mutation&&rollback>commit&&closing>rollback);
 assert.equal(handlerSource.includes("close();$('rhive').disabled=false;$('recordForm').dataset.varroaTreatmentDraft='';await save()"),false);
});

test('concurrent double submit is rejected until the first durable save finishes',async()=>{
 let finish;
 const pending=new Promise(resolve=>{finish=resolve});
 const f=fixture({saveResults:[pending]});
 const first=f.runner.submit();
 const second=f.runner.submit();
 await second;
 assert.equal(f.saveCalls,1);
 assert.equal(f.confirmCalls,1);
 assert.equal(f.runner.getState().records.length,1);
 assert.equal(f.elements.recordForm.dataset.saveInProgress,'1');
 finish(true);
 await first;
 assert.equal(f.runner.getState().records.length,1);
 assert.equal(f.elements.recordDlg.closed,true);
 assert.equal(f.elements.recordForm.dataset.saveInProgress,'');
});

test('failed save clears busy lock, allowing user to retry without losing form',async()=>{
 const f=fixture({saveResults:[false,true]});
 await f.runner.submit();
 assert.equal(f.elements.recordForm.dataset.saveInProgress,'');
 assert.equal(f.elements.recordDlg.closed,false);
 await f.runner.submit();
 assert.equal(f.saveCalls,2);
 assert.equal(f.elements.recordDlg.closed,true);
});

test('changing Varroa draft away from treatment rejects it without saving',async()=>{
 const f=fixture({type:'Заметка'});
 await f.runner.submit();
 assert.equal(f.saveCalls,0);
 assert.equal(f.elements.recordDlg.closed,false);
 assert.equal(f.elements.recordForm.dataset.saveInProgress,'');
 assert.equal(f.runner.getState().records.length,0);
});

test('busy-lock and release are in try-finally even on early return',()=>{
 assert.match(handlerSource,/form\.dataset\.saveInProgress='1';\s*try\s*\{/);
 assert.match(handlerSource,/finally\s*\{form\.dataset\.saveInProgress='';\}/);
});

test('future dated Varroa treatment is rejected before confirmation and persistence',async()=>{
 const f=fixture({date:'2026-11-24'});
 const initial=structuredClone(f.startingState);
 await f.runner.submit();
 assert.equal(f.saveCalls,0);
 assert.equal(f.confirmCalls,0);
 assert.deepEqual(f.runner.getState(),initial);
 assert.equal(f.elements.recordDlg.closed,false);
 assert.match(f.alerts.at(-1),/дату из будущего/i);
 assert.equal(f.elements.recordForm.dataset.saveInProgress,'');
});

test('historical completed treatment remains allowed when explicitly confirmed',async()=>{
 const f=fixture({date:'2026-11-21'});
 await f.runner.submit();
 assert.equal(f.confirmCalls,1);
 assert.equal(f.saveCalls,1);
 assert.equal(f.runner.getState().records[0].date,'2026-11-21');
 assert.equal(f.elements.recordDlg.closed,true);
});

test('generic journal note may use a future date without being misclassified as a performed treatment',async()=>{
 const f=fixture({date:'2026-11-24',type:'Заметка',varroa:false});
 await f.runner.submit();
 assert.equal(f.confirmCalls,0);
 assert.equal(f.saveCalls,1);
 assert.equal(f.runner.getState().records[0].type,'Заметка');
});

test('unexpected IndexedDB rejection rolls back journal mutation and preserves editable form',async()=>{
 const f=fixture({saveResults:[new Error('simulated IndexedDB exception')]});
 const initial=structuredClone(f.startingState);
 await f.runner.submit();
 assert.deepEqual(f.runner.getState(),initial);
 assert.equal(f.saveCalls,1);
 assert.equal(f.elements.recordDlg.closed,false);
 assert.equal(f.elements.rhive.disabled,true);
 assert.equal(f.elements.recordForm.dataset.varroaTreatmentDraft,'1');
 assert.equal(f.elements.recordForm.dataset.saveInProgress,'');
 assert.match(f.alerts.at(-1),/Не удалось завершить сохранение записи/);
});
test('failed expansion suggestion before persistence cannot leave a phantom journal record',async()=>{
 const f=fixture({suggestThrows:true});
 const initial=structuredClone(f.startingState);
 await f.runner.submit();
 assert.deepEqual(f.runner.getState(),initial);
 assert.equal(f.saveCalls,0);
 assert.equal(f.elements.recordDlg.closed,false);
 assert.equal(f.elements.recordForm.dataset.saveInProgress,'');
 assert.match(f.alerts.at(-1),/simulated expansion failure/);
});

test('render failure after rejected persistence never loses rollback or unlocks an uncommitted record',async()=>{
 const f=fixture({saveResults:[false],renderThrows:true});
 const prior=structuredClone(f.startingState);
 const oldConsoleError=console.error;
 const caught=[];
 console.error=(...args)=>caught.push(args.join(' '));
 try{await f.runner.submit();}finally{console.error=oldConsoleError;}
 assert.deepEqual(f.runner.getState(),prior);
 assert.equal(f.saveCalls,1);
 assert.equal(f.elements.recordDlg.closed,false);
 assert.equal(f.elements.recordForm.dataset.saveInProgress,'');
 assert.match(f.alerts.at(-1),/Запись не сохранена/);
 assert.equal(caught.length,1);
 assert.match(caught[0],/Не удалось обновить интерфейс/);
});
