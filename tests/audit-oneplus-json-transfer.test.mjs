import test from 'node:test';
import assert from 'node:assert/strict';
import { auditPasekaJsonTransfer } from '../scripts/audit-oneplus-json-transfer.mjs';

const hive = {id:'h-first',number:1};
const family = {id:'f-first',hive:'h-first',name:'ТЕСТ-01'};
const note = id=>({id,hive:'h-first',family:'f-first',type:'Заметка',text:'PRIVATE TEXT MUST NOT APPEAR',media:[]});
const exportJson = {app:'Paseka',state:{meta:{schemaVersion:15},hives:[hive],families:[family],records:[note('r-first'),note('r-offline')]}};

test('first-use test hive, family and two notes pass local JSON state preflight',()=>{
 const result=auditPasekaJsonTransfer(exportJson,{hives:1,families:1,records:2});
 assert.equal(result.status,'JSON_STATE_PREFLIGHT_ONLY');
 assert.deepEqual(result.counts,{hives:1,families:1,records:2});
 assert.match(result.warnings.join(' '),/entrance_media/);
 assert.equal(JSON.stringify(result).includes('PRIVATE TEXT'),false);
});

test('missing, duplicated or corrupt content fails closed',()=>{
 assert.equal(auditPasekaJsonTransfer(null).status,'BLOCKED');
 assert.equal(auditPasekaJsonTransfer({app:'Other',state:exportJson.state}).status,'BLOCKED');
 assert.equal(auditPasekaJsonTransfer({...exportJson,state:{...exportJson.state,records:'not array'}}).status,'BLOCKED');
 assert.equal(auditPasekaJsonTransfer({...exportJson,state:{...exportJson.state,records:[note('x'),note('x')]}}).status,'BLOCKED');
 assert.equal(auditPasekaJsonTransfer(exportJson,{records:3}).status,'BLOCKED');
 assert.equal(auditPasekaJsonTransfer({...exportJson,state:{...exportJson.state,records:[{...note('a'),media:'bad'}]}}).status,'BLOCKED');
});

test('historical missing family is flagged for review, not silently treated as intact',()=>{
 const result=auditPasekaJsonTransfer({...exportJson,state:{...exportJson.state,records:[{...note('old'),family:'archived-or-unavailable'}]}});
 assert.equal(result.status,'REVIEW_REQUIRED');
 assert.ok(result.warnings.some(w=>/unavailable\/archived family/.test(w)));
});

test('JSON preflight never claims to restore original entrance videos or install APK',()=>{
 const result=auditPasekaJsonTransfer(exportJson);
 assert.equal(result.status,'JSON_STATE_PREFLIGHT_ONLY');
 assert.match(result.warnings[0],/Full media disaster recovery is NOT proven/);
});
