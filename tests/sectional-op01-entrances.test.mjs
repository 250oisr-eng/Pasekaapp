import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src=await readFile(new URL('../js/sectional-entrance-operations.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
const w={};new Function('window',src)(w);const api=w.PasekaSectionalEntranceOperations;
const now='2026-04-10T12:00:00.000Z';
function state(){return {meta:{schemaVersion:15},hives:[{id:'sectional',profileId:'sectional-multiqueen-v1'},{id:'farrar',profileId:'farrar-6x6-v1'}],
 sectionalLayouts:[{id:'layout1',hiveId:'sectional',mode:'SINGLE_FAMILY',sections:[{id:'one',broodBodyIds:['b1','b2','b3']}]}],
 sectionalEntranceObservations:[],records:[],auditLog:[]}}
function request(overrides={}){return {hiveId:'sectional',userConfirmed:true,firstFlightObserved:true,
 occurredAt:'2026-04-10T11:00:00.000Z',entrances:{...api.EXPECTED},notes:'Проверено при осмотре',...overrides}}
test('OP01 source-accurate observed entrance configuration, no physical execution',()=>{
 const s=state(),before=structuredClone(s);
 const p=api.recordOP01(s,request(),()=> 'entry-1',now);
 assert.equal(p.ok,true,JSON.stringify(p));
 assert.deepEqual(s,before);
 assert.deepEqual(p.event.entrances,{lowerFlat:'slightly_open',lowerRound:'open',upperMiddle:'closed',upperTop:'closed'});
 assert.equal(p.event.operationId,'OP-01');
 assert.equal(p.event.userConfirmed,true);
 assert.equal(p.event.firstFlightObserved,true);
 assert.deepEqual(api.inspect({...s,sectionalEntranceObservations:[p.event]}),[]);
});
test('OP01 rejects inferred flight, approximate opening dimensions and Farrar without changes',()=>{
 const s=state();
 for(const overrides of [{userConfirmed:false},{firstFlightObserved:false},{hiveId:'farrar'},
  {occurredAt:'2026-04-11T12:00:00.000Z'},{entrances:{...api.EXPECTED,lowerFlat:'half_open'}},
  {entrances:{...api.EXPECTED,upperTop:'open'}}]){
  const before=structuredClone(s);
  const r=api.recordOP01(s,request(overrides),()=> 'event-1',now);
  assert.equal(r.ok,false,JSON.stringify(overrides));
  assert.deepEqual(s,before);
 }
});
test('OP01 not allowed outside actual three-body combined layout',()=>{
 const s=state();
 s.sectionalLayouts[0].mode='SIDE_BY_SIDE';
 assert.equal(api.recordOP01(s,request(),()=> 'x',now).error,'three_body_single_family_layout_required');
 s.sectionalLayouts[0].mode='SINGLE_FAMILY';
 s.sectionalLayouts[0].sections[0].broodBodyIds=['b1','b2'];
 assert.equal(api.recordOP01(s,request(),()=> 'x',now).error,'three_body_single_family_layout_required');
});
test('OP01 append-only duplicate prevention, malformed event rejection and legacy compatibility',()=>{
 const s=state(),p=api.recordOP01(s,request(),()=> 'x1',now);
 s.sectionalEntranceObservations.push(p.event);
 assert.equal(api.recordOP01(s,request(),()=> 'x2',now).error,'observation_duplicate');
 assert.deepEqual(api.inspect(s),[]);
 const broken=structuredClone(s);broken.sectionalEntranceObservations[0].entrances.upperTop='open';
 assert.equal(api.inspect(broken)[0].code,'entrance_event_configuration_invalid');
 assert.deepEqual(api.inspect({...s,sectionalEntranceObservations:undefined}),[]);
});
test('OP01 observation survives an isolated IndexedDB close/reopen without auto changes',async()=>{
 const {IDBFactory}=await import('fake-indexeddb');
 const idb=new IDBFactory();
 const open=()=>new Promise((ok,no)=>{const req=idb.open('p1-op01-evidence',1);req.onupgradeneeded=()=>req.result.createObjectStore('main');req.onsuccess=()=>ok(req.result);req.onerror=()=>no(req.error)});
 let db=await open(),s=state(),entry=api.recordOP01(s,request(),()=> 'event1',now).event;
 s.sectionalEntranceObservations.push(entry);
 await new Promise((ok,no)=>{const tx=db.transaction('main','readwrite');tx.objectStore('main').put(s,'state');tx.oncomplete=ok;tx.onabort=()=>no(tx.error)});
 db.close();db=await open();
 const loaded=await new Promise((ok,no)=>{const q=db.transaction('main','readonly').objectStore('main').get('state');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)});
 assert.deepEqual(api.inspect(loaded),[]);
 assert.deepEqual(loaded.sectionalEntranceObservations,[entry]);
 assert.equal(loaded.sectionalLayouts[0].sections[0].broodBodyIds.length,3);
 db.close();
});
test('OP01 all three integrity gates, offline module and explicit UI are present',()=>{
 assert.match(html,/PasekaSectionalEntranceOperations\.inspect\(S\)/);
 assert.match(html,/PasekaSectionalEntranceOperations\.inspect\(state\)/);
 assert.match(html,/sectionalEntranceObservations:S\.sectionalEntranceObservations\|\|\[\]/);
 assert.match(html,/id="sectionalOp01Flight"/);
 assert.match(html,/id="sectionalOp01Confirm"/);
 assert.match(html,/async function saveSectionalOp01\(\)/);
 assert.match(sw,/sectional-entrance-operations\.js/);
 assert.doesNotMatch(src,/\.put\(|\.delete\(|completeOP0[1-9]\(/);
});
