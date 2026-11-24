import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';

const root=new URL('../.github/workflows/',import.meta.url);
const read=async name=>readFile(new URL(name,root),'utf8');
const pages=await read('pages-manual-release.yml');
const cloudflare=await read('deploy-cloudflare-worker.yml');

function configuredEvents(source){
  // Trigger keys at indent two below the top-level "on:" key, not nested input keys.
  const lines=source.split(/\r?\n/);
  const i=lines.findIndex(line=>line==='on:');
  if(i<0)throw new Error('Workflow lacks top-level on: trigger');
  const events=[];
  for(const line of lines.slice(i+1)){
    if(line && !/^\s/.test(line) && !/^\s*#/.test(line))break;
    const m=/^ {2}([a-z][a-z_-]*):\s*$/.exec(line);
    if(m)events.push(m[1]);
  }
  return events;
}
const isPublishing=source=>/uses:\s*(?:actions\/deploy-pages@|cloudflare\/wrangler-action@)|\b(?:pages|id-token):\s*write\b|\bwrangler\s+deploy\b/i.test(source);

function assertManualOnly(source){
  assert.deepEqual(configuredEvents(source),['workflow_dispatch'],
    'production workflows must have only an explicit manual trigger');
  assert.match(source,/if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/,
    'the deploy job must refuse non-main / non-manual invocations');
}
function assertCloudflareGate(source){
  assertManualOnly(source);
  assert.match(source,/release_sha:\s*\n\s+description:.*\n\s+required: true\s*\n\s+type: string/);
  assert.match(source,/confirmation:\s*\n\s+description:.*\n\s+required: true\s*\n\s+type: string/);
  assert.match(source,/RELEASE_SHA: \$\{\{ inputs\.release_sha \}\}/);
  assert.match(source,/CONFIRMATION: \$\{\{ inputs\.confirmation \}\}/);
  assert.match(source,/test "\$CONFIRMATION" = 'PUBLISH-CLOUDFLARE'/);
  assert.match(source,/\[\[ "\$RELEASE_SHA" =~ \^\[a-f0-9\]\{40\}\$ \]\]/);
  assert.match(source,/git merge-base --is-ancestor "\$RELEASE_SHA" origin\/main/);
  assert.match(source,/ref: \$\{\{ inputs\.release_sha \}\}/);
  const getStep=name=>source.indexOf('- name: '+name);
  const gate=getStep('Require an approved exact main commit and explicit confirmation');
  const checkout=getStep('Checkout exactly the approved release commit');
  const secrets=getStep('Check deployment secrets');
  const deploy=getStep('Deploy Worker');
  assert.ok(gate>0 && checkout>gate && secrets>checkout && deploy>secrets,
    'must validate approval + ancestry before checkout, secrets and deployment');
}
test('B15 Cloudflare production workflow requires approved main SHA and explicit manual confirmation',()=>{
  assertCloudflareGate(cloudflare);
  assert.match(cloudflare,/^permissions:\s*\n  contents: read$/m);
  assert.doesNotMatch(cloudflare,/pages: write|id-token: write/);
  assert.match(cloudflare,/uses: cloudflare\/wrangler-action@v3/);
  assert.match(cloudflare,/command: deploy --config cloudflare\/wrangler\.jsonc/);
  assert.match(cloudflare,/Verify Worker CORS endpoint/);
});

test('B15 Pages and Cloudflare are the only production-capable workflows, both manual-only',async()=>{
  const names=(await readdir(root)).filter(name=>/\.ya?ml$/.test(name));
  assert.ok(names.length>=5);
  const production=[];
  for(const name of names){
    const source=await read(name);
    if(!isPublishing(source))continue;
    production.push(name);
    assertManualOnly(source);
  }
  assert.deepEqual(production.sort(),['deploy-cloudflare-worker.yml','pages-manual-release.yml']);
  assertCloudflareGate(cloudflare);
  assert.match(pages,/test "\$CONFIRMATION" = 'PUBLISH-PASEKA'/);
  assert.match(pages,/git merge-base --is-ancestor "\$RELEASE_SHA" origin\/main/);
});

test('B15 regression: implicit push / PR / scheduled production triggers fail closed',()=>{
  for(const trigger of ['push','pull_request','pull_request_target','schedule','workflow_run','release','repository_dispatch']){
    assert.throws(()=>assertManualOnly(cloudflare.replace('  workflow_dispatch:\n','  '+trigger+':\n  workflow_dispatch:\n')), /manual trigger/);
  }
});

test('B15 regression: missing SHA ancestry, confirmation, main-only gate or reordered secrets are rejected',()=>{
  assert.throws(()=>assertCloudflareGate(cloudflare.replace('git merge-base --is-ancestor','git merge-base --is-unrelated')),/merge-base/);
  assert.throws(()=>assertCloudflareGate(cloudflare.replace('PUBLISH-CLOUDFLARE','SKIP-CONFIRMATION')),/PUBLISH-CLOUDFLARE/);
  assert.throws(()=>assertCloudflareGate(cloudflare.replace("github.ref == 'refs/heads/main'","github.ref == 'refs/heads/dev'")),/main/);
  const approval='      - name: Require an approved exact main commit and explicit confirmation';
  const secrets='      - name: Check deployment secrets';
  assert.throws(()=>assertCloudflareGate(cloudflare.replace(approval,'      - name: PRE-GATE\n'+secrets+'\n'+approval).replace(secrets+'\n        env:', '      - name: ORIGINAL CHECK\n        env:')),/before checkout, secrets and deployment/);
});

test('B15 regression: adding a deployment to regular CI requires explicit review',async()=>{
  const quality=await read('quality.yml');
  assert.equal(isPublishing(quality),false);
  assert.equal(isPublishing(quality+'\n      - uses: actions/deploy-pages@v4\n'),true);
  assert.equal(isPublishing(quality+'\n      - uses: cloudflare/wrangler-action@v3\n'),true);
});
