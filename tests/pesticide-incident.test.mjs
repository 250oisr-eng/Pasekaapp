import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../js/pesticide-incident.js',import.meta.url),'utf8');
const scope={};new Function('window','module',source)(scope,{exports:{}});
const api=scope.PasekaIncident;
const hives=[{id:'h1',number:1},{id:'h2',number:2}];
let n=0;
const build=(input,media=[])=>api.buildPesticideIncidentDraft(input,hives,media,()=> 'i'+(++n),'2026-11-13T12:00:00.000Z');
const base={observedAt:'2026-08-12T14:30',scope:'selected_hives',hiveIds:['h1'],symptoms:'Много погибших пчёл',notes:'Фото и записи сохранены'};
test('incident draft records phone-collected facts and never asserts pesticide causation',()=>{
 const row=build({...base,deadBeesCount:'250',latitude:'53.1',longitude:'45.2',locationAccuracyM:'18',suspectedCrop:'Рапс',suspectedSubstance:'Неизвестно'});
 assert.equal(row.deadBeesCount,250);assert.equal(row.latitude,53.1);assert.equal(row.affectedHiveSnapshots[0].label,'Улей №1');assert.equal(row.causationStatus,'unconfirmed');assert.equal(row.source,'smartphone_manual');
});
test('whole-apiary scope snapshots all existing hive IDs; unknown scope remains unknown',()=>{
 const all=build({...base,scope:'whole_apiary',hiveIds:[]});assert.deepEqual(all.affectedHiveIds,['h1','h2']);
 const unknown=build({...base,scope:'unknown',hiveIds:[]});assert.deepEqual(unknown.affectedHiveIds,[]);
});
test('incident validates date, scope, hive selection, dead count and coordinates',()=>{
 assert.throws(()=>build({...base,observedAt:'2026-02-30T12:00'}),/дату и время/i);
 assert.throws(()=>build({...base,sampleCollectedAt:'2026-02-30T12:00'}),/время отбора пробы/i);
 assert.throws(()=>build({...base,scope:'wrong'}),/охват инцидента/i);
 assert.throws(()=>build({...base,hiveIds:[]}),/Выбери существующие ульи/i);
 assert.throws(()=>build({...base,deadBeesCount:'-1'}),/Количество погибших/i);
 assert.throws(()=>build({...base,latitude:'91',longitude:'45'}),/GPS-координаты/i);
 assert.throws(()=>build({...base,latitude:'53.1'}),/обе координаты/i);
});
test('incident photo evidence is limited to three phone images and validates MIME and data URLs',()=>{
 const photo={kind:'image',name:'bee.jpg',type:'image/jpeg',data:'data:image/jpeg;base64,AAAA',sizeBytes:4};
 assert.equal(build(base,[photo]).media.length,1);
 assert.throws(()=>build(base,Array.from({length:4},()=>photo)),/не более трёх фотографий/i);
 assert.throws(()=>build(base,[{...photo,type:'application/pdf'}]),/Фотография/i);
 assert.throws(()=>build(base,[{...photo,data:'bad'}]),/Фотография/i);
});
test('integrity preserves incident references to archived hive snapshots and detects corrupt evidence',()=>{
 const row=build(base);
 const errors=api.inspectPesticideIncidentIntegrity({meta:{schemaVersion:11},hives:[{id:'h2'}],pesticideIncidents:[row,{...row,id:row.id,scope:'bad',causationStatus:'confirmed'}]}).map(x=>x.code);
 assert.ok(errors.includes('pesticide_incident_duplicate_id'));
 const corrupt=api.inspectPesticideIncidentIntegrity({meta:{schemaVersion:11},hives:[],pesticideIncidents:[{...row,affectedHiveSnapshots:[],latitude:99,causationStatus:'confirmed'}]}).map(x=>x.code);
 assert.ok(corrupt.includes('pesticide_incident_hive_missing'));assert.ok(corrupt.includes('pesticide_incident_invalid_coordinates'));assert.ok(corrupt.includes('pesticide_incident_causation_overstated'));
});
test('incident summary reports counts without estimating cause',()=>{
 const rows=[build(base),build({...base,scope:'unknown',hiveIds:[],sampleId:'S-1'})];
 const summary=api.summarizePesticideIncidents(rows);
 assert.equal(summary.total,2);assert.equal(summary.open,2);assert.equal(summary.withSamples,1);
});
test('incident module is loaded before app and cached offline',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8'),sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
 assert.ok(html.indexOf('./js/pesticide-incident.js')<html.indexOf('<script>'));assert.ok(sw.includes('./js/pesticide-incident.js'));
});
