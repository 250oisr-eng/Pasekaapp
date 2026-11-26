import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const parser = await readFile(new URL('../js/voice-command-parser.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const { extract, parse } = new Function(parser + ';return {extract:extractJournalOperationFields, parse:parseApiaryVoiceCommand}')();
const fields = 'поле вид корма Сироп поле состав вода и сахар поле объём 0,5 л поле соотношение 2:1 поле способ подачи потолочная кормушка';
const command = 'Пасека слушай заполни поля подкормки ' + fields;

test('spoken labels preserve the original five values without requiring punctuation', () => {
 const draft = parse(command);
 assert.deepEqual(draft, {type:'feeding_fields', text:fields});
 assert.deepEqual(extract(draft.text,'feeding').fields, {
  type:'Сироп', substance:'вода и сахар', amount:'0,5 л', concentration:'2:1', method:'потолочная кормушка'
 });
 assert.equal(extract('ПОЛЕ ОБЪЕМ 100 г, поле способ: Кормушка','feeding').fields.method,'Кормушка');
});

test('ambiguous, missing and unlabelled speech cannot supply a quantity', () => {
 for(const text of ['поле количество 100 г поле объём 200 г','поле количество поле корм сироп']){
  const result=extract(text,'feeding');
  assert.equal(result.fields.amount,undefined);
  assert.ok(result.ambiguous.includes('amount'));
 }
 assert.deepEqual(extract('поле количество 100 г поле количество 100 г','feeding').fields,{amount:'100 г'});
 assert.deepEqual(extract('поле количественный показатель 5 поле корм сироп','feeding').fields,{type:'сироп'});
 assert.deepEqual(extract('вчера дал сироп 100 г','feeding').fields,{});
 assert.deepEqual(extract('поле доза 100 мг','treatment').fields,{});
 assert.deepEqual(extract('корм: сироп, количество: 0,5 л','feeding').fields,{type:'сироп',amount:'0,5 л'});
});

test('voice session fills the open feeding draft and leaves existing fields for manual review', async () => {
 const nodes = {
  recordDlg:{open:true}, rtype:{value:'Подкормка'}, rtext:{value:''},
  rfeedingType:{value:'Мой корм'}, rfeedingSubstance:{value:''}, rfeedingAmount:{value:''},
  rfeedingConcentration:{value:''}, rfeedingMethod:{value:''}
 };
 const context = vm.createContext({
  $:id=>nodes[id], apiaryVoiceSession:{isArmed:()=>false,clearArmed(){}},
  apiaryVoiceStatus(){}, speakApiaryVoice(){}
 });
 for(const name of ['applyVoiceOperationFieldsToOpenRecord','handleApiaryVoiceTranscript']){
  const start=html.search(new RegExp('^(?:async )?function '+name+'\\(', 'm'));
  assert.notEqual(start,-1);
  const end=html.indexOf('\n}',start);
  vm.runInContext(html.slice(start,end+2),context);
 }
 vm.runInContext(parser,context);
 await context.handleApiaryVoiceTranscript(command);
 assert.equal(nodes.rfeedingType.value,'Мой корм');
 assert.equal(nodes.rfeedingAmount.value,'0,5 л');
 assert.equal(nodes.rtext.value,fields);
 assert.equal(nodes.recordDlg.open,true);
 nodes.rtype.value='Осмотр';
 nodes.rfeedingAmount.value='';
 await context.handleApiaryVoiceTranscript(command);
 assert.equal(nodes.rfeedingAmount.value,'');
});
