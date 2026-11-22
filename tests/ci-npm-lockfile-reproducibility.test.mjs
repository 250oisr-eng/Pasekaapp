import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const manifest=JSON.parse(readFileSync('package.json','utf8'));
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
const workflows=[
 '.github/workflows/quality.yml',
 '.github/workflows/android-debug.yml',
 '.github/workflows/android-archive-test.yml'
];

test('npm lock v3 exactly matches the direct runtime and test dependencies',()=>{
 assert.equal(lock.lockfileVersion,3);
 assert.equal(lock.requires,true);
 assert.equal(lock.name,manifest.name);
 assert.equal(lock.version,manifest.version);
 assert.equal(lock.packages['']?.name,manifest.name);
 assert.equal(lock.packages['']?.version,manifest.version);
 assert.deepEqual(lock.packages[''].dependencies,manifest.dependencies);
 assert.deepEqual(lock.packages[''].devDependencies,manifest.devDependencies);
});

test('every transitive npm package is pinned to authenticated registry contents',()=>{
 const installed=Object.entries(lock.packages).filter(([key])=>key!=='');
 assert.ok(installed.length>=10,'lockfile unexpectedly omits transitive dependencies');
 for(const [name,meta] of installed){
  assert.ok(name.startsWith('node_modules/'),name);
  assert.match(meta.version,/^\d+\.\d+\.\d+/,'unversioned: '+name);
  assert.match(meta.resolved,/^https:\/\/registry\.npmjs\.org\//,'untrusted registry: '+name);
  assert.match(meta.integrity,/^sha(?:1|256|384|512)-[A-Za-z0-9+/]+=*$/,'missing SRI: '+name);
 }
});

for(const path of workflows){
 test('workflow uses npm ci and invalidates cache with package-lock: '+path,()=>{
  const yaml=readFileSync(path,'utf8');
  assert.match(yaml,/run: npm ci --no-audit --no-fund/);
  assert.doesNotMatch(yaml,/npm install --no-audit --no-fund/);
  assert.match(yaml,/hashFiles\('package-lock\.json'\)/);
  assert.match(yaml,/run: npm test/);
  assert.doesNotMatch(yaml,/PASEKA_LOCK_BOOTSTRAP_/,'bootstrap output must not remain in CI');
 });
}

test('both PR quality and Android workflows react to package-lock changes',()=>{
 for(const path of workflows.slice(0,2)){
  const yaml=readFileSync(path,'utf8');
  assert.match(yaml,/^  pull_request:\s*\n    paths:/m);
  assert.match(yaml,/\n      - 'package-lock\.json'/);
 }
});

test('native bridge changes must trigger Android PR build',()=>{
 const yaml=readFileSync('.github/workflows/android-debug.yml','utf8');
 const pr=yaml.split('  pull_request:')[1]?.split('\nconcurrency:')[0];
 assert.ok(pr,'missing pull_request path filter');
 assert.match(pr,/\n      - 'scripts\/prepare-android-archive-download\.mjs'/);
});

test('emulator-only workflow caches dependencies by the committed lockfile without removing tests',()=>{
 const yaml=readFileSync('.github/workflows/android-emulator-smoke.yml','utf8');
 assert.match(yaml,/uses: actions\/setup-node@v4\s*\n\s*with:\s*\n\s*node-version: '20'\s*\n\s*cache: 'npm'\s*\n\s*cache-dependency-path: package-lock\.json/);
 assert.match(yaml,/run: npm ci --no-audit --no-fund/);
 assert.match(yaml,/run: node --test tests\/android-emulator-smoke-contract\.test\.mjs/);
 assert.match(yaml,/script: bash scripts\/run-p0-emulator-ci\.sh/);
 assert.doesNotMatch(yaml,/npm install --no-audit --no-fund/);
});
