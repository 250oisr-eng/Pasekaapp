import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../js/equipment-inventory.js',import.meta.url),'utf8');
const browser={};
new Function('window',source)(browser);
const audit=browser.PasekaInventory.auditLegacyLayoutBodyReferences;
assert.equal(typeof audit,'function','production audit is exposed');

// These are disposable virtual records, never user or device records.
const state=(corpusIds,bodies)=>({
 hives:[{id:'hive-legacy',profileId:'farrar-6x6-v1'}],
 layouts:{'hive-legacy':{corpusIds}},
 equipmentInventory:{bodies}
});
function stableAudit(input){
 const before=structuredClone(input);
 const findings=audit(input);
 assert.deepEqual(input,before,'audit must not mutate the source state');
 return findings;
}
test('B08 existing pre-inventory legacy ids remain review warnings, never blocking errors',()=>{
 const s=state({'1':'old-brood','H1':'old-honey'},{});
 const issues=stableAudit(s);
 assert.equal(issues.length,2);
 assert.deepEqual(issues.map(i=>i.code),['legacy_body_not_registered','legacy_body_not_registered']);
 assert.ok(issues.every(i=>i.severity==='warning'));
 assert.equal(s.equipmentInventory.bodies['old-brood'],undefined);
});
test('B08 registered bodies with complete specification are not reported',()=>{
 const spec={kind:'brood',framesPerBox:6,profileId:'farrar-6x6-v1'};
 assert.deepEqual(stableAudit(state({'1':'body1'},{body1:{id:'body1',kind:'brood',spec}})),[]);
});
test('B08 registered body without specification is unknown, not silently assumed compatible',()=>{
 const issues=stableAudit(state({'1':'body1'},{body1:{id:'body1',kind:'brood'}}));
 assert.deepEqual(issues.map(i=>[i.code,i.severity]),[['registered_body_spec_unknown','warning']]);
});
test('B08 empty, whitespace and non-string references are explicit errors',()=>{
 const issues=stableAudit(state({'1':'','2':'   ','3':null,'4':24,'5':' padded '},{}));
 assert.equal(issues.length,5);
 assert.ok(issues.every(i=>i.code==='invalid_layout_body_reference'&&i.severity==='error'));
});
test('B08 malformed registered identity and invalid references container are reported',()=>{
 const bad=stableAudit(state({'1':'body1'}, {body1:{id:'some-other-id'}}));
 assert.equal(bad[0].code,'invalid_registered_body_identity');
 const s=state({'1':'body1'},{});
 s.layouts['hive-legacy'].corpusIds=['body1'];
 assert.equal(stableAudit(s)[0].code,'invalid_layout_corpus_references');
});
test('B08 unknown and optional legacy shape does not synthesize inventory',()=>{
 const s={layouts:{h1:{},h2:{corpusIds:null}},equipmentInventory:{bodies:{}}};
 assert.deepEqual(stableAudit(s),[]);
 const withoutInventory={layouts:{h1:{corpusIds:{'1':'unregistered'}}}};
 const issues=stableAudit(withoutInventory);
 assert.equal(issues[0].code,'legacy_body_not_registered');
 assert.equal(withoutInventory.equipmentInventory,undefined);
});
test('B08 profile-specific sectional layout is not conflated with legacy reference audit',()=>{
 const s={layouts:{},sectionalLayouts:[{id:'section-1',sections:[{broodBodyIds:['body-1']}]}],
 equipmentInventory:{bodies:{}}};
 assert.deepEqual(stableAudit(s),[]);
});
test('B08 all findings retain precise source positions without modifying any family or history',()=>{
 const s=state({'1':'body1','H2':'absent'},{body1:{id:'body1',kind:'brood'}});
 s.families=[{id:'family-1'}];s.records=[{id:'record-1',text:'original'}];
 const issues=stableAudit(s);
 assert.deepEqual(issues[0].details,{hiveId:'hive-legacy',boxKey:'1',bodyId:'body1'});
 assert.deepEqual(issues[1].details,{hiveId:'hive-legacy',boxKey:'H2',bodyId:'absent'});
});
