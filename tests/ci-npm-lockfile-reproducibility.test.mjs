import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const pkg=JSON.parse(readFileSync('package.json','utf8'));
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
const coreWorkflows=[
 '.github/workflows/quality.yml',
 '.github/workflows/android-debug.yml',
 '.github/workflows/android-qa-isolated.yml',
 '.github/workflows/android-qa-saf-archive.yml',
 '.github/workflows/android-qa-daily-archives.yml'
];

test('npm lock v3 exactly matches current direct dependencies',()=>{
 assert.equal(lock.lockfileVersion,3);
 assert.equal(lock.requires,true);
 assert.equal(lock.name,pkg.name);
 assert.equal(lock.version,pkg.version);
 assert.equal(lock.packages[''].name,pkg.name);
 assert.equal(lock.packages[''].version,pkg.version);
 assert.deepEqual(lock.packages[''].dependencies,pkg.dependencies);
 assert.deepEqual(lock.packages[''].devDependencies,pkg.devDependencies);
});

test('npm transitive packages are pinned to resolved registry URLs and SRI',()=>{
 const packages=Object.entries(lock.packages).filter(([name])=>name!=='');
 assert.ok(packages.length>=10,'missing transitive packages');
 for(const [name,meta] of packages){
  assert.ok(name.startsWith('node_modules/'),name);
  assert.match(meta.version,/^\d+\.\d+\.\d+/,'unversioned: '+name);
  assert.match(meta.resolved,/^https:\/\/registry\.npmjs\.org\//,'untrusted registry: '+name);
  assert.match(meta.integrity,/^sha(?:1|256|384|512)-[A-Za-z0-9+/]+=*$/,'missing SRI: '+name);
 }
});

for(const file of coreWorkflows){
 test('CI uses npm ci with a committed lock: '+file,()=>{
  const yaml=readFileSync(file,'utf8');
  assert.match(yaml,/run: npm ci --no-audit --no-fund/);
  assert.doesNotMatch(yaml,/run: npm install --no-audit --no-fund/);
  assert.doesNotMatch(yaml,/PASEKA_LOCK_BOOTSTRAP_/);
 });
}

test('main quality and Android CI invalidate npm cache on lock changes',()=>{
 for(const file of coreWorkflows.slice(0,2)){
  const yaml=readFileSync(file,'utf8');
  assert.match(yaml,/hashFiles\('package-lock\.json'\)/);
  assert.match(yaml,/\n      - 'package-lock\.json'/);
  assert.match(yaml,/npm test(?:\s|$)/m);
 }
});

test('manual release workflow already uses the locked npm install',()=>{
 const yaml=readFileSync('.github/workflows/pages-manual-release.yml','utf8');
 assert.match(yaml,/run: npm ci --no-audit --no-fund/);
});

function unreachableLockEntries(packages){
 const visited=new Set(['']);
 const queue=[''];
 function resolvePackage(parent,dependency){
  let base=parent;
  while(true){
   const path=(base?base+'/':'')+'node_modules/'+dependency;
   if(packages[path])return path;
   const i=base.lastIndexOf('/node_modules/');
   if(i>=0){base=base.slice(0,i);continue;}
   if(base){base='';continue;}
   return null;
  }
 }
 while(queue.length){
  const key=queue.shift(),meta=packages[key]||{};
  const deps={...meta.dependencies,...meta.devDependencies,...meta.optionalDependencies,...meta.peerDependencies};
  for(const name of Object.keys(deps)){
   const dependency=resolvePackage(key,name);
   assert.ok(dependency,'missing locked dependency '+key+' -> '+name);
   if(!visited.has(dependency)){visited.add(dependency);queue.push(dependency);}
  }
 }
 return Object.keys(packages).filter(key=>!visited.has(key)).sort();
}

test('no unused or orphaned transitive packages are left in the npm lock graph',()=>{
 assert.deepEqual(unreachableLockEntries(lock.packages),[]);
 // Negative fixture: a pinned package is not justified by a name/version alone.
 const withGhost={...lock.packages,'node_modules/unused-ghost':{
  version:'1.0.0',resolved:'https://registry.npmjs.org/unused-ghost/-/unused-ghost-1.0.0.tgz',
  integrity:'sha512-Z2hvc3Q='
 }};
 assert.deepEqual(unreachableLockEntries(withGhost),['node_modules/unused-ghost']);
});
