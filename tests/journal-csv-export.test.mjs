import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('function filteredJournalRows(){');
const end=html.indexOf('function renderJournalRecords(){',start);
assert.ok(start>0&&end>start,'CSV and filtering functions are in the app');
const src=html.slice(start,end);
function setup({hiveId='h1',records=[],families=[],filters={}}={}){
 const S={records,families},values={
  journalTypeFilter:'all',journalFamilyFilter:'all',journalDateFilter:'',journalSearch:'',...filters
 };
 const $=name=>({value:values[name]??''});
 const factory=new Function('S','$','hname','activeJournalHive','URL','Blob','document','today','alert',
  src+';return {filteredJournalRows,buildFilteredJournalCsv,journalCsvCell,downloadFilteredJournalCsv}');
 return {S,functions:factory(S,$,id=>'Улей '+id,hiveId,URL,Blob,{},()=> '2026-11-26',()=>{}),values};
}
test('CSV exports exactly selected non-archived hive records, never media payloads',()=>{
 const rows=[
  {id:'r1',hive:'h1',family:'f1',date:'2026-11-20',type:'Осмотр',text:'7 улочек',media:[{name:'photo.jpg',blob:{secret:'DO_NOT_EXPORT'}}]},
  {id:'r2',hive:'h1',family:'f1',date:'2026-11-21',type:'Подкормка',text:'500 мл'},
  {id:'r3',hive:'h2',family:'f1',date:'2026-11-20',type:'Осмотр',text:'OTHER_HIVE'},
  {id:'r4',hive:'h1',family:'f1',date:'2026-11-20',type:'Осмотр',text:'ARCHIVED',archivedAt:'2026-11-22'}
 ];
 const original=JSON.stringify(rows);
 const {functions}=setup({records:rows,families:[{id:'f1',name:'Семья 1'}],filters:{journalTypeFilter:'Осмотр'}});
 const selected=functions.filteredJournalRows();
 assert.deepEqual(selected.map(x=>x.id),['r1']);
 const csv=functions.buildFilteredJournalCsv(selected,'h1');
 assert.ok(csv.startsWith('\uFEFF'));
 for(const marker of ['7 улочек','Семья 1','Улей h1','r1'])assert.ok(csv.includes(marker));
 for(const marker of ['OTHER_HIVE','ARCHIVED','photo.jpg','DO_NOT_EXPORT','500 мл'])assert.ok(!csv.includes(marker));
 assert.ok(csv.includes('"1"'));
 assert.equal(JSON.stringify(rows),original,'export must never mutate journal state');
});
test('CSV selection respects date, family and media-name search; newest first',()=>{
 const records=[
  {id:'1',hive:'h1',family:'a',type:'Осмотр',date:'2026-11-10',text:'Яйца',media:[{name:'леток-1.mp4'}]},
  {id:'2',hive:'h1',family:'a',type:'Осмотр',date:'2026-11-12',text:'Пчёлы'},
  {id:'3',hive:'h1',family:'b',type:'Осмотр',date:'2026-11-11',text:'Яйца'}
 ];
 const x=setup({records});
 assert.deepEqual(x.functions.filteredJournalRows().map(r=>r.id),['2','3','1']);
 x.values.journalFamilyFilter='a';x.values.journalSearch='леток';
 assert.deepEqual(x.functions.filteredJournalRows().map(r=>r.id),['1']);
 x.values.journalDateFilter='2026-11-11';
 assert.deepEqual(x.functions.filteredJournalRows(),[]);
});
test('CSV fields quote multiline text, separators and formula payloads',()=>{
 const {functions}=setup();
 const row={id:'a',hive:'h1',familyNameAtTime:'=IMPORTXML("bad")',date:'2026-11-26',type:'Заметка',text:'\t=1+2;"цитата"\nстрока',frameId:'+1',media:[]};
 const csv=functions.buildFilteredJournalCsv([row],'h1');
 assert.ok(csv.includes("'\t=1+2;"));
 assert.ok(csv.includes('""цитата""'));
 assert.ok(csv.includes("'+1"));
 assert.ok(csv.includes("'=IMPORTXML"));
 assert.match(csv,/\r\n/);
 assert.equal(functions.journalCsvCell('@SUM(1)'),'"\'@SUM(1)"');
 assert.equal(functions.journalCsvCell('-10'),'"\'-10"');
});
test('CSV builder refuses a cross-hive or archived record, including direct calls',()=>{
 const {functions}=setup();
 assert.throws(()=>functions.buildFilteredJournalCsv([{hive:'other'}],'h1'),/вне текущего улья/i);
 assert.throws(()=>functions.buildFilteredJournalCsv([{hive:'h1',archivedAt:'2026-11-26'}],'h1'),/вне текущего улья/i);
});
test('CSV button is present and export functions never change IndexedDB',()=>{
 assert.match(html,/onclick="downloadFilteredJournalCsv\(\)"/);
 assert.match(html,/CSV содержит только текст выбранных записей, без фото, видео, вложений/);
 assert.match(html,/const filtered=filteredJournalRows\(\)/);
 assert.doesNotMatch(src,/db\.transaction|save\(|saveQueue|localStorage|fetch\(|deleteRecord|objectStore|S\.records\.(push|splice)/);
});
