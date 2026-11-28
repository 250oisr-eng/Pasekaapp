import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const at=html.indexOf('function inventoryHistoryRowsHtml('),end=html.indexOf('\nfunction showMoreInventoryHistory(',at);
assert.ok(at>=0&&end>at);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rows=new Function('safe','inventoryEventDetails',html.slice(at,end)+';return inventoryHistoryRowsHtml')(safe,()=> '');
test('history allows all 27 events in independent pages without truncation or mutation',()=>{
 const body={id:'b1',events:Array.from({length:27},(_,i)=>({id:'ev-'+i,at:'2026-11-28T12:00:00Z',type:'unknown-'+i}))};
 const before=JSON.stringify(body);
 const p1=rows(body,0,12),p2=rows(body,12,12),p3=rows(body,24,12);
 assert.equal((p1.match(/class="muted"/g)||[]).length,12);
 assert.equal((p2.match(/class="muted"/g)||[]).length,12);
 assert.equal((p3.match(/class="muted"/g)||[]).length,3);
 assert.match(p1,/unknown-26/);assert.match(p3,/unknown-0/);
 assert.equal(JSON.stringify(body),before);
});
test('escaped malformed history event stays visible as warning and no HTML execution',()=>{
 const body={events:[{type:'<img src=x onerror=alert(1)>',at:'invalid'},null,{type:'registered',at:'2026-11-28T12:00:00Z'}]};
 const output=rows(body,0,12);
 assert.doesNotMatch(output,/<img|onerror=/i);
 assert.match(output,/Повреждённая запись истории/);
 assert.match(output,/&lt;img/);
});
test('history display exposes progressive paging control without altering storage',()=>{
 assert.match(html,/data-offset="12" onclick="showMoreInventoryHistory\(this\)"/);
 assert.match(html,/insertAdjacentHTML\('beforeend'/);
 assert.match(html,/body\.id!==id/);
});
