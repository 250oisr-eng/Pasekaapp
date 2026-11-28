import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const dialog=html.match(/<dialog id="recordDlg"[^>]*>[\s\S]*?<\/dialog>/)?.[0]||'';
test('record dialog has explicit labels without changing existing fields or form semantics',()=>{
 assert.match(dialog,/aria-labelledby="recordTitle"/);
 const ids=['rdate','rtype','rhive','rfamily','roccupancy','rbrood','rdrawn','rqueen','reggs','rbroodPattern','rqueenCells','rswarmSigns','rtreatmentProduct','rtreatmentActive','rtreatmentMethod','rtreatmentDose','rtreatmentCheck','rtreatmentWaiting','rtreatmentBatch','rfeedingType','rfeedingSubstance','rfeedingAmount','rfeedingConcentration','rfeedingMethod','rtext','rmedia'];
 for(const id of ids){assert.equal((dialog.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);assert.match(dialog,new RegExp('<label for="'+id+'"'));}
 assert.match(dialog,/<button class="primary" type="submit">Сохранить запись<\/button>/);
 assert.match(dialog,/<button type="button" onclick="requestCloseRecordDialog\(\)">Отмена<\/button>/);
 assert.match(dialog,/id="queenFields" style="display:none"/);
 assert.match(dialog,/id="treatmentFields" style="display:none"/);
 assert.match(dialog,/id="feedingFields" style="display:none"/);
});
test('hive quick actions validate identity, then use the existing unsaved form and no save path',()=>{
 const source=html.slice(html.indexOf('function openSelectedHiveRecord(type){'),html.indexOf('function renderHome(){'));
 assert.ok(source.includes('function openSelectedHiveRecord'));
 assert.doesNotMatch(source,/\bsave\(|S\.records|indexedDB|\.push\(/);
 function run(hives,selected,type,open=true){
  const events=[],fields={recordDlg:{open},rtype:{value:''}};
  const fn=new Function('S','selectedHiveId','$','newRecord','toggleOccupancy','fillFamilies','alert','let activeJournalHive="previous";'+source+';openSelectedHiveRecord('+JSON.stringify(type)+');return activeJournalHive;');
  const current=fn({hives},selected,id=>fields[id],()=>events.push('draft'),()=>events.push('toggle'),()=>events.push('family'),()=>events.push('alert'));
  return {current,events,value:fields.rtype.value};
 }
 assert.deepEqual(run([{id:'h'}],'h','Осмотр'),{current:'h',events:['draft','toggle','family'],value:'Осмотр'});
 assert.deepEqual(run([{id:'h'}],'h','Заметка'),{current:'h',events:['draft','toggle','family'],value:'Заметка'});
 assert.deepEqual(run([{id:'h'},{id:'h'}],'h','Осмотр'),{current:'previous',events:['alert'],value:''});
 assert.deepEqual(run([],'h','Осмотр'),{current:'previous',events:['alert'],value:''});
 assert.deepEqual(run([{id:'h'}],'h','Обработка'),{current:'previous',events:[],value:''});
 assert.deepEqual(run([{id:'h'}],'h','Осмотр',false),{current:'h',events:['draft'],value:''});
});
