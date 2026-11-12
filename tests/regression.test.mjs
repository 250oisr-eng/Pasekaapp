import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
function extractFunction(name) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(');
  const match = re.exec(html);
  assert.ok(match, 'Function not found: ' + name);
  const start = match.index;
  const next = /\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/g;
  next.lastIndex = match.index + match[0].length;
  const endMatch = next.exec(html);
  return html.slice(start, endMatch ? endMatch.index : html.indexOf('</script>', start));
}
function loadFunction(name, globals = {}) {
  const source = extractFunction(name);
  return new Function('deps', 'with (deps) { return (' + source + '); }')(globals);
}

test('family lineage accepts live and archived parents', () => {
  const inspect = loadFunction('inspectFamilyLineage');
  assert.deepEqual(inspect([{id:'p',origin:'swarm'},{id:'c',origin:'offshoot',parentFamilyId:'p'}]), []);
  assert.deepEqual(inspect([{id:'c',origin:'offshoot',parentFamilyId:'p',parentFamilySnapshot:{id:'p'}}]), []);
});
test('family lineage rejects missing parents and cycles', () => {
  const inspect = loadFunction('inspectFamilyLineage');
  assert.ok(inspect([{id:'c',origin:'offshoot',parentFamilyId:'missing'}]).some(x=>x.code==='family_parent_missing'));
  assert.ok(inspect([{id:'a',parentFamilyId:'b'},{id:'b',parentFamilyId:'a'}]).some(x=>x.code==='family_lineage_cycle'));
});
test('family establishment date must be a real calendar date', () => {
  const inspect = loadFunction('inspectFamilyLineage');
  assert.deepEqual(inspect([{id:'p'},{id:'c',origin:'offshoot',parentFamilyId:'p',stage:'independent',establishedAt:'2024-02-29'}]), []);
  assert.ok(inspect([{id:'p'},{id:'c',origin:'offshoot',parentFamilyId:'p',stage:'independent',establishedAt:'2026-02-30'}]).some(x=>x.code==='invalid_family_established_date'));
});
test('task lifecycle accepts only supported states and real dates', () => {
  const inspect = loadFunction('inspectTaskIntegrity');
  assert.deepEqual(inspect([{status:'pending',date:'2026-11-12'},{status:'suggested',date:'2024-02-29'},{status:'done'},{status:'dismissed'}]), []);
  const errors = inspect([{id:'bad-date',status:'pending',date:'2026-02-30'},{id:'bad-state',status:'complete',date:'2026-11-12'}]);
  assert.ok(errors.some(x=>x.code==='invalid_task_date' && x.details.taskId==='bad-date'));
  assert.ok(errors.some(x=>x.code==='invalid_task_status' && x.details.taskId==='bad-state'));
});

function makeBoxes(families = {}, frames = {}) {
  return Object.fromEntries([1,2,3,4,5,6].map(n=>[n,{family:families[n]||'',frames:frames[n]||[]}]));
}
function transferFixture() {
  return {
    hives:[{id:'h1',number:1},{id:'h2',number:2}],
    families:[{id:'fam',name:'26-1',hive:'h1',box:1,origin:'offshoot',parentFamilyId:'parent'},{id:'parent',name:'26-0',hive:'h1',box:3}],
    records:[{id:'record-1',family:'fam',hive:'h1'}],
    layouts:{
      h1:{mode:'summer',installedBoxes:[1,2,3],honeyFrames:[[],[]],boxes:makeBoxes({1:'fam',3:'parent'},{1:[{frameId:'1',location:'1',history:[]},{frameId:'2',location:'1',history:[]}]})},
      h2:{mode:'summer',installedBoxes:[1,2,3],honeyFrames:[[],[]],boxes:makeBoxes({}, {2:[{frameId:'1',location:'2',history:[]},{frameId:'9',location:'2',history:[]}]})}
    }
  };
}
async function runTransfer(data) {
  const deps = {
    S: JSON.parse(JSON.stringify(data)),
    transferringFamilyId:'fam', selectedHiveId:'h1', activeJournalHive:'h1',
    alerts:[], audit:[],
    $: id => ({transferTargetHive:{value:'h2'},transferTargetBox:{value:'2'},familyTransferDlg:{close(){}}}[id] || {value:'',close(){}}),
    alert(message){this.alerts.push(message);}, confirm(){return true;},
    hname:id=>'Улей '+id, today:()=>'2026-11-12',
    logAudit(...args){this.audit.push(args);},
    layoutFor(id){return this.S.layouts[id];},
    frameArray(layout,key){return key==='H1'?layout.honeyFrames[0]:key==='H2'?layout.honeyFrames[1]:layout.boxes[key].frames;},
    findFamilyBox(id){for(const hive of this.S.hives)for(let n=1;n<=6;n++){const box=this.S.layouts[hive.id]?.boxes[n];if(box?.family===id)return {hiveId:hive.id,box:n,data:box,layout:this.S.layouts[hive.id]};}return null;},
    nextFrameId(layout){return String(Math.max(0,...[1,2,3,4,5,6,'H1','H2'].flatMap(k=>(this.frameArray(layout,k)||[]).map(frame=>Number(frame.frameId)||0)))+1);},
    async save(){return true;}, render(){}, showTab(){}
  };
  const fn = loadFunction('confirmFamilyTransfer', deps);
  await fn({preventDefault(){}});
  return deps;
}
test('family transfer moves family and swaps frame sets while retaining lineage', async () => {
  const result = await runTransfer(transferFixture());
  assert.equal(result.S.families[0].hive,'h2');
  assert.equal(result.S.families[0].box,2);
  assert.equal(result.S.families[0].parentFamilyId,'parent');
  assert.deepEqual(result.S.layouts.h2.boxes[2].frames.map(x=>x.frameId),['1','2']);
  assert.deepEqual(result.S.layouts.h1.boxes[1].frames.map(x=>x.frameId),['1','9']);
  assert.equal(result.S.layouts.h1.boxes[1].family,'');
  assert.equal(result.S.layouts.h2.boxes[2].family,'fam');
  assert.equal(result.audit[0][0],'family_transferred');
});
test('family transfer rejects inconsistent target frame locations without partial mutation', async () => {
  const data = transferFixture();
  data.layouts.h2.boxes[2].frames[1].location='6';
  const result = await runTransfer(data);
  assert.equal(result.S.families[0].hive,'h1');
  assert.deepEqual(result.S.layouts.h1.boxes[1].frames.map(x=>x.frameId),['1','2']);
  assert.deepEqual(result.S.layouts.h2.boxes[2].frames.map(x=>x.frameId),['1','9']);
  assert.equal(result.audit.length,0);
  assert.equal(result.alerts.length,1);
});

function frameMoveFixture(){
  const boxes=Object.fromEntries([1,2,3,4,5,6].map(n=>[n,{family:'',frames:[]}]));
  const make=(id,box)=>({frameId:id,location:String(box),originBox:String(box),type:'comb',status:'drawn',history:[]});
  boxes[1].frames=[make('A','1'),make('B','1')];
  boxes[2].frames=[make('C','2'),make('D','2')];
  return {meta:{revisionId:'rev-1'},hives:[{id:'h1',number:1}],families:[],records:[],tasks:[],layouts:{h1:{mode:'summer',installedBoxes:[1,2,3],winterOrder:[],honeyBoxInstalled:[false,false],honeyFrames:[[],[]],boxes}}};
}
test('batch frame move plans and applies several moves atomically',()=>{
  const plan=loadFunction('planFrameMoves');
  const apply=loadFunction('applyFrameMovePlan',{planFrameMoves:loadFunction('planFrameMoves')});
  const state=frameMoveFixture();
  const result=plan(state,[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'},{hiveId:'h1',frameId:'B',fromBox:'1',toBox:'3'},{hiveId:'h1',frameId:'C',fromBox:'2',toBox:'3'}]);
  assert.equal(result.ok,true);
  const applied=apply(state,result,'2026-11-12');
  assert.equal(applied.ok,true);
  assert.deepEqual(applied.state.layouts.h1.boxes[1].frames,[]);
  assert.deepEqual(applied.state.layouts.h1.boxes[2].frames.map(x=>x.frameId),['D']);
  assert.deepEqual(applied.state.layouts.h1.boxes[3].frames.map(x=>x.frameId),['A','B','C']);
  assert.deepEqual(state.layouts.h1.boxes[1].frames.map(x=>x.frameId),['A','B'],'source state is not mutated');
  assert.equal(applied.state.layouts.h1.boxes[3].frames[0].history.at(-1).to.location,'3');
  assert.equal(applied.state.layouts.h1.boxes[3].frames[0].history.at(-1).from.position,1);
  assert.equal(applied.state.layouts.h1.boxes[3].frames[1].history.at(-1).from.position,2);
  assert.equal(applied.state.auditLog.at(-1).type,'frames_moved_batch');
});
test('batch frame move supports an exchange without intermediate capacity failure',()=>{
  const plan=loadFunction('planFrameMoves');
  const apply=loadFunction('applyFrameMovePlan',{planFrameMoves:loadFunction('planFrameMoves')});
  const state=frameMoveFixture();
  const result=plan(state,[{hiveId:'h1',frameId:'A',toBox:'2'},{hiveId:'h1',frameId:'C',toBox:'1'}]);
  assert.equal(result.ok,true);
  const applied=apply(state,result,'2026-11-12');
  assert.equal(applied.ok,true);
  assert.deepEqual(applied.state.layouts.h1.boxes[1].frames.map(x=>x.frameId),['B','C']);
  assert.deepEqual(applied.state.layouts.h1.boxes[2].frames.map(x=>x.frameId),['D','A']);
});
test('batch frame move rejects overflow and leaves original state untouched',()=>{
  const plan=loadFunction('planFrameMoves');
  const apply=loadFunction('applyFrameMovePlan',{planFrameMoves:loadFunction('planFrameMoves')});
  const state=frameMoveFixture();
  state.layouts.h1.boxes[3].frames=Array.from({length:6},(_,i)=>({frameId:'T'+i,location:'3',history:[]}));
  const before=JSON.stringify(state);
  const result=plan(state,[{hiveId:'h1',frameId:'A',toBox:'3'}]);
  assert.equal(result.ok,false);
  assert.ok(result.errors.some(x=>x.code==='move_target_over_capacity'));
  assert.equal(apply(state,result,'2026-11-12').ok,false);
  assert.equal(JSON.stringify(state),before);
});
test('batch frame move rejects wrong source, duplicate IDs and uninstalled targets',()=>{
  const plan=loadFunction('planFrameMoves');
  const state=frameMoveFixture();
  assert.ok(plan(state,[{hiveId:'h1',frameId:'A',fromBox:'2',toBox:'3'}]).errors.some(x=>x.code==='move_source_mismatch'));
  state.layouts.h1.boxes[2].frames.push({...state.layouts.h1.boxes[1].frames[0]});
  assert.ok(plan(state,[{hiveId:'h1',frameId:'A',toBox:'3'}]).errors.some(x=>x.code==='move_frame_id_ambiguous'));
  const clean=frameMoveFixture();
  assert.ok(plan(clean,[{hiveId:'h1',frameId:'A',toBox:'4'}]).errors.some(x=>x.code==='move_target_not_installed'));
});
test('batch frame move rejects winter forbidden boxes and stale plans',()=>{
  const plan=loadFunction('planFrameMoves');
  const apply=loadFunction('applyFrameMovePlan',{planFrameMoves:loadFunction('planFrameMoves')});
  const state=frameMoveFixture();
  state.layouts.h1.mode='winter';state.layouts.h1.installedBoxes=[1,3,4];state.layouts.h1.winterOrder=[1,3,4];
  assert.ok(plan(state,[{hiveId:'h1',frameId:'A',toBox:'2'}]).errors.some(x=>x.code==='move_target_not_installed'));
  const summer=frameMoveFixture(),valid=plan(summer,[{hiveId:'h1',frameId:'A',toBox:'3'}]);
  summer.meta.revisionId='rev-2';
  const stale=apply(summer,valid,'2026-11-12');
  assert.equal(stale.ok,false);
  assert.equal(stale.errors[0].code,'move_plan_stale');
  assert.deepEqual(summer.layouts.h1.boxes[1].frames.map(x=>x.frameId),['A','B']);
});

test('AI command proposal requires clarification when a frame reference is incomplete',()=>{
  const validate=loadFunction('validateAICommandProposal',{planFrameMoves:loadFunction('planFrameMoves')});
  const state=frameMoveFixture();
  const result=validate(state,{schemaVersion:1,kind:'move_frames',moves:[{hiveId:'h1',toBox:'3'}]});
  assert.equal(result.status,'needs_clarification');
  assert.ok(result.clarifyingQuestions.some(question=>question.includes('рамку')));
  assert.deepEqual(state.layouts.h1.boxes[1].frames.map(frame=>frame.frameId),['A','B']);
});
test('AI command proposal creates a validated preview but never mutates data',()=>{
  const validate=loadFunction('validateAICommandProposal',{planFrameMoves:loadFunction('planFrameMoves')});
  const state=frameMoveFixture(),before=JSON.stringify(state);
  const result=validate(state,{schemaVersion:1,kind:'move_frames',commandId:'cmd-1',explanation:'Перенос рамки',moves:[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'}]});
  assert.equal(result.status,'ready_for_preview');
  assert.equal(result.plan.commandId,'cmd-1');
  assert.equal(result.plan.moves[0].frameId,'A');
  assert.equal(JSON.stringify(state),before);
});
test('AI command proposal rejects unknown hives, unsupported actions and invalid destinations',()=>{
  const validate=loadFunction('validateAICommandProposal',{planFrameMoves:loadFunction('planFrameMoves')});
  const state=frameMoveFixture();
  assert.equal(validate(state,{schemaVersion:1,kind:'delete_hive'}).errors[0].code,'ai_command_kind_unsupported');
  assert.equal(validate(state,{schemaVersion:1,kind:'move_frames',moves:[{hiveId:'missing',frameId:'A',toBox:'3'}]}).errors[0].code,'ai_command_hive_unknown');
  const invalid=validate(state,{schemaVersion:1,kind:'move_frames',moves:[{hiveId:'h1',frameId:'A',toBox:'5'}]});
  assert.equal(invalid.status,'invalid');
  assert.ok(invalid.errors.some(error=>error.code==='move_target_not_installed'));
  assert.deepEqual(state.layouts.h1.boxes[1].frames.map(frame=>frame.frameId),['A','B']);
});


test('batch frame move requires exact location metadata and well-formed history',()=>{
  const plan=loadFunction('planFrameMoves');
  const wrongLocation=frameMoveFixture();
  wrongLocation.layouts.h1.boxes[1].frames[0].location='';
  assert.ok(plan(wrongLocation,[{hiveId:'h1',frameId:'A',toBox:'3'}]).errors.some(x=>x.code==='move_frame_location_mismatch'));
  const brokenHistory=frameMoveFixture();
  brokenHistory.layouts.h1.boxes[1].frames[0].history=[null];
  assert.ok(plan(brokenHistory,[{hiveId:'h1',frameId:'A',toBox:'3'}]).errors.some(x=>x.code==='move_frame_history_invalid'));
});

test('batch frame move enforces the installed honey pair and ten-frame capacity',()=>{
  const plan=loadFunction('planFrameMoves');
  const apply=loadFunction('applyFrameMovePlan',{planFrameMoves:loadFunction('planFrameMoves')});
  const state=frameMoveFixture();
  state.layouts.h1.honeyBoxInstalled=[true,false];
  assert.ok(plan(state,[{hiveId:'h1',frameId:'A',toBox:'H1'}]).errors.some(x=>x.code==='move_target_not_installed'));
  state.layouts.h1.honeyBoxInstalled=[true,true];
  state.layouts.h1.honeyFrames=[Array.from({length:10},(_,i)=>({frameId:'H'+i,location:'H1',history:[]})),[]];
  const before=JSON.stringify(state);
  const full=plan(state,[{hiveId:'h1',frameId:'A',toBox:'H1'}]);
  assert.ok(full.errors.some(x=>x.code==='move_target_over_capacity'));
  assert.equal(JSON.stringify(state),before);
  assert.equal(apply(state,full,'2026-11-12').ok,false);
});

test('batch frame move preserves family assignments and frame lineage while crossing family boxes',()=>{
  const plan=loadFunction('planFrameMoves');
  const apply=loadFunction('applyFrameMovePlan',{planFrameMoves:loadFunction('planFrameMoves')});
  const state=frameMoveFixture();
  state.families=[{id:'family-a',hive:'h1',box:1,origin:'swarm'},{id:'family-b',hive:'h1',box:3,origin:'offshoot',parentFamilyId:'family-a'}];
  state.layouts.h1.boxes[1].family='family-a';
  state.layouts.h1.boxes[3].family='family-b';
  state.layouts.h1.boxes[1].frames[0].history=[{date:'2026-11-01',action:'inspected'}];
  const result=apply(state,plan(state,[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'}]),'2026-11-12');
  assert.equal(result.ok,true);
  assert.equal(result.state.layouts.h1.boxes[1].family,'family-a');
  assert.equal(result.state.layouts.h1.boxes[3].family,'family-b');
  assert.equal(result.state.families[1].parentFamilyId,'family-a');
  assert.equal(result.state.layouts.h1.boxes[3].frames.find(frame=>frame.frameId==='A').history[0].action,'inspected');
  assert.equal(result.state.layouts.h1.boxes[3].frames.find(frame=>frame.frameId==='A').history.at(-1).action,'move');
  assert.equal(state.layouts.h1.boxes[1].frames.find(frame=>frame.frameId==='A').history.length,1);
});


test('batch frame move refuses a plan changed after its preview was prepared',()=>{
  const plan=loadFunction('planFrameMoves');
  const apply=loadFunction('applyFrameMovePlan',{planFrameMoves:loadFunction('planFrameMoves')});
  const state=frameMoveFixture(),before=JSON.stringify(state);
  const prepared=plan(state,[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'}]);
  prepared.moves[0].toBox='2';
  const result=apply(state,prepared,'2026-11-12');
  assert.equal(result.ok,false);
  assert.equal(result.errors[0].code,'move_plan_preview_mismatch');
  assert.equal(JSON.stringify(state),before);
});


test('AI command marker parser extracts only a valid JSON proposal',()=>{
  const extract=loadFunction('extractAICommandProposal');
  const proposal={schemaVersion:1,kind:'move_frames',moves:[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'}]};
  const valid=extract('Перенесу после проверки.'+String.fromCharCode(10)+'[[PASEKA_COMMAND_JSON]]'+JSON.stringify(proposal)+'[[/PASEKA_COMMAND_JSON]]');
  assert.deepEqual(valid.proposal,proposal);
  assert.equal(valid.answer,'Перенесу после проверки.');
  assert.equal(valid.parseError,'');
  assert.equal(extract('Обычный ответ без команды.').proposal,null);
  assert.match(extract('Ответ'+String.fromCharCode(10)+'[[PASEKA_COMMAND_JSON]]{broken}[[/PASEKA_COMMAND_JSON]]').parseError,/разобрать/);
  assert.match(extract('Ответ'+String.fromCharCode(10)+'[[PASEKA_COMMAND_JSON]]{').parseError,/не завершён/);
});

test('AI move preview can be safely revalidated after a chat save changes only revision',()=>{
  const plan=loadFunction('planFrameMoves');
  const validate=loadFunction('validateAICommandProposal',{planFrameMoves:plan});
  const revalidate=loadFunction('revalidateAICommandPreview',{validateAICommandProposal:validate});
  const apply=loadFunction('applyFrameMovePlan',{planFrameMoves:plan});
  const state=frameMoveFixture();
  const proposal={schemaVersion:1,kind:'move_frames',commandId:'chat-save-1',moves:[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'}]};
  const reviewed=validate(state,proposal);
  assert.equal(reviewed.status,'ready_for_preview');
  state.meta.revisionId='rev-after-chat-save';
  const checked=revalidate(state,proposal,reviewed.plan);
  assert.equal(checked.ok,true);
  assert.equal(checked.plan.expectedRevision,'rev-after-chat-save');
  assert.equal(apply(state,checked.plan,'2026-11-12').ok,true);
});

test('AI move preview is rejected when the frame location changes after review',()=>{
  const plan=loadFunction('planFrameMoves');
  const validate=loadFunction('validateAICommandProposal',{planFrameMoves:plan});
  const revalidate=loadFunction('revalidateAICommandPreview',{validateAICommandProposal:validate});
  const state=frameMoveFixture();
  const proposal={schemaVersion:1,kind:'move_frames',moves:[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'}]};
  const reviewed=validate(state,proposal);
  state.layouts.h1.boxes[1].frames[0].location='2';
  const checked=revalidate(state,proposal,reviewed.plan);
  assert.equal(checked.ok,false);
  assert.notEqual(checked.status,'ready_for_preview');
});

test('inline application JavaScript remains syntactically valid',()=>{
  const start=html.indexOf('<script>'),end=html.indexOf('</script>',start);
  assert.ok(start>=0&&end>start);
  assert.doesNotThrow(()=>new Function(html.slice(start+8,end)));
});


test('AI move preview becomes stale when a source or target family assignment changes',()=>{
  const plan=loadFunction('planFrameMoves');
  const validate=loadFunction('validateAICommandProposal',{planFrameMoves:plan});
  const revalidate=loadFunction('revalidateAICommandPreview',{validateAICommandProposal:validate});
  const state=frameMoveFixture();
  state.layouts.h1.boxes[1].family='family-a';
  state.layouts.h1.boxes[3].family='family-b';
  const proposal={schemaVersion:1,kind:'move_frames',moves:[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'}]};
  const reviewed=validate(state,proposal);
  assert.equal(reviewed.status,'ready_for_preview');
  state.layouts.h1.boxes[3].family='family-c';
  state.meta.revisionId='rev-family-changed';
  const checked=revalidate(state,proposal,reviewed.plan);
  assert.equal(checked.ok,false);
  assert.equal(checked.status,'stale');
});

test('batch frame move compares the executable plan with its reviewed preview',()=>{
  const plan=loadFunction('planFrameMoves');
  const apply=loadFunction('applyFrameMovePlan',{planFrameMoves:plan});
  const state=frameMoveFixture(),before=JSON.stringify(state);
  const prepared=plan(state,[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'}]);
  prepared.moves[0].fromPosition=99;
  prepared.preview[0].fromPosition=99;
  const result=apply(state,prepared,'2026-11-12');
  assert.equal(result.ok,false);
  assert.equal(result.errors[0].code,'move_plan_changed');
  assert.equal(JSON.stringify(state),before);
});


test('hybrid workspace exposes five clear navigation destinations and home AI entry points',()=>{
  const navStart=html.indexOf('<nav aria-label="Основные разделы">');
  const navEnd=html.indexOf('</nav>',navStart);
  assert.ok(navStart>=0&&navEnd>navStart,'accessible main navigation exists');
  const nav=html.slice(navStart,navEnd);
  assert.equal((nav.match(/data-tab=/g)||[]).length,5);
  for(const label of ['Обзор','Ульи','Журнал','ИИ','Ещё'])assert.ok(nav.includes('>'+label+'</button>'));
  assert.ok(html.includes('id="homeAIQuestion"'));
  assert.ok(html.includes('class="ai-capabilities"'));
  assert.ok(html.includes('class="ai-prompt-chips"'));
});

test('home AI entry copies the chosen prompt into chat without sending it',()=>{
  let activeTab='',focused=false;
  const nodes={homeAIQuestion:{value:'  Проверь состояние семей  '},aiQuestion:{value:'',focus(){focused=true}}};
  const ask=loadFunction('askAIFromHome',{$:id=>nodes[id],showTab:tab=>{activeTab=tab}});
  ask();
  assert.equal(activeTab,'ai');
  assert.equal(nodes.aiQuestion.value,'Проверь состояние семей');
  assert.equal(focused,true);
  const helper=loadFunction('useAIPrompt',{$:id=>nodes[id]});
  helper('Составь план работ');
  assert.equal(nodes.aiQuestion.value,'Составь план работ');
});


test('voice dictation appends Russian transcript to the draft without sending it',()=>{
  let started=false,alerts=[];
  const field={value:'Проверь семьи',focus(){}};
  function FakeRecognition(){this.start=()=>{started=true;this.onresult({results:[[{transcript:'и отводки'}]]});this.onend()}}
  const button={disabled:false,textContent:'🎙 Диктовать'};
  const recognitionState={aiBusy:false,aiRecognition:null};
  const dictate=loadFunction('startAIVoiceInput',{
    window:{SpeechRecognition:FakeRecognition},
    confirm:()=>true,
    alert:message=>alerts.push(message),
    $:id=>id==='aiQuestion'?field:null,
    ...recognitionState
  });
  dictate(button);
  assert.equal(started,true);
  assert.equal(field.value,'Проверь семьи и отводки');
  assert.equal(button.disabled,false);
  assert.equal(button.textContent,'🎙 Диктовать');
  assert.deepEqual(alerts,[]);
});

test('voice dictation explains unsupported browsers and does not start silently',()=>{
  let warning='',confirmed=false;
  const dictate=loadFunction('startAIVoiceInput',{
    window:{},aiBusy:false,aiRecognition:null,
    confirm:()=>{confirmed=true;return true},
    alert:message=>{warning=message}
  });
  dictate({disabled:false,textContent:'🎙 Диктовать'});
  assert.match(warning,/нет встроенного распознавания речи/);
  assert.equal(confirmed,false);
});

test('AI panel discloses speech-recognition privacy and keeps explicit send control',()=>{
  assert.ok(html.includes('id="aiVoiceButton"'));
  assert.ok(html.includes('аудио может обрабатываться внешним сервисом'));
  assert.ok(html.includes('id="aiSendButton"'));
});


test('journal draft from AI workspace requires an explicit hive and opens an editable note only',()=>{
  const alerts=[],tabs=[],nodes={
    aiJournalHiveSelect:{value:'hive-1'},
    aiJournalDraftInput:{value:' Осмотрел семью, увидел свежие яйца. '},
    rtype:{value:''},rtext:{value:''},recordTitle:{textContent:''}
  };
  const state={hives:[{id:'hive-1'}],records:[]};
  let opened=false,toggled=false;
  const prepare=loadFunction('prepareJournalDraftFromAI',{
    S:state,activeJournalHive:'',
    $:id=>nodes[id]||{value:''},
    alert:message=>alerts.push(message),
    showTab:tab=>tabs.push(tab),
    newRecord:()=>{opened=true},
    toggleOccupancy:()=>{toggled=true}
  });
  prepare();
  assert.equal(opened,true);
  assert.equal(toggled,true);
  assert.deepEqual(tabs,['journal']);
  assert.equal(nodes.rtype.value,'Заметка');
  assert.equal(nodes.rtext.value,'Осмотрел семью, увидел свежие яйца.');
  assert.equal(nodes.recordTitle.textContent,'Черновик записи · проверь поля');
  assert.equal(state.records.length,0);
  assert.equal(alerts.length,0);
});

test('journal draft refuses to guess a hive when none is selected',()=>{
  const alerts=[];let opened=0;
  const nodes={aiJournalHiveSelect:{value:''},aiJournalDraftInput:{value:'Осмотрел семью'}};
  const prepare=loadFunction('prepareJournalDraftFromAI',{
    S:{hives:[{id:'hive-1'},{id:'hive-2'}],records:[]},activeJournalHive:'hive-2',
    $:id=>nodes[id]||{value:''},alert:message=>alerts.push(message),
    showTab:()=>{},newRecord:()=>opened++,toggleOccupancy:()=>{}
  });
  prepare();
  assert.equal(opened,0);
  assert.match(alerts[0],/Выбери улей/);
});

test('journal draft refuses empty descriptions and missing hives without opening a record',()=>{
  const alerts=[];
  let opened=0;
  const nodes={aiJournalDraftInput:{value:'   '}};
  const prepare=loadFunction('prepareJournalDraftFromAI',{
    S:{hives:[],records:[]},activeJournalHive:'',
    $:id=>nodes[id]||{value:''},
    alert:message=>alerts.push(message),
    showTab:()=>{},newRecord:()=>opened++,toggleOccupancy:()=>{}
  });
  prepare();
  assert.equal(opened,0);
  assert.match(alerts[0],/опиши наблюдение/);
  nodes.aiJournalDraftInput.value='Осмотр';
  prepare();
  assert.equal(opened,0);
  assert.match(alerts[1],/добавь улей/);
});


test('confirmed AI frame move is not reported as saved when persistence fails',async()=>{
  const message={commandStatus:'pending',commandProposal:{schemaVersion:1,kind:'move_frames',moves:[{hiveId:'h1',frameId:'A',toBox:'3'}]},commandPlan:{moves:[{frameId:'A',fromBox:'1',toBox:'3'}]}};
  const state={aiMessages:[message]};
  let confirms=0,renders=0;
  const confirmMove=loadFunction('confirmAICommand',{
    S:state,confirm:()=>{confirms++;return true},
    revalidateAICommandPreview:()=>({ok:true,plan:{moves:[{frameId:'A'}]}}),
    applyFrameMovePlan:()=>({ok:true,state:{aiMessages:[message],changed:true},moves:[]}),
    frameLocationName:box=>box,today:()=> '2026-11-12',
    save:async()=>false,renderAIChat:()=>{renders++}
  });
  await confirmMove(0);
  assert.equal(message.commandStatus,'save_failed');
  assert.match(message.commandError,/не сохранено в основной базе/);
  assert.equal(confirms,1);
  assert.equal(renders,1);
  await confirmMove(0);
  assert.equal(confirms,1,'a failed save must not allow the same command to be confirmed again');
});

test('confirmed AI frame move is marked applied only after persistence succeeds',async()=>{
  const message={commandStatus:'pending',commandProposal:{schemaVersion:1,kind:'move_frames',moves:[{hiveId:'h1',frameId:'A',toBox:'3'}]},commandPlan:{moves:[{frameId:'A',fromBox:'1',toBox:'3'}]}};
  const confirmMove=loadFunction('confirmAICommand',{
    S:{aiMessages:[message]},confirm:()=>true,
    revalidateAICommandPreview:()=>({ok:true,plan:{moves:[{frameId:'A'}]}}),
    applyFrameMovePlan:()=>({ok:true,state:{aiMessages:[message]},moves:[]}),
    frameLocationName:box=>box,today:()=> '2026-11-12',
    save:async()=>true,renderAIChat:()=>{}
  });
  await confirmMove(0);
  assert.equal(message.commandStatus,'applied');
  assert.ok(message.appliedAt);
});


test('batch frame move never treats winter-forbidden boxes as installed even in malformed winter order',()=>{
  const plan=loadFunction('planFrameMoves');
  const state=frameMoveFixture();
  state.layouts.h1.mode='winter';
  state.layouts.h1.winterOrder=[1,2,3];
  state.layouts.h1.installedBoxes=[1,2,3];
  const toForbidden=plan(state,[{hiveId:'h1',frameId:'A',toBox:'2'}]);
  assert.ok(toForbidden.errors.some(error=>error.code==='move_target_not_installed'));
  const fromForbidden=plan(state,[{hiveId:'h1',frameId:'C',fromBox:'2',toBox:'1'}]);
  assert.ok(fromForbidden.errors.some(error=>error.code==='move_source_not_installed'));
});

test('journal draft validator accepts a complete and correctly linked inspection',()=>{
 const validate=loadFunction('validateJournalRecordDraft');
 const state={hives:[{id:'h1'}],families:[{id:'f1',hive:'h1'}],records:[]};
 const result=validate({id:'r1',date:'2024-02-29',type:'Осмотр',hive:'h1',family:'f1',occupancy:5,broodFrames:3,freeDrawn:1},state);
 assert.equal(result.ok,true);
 assert.deepEqual(result.errors,[]);
});

test('journal draft validator rejects impossible calendar dates and unsupported record types',()=>{
 const validate=loadFunction('validateJournalRecordDraft');
 const state={hives:[{id:'h1'}],families:[],records:[]};
 const result=validate({id:'r1',date:'2026-02-30',type:'Неизвестный тип',hive:'h1',family:''},state);
 assert.equal(result.ok,false);
 assert.ok(result.errors.some(error=>error.code==='journal_invalid_date'));
 assert.ok(result.errors.some(error=>error.code==='journal_invalid_type'));
});

test('journal draft validator rejects missing hives and cross-hive family links',()=>{
 const validate=loadFunction('validateJournalRecordDraft');
 const state={hives:[{id:'h1'},{id:'h2'}],families:[{id:'f1',hive:'h1'}],records:[]};
 const result=validate({id:'r1',date:'2026-11-12',type:'Заметка',hive:'h2',family:'f1'},state);
 assert.ok(result.errors.some(error=>error.code==='journal_family_mismatch'));
 const missing=validate({id:'r2',date:'2026-11-12',type:'Заметка',hive:'missing',family:''},state);
 assert.ok(missing.errors.some(error=>error.code==='journal_hive_missing'));
});

test('journal draft validator accepts an archived family link only while editing its original record',()=>{
 const validate=loadFunction('validateJournalRecordDraft');
 const state={hives:[{id:'h1'}],families:[],records:[]};
 const archived={id:'r1',family:'old-family',familySnapshotAtTime:{id:'old-family',name:'Архивная семья'}};
 const draft={id:'r1',date:'2026-11-12',type:'Заметка',hive:'h1',family:'old-family'};
 assert.equal(validate(draft,state,archived).ok,true);
 assert.ok(validate({...draft,id:'r2'},state,null).errors.some(error=>error.code==='journal_family_mismatch'));
});

test('journal draft validator rejects duplicate record identifiers',()=>{
 const validate=loadFunction('validateJournalRecordDraft');
 const state={hives:[{id:'h1'}],families:[],records:[{id:'existing'}]};
 const result=validate({id:'existing',date:'2026-11-12',type:'Заметка',hive:'h1',family:''},state);
 assert.ok(result.errors.some(error=>error.code==='journal_duplicate_id'));
 assert.equal(validate({id:'existing',date:'2026-11-12',type:'Заметка',hive:'h1',family:''},state,state.records[0]).ok,true);
});

test('journal inspection metrics must be whole numbers within the six-frame capacity',()=>{
 const validate=loadFunction('validateJournalRecordDraft');
 const state={hives:[{id:'h1'}],families:[],records:[]};
 const result=validate({id:'r1',date:'2026-11-12',type:'Осмотр',hive:'h1',family:'',occupancy:6.5,broodFrames:-1,freeDrawn:7},state);
 assert.equal(result.errors.filter(error=>error.code==='journal_invalid_frame_count').length,3);
});

test('journal treatment follow-up date is validated as a real date',()=>{
 const validate=loadFunction('validateJournalRecordDraft');
 const state={hives:[{id:'h1'}],families:[],records:[]};
 const result=validate({id:'r1',date:'2026-11-12',type:'Обработка',hive:'h1',family:'',treatmentCheck:'2026-02-30'},state);
 assert.ok(result.errors.some(error=>error.code==='journal_invalid_treatment_check_date'));
 assert.equal(validate({id:'r2',date:'2026-11-12',type:'Обработка',hive:'h1',family:'',treatmentCheck:'2024-02-29'},state).ok,true);
});
