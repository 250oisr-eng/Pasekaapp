import test from 'node:test';
import assert from 'node:assert/strict';
import { auditPasekaJsonTransfer, auditFile } from '../scripts/audit-oneplus-json-transfer.mjs';
import {mkdtempSync,writeFileSync,readFileSync,symlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

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
 assert.equal(auditPasekaJsonTransfer({...exportJson,state:{...exportJson.state,meta:{schemaVersion:16}}}).status,'BLOCKED');
 assert.equal(auditPasekaJsonTransfer({...exportJson,state:{...exportJson.state,meta:{}}}).status,'BLOCKED');
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

test('legacy JSON file preflight is read-only and does not invent entrance video recovery',()=>{
 const dir=mkdtempSync(join(tmpdir(),'paseka-json-preflight-'));
 try{
  const file=join(dir,'legacy.json'),raw=JSON.stringify(exportJson);
  writeFileSync(file,raw);
  const result=auditFile(file,{hives:1,families:1,records:2});
  assert.equal(result.status,'JSON_STATE_PREFLIGHT_ONLY');
  assert.match(result.warnings.join(' '),/entrance_media/);
  assert.equal(readFileSync(file,'utf8'),raw);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('legacy JSON preflight rejects symlink, malformed data and never mutates original',()=>{
 const dir=mkdtempSync(join(tmpdir(),'paseka-json-fail-closed-'));
 try{
  const file=join(dir,'original.json'),link=join(dir,'linked.json');
  writeFileSync(file,JSON.stringify(exportJson));
  symlinkSync(file,link);
  assert.throws(()=>auditFile(link),/BLOCKED/);
  const malformed=join(dir,'invalid.json'),raw=Buffer.from([0xff,0xfe,0x7b]);
  writeFileSync(malformed,raw);
  assert.throws(()=>auditFile(malformed),/BLOCKED/);
  assert.deepEqual(readFileSync(malformed),raw);
  assert.throws(()=>auditFile(join(dir,'missing.json'))); 
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('existing family linked to another existing hive requires review without exposing names or content',()=>{
 const foreignHive={id:'h-other',number:2};
 const state={...exportJson.state,
  hives:[hive,foreignHive],
  families:[family],
  records:[{...note('cross'),hive:'h-other'}]
 };
 const raw={...exportJson,state};
 const report=auditPasekaJsonTransfer(raw,{hives:2,families:1,records:1});
 assert.equal(report.status,'REVIEW_REQUIRED');
 assert.ok(report.warnings.some(w=>/family and hive association differ/.test(w)));
 assert.equal(JSON.stringify(report).includes('PRIVATE TEXT MUST NOT APPEAR'),false);
 assert.equal(JSON.stringify(report).includes('h-other'),false);
 assert.equal(state.records[0].hive,'h-other','audit may not normalize or mutate historical records');
});
test('same-family same-hive and unavailable historical family remain backwards compatible',()=>{
 const same=auditPasekaJsonTransfer(exportJson);
 assert.equal(same.status,'JSON_STATE_PREFLIGHT_ONLY');
 assert.ok(!same.warnings.some(w=>/family and hive association differ/.test(w)));
 const missing=auditPasekaJsonTransfer({...exportJson,state:{...exportJson.state,
  records:[{...note('archived'),family:'former-family',familySnapshotAtTime:{name:'Archived'}}]
 }});
 assert.equal(missing.status,'REVIEW_REQUIRED');
 assert.ok(missing.warnings.some(w=>/unavailable\/archived family/.test(w)));
 assert.ok(!missing.warnings.some(w=>/family and hive association differ/.test(w)));
});
