import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8'),sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const modules=['sectional-season-ledger-v2','sectional-season-evidence-v2','sectional-season-operation-rules-v2','sectional-season-dual-read-v2','sectional-season-migration-v2','sectional-season-transaction-v2','sectional-op09-entrances'];
test('seasonal v2 scripts are in offline shell before inline app code',()=>{
 const inline=index.indexOf('function showSectionalTechnologyReference()');
 for(const module of modules){
  const path='./js/'+module+'.js';
  const script=index.indexOf('<script src="'+path+'"></script>');
  assert.ok(script>=0&&script<inline,path);
  assert.ok(sw.includes("'"+path+"'"),path);
 }
});
test('save integrity and historical snapshots preserve v2, archived v1, and OP09',()=>{
 assert.ok(index.includes('...PasekaSectionalSeasonDualReadV2.inspectMixedState(S,{ledger:PasekaSectionalSeasonLedgerV2})'));
 assert.ok(index.includes('...PasekaSectionalOP09Entrances.inspect(S)'));
 assert.ok(index.includes('sectionalSeasonCycles:S.sectionalSeasonCycles||[]'));
 assert.ok(index.includes('sectionalTechProcessesArchive:S.sectionalTechProcessesArchive||[]'));
 assert.ok(index.includes('sectionalSeasonalEntranceObservations:S.sectionalSeasonalEntranceObservations||[]'));
});
test('migration and physical transaction are not automatically invoked by UI or background scripts',()=>{
 assert.ok(!index.includes('PasekaSectionalSeasonMigrationV2.planMigration('));
 assert.ok(!index.includes('PasekaSectionalSeasonTransactionV2.commitVerifiedTransition('));
 assert.ok(!sw.includes('skipWaiting(); // auto migrate'));
});
