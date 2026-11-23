import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
function region(start,end){
 const a=html.indexOf(start),z=html.indexOf(end,a);
 assert.ok(a>=0&&z>a,`Production code region missing: ${start}`);
 return html.slice(a,z);
}
const observationSource=region('async function saveVarroaObservation(event){','\nfunction openVarroaTreatmentJournal(){');
const renderSource=region('function renderVarroaModule(){','\nasync function saveVarroaObservation(event){');
const archiveSource=region('const pendingJournalRecordActions=new Set();','\nfunction fillFamilies(');

function observationFixture({saveImplementation=async()=>true,renderFails=false,resetFails=false}={}){
 const state={hives:[{id:'h1',number:1},{id:'h2',number:2}],records:[],varroaObservations:[],auditLog:[],meta:{revisionId:'before'}};
 const elements=Object.fromEntries(['varroaForm','varroaType','varroaHive','varroaDate','varroaNotes','varroaMethod','varroaBeesCount','varroaMitesCount','varroaBoardMites','varroaExposureHours'].map(id=>[id,{value:'',dataset:{},reset(){if(resetFails)throw Error('render reset failed');this.resetCount=(this.resetCount||0)+1}}]));
 Object.assign(elements.varroaType,{value:'adult_bee_sample'});
 Object.assign(elements.varroaHive,{value:'h1'});
 Object.assign(elements.varroaDate,{value:'2026-11-23'});
 Object.assign(elements.varroaNotes,{value:'Диагностическое измерение'});
 Object.assign(elements.varroaMethod,{value:'alcohol_wash'});
 Object.assign(elements.varroaBeesCount,{value:'100'});
 Object.assign(elements.varroaMitesCount,{value:'2'});
 const alerts=[];let saves=0,renders=0;
 const env={
  state,
  get:id=>elements[id],
  save:async()=>{saves++;return saveImplementation()},
  alert:message=>alerts.push(message),
  render:()=>{renders++;if(renderFails)throw Error('render failed')},
  logAudit:(type,data)=>{env.state.auditLog.push({type,...data})},
  build:input=>({...input,id:'observation-test-id',createdAt:'2026-11-23T10:00:00Z'}),
  toggle:()=>{},renderVarroa:()=>{},
  uid:()=> 'test-id'
 };
 const api=new Function('env',[
  'let S=env.state;const $=env.get,save=env.save,alert=env.alert,render=env.render,logAudit=env.logAudit;',
  'const PasekaVarroa={buildVarroaObservation:env.build};const uid=env.uid,cloneApiaryState=()=>structuredClone(S);',
  'const today=()=>"2026-11-23",toggleVarroaFields=env.toggle,renderVarroaModule=env.renderVarroa;',
  observationSource,
  'return {run:()=>saveVarroaObservation({preventDefault(){}}),getState:()=>S};'
 ].join('\n'))(env);
 return {api,env,elements,alerts,get saves(){return saves},get renders(){return renders}};
}

test('Varroa observation save persists once and records one audit event',async()=>{
 const f=observationFixture();
 await f.api.run();
 assert.equal(f.saves,1);
 assert.equal(f.api.getState().varroaObservations.length,1);
 assert.equal(f.api.getState().auditLog.length,1);
 assert.equal(f.elements.varroaForm.resetCount,1);
 assert.equal(f.elements.varroaForm.dataset.saveInProgress,'');
});
test('failed Varroa observation save restores both observation and audit without clearing form',async()=>{
 const f=observationFixture({saveImplementation:async()=>false});
 const previous=structuredClone(f.api.getState());
 await f.api.run();
 assert.deepEqual(f.api.getState(),previous);
 assert.equal(f.elements.varroaForm.resetCount,undefined);
 assert.equal(f.elements.varroaForm.dataset.saveInProgress,'');
 assert.match(f.alerts.at(-1),/Измерение не сохранено/);
});
test('exception in actual IndexedDB save restores original observation and audit',async()=>{
 const f=observationFixture({saveImplementation:async()=>{throw Error('indexedDB rejected')}});
 const previous=structuredClone(f.api.getState());
 await f.api.run();
 assert.deepEqual(f.api.getState(),previous);
 assert.equal(f.elements.varroaForm.dataset.saveInProgress,'');
 assert.match(f.alerts.at(-1),/indexedDB rejected/);
});
test('failed rerender does not undo committed observation or cause duplicate retry',async()=>{
 const f=observationFixture({resetFails:true});
 await f.api.run();
 assert.equal(f.api.getState().varroaObservations.length,1);
 assert.equal(f.elements.varroaForm.dataset.saveInProgress,'');
 assert.match(f.alerts.at(-1),/Измерение сохранено/);
});
test('concurrent double-submit creates exactly one observation',async()=>{
 let release;
 const gate=new Promise(resolve=>{release=resolve});
 const f=observationFixture({saveImplementation:()=>gate});
 const first=f.api.run(),second=f.api.run();
 release(true);
 await Promise.all([first,second]);
 assert.equal(f.saves,1);
 assert.equal(f.api.getState().varroaObservations.length,1);
 assert.equal(f.api.getState().auditLog.length,1);
});

function archiveFixture({saveImplementation=async()=>true,confirmResult=true,archived=false,renderThrows=false}={}){
 const record={id:'record-1',date:'2026-11-20',type:'Обработка',hive:'h1',text:'keep',media:[{kind:'image',data:'data:image/png;base64,YQ=='}]};
 if(archived)record.archivedAt='2026-11-21T12:00:00Z';
 const state={records:[record],auditLog:[],meta:{revisionId:'stable'}};
 const messages=[];let saves=0;
 const env={
  state,
  confirm:()=>confirmResult,
  alert:msg=>messages.push(msg),
  render:()=>{if(renderThrows)throw Error('render broken')},
  save:async()=>{saves++;return saveImplementation()},
  uid:()=> 'test-audit-'+saves
 };
 const api=new Function('env',[
 'let S=env.state;const confirm=env.confirm,alert=env.alert,render=env.render,save=env.save,uid=env.uid;',
 'const cloneApiaryState=()=>structuredClone(S);',
 archiveSource,
 'return {archive:deleteRecord,restore:restoreRecord,getState:()=>S};'
 ].join('\n'))(env);
 return {api,messages,get saves(){return saves}};
}
test('archiving a journal record commits archived state, retains media, and can restore it',async()=>{
 const f=archiveFixture();
 assert.equal(await f.api.archive('record-1'),true);
 assert.ok(f.api.getState().records[0].archivedAt);
 assert.equal(f.api.getState().auditLog[0].type,'record_archived');
 assert.equal(f.api.getState().records[0].media[0].kind,'image');
 assert.equal(await f.api.restore('record-1'),true);
 assert.equal(f.api.getState().records[0].archivedAt,undefined);
 assert.equal(f.api.getState().auditLog[1].type,'record_restored');
 assert.equal(f.saves,2);
});
test('archive refusal does not change record or create an audit event',async()=>{
 const f=archiveFixture({confirmResult:false}),previous=structuredClone(f.api.getState());
 assert.equal(await f.api.archive('record-1'),false);
 assert.deepEqual(f.api.getState(),previous);
 assert.equal(f.saves,0);
});
test('failed archive commit returns full original state including embedded media',async()=>{
 const f=archiveFixture({saveImplementation:async()=>false}),previous=structuredClone(f.api.getState());
 assert.equal(await f.api.archive('record-1'),false);
 assert.deepEqual(f.api.getState(),previous);
 assert.equal(f.saves,1);
 assert.match(f.messages.at(-1),/не сохранено/);
});
test('rejected restore transaction restores archived marker and original audit',async()=>{
 const f=archiveFixture({archived:true,saveImplementation:async()=>{throw Error('simulated quota')}});
 const previous=structuredClone(f.api.getState());
 assert.equal(await f.api.restore('record-1'),false);
 assert.deepEqual(f.api.getState(),previous);
 assert.match(f.messages.at(-1),/simulated quota/);
});
test('concurrent archive and restore of one record cannot race or duplicate audit',async()=>{
 let release;
 const gate=new Promise(resolve=>{release=resolve});
 const f=archiveFixture({saveImplementation:()=>gate});
 const first=f.api.archive('record-1');
 const second=f.api.restore('record-1');
 release(true);
 assert.deepEqual(await Promise.all([first,second]),[true,false]);
 assert.equal(f.saves,1);
 assert.equal(f.api.getState().auditLog.length,1);
});
test('failed archive refresh does not prevent durable rollback',async()=>{
 const f=archiveFixture({saveImplementation:async()=>false,renderThrows:true}),previous=structuredClone(f.api.getState());
 const old=console.error;
 console.error=()=>{};
 try{assert.equal(await f.api.archive('record-1'),false)}
 finally{console.error=old}
 assert.deepEqual(f.api.getState(),previous);
});

function renderFixture(){
 const elements=Object.fromEntries(['varroaHive','varroaDate','varroaObservationsList','varroaTreatmentsList','varroaTreatmentsCount','varroaCount'].map(id=>[id,{value:'',innerHTML:'',textContent:''}]));
 elements.varroaHive.value='h1';
 const state={hives:[{id:'h1',number:1},{id:'h2',number:2}],records:[],varroaObservations:[
  {id:'obs1',hiveId:'h1',type:'adult_bee_sample',date:'2026-11-23',mitesPer100Bees:2,method:'alcohol_wash',beesCount:100,mitesCount:2,notes:'Hive 1'},
  {id:'obs2',hiveId:'h2',type:'adult_bee_sample',date:'2026-11-23',mitesPer100Bees:3,method:'alcohol_wash',beesCount:100,mitesCount:3,notes:'Hive 2'}]};
 const safe=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const render=new Function('S','$','today','ruPlural','hname','safe','selectedHiveId',renderSource+';return renderVarroaModule')(
  state,id=>elements[id],()=> '2026-11-23',(n,a,b,c)=>n===1?a:c,id=>'Улей '+id,safe,'h1');
 return {elements,state,render};
}
test('Varroa observations only show selected hive, while preserving all underlying records',()=>{
 const f=renderFixture();f.render();
 assert.match(f.elements.varroaObservationsList.innerHTML,/Hive 1/);
 assert.doesNotMatch(f.elements.varroaObservationsList.innerHTML,/Hive 2/);
 assert.match(f.elements.varroaCount.textContent,/^1 измерение/);
 f.elements.varroaHive.value='h2';f.render();
 assert.match(f.elements.varroaObservationsList.innerHTML,/Hive 2/);
 assert.doesNotMatch(f.elements.varroaObservationsList.innerHTML,/Hive 1/);
 assert.equal(f.state.varroaObservations.length,2);
});
