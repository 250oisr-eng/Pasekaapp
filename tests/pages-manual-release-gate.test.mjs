import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
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
  assert.match(workflow,/run: node scripts\/verify-pages-release-assets\.mjs/);
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
  assert.doesNotMatch(qualityWorkflow,/PATCH|PUT|POST|DELETE|curl.*--request|fetch\([^)]*method:/i);
  assert.match(qualityWorkflow,/^  push:/m);
  assert.match(qualityWorkflow,/^      - '\.github\/workflows\/quality\.yml'$/m);
  assert.match(workflow,/^on:\n  workflow_dispatch:/m);
});
