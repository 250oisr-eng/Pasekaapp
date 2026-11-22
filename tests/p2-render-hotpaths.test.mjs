import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function load(name,deps){
 const pattern=new RegExp('\\bfunction\\s+'+name+'\\s*\\(');
 const match=pattern.exec(html);
 assert.ok(match,'missing '+name);
 const next=/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
 next.lastIndex=match.index+match[0].length;
 const end=next.exec(html);
 const source=html.slice(match.index,end?end.index:html.indexOf('</script>',match.index));
 return new Function('deps','with(deps){return ('+source+');}')(deps);
}
const host=()=>({innerHTML:'',textContent:'',classList:{toggle(){}}});
const safe=value=>String(value??'');
const plural=(n,one,few,many)=>one;

function directoryHarness(query,mode='all'){
 const elements={hiveList:host(),hiveDirectoryCount:host(),hiveSearch:{value:query},hiveModeFilter:{value:mode}};
 const state={
  hives:[{id:'h1'},{id:'h2'}],
  families:[{id:'family',hive:'h1',name:'Карпатка'}]
 };
 let frameReads=0,profileReads=0;
 const layouts={h1:{mode:'summer'},h2:{mode:'winter'}};
 const deps={
  S:state,
  $:id=>elements[id],layoutFor:id=>layouts[id],
  getHiveProfile:()=>{profileReads++;return {name:'Фаррар'};},
  hname:id=>'Улей '+id,profileBroodKeys:()=>['1'],
  profileHoneyKeys:()=>[],
  frameArray:(_l,_key,id)=>{frameReads++;return [{frameId:id==='h1'?'FRAME-001':'FRAME-002'}];},
  card:hive=>'<div>'+hive.id+'</div>',safe,ruPlural:plural
 };
 return {elements,counts:()=>({frameReads,profileReads}),run:load('renderHiveDirectory',deps)};
}

test('P2: empty hive search does not load frame arrays or hive profiles',()=>{
 const h=directoryHarness('');
 h.run();
 assert.equal(h.counts().frameReads,0);
 assert.equal(h.counts().profileReads,0);
 assert.match(h.elements.hiveList.innerHTML,/h1/);
 assert.match(h.elements.hiveList.innerHTML,/h2/);
 assert.match(h.elements.hiveDirectoryCount.textContent,/2 из 2/);
});

test('P2: hive mode filtering returns original matches without frame search',()=>{
 const h=directoryHarness('', 'winter');
 h.run();
 assert.equal(h.counts().frameReads,0);
 assert.equal(h.elements.hiveList.innerHTML,'<div>h2</div>');
});

test('P2: a name match skips frame work, while a frame-ID match remains searchable',()=>{
 const cheap=directoryHarness('карпатка');
 cheap.run();
 assert.equal(cheap.counts().frameReads,0,'name-only hit should be resolved before inspecting frames');
 assert.equal(cheap.elements.hiveList.innerHTML,'<div>h1</div>');
 const frames=directoryHarness('frame-002');
 frames.run();
 assert.equal(frames.elements.hiveList.innerHTML,'<div>h2</div>');
 assert.equal(frames.counts().frameReads,2,'unmatched hives still search existing frame IDs');
});

test('P2: journal structured filters precede expensive media/full-text processing',()=>{
 let mediaReads=0;
 const record={
  id:'r1',hive:'h1',family:'f1',type:'Осмотр',
  date:'2026-11-23',text:'Семья сильная',
  media:[{get name(){mediaReads++;return 'carpathian-2026.mp4';}}]
 };
 const elements={
  records:host(),journalResultCount:host(),journalSearch:{value:''},
  journalDateFilter:{value:''},journalTypeFilter:null,journalFamilyFilter:null
 };
 const deps={
  S:{records:[record],families:[]},activeJournalHive:'h1',
  $:id=>elements[id],renderFeedingLedger(){},
  safe,recordFamilyHtml:()=>'',recordExtraHtml:()=>'',mediaHtml:()=>'<span>video</span>'
 };
 const render=load('renderJournalRecords',deps);
 render();
 assert.equal(mediaReads,0,'empty search must not read media names');
 assert.match(elements.records.innerHTML,/Семья сильная/);
 elements.journalSearch.value='carpathian';
 render();
 assert.equal(mediaReads,1,'explicit text search reads media metadata');
 assert.match(elements.records.innerHTML,/Семья сильная/);
 elements.journalDateFilter.value='2026-11-22';
 render();
 assert.equal(mediaReads,1,'date mismatch must skip text search');
 assert.match(elements.records.innerHTML,/По выбранным фильтрам записей нет/);
});

test('P2: home groups pending tasks once and renders unchanged due-date buckets',()=>{
 const day='2026-11-23';
 let todayCalls=0,enumerations=0;
 const tasks=[
  {id:'late1',hive:'h1',status:'pending',date:'2026-11-22'},
  {id:'today1',hive:'h2',status:'pending',date:day},
  {id:'later',hive:'h1',status:'pending',date:'2026-11-25'},
  {id:'hint',hive:'h2',status:'suggested',date:day},
  {id:'done',hive:'h1',status:'completed',date:day}
 ];
 const trackedTasks=new Proxy(tasks,{
  get(target,key,receiver){
   if(key===Symbol.iterator)return function*(){enumerations++;yield* target;};
   if(key==='filter')return ()=>{throw new Error('repeated task scans are not allowed');};
   return Reflect.get(target,key,receiver);
  }
 });
 const elements={homeHives:host(),homeTasks:host(),homeAlerts:host()};
 const state={hives:[{id:'h1'},{id:'h2'}],families:[],tasks:trackedTasks};
 const deps={
  S:state,$:id=>elements[id],
  renderApiaryStatus(){},today:()=>{todayCalls++;return day;},
  layoutFor:()=>({mode:'summer',installedBoxes:[],honeyBoxInstalled:[],boxes:{},honeyFrames:[]}),
  getHiveProfile:()=>({name:'Фаррар',family:'farrar',layout:{rows:[[]]}}),
  profileBroodKeys:()=>[],profileHoneyKeys:()=>[],
  frameStatusName:x=>x,ruPlural:plural,safe,
  hname:id=>id,taskMarkup:task=>'['+task.id+']'
 };
 load('renderHome',deps)();
 assert.equal(enumerations,1,'each render must iterate the task collection once');
 assert.equal(todayCalls,1,'all buckets share one coherent date');
 assert.match(elements.homeAlerts.innerHTML,/late1/);
 assert.match(elements.homeTasks.innerHTML,/today1/);
 assert.match(elements.homeTasks.innerHTML,/hint/);
 assert.match(elements.homeTasks.innerHTML,/later/);
 assert.doesNotMatch(elements.homeTasks.innerHTML,/done/);
});
