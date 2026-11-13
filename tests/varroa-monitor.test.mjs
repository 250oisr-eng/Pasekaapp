import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../js/varroa-monitor.js',import.meta.url),'utf8');
const scope={};
new Function('window','module',source)(scope,{exports:{}});
const api=scope.PasekaVarroa;
const hives=[{id:'h1'},{id:'h2'}];
let n=0;
const make=(input)=>api.buildVarroaObservation(input,hives,()=> 'v'+(++n),'2026-11-13T12:00:00.000Z');

test('adult bee sample calculates mites per 100 bees without adding diagnostic labels',()=>{
 const row=make({type:'adult_bee_sample',hiveId:'h1',date:'2026-08-10',method:'alcohol_wash',beesCount:'300',mitesCount:'9',notes:'Контрольная проба'});
 assert.equal(row.mitesPer100Bees,3);
 assert.equal(row.source,'manual');
 assert.equal(row.method,'alcohol_wash');
 assert.equal(row.hiveLabelAtTime,'Улей');
 assert.equal(row.diagnosis,undefined);
});
test('sticky board uses a separate 24-hour fall rate',()=>{
 const row=make({type:'sticky_board',hiveId:'h1',date:'2026-08-11',mitesCount:12,exposureHours:48});
 assert.equal(row.mitesPer24h,6);
 assert.equal(row.mitesPer100Bees,undefined);
});
test('sample types cannot be mixed and all required values are validated',()=>{
 assert.throws(()=>make({type:'adult_bee_sample',hiveId:'h1',date:'2026-02-30',method:'alcohol_wash',beesCount:300,mitesCount:2}),/корректную дату/i);
 assert.throws(()=>make({type:'adult_bee_sample',hiveId:'missing',date:'2026-08-10',method:'alcohol_wash',beesCount:300,mitesCount:2}),/существующий улей/i);
 assert.throws(()=>make({type:'adult_bee_sample',hiveId:'h1',date:'2026-08-10',method:'unknown',beesCount:300,mitesCount:2}),/способ отбора/i);
 assert.throws(()=>make({type:'adult_bee_sample',hiveId:'h1',date:'2026-08-10',method:'alcohol_wash',beesCount:0,mitesCount:2}),/количество пчёл/i);
 assert.throws(()=>make({type:'sticky_board',hiveId:'h1',date:'2026-08-10',mitesCount:2,exposureHours:0}),/период наблюдения/i);
 assert.throws(()=>make({type:'sticky_board',hiveId:'h1',date:'2026-08-10',mitesCount:'',exposureHours:24}),/количество клещей/i);
});
test('integrity catches duplicate IDs, broken hive links and incorrect derived rates',()=>{
 const errors=api.inspectVarroaIntegrity({meta:{schemaVersion:10},hives, varroaObservations:[
  {id:'a',type:'adult_bee_sample',hiveId:'h1',date:'2026-08-10',method:'alcohol_wash',beesCount:300,mitesCount:9,mitesPer100Bees:99,notes:''},
  {id:'a',type:'sticky_board',hiveId:'gone',date:'2026-08-11',method:'sticky_board',mitesCount:3,exposureHours:24,mitesPer24h:3,notes:''}
 ]}).map(x=>x.code);
 assert.ok(errors.includes('varroa_rate_mismatch'));
 assert.ok(errors.includes('varroa_duplicate_id'));
});
test('summary keeps adult-bee samples separate from sticky-board observations',()=>{
 const rows=[
  {id:'1',type:'adult_bee_sample',hiveId:'h1',date:'2026-08-01',mitesPer100Bees:2},
  {id:'2',type:'sticky_board',hiveId:'h1',date:'2026-08-02',mitesPer24h:4},
  {id:'3',type:'adult_bee_sample',hiveId:'h2',date:'2026-08-03',mitesPer100Bees:7}
 ];
 const summary=api.summarizeVarroaObservations(rows,'h1');
 assert.equal(summary.total,2);
 assert.equal(summary.adultBeeSamples,1);
 assert.equal(summary.stickyBoardObservations,1);
});

test('Varroa module is loaded before app and cached for offline use',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.ok(html.indexOf('./js/varroa-monitor.js')<html.indexOf('<script>'));
 assert.ok(sw.includes('./js/varroa-monitor.js'));
});

test('historical measurements remain valid after their hive is archived',()=>{
 const row=make({type:'adult_bee_sample',hiveId:'h1',date:'2026-08-12',method:'sugar_roll',beesCount:100,mitesCount:2});
 const errors=api.inspectVarroaIntegrity({meta:{schemaVersion:10},hives:[{id:'h2'}],varroaObservations:[row]});
 assert.deepEqual(errors,[]);
});
