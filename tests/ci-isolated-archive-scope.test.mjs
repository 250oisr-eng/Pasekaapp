import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync('.github/workflows/android-archive-test.yml','utf8');
const trigger=workflow.split('\nconcurrency:')[0];

test('isolated archive APK runs only on explicit dispatch or the original dedicated branch',()=>{
 assert.match(trigger,/^on:\s*\n  workflow_dispatch:/m);
 assert.match(trigger,/^  push:\s*\n    branches:\s*\n      - test\/full-archive-android-isolated-2026-11-18/m);
 assert.doesNotMatch(trigger,/^\s+pull_request(?:_target)?:/m);
 assert.doesNotMatch(workflow,/github\.event\.pull_request\.head\.ref/);
});
test('the isolated archive APK has not lost safety validation or a full test run',()=>{
 assert.match(workflow,/^\s+permissions:\s*\n\s+contents: read/m);
 assert.match(workflow,/run: npm test/);
 assert.match(workflow,/npx cap add android/);
 assert.match(workflow,/gradlew assembleDebug/);
 assert.match(workflow,/appId!=='ru\.paseka\.journal\.archive\.test'/);
 assert.match(workflow,/package: name='ru\.paseka\.journal\.archive\.test'/);
 assert.match(workflow,/minSdkVersion: 35/);
 assert.match(workflow,/actions\/upload-artifact@v4/);
});
test('fast PR quality CI and normal Android CI remain enabled for all code changes',()=>{
 for(const path of ['.github/workflows/quality.yml','.github/workflows/android-debug.yml']){
  const ci=readFileSync(path,'utf8');
  assert.match(ci,/^  pull_request:\s*\n    paths:/m);
  assert.match(ci,/^\s+run: npm test$/m);
 }
});
