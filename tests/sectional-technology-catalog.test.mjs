import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../js/sectional-technology-catalog.js',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
const root={};new Function('window',source)(root);
const {catalog,find,inspect,renderOperation}=root.PasekaSectionalTechnologyCatalog;
test('all fourteen operations have distinct source-traced read-only descriptions',()=>{
 assert.equal(catalog.length,14);
 assert.deepEqual(catalog.map(x=>x.id),Array.from({length:14},(_,i)=>'OP-'+String(i+1).padStart(2,'0')));
 assert.ok(catalog.every(x=>x.title&&x.source&&x.timing&&x.physicalAction===true));
 assert.ok(catalog.every(x=>x.implementation==='coordinator_only'||x.implementation==='not_implemented'));
 assert.ok(catalog.slice(0,3).every(x=>x.implementation==='not_implemented'));
 assert.ok(catalog.slice(3,7).every(x=>x.implementation==='coordinator_only'));
 assert.ok(catalog.slice(7).every(x=>x.implementation==='not_implemented'));
});
test('read-only technology reference never authorizes physical operations',()=>{
 for(const x of catalog){
  const result=inspect({operationId:x.id,profileId:'sectional-multiqueen-v1'});
  assert.equal(result.ok,false);assert.equal(result.canExecute,false);
  assert.equal(result.code,'READ_ONLY_NOT_ACTIVATED');
 }
 assert.equal(inspect({operationId:'OP-14',profileId:'farrar'}).code,'PROFILE_ISOLATION');
 assert.equal(inspect({operationId:'OP-15'}).code,'UNKNOWN_OPERATION');
});
test('critical source alternatives and user-confirmed requirements are preserved',()=>{
 assert.match(find('OP-02').source,/100–200 г в сутки/);
 assert.match(find('OP-02').source,/2:1/);
 assert.match(find('OP-03').timing,/необязательно/);
 assert.match(find('OP-05').timing,/необязательным/);
 assert.match(find('OP-06').timing,/двухматочн/i);
 assert.match(find('OP-07').source,/парами \(2 или 4\)/);
 assert.match(find('OP-07').timing,/12–15 дней/);
 assert.match(find('OP-11').timing,/альтернатива OP-12/);
 assert.match(find('OP-12').source,/2\+1\+1/);
 assert.match(find('OP-13').timing,/полутора месяцев/);
 assert.doesNotMatch(find('OP-13').timing,/40–50/);
 assert.match(find('OP-14').timing,/3–5 дней/);
 assert.match(find('OP-14').timing,/отобрать два отводка/);
});
test('catalog rendering is informational and cannot change persisted state',()=>{
 const before=JSON.stringify(catalog);
 assert.match(renderOperation('OP-14'),/не реализовано/);
 assert.match(renderOperation('OP-04'),/сквозной UI не подтверждён/);
 assert.match(renderOperation('OP-15'),/не найдена/);
 assert.equal(JSON.stringify(catalog),before);
 assert.doesNotMatch(source,/\.put\(|\.delete\(|\bcommit\(|\bsave\(/);
});
test('reference is connected into settings and offline cache without completion buttons',()=>{
 assert.match(html,/js\/sectional-technology-catalog\.js/);
 assert.match(html,/id="sectionalTechOp"/);
 assert.match(html,/initializeSectionalTechnologyReference/);
 assert.match(html,/Не выполняет физических операций/);
 assert.match(sw,/sectional-technology-catalog\.js/);
 assert.doesNotMatch(html,/onclick="completeOP0[1-9]\(/);
});
