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
test('GPS accuracy and capture time are validated and normalized with coordinates',()=>{
 const captured='2026-08-12T14:30:15.123Z';
 const row=build({...base,latitude:'53.1',longitude:'45.2',locationAccuracyM:'18',gpsCapturedAt:captured});
 assert.equal(row.locationAccuracyM,18);assert.equal(row.gpsCapturedAt,captured);
 assert.equal(build({...base,latitude:'53.1',longitude:'45.2',gpsCapturedAt:''}).gpsCapturedAt,null);
 assert.throws(()=>build({...base,latitude:'53.1',longitude:'45.2',locationAccuracyM:'-1'}),/точность GPS/i);
 assert.throws(()=>build({...base,latitude:'53.1',longitude:'45.2',locationAccuracyM:'18.5'}),/точность GPS/i);
 assert.throws(()=>build({...base,latitude:'53.1',longitude:'45.2',locationAccuracyM:'100001'}),/точность GPS/i);
 assert.throws(()=>build({...base,latitude:'53.1',longitude:'45.2',gpsCapturedAt:'yesterday'}),/время фиксации GPS/i);
 assert.throws(()=>build({...base,latitude:'53.1',longitude:'45.2',gpsCapturedAt:'2026-02-30T14:30:15.000Z'}),/время фиксации GPS/i);
 assert.throws(()=>build({...base,latitude:'53.1',longitude:'45.2',gpsCapturedAt:'2026-08-12T14:30:15+99:00'}),/время фиксации GPS/i);
 assert.equal(api.validGpsTimestamp('2026-08-12T14:30:15+14:00'),true);
 assert.throws(()=>build({...base,latitude:'53.1',longitude:'45.2',gpsCapturedAt:'2026-08-12T14:30:15+14:01'}),/время фиксации GPS/i);
 assert.throws(()=>build({...base,latitude:'53.1',longitude:'45.2',gpsCapturedAt:'2026-08-12T14:30:15+23:59'}),/время фиксации GPS/i);
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
 const badGps=api.inspectPesticideIncidentIntegrity({meta:{schemaVersion:11},hives:[],pesticideIncidents:[{...row,locationAccuracyM:-4,gpsCapturedAt:'yesterday'}]}).map(x=>x.code);
 assert.ok(badGps.includes('pesticide_incident_invalid_gps_accuracy'));assert.ok(badGps.includes('pesticide_incident_invalid_gps_timestamp'));
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


test('incident inspector rejects mismatched or duplicate historical hive snapshots without changing records',()=>{
 const incident=build({...base,hiveIds:['h1','h2']});
 const archivedHives={meta:{schemaVersion:11},hives:[],pesticideIncidents:[incident]};
 const before=JSON.stringify(archivedHives);
 assert.deepEqual(api.inspectPesticideIncidentIntegrity(archivedHives),[],
  'exact original snapshots must remain valid after hives have been removed from current apiary');
 assert.equal(JSON.stringify(archivedHives),before);
 const cases=[
  [{...incident,affectedHiveIds:['h1','h1']},'pesticide_incident_invalid_or_duplicate_hive_id'],
  [{...incident,affectedHiveIds:['h1','h2','h3']},'pesticide_incident_snapshot_mismatch'],
  [{...incident,affectedHiveSnapshots:[incident.affectedHiveSnapshots[0]]},'pesticide_incident_snapshot_mismatch'],
  [{...incident,affectedHiveSnapshots:[incident.affectedHiveSnapshots[0],incident.affectedHiveSnapshots[0]]},'pesticide_incident_invalid_or_duplicate_hive_snapshot'],
  [{...incident,affectedHiveSnapshots:[{id:'other',label:'Подмена'}]},'pesticide_incident_snapshot_mismatch'],
  [{...incident,affectedHiveIds:[null,'h2']},'pesticide_incident_invalid_or_duplicate_hive_id'],
  [{...incident,affectedHiveSnapshots:[null,...incident.affectedHiveSnapshots]},'pesticide_incident_invalid_or_duplicate_hive_snapshot'],
 ];
 for(const [row,expected] of cases){
  const s={meta:{schemaVersion:11},hives:[],pesticideIncidents:[row]},original=JSON.stringify(s);
  assert.ok(api.inspectPesticideIncidentIntegrity(s).some(x=>x.code===expected),expected);
  assert.equal(JSON.stringify(s),original,'Inspection must not rewrite provenance');
 }
});
test('incident inspector blocks numeric-string GPS spoofing and missing status but preserves valid legacy links',()=>{
 const row=build({...base,latitude:'53.1',longitude:'45.2'});
 for(const patch of [
  {latitude:'53.1'}, {longitude:'45.2'},{latitude:Infinity},{longitude:NaN}
 ]){
  const errors=api.inspectPesticideIncidentIntegrity({hives,pesticideIncidents:[{...row,...patch}]}).map(x=>x.code);
  assert.ok(errors.includes('pesticide_incident_invalid_coordinates'),JSON.stringify(patch));
 }
 assert.ok(api.inspectPesticideIncidentIntegrity({hives,pesticideIncidents:[{...row,status:''}]})
  .some(x=>x.code==='pesticide_incident_invalid_status'));
 assert.deepEqual(api.inspectPesticideIncidentIntegrity({hives,pesticideIncidents:[row]}),[]);
});


test('incident draft refuses malformed photo lists instead of discarding evidence',()=>{
 for(const bad of [{corrupted:true},'',{length:1,0:{kind:'image'}},42]){
  assert.throws(()=>build(base,bad),/список фотографий инцидента повреждён/i);
 }
 assert.equal(build(base,null).media.length,0);
});
