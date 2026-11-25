import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('async function refreshEntranceVideos(){');
const end=html.indexOf('\nasync function inspectEntranceVideoFile(',start);
assert.ok(start>0&&end>start,'UI function bounds must match current main');
const functionSource=html.slice(start,end);
function deferred(){
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no});
 return {promise,resolve,reject};
}
function fixture(){
 const list=[];
 const host={innerHTML:'unchanged',textContent:''};
 const select={value:'hive-A'};
 const deps={
  entranceVideoRefreshGeneration:0,
  $:id=>id==='entranceVideoList'?host:id==='entranceHiveSelect'?select:null,
  listEntranceVideos:()=>{const request=deferred();list.push(request);return request.promise;},
  hname:id=>id,
  safe:x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])),
  entranceBytes:n=>n+' bytes',
 };
 const refresh=new Function('deps','with(deps){return ('+functionSource+');}')(deps);
 const row=(id,hiveId)=>({id,hiveId,bytes:5,width:2,height:2,durationSec:2,capturedAt:'2026-11-25T00:00:00Z',status:'waiting_for_server'});
 return {deps,refresh,host,select,list,row};
}
test('old response cannot replace latest selected-hive queue',async()=>{
 const f=fixture();
 const old=f.refresh();
 f.select.value='hive-B';
 const newer=f.refresh();
 f.list[1].resolve([f.row('new-B','hive-B'),f.row('not-selected-A','hive-A')]);
 await newer;
 assert.match(f.host.innerHTML,/new-B/);
 assert.doesNotMatch(f.host.innerHTML,/not-selected-A/);
 const latest=f.host.innerHTML;
 f.list[0].resolve([f.row('stale-A','hive-A')]);
 await old;
 assert.equal(f.host.innerHTML,latest,'older resolution must not overwrite current view');
});
test('stale read failure must not erase newer successful video list',async()=>{
 const f=fixture();
 const first=f.refresh();
 const second=f.refresh();
 f.list[1].resolve([f.row('current','hive-A')]);
 await second;
 const current=f.host.innerHTML;
 f.list[0].reject(new Error('synthetic old storage failure'));
 await first;
 assert.equal(f.host.innerHTML,current);
 assert.equal(f.host.textContent,'');
});
test('selection changed without subsequent refresh suppresses stale view and error',async()=>{
 const f=fixture();
 const first=f.refresh();
 f.select.value='hive-B';
 f.list[0].resolve([f.row('wrong','hive-A')]);
 await first;
 assert.equal(f.host.innerHTML,'unchanged');
 const second=f.refresh();
 f.select.value='hive-A';
 f.list[1].reject(new Error('late old error'));
 await second;
 assert.equal(f.host.textContent,'');
});
test('current failure remains visible and a normal single refresh preserves current rows',async()=>{
 const f=fixture();
 const failed=f.refresh();
 f.list[0].reject(new Error('synthetic current failure'));
 await failed;
 assert.match(f.host.textContent,/synthetic current failure/);
 const success=f.refresh();
 f.list[1].resolve([f.row('visible','hive-A')]);
 await success;
 assert.match(f.host.innerHTML,/visible/);
});
test('queue refresh only displays data, never mutates storage or user records',()=>{
 assert.match(functionSource,/generation!==entranceVideoRefreshGeneration/);
 assert.doesNotMatch(functionSource,/\.delete\(|\.put\(|\.clear\(|deleteDatabase\(/);
});

test('composed protected preview never inserts a video identifier into JavaScript source',async()=>{
 const f=fixture(),p=f.refresh();
 f.list[0].resolve([f.row(`video-'"><img src=x onerror=alert(1)>`,'hive-A')]);
 await p;
 assert.match(f.host.innerHTML,/data-video-id="video-&#39;&quot;&gt;&lt;img/);
 assert.match(f.host.innerHTML,/onclick="viewEntranceVideo\(this\.dataset\.videoId\)"/);
 assert.doesNotMatch(f.host.innerHTML,/onclick="viewEntranceVideo\('/);
 assert.doesNotMatch(f.host.innerHTML,/onclick="removeEntranceVideo/);
});
