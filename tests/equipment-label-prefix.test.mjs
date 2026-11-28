import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const app = {};
for (const module of ['equipment-labels', 'equipment-reconciliation']) {
  const source = await readFile(new URL('../js/' + module + '.js', import.meta.url), 'utf8');
  new Function('window', source)(app);
}
const labels = app.PasekaLabels;

test('both namespaces display and read their own leading letter', () => {
  for (const [type, prefix] of [['frame', 'Р'], ['body', 'К']]) {
    const code = prefix + 'АА';
    for (const input of [code, prefix + '-' + code, prefix + code, prefix + ' ' + code.toLowerCase()]) {
      assert.equal(labels.normalizeCode(input, type), code);
      assert.equal(labels.formatLabelCode(type, input), prefix + '-' + code);
    }
    for (const invalid of [prefix + '-АА', prefix + ' АА', prefix + '-' + code + '9']) {
      assert.equal(labels.normalizeCode(invalid, type), null);
    }
  }
});

test('reconciliation matches the printed frame label to its saved code', () => {
  const state = {hives: [{id:'h1'}], layouts: {h1: {boxes: {1: {frames: [{labelCode:'РАА'}]}}}}};
  const original = structuredClone(state);
  const result = app.PasekaReconciliation.preview(state, {type:'hive', hiveId:'h1'}, 'Р-РАА', labels);
  assert.deepEqual(result.observedCodes, ['РАА']);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(state, original);
});

test('existing and permanently reserved codes stay unavailable for reassignment', () => {
  const state = {meta: {usedFrameLabelCodes:['РАА'], usedBodyLabelCodes:['КАА']},
    equipmentLabels: {bodies: {old:'КАА'}}};
  assert.equal(labels.assignBodyCode(state, 'old'), 'КАА');
  assert.throws(() => labels.assignFrameCode(state, {}, 'Р-РАА'), /занят/);
  assert.throws(() => labels.assignBodyCode(state, 'new', 'К-КАА'), /занят/);
  for (const [type, prefix] of [['frame', 'Р'], ['body', 'К']]) {
    state.meta.nextLabelCodeIndex = {[type]: labels.ALPHABET.indexOf(prefix) * labels.ALPHABET.length ** 2};
    assert.equal(labels.nextLegacyCode(state, type), prefix + 'АБ');
  }
});


test('typographic dashes in printed frame and body labels are only visual separators',()=>{
 for(const [type,prefix] of [['frame','Р'],['body','К']]){
  const canonical=prefix+'АА';
  for(const dash of ['‐','‑','‒','–','—','―','−']){
   assert.equal(labels.normalizeCode(prefix+dash+canonical,type),canonical,dash);
   assert.equal(labels.formatLabelCode(type,prefix+dash+canonical),prefix+'-'+canonical,dash);
  }
  assert.equal(labels.normalizeCode(prefix+'—АА',type),null,'missing canonical code character must remain invalid');
 }
});
