import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const html=await readFile(new URL('./index.html',root),'utf8');
const sw=await readFile(new URL('./sw.js',root),'utf8');
const scriptPaths=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(m=>m[1]);
const match=sw.match(/const FILES=\[([^\]]+)\];/);
const swFiles=match?[...match[1].matchAll(/'([^']+)'/g)].map(m=>m[1]):[];

test('local app scripts are unique, exist, and are covered by offline shell',async()=>{
 assert.ok(scriptPaths.length>0&&match,'Static script and shell manifests must be readable');
 assert.equal(new Set(scriptPaths).size,scriptPaths.length,'Duplicate HTML script inclusion');
 assert.equal(new Set(swFiles).size,swFiles.length,'Duplicate offline cache item');
 for(const path of scriptPaths){
  assert.match(path,/^\.\/js\/[a-z0-9._-]+\.js$/);
  assert.ok(swFiles.includes(path),'Active script is not precached: '+path);
  assert.ok((await readFile(new URL(path,root))).length>0,'Missing/empty active script: '+path);
 }
 for(const path of swFiles.filter(x=>x!=='./')){
  assert.match(path,/^\.\/[^?#]+$/);
  assert.ok((await readFile(new URL(path,root))).length>0,'Missing/empty offline shell asset: '+path);
 }
 const cache=sw.match(/const CACHE='paseka-shell-v(\d+)'/);
 const version=sw.match(/const CACHE_VERSION=(\d+)/);
 assert.ok(cache&&version);
 assert.equal(cache[1],version[1]);
});

test('OP02 pending model stays offline-shell and runtime isolated until B07 activation',async()=>{
 const isolated='sectional-op02-feeding.js';
 assert.ok((await readdir(new URL('./js/',root))).includes(isolated));
 assert.ok(!scriptPaths.some(x=>x.endsWith('/'+isolated)));
 assert.ok(!swFiles.some(x=>x.endsWith('/'+isolated)));
 assert.match(html,/SECTIONAL_HONEY_QA_WRITE_ENABLED/);
 assert.match(html,/sectionalExtractionHasEvidence/);
});



test('all local JavaScript modules are accounted for as active or deliberately isolated',async()=>{
 const files=(await readdir(new URL('./js/',root))).filter(x=>x.endsWith('.js')).sort();
 const active=scriptPaths.map(x=>x.slice('./js/'.length));
 const isolated=['sectional-op02-feeding.js','sectional-op13-readiness.js'];
 for(const name of isolated){
  assert.ok(!scriptPaths.some(x=>x.endsWith('/'+name)),name+' must remain detached from runtime');
  assert.ok(!swFiles.some(x=>x.endsWith('/'+name)),name+' must remain outside offline shell until activation');
 }
 assert.deepEqual(files,[...new Set([...active,...isolated])].sort(),
  'Unreferenced or duplicate JavaScript module: classify as active or explicitly isolated before integration');
});

test('global-module load order follows direct domain dependencies without a cycle',()=>{
 const dependencies=new Map([
  ['./js/equipment-bodies.js',['./js/equipment-labels.js']],
  ['./js/equipment-inventory.js',['./js/equipment-labels.js']],
  ['./js/sectional-operation-coordinator.js',[
   './js/equipment-items.js','./js/family-lineage.js','./js/equipment-inventory.js',
   './js/equipment-labels.js','./js/sectional-physical-layout.js'
  ]],
  ['./js/sectional-stock-pairs.js',[
   './js/equipment-inventory.js','./js/equipment-labels.js','./js/sectional-operation-coordinator.js'
  ]],
  ['./js/sectional-honey-review-ui.js',[
   './js/sectional-honey-review.js','./js/sectional-operation-coordinator.js','./js/sectional-stock-pairs.js'
  ]]
 ]);
 const paths=new Map(scriptPaths.map((x,i)=>[x,i]));
 let edgeCount=0;
 for(const [module,deps] of dependencies){
  assert.ok(paths.has(module),'Missing active module '+module);
  for(const dependency of deps){
   assert.ok(paths.has(dependency),'Missing domain dependency '+dependency);
   assert.ok(paths.get(dependency)<paths.get(module),module+' loads before '+dependency);
   edgeCount++;
  }
 }
 assert.equal(edgeCount,13);
});
