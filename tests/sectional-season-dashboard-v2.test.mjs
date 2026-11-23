import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const w={};for(const f of ['sectional-season-ledger-v2.js','sectional-season-dual-read-v2.js','sectional-season-dashboard-v2.js'])new Function('window',readFileSync(new URL('../js/'+f,import.meta.url),'utf8'))(w);
const api=w.PasekaSectionalSeasonDashboardV2,deps={ledger:w.PasekaSectionalSeasonLedgerV2,dualRead:w.PasekaSectionalSeasonDualReadV2};
const state=()=>({hives:[{id:'h<1',profileId:'sectional-multiqueen-v1'},{id:'farrar',profileId:'farrar'}],sectionalTechProcesses:[],sectionalSeasonCycles:[{modelVersion:2,id:'c1',hiveId:'h<1',cycleNumber:1,status:'ACTIVE',events:[{id:'e1',type:'STAGE_CONFIRMED',occurredAt:'2026-11-23T10:00:00Z',evidence:{operationId:'OP-08',before:{},after:{},confirmedBy:'beekeeper',transactionId:'t1',stagedWithPhysicalState:true}}]}]});
test('read-only seasonal dashboard displays only sectional hives, escapes names and keeps history',()=>{
 const s=state(),original=structuredClone(s),host={innerHTML:'',textContent:''};
 const r=api.render(host,s,deps);
 assert.equal(r.ok,true);assert.equal(r.readOnly,true);
 assert.match(host.innerHTML,/h&lt;1/);assert.doesNotMatch(host.innerHTML,/h<1/);
 assert.match(host.innerHTML,/OP-08/);assert.doesNotMatch(host.innerHTML,/farrar/);
 assert.deepEqual(s,original);
});
test('pending migration explicitly appears as blocked',()=>{
 const s=state();s.sectionalSeasonCycles[0].migrationStatus='BASELINE_IMPORTED_PENDING_ACTIVATION';
 assert.equal(api.describe(s,deps).hives[0].activeStatus,'MIGRATION_PENDING');
});
test('corrupt ledger does not show false completed operations',()=>{
 const s=state();s.sectionalSeasonCycles.push(structuredClone(s.sectionalSeasonCycles[0]));
 const host={innerHTML:'old',textContent:''},r=api.render(host,s,deps);
 assert.equal(r.ok,false);assert.match(host.textContent,/целостности/);
});
test('does not mark planned/unconfirmed operation as completed',()=>{
 const s=state();s.sectionalSeasonCycles[0].events=[];s.sectionalEntranceObservations=[{hiveId:'h<1',userConfirmed:false}];
 assert.deepEqual(api.describe(s,deps).hives[0].confirmedOperations,[]);
});
