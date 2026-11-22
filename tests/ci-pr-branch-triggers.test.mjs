import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const files=['.github/workflows/quality.yml','.github/workflows/android-debug.yml'];
for(const file of files){
 const yml=readFileSync(file,'utf8');
 test(file+' validates Draft PRs and main pushes without double branch push jobs',()=>{
  assert.match(yml,/^on:\s*\n\s+workflow_dispatch:/m);
  assert.match(yml,/^  push:\s*\n    branches:\s*\n      - main/m);
  assert.match(yml,/^  pull_request:\s*\n    paths:/m);
  assert.match(yml,/group: [\w-]+\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}/);
  assert.match(yml,/cancel-in-progress: true/);
  assert.match(yml,/contents: read/);
  assert.match(yml,/npm test/);
  assert.doesNotMatch(yml,/pull_request_target:/);
 });
 test(file+' retains essential app runtime trigger paths',()=>{
  for(const path of ["'index.html'","'js/**'","'tests/**'","'package.json'"])assert.ok(yml.includes(path),path);
 });
}
test('Android still builds and uploads APK, no artificial PASS by skipping Gradle',()=>{
 const yml=readFileSync('.github/workflows/android-debug.yml','utf8');
 assert.match(yml,/gradlew assembleDebug/);
 assert.match(yml,/uses: actions\/upload-artifact@v4/);
 assert.match(yml,/minSdkVersion: 35/);
 assert.match(yml,/retention-days: 14/);
});
test('fast quality checks must run on any PR touching their own workflow',()=>{
 const yml=readFileSync('.github/workflows/quality.yml','utf8');
 assert.match(yml,/      - '\.github\/workflows\/quality\.yml'/);
 assert.match(yml,/Run complete regression suite/);
});
