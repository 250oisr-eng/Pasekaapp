import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
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

test('AI frame move cancellation leaves the preview pending and changes nothing',async()=>{
 const state=frameMoveFixture();
 const planMoves=loadFunction('planFrameMoves');
 const validate=loadFunction('validateAICommandProposal',{planFrameMoves:planMoves});
 const fingerprint=loadFunction('aiCommandContextFingerprint',{aiStableSnapshot:loadFunction('aiStableSnapshot')});
 const proposal={schemaVersion:1,kind:'move_frames',commandId:'cancel-1',moves:[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'}]};
 const preview=validate(state,proposal);
 assert.equal(preview.status,'ready_for_preview');
 state.aiMessages=[{commandProposal:proposal,commandContextFingerprint:fingerprint(state),commandStatus:'pending',commandPlan:preview.plan}];
 const before=JSON.stringify(state);
 let saves=0,renders=0;
 const deps={S:state,confirm:()=>false,aiCommandContextIsCurrent:(s,m)=>m.commandContextFingerprint===fingerprint(s),frameLocationName:box=>'корпус '+box,save:async()=>{saves++;return true},renderAIChat:()=>{renders++}};
 await loadFunction('confirmAICommand',deps)(0);
 assert.equal(JSON.stringify(deps.S),before);
 assert.equal(deps.S.aiMessages[0].commandStatus,'pending');
 assert.equal(saves,0,'cancellation must not persist');
 assert.equal(renders,0,'cancellation must not report a result');
});
test('AI frame move rejects a stale preview before asking for confirmation or mutating data',async()=>{
 const state=frameMoveFixture();
 const planMoves=loadFunction('planFrameMoves');
 const validate=loadFunction('validateAICommandProposal',{planFrameMoves:planMoves});
 const fingerprint=loadFunction('aiCommandContextFingerprint',{aiStableSnapshot:loadFunction('aiStableSnapshot')});
 const proposal={schemaVersion:1,kind:'move_frames',commandId:'stale-1',moves:[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'}]};
 const preview=validate(state,proposal);
 assert.equal(preview.status,'ready_for_preview');
 state.aiMessages=[{commandProposal:proposal,commandContextFingerprint:fingerprint(state),commandStatus:'pending',commandPlan:preview.plan}];
 state.layouts.h1.boxes[1].frames[0].type='changed-after-preview';
 let confirmations=0,saves=0,renders=0;
 const deps={S:state,confirm:()=>{confirmations++;return true},aiCommandContextIsCurrent:(s,m)=>m.commandContextFingerprint===fingerprint(s),save:async()=>{saves++;return true},renderAIChat:()=>{renders++}};
 await loadFunction('confirmAICommand',deps)(0);
 assert.equal(confirmations,0,'stale plan must not reach confirmation');
 assert.equal(deps.S.aiMessages[0].commandStatus,'stale');
 assert.equal(deps.S.layouts.h1.boxes[1].frames.some(frame=>frame.frameId==='A'),true);
 assert.equal(deps.S.layouts.h1.boxes[3].frames.length,0);
 assert.equal(deps.S.auditLog,undefined);
 assert.equal(saves,1,'stale status is persisted for the user');
 assert.equal(renders,1);
});
test('AI frame move rejects a tampered reviewed plan after confirmation without applying it',async()=>{
 const state=frameMoveFixture();
 const planMoves=loadFunction('planFrameMoves');
 const validate=loadFunction('validateAICommandProposal',{planFrameMoves:planMoves});
 const fingerprint=loadFunction('aiCommandContextFingerprint',{aiStableSnapshot:loadFunction('aiStableSnapshot')});
 const proposal={schemaVersion:1,kind:'move_frames',commandId:'tamper-1',moves:[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'}]};
 const preview=validate(state,proposal);
 assert.equal(preview.status,'ready_for_preview');
 state.aiMessages=[{commandProposal:proposal,commandContextFingerprint:fingerprint(state),commandStatus:'pending',commandPlan:{...preview.plan,moves:preview.plan.moves.map(move=>({...move,toBox:'2'}))}}];
 let confirmations=0,saves=0,renders=0;
 const deps={
  S:state,confirm:()=>{confirmations++;return true},
  aiCommandContextIsCurrent:(s,m)=>m.commandContextFingerprint===fingerprint(s),
  revalidateAICommandPreview:loadFunction('revalidateAICommandPreview',{validateAICommandProposal:validate}),
  applyFrameMovePlan:loadFunction('applyFrameMovePlan',{planFrameMoves:planMoves}),
  frameLocationName:box=>'корпус '+box,today:()=>'2026-11-12',
  save:async()=>{saves++;return true},renderAIChat:()=>{renders++}
 };
 await loadFunction('confirmAICommand',deps)(0);
 assert.equal(confirmations,1,'the reviewed action reaches the explicit confirmation gate');
 assert.equal(deps.S.aiMessages[0].commandStatus,'stale');
 assert.equal(deps.S.layouts.h1.boxes[1].frames.some(frame=>frame.frameId==='A'),true);
 assert.equal(deps.S.layouts.h1.boxes[2].frames.some(frame=>frame.frameId==='A'),false);
 assert.equal(deps.S.layouts.h1.boxes[3].frames.length,0);
 assert.equal(saves,1,'the rejected preview status is saved');
 assert.equal(renders,1);
});
test('AI frame move completes the full preview-confirmation-persistence flow atomically',async()=>{
 const state=frameMoveFixture();
 const planMoves=loadFunction('planFrameMoves');
 const validate=loadFunction('validateAICommandProposal',{planFrameMoves:planMoves});
 const revalidate=loadFunction('revalidateAICommandPreview',{validateAICommandProposal:validate});
 const apply=loadFunction('applyFrameMovePlan',{planFrameMoves:planMoves});
 const fingerprint=loadFunction('aiCommandContextFingerprint',{aiStableSnapshot:loadFunction('aiStableSnapshot')});
 const isCurrent=loadFunction('aiCommandContextIsCurrent',{aiCommandContextFingerprint:fingerprint});
 const proposal={schemaVersion:1,kind:'move_frames',commandId:'integration-1',moves:[{hiveId:'h1',frameId:'A',fromBox:'1',toBox:'3'}]};
 const preview=validate(state,proposal);
 assert.equal(preview.status,'ready_for_preview');
 const message={role:'assistant',content:'План подготовлен.',commandProposal:proposal,commandContextFingerprint:fingerprint(state),commandStatus:'pending',commandPlan:preview.plan};
 state.aiMessages=[message];
 let persistedSnapshot='',saveCalls=0,renderCalls=0;
 const deps={
  S:state,confirm:()=>true,aiCommandContextIsCurrent:isCurrent,
  revalidateAICommandPreview:revalidate,applyFrameMovePlan:apply,
  frameLocationName:box=>'корпус '+box,today:()=>'2026-11-12',
  save:async()=>{saveCalls++;persistedSnapshot=JSON.stringify(deps.S);return true},
  renderAIChat:()=>{renderCalls++}
 };
 await loadFunction('confirmAICommand',deps)(0);
 assert.equal(saveCalls,1,'the confirmed operation is persisted once');
 assert.equal(renderCalls,1,'the chat is refreshed after the result');
 assert.equal(deps.S.aiMessages[0].commandStatus,'applied');
 assert.ok(deps.S.aiMessages[0].appliedAt);
 assert.deepEqual(deps.S.layouts.h1.boxes[1].frames.map(frame=>frame.frameId),['B']);
 assert.deepEqual(deps.S.layouts.h1.boxes[3].frames.map(frame=>frame.frameId),['A']);
 assert.equal(deps.S.layouts.h1.boxes[3].frames[0].location,'3');
 assert.equal(deps.S.layouts.h1.boxes[3].frames[0].history.at(-1).action,'move');
 assert.equal(deps.S.auditLog.at(-1).type,'frames_moved_batch');
 const saved=JSON.parse(persistedSnapshot);
 assert.equal(saved.aiMessages[0].commandStatus,'applied');
 assert.deepEqual(saved.layouts.h1.boxes[3].frames.map(frame=>frame.frameId),['A']);
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


test('inspection parser recognizes common Russian beekeeping count synonyms and preserves evidence',()=>{
  const parse=loadFunction('extractInspectionFieldsFromText');
  const result=parse('Осмотр: пчёлами занято 5 рамок, расплод на 3 рамках, свободной суши 2 рамки.');
  assert.deepEqual(result.fields,{occupancy:5,broodFrames:3,freeDrawn:2});
  assert.equal(result.fieldCount,3);
  for(const key of Object.keys(result.fields))assert.match(result.evidence[key],/рам/);
  const alternate=parse('Осмотр: 4 рамки обсижены пчёлами, 2 рамки с расплодом.');
  assert.equal(alternate.fields.occupancy,4);
  assert.equal(alternate.fields.broodFrames,2);
});

test('inspection parser handles explicit queen, eggs, brood and queen-cell findings',()=>{
  const parse=loadFunction('extractInspectionFieldsFromText');
  const result=parse('Проверил улей: матка не обнаружена, свежие яйца есть, сплошной ровный расплод, роевых маточников нет.');
  assert.deepEqual(result.fields,{queen:'eggs',eggs:'yes',broodPattern:'solid'});
  const negative=parse('Осмотрел семью: матку не видел, свежих яиц нет, расплода нет, маточников нет, роевых признаков нет.');
  assert.deepEqual(negative.fields,{queen:'notSeen',eggs:'no',broodPattern:'none',queenCells:'none',swarmSigns:'none'});
});

test('inspection parser leaves hedged and approximate observations unfilled',()=>{
  const parse=loadFunction('extractInspectionFieldsFromText');
  const result=parse('Возможно, занято 5 рамок; кажется, матка есть; примерно 3 рамки с расплодом.');
  assert.deepEqual(result.fields,{});
  assert.equal(result.fieldCount,0);
  const uncertain=parse('Осмотрел семью, возможно матка обнаружена.');
  assert.equal(uncertain.type,'Осмотр');
  assert.equal(uncertain.fields.queen,undefined);
});

test('inspection parser does not infer absent values or accept counts outside 0–6',()=>{
  const parse=loadFunction('extractInspectionFieldsFromText');
  const result=parse('Осмотр: занято 7 рамок, расплод на 10 рамках, свободных отстроенных рамок — 8.');
  assert.deepEqual(result.fields,{});
  assert.equal(result.fieldCount,0);
  const sparse=parse('Осмотрел семью. Состояние матки и расплода не оценивал.');
  assert.deepEqual(sparse.fields,{});
  assert.equal(sparse.type,'Осмотр');
});

test('inspection parser recognizes queen cells by type without confusing them with swarm signs',()=>{
  const parse=loadFunction('extractInspectionFieldsFromText');
  const result=parse('Осмотр: обнаружены свищевые маточники, несколько признаков роевого состояния.');
  assert.deepEqual(result.fields,{queenCells:'emergency',swarmSigns:'several'});
});

test('inspection parser handles colloquial frame counts and shortened beekeeping wording',()=>{
  const parse=loadFunction('extractInspectionFieldsFromText');
  const result=parse('Осмотр: пчёлы на 5 рамках; расплода на 3-х рамках; суши свободной — 2.');
  assert.deepEqual(result.fields,{occupancy:5,broodFrames:3,freeDrawn:2});
  assert.equal(result.fieldCount,3);
  const alternate=parse('Пчёлами занято 4 рамки, 2 рамки обсижены пчёлами.');
  assert.equal(alternate.fields.occupancy,undefined);
  const common=parse('5 рамок обсижены пчёлами; расплода 3 рамки.');
  assert.equal(common.fields.occupancy,5);
  assert.equal(common.fields.broodFrames,3);
});

test('inspection parser scopes negatives and positives to separate clauses',()=>{
  const parse=loadFunction('extractInspectionFieldsFromText');
  const result=parse('Осмотр: матки не видел, яйца есть; расплода нет, но свежие яйца обнаружены; маточников нет, но есть один роевой признак.');
  assert.equal(result.fields.queen,'eggs');
  assert.equal(result.fields.eggs,'yes');
  assert.equal(result.fields.broodPattern,'none');
  assert.equal(result.fields.queenCells,'none');
  assert.equal(result.fields.swarmSigns,'one');
  const opposite=parse('Роевых признаков нет, маточники обнаружены.');
  assert.equal(opposite.fields.swarmSigns,'none');
  assert.equal(opposite.fields.queenCells,'unknown');
});

test('inspection parser rejects contradictory values for the same field',()=>{
  const parse=loadFunction('extractInspectionFieldsFromText');
  const result=parse('Матка не найдена, но матка есть; расплода нет, расплод ровный; занято 5 рамок, затем 4 рамки обсижены.');
  assert.equal(result.fields.queen,undefined);
  assert.equal(result.fields.broodPattern,undefined);
  assert.equal(result.fields.occupancy,undefined);
  assert.equal(result.fieldCount,0);
});

test('inspection parser ignores uncertainty only in the clause where it occurs',()=>{
  const parse=loadFunction('extractInspectionFieldsFromText');
  const result=parse('Возможно, занято 5 рамок; матка обнаружена; свежие яйца есть.');
  assert.deepEqual(result.fields,{queen:'seen',eggs:'yes'});
  assert.equal(result.fieldCount,2);
  const allUncertain=parse('Пчёлы занимают около 5 рамок; матка вроде бы есть.');
  assert.deepEqual(allUncertain.fields,{});
});

test('inspection parser accepts only explicit count values within physical frame capacity',()=>{
  const parse=loadFunction('extractInspectionFieldsFromText');
  for(const value of [0,1,2,3,4,5,6]){
    const result=parse('Осмотр: занято '+value+' рамок.');
    assert.equal(result.fields.occupancy,value);
  }
  const invalid=parse('Осмотр: занято 7 рамок.');
  assert.equal(invalid.fields.occupancy,undefined);
});

test('journal draft from AI workspace maps explicit inspection values and keeps an editable source note',()=>{
  const alerts=[],tabs=[],nodes={
    aiJournalHiveSelect:{value:'hive-1'},
    aiJournalDraftInput:{value:' Осмотрел семью: матка обнаружена, свежие яйца есть, пчёлами занято 5 рамок. '},
    rtype:{value:''},rtext:{value:''},recordTitle:{textContent:''},
    roccupancy:{value:''},rbrood:{value:''},rdrawn:{value:''},
    rqueen:{value:''},reggs:{value:''},rbroodPattern:{value:''},rqueenCells:{value:''},rswarmSigns:{value:''},
    aiJournalExtractNotice:{textContent:'',style:{display:'none'}}
  };
  const state={hives:[{id:'hive-1'}],records:[]};
  let opened=false,toggled=false;
  const prepare=loadFunction('prepareJournalDraftFromAI',{
    S:state,activeJournalHive:'',
    $:id=>nodes[id]||{value:''},
    alert:message=>alerts.push(message),
    showTab:tab=>tabs.push(tab),
    newRecord:()=>{opened=true},
    toggleOccupancy:()=>{toggled=true},
    extractInspectionFieldsFromText:loadFunction('extractInspectionFieldsFromText')
  });
  prepare();
  assert.equal(opened,true);
  assert.equal(toggled,true);
  assert.deepEqual(tabs,['journal']);
  assert.equal(nodes.rtype.value,'Осмотр');
  assert.equal(nodes.roccupancy.value,'5');
  assert.equal(nodes.rqueen.value,'seen');
  assert.equal(nodes.reggs.value,'yes');
  assert.equal(nodes.rtext.value,'Осмотрел семью: матка обнаружена, свежие яйца есть, пчёлами занято 5 рамок.');
  assert.match(nodes.aiJournalExtractNotice.textContent,/заполнено полей 3/);
  assert.equal(nodes.aiJournalExtractNotice.style.display,'block');
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


test('confirmed AI frame move rolls back the in-memory draft when persistence fails',async()=>{
  const message={commandStatus:'pending',commandProposal:{schemaVersion:1,kind:'move_frames',moves:[{hiveId:'h1',frameId:'A',toBox:'3'}]},commandPlan:{moves:[{frameId:'A',fromBox:'1',toBox:'3'}]}};
  const state={aiMessages:[message],meta:{revisionId:'rev-1'}};
  const deps={
    S:state,confirm:()=>true,aiCommandContextIsCurrent:()=>true,
    revalidateAICommandPreview:()=>({ok:true,plan:{moves:[{frameId:'A'}]}}),
    applyFrameMovePlan:()=>({ok:true,state:{aiMessages:[message],changed:true,meta:{revisionId:'rev-2'}},moves:[]}),
    frameLocationName:box=>box,today:()=> '2026-11-12',
    save:async()=>{deps.S.meta.saveError='Конфликт сохранения';return false},renderAIChat:()=>{}
  };
  const confirmMove=loadFunction('confirmAICommand',deps);
  await confirmMove(0);
  assert.equal(deps.S,state,'the original in-memory state must be restored');
  assert.equal(deps.S.changed,undefined);
  assert.equal(deps.S.meta.saveError,'Конфликт сохранения');
  assert.equal(message.commandStatus,'save_failed');
  assert.match(message.commandError,/Операция отменена в текущей модели/);
  await confirmMove(0);
  assert.equal(message.commandStatus,'save_failed','a failed command must not be confirmed again');
});

test('confirmed AI frame move is marked applied only after persistence succeeds',async()=>{
  const message={commandStatus:'pending',commandProposal:{schemaVersion:1,kind:'move_frames',moves:[{hiveId:'h1',frameId:'A',toBox:'3'}]},commandPlan:{moves:[{frameId:'A',fromBox:'1',toBox:'3'}]}};
  const confirmMove=loadFunction('confirmAICommand',{
    S:{aiMessages:[message]},confirm:()=>true,aiCommandContextIsCurrent:()=>true,
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

test('task draft validator accepts a valid task and rejects impossible dates, missing hives and invalid types',()=>{
 const validate=loadFunction('validateTaskDraft');
 const state={hives:[{id:'h1'}],tasks:[]};
 assert.equal(validate({id:'t1',hive:'h1',type:'Осмотр',date:'2024-02-29',note:'Проверить'},state).ok,true);
 const bad=validate({id:'t2',hive:'missing',type:'Неизвестно',date:'2026-02-30',note:'x'},state);
 for(const code of ['task_invalid_type','task_invalid_date','task_hive_missing'])assert.ok(bad.errors.some(error=>error.code===code));
});

test('task draft validator prevents duplicate IDs and oversized notes',()=>{
 const validate=loadFunction('validateTaskDraft');
 const state={hives:[{id:'h1'}],tasks:[{id:'existing'}]};
 const bad=validate({id:'existing',hive:'h1',type:'Другое',date:'2026-11-12',note:'x'.repeat(3001)},state);
 assert.ok(bad.errors.some(error=>error.code==='task_duplicate_id'));
 assert.ok(bad.errors.some(error=>error.code==='task_invalid_note'));
 assert.equal(validate({id:'existing',hive:'h1',type:'Другое',date:'2026-11-12',note:'ok'},state,state.tasks[0]).ok,true);
});

test('task completion validator prevents closing a task twice or without its hive',()=>{
 const validate=loadFunction('validateTaskCompletion');
 const state={hives:[{id:'h1'}],tasks:[{id:'t1',hive:'h1',type:'Осмотр',status:'pending'}],records:[]};
 assert.equal(validate(state,'t1','2026-11-12','r1').ok,true);
 state.records.push({id:'r1',taskId:'t1'});
 assert.ok(validate(state,'t1','2026-11-12','r2').errors.some(error=>error.code==='task_already_recorded'));
 state.tasks[0].status='done';state.records=[];
 assert.ok(validate(state,'t1','2026-11-12','r3').errors.some(error=>error.code==='task_not_active'));
 state.tasks[0].status='pending';state.tasks[0].hive='missing';
 assert.ok(validate(state,'t1','2026-11-12','r4').errors.some(error=>error.code==='task_hive_missing'));
});

test('task completion validator rejects invalid dates and duplicate journal record IDs',()=>{
 const validate=loadFunction('validateTaskCompletion');
 const state={hives:[{id:'h1'}],tasks:[{id:'t1',hive:'h1',type:'Осмотр',status:'pending'}],records:[{id:'taken'}]};
 const result=validate(state,'t1','2026-02-30','taken');
 assert.ok(result.errors.some(error=>error.code==='task_completion_invalid_date'));
 assert.ok(result.errors.some(error=>error.code==='task_completion_duplicate_record'));
});

test('completeTask rolls back task, journal and audit changes when persistence fails',async()=>{
 const task={id:'t1',hive:'h1',type:'Осмотр',status:'pending',note:'Осмотр'};
 const state={hives:[{id:'h1'}],tasks:[task],records:[],auditLog:[],snapshots:[],meta:{revisionId:'rev-old'}};
 let renders=0;
 const complete=loadFunction('completeTask',{
  S:state,uid:()=> 'record-1',today:()=> '2026-11-12',
  validateTaskCompletion:loadFunction('validateTaskCompletion'),
  logAudit:(type,details)=>state.auditLog.push({type,...details}),
  save:async()=>{state.meta.saveError='Не сохранено';return false},
  render:()=>{renders++},alert:()=>{}
 });
 const result=await complete('t1');
 assert.equal(result,false);
 assert.equal(task.status,'pending');
 assert.equal(task.completedRecordId,undefined);
 assert.equal(state.records.length,0);
 assert.equal(state.auditLog.length,0);
 assert.equal(state.snapshots.length,0);
 assert.equal(state.meta.saveError,'Не сохранено');
 assert.equal(renders,1);
});

test('completeTask persists one linked journal record and blocks a repeated completion',async()=>{
 const task={id:'t1',hive:'h1',type:'Осмотр',status:'pending',note:'Осмотр'};
 const state={hives:[{id:'h1'}],tasks:[task],records:[],auditLog:[],snapshots:[],meta:{}};
 let saves=0;
 const complete=loadFunction('completeTask',{
  S:state,uid:()=> 'record-1',today:()=> '2026-11-12',
  validateTaskCompletion:loadFunction('validateTaskCompletion'),
  logAudit:(type,details)=>state.auditLog.push({type,...details}),
  save:async()=>{saves++;return true},render:()=>{},alert:()=>{}
 });
 assert.equal(await complete('t1'),true);
 assert.equal(task.status,'done');
 assert.equal(task.completedRecordId,'record-1');
 assert.equal(state.records.length,1);
 assert.equal(state.records[0].taskId,'t1');
 assert.equal(state.auditLog.length,1);
 await complete('t1');
 assert.equal(saves,1);
 assert.equal(state.records.length,1);
});

test('AI task planner requires real source records belonging to the selected hive',()=>{
 const validate=loadFunction('validateAITaskSuggestionProposal',{aiStableSnapshot:loadFunction('aiStableSnapshot')});
 const state={hives:[{id:'h1'}],records:[{id:'r1',hive:'h1',date:'2026-11-10',type:'Осмотр',text:'Матка не обнаружена'}],tasks:[]};
 const base={schemaVersion:1,kind:'suggest_tasks',suggestions:[{hiveId:'h1',type:'Проверка матки',date:null,note:'Провести повторную проверку матки.',rationale:'В записи осмотра указано, что матка не обнаружена.',sourceRecordIds:['r1']}]};
 const good=validate(state,base);
 assert.equal(good.status,'ready_for_preview');
 assert.equal(good.plan.suggestions[0].date,null);
 assert.equal(good.plan.suggestions[0].evidence[0].id,'r1');
 const fabricated=structuredClone(base);fabricated.suggestions[0].sourceRecordIds=['invented'];
 assert.equal(validate(state,fabricated).errors[0].code,'ai_task_evidence_not_found_or_mismatched');
 const wrongHive=structuredClone(base);wrongHive.suggestions[0].hiveId='h2';
 assert.equal(validate(state,wrongHive).errors[0].code,'ai_task_hive_missing');
});
test('AI task planner rejects invalid dates and duplicate active or repeated suggestions',()=>{
 const validate=loadFunction('validateAITaskSuggestionProposal',{aiStableSnapshot:loadFunction('aiStableSnapshot')});
 const base={schemaVersion:1,kind:'suggest_tasks',suggestions:[{hiveId:'h1',type:'Осмотр',date:'2026-02-30',note:'Повторный осмотр.',rationale:'Основание из журнала.',sourceRecordIds:['r1']}]};
 const state={hives:[{id:'h1'}],records:[{id:'r1',hive:'h1',date:'2026-11-10',type:'Осмотр'}],tasks:[]};
 assert.equal(validate(state,base).errors[0].code,'ai_task_invalid_date');
 const duplicate={...base,suggestions:[{...base.suggestions[0],date:null},{...base.suggestions[0],date:null}]};
 assert.equal(validate(state,duplicate).errors[0].code,'ai_task_duplicate_in_proposal');
 const active={...state,tasks:[{hive:'h1',type:'Осмотр',status:'pending'}]};
 assert.equal(validate(active,{...duplicate,suggestions:[{...duplicate.suggestions[0],date:null}]}).errors[0].code,'ai_task_duplicate_active');
});
test('AI task preview becomes stale when its source journal record changes',()=>{
 const validate=loadFunction('validateAITaskSuggestionProposal',{aiStableSnapshot:loadFunction('aiStableSnapshot')});
 const revalidate=loadFunction('revalidateAITaskSuggestionPreview',{validateAITaskSuggestionProposal:validate,aiStableSnapshot:loadFunction('aiStableSnapshot')});
 const state={hives:[{id:'h1'}],records:[{id:'r1',hive:'h1',date:'2026-11-10',type:'Осмотр',text:'Исходное наблюдение'}],tasks:[]};
 const proposal={schemaVersion:1,kind:'suggest_tasks',suggestions:[{hiveId:'h1',type:'Проверка матки',date:null,note:'Проверить.',rationale:'По записи.',sourceRecordIds:['r1']}]};
 const plan=validate(state,proposal).plan;
 assert.equal(revalidate(state,proposal,plan).ok,true);
 state.records[0].text='Изменённое наблюдение';
 assert.equal(revalidate(state,proposal,plan).status,'stale');
});
test('AI task suggestions are not added until the explicit draft-apply step',()=>{
 const validateDraft=loadFunction('validateTaskDraft');
 const stable=loadFunction('aiStableSnapshot');
 const validate=loadFunction('validateAITaskSuggestionProposal',{aiStableSnapshot:stable});
 const revalidate=loadFunction('revalidateAITaskSuggestionPreview',{validateAITaskSuggestionProposal:validate});
 const apply=loadFunction('applyAITaskSuggestionsToDraft',{validateTaskDraft:validateDraft,revalidateAITaskSuggestionPreview:revalidate});
 const state={hives:[{id:'h1'}],records:[{id:'r1',hive:'h1',date:'2026-11-10',type:'Осмотр'}],tasks:[],auditLog:[],meta:{revisionId:'rev-1'}};
 const proposal={schemaVersion:1,kind:'suggest_tasks',suggestions:[{hiveId:'h1',type:'Осмотр',date:null,note:'Повторно проверить.',rationale:'Есть основание.',sourceRecordIds:['r1']}]};
 const plan=validate(state,proposal).plan;
 assert.equal(state.tasks.length,0);
 const result=apply(state,plan,(()=>{let n=0;return()=> 'new-'+(++n)})(),'2026-11-12T12:00:00.000Z');
 assert.equal(state.tasks.length,0);
 assert.equal(result.ok,true);
 assert.equal(result.state.tasks.length,1);
 assert.equal(result.state.tasks[0].status,'suggested');
 assert.equal(result.state.tasks[0].date,null);
 assert.deepEqual(result.state.tasks[0].aiSourceRecordIds,['r1']);
 assert.equal(result.state.auditLog[0].type,'ai_task_suggestions_created');
});
test('AI suggested tasks may remain undated until the user accepts them',()=>{
 const validate=loadFunction('validateTaskDraft');
 const state={hives:[{id:'h1'}],tasks:[]};
 assert.equal(validate({id:'t1',hive:'h1',type:'Осмотр',date:null,note:'Проверить',source:'ai',status:'suggested'},state).ok,true);
 assert.equal(validate({id:'t2',hive:'h1',type:'Осмотр',date:null,note:'Проверить',source:'manual',status:'pending'},state).ok,false);
});

test('AI suggested task cannot be accepted without a user-selected date',async()=>{
 const task={id:'t1',hive:'h1',type:'Осмотр',date:null,status:'suggested',source:'ai'};
 const state={tasks:[task],hives:[{id:'h1'}],auditLog:[],snapshots:[],meta:{}};
 let saves=0;
 const accept=loadFunction('acceptTask',{S:state,prompt:()=>null,alert:()=>{},save:async()=>{saves++;return true},logAudit:(type,details)=>state.auditLog.push({type,...details}),render:()=>{}});
 await accept('t1');
 assert.equal(task.status,'suggested');
 assert.equal(task.date,null);
 assert.equal(saves,0);
});

test('AI task planner rejects repeated task type for one hive even with different evidence',()=>{
 const validate=loadFunction('validateAITaskSuggestionProposal',{aiStableSnapshot:loadFunction('aiStableSnapshot')});
 const state={hives:[{id:'h1'}],records:[{id:'r1',hive:'h1',date:'2026-11-10',type:'Осмотр'},{id:'r2',hive:'h1',date:'2026-11-11',type:'Осмотр'}],tasks:[]};
 const item={hiveId:'h1',type:'Осмотр',date:null,note:'Провести осмотр.',rationale:'Есть основание.',sourceRecordIds:['r1']};
 const result=validate(state,{schemaVersion:1,kind:'suggest_tasks',suggestions:[item,{...item,sourceRecordIds:['r2']}]});
 assert.equal(result.errors[0].code,'ai_task_duplicate_in_proposal');
});
test('AI task evidence fingerprint detects structured field changes, not only text',()=>{
 const validate=loadFunction('validateAITaskSuggestionProposal',{aiStableSnapshot:loadFunction('aiStableSnapshot')});
 const revalidate=loadFunction('revalidateAITaskSuggestionPreview',{validateAITaskSuggestionProposal:validate});
 const state={hives:[{id:'h1'}],records:[{id:'r1',hive:'h1',date:'2026-11-10',type:'Осмотр',queen:'seen',text:''}],tasks:[],meta:{revisionId:'rev-1'}};
 const proposal={schemaVersion:1,kind:'suggest_tasks',suggestions:[{hiveId:'h1',type:'Проверка матки',date:null,note:'Повторно проверить.',rationale:'По данным осмотра.',sourceRecordIds:['r1']}]};
 const plan=validate(state,proposal).plan;
 state.records[0].queen='notSeen';
 assert.equal(revalidate(state,proposal,plan).status,'stale');
});
test('AI command context fingerprint ignores save metadata but detects domain changes',()=>{
 const fingerprint=loadFunction('aiCommandContextFingerprint',{S:{},aiStableSnapshot:loadFunction('aiStableSnapshot')});
 const current=loadFunction('aiCommandContextIsCurrent',{aiCommandContextFingerprint:fingerprint});
 const state={hives:[{id:'h1'}],families:[],layouts:{h1:{}},records:[{id:'r1',hive:'h1',date:'2026-11-10',type:'Осмотр',queen:'seen'}],tasks:[],extractions:[],meta:{revisionId:'rev-1'}};
 const message={commandContextFingerprint:fingerprint(state)};
 state.meta.revisionId='rev-2';
 assert.equal(current(state,message),true);
 state.records[0].queen='notSeen';
 assert.equal(current(state,message),false);
});
test('AI task evidence with duplicate active journal IDs is rejected as ambiguous',()=>{
 const validate=loadFunction('validateAITaskSuggestionProposal',{aiStableSnapshot:loadFunction('aiStableSnapshot')});
 const state={hives:[{id:'h1'}],records:[{id:'r1',hive:'h1',date:'2026-11-10',type:'Осмотр'},{id:'r1',hive:'h1',date:'2026-11-11',type:'Осмотр'}],tasks:[]};
 const proposal={schemaVersion:1,kind:'suggest_tasks',suggestions:[{hiveId:'h1',type:'Осмотр',date:null,note:'Проверить.',rationale:'Есть основание.',sourceRecordIds:['r1']}]};
 assert.equal(validate(state,proposal).errors[0].code,'ai_task_evidence_not_found_or_mismatched');
});
test('AI task apply rejects stale/tampered plans and generated duplicate IDs atomically',()=>{
 const validateDraft=loadFunction('validateTaskDraft');
 const stable=loadFunction('aiStableSnapshot');
 const validate=loadFunction('validateAITaskSuggestionProposal',{aiStableSnapshot:stable});
 const revalidate=loadFunction('revalidateAITaskSuggestionPreview',{validateAITaskSuggestionProposal:validate});
 const apply=loadFunction('applyAITaskSuggestionsToDraft',{validateTaskDraft:validateDraft,revalidateAITaskSuggestionPreview:revalidate});
 const state={hives:[{id:'h1'}],records:[{id:'r1',hive:'h1',date:'2026-11-10',type:'Осмотр'}],tasks:[],auditLog:[],meta:{revisionId:'rev-1'}};
 const proposal={schemaVersion:1,kind:'suggest_tasks',suggestions:[{hiveId:'h1',type:'Осмотр',date:null,note:'Проверить.',rationale:'По записи.',sourceRecordIds:['r1']}]};
 const plan=validate(state,proposal).plan;
 const tampered={...plan,suggestions:plan.suggestions.map(x=>({...x,note:'подменено после проверки'}))};
 assert.equal(apply(state,tampered,()=> 'id-1','2026-11-12T12:00:00Z').ok,false);
 assert.equal(state.tasks.length,0);
 assert.equal(apply(state,plan,()=> 'same-id','2026-11-12T12:00:00Z').ok,false);
 assert.equal(state.tasks.length,0);
});


function rawBackupFixture(){
 return {hives:[],families:[],records:[],tasks:[],extractions:[],layouts:{}};
}
function inspectRawBackup(state){
 const inspectFamilyLineage=loadFunction('inspectFamilyLineage');
 const inspectTaskIntegrity=loadFunction('inspectTaskIntegrity');
 return loadFunction('validateRawBackupIntegrity',{inspectFamilyLineage,inspectTaskIntegrity})(state);
}

test('backup shape validator accepts a minimal valid empty apiary',()=>{
 const validate=loadFunction('validateBackupState');
 const state=rawBackupFixture();
 assert.equal(validate(state),state);
});
test('backup shape validator rejects malformed journal media and nested box data',()=>{
 const validate=loadFunction('validateBackupState');
 assert.throws(()=>validate({...rawBackupFixture(),records:[{id:'r1',media:'not-an-array'}]}),/вложений записи журнала/i);
 assert.throws(()=>validate({...rawBackupFixture(),layouts:{h1:{boxes:{1:{frames:'not-an-array'}}}}}),/гнездовые корпуса/i);
 assert.throws(()=>validate({...rawBackupFixture(),layouts:{h1:{honeyFrames:[[], 'bad']}}}),/медовые рамки/i);
});
test('raw backup integrity rejects duplicate hive identity and number',()=>{
 const state={...rawBackupFixture(),hives:[{id:'h1',number:1},{id:'h1',number:1}]};
 const result=inspectRawBackup(state);
 assert.ok(result.errors.some(error=>error.code==='duplicate_hive_id'));
 assert.ok(result.errors.some(error=>error.code==='duplicate_hive_number'));
});
test('raw backup integrity rejects duplicate frame IDs and mismatched physical locations',()=>{
 const state={
  ...rawBackupFixture(),hives:[{id:'h1',number:1}],
  layouts:{h1:{mode:'summer',installedBoxes:[1,2],boxes:{
   1:{frames:[{frameId:'f1',location:'2',history:[]}]},
   2:{frames:[{frameId:'f1',location:'2',history:[]}]}
  },honeyFrames:[[],[]]}}
 };
 const result=inspectRawBackup(state);
 assert.ok(result.errors.some(error=>error.code==='duplicate_frame_id'));
 assert.ok(result.errors.some(error=>error.code==='frame_location_mismatch'));
});
test('raw backup integrity rejects forbidden winter family placement',()=>{
 const state={
  ...rawBackupFixture(),hives:[{id:'h1',number:1}],
  families:[{id:'fam',hive:'h1',box:2}],
  layouts:{h1:{mode:'winter',installedBoxes:[1,2,3],winterOrder:[1,2,3],boxes:{2:{family:'fam',frames:[]}}}}
 };
 const result=inspectRawBackup(state);
 assert.ok(result.errors.some(error=>error.code==='family_in_forbidden_winter_box'));
 assert.ok(result.errors.some(error=>error.code==='winter_requires_three_allowed_boxes'));
});
test('raw backup integrity rejects dangling task and journal links',()=>{
 const state={
  ...rawBackupFixture(),hives:[{id:'h1',number:1}],
  records:[{id:'r1',hive:'missing-hive',taskId:'missing-task'}],
  tasks:[{id:'t1',hive:'missing-hive',completedRecordId:'missing-record'}]
 };
 const result=inspectRawBackup(state);
 assert.ok(result.errors.some(error=>error.code==='record_hive_missing'));
 assert.ok(result.errors.some(error=>error.code==='record_task_link_missing'));
 assert.ok(result.errors.some(error=>error.code==='task_hive_missing'));
 assert.ok(result.errors.some(error=>error.code==='task_completion_record_missing'));
});
test('raw backup assertion rejects invalid source data without rewriting it',()=>{
 const state={...rawBackupFixture(),hives:[{id:'h1',number:1},{id:'h1',number:2}]};
 const before=JSON.stringify(state);
 const validateRawBackupIntegrity=state=>inspectRawBackup(state);
 const assertIntegrity=loadFunction('assertRawBackupIntegrity',{validateRawBackupIntegrity});
 assert.throws(()=>assertIntegrity(state),/Архив не прошёл проверку исходных данных/);
 assert.equal(JSON.stringify(state),before);
});


function taskSuggestionCommandFixture(){
 const suggestion={hiveId:'h1',type:'Осмотр',date:null,note:'Повторно проверить.',rationale:'Есть исходная запись.',sourceRecordIds:['r1']};
 const message={role:'assistant',content:'Предлагаю задачу.',commandStatus:'pending',commandProposal:{schemaVersion:1,kind:'suggest_tasks',suggestions:[suggestion]},commandPlan:{kind:'suggest_tasks',suggestions:[suggestion]}};
 return {hives:[{id:'h1',number:7}],records:[{id:'r1',hive:'h1',date:'2026-11-10',type:'Осмотр'}],tasks:[],auditLog:[],aiMessages:[message],meta:{revisionId:'rev-1'}};
}
test('AI task suggestion confirmation persists suggested tasks and audit exactly once',async()=>{
 const state=taskSuggestionCommandFixture();
 const message=state.aiMessages[0];
 let saves=0,renders=0,savedState=null;
 const deps={
  S:state,confirm:()=>true,aiCommandContextIsCurrent:()=>true,
  revalidateAICommandPreview:(current,proposal,plan)=>({ok:true,plan}),
  applyAITaskSuggestionsToDraft:(current,plan)=>{const draft=structuredClone(current);draft.tasks.push({id:'task-1',hive:'h1',status:'suggested',date:null});draft.auditLog.push({id:'audit-1',type:'ai_task_suggestions_created'});return {ok:true,state:draft}},
  uid:()=> 'generated-id',
  save:async()=>{saves++;savedState=deps.S;return true},
  renderAIChat:()=>{renders++}
 };
 await loadFunction('confirmAICommand',deps)(0);
 assert.equal(saves,1);
 assert.equal(renders,1);
 assert.equal(deps.S.tasks.length,1);
 assert.equal(deps.S.tasks[0].status,'suggested');
 assert.equal(deps.S.aiMessages[0].commandStatus,'applied');
 assert.ok(deps.S.aiMessages[0].appliedAt);
 assert.equal(deps.S.auditLog[0].type,'ai_task_suggestions_created');
 assert.equal(savedState,deps.S);
 assert.equal(message.commandStatus,'pending','the previous snapshot is not mutated by draft application');
});
test('AI task suggestion confirmation rolls back the in-memory draft when persistence fails',async()=>{
 const state=taskSuggestionCommandFixture();
 const message=state.aiMessages[0];
 const deps={
  S:state,confirm:()=>true,aiCommandContextIsCurrent:()=>true,
  revalidateAICommandPreview:(current,proposal,plan)=>({ok:true,plan}),
  applyAITaskSuggestionsToDraft:(current)=>{const draft=structuredClone(current);draft.tasks.push({id:'task-1',hive:'h1',status:'suggested'});draft.auditLog.push({id:'audit-1',type:'ai_task_suggestions_created'});return {ok:true,state:draft}},
  uid:()=> 'generated-id',
  save:async()=>{deps.S.meta.saveError='Ошибка записи';return false},
  renderAIChat:()=>{}
 };
 await loadFunction('confirmAICommand',deps)(0);
 assert.equal(deps.S,state);
 assert.equal(deps.S.tasks.length,0);
 assert.equal(deps.S.meta.saveError,'Ошибка записи');
 assert.equal(message.commandStatus,'save_failed');
 assert.match(message.commandError,/исходные данные не изменены/);
});


test('raw backup integrity accepts a valid family placed in its physical brood box',()=>{
 const state={
  ...rawBackupFixture(),
  hives:[{id:'h1',number:1}],
  families:[{id:'fam-1',hive:'h1',box:1,origin:'swarm'}],
  layouts:{h1:{mode:'summer',installedBoxes:[1],boxes:{1:{family:'fam-1',frames:[]}},honeyFrames:[[],[]]}}
 };
 const result=inspectRawBackup(state);
 assert.equal(result.errorCount,0,JSON.stringify(result.errors));
});


test('raw backup integrity rejects frames without IDs before restore',()=>{
 const state={
  ...rawBackupFixture(),hives:[{id:'h1',number:1}],
  layouts:{h1:{mode:'summer',installedBoxes:[1],boxes:{1:{frames:[{location:1,history:[]}]}},honeyFrames:[[],[]]}}
 };
 const result=inspectRawBackup(state);
 assert.ok(result.errors.some(error=>error.code==='missing_frame_id'));
});
test('raw backup integrity rejects invalid family lifecycle fields',()=>{
 const state={
  ...rawBackupFixture(),hives:[{id:'h1',number:1}],
  families:[{id:'fam-1',hive:'h1',origin:'swarm',stage:'developing',box:null}],
  layouts:{h1:{mode:'summer',installedBoxes:[],boxes:{},honeyFrames:[[],[]]}}
 };
 const result=inspectRawBackup(state);
 assert.ok(result.errors.some(error=>error.code==='invalid_non_offshoot_stage'));
});

test('raw backup integrity accepts a valid establishment date for an independent offshoot',()=>{
 const state={
  ...rawBackupFixture(),hives:[{id:'h1',number:1}],
  families:[{id:'fam-1',hive:'h1',origin:'offshoot',stage:'independent',establishedAt:'2026-05-03',parentFamilyId:'archived-parent',parentFamilySnapshot:{id:'archived-parent'},box:null}],
  layouts:{h1:{mode:'summer',installedBoxes:[],boxes:{},honeyFrames:[[],[]]}}
 };
 const result=inspectRawBackup(state);
 assert.equal(result.errorCount,0,JSON.stringify(result.errors));
});

test('raw backup integrity rejects impossible calendar dates for independent offshoots',()=>{
 const state={
  ...rawBackupFixture(),hives:[{id:'h1',number:1}],
  families:[{id:'fam-1',hive:'h1',origin:'offshoot',stage:'independent',establishedAt:'2026-02-30',parentFamilyId:'archived-parent',parentFamilySnapshot:{id:'archived-parent'},box:null}],
  layouts:{h1:{mode:'summer',installedBoxes:[],boxes:{},honeyFrames:[[],[]]}}
 };
 const result=inspectRawBackup(state);
 assert.ok(result.errors.some(error=>error.code==='invalid_family_established_date'));
});

test('inspection text extraction maps only explicit observations to structured fields',()=>{
 const extract=loadFunction('extractInspectionFieldsFromText');
 const result=extract('Осмотр: пчёлами занято 5 рамок; расплода на 4 рамках; 2 свободные отстроенные рамки; матка обнаружена; свежие яйца есть; расплод ровный; роевые маточники; несколько признаков роевого состояния.');
 assert.equal(result.type,'Осмотр');
 assert.deepEqual(result.fields,{occupancy:5,broodFrames:4,freeDrawn:2,queen:'seen',eggs:'yes',broodPattern:'solid',queenCells:'swarm',swarmSigns:'several'});
 assert.equal(result.fieldCount,8);
 assert.equal(Object.keys(result.evidence).length,8);
});

test('inspection text extraction leaves unspecified and ambiguous observations empty',()=>{
 const extract=loadFunction('extractInspectionFieldsFromText');
 const result=extract('Осмотрел семью. Матка, возможно, есть; яйца вроде бы видел; расплод выглядит нормально.');
 assert.equal(result.type,'Осмотр');
 assert.deepEqual(result.fields,{});
 assert.equal(result.fieldCount,0);
});

test('inspection text extraction preserves explicit negative and alternative observations',()=>{
 const extract=loadFunction('extractInspectionFieldsFromText');
 const result=extract('Матка не обнаружена, свежих яиц нет, расплода нет, маточники не обнаружены, роевых признаков не обнаружено.');
 assert.deepEqual(result.fields,{queen:'notSeen',eggs:'no',broodPattern:'none',queenCells:'none',swarmSigns:'none'});
});

test('inspection text extraction rejects frame counts outside the six-frame brood box',()=>{
 const extract=loadFunction('extractInspectionFieldsFromText');
 const result=extract('Занято 8 рамок, расплода на 7 рамках, 9 свободных отстроенных рамок.');
 assert.deepEqual(result.fields,{});
});



test('hive profile catalog resolves legacy hives to the preserved Farrar profile',()=>{
  const clone=loadFunction('cloneHiveProfile');
  const getProfile=loadFunction('getHiveProfile',{cloneHiveProfile:clone,HIVE_PROFILE_CATALOG:{
    'farrar-6x6-v1':{id:'farrar-6x6-v1',schemaVersion:1,family:'farrar',status:'ready',name:'Farrar',frame:{heightMm:180},brood:{boxCount:6,framesPerBox:6,boxKeys:['1','2','3','4','5','6']},honey:{boxCount:2,framesPerBox:10,boxKeys:['H1','H2'],installation:'paired'},winter:{enabled:true,requiredBroodBoxes:3,allowedBoxKeys:['1','3','4','6'],forbiddenBoxKeys:['2','5']}}
  }});
  const profile=getProfile({id:'old-hive'});
  assert.equal(profile.id,'farrar-6x6-v1');
  assert.equal(profile.brood.framesPerBox,6);
   assert.equal(profile.frame.heightMm,180);
  profile.name='Changed copy';
  assert.equal(getProfile({profileId:'farrar-6x6-v1'}).name,'Farrar');
});

test('hive profile validator accepts a complete configurable construction',()=>{
  const validate=loadFunction('validateHiveProfile');
  const profile={id:'custom-v1',schemaVersion:1,status:'ready',name:'Custom',frame:{heightMm:230},brood:{boxCount:3,framesPerBox:10,boxKeys:['B1','B2','B3']},honey:{boxCount:1,framesPerBox:10,boxKeys:['M1'],installation:'independent'},winter:{enabled:true,requiredBroodBoxes:2,allowedBoxKeys:['B1','B2'],forbiddenBoxKeys:['B3']}};
  assert.deepEqual(validate(profile),{ok:true,errors:[]});
});

test('hive profile validator refuses incomplete Dadant and Ruta templates as active configurations',()=>{
  const validate=loadFunction('validateHiveProfile');
  for(const family of ['dadant','ruta']){
    const template={id:family+'-template-v1',schemaVersion:1,family,status:'template',name:family+' setup'};
    assert.equal(validate(template).ok,false);
    assert.ok(validate(template).errors.some(x=>x.code==='profile_requires_configuration'));
    assert.equal(validate(template,{allowTemplate:true}).ok,true);
  }
});

test('hive profile validator rejects mismatched capacities and winter references',()=>{
  const validate=loadFunction('validateHiveProfile');
  const profile={id:'bad-v1',schemaVersion:1,status:'ready',name:'Bad',frame:{heightMm:195},brood:{boxCount:2,framesPerBox:6,boxKeys:['1','2']},honey:{boxCount:1,framesPerBox:10,boxKeys:['H1'],installation:'invalid-mode'},winter:{enabled:true,requiredBroodBoxes:3,allowedBoxKeys:['1','9'],forbiddenBoxKeys:['2']}};
  const result=validate(profile);
  assert.equal(result.ok,false);
  assert.ok(result.errors.some(x=>x.code==='profile_honey_installation_invalid'));
  assert.ok(result.errors.some(x=>x.code==='profile_winter_required_count_invalid'));
  assert.ok(result.errors.some(x=>x.code==='profile_winter_allowed_keys_invalid'));
});

test('profile capabilities expose only validated physical parameters',()=>{
 const validate=loadFunction('validateHiveProfile');
 const clone=loadFunction('cloneHiveProfile');
 const get=loadFunction('getHiveProfileCapabilities',{validateHiveProfile:validate,cloneHiveProfile:clone});
 const profile={id:'custom-v1',schemaVersion:1,status:'ready',name:'Custom',family:'custom',frame:{heightMm:230},brood:{boxCount:3,framesPerBox:10,boxKeys:['B1','B2','B3']},honey:{boxCount:1,framesPerBox:10,boxKeys:['M1'],installation:'independent'},winter:{enabled:true,requiredBroodBoxes:2,allowedBoxKeys:['B1','B2'],forbiddenBoxKeys:['B3'],honeyAllowed:false}};
 const result=get(profile);
 assert.equal(result.ok,true);
 assert.deepEqual(result.broodKeys,['B1','B2','B3']);
 assert.equal(result.broodCapacity,10);
 assert.equal(result.honeyInstallation,'independent');
 assert.equal(result.frameHeightMm,230);
});

test('profile assembly validation enforces profile-specific winter and honey rules',()=>{
 const validateProfile=loadFunction('validateHiveProfile');
 const clone=loadFunction('cloneHiveProfile');
 const get=loadFunction('getHiveProfileCapabilities',{validateHiveProfile:validateProfile,cloneHiveProfile:clone});
 const validate=loadFunction('validateHiveAssemblyProfile',{getHiveProfileCapabilities:get});
 const profile={id:'custom-v1',schemaVersion:1,status:'ready',name:'Custom',family:'custom',frame:{heightMm:230},brood:{boxCount:3,framesPerBox:10,boxKeys:['B1','B2','B3']},honey:{boxCount:1,framesPerBox:10,boxKeys:['M1'],installation:'independent'},winter:{enabled:true,requiredBroodBoxes:2,allowedBoxKeys:['B1','B2'],forbiddenBoxKeys:['B3'],honeyAllowed:false}};
 assert.deepEqual(validate(profile,{mode:'winter',installedBoxes:['B1','B2'],winterOrder:['B1','B2'],honeyBoxInstalled:[false]}),{ok:true,errors:[]});
 const invalid=validate(profile,{mode:'winter',installedBoxes:['B1','B3'],winterOrder:['B1','B3'],honeyBoxInstalled:[true]});
 assert.ok(invalid.errors.some(error=>error.code==='winter_box_not_allowed'));
 assert.ok(invalid.errors.some(error=>error.code==='winter_honey_not_allowed'));
});

test('paired honey configuration rejects partial installation while independent honey permits it',()=>{
 const validateProfile=loadFunction('validateHiveProfile');
 const clone=loadFunction('cloneHiveProfile');
 const get=loadFunction('getHiveProfileCapabilities',{validateHiveProfile:validateProfile,cloneHiveProfile:clone});
 const validate=loadFunction('validateHiveAssemblyProfile',{getHiveProfileCapabilities:get});
 const base={schemaVersion:1,status:'ready',name:'test',frame:{heightMm:195},brood:{boxCount:2,framesPerBox:6,boxKeys:['1','2']},winter:{enabled:false}};
 const paired={...base,id:'paired',honey:{boxCount:2,framesPerBox:10,boxKeys:['H1','H2'],installation:'paired'}};
 const independent={...base,id:'independent',honey:{boxCount:2,framesPerBox:10,boxKeys:['H1','H2'],installation:'independent'}};
 const layout={mode:'summer',installedBoxes:['1'],honeyBoxInstalled:[true,false]};
 assert.ok(validate(paired,layout).errors.some(error=>error.code==='honey_pair_mismatch'));
 assert.equal(validate(independent,layout).ok,true);
});

test('frame move planner uses configured profile keys and capacities',()=>{
 const plan=loadFunction('planFrameMoves');
 const profile={id:'custom-v1',status:'ready',family:'custom',brood:{boxKeys:['B1','B2','B3'],framesPerBox:10},honey:{boxKeys:['M1'],framesPerBox:8,installation:'independent'},winter:{enabled:true,requiredBroodBoxes:2,allowedBoxKeys:['B1','B2'],forbiddenBoxKeys:['B3']}};
 const frame=(id,location)=>({frameId:id,location,history:[]});
 const state={hives:[{id:'custom-hive',profile}],layouts:{'custom-hive':{mode:'summer',installedBoxes:['B1','B2'],honeyBoxInstalled:[true],boxes:{B1:{family:'',frames:[frame('f1','B1')]},B2:{family:'',frames:Array.from({length:9},(_,i)=>frame('b'+i,'B2'))},B3:{family:'',frames:[]}},honeyFrames:[Array.from({length:8},(_,i)=>frame('m'+i,'M1'))]}}};
 const result=plan(state,[{hiveId:'custom-hive',frameId:'f1',fromBox:'B1',toBox:'B2'}]);
 assert.equal(result.ok,true,JSON.stringify(result.errors));
 assert.equal(result.moves[0].toBox,'B2');
 const apply=loadFunction('applyFrameMovePlan',{planFrameMoves:plan});
 const applied=apply(state,result,'2026-11-12');
 assert.equal(applied.ok,true,JSON.stringify(applied.errors));
 assert.equal(applied.state.layouts['custom-hive'].boxes.B1.frames.length,0);
 assert.equal(applied.state.layouts['custom-hive'].boxes.B2.frames.length,10);
 assert.equal(applied.state.layouts['custom-hive'].boxes.B2.frames.at(-1).location,'B2');
 const invalid=plan(state,[{hiveId:'custom-hive',frameId:'f1',fromBox:'B1',toBox:'1'}]);
 assert.equal(invalid.ok,false);
 assert.ok(invalid.errors.some(error=>error.code==='invalid_move_reference'));
});

test('frame move planner refuses profile templates that are not operational',()=>{
 const plan=loadFunction('planFrameMoves');
 const state={hives:[{id:'h1',profile:{id:'ruta-template-v1',status:'template',brood:{boxKeys:['B1']},honey:{boxKeys:[]}}}],layouts:{h1:{mode:'summer',installedBoxes:['B1'],boxes:{B1:{frames:[{frameId:'f',location:'B1',history:[]}]}},honeyFrames:[],honeyBoxInstalled:[]}}};
 const result=plan(state,[{hiveId:'h1',frameId:'f',fromBox:'B1',toBox:'B1'}]);
 assert.equal(result.ok,false);
 assert.ok(result.errors.some(error=>error.code==='move_profile_not_operational'));
});

test('profile frame helpers use the selected hive capacities and custom honey keys',()=>{
 const profile={id:'custom-v1',status:'ready',schemaVersion:1,name:'Custom',family:'custom',frame:{heightMm:230},brood:{boxCount:2,framesPerBox:10,boxKeys:['B1','B2']},honey:{boxCount:1,framesPerBox:8,boxKeys:['M1'],installation:'independent'},winter:{enabled:false}};
 const profileForHive=()=>profile;
 const isHoney=loadFunction('isHoneyBoxKey',{profileHoneyKeys:()=>['M1']});
 const capacity=loadFunction('frameCapacity',{profileForHive,isHoneyBoxKey:isHoney});
 assert.equal(capacity('B1','h1'),10);
 assert.equal(capacity('M1','h1'),8);
 assert.equal(isHoney('M1','h1'),true);
 assert.equal(isHoney('H1','h1'),false);
});

test('layout initialization creates physical frame arrays from the selected profile',()=>{
 const profile={id:'custom-v1',status:'ready',schemaVersion:1,name:'Custom',family:'custom',frame:{heightMm:230},brood:{boxCount:2,framesPerBox:10,boxKeys:['B1','B2']},honey:{boxCount:1,framesPerBox:8,boxKeys:['M1'],installation:'independent'},winter:{enabled:false}};
 const state={layouts:{},hives:[{id:'h1'}]};
 const profileForHive=()=>profile;
 const frameCapacity=(key)=>key==='M1'?8:10;
 const framePrefix=(key)=>key;
 const layout=loadFunction('layoutFor',{S:state,profileForHive,frameCapacity,framePrefix});
 const result=layout('h1');
 assert.equal(result.boxes.B1.frames.length,10);
 assert.equal(result.boxes.B2.frames.length,10);
 assert.equal(result.honeyFrames.length,1);
 assert.equal(result.honeyFrames[0].length,8);
 assert.equal(result.honeyFrames[0][0].location,'M1');
});

test('profile assembly rejects removing a brood box that still owns a family',()=>{
 const validateProfile=loadFunction('validateHiveProfile');
 const clone=loadFunction('cloneHiveProfile');
 const get=loadFunction('getHiveProfileCapabilities',{validateHiveProfile:validateProfile,cloneHiveProfile:clone});
 const validate=loadFunction('validateHiveAssemblyProfile',{getHiveProfileCapabilities:get});
 const profile={id:'custom-v1',schemaVersion:1,status:'ready',name:'Custom',family:'custom',frame:{heightMm:230},brood:{boxCount:2,framesPerBox:10,boxKeys:['B1','B2']},honey:{boxCount:0,framesPerBox:0,boxKeys:[],installation:'independent'},winter:{enabled:false}};
 const layout={mode:'summer',installedBoxes:['B2'],winterOrder:[],honeyBoxInstalled:[],boxes:{B1:{family:'family-1',frames:[]},B2:{family:'',frames:[]}},honeyFrames:[]};
 const result=validate(profile,layout);
 assert.ok(result.errors.some(error=>error.code==='family_box_not_installed'));
});


test('mobile navigation remains five-tab and is positioned as a safe-area-aware bottom bar',()=>{
 const nav=html.match(/<nav aria-label="Основные разделы">([\s\S]*?)<\/nav>/);
 assert.ok(nav);
 assert.equal((nav[1].match(/data-tab=/g)||[]).length,5);
 assert.match(html,/main>nav\[aria-label="Основные разделы"\][\s\S]*?position:fixed!important/);
 assert.match(html,/env\(safe-area-inset-bottom,0px\)/);
});

test('responsive workspace defines both portrait and landscape orientation layouts',()=>{
 assert.match(html,/@media \(orientation:landscape\)/);
 assert.match(html,/@media \(orientation:portrait\)/);
 assert.match(html,/max-height:520px/);
});

test('apiary workspace exposes global, hive and journal search controls',()=>{
 assert.match(html,/id="globalSearch"/);
 assert.match(html,/id="hiveSearch"/);
 assert.match(html,/id="hiveModeFilter"/);
 assert.match(html,/id="journalSearch"/);
 assert.match(html,/id="journalTypeFilter"/);
 assert.match(html,/id="journalDateFilter"/);
 assert.match(html,/function renderGlobalSearch/);
 assert.match(html,/function renderJournalRecords/);
});

test('journal uses chronological entries and profile-aware frame search',()=>{
 assert.match(html,/class="journal-timeline"/);
 assert.match(html,/class="[^"]*\bjournal-entry\b/);
 assert.match(html,/profileBroodKeys\(hive\.id\)/);
 assert.match(html,/profileHoneyKeys\(hive\.id\)/);
});

test('PWA manifest does not lock the app to portrait or landscape',()=>{
 assert.equal(manifest.orientation,'any');
});

test('hive list miniatures use the selected construction profile',()=>{
 const source=extractFunction('card');
 assert.match(source,/profileBroodKeys\(h\.id\)/);
 assert.match(source,/profileHoneyKeys\(h\.id\)/);
 assert.match(source,/profile\?\.layout\?\.rows/);
});

test('home miniatures render the installed boxes and honey boxes from each hive profile',()=>{
 const source=extractFunction('renderHome');
 assert.match(source,/profileBroodKeys\(h\.id\)/);
 assert.match(source,/profileHoneyKeys\(h\.id\)/);
 assert.match(source,/layoutRows\.map/);
 assert.doesNotMatch(source,/\[1,2,3\]/);
 assert.doesNotMatch(source,/\[1,2\]\.filter/);
});

test('configured honey box arrays are initialized to their profile capacity',()=>{
 const profile={id:'test-profile',schemaVersion:1,status:'ready',name:'Test',family:'custom',frame:{heightMm:230},brood:{boxCount:1,framesPerBox:8,boxKeys:['B1']},honey:{boxCount:1,framesPerBox:7,boxKeys:['M1'],installation:'independent'},winter:{enabled:false}};
 const state={layouts:{},hives:[{id:'h1'}]};
 const layout=loadFunction('layoutFor',{S:state,profileForHive:()=>profile,frameCapacity:key=>key==='M1'?7:8,framePrefix:key=>key});
 const result=layout('h1');
 assert.equal(result.honeyFrames[0].length,7);
 assert.equal(result.honeyFrames[0][0].frameId,'M1-01');
});

test('journal supports family filtering and inline attachment previews',()=>{
 assert.match(html,/id="journalFamilyFilter"/);
 const source=extractFunction('renderJournalRecords');
 assert.match(source,/familySelect/);
 assert.match(source,/mediaHtml\(r\.media\)/);
 assert.match(source,/mediaNames/);
});

test('hive detail keeps the hives navigation destination active',()=>{
 const paint=extractFunction('paintTab');
 assert.match(paint,/tab==='hiveDetail'&&x\.dataset\.tab==='hives'/);
 assert.doesNotMatch(paint,/tab==='hiveDetail'&&x\.dataset\.tab==='home'/);
});

test('hive directory uses correct Russian declension for the hive count',()=>{
 const source=extractFunction('renderHiveDirectory');
 assert.match(source,/ruPlural\(S\.hives\.length,'улей','улья','ульев'\)/);
});

test('hive and frame cards support keyboard activation',()=>{
 assert.match(html,/class="hive-row-main" role="button" tabindex="0"/);
 assert.match(html,/class="home-hive" role="button" tabindex="0"/);
 assert.match(html,/target\??\.matches\('\.hive-row-main\[role="button"\],\.home-hive\[role="button"\],\.frame-chip\[role="button"\]'\)/);
});


test('custom Farrar column keeps frame height distinct from brood box height',()=>{
  const profileBlock=html.match(/'farrar-6x6-v1':\{([\s\S]*?)\n \},\n 'dadant-template-v1'/);
  assert.ok(profileBlock,'Farrar column profile must exist');
  assert.ok(profileBlock[1].includes('frame:{widthMm:null,heightMm:180,'));
  assert.ok(profileBlock[1].includes('brood:{boxCount:6,framesPerBox:6,boxHeightMm:195,'));
  assert.ok(profileBlock[1].includes("honey:{boxCount:2,framesPerBox:10,boxHeightMm:null,boxKeys:['H1','H2'],installation:'paired'}"));
  assert.equal((profileBlock[1].match(/frame:\{/g)||[]).length,1,'profile defines one shared frame geometry for brood and honey frames');

});


test('Farrar column uses one 180 mm frame geometry in brood and honey boxes in every assembly mode',()=>{
 const profile={id:'farrar-6x6-v1',schemaVersion:1,status:'ready',name:'Farrar sectional column',family:'farrar',
  frame:{widthMm:null,heightMm:180,topBarMm:null,bottomBarMm:null},
  brood:{boxCount:6,framesPerBox:6,boxHeightMm:195,boxKeys:['1','2','3','4','5','6']},
  honey:{boxCount:2,framesPerBox:10,boxHeightMm:null,boxKeys:['H1','H2'],installation:'paired'},
  winter:{enabled:true,requiredBroodBoxes:3,allowedBoxKeys:['1','3','4','6'],forbiddenBoxKeys:['2','5'],honeyAllowed:false}};
 const validate=loadFunction('validateHiveProfile');
 const clone=loadFunction('cloneHiveProfile');
 const capabilities=loadFunction('getHiveProfileCapabilities',{validateHiveProfile:validate,cloneHiveProfile:clone});
 assert.equal(validate(profile).ok,true);
 for(const mode of ['summer','winter']){
  const assembly={mode,installedBoxes:mode==='winter'?['1','3','4']:['1','2','3','4','5','6'],winterOrder:mode==='winter'?['1','3','4']:[],honeyBoxInstalled:mode==='winter'?[false,false]:[true,true]};
  const result=capabilities(profile);
  assert.equal(result.ok,true);
  assert.equal(result.frameHeightMm,180);
  assert.equal(result.broodCapacity,6);
  assert.equal(result.honeyCapacity,10);
  assert.equal(assembly.mode,mode);
 }
 assert.equal(profile.brood.boxHeightMm,195);
 assert.equal(profile.honey.boxHeightMm,null);
 assert.equal(profile.frame.heightMm,180);
});



test('schema migration preserves physical frame IDs and adds stable metadata exactly once',()=>{
 const state={
  meta:{schemaVersion:1},
  hives:[{id:'h1',number:1}],
  families:[{name:'Семья без внутреннего ID'}],
  records:[{hive:'h1',date:'2026-11-12',type:'Осмотр'}],
  tasks:[],extractions:[{items:[{}]}],snapshots:[],layouts:{},auditLog:[],aiMessages:[]
 };
 const frame={frameId:'PHYSICAL-FRAME-01',location:'1'};
 const layoutFor=hiveId=>{
  state.layouts[hiveId]=state.layouts[hiveId]||{boxes:{},honeyFrames:[[],[]]};
  return state.layouts[hiveId];
 };
 const frameArray=(layout,key)=>{
  if(key==='H1'||key==='H2'){
   const index=key==='H1'?0:1;
   return layout.honeyFrames[index];
  }
  layout.boxes[key]=layout.boxes[key]||{frames:[]};
  return layout.boxes[key].frames;
 };
 layoutFor('h1').boxes['1']={frames:[frame]};
 let sequence=0;
 const migrate=loadFunction('migrateState',{S:state,uid:()=> 'generated-'+(++sequence),layoutFor,frameArray});
 assert.equal(migrate(),true);
 assert.equal(state.meta.schemaVersion,2);
 assert.ok(state.meta.deviceId);
 assert.ok(state.hives[0].profileId==='farrar-6x6-v1');
 assert.ok(state.families[0].id);
 assert.ok(state.records[0].id);
 assert.ok(state.extractions[0].id);
 assert.ok(state.extractions[0].items[0].id);
 assert.ok(state.snapshots.length>0);
 assert.equal(frame.frameId,'PHYSICAL-FRAME-01');
 assert.ok(frame.id);
 assert.deepEqual(frame.history,[]);
 assert.ok(state.layouts.h1.corpusIds['1']);
 assert.ok(state.layouts.h1.corpusIds.H1);
 assert.equal(migrate(),false);
 assert.equal(state.hives[0].profileId,'farrar-6x6-v1');
});


function honeyReturnFixture(){
 const state={
  hives:[{id:'h1'},{id:'h2'}],
  layouts:{
   h1:{mode:'summer',honeyBoxInstalled:[false,false]},
   h2:{mode:'summer',honeyBoxInstalled:[false,false]}
  },
  extractions:[
   {id:'e1',date:'2026-08-01',items:[{hiveId:'h1',kilograms:12}]},
   {id:'e2',date:'2026-08-02',items:[{hiveId:'h2',kilograms:15}]}
  ],
  auditLog:[]
 };
 const elements={honeyReturnDate:{value:'2026-11-12'},returnHoneyDlg:{close(){}}};
 let saves=0;const alerts=[];
 const deps={
  S:state,
  returningHoney:[{eventId:'e1',hiveId:'h1'},{eventId:'e2',hiveId:'h2'}],
  $:id=>elements[id],
  alert:message=>alerts.push(message),
  render:()=>{},
  save:async()=>{saves++;return true},
  logAudit:null
 };
 deps.logAudit=(type,details)=>deps.S.auditLog.push({type,...details});
 return {get state(){return deps.S},deps,alerts,get saves(){return saves}};
}
test('honey pair return validates all hives before atomically returning both pairs',async()=>{
 const fixture=honeyReturnFixture();
 await loadFunction('confirmHoneyReturn',fixture.deps)();
 assert.deepEqual(fixture.state.layouts.h1.honeyBoxInstalled,[true,true]);
 assert.deepEqual(fixture.state.layouts.h2.honeyBoxInstalled,[true,true]);
 assert.equal(fixture.state.extractions[0].items[0].returnedAt,'2026-11-12');
 assert.equal(fixture.state.extractions[1].items[0].returnedAt,'2026-11-12');
 assert.equal(fixture.state.auditLog.length,2);
 assert.equal(fixture.saves,1);
 assert.deepEqual(fixture.alerts,[]);
});
test('honey pair return rejects an invalid later hive without partially changing an earlier hive',async()=>{
 const fixture=honeyReturnFixture();
 fixture.state.layouts.h2.mode='winter';
 const before=JSON.stringify(fixture.state);
 await loadFunction('confirmHoneyReturn',fixture.deps)();
 assert.equal(JSON.stringify(fixture.state),before);
 assert.equal(fixture.saves,0);
 assert.equal(fixture.state.auditLog.length,0);
 assert.match(fixture.alerts[0],/зимнюю сборку/i);
});

test('honey pair return restores the original state when persistence fails',async()=>{
 const fixture=honeyReturnFixture();
 const original=fixture.state;
 fixture.deps.save=async()=>{fixture.deps.S.meta={saveError:'Не удалось сохранить'};return false};
 await loadFunction('confirmHoneyReturn',fixture.deps)();
 assert.equal(fixture.state,original);
 assert.deepEqual(fixture.state.layouts.h1.honeyBoxInstalled,[false,false]);
 assert.equal(fixture.state.extractions[0].items[0].returnedAt,undefined);
 assert.equal(fixture.state.auditLog.length,0);
 assert.equal(fixture.state.meta.saveError,'Не удалось сохранить');
 assert.equal(fixture.saves,0);
});

test('honey pair return restores the exact original state when persistence throws',async()=>{
 const fixture=honeyReturnFixture();
 const original=JSON.stringify(fixture.state);
 fixture.deps.save=async()=>{throw new Error('storage exploded')};
 await loadFunction('confirmHoneyReturn',fixture.deps)();
 assert.equal(JSON.stringify(fixture.state),original);
 assert.deepEqual(fixture.alerts,['Возврат медовых корпусов отменён: storage exploded. Исходные данные восстановлены.']);
 assert.equal(fixture.saves,0);
});
test('honey pair return rolls back all changes when audit logging throws',async()=>{
 const fixture=honeyReturnFixture();
 const original=JSON.stringify(fixture.state);
 fixture.deps.logAudit=()=>{throw new Error('audit unavailable')};
 await loadFunction('confirmHoneyReturn',fixture.deps)();
 assert.equal(JSON.stringify(fixture.state),original);
 assert.deepEqual(fixture.alerts,['Возврат медовых корпусов отменён: audit unavailable. Исходные данные восстановлены.']);
 assert.equal(fixture.saves,0);
});
test('honey pair return rejects repeated and duplicate return requests',async()=>{
 const fixture=honeyReturnFixture();
 fixture.state.extractions[0].items[0].returnedAt='2026-11-10';
 fixture.deps.returningHoney=[{eventId:'e1',hiveId:'h1'}];
 await loadFunction('confirmHoneyReturn',fixture.deps)();
 assert.equal(fixture.saves,0);
 assert.match(fixture.alerts[0],/уже отмечены/i);
 const second=honeyReturnFixture();
 second.deps.returningHoney=[{eventId:'e1',hiveId:'h1'},{eventId:'e1',hiveId:'h1'}];
 await loadFunction('confirmHoneyReturn',second.deps)();
 assert.equal(second.saves,0);
 assert.match(second.alerts[0],/повторн/i);
});

test('record dialog has compact responsive layout rules for portrait and landscape phones',()=>{
  assert.match(html,/@media\s*\(orientation:landscape\)/);
 assert.match(html,/#recordDlg\s+form\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(html,/@media\s*\(orientation:landscape\)\s*and\s*\(max-height:520px\)/);
 assert.match(html,/@media\s*\(orientation:portrait\)\s*and\s*\(max-width:560px\)/);
 assert.match(html,/max-height:calc\(100dvh - 8px\)/);
});
