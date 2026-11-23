import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('function openVarroaTreatmentJournal(){');
const end=html.indexOf('\nfunction localIncidentDateTime(){',start);
assert.ok(start>=0&&end>start,'Varroa entry point must be in app code');
const functionSource=html.slice(start,end);

function setup(hives,selectedHive){
 const elements=Object.fromEntries(['varroaHive','recordDlg','recordForm','rtype','rtreatmentActive','rtreatmentMethod','recordTitle','aiJournalExtractNotice'].map(id=>[id,{value:'',dataset:{},style:{},open:true,textContent:''}]));
 elements.varroaHive.value=selectedHive;
 let activeJournalHive=null,created=0,toggled=0,alerts=[];
 const open=new Function('S','$','newRecord','toggleOccupancy','hname','alert',`let activeJournalHive=null;${functionSource};return {run:openVarroaTreatmentJournal,getActive:()=>activeJournalHive}`)(
  {hives},id=>elements[id],()=>{created++;elements.recordForm.dataset.varroaTreatmentDraft='';},()=>{toggled++;},id=>'Улей '+id,text=>alerts.push(text)
 );
 return {elements,open,get created(){return created},get toggled(){return toggled},alerts};
}

test('user-selected existing hive opens actual-treatment journal draft with known method only',()=>{
 const x=setup([{id:'h1'},{id:'h2'}],'h2');x.open.run();
 assert.equal(x.open.getActive(),'h2');
 assert.equal(x.created,1);
 assert.equal(x.toggled,1);
 assert.equal(x.elements.rtype.value,'Обработка');
 assert.equal(x.elements.rtreatmentActive.value,'Щавелевая кислота');
 assert.equal(x.elements.rtreatmentMethod.value,'Сублимация сублиматором');
 assert.equal(x.elements.recordForm.dataset.varroaTreatmentDraft,'1');
 assert.match(x.elements.aiJournalExtractNotice.textContent,/Подтверди фактическое выполнение/);
 assert.deepEqual(x.alerts,[]);
});
test('missing hive fails closed: no journal draft, no fabricated treatment',()=>{
 const x=setup([{id:'h1'}],'missing');x.open.run();
 assert.equal(x.created,0);
 assert.equal(x.open.getActive(),null);
 assert.match(x.alerts[0],/существующий улей/);
});
test('treatment draft requires explicit confirmation before any state mutation',()=>{
 const submit=html.slice(html.indexOf("$('recordForm').onsubmit=async e=>{"),html.indexOf('const FRAME_TYPES='));
 const validator=submit.indexOf('if(!journalValidation.ok)');
 const confirmation=submit.indexOf("dataset.varroaTreatmentDraft==='1'");
 const mutation=submit.indexOf('if(oldRecord)Object.assign(oldRecord,data);else S.records.push(data)');
 assert.ok(validator>=0&&confirmation>validator&&mutation>confirmation);
 assert.match(submit,/if\(!isTreatment\)/);
 assert.match(submit,/if\(data\.date>today\(\)\)/);
 assert.match(submit,/if\(!confirm\(/);
 const persisted=submit.indexOf('stored=await save()');
 const dialogClose=submit.indexOf("$('recordDlg').close()");
 assert.ok(persisted>mutation&&dialogClose>persisted,'journal closes only after a confirmed save');
 assert.match(submit,/dataset\.varroaTreatmentDraft='';\s*}finally\{form\.dataset\.saveInProgress='';\}/);
});
test('new record and edit record reset treatment-specific flag',()=>{
 assert.match(html,/function newRecord\(\)\{\$\('recordForm'\)\.dataset\.varroaTreatmentDraft='';/);
 assert.match(html,/function editRecord\(id\)\{[^\n]*dataset\.varroaTreatmentDraft='';/);
});
test('entry reuses journal storage without schema migration and leaves dose unfilled',()=>{
 const source=html.slice(start,end);
 assert.doesNotMatch(source,/rtreatmentDose.*value=/);
 assert.doesNotMatch(source,/S\.records\.push|schemaVersion|indexedDB|delete|\.save\(/);
 assert.match(html,/id="varroaObservationsList"/);
 assert.match(html,/onclick="openVarroaTreatmentJournal\(\)"/);
});

test('Varroa treatment history filters by selected hive and excludes other events',()=>{
 const renderStart=html.indexOf('function renderVarroaModule(){');
 const renderEnd=html.indexOf('\nasync function saveVarroaObservation(',renderStart);
 assert.ok(renderStart>=0&&renderEnd>renderStart);
 const renderSource=html.slice(renderStart,renderEnd);
 const elements=Object.fromEntries(['varroaHive','varroaDate','varroaObservationsList','varroaTreatmentsList','varroaTreatmentsCount','varroaCount'].map(id=>[id,{value:'',innerHTML:'',textContent:''}]));
 elements.varroaHive.value='h1';
 const state={
  hives:[{id:'h1',number:1},{id:'h2',number:2}],
  varroaObservations:[],
  records:[
   {id:'t1',type:'Обработка',hive:'h1',date:'2026-11-22',treatmentActive:'Щавелевая кислота',treatmentMethod:'Сублимация сублиматором',text:'Факт выполнен'},
   {id:'t2',type:'Обработка',hive:'h2',date:'2026-11-21',treatmentProduct:'Другой препарат'},
   {id:'a1',type:'Обработка',hive:'h1',date:'2026-11-20',archivedAt:'2026-11-21'},
   {id:'n1',type:'Заметка',hive:'h1',date:'2026-11-20'}
  ]
 };
 const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const render=new Function('S','$','ruPlural','hname','safe','today','selectedHiveId',renderSource+';return renderVarroaModule')(
  state,id=>elements[id],(n,a,b,c)=>n===1?a:c,id=>'Улей '+id,safe,()=> '2026-11-23','h1'
 );
 render();
 assert.match(elements.varroaTreatmentsCount.textContent,/^1 обработка/);
 assert.match(elements.varroaTreatmentsList.innerHTML,/Щавелевая кислота/);
 assert.match(elements.varroaTreatmentsList.innerHTML,/Факт выполнен/);
 assert.doesNotMatch(elements.varroaTreatmentsList.innerHTML,/Другой препарат|n1|a1/);
 assert.match(elements.varroaObservationsList.innerHTML,/Измерений пока нет/);
 elements.varroaHive.value='h2';
 render();
 assert.match(elements.varroaTreatmentsCount.textContent,/^1 обработка/);
 assert.match(elements.varroaTreatmentsList.innerHTML,/Другой препарат/);
 assert.doesNotMatch(elements.varroaTreatmentsList.innerHTML,/Щавелевая кислота/);
});

test('treatment history safely escapes user-provided text',()=>{
 const renderStart=html.indexOf('function renderVarroaModule(){');
 const renderEnd=html.indexOf('\nasync function saveVarroaObservation(',renderStart);
 const renderSource=html.slice(renderStart,renderEnd);
 const elements=Object.fromEntries(['varroaHive','varroaDate','varroaObservationsList','varroaTreatmentsList','varroaTreatmentsCount','varroaCount'].map(id=>[id,{value:'',innerHTML:'',textContent:''}]));
 elements.varroaHive.value='h1';
 const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const state={hives:[{id:'h1'}],varroaObservations:[],records:[{id:'t',type:'Обработка',hive:'h1',date:'2026-11-22',treatmentProduct:'<img src=x onerror=alert(1)>',text:'<script>bad()</script>'}]};
 const render=new Function('S','$','ruPlural','hname','safe','today','selectedHiveId',renderSource+';return renderVarroaModule')(
  state,id=>elements[id],(n,a,b,c)=>n===1?a:c,id=>'Улей '+id,safe,()=> '2026-11-23','h1'
 );
 render();
 assert.doesNotMatch(elements.varroaTreatmentsList.innerHTML,/<img|<script>/i);
 assert.match(elements.varroaTreatmentsList.innerHTML,/&lt;img/);
 assert.match(elements.varroaTreatmentsList.innerHTML,/&lt;script&gt;/);
});

test('Varroa picker updates treatment history when selecting a different hive',()=>{
 assert.match(html,/<select id="varroaHive" onchange="renderVarroaModule\(\)" required>/);
 assert.match(html,/id="varroaTreatmentsList"/);
 assert.match(html,/не только против Varroa/);
});
