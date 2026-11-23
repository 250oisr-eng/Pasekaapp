import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow=await readFile(new URL('../.github/workflows/android-journal-physical.yml',import.meta.url),'utf8');
const prepare=await readFile(new URL('../scripts/prepare-journal-phone-proof.mjs',import.meta.url),'utf8');
const runner=await readFile(new URL('../diagnostics/journal-phone-proof/runner.js',import.meta.url),'utf8');
const regular=await readFile(new URL('../capacitor.config.json',import.meta.url),'utf8');
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');

test('journal proof APK uses distinct Android ID, never overwrites real installed Paseka',()=>{
 assert.equal(JSON.parse(regular).appId,'ru.paseka.journal');
 assert.match(prepare,/config\.appId=diagnosticId/);
 assert.match(prepare,/ru\.paseka\.journal\.journalproof/);
 assert.match(workflow,/config\.appId!=='ru\.paseka\.journal\.journalproof'/);
 assert.match(runner,/ru\.paseka\.journal\.journalproof/);
 assert.doesNotMatch(html,/journal-phone-proof\.js|PASEKA_JOURNAL_PHYSICAL_V1/);
});
test('diagnostic runner is excluded from normal web assets and requires empty disposable state',()=>{
 assert.match(runner,/S\.hives\.length===0/);
 assert.match(runner,/S\.records\.length===0/);
 assert.match(runner,/scope:'ISOLATED_SYNTHETIC_JOURNAL_ONLY'/);
 assert.match(runner,/productionDataMutation:false/);
 assert.match(runner,/originalVideo:'NOT_ACCESSED'/);
 assert.match(runner,/autoDeleteAuthorized:false/);
 assert.doesNotMatch(prepare,/await writeFile\('index\.html'/);
});
test('isolated workflow assembles debug APK and uploads artifact but never publishes public site',()=>{
 assert.match(workflow,/^on:\n  workflow_dispatch:/m);
 assert.match(workflow,/paseka-journal-proof-isolated-apk/);
 assert.match(workflow,/node scripts\/prepare-journal-phone-proof\.mjs/);
 assert.match(workflow,/\.\/gradlew assembleDebug/);
 assert.doesNotMatch(workflow,/deploy-pages|deploy-cloudflare|gh-pages|release:\s*published|pages:\s*write/);
});
test('phone proof requires real IndexedDB readback and WebView reload to pass',()=>{
 assert.match(runner,/const first=await readMain\(\)/);
 assert.match(runner,/const measured=await readMain\(\)/);
 assert.match(runner,/const persisted=await readMain\(\)/);
 assert.match(runner,/location\.reload\(\)/);
 assert.match(runner,/coldWebViewReloadIndexedDB/);
 assert.match(runner,/fullAirplaneMode:'NOT_TESTED'/);
 assert.match(runner,/realBackupRestore:'NOT_TESTED'/);
});
