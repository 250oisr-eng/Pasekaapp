import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const sw=await readFile(new URL('../sw.js',import.meta.url),'utf8');
test('joint journal/queens/inventory/frame code preserves independently merged sectional honey gates',()=>{
 for(const token of ['function queenRegistryFamily(','function journalPeriodSummary(','function exportFilteredInventoryCsv(','function allowedFrameStatuses(','SECTIONAL_HONEY_QA_WRITE_ENABLED','sectionalExtractionHasEvidence','sectional_legacy_layout_forbidden']){
  assert.ok(html.includes(token),token+' is required in integrated app');
 }
 assert.match(html,/sectional-honey-review-ui\.js/);
 assert.equal((html.match(/function syncFrameType\(/g)||[]).length,1);
 assert.equal((html.match(/function syncFrameStatus\(/g)||[]).length,1);
 assert.doesNotMatch(html,/script src="\.\/js\/sectional-op02-feeding\.js"/);
 assert.doesNotMatch(sw,/sectional-op02-feeding\.js/);
});
