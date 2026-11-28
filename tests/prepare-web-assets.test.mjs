import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareWebAssets} from '../scripts/prepare-web.mjs';

async function fixture(fn){
 const root=await mkdtemp(join(tmpdir(),'paseka-web-assets-'));
 try{
  await mkdir(join(root,'js'));
  await mkdir(join(root,'icons'));
  await mkdir(join(root,'www','js'),{recursive:true});
  await writeFile(join(root,'index.html'),'<script src="./js/a.js"></script><script src="./js/b.js"></script>');
  await writeFile(join(root,'sw.js'),"const FILES=['./','./js/a.js','./js/b.js'];");
  await writeFile(join(root,'manifest.webmanifest'),'{}');
  await writeFile(join(root,'icons','paseka.svg'),'<svg/>');
  await writeFile(join(root,'js','a.js'),'globalThis.a=1;');
  await writeFile(join(root,'js','b.js'),'globalThis.b=2;');
  for(const name of ['sectional-op02-feeding.js','sectional-entrance-operations.js','sectional-op03-body-swap.js','sectional-queen-outcome.js']) await writeFile(join(root,'js',name),'globalThis.unreleased=1;');
  await writeFile(join(root,'www','js','old-stale.js'),'old generated code');
  await fn(root);
 }finally{
  await rm(root,{recursive:true,force:true});
 }
}

test('Android web shell copies only active scripts and prunes stale build output',()=>fixture(async root=>{
 assert.deepEqual(await prepareWebAssets(root),['./js/a.js','./js/b.js']);
 assert.deepEqual((await readdir(join(root,'www','js'))).sort(),['a.js','b.js']);
 assert.equal(await readFile(join(root,'www','js','a.js'),'utf8'),'globalThis.a=1;');
 assert.equal(await readFile(join(root,'js','sectional-op02-feeding.js'),'utf8'),'globalThis.unreleased=1;');
 assert.deepEqual(await prepareWebAssets(root),['./js/a.js','./js/b.js']);
 assert.deepEqual((await readdir(join(root,'www','js'))).sort(),['a.js','b.js']);
}));

test('missing offline-cache dependency fails before replacing generated assets',()=>fixture(async root=>{
 await writeFile(join(root,'sw.js'),"const FILES=['./','./js/a.js'];");
 await assert.rejects(prepareWebAssets(root),/active script absent from offline manifest/);
 assert.equal(await readFile(join(root,'www','js','old-stale.js'),'utf8'),'old generated code');
}));

test('unclassified JavaScript module fails before replacing generated assets',()=>fixture(async root=>{
 await writeFile(join(root,'js','unclassified.js'),'not yet reviewed');
 await assert.rejects(prepareWebAssets(root),/unclassified or missing isolated module/);
 assert.equal(await readFile(join(root,'www','js','old-stale.js'),'utf8'),'old generated code');
}));

test('unsafe script paths and duplicate script references fail closed',()=>fixture(async root=>{
 await writeFile(join(root,'index.html'),'<script src="../private.js"></script>');
 await assert.rejects(prepareWebAssets(root),/unsafe script source/);
 await writeFile(join(root,'index.html'),'<script src="./js/a.js"></script><script src="./js/a.js"></script>');
 await assert.rejects(prepareWebAssets(root),/duplicate or unsafe script source/);
 assert.equal(await readFile(join(root,'www','js','old-stale.js'),'utf8'),'old generated code');
}));
