import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function extract(name) {
 const begin=html.indexOf('function '+name+'(');
 assert.ok(begin>=0, 'missing helper '+name);
 const next=/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
 next.lastIndex=begin+name.length+10;
 const stop=next.exec(html);
 return new Function('return ('+html.slice(begin,stop?stop.index:html.indexOf('</script>',begin))+');')();
}
test('audit preview selects newest 100 non-migration events exactly in reverse log order',()=>{
 const helper=extract('latestAuditEvents');
 const events=Array.from({length:1500},(_,i)=>({id:'event-'+i,type:i%13===0?'schema_migration':'frame_moved'}));
 const expected=events.filter(e=>e.type!=='schema_migration').slice().reverse().slice(0,100);
 assert.deepEqual(helper(events),expected);
 assert.deepEqual(events[0],{id:'event-0',type:'schema_migration'},'source history remains untouched');
 assert.deepEqual(helper([]),[]);
 assert.deepEqual(helper(null),[]);
 assert.deepEqual(helper([null,{id:'a',type:'frame_moved'}]),[{id:'a',type:'frame_moved'}]);
});
test('audit preview reads exactly latest 100 entries when no migrations',()=>{
 const helper=extract('latestAuditEvents');
 const base=Array.from({length:25000},(_,i)=>({id:i,type:'frame_moved'}));
 let reads=0;
 const observed=new Proxy(base,{get(target,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key))reads++;return Reflect.get(target,key,receiver);}});
 const rows=helper(observed);
 assert.equal(reads,100);
 assert.deepEqual(rows.map(x=>x.id),Array.from({length:100},(_,i)=>24999-i));
});
test('audit preview skips migration-only tail while keeping latest valid entries',()=>{
 const helper=extract('latestAuditEvents');
 const events=[
 {id:'first',type:'frame_moved'},
 {id:'migration-1',type:'schema_migration'},
 {id:'second',type:'hive_moved'},
 {id:'migration-2',type:'schema_migration'},
 {id:'last',type:'family_created'}
 ];
 assert.deepEqual(helper(events,2).map(x=>x.id),['last','second']);
 assert.deepEqual(helper(events,100).map(x=>x.id),['last','second','first']);
 assert.deepEqual(helper(events,0),[]);
 assert.deepEqual(helper(events,1.5),[]);
});
test('UI uses bounded preview helper and does not filter-clone full history',()=>{
 assert.match(html,/const events=latestAuditEvents\(S\.auditLog\|\|\[\]\);/);
 assert.doesNotMatch(html,/\(S\.auditLog\|\|\[\]\)\.filter\(x=>x\.type!=='schema_migration'\)\.slice\(\)\.reverse\(\)/);
});
