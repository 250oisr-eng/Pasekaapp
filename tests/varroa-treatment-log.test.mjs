import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../js/varroa-treatment-log.js',import.meta.url),'utf8');
const scope={};
new Function('window','module',source)(scope,{exports:{}});
const api=scope.PasekaVarroaTreatmentLog;
const hives=[{id:'h1',number:7},{id:'h2',number:8}];
const now='2026-11-19T09:00:00.000Z';
let sequence=0;
const make=input=>api.buildTreatmentEvent(input,hives,()=> 't'+(++sequence),now);

test('creates only a manually confirmed treatment fact with the user-confirmed method',()=>{
 const row=make({hiveId:'h1',occurredAt:'2026-11-18T08:30:00.000Z',userConfirmed:true,notes:'Фактически выполнено'});
 assert.equal(row.method,'oxalic_acid_sublimator');
 assert.equal(row.hiveNumberAtTime,7);
 assert.equal(row.hiveLabelAtTime,'Улей №7');
 assert.equal(row.userConfirmed,true);
 assert.equal(row.source,'manual');
 assert.equal(row.createdAt,now);
 assert.equal(row.dose,undefined);
 assert.equal(row.temperature,undefined);
 assert.equal(row.interval,undefined);
});

test('rejects planned, unconfirmed, future-dated and malformed treatment entries',()=>{
 assert.throws(()=>make({hiveId:'h1',occurredAt:'2026-11-18T08:30:00.000Z'}),/действительно выполнена/i);
 assert.throws(()=>make({hiveId:'h1',occurredAt:'2026-11-20T08:30:00.000Z',userConfirmed:true}),/будущем/i);
 assert.throws(()=>make({hiveId:'h1',occurredAt:'not-a-date',userConfirmed:true}),/корректные дату/i);
 assert.throws(()=>make({hiveId:'gone',occurredAt:'2026-11-18T08:30:00.000Z',userConfirmed:true}),/существующий улей/i);
});

test('rejects invalid device clock and oversized notes',()=>{
 assert.throws(()=>api.buildTreatmentEvent({hiveId:'h1',occurredAt:'2026-11-18T08:30:00.000Z',userConfirmed:true},hives,()=> 'x','invalid-clock'),/текущее время/i);
 assert.throws(()=>make({hiveId:'h1',occurredAt:'2026-11-18T08:30:00.000Z',userConfirmed:true,notes:'x'.repeat(2001)}),/2000 символов/i);
});

test('integrity validates append-only treatment rows and duplicate identities',()=>{
 const row=make({hiveId:'h1',occurredAt:'2026-11-18T08:30:00.000Z',userConfirmed:true});
 const errors=api.inspectTreatmentIntegrity({meta:{schemaVersion:16},hives,varroaTreatments:[row,{...row,userConfirmed:false}]});
 assert.ok(errors.some(x=>x.code==='varroa_treatment_duplicate_id'));
 assert.deepEqual(api.inspectTreatmentIntegrity({meta:{schemaVersion:16},hives,varroaTreatments:[row]}),[]);
});

test('historical treatment remains valid when the original hive is no longer active',()=>{
 const row=make({hiveId:'h1',occurredAt:'2026-11-18T08:30:00.000Z',userConfirmed:true});
 assert.deepEqual(api.inspectTreatmentIntegrity({meta:{schemaVersion:16},hives:[{id:'h2'}],varroaTreatments:[row]}),[]);
});

test('summary orders treatment events newest first and can filter by hive',()=>{
 const rows=[
  make({hiveId:'h1',occurredAt:'2026-11-17T08:30:00.000Z',userConfirmed:true}),
  make({hiveId:'h2',occurredAt:'2026-11-18T08:30:00.000Z',userConfirmed:true}),
  make({hiveId:'h1',occurredAt:'2026-11-19T08:30:00.000Z',userConfirmed:true})
 ];
 const summary=api.summarizeTreatments(rows,'h1');
 assert.equal(summary.total,2);
 assert.equal(summary.events[0].occurredAt,'2026-11-19T08:30:00.000Z');
});

test('treatment log module is loaded before app and cached for offline use',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.ok(html.indexOf('./js/varroa-treatment-log.js')<html.indexOf('<script>'));
 assert.ok(sw.includes('./js/varroa-treatment-log.js'));
});

test('latest treatment helper returns only the newest confirmed valid treatment for the selected hive',()=>{
 const older=make({hiveId:'h1',occurredAt:'2026-11-17T08:30:00.000Z',userConfirmed:true});
 const newest=make({hiveId:'h1',occurredAt:'2026-11-19T08:30:00.000Z',userConfirmed:true});
 const otherHive=make({hiveId:'h2',occurredAt:'2026-11-18T08:30:00.000Z',userConfirmed:true});
 const unconfirmed={...newest,id:'unconfirmed',occurredAt:'2026-11-18T09:30:00.000Z',userConfirmed:false};
 assert.equal(api.latestTreatmentForHive([older,newest,otherHive,unconfirmed],'h1').id,newest.id);
 assert.equal(api.latestTreatmentForHive([older,newest],'missing'),null);
 assert.equal(api.latestTreatmentForHive([older,newest],''),null);
});
