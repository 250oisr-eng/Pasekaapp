import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { verifyPagesReleaseAssets } from '../scripts/verify-pages-release-assets.mjs';

const workflow = await readFile(new URL('../.github/workflows/pages-manual-release.yml', import.meta.url), 'utf8');
const qualityWorkflow = await readFile(new URL('../.github/workflows/quality.yml', import.meta.url), 'utf8');

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'paseka-pages-release-test-'));
  t.after(() => rm(dir, {recursive:true, force:true}));
  for (const name of ['index.html', 'manifest.webmanifest', 'sw.js', 'icons/paseka.svg', 'js/a.js', 'js/deep/b.js']) {
    for (const prefix of ['', 'www/']) {
      const dest=join(dir,prefix+name);
      await mkdir(dirname(dest),{recursive:true});
      await writeFile(dest,name+'\n');
    }
  }
  return dir;
}

test('Pages publishing can only be triggered by an explicit workflow_dispatch',()=>{
  assert.match(workflow,/^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow,/^  (push|pull_request|pull_request_target|schedule|repository_dispatch):/m);
  assert.match(workflow,/github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/confirmation:\n\s+description:/);
  assert.match(workflow,/test "\$CONFIRMATION" = 'PUBLISH-PASEKA'/);
});

test('manual publication accepts exact approved main commit only',()=>{
  assert.match(workflow,/RELEASE_SHA: \$\{\{ inputs\.release_sha \}\}/);
  assert.match(workflow,/\^\[a-f0-9\]\{40\}\$/);
  assert.match(workflow,/git merge-base --is-ancestor "\$RELEASE_SHA" origin\/main/);
  assert.match(workflow,/ref: \$\{\{ inputs\.release_sha \}\}/);
  assert.match(workflow,/settings\.build_type !== 'workflow'/);
  assert.match(workflow,/needs: build/);
  assert.match(workflow,/pages: write/);
  assert.match(workflow,/id-token: write/);
});

test('Pages artifact contains only the exact checked-out browser bundle', async t=>{
  const dir=await fixture(t);
  assert.deepEqual(await verifyPagesReleaseAssets(dir),{files:6,javascriptModules:2});
});

test('modified source or artifact content rejects release', async t=>{
  const dir=await fixture(t);
  await writeFile(join(dir,'www','index.html'),'stale or unexpected page');
  await assert.rejects(verifyPagesReleaseAssets(dir),/does not match checked-out source/);
});

test('missing runtime JavaScript module rejects release',async t=>{
  const dir=await fixture(t);
  await rm(join(dir,'www','js','deep','b.js'));
  await assert.rejects(verifyPagesReleaseAssets(dir),/missing=js\/deep\/b\.js/);
});

test('unexpected private file in release artifact is rejected',async t=>{
  const dir=await fixture(t);
  await writeFile(join(dir,'www','.env'),'DO_NOT_PUBLISH=1');
  await assert.rejects(verifyPagesReleaseAssets(dir),/extra=\.env/);
});

test('symlink cannot escape the approved static artifact',async t=>{
  const dir=await fixture(t);
  const link=join(dir,'www','js','indirect.js');
  await symlink(join(dir,'index.html'),link);
  await assert.rejects(verifyPagesReleaseAssets(dir),/Symlink is not allowed/);
});

test('workflow builds exact static site from approved SHA and never uploads repository root',()=>{
  assert.match(workflow,/run: npm test/);
  assert.match(workflow,/run: npm run web:prepare/);
  assert.match(workflow,/run: node "\$RUNNER_TEMP\/paseka-verify-pages-assets\.mjs"/);
  assert.match(workflow,/actions\/upload-pages-artifact@v4/);
  assert.match(workflow,/path: \.\/www/);
  assert.doesNotMatch(workflow,/path: '\.'|path: "\."/);
});

test('continuous CI independently audits actual Pages publishing source read-only',()=>{
  assert.match(qualityWorkflow,/pages_source_read_only:/);
  assert.match(qualityWorkflow,/name: Verify Pages source is GitHub Actions \(read-only\)/);
  assert.match(qualityWorkflow,/pages: read/);
  assert.doesNotMatch(qualityWorkflow,/pages: write/);
  assert.match(qualityWorkflow,/configuration\.build_type !== 'workflow'/);
  assert.match(qualityWorkflow,/\/pages', \{/);
  assert.match(qualityWorkflow,/deployment NOT_ATTEMPTED/);
  assert.doesNotMatch(qualityWorkflow,/actions\/deploy-pages|actions\/upload-pages-artifact/);
});

test('source audit never changes GitHub Pages settings or releases on CI push',()=>{
  assert.match(qualityWorkflow,/await fetch\('https:\/\/api\.github\.com\/repos\/' \+ repository \+ '\/pages', \{\s*headers:/);
  assert.doesNotMatch(qualityWorkflow,/\bmethod\s*:\s*['\"]?(?:PATCH|PUT|POST|DELETE)\b/i);
  assert.doesNotMatch(qualityWorkflow,/actions\/deploy-pages|actions\/upload-pages-artifact/);
  assert.match(qualityWorkflow,/^  push:/m);
  assert.match(qualityWorkflow,/^      - '\.github\/workflows\/\*\*'$/m);
  assert.match(workflow,/^on:\n  workflow_dispatch:/m);
});

test('rollback checkout preserves current verified tooling before selecting an older approved commit',()=>{
 const preserve=workflow.indexOf('cp scripts/verify-pages-release-assets.mjs "$RUNNER_TEMP/paseka-verify-pages-assets.mjs"');
 const checkout=workflow.indexOf('ref: ${{ inputs.release_sha }}');
 const run=workflow.indexOf('run: node "$RUNNER_TEMP/paseka-verify-pages-assets.mjs"');
 assert.ok(preserve>0, 'Verifier must be copied from current main before any historical checkout');
 assert.ok(checkout>preserve, 'Historical SHA checkout may otherwise replace the verifier');
 assert.ok(run>checkout, 'Verifier from main must execute on the historical built artifact');
 assert.match(workflow,/test -s "\$RUNNER_TEMP\/paseka-verify-pages-assets\.mjs"/);
});

test('every Pages deployment workflow in repository is manual-only, not auto-triggered by a push',async()=>{
 const directory=new URL('../.github/workflows/',import.meta.url);
 const names=(await readdir(directory)).filter(name=>/\.ya?ml$/.test(name));
 const publishing=[];
 for(const name of names){
  const contents=await readFile(new URL(name,directory),'utf8');
  if(!/uses:\s*actions\/deploy-pages@/.test(contents))continue;
  publishing.push(name);
  assert.match(contents,/^on:\s*\n\s{2}workflow_dispatch:/m, 'Pages deployment must require workflow_dispatch: '+name);
  assert.doesNotMatch(contents,/^\s{2}(push|pull_request|pull_request_target|schedule|repository_dispatch|workflow_run|workflow_call|release):/m, 'Pages deployment must not allow implicit event: '+name);
  assert.match(contents,/^\s{4}if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'$/m, 'Pages build must check default branch: '+name);
 }
 assert.deepEqual(publishing,['pages-manual-release.yml']);
});
