import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
function source(name,next){
 const a=html.indexOf('function '+name+'('),b=html.indexOf('\nfunction '+next+'(',a);
 assert.ok(a>=0&&b>a,'missing function boundary '+name);
 return html.slice(a,b);
}
const cell=new Function(source('journalCsvCell','buildFilteredJournalCsv')+';return journalCsvCell')();
const build=new Function('journalCsvCell',source('buildFilteredPlantObservationsCsv','downloadFilteredPlantObservationsCsv')+';return buildFilteredPlantObservationsCsv')(cell);
const filter=new Function(source('filterPlantObservationHistory','resetPlantHistoryPage')+';return filterPlantObservationHistory')();
test('plant CSV exports all filtered rows, not just first 20, and never includes photos or GPS',()=>{
 const rows=Array.from({length:27},(_,i)=>({id:'o-'+i,plantName:'Клевер',observedAt:'2026-07-01',phase:'mass',locationLabel:'Луг',note:'Осмотр',latitude:53.3,longitude:45.8,media:[{data:'PRIVATE-VIDEO'}]}));
 const before=JSON.stringify(rows),csv=build(rows);
 assert.equal(csv.trimEnd().split('\r\n').length,28);
 assert.ok(csv.startsWith('\uFEFF'));
 for(const secret of ['PRIVATE-VIDEO','53.3','45.8'])assert.ok(!csv.includes(secret));
 assert.ok(csv.includes('"o-26"'));
 assert.equal(JSON.stringify(rows),before);
});
test('plant CSV escapes spreadsheet formulas and preserves text without changing originals',()=>{
 const rows=[{id:'one',plantName:'=HYPERLINK("https://example.test")',observedAt:'2026-07-01',phase:'beginning',note:'  @SUM(1)'}];
 const before=JSON.stringify(rows),csv=build(rows);
 assert.ok(csv.includes('"\'=HYPERLINK(""https://example.test"")"'));
 assert.ok(csv.includes('"  \'@SUM(1)"')||csv.includes('"\'  @SUM(1)"'));
 assert.equal(JSON.stringify(rows),before);
});
test('plant CSV respects saved search/phase/year and rejects malformed selected rows',()=>{
 const all=[{id:'a',plantName:'Липа',observedAt:'2026-08-01',phase:'mass'},{id:'b',plantName:'Клевер',observedAt:'2025-07-01',phase:'ending'}];
 assert.equal(build(filter(all,'липа','mass','2026')).split('\r\n').length,3);
 assert.throws(()=>build(filter(all,'липа','finished','')),/нет наблюдений/);
 assert.throws(()=>build([{id:'  ',plantName:'Bad'}]),/повреждённое наблюдение/);
 assert.match(html,/onclick="downloadFilteredPlantObservationsCsv\(\)"/);
});
