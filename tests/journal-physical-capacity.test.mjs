import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
function sourceBetween(start,next){
 const a=html.indexOf('function '+start+'('),b=html.indexOf('\nfunction '+next+'(',a);
 assert.ok(a>=0&&b>a,'production function '+start+' must be available');
 return html.slice(a,b).trim();
}
function load(start,next,deps={}){
 const fn=new Function('deps','with(deps){ return ('+sourceBetween(start,next)+'); }');
 return fn(deps);
}
const getHiveProfile=h=>h?.profile||null;
const capacity=load('journalBroodCapacity','validateJournalRecordDraft',{getHiveProfile});
const validate=load('validateJournalRecordDraft','isFreshDatabaseUpgrade',{journalBroodCapacity:capacity});
const parse=load('extractInspectionFieldsFromText','prepareJournalDraftFromAI');
function apiary({mode='summer',summer=['1','2'],winter=[],perBox=6}={}){
 const profile={id:'farrar-6x6-v1',family:'farrar',status:'ready',brood:{framesPerBox:perBox,boxKeys:['1','2','3','4','5','6']}};
 return {hives:[{id:'hive-1',profile}],families:[],records:[],layouts:{'hive-1':{mode,installedBoxes:summer,winterOrder:winter}}};
}
function inspection({occupancy=10,broodFrames=6,freeDrawn=2,hive='hive-1',id='r1'}={}){
 return {id,date:'2026-05-01',type:'Осмотр',hive,family:'',occupancy,broodFrames,freeDrawn};
}
test('live capacity counts unique installed brood keys, not all profile positions or duplicate slots',()=>{
 const s=apiary({summer:['1','2','2','H1','unknown']});
 assert.equal(capacity('hive-1',s),12);
 assert.deepEqual(s.layouts['hive-1'].installedBoxes,['1','2','2','H1','unknown']);
 assert.equal(capacity('missing',s),null);
});
test('winter order is authoritative and missing assembly does not inherit summer capacity',()=>{
 const s=apiary({mode:'winter',summer:['1','2','3'],winter:['1']});
 assert.equal(capacity('hive-1',s),6);
 s.layouts['hive-1'].winterOrder=[];
 assert.equal(capacity('hive-1',s),null);
 s.layouts['hive-1'].mode='unknown';
 assert.equal(capacity('hive-1',s),null);
 s.layouts['hive-1'].mode='summer';
 s.hives[0].profile.brood.framesPerBox=null;
 assert.equal(capacity('hive-1',s),null);
});
test('inspection validation accepts twelve-frame hive totals but rejects over-capacity and inconsistent metrics',()=>{
 const s=apiary();
 assert.equal(validate(inspection(),s).ok,true);
 const excessive=validate(inspection({occupancy:13,broodFrames:8,freeDrawn:0}),s);
 assert.ok(excessive.errors.some(x=>x.code==='journal_invalid_frame_count'&&x.field==='occupancy'));
 const brood=validate(inspection({occupancy:4,broodFrames:5,freeDrawn:1}),s);
 assert.ok(brood.errors.some(x=>x.code==='journal_brood_exceeds_occupancy'));
 const overlap=validate(inspection({occupancy:10,broodFrames:6,freeDrawn:3}),s);
 assert.ok(overlap.errors.some(x=>x.code==='journal_occupied_plus_free_exceeds_capacity'));
});
test('legacy historical inspection values survive unchanged editing after configuration reduction, but edits are rechecked',()=>{
 const s=apiary({summer:['1']});
 const old=inspection({occupancy:12,broodFrames:8,freeDrawn:0});
 s.records.push(old);
 const same={...old};
 assert.equal(validate(same,s,old).ok,true);
 const changed={...old,broodFrames:7};
 assert.equal(validate(changed,s,old).ok,false);
 assert.ok(validate(changed,s,old).errors.some(x=>x.code==='journal_invalid_frame_count'));
 assert.equal(validate({...same,hive:'other'},s,old).ok,false);
 assert.equal(s.records[0].occupancy,12,'source historical record was not rewritten');
});
test('unknown physical assembly leaves upper limit unspecified, retaining integer and relational validation',()=>{
 const s=apiary({mode:'winter',winter:[]});
 assert.equal(capacity('hive-1',s),null);
 assert.equal(validate(inspection({occupancy:20,broodFrames:10,freeDrawn:2}),s).ok,true);
 assert.ok(validate(inspection({occupancy:2,broodFrames:4,freeDrawn:0}),s).errors.some(x=>x.code==='journal_brood_exceeds_occupancy'));
});
test('text extraction accepts explicit multi-digit observations only within selected actual hive capacity',()=>{
 assert.deepEqual(parse('Осмотр: занято 10 рамок, расплод на 7 рамках, свободных рамок — 2.',12).fields,
   {occupancy:10,broodFrames:7,freeDrawn:2});
 assert.equal(parse('Занято 13 рамок.',12).fields.occupancy,undefined);
 assert.equal(parse('Занято 10 рамок.').fields.occupancy,undefined,'legacy default parser remains a single-box bound');
 assert.equal(parse('Занято 10 рамок.',null).fields.occupancy,10,'unknown physical capacity must not invent a limit');
 assert.equal(parse('Возможно занято 10 рамок.',12).fields.occupancy,undefined);
});
test('inspection form uses current frame capacity and warns without guessing unknown or changing saved entries',()=>{
 const s=apiary(),ids={rhive:{value:'hive-1'},rtype:{value:'Осмотр'},occupancyLabel:{textContent:''},broodLabel:{textContent:''},drawnLabel:{textContent:''},capacityWarning:{style:{display:'none'},textContent:''}};
 for(const id of ['roccupancy','rbrood','rdrawn'])ids[id]={value:'',max:'6',removeAttribute(key){if(key==='max')delete this.max;}};
 const localCapacity=load('journalBroodCapacity','validateJournalRecordDraft',{getHiveProfile,S:s});
 const fn=load('updateJournalInspectionCapacity','toggleOccupancy',{S:s,activeJournalHive:'hive-1',journalBroodCapacity:localCapacity,$:id=>ids[id]});
 fn();
 assert.equal(ids.roccupancy.max,'12');
 assert.match(ids.occupancyLabel.textContent,/из 12/);
 ids.roccupancy.value='15';
 fn();
 assert.equal(ids.roccupancy.max,undefined,'legacy out-of-capacity input can stay visible for validation on save');
 s.layouts['hive-1'].mode='winter';s.layouts['hive-1'].winterOrder=[];
 fn();
 assert.equal(ids.broodLabel.textContent.includes('вместимость профиля не указана'),true);
 assert.equal(ids.capacityWarning.style.display,'block');
});
test('expansion suggestion scales to installed brood capacity and never declares a physical operation completed',()=>{
 const s=apiary();s.tasks=[];
 const localCapacity=load('journalBroodCapacity','validateJournalRecordDraft',{getHiveProfile,S:s});
 const create=load('createExpansionSuggestion','updateJournalInspectionCapacity',{
  S:s,journalBroodCapacity:localCapacity,uid:()=> 'suggestion-1',dateShift:()=> '2026-05-03'
 });
 create(inspection({occupancy:10,broodFrames:6,freeDrawn:1}));
 assert.equal(s.tasks.length,1);
 assert.equal(s.tasks[0].status,'suggested');
 assert.equal(s.tasks[0].source,'auto');
 assert.match(s.tasks[0].note,/из 12 рамок/);
 assert.equal(s.tasks[0].basis.capacity,12);
});
