import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';

const app = {};
for (const name of ['equipment-reconciliation-voice', 'equipment-labels', 'equipment-reconciliation']) {
  const source = await readFile(new URL('../js/' + name + '.js', import.meta.url), 'utf8');
  new Function('window', source)(app);
}
const voice = app.PasekaReconciliationVoice;

test('an explicit letter or digit from the label alphabet survives speech transcription', () => {
  for (const symbol of app.PasekaLabels.ALPHABET) {
    const marker = /[0-9]/.test(symbol) ? 'цифра' : 'буква';
    const result = voice.normalizeSpokenFrameCodes('семь ' + marker + ' ' + symbol + ' эм');
    assert.equal(result.canNormalize, true, symbol);
    assert.deepEqual(result.codes, ['7' + symbol + 'М']);
  }
});

test('a mixed dictation flows from the append command to a matching reconciliation preview', () => {
  const transcript = 'буква К, буква М, цифра 2';
  const command = voice.parseReconciliationVoiceCommand('Добавь рамки ' + transcript);
  const draft = voice.appendRecognizedCodes('семь ка эм', command.codes);
  const result = voice.normalizeSpokenFrameCodes(draft.value);
  assert.equal(result.raw, 'семь ка эм\n' + transcript);
  assert.equal(result.canNormalize, true);
  assert.deepEqual(result.codes, ['7КМ', 'КМ2']);
  const state = {hives:[{id:'h1'}], layouts:{h1:{boxes:{1:{frames:[{labelCode:'7КМ'},{labelCode:'КМ2'}]}}}}};
  const original = structuredClone(state);
  const preview = app.PasekaReconciliation.preview(state, {type:'hive', hiveId:'h1'}, result.codes, app.PasekaLabels);
  assert.deepEqual(preview.issues, []);
  assert.equal(preview.observedCount, 2);
  assert.deepEqual(state, original);
});

test('unusable qualifiers and incomplete codes keep the full transcript unresolved', () => {
  for (const tail of ['буква И ка эм два', 'буква Ё эм два', 'буква K эм два', 'буква 2 эм два',
    'цифра К эм два', 'цифра 3 эм два', 'цифра 22 эм два', 'буква К цифра', 'буква М']) {
    const result = voice.normalizeSpokenFrameCodes('семь ка эм и ' + tail);
    assert.equal(result.canNormalize, false, tail);
    assert.equal(result.codes[0], '7КМ');
    assert.ok(result.issues.length, tail);
  }
});


test('singular spoken frame and label-code commands create only a preview, never a physical change',()=>{
 for(const prefix of ['Добавь рамку ','Запиши код рамки ','Внеси код рамки ']){
  const command=voice.parseReconciliationVoiceCommand(prefix+'буква К буква М цифра 2');
  assert.equal(command.type,'append_codes');
  assert.deepEqual(voice.normalizeSpokenFrameCodes(command.codes).codes,['КМ2']);
 }
 for(const phrase of ['Удали рамку КМ2','Сними рамку КМ2','Добавь корпус КМ2']){
  assert.equal(voice.parseReconciliationVoiceCommand(phrase).type,'ignore');
 }
});
