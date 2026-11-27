import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildDailyWorkerHtml,dailyQaConfig,assertDailyConfig,patchActivity,patchManifest} from '../scripts/prepare-android-daily-archives.mjs';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('native archive worker uses actual bundled validation and never bootstraps the main database',async()=>{
 const html=await buildDailyWorkerHtml(await read('index.html'),read,await read('android-native/daily-archive-worker.js'));
 assert.doesNotMatch(html,/<script\b[^>]*\bsrc\s*=/i);
 assert.doesNotMatch(html,/<link\b/i);
 assert.match(html,/connect-src 'none'/);
 assert.match(html,/bridge\.finish\(outcome\)/);
 assert.match(html,/req\.onupgradeneeded=\(\)=>\{try\{req\.transaction\.abort\(\)/);
 assert.doesNotMatch(html,/const databaseCreatedDuringOpen=await openDB\(\)/);
 assert.match(html,/PasekaDailyArchives\.rotate\(store/);
 assert.match(html,/location\.origin!=='https:\/\/localhost'/);
});
test('native scheduler uses one persisted periodic job, disallows network and file access',async()=>{
 const java=await read('android-native/PasekaDailyArchiveJob.java');
 for(const token of ['getPendingJob(JOB_ID)','setPeriodic(PERIOD_MS, FLEX_MS)','setPersisted(true)','setRequiresStorageNotLow(true)','setBlockNetworkLoads(true)','setAllowFileAccess(false)','setAllowContentAccess(false)','loadDataWithBaseURL("https://localhost/"','jobFinished(parameters, retry)'])assert.ok(java.includes(token),token);
 assert.doesNotMatch(java,/setRequiredNetworkType|setOverrideDeadline|deleteDatabase|clearCache/);
});
test('native patch is idempotent and preserves distinct package/origin',()=>{
 const config={appId:'ru.paseka.journal',webDir:'www',android:{allowMixedContent:false}};
 const qa=dailyQaConfig(config);
 assert.equal(qa.appId,'ru.paseka.journal.qa.daily');assert.equal(config.appId,'ru.paseka.journal');
 assert.equal(assertDailyConfig(qa),qa.appId);
 assert.throws(()=>assertDailyConfig({...config,server:{androidScheme:'http'}}),/origin/);
 assert.throws(()=>assertDailyConfig({...config,server:{url:'https://example.test'}}),/origin/);
 const main='package '+qa.appId+';\npublic class MainActivity extends BridgeActivity {}';
 const patched=patchActivity(main,qa.appId);
 assert.equal(patchActivity(patched,qa.appId),patched);
 assert.match(patched,/PasekaDailyArchiveJob\.schedule\(this\)/);
 const manifest='<manifest><application></application></manifest>',xml=patchManifest(manifest);
 assert.equal(patchManifest(xml),xml);
 assert.match(xml,/android\.permission\.BIND_JOB_SERVICE/);
 assert.match(xml,/android\.permission\.RECEIVE_BOOT_COMPLETED/);
});
