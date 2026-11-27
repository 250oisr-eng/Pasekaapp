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
