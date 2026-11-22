import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function load(name,deps={}){
 const pattern=new RegExp('\\bfunction\\s+'+name+'\\s*\\(');
 const match=pattern.exec(html);assert.ok(match,name+' missing');
 const next=/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
 next.lastIndex=match.index+match[0].length;
 const end=next.exec(html);
 return new Function('deps','with(deps){return ('+html.slice(match.index,end?end.index:html.indexOf('</script>',match.index))+');}')(deps);
}
const host=()=>({innerHTML:'',textContent:'',classList:{toggle(){}}});
const safe=v=>String(v??'');

test('P2: bounded audit rendering matches the historic most-recent ordering',()=>{
 const fn=load('latestAuditEvents');
 const events=Array.from({length:1000},(_,i)=>({id:'a'+i,type:i%11===0?'schema_migration':'frame_moved'}));
 const baseline=events.filter(x=>x.type!=='schema_migration').slice().reverse().slice(0,100);
 const result=fn(events);
 assert.deepEqual(result,baseline);
 assert.equal(result.length,100);
 assert.deepEqual(events[0],{id:'a0',type:'schema_migration'},'source history is not mutated');
 assert.deepEqual(fn([]),[]);
 assert.deepEqual(fn([{id:'only',type:'frame_moved'}]),[{id:'only',type:'frame_moved'}]);
});

test('P2: preview does not walk a long history when the newest 100 are available',()=>{
 const base=Array.from({length:20000},(_,i)=>({id:i,type:'frame_moved'}));
 let reads=0;
 const proxied=new Proxy(base,{
  get(target,key,receiver){
   if(typeof key==='string'&&/^\d+$/.test(key))reads++;
   return Reflect.get(target,key,receiver);
  }
 });
 const result=load('latestAuditEvents')(proxied);
 assert.equal(result.length,100);
 assert.equal(result[0].id,19999);
 assert.equal(result[99].id,19900);
 assert.equal(reads,100,'must visit only the newest 100 records');
});

test('P2: filtering before chronological sort preserves journal order and count',()=>{
 const records=[
  {id:'a',hive:'h1',date:'2026-11-20',type:'Осмотр',text:'ключ старый'},
  {id:'z',hive:'h2',date:'2026-11-23',type:'Осмотр',text:'ключ чужой'},
  {id:'b',hive:'h1',date:'2026-11-22',type:'Осмотр',text:'ключ новый'},
  {id:'c',hive:'h1',date:'2026-11-21',type:'Подкормка',text:'другая запись'},
  {id:'archived',hive:'h1',date:'2026-11-24',type:'Осмотр',text:'ключ архивный',archivedAt:'2026-11-24'}
 ];
 const els={records:host(),journalResultCount:host(),journalSearch:{value:'ключ'},journalDateFilter:{value:''}};
 const deps={
  S:{records,families:[]},activeJournalHive:'h1',$:id=>els[id]||null,
  renderFeedingLedger(){},safe,recordFamilyHtml:()=>'',recordExtraHtml:()=>'',mediaHtml:()=>''
 };
 const render=load('renderJournalRecords',deps);
 render();
 const out=els.records.innerHTML;
 assert.ok(out.indexOf('data-record-id="b"')<out.indexOf('data-record-id="a"'));
 assert.doesNotMatch(out,/data-record-id="c"|data-record-id="z"|data-record-id="archived"/);
 assert.equal(els.journalResultCount.textContent,'2 из 3 записей');
 els.journalSearch.value='';
 render();
 const full=els.records.innerHTML;
 assert.ok(full.indexOf('data-record-id="b"')<full.indexOf('data-record-id="c"'));
 assert.ok(full.indexOf('data-record-id="c"')<full.indexOf('data-record-id="a"'));
 assert.equal(els.journalResultCount.textContent,'3 из 3 записей');
 assert.deepEqual(records.map(r=>r.id),['a','z','b','c','archived'],'persisted order never changes');
});

test('P2: journal sorts only the selected rows, not all historical rows',()=>{
 const start=html.indexOf('function renderJournalRecords(){');
 const end=html.indexOf('\nfunction ',start+20);
 const code=html.slice(start,end);
 assert.match(code,/const rows=activeJournalHive\?available:\[\];/);
 assert.match(code,/\}\)\.sort\(\(a,b\)=>String\(b\.date\|\|''\)/);
 assert.doesNotMatch(code,/available\.filter\([^\n]+\)\.sort\(/);
});
